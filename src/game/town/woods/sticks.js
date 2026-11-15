import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { buzz } from '../../../core/haptics.js';
import { BIG_STICK } from '../../../entities/woodsItems.js';
import { LineBag } from '../../dialogue.js';
import { STICK } from '../../lines/woods.js';
import { wsfx } from './sounds.js';

/*
 * 🪵 BIG sticks: lying about in the wood (and a few out in the meadow). A dog holds one crossways, so it's
 * wider than the gate into the wood — and the gaps between trees, and garden gates… Its ends bump into
 * things just like the dog does, so the only way through a gap is to line up and go straight on. Bonk!
 * Each player has their own sticks (like jobs); the den they build with them is shared (./den.js).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const COUNT = 7;                                     // sticks lying about at once
const SAMPLES = [-1, -0.7, -0.4, 0.4, 0.7, 1];       // points along the stick that bump into things (the dog does the middle)
const HALF = BIG_STICK / 2 - 0.03, R = 0.035;         // half the stick, and how thick it is

/** How far to move a point at (x, z) to get it out of any of these colliders (the biggest push). */
function pushOut(near, x, z, out) {
  let bx = 0, bz = 0, best = 0;
  for (const c of near.circles) {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + R;
    if (d >= m) continue;
    const k = m - d;
    if (k > best) { best = k; if (d > 1e-6) { bx = (dx / d) * k; bz = (dz / d) * k; } else { bx = k; bz = 0; } }
  }
  for (const b of near.boxes) {
    if (x <= b.x0 - R || x >= b.x1 + R || z <= b.z0 - R || z >= b.z1 + R) continue;
    const pens = [x - (b.x0 - R), b.x1 + R - x, z - (b.z0 - R), b.z1 + R - z], i = pens.indexOf(Math.min(...pens)), k = pens[i];
    if (k > best) { best = k; bx = i === 0 ? -k : i === 1 ? k : 0; bz = i === 2 ? -k : i === 3 ? k : 0; }
  }
  out.x = bx; out.z = bz;
  return best;
}

export class BigSticks {
  /** area: the woods (world data from woodsBuild). */
  constructor({ hud, player, actions, world, area, input }) {
    Object.assign(this, { hud, player, actions, world, area, input });
    this.carry = actions.carry;
    this.rng = new RNG(`sticks:${world.layout?.seed}:${Date.now()}`); // (each time you play, they're somewhere new)
    this.items = [];
    this.wait = 0;
    this.bags = {};
    this.near = { circles: [], boxes: [] };
    this.last = null;
    this.stuck = 0; this.bonkCD = 0; this.sinceBonk = Infinity; this.tipT = 0; this.tipped = false; this.wig = 0;
    for (let i = 0; i < COUNT; i++) this.spawn(true);
    this.side = this.sideOf(player.pos);
  }

  line(key) { return (this.bags[key] ??= new LineBag(STICK[key])).next(); }

  /** Lay a new stick somewhere (not right where you are, not on top of another). */
  spawn(any = false) {
    const P = this.player.pos, spots = this.area.stickSpots;
    for (let t = 0; t < 30; t++) {
      const [x, z] = spots[this.rng.int(0, spots.length - 1)];
      if (!any && Math.hypot(x - P.x, z - P.z) < 14) continue;
      if (this.items.some((it) => Math.hypot(it.pos.x - x, it.pos.z - z) < 4)) continue;
      const it = this.carry.add('bigstick', x, z);
      it.obj.rotation.y = this.rng.float(0, Math.PI * 2);
      this.items.push(it);
      return it;
    }
    return null;
  }

  /** Which side of the wood's fence a point is on (for "made it through!"). */
  sideOf(p) { const a = this.area.plan; return a.dir[0] * p.x + a.dir[1] * p.z > a.front ? 1 : -1; }

  get holding() { return this.carry.held?.kind === 'bigstick' ? this.carry.held : null; }

