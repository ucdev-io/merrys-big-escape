import * as THREE from 'three';
import { Dog } from '../../entities/dog.js';
import { waterAt } from '../../world/water.js';

const GRAVITY = 12;
const launch = (h) => Math.sqrt(2 * GRAVITY * h);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const HOP_MAX = 1.6;  // the tallest thing a pal hops over (hedges, fences, benches, bins); walls and houses they go round
const TURN = 9;       // radians a second, at most

/*
 * 🐕 One pal's body out in the world: walking, trotting and galloping to where it's told, hopping over hedges and
 * fences on the way, paddling across water, and popping down a hole and up somewhere else (a tunnel: how pals
 * catch up when they're left behind). The thinking (where to go) is the crew's: see ./crew.js.
 */
export class CrewDog {
  /**
   * dog: a Dog already in the scene (a town dog who just became a pal) or null to make one of `breed`.
   * ctx: { scene, world, groundAt(x, z), fx: actions (dirt, sparkle, waterFx) }
   */
  constructor(pal, breed, ctx, { dog = null, at = null } = {}) {
    this.pal = pal;
    this.ctx = ctx;
    this.dog = dog ?? new Dog(breed);
    this.root = this.dog.root;
    if (this.root.parent !== ctx.scene) ctx.scene.add(this.root);
    this.root.visible = true;
    this.pos = this.root.position;
    if (at) this.pos.set(at.x, at.y ?? this.pos.y, at.z);
    this.heading = at?.heading ?? this.root.rotation.y;
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this.swim = 0;
    this.inWater = false;
    this.pop = null;      // { t, phase: 'down' | 'up', to } while tunnelling
    this.sitting = false;
    this.sniff = false;
    this.happy = 0.6;
    this.talkT = 2 + Math.random() * 4;
  }

  get size() { return this.dog.breed.size; }
  get r() { return 0.26 * this.size; }
  /** Its back, as something the player can stand on (a leg-up). */
  back() { const s = this.size; return { x: this.pos.x, z: this.pos.z, r: 0.34 * s, top: this.pos.y + (this.dog.bodyY + 0.08) * s }; }

  /** Gone from the world (a pal sent home who's out of sight, or the crew's being tidied away). */
  remove() { this.root.removeFromParent(); }

  /** Pop up at (x, z) at once (no tunnel), facing `heading`. */
  place(x, z, heading = this.heading) {
    this.pos.set(x, this.ctx.groundAt(x, z), z);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.speed = 0; this.vy = 0; this.grounded = true;
    this.pop = null;
    this.root.scale.setScalar(this.size);
  }

  /** Up out of a hole at `to` ({ x, z, heading }): arriving from nowhere (just joined, back from somewhere). */
  popUp(to) {
    this.place(to.x, to.z, to.heading ?? this.heading);
    this.pop = { t: 0, phase: 'up' };
    this.root.scale.setScalar(this.size * 0.01);
    this.puff(this.pos, 14);
  }

  /** Down a hole here and up one at `to` ({ x, z, heading }). */
  tunnel(to) {
    if (this.pop) { this.pop.to = to; return; }
    this.pop = { t: 0, phase: 'down', to };
    this.puff(this.pos);
  }

