import * as THREE from 'three';
import { SeasonPart } from './part.js';
import { paint } from '../../render/watercolorMaterial.js';
import { Particles } from '../../fx/particles.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { LEAVES, CONKERS, PUMPKIN } from '../lines/seasons.js';
import { TOYS } from '../seasonRules.js';
import { V, flat, rand, pick, seasonRng, clearSpot, townTrees, groundY } from './common.js';
import { instanced, leafPileGeometry, conkerGeometry, conkerCaseGeometry, pumpkinGeometry, pumpkinFace } from './models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const LEAF_COLS = [0xd9893c, 0xc0632d, 0xe0b04a, 0xb5482a, 0xe3a23f];

/**
 * 🍂 Autumn: the trees turn (painted in), and
 *   leaf piles to leap into: CRUNCH! They burst, then slowly heap up again (in a pack, everyone sees it);
 *   conkers under the horse chestnuts: snuffle them up (a new one drops now and then);
 *   carved pumpkins glowing on doorsteps (woof at one: BOO!).
 */
export class Autumn extends SeasonPart {
  constructor(S) {
    super(S);
    this.flutter = new Particles(S.scene, { max: 200, geometry: new THREE.CircleGeometry(1, 6) });
    this.flutter.mesh.material = paint(0xffffff, { side: THREE.DoubleSide }); // (leaves, seen from either side)
    this.objects.push(this.flutter.mesh);
    this.piles = new LeafPiles(this);
    this.conkers = new Conkers(this);
    this.pumpkins = this.town ? new Pumpkins(this) : null;
  }

  line(list) { return this.S.line(list, list); }
  anchor() { return this.S.actions.anchor(); }

  /** Leaves flying up and fluttering down. */
  leafBurst(at, n = 30, power = 1) {
    this.flutter.burst(n, () => ({
      pos: at.clone().add(V(rand(-0.35, 0.35), rand(0.05, 0.3), rand(-0.35, 0.35))),
      vel: V(rand(-1.6, 1.6) * power, rand(1.8, 3.6) * power, rand(-1.6, 1.6) * power),
      life: rand(1.4, 2.4), size: rand(0.045, 0.07), gravity: 2.2, drag: 1.6, floor: at.y + 0.02, color: pick(LEAF_COLS), squash: 0.55,
    }));
  }

  update(dt, f) {
    this.piles.update(dt, this.player, f);
    this.conkers.update(dt, this.player);
    this.pumpkins?.update(dt);
    this.flutter.update(dt);
  }

  onBark(pos) { this.pumpkins?.onBark(pos); }
  get prompt() { return this.piles.prompt ?? this.conkers.prompt ?? null; }
  toy(m, mine) { if (m.id?.startsWith('lp')) this.piles.toy(m, mine); }
  adopt(toys) { this.piles.adopt(toys); }
}

// ---------------------------------------------------------------------------------------------
/** Heaps of leaves under the trees. Leap in (or zoom through, or roll about in one): CRUNCH! */
class LeafPiles {
  constructor(A) {
    this.A = A;
    const { world } = A, spots = [];
    if (A.town) {
      const rng = seasonRng(A.S.seed, 'leafpiles'), trees = rng.shuffle(townTrees(A.world).slice());
      for (const t of trees) {
        if (spots.length >= 16) break;
        for (let k = 0; k < 6; k++) {
          const a = rng.float(0, Math.PI * 2), r = rng.float(1.1, 1.8) * Math.max(1, t.s), x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
          if (clearSpot(world, x, z, 0.75) && !spots.some((p) => flat(p, { x, z }) < 5)) { spots.push(V(x, 0, z)); break; }
        }
      }
    } else spots.push(V(-5.2, 0, 1.4), V(5.6, 0, 5.9)); // (the back garden: under its tree, and by the shed)
    const geo = leafPileGeometry(3);
    this.list = spots.map((p, i) => ({ id: `lp${i}`, x: p.x, z: p.z, y: groundY(world, p.x, p.z) - 0.04, ry: i * 2.4, full: 1, cd: 0 }));
    this.mesh = A.add(instanced(geo, this.list.length, { shadow: true }));
    for (const p of this.list) this.draw(p);
    this.near = null;
  }

