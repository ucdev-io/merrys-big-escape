import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry, skyDome } from '../../world/props.js';
import { PALETTE } from '../../render/palette.js';
import { tripWorld } from '../kit.js';

/*
 * 🏠 Sunny Paws, the rescue centre: a grassy yard inside a tall fence, a row of pens along the kennel block,
 * Doug's desk in the corner (the keys on a stool beside it), and plenty of places for a small dog to hide.
 * Its own coordinates (0, 0 is the middle of the yard):
 *
 *        ┌────────────── kennel block (yellow) ──────────────┐
 *        │  pen 0   │  pen 1  │  pen 2  │  pen 3  │  pen 4    │  (yours is pen 0; the others have dogs in)
 *        ├──gate────┴──gate───┴──gate───┴──gate───┴──gate─────┤  z = 3
 *        │   doghouse        tunnel        crates     basket   │
 *        │ bushes (soft earth by the fence!)   bench     desk 🔑│
 *        └──────────────────── big locked gate ────────────────┘  z = −9
 */

export const Y = {
  X: 12, Z: 9,                       // the yard: |x| < X, |z| < Z
  PEN: { z0: 3, z1: 6.4, w: 4, n: 5, gate: 0.8 }, // pens: x = −8 + 4i, gate half-width
  desk: { x: 7.5, z: -7.6 },         // Doug stands at desk.z + 0.9, facing the desk (busy) or the yard (looking)
  keys: { x: 9.6, z: -6.9 },         // on a stool
  dig: { x: -11.15, z: -6.9 },       // the soft earth, behind the bushes
  hides: [                           // where Doug can't see a small dog
    { kind: 'rect', x0: -4.9, z0: -2.0, x1: -1.7, z1: -1.0, name: 'in the tunnel' },
    { kind: 'circle', x: -10.4, z: -6.5, r: 1.6, name: 'in the bushes' },
    { kind: 'circle', x: 2.9, z: -0.2, r: 1.15, name: 'behind the crates' },
    { kind: 'rect', x0: -7.6, z0: -6.1, x1: -6.4, z1: -4.9, name: 'in the doghouse' },
    { kind: 'circle', x: 6.6, z: 1.2, r: 0.9, name: 'in the blanket basket' },
    { kind: 'rect', x0: -2.4, z0: -6.6, x1: -0.6, z1: -5.8, name: 'under the bench' },
  ],
};
export const penX = (i) => -8 + i * Y.PEN.w;

const SUN = 0xf2c94c, WALL = 0xf3dc8a, ROOF = 0xc8695a, WOOD = 0xb08a64, WIRE = 0x8c8f93, GRASS = PALETTE.grass ?? 0x8dbb6a;

function add(g, geo, color, pos, { rot = [0, 0, 0], cast = true, opts, occluder = false, season } = {}) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (occluder) m.userData.occluder = true;
  if (season) m.userData.season = season;
  g.add(m);
  return m;
}
const box = (g, w, h, d, color, x, y, z, o) => add(g, new THREE.BoxGeometry(w, h, d), color, [x, y, z], o);

/** A run of wire fencing (posts and a mesh of thin wires) from (x0, z0) to (x1, z1), h tall. */
function wireFence(g, x0, z0, x1, z1, h = 1.5) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), f = new THREE.Group();
  f.position.set(x0, 0, z0);
  f.rotation.y = ang;
  g.add(f);
  const posts = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) box(f, 0.08, h + 0.1, 0.08, 0x6b6964, 0, (h + 0.1) / 2, (i / posts) * len);
  for (let k = 1; k <= 5; k++) box(f, 0.02, 0.02, len, WIRE, 0, (k / 5.4) * h, len / 2, { cast: false });
  for (let s = 0.25; s < len; s += 0.25) box(f, 0.015, h, 0.015, WIRE, 0, h / 2, s, { cast: false });
}

