import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry, skyDome } from '../../world/props.js';
import { PALETTE } from '../../render/palette.js';
import { tripWorld } from '../kit.js';

/*
 * 🎡 Wagtail Wonderland, the theme park (a day out on the bus): a fence all round, the gate and its bus stop at the
 * south end, an avenue up to a plaza with stalls, and the rides round about (built and run by ./rides.js): the
 * carousel, the big wheel, the helter-skelter, the dodgems, and the Wiggly Woof rollercoaster at the north end.
 * Its own coordinates (0, 0 is the middle of the plaza-ish; the gate is at +z):
 *
 *            🎢 the Wiggly Woof (all along the north end)
 *     🌀 helter-skelter   station        🎡 big wheel
 *         🎠 carousel        ⛲ plaza        🍭 stalls
 *              🍿                │            🚗 dodgems
 *                         gate + 🚌 stop
 */

export const PLAN = {
  X: 31, Z0: -32, Z1: 27,                      // the fence: |x| < X, Z0 < z < Z1
  gate: { x: 0, z: 27, w: 5 },
  stop: { x: -4.2, z: 24.6 },                  // the bus stop sign, just inside the gate (the way home)
  spawn: { x: 0, z: 22 },
  plaza: { x: 0, z: 4, r: 7 },
  carousel: { x: -12.5, z: 7, r: 4.2 },
  wheel: { x: 15, z: -4, R: 8, hub: 9.6 },
  helter: { x: -17, z: -8, r: 1.45, R: 2.75, H: 8.4, turns: 2.25 },
  dodgems: { x: 13.5, z: 14.5, w: 12, d: 9 },
  station: { x: -2, z: -13, len: 11 },         // the coaster's station runs along x, the platform on its south side
  // The Wiggly Woof: a closed loop (x, y, z), starting at the station and going east, up the lift hill.
  track: [
    [-6, 1.2, -13], [-1, 1.2, -13], [4, 1.25, -13], [8.5, 2.6, -13.2], [12.5, 6.2, -14], [15.5, 8.4, -16.2],
    [17.8, 6.0, -19.5], [19.5, 1.6, -23.5], [18.2, 1.8, -27.5], [13.5, 4.6, -29], [8, 5.6, -28.6], [3, 3.2, -27.4],
    [-2, 1.4, -26.2], [-7, 3.6, -25.6], [-12.5, 4.6, -27.4], [-18.5, 3.0, -28.4], [-23.5, 2.2, -24.6], [-24, 3.2, -19.5],
    [-20.5, 2.4, -16.0], [-14.5, 1.6, -14.4], [-10, 1.25, -13.2],
  ],
  stalls: [
    { x: 6.5, z: 9, face: -Math.PI / 2, name: 'Candy floss', c: 0xf2a0c8, sign: 0xffffff },
    { x: -6.8, z: -1.5, face: Math.PI / 2, name: 'Ice creams', c: 0x8fd0e0, sign: 0xfff1a0 },
    { x: -6.5, z: 16, face: Math.PI / 2, name: 'Popcorn', c: 0xf2c94c, sign: 0xd9534f },
  ],
};

const RB = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);

function add(g, geo, color, pos, { rot = [0, 0, 0], scale = null, cast = true, opts, occluder = false, season } = {}) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (occluder) m.userData.occluder = true;
  if (season) m.userData.season = season;
  g.add(m);
  return m;
}

/** A string of bunting between two points, drooping in the middle: little triangle flags in many colours. */
function bunting(g, a, b, colors = [0xd9534f, 0xf2c94c, 0x5b86c4, 0x6f9a52, 0xf2a0c8, 0xffffff]) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B), n = Math.max(3, Math.round(len / 0.55));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, p = A.clone().lerp(B, t); p.y -= Math.sin(t * Math.PI) * len * 0.08; pts.push(p); }
  const line = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.012, 4, false);
  add(g, line, 0xf3ead8, [0, 0, 0], { cast: false });
  const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.14, 0, 0), new THREE.Vector3(0.14, 0, 0), new THREE.Vector3(0, -0.3, 0)]);
  flag.setIndex([0, 2, 1, 0, 1, 2]);
  flag.computeVertexNormals();
  const dir = B.clone().sub(A).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z) - Math.PI / 2;
  for (let i = 1; i < n; i++) add(g, flag, colors[i % colors.length], pts[i].toArray(), { rot: [0, yaw, 0], cast: false, opts: { side: THREE.DoubleSide } });
}