  draw(p) {
    const i = this.list.indexOf(p), f = p.full;
    const k = f < 1 ? f * f * (3 - 2 * f) : 1; // (heaping back up)
    _q.setFromEuler(_e.set(0, p.ry, 0));
    this.mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1.25 - 0.25 * k, 0.12 + 0.88 * k, 1.25 - 0.25 * k)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, P) {
    let near = null, nd = 2.2;
    for (const p of this.list) {
      p.cd -= dt;
      if (p.full < 1) { p.full = Math.min(1, p.full + dt / (TOYS.pileMs / 1000)); this.draw(p); }
      const d = flat(P.pos, p);
      if (d < nd) { nd = d; near = p; }
    }
    this.near = near;
    // In you go! (a leap, zooming through, or a roll about in it)
    if (near && nd < 0.8 && near.full > 0.55 && near.cd <= 0 && P.pos.y < 0.9) {
      const leapt = P.landed > 0.2 && P.grounded, zoom = P.speed > 3.6, roll = P.dog.emoteKind === 'roll' && (P.dog.emoteT ?? 0) > 0.3;
      if (leapt || zoom || roll) { near.cd = 1.5; this.A.S.send({ a: 'toy', id: near.id, op: 'burst' }); }
    }
  }

  /** From the SeasonRoom: someone's leapt into a pile. */
  toy(m, mine) {
    const p = this.list.find((q) => q.id === m.id);
    if (!p || m.op !== 'burst') return;
    p.full = 0;
    p.cd = 1.5;
    this.draw(p);
    const close = flat(this.A.player.pos, p) < 20;
    this.A.leafBurst(V(p.x, p.y + 0.1, p.z), close ? 34 : 12);
    if (close) { sfx.rustle?.(); setTimeout(() => sfx.rustle?.(), 120); }
    if (!mine) return;
    const before = progress.stats.leaves ?? 0;
    progress.stat('leaves');
    progress.award(2, 'Crunch!');
    buzz([15, 20, 15]);
    this.A.hud.float(this.A.line(LEAVES.burst), this.A.anchor(), 'xp');
    for (const c of COSMETICS) if (c.friend === 'leaves' && before < c.jobs && before + 1 >= c.jobs) this.A.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'For all that leaping. Wear it from ☰ → My dog → Dress up.');
  }

  /** A pack's piles: some still flat from someone's leap (how long ago, in ms, as a negative number). */
  adopt(toys) {
    for (const [id, v] of toys) {
      const p = this.list.find((q) => q.id === id);
      if (p && v < 0) { p.full = Math.min(1, -v / TOYS.pileMs); this.draw(p); }
    }
  }

  get prompt() {
    const p = this.near;
    return p && p.full > 0.55 && flat(this.A.player.pos, p) < 2.2 ? '🍂 A leaf pile! Leap in! 🦘' : null;
  }
}

