import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { bake, SPHERE } from '../../entities/shapes.js';
import { gullBodyGeometry, gullWingGeometry } from '../../entities/beachItems.js';

/*
 * 🐬 Out at sea: a pod of dolphins that comes leaping alongside the ship now and then, a whale that surfaces
 * further off (and blows!), and gulls wheeling over the masts. All in the ship's own coordinates (see build.js).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A dolphin: a smooth grey-blue body (paler underneath), a curved fin, flippers and tail flukes. Nose to +z. */
function dolphinGeometry() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, q = 1 - t, r = 0.27 * Math.sin(Math.PI * Math.pow(q, 0.8)) ** 0.75 * (q > 0.85 ? 1 - (q - 0.85) * 2.4 : 1); // (plump at the front, slim to the tail)
    pts.push(new THREE.Vector2(Math.max(0.004, r), -1.0 + t * 2.0));
  }
  const body = new THREE.LatheGeometry(pts, 20);
  body.rotateX(Math.PI / 2); // (along z, nose forward)
  const top = 0x7f97ad, belly = 0xdfe6ea;
  return bake([
    { geo: body, colors: (i, v) => (v.y < -0.06 ? belly : top) },
    [SPHERE, top, [0, 0.0, 1.02], [0, 0, 0], [0.07, 0.06, 0.16]],                 // the beak
    [new THREE.ConeGeometry(0.13, 0.36, 10), top, [0, 0.3, -0.05], [-0.5, 0, 0], [0.35, 1, 1]],  // the dorsal fin, swept back
    [SPHERE, top, [0.24, -0.1, 0.32], [0.2, 0.5, -0.6], [0.2, 0.025, 0.09]],      // flippers
    [SPHERE, top, [-0.24, -0.1, 0.32], [0.2, -0.5, 0.6], [0.2, 0.025, 0.09]],
    [SPHERE, top, [0.17, 0, -1.02], [0, 0.35, 0], [0.2, 0.025, 0.1]],              // tail flukes
    [SPHERE, top, [-0.17, 0, -1.02], [0, -0.35, 0], [0.2, 0.025, 0.1]],
    [SPHERE, 0x2b2b38, [0.12, 0.06, 0.72], [0, 0, 0], [0.025, 0.025, 0.02]],       // eyes
    [SPHERE, 0x2b2b38, [-0.12, 0.06, 0.72], [0, 0, 0], [0.025, 0.025, 0.02]],
  ]);
}

/** The whale's back (a long dark hump with a small fin) and its tail, for diving. */
function whaleGeometry() {
  return bake([
    [SPHERE, 0x4a5a6e, [0, 0, 0], [0, 0, 0], [2.2, 1.1, 7]],
    [new THREE.ConeGeometry(0.4, 0.8, 10), 0x4a5a6e, [0, 1.15, -2.8], [-0.4, 0, 0], [0.4, 1, 1]],
    [SPHERE, 0x5b6c80, [0, 0.8, 4.2], [0, 0, 0], [0.4, 0.15, 0.25]], // (the blowhole's bump)
  ]);
}
function flukeGeometry() {
  return bake([
    [SPHERE, 0x4a5a6e, [1.5, 0, 0], [0, 0, 0.2], [1.7, 0.16, 0.8]],
    [SPHERE, 0x4a5a6e, [-1.5, 0, 0], [0, 0, -0.2], [1.7, 0.16, 0.8]],
    [SPHERE, 0x4a5a6e, [0, -0.6, 0], [0, 0, 0], [0.5, 1.0, 0.45]],
  ]);
}