/** A lamp post with a round glowing lamp. */
function lamp(g, x, z) {
  add(g, new THREE.CylinderGeometry(0.06, 0.09, 3, 10), 0x2f3a52, [x, 1.5, z]);
  add(g, new THREE.SphereGeometry(0.22, 16, 12), 0xfff1c0, [x, 3.15, z], { cast: false, opts: { emissive: 0x8a7a40 } });
  add(g, new THREE.CylinderGeometry(0.12, 0.2, 0.12, 12), 0x2f3a52, [x, 3.0, z]);
}

/** A striped stall with a counter, an awning, and a sign on top. */
function stall(g, s, C) {
  const grp = new THREE.Group();
  grp.position.set(s.x, 0, s.z);
  grp.rotation.y = s.face;
  g.add(grp);
  add(grp, RB(2.6, 1.0, 1.4, 0.06), 0xf7f3ea, [0, 0.5, 0]);
  add(grp, RB(2.8, 0.1, 1.6, 0.04), s.c, [0, 1.05, 0.05]);
  for (const sx of [-1.25, 1.25]) add(grp, new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), 0xf7f3ea, [sx, 1.8, -0.55]);
  add(grp, RB(2.7, 0.08, 1.2, 0.03), 0xf7f3ea, [0, 2.55, 0.05]);
  // The awning: stripes, sloping out over the counter.
  for (let k = 0; k < 7; k++) add(grp, new THREE.BoxGeometry(0.4, 0.04, 1.4), k % 2 ? 0xffffff : s.c, [-1.2 + k * 0.4, 2.45, 0.55], { rot: [0.35, 0, 0], cast: k === 3 });
  add(grp, RB(1.8, 0.5, 0.08, 0.04), s.sign, [0, 2.95, -0.1]);
  add(grp, new THREE.CircleGeometry(0.16, 16), s.c, [-0.6, 2.95, -0.05], { cast: false });
  add(grp, new THREE.CircleGeometry(0.16, 16), s.c, [0.6, 2.95, -0.05], { cast: false });
  // What's for sale: little puffs on sticks.
  for (let k = 0; k < 4; k++) {
    add(grp, new THREE.CylinderGeometry(0.012, 0.012, 0.35, 5), 0xf3ead8, [-0.7 + k * 0.45, 1.25, 0.35]);
    add(grp, blobGeometry(k + 3, 0.2, 1), s.c, [-0.7 + k * 0.45, 1.5, 0.35], { scale: [0.16, 0.16, 0.16], cast: false });
  }
  const c = Math.cos(s.face), sn = Math.sin(s.face), hw = 1.4, hd = 0.8, ex = Math.abs(c) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(c) * hd;
  C.box(s.x - ex, s.z - ez, s.x + ex, s.z + ez, 1.1);
}