  update(dt, canAct) {
    const P = this.player;
    // Delivered sticks (gone from the world and your mouth) are replaced after a while.
    this.items = this.items.filter((it) => this.carry.held === it || this.carry.items.includes(it));
    if (this.items.length < COUNT) { this.wait -= dt; if (this.wait <= 0) { this.spawn(); this.wait = 12; } } else this.wait = 20;
    const held = this.holding;
    if (held && held !== this.lastHeld) this.hud.float(`🪵 ${this.line('grab')}`, this.actions.anchor(), 'xp');
    this.lastHeld = held;
    this.bonkCD -= dt; this.sinceBonk += dt; this.tipT -= dt;
    if (!held) { this.last = null; this.stuck = 0; this.side = this.sideOf(P.pos); return; }
    const pushed = canAct ? this.constrain(P) : 0;
    // Pressing on into a gap that's too narrow: bonk (now and then, not every frame).
    const trying = Math.hypot(this.input.move().x, this.input.move().y) > 0.3;
    this.stuck = pushed > 0.002 && trying ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 0.12 && this.bonkCD <= 0) {
      this.bonkCD = 1.7;
      this.sinceBonk = 0;
      this.wig = 1;
      wsfx.thunk();
      buzz(15);
      this.hud.float(`🪵 ${this.line('bonk')}`, this.actions.anchor());
      if (!this.tipped) { this.tipped = true; this.tipT = 7; this.hud.showToastRaw('🪵', 'Too wide!', STICK.tip); } // (once: how to get through)
    }
    // A wobble of the stick after a bonk.
    if (this.wig > 0) {
      this.wig = Math.max(0, this.wig - dt * 1.6);
      held.obj.rotation.y = Math.sin(this.wig * 40) * 0.12 * this.wig;
    }
    // Through the gate with it, after a bonk or two: well done!
    const side = this.sideOf(P.pos);
    if (side !== this.side && this.sinceBonk < 15) { this.hud.float(`🪵 ${this.line('through')}`, this.actions.anchor(), 'xp'); this.sinceBonk = Infinity; }
    this.side = side;
  }

  /**
   * Keep the stick's ends out of walls, posts, fences and trees: if an end would go into something, the
   * dog stops (or slides along, which helps it line up with a gap). Done in little steps along the way the
   * dog moved this frame, so a quick dog can't push a stick through a thin fence. Returns how far it pushed.
   */
  constrain(P) {
    const size = P.dog.breed.size, y = P.pos.y + 0.3 * size, fwd = 0.36 * size;
    const hx = Math.sin(P.heading), hz = Math.cos(P.heading), sx = hz, sz = -hx;
    const col = this.world.colliders, near = this.near, reach = HALF + fwd + 1.2;
    near.circles.length = 0; near.boxes.length = 0;
    for (const c of col.circles) if (c.top > y && Math.abs(c.x - P.pos.x) < reach + c.r && Math.abs(c.z - P.pos.z) < reach + c.r) near.circles.push(c);
    for (const b of col.boxes) if (b.top > y && b.x1 > P.pos.x - reach && b.x0 < P.pos.x + reach && b.z1 > P.pos.z - reach && b.z0 < P.pos.z + reach) near.boxes.push(b);
    const from = this.last, to = P.pos;
    this.last = to.clone();
    if (!from || (!near.circles.length && !near.boxes.length)) return 0;
    const dx = to.x - from.x, dz = to.z - from.z, dist = Math.hypot(dx, dz);
    if (dist > 2) return 0; // (popped somewhere: a teleport)
    const steps = Math.max(1, Math.ceil(dist / 0.06)), o = { x: 0, z: 0 };
    let px = from.x, pz = from.z, pushed = 0;
    for (let s = 0; s < steps; s++) {
      px += dx / steps; pz += dz / steps;
      for (let iter = 0; iter < 3; iter++) {
        let mx = 0, mz = 0, mk = 0;
        for (const k of SAMPLES) {
          const d = pushOut(near, px + hx * fwd + sx * k * HALF, pz + hz * fwd + sz * k * HALF, o);
          if (d > mk) { mk = d; mx = o.x; mz = o.z; }
        }
        if (!mk) break;
        px += mx; pz += mz; pushed += mk;
      }
    }
    if (!pushed) return 0;
    const cx = px - to.x, cz = pz - to.z;
    P.pos.x = px; P.pos.z = pz;
    col.resolve(P.pos, P.radius, P.grounded ? 0.3 : 0.06);
    const b = this.world.bounds;
    if (b) { P.pos.x = Math.min(b.x1, Math.max(b.x0, P.pos.x)); P.pos.z = Math.min(b.z1, Math.max(b.z0, P.pos.z)); }
    // Don't keep running into it.
    const l = Math.hypot(cx, cz);
    if (l > 1e-5) { const nx = cx / l, nz = cz / l, into = P.vel.x * nx + P.vel.y * nz; if (into < 0) { P.vel.x -= nx * into; P.vel.y -= nz * into; } }
    this.last.copy(P.pos);
    return pushed;
  }

  /** For the prompt line, just after the first bonk. */
  get hint() { return this.tipT > 0 && this.holding ? STICK.tip : null; }
}

export { V };
