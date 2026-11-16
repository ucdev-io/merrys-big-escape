import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { sheepGeometry, SHEEP, instancedPart, rootMatrix, partMatrix } from '../../../entities/farmAnimals.js';
import { FLOCK, flockSize } from '../../farmRules.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { fmsfx } from './sounds.js';

/*
 * 🐑 The flock: sheep grazing in their field who shy away from dogs, so a dog (or a pack of them) can
 * round them up into the pen, sheepdog style. In a pack one dog's game runs the sheep for everyone (the
 * "shepherd", see farmRules.js) and sends where they all are; everyone else's game just follows along.
 * Every dog in the pack pushes them about, and a woof sends them scurrying.
 * The whole flock is three instanced meshes (bodies, heads, legs) however many sheep there are.
 *
 * What a sheep is doing (sent to the others as a number): 0 grazing · 1 walking · 2 running away · 3 a lamb
 * springing about · 4 in the pen.
 */

const FLEE_R = 6.2;       // a dog closer than this moves a sheep
const WALK = 0.55, FLEE = 2.25, PANIC = 3.0; // m/s (a dog walks at 2.6)
const SEP = 1.0;          // sheep keep about this far apart
const HOLD = 32;          // seconds the sheep stay penned before the farmer lets them out
const SEND = 0.12, SEND_CALM = 0.8;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _root = new THREE.Matrix4(), _m = new THREE.Matrix4();
const BLACK = new THREE.Color(0.33, 0.3, 0.3), WHITE = new THREE.Color(1, 1, 1);
export const LIQUORICE = FLOCK - 1; // the black sheep (she's last of the grown-ups)

export class Flock {
  /**
   * @param o.area   the farm's world data (world/areas/farmBuild.js)
   * @param o.send   (msg) → to the farm room (the pack's, or our own)
   * @param o.near   circles and boxes near the field (for bumping into)
   */
  constructor({ scene, world, area, near, send, seed }) {
    Object.assign(this, { scene, world, area, near, send });
    const G = sheepGeometry();
    this.max = FLOCK + 4;
    this.body = instancedPart(G.body, this.max);
    this.head = instancedPart(G.head, this.max, { shadow: false });
    this.legs = instancedPart(G.leg, this.max * 4, { shadow: false });
    scene.add(this.body, this.head, this.legs);
    this.field = area.sheepField.rect;
    this.pen = area.pen;
    this.penRect = area.pen.rect;
    this.rng = new RNG(`flock:${seed}`); // (everyone's first look at the flock is the same)
    this.sheep = [];
    this.host = true;
    this.gateShut = false; this.gateK = 0; this.holdT = 0;
    this.sendT = 0; this.penSent = 0;
    this.near = near;
    this.nearDog = new Map(); // dog id → when it was last near the flock (for who helped)
    this.time = 0;
    this.baaT = 3;
    this.onBaa = null;   // (pos, kind) → a "Baa!" over a sheep
    this.onPenned = null;
    this.size(flockSize('autumn'));
    this.buildGate();
  }

  // ---------- the flock ----------

  /** Grow or shrink the flock to n sheep (lambs come and go with the spring). New ones appear by their mums. */
  size(n) {
    n = Math.max(0, Math.min(this.max, n));
    const F = this.field;
    while (this.sheep.length < n) {
      const i = this.sheep.length, lamb = i >= FLOCK, mum = lamb ? this.sheep[(i - FLOCK) * 2 % FLOCK] : null;
      let x, z;
      if (mum) { x = mum.x + this.rng.float(-0.8, 0.8); z = mum.z + this.rng.float(-0.8, 0.8); }
      else {
        // (out at their grazing spot, in a bunch)
        const far = this.farSide();
        x = far.x + this.rng.float(-2.5, 2.5); z = far.z + this.rng.float(-2.5, 2.5);
      }
      x = Math.min(F.x1 - 1, Math.max(F.x0 + 1, x)); z = Math.min(F.z1 - 1, Math.max(F.z0 + 1, z));
      for (let k = 0; k < 12 && (this.solid(x, z, 0.5) || this.inPen(x, z, -1)); k++) { x = Math.min(F.x1 - 1, Math.max(F.x0 + 1, x + this.rng.float(-3, 3))); z = Math.min(F.z1 - 1, Math.max(F.z0 + 1, z + this.rng.float(-3, 3))); }
      this.sheep.push({ i, lamb, mum: mum?.i ?? -1, x, z, vx: 0, vz: 0, h: this.rng.float(0, 6.28), speed: 0, state: 0, t: this.rng.float(0, 4), to: null, walkTo: null, panic: 0, penned: false, out: true, head: 1, phase: this.rng.float(0, 6), hop: 0, hopT: 3 + this.rng.float(0, 5), calm: 0 });
    }
    this.sheep.length = n;
    this.body.count = this.head.count = n;
    this.legs.count = n * 4;
    for (const s of this.sheep) this.body.setColorAt(s.i, s.i === LIQUORICE ? BLACK : WHITE);
    this.body.instanceColor.needsUpdate = true;
  }