export function buildFair(origin) {
  const { group: g, C, W, R, col, ox, oz } = tripWorld(origin);
  g.userData.season = 'world';
  const P = PLAN, GRASS = PALETTE.grass ?? 0x8dbb6a, PATH = 0xe6d6b4;

  // ---- the ground: grass, the avenue, the plaza, and paths out to each ride ----
  add(g, new THREE.PlaneGeometry(180, 180), GRASS, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'plant' });
  const path = (x0, z0, x1, z1, w) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    add(g, new THREE.PlaneGeometry(w, len + w * 0.5), PATH, [(x0 + x1) / 2, 0.006, (z0 + z1) / 2], { rot: [-Math.PI / 2, 0, Math.atan2(x1 - x0, z1 - z0)], cast: false, season: 'road' });
  };
  path(0, P.Z1, 0, P.plaza.z, 4.2);
  add(g, new THREE.CircleGeometry(P.plaza.r, 48), PATH, [P.plaza.x, 0.007, P.plaza.z], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'road' });
  path(0, P.plaza.z, P.station.x, P.station.z + 1.5, 3.2);
  path(0, P.plaza.z, P.carousel.x, P.carousel.z, 3);
  path(0, P.plaza.z, P.wheel.x, P.wheel.z + 2, 3);
  path(P.carousel.x, P.carousel.z, P.helter.x, P.helter.z + 2.5, 2.6);
  path(0, 16, P.dodgems.x - 1, P.dodgems.z + P.dodgems.d / 2 + 1, 2.8);
  path(-P.X + 2, -18, P.X - 2, -18, 2.4); // (round behind the big rides)
  add(g, new THREE.CircleGeometry(P.carousel.r + 1.6, 40), PATH, [P.carousel.x, 0.008, P.carousel.z], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'road' });

  // ---- the fountain in the plaza ----
  {
    const f = P.plaza;
    add(g, new THREE.CylinderGeometry(2.2, 2.35, 0.5, 40), 0xd8cfc0, [f.x, 0.25, f.z]);
    add(g, new THREE.CylinderGeometry(1.95, 1.95, 0.05, 40), 0x8fc4d8, [f.x, 0.42, f.z], { cast: false, opts: { emissive: 0x10303a } });
    add(g, new THREE.CylinderGeometry(0.3, 0.45, 1.2, 16), 0xd8cfc0, [f.x, 0.95, f.z]);
    add(g, new THREE.CylinderGeometry(0.9, 0.7, 0.18, 24), 0xd8cfc0, [f.x, 1.6, f.z]);
    add(g, new THREE.SphereGeometry(0.22, 14, 10), 0xd8cfc0, [f.x, 1.85, f.z]);
    C.circle(f.x, f.z, 2.35, 0.5);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; lamp(g, f.x + Math.cos(a) * (f.r - 0.4), f.z + Math.sin(a) * (f.r - 0.4)); C.circle(f.x + Math.cos(a) * (f.r - 0.4), f.z + Math.sin(a) * (f.r - 0.4), 0.12); }
  }

  // ---- the fence all round, and the gate with its arch ----
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), f = new THREE.Group();
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    f.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    g.add(f);
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 2) add(f, new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), 0x2f6a5a, [0, 0.65, s]);
    for (const y of [0.4, 1.1]) add(f, new THREE.BoxGeometry(0.05, 0.06, len), 0x2f6a5a, [0, y, 0], { cast: false });
    for (let s = -len / 2 + 0.25; s < len / 2; s += 0.25) add(f, new THREE.BoxGeometry(0.025, 0.7, 0.025), 0x3f7a6a, [0, 0.75, s], { cast: false });
    C.box(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12, 1.3, false);
  };
  const gw = P.gate.w / 2;
  fence(-P.X, P.Z0, P.X, P.Z0); fence(-P.X, P.Z0, -P.X, P.Z1); fence(P.X, P.Z0, P.X, P.Z1);
  fence(-P.X, P.Z1, -gw, P.Z1); fence(gw, P.Z1, P.X, P.Z1);
  C.box(-gw, P.Z1 - 0.1, gw, P.Z1 + 0.3, Infinity, false); // (out through the gate is on the bus, not on foot)
  // The arch: two striped towers and a sign, "Wagtail Wonderland", with a big paw.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 8; k++) add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.6, 20), k % 2 ? 0xffffff : 0xd9534f, [s * (gw + 0.4), 0.3 + k * 0.6, P.Z1], { occluder: k === 4 });
    add(g, new THREE.ConeGeometry(0.6, 1.2, 20), 0x5b86c4, [s * (gw + 0.4), 5.4, P.Z1]);
    add(g, new THREE.SphereGeometry(0.12, 10, 8), 0xf2c94c, [s * (gw + 0.4), 6.1, P.Z1]);
    C.circle(s * (gw + 0.4), P.Z1, 0.45);
  }
  add(g, RB(P.gate.w + 1.4, 1.0, 0.2, 0.1), 0xf2c94c, [0, 4.2, P.Z1]);
  add(g, RB(P.gate.w + 1.0, 0.7, 0.24, 0.08), 0xfffaf0, [0, 4.2, P.Z1]);
  for (let k = 0; k < 4; k++) add(g, new THREE.CircleGeometry(0.11, 12), 0xd9534f, [-1.5 + k * 1.0 + (k % 2) * 0.2, 4.2 + (k % 2) * 0.1, P.Z1 - 0.13], { rot: [0, Math.PI, 0], cast: false });
  bunting(g, [-gw - 0.4, 4.9, P.Z1], [gw + 0.4, 4.9, P.Z1]);
  // The bus stop, just inside: a sign on a pole and a bench.
  {
    const s = P.stop;
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), 0x7a7f88, [s.x, 1.2, s.z]);
    add(g, new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20), 0xd9534f, [s.x, 2.3, s.z], { rot: [Math.PI / 2, 0, 0] });
    add(g, new THREE.CircleGeometry(0.24, 18), 0xffffff, [s.x, 2.3, s.z - 0.035], { rot: [0, Math.PI, 0], cast: false });
    add(g, RB(1.6, 0.08, 0.45, 0.03), 0x8a5a3a, [s.x - 1.4, 0.45, s.z + 0.3]);
    for (const sx of [-0.65, 0.65]) add(g, new THREE.BoxGeometry(0.06, 0.45, 0.4), 0x5a5f68, [s.x - 1.4 + sx, 0.22, s.z + 0.3]);
    C.circle(s.x, s.z, 0.1);
  }

  // ---- stalls, benches, bins, balloons ----
  for (const s of P.stalls) stall(g, s, C);
  for (const [x, z, r] of [[3.5, 18, 0], [-3.5, 12, 0], [9, -1, Math.PI / 2], [-9, 1.5, Math.PI / 2]]) {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = r; g.add(b);
    add(b, RB(1.6, 0.08, 0.45, 0.03), 0x8a5a3a, [0, 0.45, 0]);
    add(b, RB(1.6, 0.4, 0.06, 0.03), 0x8a5a3a, [0, 0.72, -0.22]);
    for (const sx of [-0.65, 0.65]) add(b, new THREE.BoxGeometry(0.06, 0.45, 0.4), 0x2f3a52, [sx, 0.22, 0]);
    C.box(x - (r ? 0.3 : 0.85), z - (r ? 0.85 : 0.3), x + (r ? 0.3 : 0.85), z + (r ? 0.85 : 0.3), 0.5);
  }
  for (const [x, z] of [[2.6, 14], [-2.6, 21], [7.5, 2]]) { add(g, new THREE.CylinderGeometry(0.28, 0.24, 0.8, 14), 0x6f9a52, [x, 0.4, z]); C.circle(x, z, 0.3, 0.8); }
  // A bunch of balloons tied to the popcorn stall.
  {
    const s = P.stalls[2];
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9, top = new THREE.Vector3(s.x + 1.6 + Math.cos(a) * 0.35, 3.3 + (k % 3) * 0.3, s.z + 1.3 + Math.sin(a) * 0.35);
      const line = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(s.x + 1.6, 1.0, s.z + 1.3), top), 1, 0.006, 3);
      add(g, line, 0xf3ead8, [0, 0, 0], { cast: false });
      add(g, new THREE.SphereGeometry(0.24, 14, 10), [0xd9534f, 0xf2c94c, 0x5b86c4, 0xf2a0c8, 0x6f9a52, 0xb69be0, 0xe8743c][k], top.toArray(), { scale: [1, 1.18, 1] });
    }
  }
  // Bunting from lamp to lamp along the avenue, and across the plaza.
  for (const z of [10, 16, 22]) bunting(g, [-2.4, 3.1, z], [2.4, 3.1, z]);
  for (const z of [10, 16, 22]) for (const s of [-1, 1]) { lamp(g, s * 2.4, z); C.circle(s * 2.4, z, 0.12); }
  bunting(g, [-6.3, 3.1, P.plaza.z - 3], [6.3, 3.1, P.plaza.z + 3]);
  bunting(g, [-6.3, 3.1, P.plaza.z + 3], [6.3, 3.1, P.plaza.z - 3]);

  // ---- trees and hedges round the edge (inside the fence and out beyond it) ----
  const tree = (x, z, s, k) => {
    add(g, new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 8), PALETTE.bark ?? 0x7a5a3e, [x, 0.8 * s, z], { cast: false });
    add(g, blobGeometry(k, 0.3, 2), k % 2 ? 0x6f9a52 : 0x5f8f4a, [x, 2.1 * s, z], { scale: [1.5 * s, 1.3 * s, 1.5 * s], season: 'foliage' });
  };
  for (let k = 0; k < 18; k++) {
    const t = k / 18, side = k % 3;
    const [x, z] = side === 0 ? [-P.X + 1.6, P.Z0 + 6 + t * 50] : side === 1 ? [P.X - 1.6, P.Z0 + 4 + t * 52] : [-P.X + 6 + t * 50, P.Z1 - 1.8];
    if (Math.abs(x) < 6 && z > P.Z1 - 4) continue; // (not by the gate)
    if (x > 6 && x < 21 && z > 8 && z < 21) continue; // (not in the dodgems)
    tree(x, z, 0.9 + (k % 3) * 0.15, k);
    C.circle(x, z, 0.28);
  }
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2, r = 42 + (k % 4) * 5, x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r;
    tree(x, z, 1.3 + (k % 3) * 0.3, k + 50);
  }

  const occluders = collectOccluders(g);
  const scene = new THREE.Scene();
  scene.add(mergeStatic(g));
  const sky = skyDome();
  scene.add(sky);
  const dyn = new THREE.Group();
  dyn.position.set(ox, 0, oz);
  scene.add(dyn);
  const world = {
    group: g, colliders: col, water: [], gardens: [], beds: [], bins: [],
    bounds: R(-P.X + 0.4, P.Z0 + 0.4, P.X - 0.4, P.Z1 - 0.4),
    occluders,
    camera: { distMax: 12 },
    W, R, C,
  };
  return { scene, world, dyn, sky, occluders };
}
