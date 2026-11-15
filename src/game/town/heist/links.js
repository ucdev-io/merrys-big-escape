import * as THREE from 'three';
import { paint } from '../../../render/watercolorMaterial.js';
import { SAUSAGE, SAUSAGE_TWIST } from '../../../world/town/heistProps.js';
import { LINKS } from '../../heistRules.js';

// The butcher's string of sausages: a chain of points (one at each twist) that follow each other about,
// so the string swings on its rail, trails and flops behind whoever's got it, sags between two dogs in
// a tug of war, and snaps in the middle. Points 5 and 6 are the middle twist (where it snaps): until it
// does, they're held together.
const N = LINKS.n + 2, JOIN = LINKS.half, LAST = N - 1;
const REST = 0.28, R = 0.042, FLOOR = 0.04, GRAVITY = 9.8;
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();

export class SausageString {
  /** hooks: four points along the butcher's rail, right to left (heistProps.js RAIL_HOOKS). */
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.p = Array.from({ length: N }, () => new THREE.Vector3());
    this.q = Array.from({ length: N }, () => new THREE.Vector3()); // where each point was last step
    this.pins = new Array(N).fill(null);
    this.segs = Array.from({ length: N - 1 }, (_, i) => ({ a: i, b: i + 1, rest: i === JOIN ? 0 : REST }));
    this.cut = false;
    this.banked = [false, false];
    this.sausages = new THREE.InstancedMesh(new THREE.CapsuleGeometry(R, REST - 2 * R, 6, 12), paint(SAUSAGE), LINKS.n);
    this.knots = new THREE.InstancedMesh(new THREE.SphereGeometry(R * 0.62, 10, 8), paint(SAUSAGE_TWIST), N - 3);
    this.bounds = new THREE.Sphere(new THREE.Vector3(), 1); // (moved along with the sausages, so they're culled when out of sight)
    for (const m of [this.sausages, this.knots]) { m.castShadow = true; m.boundingSphere = this.bounds; scene.add(m); }
    this.hang();
  }

  /** Point at end 0 (the dangling one) or end 1 (tied on). */
  end(e) { return this.p[e ? LAST : 0]; }

  /** Back on the rail: in swags between the hooks, the last four sausages dangling down (laid out for ten). */
  hang() {
    const [h0, h1, h2, h3] = this.hooks, sag = (a, b, k, d) => a.clone().lerp(b, k).setY(a.y - d);
    const at = [];
    for (let i = 0; i <= 3; i++) at[i] = h3.clone().setY(h3.y - (4 - i) * REST);
    at[4] = h3.clone(); at[5] = sag(h3, h2, 0.5, 0.2); at[6] = at[5].clone(); at[7] = h2.clone();
    at[8] = sag(h2, h1, 0.5, 0.2); at[9] = h1.clone(); at[10] = sag(h1, h0, 0.5, 0.2); at[11] = h0.clone();
    at.forEach((v, i) => { this.p[i].copy(v); this.q[i].copy(v); });
    this.pins.fill(null);
    this.pins[4] = h3; this.pins[7] = h2; this.pins[9] = h1; this.pins[11] = h0;
    this.onHook = true;
    this.setCut(false, [false, false]);
  }

  /** Off the rail: only the ends are held now (or nobody's got it, and it lies where it falls). */
  unhook() { if (this.onHook) { this.onHook = false; this.pins.fill(null); } }

  setCut(cut, banked) {
    this.cut = cut;
    this.banked = [...banked];
    this.segs[JOIN].off = cut;
    this.sausages.visible = this.knots.visible = !(banked[0] && banked[1]);
  }

  /** Hold an end in a dog's mouth (a world position, updated every frame), or let it go (null). */
  hold(e, at) { if (!this.onHook) this.pins[e ? LAST : 0] = at; }

  update(dt) {
    if (!this.sausages.visible) return;
    const steps = 2, h = Math.min(dt, 1 / 20) / steps;
    for (let s = 0; s < steps; s++) this.step(h);
    this.draw();
  }

  step(h) {
    const { p, q, pins } = this;
    for (let i = 0; i < N; i++) {
      if (pins[i]) { q[i].copy(p[i]); p[i].copy(pins[i]); continue; }
      const vx = (p[i].x - q[i].x) * 0.985, vy = (p[i].y - q[i].y) * 0.985, vz = (p[i].z - q[i].z) * 0.985;
      q[i].copy(p[i]);
      p[i].x += vx; p[i].y += vy - GRAVITY * h * h; p[i].z += vz;
    }
    for (let k = 0; k < 8; k++) {
      for (const sg of this.segs) {
        if (sg.off) continue;
        const a = p[sg.a], b = p[sg.b], wa = pins[sg.a] ? 0 : 1, wb = pins[sg.b] ? 0 : 1;
        if (!wa && !wb) continue;
        _d.subVectors(b, a);
        const len = _d.length();
        if (len < 1e-6) continue;
        const f = (len - sg.rest) / len / (wa + wb);
        a.addScaledVector(_d, f * wa);
        b.addScaledVector(_d, -f * wb);
      }
    }
    for (let i = 0; i < N; i++) { // the ground (and a little friction along it, so it drags rather than skates)
      if (pins[i] || p[i].y > FLOOR) continue;
      p[i].y = FLOOR;
      q[i].x += (p[i].x - q[i].x) * 0.35; q[i].z += (p[i].z - q[i].z) * 0.35; q[i].y = FLOOR;
    }
  }

  /** Each sausage between its two twists, and a twist at every join. */
  draw() {
    const { p } = this;
    let si = 0, ki = 0;
    for (let i = 0; i < N - 1; i++) {
      if (i === JOIN) continue;
      const half = i < JOIN ? 0 : 1, a = p[i], b = p[i + 1];
      _d.subVectors(b, a);
      const len = _d.length();
      if (this.banked[half] || len < 1e-6) _m.makeScale(0, 0, 0);
      else _m.compose(_c.addVectors(a, b).multiplyScalar(0.5), _q.setFromUnitVectors(Y, _d.multiplyScalar(1 / len)), _s.set(1, THREE.MathUtils.clamp(len / REST, 0.7, 1.4), 1));
      this.sausages.setMatrixAt(si++, _m);
    }
    for (let i = 1; i < LAST; i++) {
      if (i === JOIN + 1) continue; // (the middle twist is drawn once, for points 5 and 6)
      const half = i <= JOIN ? 0 : 1, gone = i === JOIN ? this.cut || this.banked[0] || this.banked[1] : this.banked[half];
      _m.compose(gone ? ZERO : p[i], _q.identity(), gone ? ZERO : _s.set(1, 1, 1));
      this.knots.setMatrixAt(ki++, _m);
    }
    this.sausages.instanceMatrix.needsUpdate = this.knots.instanceMatrix.needsUpdate = true;
    this.bounds.setFromPoints(p);
    this.bounds.radius += R;
  }

  /** How far apart the two ends are (for a tug of war). */
  span() { return this.p[0].distanceTo(this.p[LAST]); }
}

export const STRING_LENGTH = LINKS.n * REST;