  /** The flock's favourite grazing spot: out in the field, a good way from the pen (but not right over the far side). */
  farSide() {
    const F = this.field, p = this.pen.out, cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2;
    const dx = cx - p.x, dz = cz - p.z, l = Math.hypot(dx, dz) || 1, r = Math.min(l, 17);
    return { x: Math.min(F.x1 - 4, Math.max(F.x0 + 4, p.x + (dx / l) * r)), z: Math.min(F.z1 - 4, Math.max(F.z0 + 4, p.z + (dz / l) * r)) };
  }

  inPen(x, z, pad = 0.3) { const r = this.penRect; return x > r.x0 + pad && x < r.x1 - pad && z > r.z0 + pad && z < r.z1 - pad; }
  get penned() { return this.sheep.filter((s) => s.penned).length; }
  get all() { return this.sheep.length > 0 && this.sheep.every((s) => s.penned); }

  /** Is (x, z) inside something a sheep can't walk through (a fence, the pen's hurdles, a tree)? */
  solid(x, z, pad = 0.32) {
    for (const c of this.near.circles) if (c.top > 0.25 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
    for (const b of this.near.boxes) if (b.top > 0.25 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    return false;
  }

  // ---------- running the sheep (the shepherd's game) ----------

  /** A woof: sheep nearby scurry away from it (and baa about it). */
  bark(pos) {
    if (!this.host) return;
    for (const s of this.sheep) {
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < 9 && !s.penned) { s.panic = 1.4; s.fromX = pos.x; s.fromZ = pos.z; }
    }
  }

  /** dogs: [{ id, x, z, v }] every dog in the pack (ours too). */
  steer(dt, dogs) {
    const F = this.field, sheep = this.sheep, now = this.time;
    // The middle of the flock still out in the field.
    let cx = 0, cz = 0, n = 0;
    for (const s of sheep) if (!s.penned) { cx += s.x; cz += s.z; n++; }
    if (n) { cx /= n; cz /= n; }
    const gate = this.pen.gate, out = this.pen.out, gl = Math.hypot(gate.x - out.x, gate.z - out.z) || 1;
    const inX = gate.x + ((gate.x - out.x) / gl) * 1.4, inZ = gate.z + ((gate.z - out.z) / gl) * 1.4; // (a step inside the pen)
    for (const d of dogs) if (n && Math.hypot(d.x - cx, d.z - cz) < 12) this.nearDog.set(d.id, now);
    for (const s of sheep) {
      s.t -= dt; s.panic = Math.max(0, s.panic - dt);
      if (s.penned) { this.milling(s, dt); continue; }
      // Dogs nearby: away from them (more if they're running at you).
      let fx = 0, fz = 0;
      for (const d of dogs) {
        const dx = s.x - d.x, dz = s.z - d.z, dd = Math.hypot(dx, dz);
        if (dd < FLEE_R && dd > 1e-3) { const w = ((FLEE_R - dd) / FLEE_R) ** 1.2 * (1 + Math.min(1, (d.v ?? 0) / 4) * 0.6); fx += (dx / dd) * w; fz += (dz / dd) * w; }
      }
      if (s.panic > 0 && s.fromX !== undefined) { const dx = s.x - s.fromX, dz = s.z - s.fromZ, dd = Math.hypot(dx, dz) || 1; fx += (dx / dd) * 0.8; fz += (dz / dd) * 0.8; }
      // Stick together (more when frightened), and don't bump into each other.
      let ax = 0, az = 0, sx = 0, sz = 0, an = 0;
      for (const o of sheep) {
        if (o === s || o.penned) continue;
        const dx = s.x - o.x, dz = s.z - o.z, dd = Math.hypot(dx, dz);
        if (dd < SEP && dd > 1e-3) { sx += (dx / dd) * (SEP - dd); sz += (dz / dd) * (SEP - dd); }
        if (dd < 6) { ax += o.vx; az += o.vz; an++; }
      }
      const tx = cx - s.x, tz = cz - s.z, tl = Math.hypot(tx, tz);
      const scared = Math.hypot(fx, fz) > 0.04 || s.panic > 0;
      // Friends already in the pen? Sheep near its way in go and join them.
      const nearGate = Math.hypot(s.x - gate.x, s.z - gate.z), keen = this.penned > 0 && nearGate < 4.2 && !scared;
      let wx, wz, speed;
      if (s.lamb && !scared) { // lambs stay by their mums
        const m = sheep[s.mum] ?? sheep[0], dx = m.x - s.x, dz = m.z - s.z, dd = Math.hypot(dx, dz);
        wx = dd > 1.2 ? dx / dd : 0; wz = dd > 1.2 ? dz / dd : 0; speed = dd > 1.2 ? Math.min(FLEE, dd * 0.9) : 0;
        if (m.penned && this.inPen(s.x, s.z, -1.5)) { wx = gate.x - s.x; wz = gate.z - s.z; const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l; speed = WALK * 2; }
        s.state = speed > 0.1 ? 1 : 0;
      } else if (scared) {
        const k = Math.hypot(fx, fz);
        wx = fx + (tl > 1.5 ? (tx / tl) * 0.45 : 0) + (an ? ax / an / FLEE * 0.35 : 0) + sx * 1.6;
        wz = fz + (tl > 1.5 ? (tz / tl) * 0.45 : 0) + (an ? az / an / FLEE * 0.35 : 0) + sz * 1.6;
        // Being driven at the pen: steer for the middle of the way in (not the posts either side of it).
        if (nearGate < 3.8) { const ix = inX - s.x, iz = inZ - s.z, il = Math.hypot(ix, iz) || 1, w = ((3.8 - nearGate) / 3.8) * 1.5 * Math.max(0.6, k); wx += (ix / il) * w; wz += (iz / il) * w; }
        speed = (s.panic > 0 ? PANIC : FLEE) * Math.min(1.15, 0.55 + k);
        s.state = 2; s.calm = 0;
      } else if (keen) {
        wx = gate.x - s.x + (gate.x - out.x) * 0.6; wz = gate.z - s.z + (gate.z - out.z) * 0.6; speed = WALK * 1.6; s.state = 1;
      } else {
        s.calm += dt;
        // Grazing, mostly; now and then a step or two. A sheep on her own goes back to the others (sheep like
        // company), and a flock left in peace for a while ambles back to its favourite grazing spot.
        const alone = tl > 3.4 + n * 0.12;
        if (alone && s.state === 0 && !s.next) { s.state = 1; s.walkTo = { x: cx + (Math.random() - 0.5) * 2.4, z: cz + (Math.random() - 0.5) * 2.4 }; s.t = 14; }
        else if (s.t <= 0) {
          if (s.state === 0 && Math.random() < 0.45) {
            s.state = 1; s.t = 5;
            const home = this.farSide(), hx = home.x - cx, hz = home.z - cz, hl = Math.hypot(hx, hz), drift = s.calm > 20 && hl > 4 ? Math.min(2.5, hl) / hl : 0;
            const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.3;
            s.walkTo = { x: s.x + Math.cos(a) * r + hx * drift, z: s.z + Math.sin(a) * r + hz * drift };
            if (this.inPen(s.walkTo.x, s.walkTo.z, -0.8)) { s.state = 0; s.walkTo = null; } // (they only go in the pen when they're driven in)
          } else { s.state = 0; s.walkTo = null; s.t = 2 + Math.random() * 4; }
        }
        if (s.state === 1 && s.walkTo) {
          wx = s.walkTo.x - s.x; wz = s.walkTo.z - s.z;
          if (Math.hypot(wx, wz) < 0.3) { if (s.next) { s.walkTo = s.next; s.next = null; s.t = 9; } else { s.state = 0; s.t = 2 + Math.random() * 3; } }
          speed = WALK;
        } else { wx = 0; wz = 0; speed = 0; }
        wx += sx * 2; wz += sz * 2;
        if (sx || sz) speed = Math.max(speed, 0.4);
      }
      // Fences: ease off them before you get there (sheep don't like being squashed into a corner).
      const m = 1.8;
      if (s.x < F.x0 + m) wx += (F.x0 + m - s.x) * 0.6; if (s.x > F.x1 - m) wx -= (s.x - F.x1 + m) * 0.6;
      if (s.z < F.z0 + m) wz += (F.z0 + m - s.z) * 0.6; if (s.z > F.z1 - m) wz -= (s.z - F.z1 + m) * 0.6;
      this.move(s, wx, wz, speed, dt);
      // In through the gate: penned! (She stays in now, until the farmer lets them out. Once out, she has to
      // have been right out of the pen before she counts as in again.)
      if (!this.inPen(s.x, s.z, -0.7)) s.out = true;
      if (s.out && this.inPen(s.x, s.z)) { s.penned = true; s.state = 4; s.out = false; this.onBaa?.(s, 'penned'); }
    }
    if (this.all && !this.gateShut && now - this.penSent > 3) { // every last one: tell the pack (it says "penned" back)
      this.penSent = now;
      const by = [...this.nearDog].filter(([, t]) => now - t < 45).map(([id]) => id);
      if (by.length) this.send({ a: 'pen', by });
      else this.letOut(); // (wandered in on their own, with no dog about: that's not a round-up)
    }
  }

  /** In the pen: potter about a bit (staying in). */
  milling(s, dt) {
    const r = this.penRect, pad = 0.55;
    if (s.t <= 0) { s.t = 2 + Math.random() * 4; s.walkTo = Math.random() < 0.5 ? { x: r.x0 + pad + Math.random() * (r.x1 - r.x0 - pad * 2), z: r.z0 + pad + Math.random() * (r.z1 - r.z0 - pad * 2) } : null; }
    let wx = 0, wz = 0, speed = 0;
    if (s.walkTo) { wx = s.walkTo.x - s.x; wz = s.walkTo.z - s.z; speed = Math.hypot(wx, wz) > 0.3 ? WALK * 0.7 : 0; }
    for (const o of this.sheep) {
      if (o === s) continue;
      const dx = s.x - o.x, dz = s.z - o.z, dd = Math.hypot(dx, dz);
      if (dd < 0.8 && dd > 1e-3) { wx += (dx / dd) * 1.5; wz += (dz / dd) * 1.5; speed = Math.max(speed, 0.3); }
    }
    this.move(s, wx, wz, speed, dt);
    s.x = Math.min(r.x1 - pad, Math.max(r.x0 + pad, s.x)); s.z = Math.min(r.z1 - pad, Math.max(r.z0 + pad, s.z));
    s.state = speed > 0.1 ? 1 : 4;
  }

  /** Head (dx, dz)-wards at `speed`, sliding along fences and hurdles, and staying in the field. */
  move(s, dx, dz, speed, dt) {
    const n = Math.hypot(dx, dz) || 1, k = 1 - Math.exp(-dt * 5);
    s.vx += ((dx / n) * speed - s.vx) * k;
    s.vz += ((dz / n) * speed - s.vz) * k;
    const nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
    if (!this.solid(nx, nz)) { s.x = nx; s.z = nz; }
    else if (this.slide(s, dt)) { /* (round a post or along a hurdle) */ }
    else if (!this.solid(nx, s.z)) { s.x = nx; s.vz *= 0.5; }
    else if (!this.solid(s.x, nz)) { s.z = nz; s.vx *= 0.5; }
    else { s.vx *= -0.3; s.vz *= -0.3; }
    const F = this.field;
    s.x = Math.min(F.x1 - 0.5, Math.max(F.x0 + 0.5, s.x)); s.z = Math.min(F.z1 - 0.5, Math.max(F.z0 + 0.5, s.z));
    s.speed = Math.hypot(s.vx, s.vz);
    if (s.speed > 0.08) { let dh = Math.atan2(s.vx, s.vz) - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); s.h += dh * (1 - Math.exp(-dt * 6)); }
  }