// ---------------------------------------------------------------------------------------------
/** Conkers under the horse chestnut trees: walk over one to pick it up. Now and then another drops. */
class Conkers {
  constructor(A) {
    this.A = A;
    const { world } = A, rng = seasonRng(A.S.seed, 'conkers');
    let trees = A.town ? (world.parkTrees?.length ? world.parkTrees : townTrees(world)) : (world.landmarks?.trees ?? []).filter((t) => Math.abs(t.x) < 10 && Math.abs(t.z) < 9);
    trees = rng.shuffle(trees.slice()).slice(0, A.town ? 3 : 1);
    this.trees = trees;
    this.list = [];
    for (const t of trees) for (let i = 0; i < (A.town ? 7 : 4); i++) this.list.push({ t, x: 0, z: 0, y: 0, on: false, timer: rand(0, 3), ry: rand(0, 6), hop: 0 });
    this.mesh = A.add(instanced(conkerGeometry(), this.list.length, { shadow: false }));
    this.cases = A.add(instanced(conkerCaseGeometry(), trees.length * 3, { shadow: false }));
    trees.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const s = this.spot(t);
        _q.setFromEuler(_e.set(0, rand(0, 6), 0));
        if (s) this.cases.setMatrixAt(i * 3 + k, _m.compose(_p.set(s.x, groundY(world, s.x, s.z), s.z), _q, _s.set(1.4, 1.4, 1.4)));
      }
    });
    this.cases.instanceMatrix.needsUpdate = true;
    for (const c of this.list) this.drop(c, true);
    this.near = false;
  }

  spot(t) {
    for (let k = 0; k < 8; k++) {
      const a = rand(0, Math.PI * 2), r = rand(0.7, 2.3) * Math.max(1, t.s ?? 1), x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (clearSpot(this.A.world, x, z, 0.3)) return { x, z };
    }
    return null;
  }

  /** A conker falls from the tree (plonk!). */
  drop(c, quiet = false) {
    const s = this.spot(c.t);
    if (!s) { c.on = false; c.timer = 20; return; }
    Object.assign(c, s, { y: groundY(this.A.world, s.x, s.z) - 0.005, on: true, hop: quiet ? 0 : 1 });
    this.draw(c);
  }

  draw(c) {
    const i = this.list.indexOf(c);
    if (!c.on) { this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; return; }
    _q.setFromEuler(_e.set(0, c.ry, 0));
    this.mesh.setMatrixAt(i, _m.compose(_p.set(c.x, c.y + c.hop * c.hop * 2.2, c.z), _q, _s.set(1.25, 1.25, 1.25)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, P) {
    const nose = this.A.S.actions?.nose?.() ?? P.pos;
    this.near = false;
    for (const c of this.list) {
      if (!c.on) { c.timer -= dt; if (c.timer <= 0) this.drop(c); continue; }
      if (c.hop > 0) { c.hop = Math.max(0, c.hop - dt * 2.5); this.draw(c); if (c.hop === 0 && flat(P.pos, c) < 12) sfx.boink?.(); }
      const d = Math.min(flat(nose, c), flat(P.pos, c));
      if (d < 3) this.near = true;
      if (d < 0.42 && P.pos.y < 0.6 && !P.sledging) this.pick(c);
    }
  }

  pick(c) {
    c.on = false;
    c.timer = rand(60, 110);
    this.draw(c);
    const n = (progress.stats.conkers ?? 0) + 1;
    progress.stat('conkers');
    progress.award(n % 10 === 0 ? 6 : 1, n % 10 === 0 ? 'Conker champion!' : 'Conker!');
    sfx.pop?.();
    this.A.S.actions?.sparkle(V(c.x, 0.2, c.z), 8);
    this.A.hud.float(`🌰 ${this.A.line(n % 10 === 0 ? CONKERS.ten : CONKERS.got)}`, this.A.anchor(), 'xp');
    for (const k of COSMETICS) if (k.friend === 'conkers' && n === k.jobs) this.A.hud.showToastRaw(k.emoji, `New: ${k.name}!`, 'What a collection. Wear it from ☰ → My dog → Dress up.');
  }

  get prompt() { return this.near ? '🌰 Conkers! Snuffle them up' : null; }
}

// ---------------------------------------------------------------------------------------------
/** Carved pumpkins on doorsteps, glowing. Woof at one and it wobbles: BOO! */
class Pumpkins {
  constructor(A) {
    this.A = A;
    const { world } = A, rng = seasonRng(A.S.seed, 'pumpkins'), list = [];
    for (const g of world.gardens ?? []) {
      if (!g.front || !g.door || !rng.chance(g.home ? 1 : 0.45)) continue;
      const side = rng.chance(0.5) ? 1 : -1, sx = g.front.z * side, sz = -g.front.x * side;
      const x = g.door.x + g.front.x * 0.55 + sx * 0.95, z = g.door.z + g.front.z * 0.55 + sz * 0.95;
      list.push({ x, z, ry: Math.atan2(g.front.x, g.front.z) + rng.float(-0.4, 0.4), s: rng.float(0.85, 1.15), wob: 0, cd: 0 });
    }
    this.list = list;
    this.body = A.add(instanced(pumpkinGeometry(), list.length));
    this.face = A.add(instanced(pumpkinFace(), list.length, { mat: new THREE.MeshBasicMaterial({ color: 0xffd36a, side: THREE.DoubleSide }), shadow: false }));
    for (const p of list) this.draw(p);
  }

  draw(p) {
    const i = this.list.indexOf(p), w = p.wob > 0 ? Math.sin(p.wob * 22) * 0.18 * p.wob : 0;
    _q.setFromEuler(_e.set(w * 0.5, p.ry, w));
    _m.compose(_p.set(p.x, 0.05, p.z), _q, _s.set(p.s, p.s * (1 + w * 0.3), p.s));
    this.body.setMatrixAt(i, _m);
    this.face.setMatrixAt(i, _m);
    this.body.instanceMatrix.needsUpdate = this.face.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (const p of this.list) {
      p.cd -= dt;
      if (p.wob > 0) { p.wob = Math.max(0, p.wob - dt * 0.9); this.draw(p); }
    }
  }

  onBark(pos) {
    for (const p of this.list) {
      if (flat(pos, p) > 3.2 || p.wob > 0) continue;
      p.wob = 1;
      if (p.cd <= 0) { p.cd = 25; progress.award(1, 'Boo!'); }
      this.A.hud.float(`🎃 ${this.A.line(PUMPKIN.boo)}`, V(p.x, 0.8, p.z));
    }
  }
}