export function buildPound(origin) {
  const { group: g, C, W, R, col } = tripWorld(origin);
  const { X, Z, PEN } = Y;
  g.userData.season = 'world';

  // ---- the ground: the yard's grass, a path, and the countryside beyond the fence ----
  add(g, new THREE.PlaneGeometry(90, 90), GRASS, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], season: 'plant' });
  add(g, new THREE.PlaneGeometry(2.2, 12), 0xd8c8a8, [0, 0.006, -3], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'road' });
  add(g, new THREE.PlaneGeometry(20, 1.4), 0xd8c8a8, [0, 0.007, 2.2], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'road' });

  // ---- the tall fence all round (no jumping this one) ----
  const NZ = PEN.z1 + 0.2; // (the yard's back fence, behind the pens)
  const fence = (x0, z0, x1, z1, h = 2.1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), f = new THREE.Group();
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    f.rotation.y = ang;
    g.add(f);
    for (let s = -len / 2 + 0.12; s < len / 2; s += 0.26) box(f, 0.06, h, 0.22, s % 0.52 < 0.26 ? WOOD : 0xa47e58, 0, h / 2, s);
    for (const y of [0.4, h - 0.45]) box(f, 0.05, 0.1, len, 0x8f6c4c, -0.06, y, 0, { cast: false });
    C.box(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12);
  };
  fence(-X, -Z, -X, NZ); fence(X, -Z, X, NZ);
  fence(-X, NZ, X, NZ, 0.9); // (low at the back, so the camera can look over it into the pens)
  fence(-X, -Z, -2.2, -Z); fence(2.2, -Z, X, -Z);
  // The big gate (locked tight), with a padlock.
  for (const s of [-1, 1]) {
    const gate = new THREE.Group();
    gate.position.set(s * 1.1, 0, -Z);
    g.add(gate);
    box(gate, 2.15, 0.1, 0.08, 0x4a5a6a, 0, 0.4, 0); box(gate, 2.15, 0.1, 0.08, 0x4a5a6a, 0, 2.0, 0);
    for (let k = -4; k <= 4; k++) box(gate, 0.05, 1.7, 0.05, 0x4a5a6a, k * 0.24, 1.2, 0, { cast: false });
  }
  box(g, 0.22, 0.28, 0.1, 0xc9a24a, 0, 1.2, -Z - 0.1);
  C.box(-2.2, -Z - 0.15, 2.2, -Z + 0.15);

  // ---- the kennel block: a sunny yellow building with a red roof and a sign, out past the back fence ----
  // (Well back: nothing tall in the yard to get between the camera and the dog.)
  const B0 = 14.5, B1 = 18.5;
  box(g, 2 * X + 0.4, 2.4, B1 - B0, WALL, 0, 1.2, (B0 + B1) / 2);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.4, 2 * X + 1, 3, 1), paint(ROOF));
  roof.rotation.set(0, 0, Math.PI / 2); roof.scale.set(1, 1, 0.75);
  roof.position.set(0, 3.1, (B0 + B1) / 2);
  roof.castShadow = true;
  g.add(roof);
  // A path from its door to the yard's back fence, and flower tubs.
  add(g, new THREE.PlaneGeometry(2, B0 - NZ), 0xd8c8a8, [0, 0.006, (B0 + NZ) / 2], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'road' });
  box(g, 1.2, 2, 0.08, 0x8a5a3a, 0, 1, B0 - 0.05, { cast: false });
  for (const s of [-1, 1]) { add(g, new THREE.CylinderGeometry(0.4, 0.32, 0.5, 12), 0xc8695a, [s * 2.2, 0.25, B0 - 0.6]); add(g, blobGeometry(7 + s, 0.3, 1), 0xd96a8a, [s * 2.2, 0.65, B0 - 0.6], { season: 'plant' }).scale.set(0.45, 0.3, 0.45); }
  // The sign: a big smiling sun with paw prints.
  box(g, 5.5, 1.1, 0.08, 0xfbf6ec, 0, 3.0, B0 - 0.05, { cast: false });
  add(g, new THREE.CircleGeometry(0.38, 20), SUN, [-1.9, 3.0, B0 - 0.1], { rot: [0, Math.PI, 0], cast: false });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(g, new THREE.CircleGeometry(0.08, 8), SUN, [-1.9 + Math.cos(a) * 0.5, 3.0 + Math.sin(a) * 0.5, B0 - 0.1], { rot: [0, Math.PI, 0], cast: false }); }
  for (let k = 0; k < 4; k++) add(g, new THREE.CircleGeometry(0.16, 12), 0x8a6a4a, [-0.6 + k * 0.85, 3.0 + (k % 2) * 0.12, B0 - 0.1], { rot: [0, Math.PI, 0], cast: false });

  // ---- the pens: wire fences between them, a gate each (built by the chapter: they open), a bed and a bowl ----
  for (let i = 0; i <= PEN.n; i++) { const x = -10 + i * PEN.w; wireFence(g, x, PEN.z0, x, PEN.z1); C.box(x - 0.08, PEN.z0 - 0.05, x + 0.08, PEN.z1); }
  for (let i = 0; i < PEN.n; i++) {
    const cx = penX(i);
    wireFence(g, cx - 2, PEN.z0, cx - PEN.gate, PEN.z0); C.box(cx - 2, PEN.z0 - 0.08, cx - PEN.gate, PEN.z0 + 0.08);
    wireFence(g, cx + PEN.gate, PEN.z0, cx + 2, PEN.z0); C.box(cx + PEN.gate, PEN.z0 - 0.08, cx + 2, PEN.z0 + 0.08);
    add(g, new THREE.PlaneGeometry(3.8, 3.3), 0xc9bba2, [cx, 0.004, (PEN.z0 + PEN.z1) / 2], { rot: [-Math.PI / 2, 0, 0], cast: false }); // (the pen's floor)
    const bed = add(g, new THREE.CylinderGeometry(0.62, 0.66, 0.16, 18), [0x7b5ea7, 0xd9534f, 0x5b86c4, 0x6f9a52, 0xe39a52][i], [cx + 0.7, 0.08, 5.4]);
    bed.castShadow = false;
    add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.06, 18), 0xf3ead8, [cx + 0.7, 0.17, 5.4], { cast: false });
    add(g, new THREE.CylinderGeometry(0.16, 0.13, 0.08, 14), 0x5b86c4, [cx - 1.2, 0.04, 5.6], { cast: false });
  }
  // The ends beyond the pens: planters.
  for (const s of [-1, 1]) { box(g, 1.8, 0.5, 3.2, 0x9a7452, s * 11, 0.25, 4.7); add(g, blobGeometry(3 + s, 0.3, 1), 0x6f9a52, [s * 11, 0.7, 4.7], { cast: true }).scale.set(0.9, 0.5, 1.5); C.box(s * 11 - 0.9, 3, s * 11 + 0.9, 6.4, 0.5); }

  // ---- hiding places ----
  // The agility tunnel (walk right through it).
  {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 16, 1, true), paint(0x5b86c4, { side: THREE.DoubleSide }));
    t.rotation.z = Math.PI / 2;
    t.position.set(-3.3, 0.5, -1.5);
    t.castShadow = true;
    g.add(t);
    for (let k = 0; k <= 6; k++) add(g, new THREE.TorusGeometry(0.56, 0.03, 6, 16), 0xf2c94c, [-4.9 + k * (3.2 / 6), 0.5, -1.5], { rot: [0, Math.PI / 2, 0], cast: false });
    C.box(-4.95, -2.15, -1.65, -2.05, 1.1); C.box(-4.95, -0.95, -1.65, -0.85, 1.1); // (its sides)
  }
  // Bushes by the west fence (and the soft earth behind them: see the chapter).
  for (const [x, z, s] of [[-10.0, -5.3, 1.0], [-9.5, -6.8, 0.9], [-10.6, -8.0, 0.8], [-11.2, -5.4, 0.7]]) add(g, blobGeometry(Math.round(x * 3), 0.3, 2), 0x5f8f4a, [x, 0.55 * s, z], { season: 'foliage' }).scale.set(s, 0.75 * s, s);
  add(g, new THREE.CircleGeometry(0.75, 16), 0x7a5a3e, [Y.dig.x + 0.15, 0.01, Y.dig.z], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'none' }); // the soft earth
  // A stack of crates.
  for (const [x, y, z, r] of [[2.6, 0.3, -0.9, 0.1], [3.3, 0.3, -1.0, -0.2], [2.95, 0.9, -0.95, 0.3]]) box(g, 0.62, 0.6, 0.62, 0xa8784e, x, y, z, { rot: [0, r, 0] });
  C.box(2.2, -1.35, 3.7, -0.55, 1.2);
  // The doghouse (pop inside).
  {
    const dh = new THREE.Group();
    dh.position.set(-7, 0, -5.5);
    g.add(dh);
    box(dh, 1.3, 0.9, 0.08, 0xd9534f, 0, 0.45, -0.6); // back
    for (const s of [-1, 1]) box(dh, 0.08, 0.9, 1.2, 0xd9534f, s * 0.62, 0.45, 0);
    for (const s of [-1, 1]) box(dh, 0.4, 0.9, 0.08, 0xd9534f, s * 0.45, 0.45, 0.6); // the front, either side of the door
    for (const s of [-1, 1]) box(dh, 0.95, 0.07, 1.4, 0x6b4a3a, s * 0.38, 1.12, 0, { rot: [0, 0, -s * 0.7] });
    C.box(-7.7, -6.2, -6.3, -6.05); C.box(-7.7, -6.1, -7.55, -4.9); C.box(-6.45, -6.1, -6.3, -4.9);
  }
  // The blanket basket.
  add(g, new THREE.CylinderGeometry(0.85, 0.7, 0.45, 18, 1, true), 0xc8a26a, [6.6, 0.22, 1.2], { opts: { side: THREE.DoubleSide } });
  add(g, blobGeometry(12, 0.35, 1), 0xb7a8d8, [6.6, 0.3, 1.2], { cast: false }).scale.set(0.75, 0.15, 0.75);
  // The picnic bench (squeeze underneath).
  box(g, 1.9, 0.08, 0.9, WOOD, -1.5, 0.75, -6.2);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.35, 0.35]) box(g, 0.08, 0.75, 0.08, 0x8f6c4c, -1.5 + sx, 0.37, -6.2 + sz);
  for (const s of [-1, 1]) box(g, 1.9, 0.06, 0.3, WOOD, -1.5, 0.42, -6.2 + s * 0.75);
  C.box(-2.45, -7.05, -0.55, -6.9, 0.45); C.box(-2.45, -5.5, -0.55, -5.35, 0.45);

  // ---- Doug's corner: a desk with a mug and a pile of forms, a chair, the keys' stool, a water bowl ----
  const d = Y.desk;
  box(g, 1.8, 0.08, 0.8, WOOD, d.x, 0.78, d.z);
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.32, 0.32]) box(g, 0.07, 0.78, 0.07, 0x8f6c4c, d.x + sx, 0.39, d.z + sz);
  box(g, 0.4, 0.06, 0.3, 0xfbf6ec, d.x - 0.3, 0.85, d.z); box(g, 0.38, 0.03, 0.28, 0xf3ead8, d.x - 0.32, 0.9, d.z + 0.02);
  add(g, new THREE.CylinderGeometry(0.05, 0.045, 0.11, 12), 0xd9534f, [d.x + 0.45, 0.88, d.z - 0.1]);
  C.box(d.x - 0.95, d.z - 0.45, d.x + 0.95, d.z + 0.45, 0.82);
  add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.42, 12), 0x8f6c4c, [Y.keys.x, 0.21, Y.keys.z]); // the stool
  C.circle(Y.keys.x, Y.keys.z, 0.24, 0.42);
  add(g, new THREE.CylinderGeometry(0.2, 0.16, 0.09, 16), 0x5b86c4, [4.5, 0.045, -7.6], { cast: false });
  // Toys about the yard.
  add(g, new THREE.SphereGeometry(0.1, 12, 9), 0xd9534f, [0.8, 0.1, -3.4]);
  add(g, new THREE.TorusGeometry(0.16, 0.05, 8, 16), 0x6f9a52, [-5.4, 0.05, 1.0], { rot: [Math.PI / 2, 0, 0] });

  // ---- out beyond the fence: a hedge and trees, so it doesn't stop at nothing ----
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2, r = 17 + (k % 3) * 3;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
    if (Math.abs(x) < 14 && z > 12) continue; // (not in the kennel block)
    add(g, blobGeometry(k, 0.3, 1), k % 2 ? 0x6f9a52 : 0x5f8f4a, [x, 1.4, z], { season: 'foliage' }).scale.set(2.2, 1.8, 2.2);
    box(g, 0.25, 1.4, 0.25, 0x7a5a3e, x, 0.7, z, { cast: false });
  }

  const occluders = collectOccluders(g);
  const scene = new THREE.Scene();
  scene.add(mergeStatic(g));
  const sky = skyDome();
  scene.add(sky);
  const dyn = new THREE.Group();
  dyn.position.set(origin.x, 0, origin.z);
  scene.add(dyn);
  const world = {
    group: g, colliders: col, water: [], gardens: [], beds: [], bins: [],
    bounds: R(-X + 0.3, -Z + 0.3, X - 0.3, Z - 0.3),
    occluders,
    camera: { pitchMin: 0.62, distMax: 10 },
    W, R, C,
  };
  return { scene, world, dyn, sky };
}