  /** Bumped into something round (a post, a slanting hurdle): slip along it rather than stopping dead. */
  slide(s, dt, pad = 0.32) {
    let best = null, bd = Infinity;
    for (const c of this.near.circles) {
      if (c.top <= 0.25) continue;
      const d = Math.hypot(s.x - c.x, s.z - c.z) - c.r - pad;
      if (d < bd) { bd = d; best = c; }
    }
    if (!best || bd > 0.15) return false;
    const nx = s.x - best.x, nz = s.z - best.z, nl = Math.hypot(nx, nz) || 1;
    let tx = -nz / nl, tz = nx / nl;
    if (tx * s.vx + tz * s.vz < 0) { tx = -tx; tz = -tz; }
    const v = Math.hypot(s.vx, s.vz) * 0.85, px = s.x + tx * v * dt + (nx / nl) * 0.01, pz = s.z + tz * v * dt + (nz / nl) * 0.01;
    if (this.solid(px, pz)) return false;
    s.x = px; s.z = pz;
    return true;
  }

  /** The farmer lets them out again: the gate swings open and off they trot back to the grass. */
  letOut() {
    this.gateShut = false;
    const out = this.pen.out, far = this.farSide();
    for (const s of this.sheep) { // (out through the gate first, then away across the grass)
      s.penned = false; s.out = false; s.state = 1; s.t = 9 + Math.random() * 4; s.calm = 0;
      s.walkTo = { x: out.x + Math.random() * 1.6 - 0.8, z: out.z + Math.random() * 1.6 - 0.8 };
      s.next = { x: far.x + Math.random() * 6 - 3, z: far.z + Math.random() * 6 - 3 };
    }
  }