export class SeaLife {
  /** dyn: the ship's moving bits (its own coordinates); sea: the water's height; fx: { splash(pos, n), spout(pos) }. */
  constructor(dyn, sea, fx) {
    Object.assign(this, { dyn, sea, fx });
    const mat = paint(0xffffff, { vertexColors: true });
    const dg = dolphinGeometry();
    this.dolphins = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(dg, mat);
      m.castShadow = false;
      m.visible = false;
      m.scale.setScalar(i === 2 ? 1.0 : 1.35); // (and a little one!)
      dyn.add(m);
      return { m, phase: 0, lead: i * 0.9 };
    });
    this.pod = null;          // { side, t, dur, z0, waved }
    this.podT = 14 + Math.random() * 10;
    this.whale = { back: new THREE.Mesh(whaleGeometry(), mat), tail: new THREE.Mesh(flukeGeometry(), mat), t: -1, waved: false };
    for (const m of [this.whale.back, this.whale.tail]) { m.visible = false; m.castShadow = false; dyn.add(m); }
    this.whaleT = 40 + Math.random() * 20;
    // Gulls, wheeling over the ship.
    const gb = gullBodyGeometry(), gl = gullWingGeometry(-1), gr = gullWingGeometry(1);
    this.gulls = [0, 1, 2].map((i) => {
      const g = new THREE.Group(), body = new THREE.Mesh(gb, mat), wl = new THREE.Mesh(gl, mat), wr = new THREE.Mesh(gr, mat);
      for (const w of [wl, wr]) w.position.set(0, 0.24, 0.02);
      g.add(body, wl, wr);
      g.scale.setScalar(1.6);
      dyn.add(g);
      return { g, wl, wr, a: (i / 3) * Math.PI * 2, r: 9 + i * 3, y: 9 + i * 1.5, z: -4 + i * 6, speed: 0.35 + i * 0.07, scare: 0 };
    });
  }

  /** Dolphins up just now (for a woof)? Which side ('port' | 'starboard'), or null. */
  get leaping() { return this.pod && this.pod.t > 0.8 && this.pod.t < this.pod.dur - 1 ? this.pod.side : null; }
  get blowing() { return this.whale.t > 0 && this.whale.t < 6; }

  /** A woof: the gulls flap off higher for a bit. */
  scareGulls() { for (const q of this.gulls) q.scare = 3; }

  update(dt, t) {
    // ---- the pod ----
    this.podT -= dt;
    if (!this.pod && this.podT <= 0) this.pod = { side: Math.random() < 0.5 ? -1 : 1, t: 0, dur: 11, z0: 22, x: 17 + Math.random() * 5, waved: false };
    const sea = this.sea;
    if (this.pod) {
      const p = this.pod;
      p.t += dt;
      for (const d of this.dolphins) {
        const k = p.t / p.dur, ph = p.t * 2.4 - d.lead, cyc = ph % (Math.PI * 1.4);
        const z = p.z0 - k * 48 - d.lead * 1.5, x = p.side * (p.x + d.lead * 1.2); // (racing the ship, overtaking it)
        const up = ph > 0 && cyc < Math.PI && k < 0.93;
        d.m.visible = up;
        if (up) {
          const prev = d.m.position.y;
          d.m.position.set(x, sea + Math.sin(cyc) * 2.4 - 0.3, z);
          d.m.rotation.set(Math.cos(cyc) * 0.9, Math.PI, 0); // (heading for the bow: nose up out of the water, nose down back in)
          if (prev < sea && d.m.position.y >= sea) this.fx.splash(V(x, sea, z), 6);
          if (cyc > Math.PI - 0.12) this.fx.splash(V(x, sea, z), 4);
        }
      }
      if (p.t > p.dur) { this.pod = null; this.podT = 30 + Math.random() * 25; for (const d of this.dolphins) d.m.visible = false; }
    }
    // ---- the whale, further off ----
    const w = this.whale;
    this.whaleT -= dt;
    if (w.t < 0 && this.whaleT <= 0) { w.t = 0; w.side = Math.random() < 0.5 ? -1 : 1; w.x = w.side * (34 + Math.random() * 12); w.z = -30 + Math.random() * 40; w.waved = false; }
    if (w.t >= 0) {
      w.t += dt;
      const T = w.t, rise = Math.min(1, T / 1.5) * (T < 6 ? 1 : Math.max(0, 1 - (T - 6) / 1.5));
      w.back.visible = rise > 0.01;
      w.back.position.set(w.x, sea - 1.0 + rise * 0.75, w.z + T * 0.8);
      if (T > 1 && T < 4.5 && Math.random() < dt * 9) this.fx.spout(V(w.x, sea + 0.4, w.z + T * 0.8 + 4.2));
      // …and down she goes, tail up.
      const tt = T - 7.0;
      w.tail.visible = tt > 0 && tt < 3;
      if (w.tail.visible) { w.tail.position.set(w.x, sea - 0.6 + Math.sin(Math.min(1, tt / 3) * Math.PI) * 2.6, w.z + 7 * 0.8 - 5); w.tail.rotation.x = -0.5 + tt * 0.25; }
      if (T > 10.5) { w.t = -1; w.back.visible = w.tail.visible = false; this.whaleT = 60 + Math.random() * 40; }
    }
    // ---- gulls ----
    for (const q of this.gulls) {
      q.scare = Math.max(0, q.scare - dt);
      q.a += dt * q.speed * (1 + q.scare * 0.5);
      const y = q.y + q.scare * 2.5 + Math.sin(t * 0.7 + q.r) * 0.6;
      q.g.position.set(Math.cos(q.a) * q.r, y, q.z + Math.sin(q.a) * q.r * 1.6);
      q.g.rotation.y = Math.atan2(-Math.sin(q.a), Math.cos(q.a) * 1.6); // (flying round the circle)
      q.g.rotation.z = 0.25;
      const flap = Math.sin(t * (q.scare > 0 ? 14 : 5) + q.r) * (q.scare > 0 ? 0.7 : 0.25);
      q.wl.rotation.z = flap; q.wr.rotation.z = -flap;
    }
  }
}
