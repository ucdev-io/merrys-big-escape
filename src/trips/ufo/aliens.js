import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeRigid } from '../../world/merge.js';

/*
 * 👽 The Blips of Planet Boing: round and squashy, with one big eye (or two), wobbly antennae with glowing tips,
 * stubby arms and a big smile. They get about in hops (it's very floaty here). Captain Zib wears a cap.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPHERE = new THREE.SphereGeometry(1, 20, 14);
SPHERE.userData.shared = true; // (one for every alien: never thrown away with a trip)

function part(parent, color, pos, scale, opts) {
  const m = new THREE.Mesh(SPHERE, paint(color, opts));
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Alien {
  /**
   * color, belly: body colours; size: 1 is about knee-high to a person; eyes: 1 or 2; glow: the antennae's tips;
   * cap: a captain's cap colour (or null); voice: how high their warble is.
   */
  constructor({ color, belly = 0xffffff, size = 1, eyes = 1, glow = 0xfff17a, cap = null, voice = 1 } = {}) {
    Object.assign(this, { size, voice });
    this.root = new THREE.Group();
    this.root.scale.setScalar(size);
    this.body = new THREE.Group();
    this.root.add(this.body);
    const B = this.body;
    part(B, color, [0, 0.36, 0], [0.34, 0.36, 0.32]);
    part(B, belly, [0, 0.3, 0.12], [0.25, 0.24, 0.22]);
    // Eyes (in a group that blinks).
    this.eyes = new THREE.Group();
    this.eyes.position.set(0, 0.5, 0.24);
    B.add(this.eyes);
    const xs = eyes === 1 ? [0] : [-0.11, 0.11], er = eyes === 1 ? 0.125 : 0.085;
    for (const x of xs) {
      part(this.eyes, 0xffffff, [x, 0, 0], [er, er * 1.08, er * 0.8]);
      part(this.eyes, 0x2b2238, [x, 0.0, er * 0.62], [er * 0.52, er * 0.58, er * 0.3]);
      part(this.eyes, 0xffffff, [x + er * 0.2, er * 0.25, er * 0.78], [er * 0.16, er * 0.16, er * 0.08]);
    }
    // A big smile, and rosy cheeks.
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 16, Math.PI), paint(0x5a2a4a));
    smile.position.set(0, 0.34, 0.31);
    smile.rotation.set(0.2, 0, Math.PI);
    B.add(smile);
    for (const s of [-1, 1]) part(B, 0xf7a0b8, [s * 0.19, 0.36, 0.25], [0.05, 0.03, 0.02]);
    // Stubby arms and feet.
    this.arms = [-1, 1].map((s) => part(B, color, [s * 0.33, 0.34, 0.04], [0.075, 0.1, 0.075]));
    for (const s of [-1, 1]) part(this.root, color, [s * 0.14, 0.04, 0.06], [0.1, 0.05, 0.13]);
    // Antennae (wobbly), with glowing tips.
    this.ants = [-1, 1].map((s) => {
      const a = new THREE.Group();
      a.position.set(s * 0.1, 0.68, 0);
      a.rotation.z = -s * 0.35;
      B.add(a);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.26, 6), paint(color));
      stalk.position.y = 0.13;
      a.add(stalk);
      part(a, glow, [0, 0.28, 0], [0.05, 0.05, 0.05], { emissive: glow });
      return a;
    });
    if (cap) {
      // Captain's cap: a little round cap with a peak, and a gold star.
      const c = new THREE.Group();
      c.position.set(0, 0.66, 0.02);
      c.rotation.x = -0.15;
      B.add(c);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 20), paint(cap));
      crown.position.y = 0.04;
      const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), paint(0x2f3a52));
      peak.position.set(0, -0.005, 0.07);
      peak.rotation.y = Math.PI;
      c.add(crown, peak);
      part(c, 0xf6d06a, [0, 0.05, 0.16], [0.035, 0.035, 0.012]);
      for (const a of this.ants) a.position.y = 0.62; // (poking out from under it)
    }
    // ~20 little spheres baked into a few meshes (world/merge.js): the body (and cap), the feet, the blinking
    // eyes, each wobbly antenna. The arms stay as they are: they wave.
    for (const a of this.arms) a.userData.noMerge = true;
    for (const g of [this.eyes, ...this.ants]) { mergeRigid(g); g.userData.noMerge = true; }
    mergeRigid(this.body);
    this.body.userData.noMerge = true;
    mergeRigid(this.root);
    this.t = Math.random() * 10;
    this.blinkT = 1 + Math.random() * 3;
    this.hop = null;    // { from, to, t, dur, h }: in the middle of a hop
    this.happyT = 0;    // bouncing about for joy
    this.squash = 0;
    this.heading = 0;
    this.target = null; // hop over to here (Vector3), then stop
    this.hopLen = 1.1;
  }

  get pos() { return this.root.position; }

  /** Where to say things from: just over the antennae. */
  top(up = 0.35) { return this.root.position.clone().add(V(0, (0.95 + up) * this.size, 0)); }

  /** Off they go, hopping, to (x, z). */
  goTo(p) { this.target = p ? p.clone() : null; }

  /** A happy hop (or a few) on the spot. */
  cheer(secs = 1.6) { this.happyT = Math.max(this.happyT, secs); }

  /** Turn to look at (x, z). */
  lookAt(p, dt, rate = 5) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    const d = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
    this.heading += d * (1 - Math.exp(-dt * rate));
  }

  /** ground(x, z): the height of the ground; look: something to keep an eye on (or null). */
  update(dt, ground, look = null) {
    this.t += dt;
    const p = this.pos;
    // Hopping somewhere (each hop a little arc), or a happy hop on the spot.
    if (!this.hop) {
      if (this.target && Math.hypot(this.target.x - p.x, this.target.z - p.z) > 0.25) {
        const dx = this.target.x - p.x, dz = this.target.z - p.z, l = Math.hypot(dx, dz), step = Math.min(l, this.hopLen * this.size + 0.4);
        this.heading = Math.atan2(dx, dz);
        this.hop = { fx: p.x, fz: p.z, tx: p.x + (dx / l) * step, tz: p.z + (dz / l) * step, t: 0, dur: 0.75, h: 0.45 };
      } else if (this.happyT > 0) this.hop = { fx: p.x, fz: p.z, tx: p.x, tz: p.z, t: 0, dur: 0.6, h: 0.6 };
      else if (look) this.lookAt(look, dt);
    }
    this.happyT = Math.max(0, this.happyT - dt);
    let lift = 0;
    if (this.hop) {
      const H = this.hop;
      H.t += dt;
      const k = Math.min(1, H.t / H.dur);
      p.x = H.fx + (H.tx - H.fx) * k;
      p.z = H.fz + (H.tz - H.fz) * k;
      lift = 4 * H.h * k * (1 - k);
      if (k >= 1) { this.hop = null; this.squash = 0.22; }
    }
    p.y = ground(p.x, p.z) + lift * this.size;
    this.root.rotation.y = this.heading;
    // Squash and stretch: a gentle breathing bob, squashed on landing, stretched in the air.
    this.squash *= Math.exp(-dt * 7);
    const air = this.hop ? 0.12 : 0, s = 1 + Math.sin(this.t * 3) * 0.025 - this.squash + air;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    // Antennae wobble (more in the air), arms wave when happy, and a blink now and then.
    for (const [i, a] of this.ants.entries()) a.rotation.x = Math.sin(this.t * 4.2 + i * 1.3) * (0.12 + air * 1.5);
    const wave = this.happyT > 0 || this.waveT > 0;
    this.waveT = Math.max(0, (this.waveT ?? 0) - dt);
    for (const [i, a] of this.arms.entries()) a.position.y = 0.34 + (wave ? 0.12 + Math.sin(this.t * 12 + i * Math.PI) * 0.05 : 0);
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.1 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    this.eyes.scale.y = blink;
  }
}