  // ---------- the pack ----------

  /** What we tell everyone (the shepherd, a few times a second). */
  snapshot() {
    return {
      a: 'sheep', d: this.sheep.flatMap((s) => [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100, Math.round(s.h * 100) / 100]),
      s: this.sheep.map((s) => s.state), p: this.sheep.reduce((m, s, i) => m | (s.penned ? 1 << i : 0), 0), g: this.gateShut ? 1 : 0,
    };
  }

  /** The flock, from whoever's running it. */
  follow(m) {
    if (this.host || !Array.isArray(m?.d)) return;
    const n = Math.floor(m.d.length / 3);
    if (n !== this.sheep.length) this.size(n);
    this.sheep.forEach((s, i) => {
      s.to = { x: m.d[i * 3], z: m.d[i * 3 + 1], h: m.d[i * 3 + 2] };
      const was = s.state;
      s.state = m.s?.[i] ?? 0;
      s.penned = !!(m.p & (1 << i));
      if (s.state === 2 && was !== 2) s.spooked = true; // (for a baa)
    });
    this.gateShut = !!m.g;
    this.heard = this.time;
  }

  /** We run the sheep now (or not). Taking over: carry on from where they are. */
  setHost(on) {
    if (on === this.host) return;
    this.host = on;
    for (const s of this.sheep) {
      if (s.to) { s.x = s.to.x; s.z = s.to.z; s.h = s.to.h; }
      s.to = null; s.vx = s.vz = 0; s.t = Math.random() * 2;
      if (s.penned) s.state = 4;
    }
    if (on && this.gateShut) this.holdT = Math.max(this.holdT, 10);
  }