  puff(at, n = 10) {
    const dirt = this.ctx.fx?.dirt;
    if (!dirt) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
      dirt.spawn({ pos: new THREE.Vector3(at.x, (at.y ?? 0) + 0.08, at.z), vel: new THREE.Vector3(Math.cos(a) * s, 1.4 + Math.random() * 1.6, Math.sin(a) * s), life: 0.8, size: 0.035, gravity: 7, floor: 0.04, color: [0x6b4a32, 0x7d5a3c, 0x5a3e2a][i % 3] });
    }
  }

  /** The highest thing in the way at (x, z) that's taller than a step from `feet`, or 0. */
  obstacleTop(x, z, feet) {
    const C = this.ctx.world.colliders, r = this.r, lim = feet + 0.3;
    let top = 0;
    for (const c of C.circles) if (c.top > lim && c.top > top && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) top = c.top;
    for (const b of C.boxes) if (b.top > lim && b.top > top && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) top = b.top;
    return top;
  }

  /**
   * Head for (tx, tz) at up to `want` metres a second (0: stand still), facing `face` when it gets there (or
   * keeping its heading). `left`: how far it really has to go (along a path: (tx, tz) is just the next step on
   * it), to slow down for. Returns the distance to (tx, tz) still to go.
   */
  update(dt, { tx = this.pos.x, tz = this.pos.z, want = 0, face = null, left = null, sniff = false, dig = false, happy = this.happy } = {}) {
    const p = this.pos, dog = this.dog, size = this.size;
    // Tunnelling: shrink down into the ground, then grow up out of it somewhere else.
    if (this.pop) {
      const P = this.pop;
      P.t += dt;
      if (P.phase === 'down') {
        this.root.scale.setScalar(size * Math.max(0.01, 1 - P.t / 0.3));
        if (P.t >= 0.3) {
          this.popUp(P.to);
        }
      } else {
        const k = Math.min(1, P.t / 0.35);
        this.root.scale.setScalar(size * (k < 1 ? 0.01 + k * 1.15 - (k > 0.7 ? (k - 0.7) * 0.5 : 0) : 1));
        if (k >= 1) { this.root.scale.setScalar(size); this.pop = null; }
      }
      dog.update(dt, { speed: 0, turnRate: 0, sniff: false, dig: true, happy: 1 });
      return 0;
    }

    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const wtr = waterAt(this.ctx.world.water, p.x, p.z);
    const deep = !!(wtr && !wtr.wade && wtr.depth > 0.45);
    if (deep) want = Math.min(want, 2.2); // (doggy paddle)
    // Turn towards where it's going (or where it was told to face, once there).
    const before = this.heading;
    if (d > 0.08 && want > 0) {
      const diff = wrap(Math.atan2(dx, dz) - this.heading);
      this.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
      if (Math.abs(diff) > 1.4) want *= 0.35; // (well round: turn first)
    } else if (face !== null) this.heading += wrap(face - this.heading) * (1 - Math.exp(-dt * 6));
    // Speed up, slow down (and slow down to arrive).
    const target = d > 0.08 ? Math.min(want, (left ?? d) * 3.2 + 0.4) : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (target > this.speed ? 5 : 9)));
    if (this.speed < 0.02) this.speed = 0;
    const step = Math.min(this.speed * dt, d);
    if (step > 0) {
      const sx = Math.sin(this.heading), sz = Math.cos(this.heading);
      // Something low in the way? Hop it (a hedge, a fence, a bench), as the player does.
      if (this.grounded && !deep && (left ?? d) > 0.55 + this.r) { // (not to get somewhere just this side of it)
        const top = this.obstacleTop(p.x + sx * (0.35 + this.r), p.z + sz * (0.35 + this.r), p.y);
        if (top && top - p.y <= HOP_MAX) { this.vy = launch(top - p.y + 0.22); this.grounded = false; dog.jump?.(); }
      }
      p.x += sx * step;
      p.z += sz * step;
      this.ctx.world.colliders.resolve(p, this.r, this.grounded ? 0.3 : 0.06);
    }
    // Up and down: gravity, the ground (or whatever low thing it's on), and floating in water.
    let base = this.ctx.groundAt(p.x, p.z);
    const w2 = waterAt(this.ctx.world.water, p.x, p.z);
    if (w2 && !w2.wade) base = (w2.surface - (dog.bodyY + 0.03) * size) * w2.depth + base * (1 - w2.depth);
    const ground = this.ctx.world.colliders.surfaceAt(p.x, p.z, p.y, this.grounded ? 0.3 : 0.05, null, undefined, base);
    this.vy -= GRAVITY * dt;
    p.y += this.vy * dt;
    if (p.y <= ground && this.vy <= 0) {
      if (!this.grounded && this.vy < -2) dog.land?.(Math.min(1, -this.vy / 6));
      p.y = ground; this.vy = 0; this.grounded = true;
    } else if (this.grounded && p.y - ground < 0.3 && this.vy <= 0) { p.y = ground; this.vy = 0; }
    else this.grounded = false;
    this.swim += ((w2 && !w2.wade && w2.depth > 0.4 ? 1 : 0) - this.swim) * (1 - Math.exp(-dt * 6));
    // Splash in, ripples while paddling, a shake coming out.
    const inW = !!(w2 && !w2.wade && w2.depth > 0.15), fx = this.ctx.fx?.waterFx;
    if (fx) {
      if (inW && !this.inWater) fx.splash(p, w2.surface, Math.min(1.2, (this.speed + 1) / 3), false);
      if (inW) { this.ringT = (this.ringT ?? 0) - dt; if (this.ringT <= 0) { this.ringT = this.speed > 0.3 ? 0.4 : 0.9; fx.ring(p, w2.surface, 0.5); } }
      if (!inW && this.inWater) this.shakeIn = 0.5;
      if (this.shakeIn > 0 && !inW) { this.shakeIn -= dt; if (this.shakeIn <= 0) fx.shake(dog, p, false); }
    }
    this.inWater = inW;

    // Sitting down when it's stopped for a while (and up again to go).
    if (this.speed > 0.4 || !this.grounded || this.swim > 0.3) {
      if (this.sitting) { this.sitting = false; dog.stopEmote(); }
    } else if (this.sitting) {
      if (dog.emoteKind === 'sit' && (dog.emoteT ?? 0) > 0.3) dog.emoteT = Math.max(dog.emoteT, 1.5); else dog.emote('sit');
    }
    this.root.rotation.y = this.heading;
    const turn = wrap(this.heading - before) / Math.max(dt, 1e-3);
    dog.update(dt, { speed: this.speed, turnRate: turn, sniff: sniff && this.speed < 1.5, dig, happy, air: this.grounded ? 0 : 1, vy: this.vy, swim: this.swim > 0.5 ? 1 : 0 });
    return Math.max(0, d - step);
  }
}