  // ---------- every frame ----------

  /** dogs: every dog's { id, x, z, v }. live: in a pack (send the flock). */
  update(dt, dogs, { live = false } = {}) {
    this.time += dt;
    if (this.host) {
      this.steer(dt, dogs);
      if (this.gateShut) { this.holdT -= dt; if (this.holdT <= 0) { this.letOut(); this.onLetOut?.(); } }
      if (live) {
        this.sendT -= dt;
        const busy = this.sheep.some((s) => s.state === 1 || s.state === 2 || s.speed > 0.1);
        if (this.sendT <= 0) { this.sendT = busy ? SEND : SEND_CALM; this.send(this.snapshot()); }
      }
    } else {
      for (const s of this.sheep) {
        if (!s.to) continue;
        const k = 1 - Math.exp(-dt * 9), dx = (s.to.x - s.x) * k, dz = (s.to.z - s.z) * k;
        s.x += dx; s.z += dz;
        s.speed = s.speed * 0.8 + (Math.hypot(dx, dz) / Math.max(dt, 1e-4)) * 0.2;
        let dh = s.to.h - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); s.h += dh * k;
      }
    }
    this.animate(dt);
  }

  /** Where everyone's legs and heads are (and the pen gate). */
  animate(dt) {
    const t = this.time;
    for (const s of this.sheep) {
      const lamb = s.lamb, k = lamb ? 0.6 : 1;
      s.phase += dt * (3 + Math.min(4, s.speed) * (lamb ? 7 : 5));
      // Heads down to graze when standing about; up when walking; right up when frightened.
      const want = s.state === 0 ? 1 : s.state === 4 ? (Math.sin(t * 0.3 + s.i) > 0.3 ? 1 : 0) : 0;
      s.head += (want - s.head) * (1 - Math.exp(-dt * 3));
      // Lambs spring about now and then (boing!).
      if (lamb) { s.hopT -= dt; if (s.hopT <= 0) { s.hopT = 2.5 + Math.random() * 5; s.hop = 0.45; } }
      s.hop = Math.max(0, s.hop - dt);
      const hopY = s.hop > 0 ? Math.sin((s.hop / 0.45) * Math.PI) * 0.35 : 0;
      const bob = Math.abs(Math.sin(s.phase)) * 0.025 * Math.min(1, s.speed);
      rootMatrix(_root, s.x, hopY + bob, s.z, s.h, k, s.state === 2 ? -0.08 : 0, Math.sin(s.phase) * 0.03 * Math.min(1, s.speed));
      this.body.setMatrixAt(s.i, _root);
      const chew = s.head > 0.6 ? Math.sin(t * 9 + s.i) * 0.04 : 0;
      this.head.setMatrixAt(s.i, partMatrix(_m, _root, SHEEP.NECK, s.head * 0.95 - 0.15 + chew, Math.sin(t * 0.4 + s.i * 2) * 0.25 * (1 - s.head), 0, lamb ? 1.22 : 1));
      const sw = Math.min(1, s.speed / 1.2) * 0.55, tuck = s.hop > 0 ? 0.6 : 0;
      SHEEP.HIPS.forEach((hip, j) => {
        const ph = s.phase + (j === 0 || j === 3 ? 0 : Math.PI);
        this.legs.setMatrixAt(s.i * 4 + j, partMatrix(_m, _root, hip, Math.sin(ph) * sw + (j < 2 ? -tuck : tuck), 0, 0));
      });
    }
    this.body.instanceMatrix.needsUpdate = this.head.instanceMatrix.needsUpdate = this.legs.instanceMatrix.needsUpdate = true;
    // The gate: swings shut once they're all in, and open again after.
    const want = this.gateShut ? 1 : 0;
    if (Math.abs(want - this.gateK) > 0.001) {
      if ((want === 1 && this.gateK < 0.02) || (want === 0 && this.gateK > 0.98)) fmsfx.gate(0.9);
      this.gateK += (want - this.gateK) * (1 - Math.exp(-dt * 3.5));
      this.gate.rotation.y = this.gateOpen + (this.gateClosed - this.gateOpen) * this.gateK;
    }
  }

  /** The pen's gate: a hurdle on a hinge at one side of the way in. */
  buildGate() {
    const p = this.pen, a = this.area.plan, along = [a.dir[0], a.dir[1]]; // (the gap runs along v)
    const half = p.gap / 2;
    const hinge = V(p.gate.x - along[0] * half, 0, p.gate.z - along[1] * half);
    const g = new THREE.Group();
    g.position.copy(hinge);
    const L = p.gap - 0.1, wood = paint(0xa8875e), dark = paint(0x86684a);
    for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, L), wood); r.position.set(0, 0.2 + k * 0.22, L / 2); r.castShadow = true; g.add(r); }
    for (const z of [0.05, L - 0.05]) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), dark); pst.position.set(0, 0.5, z); g.add(pst); }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, Math.hypot(L, 0.7)), wood);
    br.position.set(0, 0.55, L / 2); br.rotation.x = Math.atan2(0.7, L); g.add(br);
    this.gateClosed = Math.atan2(along[0], along[1]);       // (across the gap)
    const fx = a.across[0] * p.side, fz = a.across[1] * p.side; // (out into the field)
    this.gateOpen = this.gateClosed + (along[1] * fx - along[0] * fz > 0 ? 1 : -1) * 1.9; // (swung back out into the field)
    g.rotation.y = this.gateOpen;
    this.gate = g;
    this.scene.add(g);
  }

  /** The sheep nearest a point (or null). */
  nearest(p, penned = false) {
    let best = null, bd = Infinity;
    for (const s of this.sheep) { if (s.penned !== penned) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  dispose() { for (const m of [this.body, this.head, this.legs, this.gate]) m.removeFromParent(); }
}
