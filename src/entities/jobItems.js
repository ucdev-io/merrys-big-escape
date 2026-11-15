import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CARRYABLES } from './carryables.js';
import { SPHERE, bake, bakedMat, profileTube } from './shapes.js';

/*
 * More things to carry, for the 📋 Lost & Found jobs (see game/town/jobs/): parcels and letters to
 * deliver, kites and balloons stuck up high, Granny's knitting that Pickles ran off with… Same shape
 * as carryables.js (build() lying on the ground at y = 0; hold = where it sits in the mouth), and
 * added to CARRYABLES so they work everywhere a carryable does (including friends' screens).
 * Each model is baked into a single mesh: cheap to draw, however many are about.
 */

const RB = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, r);
const CYL = (r0, r1, h, n = 16) => new THREE.CylinderGeometry(r0, r1, h, n);
const TOR = (r, t, n = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 8, n, arc);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// Lawns and pavements are a few centimetres thick, and things are put down at ground level: lift the
// models a little so even flat ones (letters, keys) sit on top of the grass, not hidden in it.
const LIFT = 0.04;

/** One baked mesh in a group (the carry system moves, hides and scales the group). */
function item(parts, lift = LIFT) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(bake(parts), bakedMat());
  m.position.y = lift;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/** A flat shape with a little thickness (kites, sails, flaps): points in x/y, extruded along z. */
function slab(points, depth = 0.008) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function parcel() {
  const brown = 0xc9a26a, string = 0xf3ead6;
  return item([
    [RB(0.22, 0.15, 0.17, 0.022), brown, [0, 0.075, 0]],
    [RB(0.228, 0.156, 0.016, 0.006), string, [0, 0.075, 0]],
    [RB(0.016, 0.156, 0.178, 0.006), string, [0, 0.075, 0]],
    [TOR(0.024, 0.0055), string, [0, 0.172, 0]],                              // a loop to carry it by
    [RB(0.075, 0.004, 0.05, 0.002), 0xfbf6ec, [0.055, 0.151, 0.045]],          // the address label
    [RB(0.045, 0.004, 0.008, 0.002), 0x5b86c4, [0.055, 0.153, 0.04]],
  ]);
}

function letter() {
  return item([
    [RB(0.2, 0.012, 0.13, 0.004), 0xfbf6ec, [0, 0.006, 0]],
    [slab([[-0.1, 0], [0.1, 0], [0, -0.07]], 0.003), 0xeadcc0, [0, 0.0135, -0.064], [-Math.PI / 2, 0, 0]], // the flap
    [SPHERE, 0xd9534f, [-0.008, 0.015, 0.006], [0, 0, 0], [0.013, 0.004, 0.013]],  // a heart-shaped seal
    [SPHERE, 0xd9534f, [0.008, 0.015, 0.006], [0, 0, 0], [0.013, 0.004, 0.013]],
    [new THREE.ConeGeometry(0.016, 0.02, 12), 0xd9534f, [0, 0.015, 0.018], [-Math.PI / 2, 0, 0], [1, 1, 0.3]],
    [RB(0.03, 0.003, 0.036, 0.002), 0x6f9a52, [0.07, 0.013, -0.04]],              // a stamp
  ]);
}

function cake() {
  const pink = 0xf2a0b4;
  return item([
    [RB(0.2, 0.13, 0.2, 0.02), 0xfbf6ec, [0, 0.065, 0]],
    [RB(0.206, 0.134, 0.022, 0.006), pink, [0, 0.065, 0]],
    [RB(0.022, 0.134, 0.206, 0.006), pink, [0, 0.065, 0]],
    [SPHERE, pink, [-0.03, 0.142, 0], [0, 0, 0.5], [0.032, 0.016, 0.02]],      // a big bow on top
    [SPHERE, pink, [0.03, 0.142, 0], [0, 0, -0.5], [0.032, 0.016, 0.02]],
    [SPHERE, 0xe58aa0, [0, 0.142, 0], [0, 0, 0], [0.014, 0.014, 0.014]],
  ]);
}

function kite() {
  const a = pick([0xd9534f, 0x5b86c4, 0x8e6fb0]), b = 0xf6d06a;
  // Four panels from the middle of the frame, in two colours. Lying flat on the grass, nose forward.
  const C = [0, 0.09], T = [0, 0.39], R = [0.22, 0.09], B = [0, -0.26], L = [-0.22, 0.09];
  const tail = [[0, 0.004, 0.26], [0.06, 0.004, 0.38], [-0.04, 0.004, 0.52], [0.05, 0.004, 0.66]];
  const flat = [-Math.PI / 2, 0, 0];
  return item([
    [slab([C, T, R]), a, [0, 0.008, 0], flat], [slab([C, R, B]), b, [0, 0.008, 0], flat],
    [slab([C, B, L]), a, [0, 0.008, 0], flat], [slab([C, L, T]), b, [0, 0.008, 0], flat],
    [CYL(0.006, 0.006, 0.65, 6), 0x8a6346, [0, 0.016, -0.065], [Math.PI / 2, 0, 0]],  // the frame
    [CYL(0.006, 0.006, 0.44, 6), 0x8a6346, [0, 0.016, -0.09], [0, 0, Math.PI / 2]],
    [profileTube(tail, () => 0.003, 24, 5), 0xfbf6ec],                              // its tail…
    ...[0.38, 0.52, 0.66].flatMap((z, i) => [-1, 1].map((s) => [new THREE.ConeGeometry(0.022, 0.05, 8), i % 2 ? a : b, [tail[i + 1][0] + s * 0.022, 0.006, z], [0, 0, s * Math.PI / 2], [1, 1, 0.4]])), // …with bows
  ]);
}

function balloon() {
  const c = pick([0xd9534f, 0xf2a0b4, 0x5b86c4, 0x6f9a52, 0xf6d06a]);
  // The string's end is the bottom (that's what gets picked up); the balloon bobs above it.
  return item([
    [profileTube([[0, 0, 0], [0.02, 0.18, 0.01], [-0.015, 0.36, 0], [0, 0.5, 0]], () => 0.0025, 24, 5), 0xf6f1e8],
    [new THREE.ConeGeometry(0.018, 0.03, 10), c, [0, 0.505, 0]],
    [SPHERE, c, [0, 0.66, 0], [0, 0, 0], [0.12, 0.15, 0.12]],
    [SPHERE, 0xffffff, [-0.045, 0.72, 0.075], [0, 0, 0], [0.022, 0.03, 0.012]],      // a shiny glint
  ]);
}

function wool() {
  const c = pick([0xb69be0, 0xf2a0b4, 0x8fc4d8]), d = new THREE.Color(c).multiplyScalar(0.82).getHex();
  return item([
    [SPHERE, c, [0, 0.06, 0], [0, 0, 0], [0.06, 0.06, 0.06]],
    [TOR(0.0605, 0.004, 32), d, [0, 0.06, 0], [0.4, 0, 0]],
    [TOR(0.0605, 0.004, 32), d, [0, 0.06, 0], [1.3, 0.7, 0]],
    [TOR(0.0605, 0.004, 32), d, [0, 0.06, 0], [2.2, -0.5, 0.3]],
    [profileTube([[0.05, 0.03, 0.02], [0.1, 0.01, 0.05], [0.16, 0.006, 0.02], [0.2, 0.006, 0.07]], () => 0.004, 16, 5), c], // a loose end
    [CYL(0.004, 0.004, 0.24, 6), 0xd9c08a, [0, 0.09, 0], [0.3, 0, 1.1]],             // knitting needles
    [CYL(0.004, 0.004, 0.24, 6), 0xd9c08a, [0, 0.09, 0], [-0.3, 0, -1.2]],
    [SPHERE, 0xd9534f, [-0.103, 0.14, 0.035], [0, 0, 0], [0.011, 0.011, 0.011]],
    [SPHERE, 0xd9534f, [0.109, 0.144, 0.036], [0, 0, 0], [0.011, 0.011, 0.011]],
  ]);
}

function scarf() {
  const a = pick([0xd9534f, 0x6f9a52, 0x5b86c4]), b = 0xfbf6ec;
  const pts = [[-0.3, 0.012, 0.02], [-0.15, 0.012, -0.05], [0, 0.012, 0.03], [0.15, 0.012, -0.04], [0.3, 0.012, 0.02]];
  const stripes = (i, v) => (Math.floor((v.x + 0.4) / 0.07) % 2 ? a : b);
  return item([
    { geo: profileTube(pts, (t) => 0.026 * Math.min(1, t * 30, (1 - t) * 30), 40, 10), scale: [1, 0.45, 1], colors: stripes },
    ...[-1, 1].flatMap((s) => [-0.02, 0, 0.02].map((dz) => [CYL(0.004, 0.004, 0.05, 5), a, [s * 0.325, 0.008, 0.02 + dz], [0, 0, Math.PI / 2]])), // tassels
  ]);
}

function glove() {
  const check = (i, v) => ((Math.floor((v.x + 1) / 0.022) + Math.floor((v.z + 1) / 0.022)) % 2 ? 0xd9534f : 0xfbf6ec);
  return item([
    { geo: new THREE.CapsuleGeometry(0.045, 0.1, 6, 14), pos: [0, 0.025, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55], colors: check },
    { geo: new THREE.CapsuleGeometry(0.018, 0.05, 4, 10), pos: [0.05, 0.02, 0.01], rot: [Math.PI / 2, 0, -0.7], scale: [1, 1, 0.6], colors: check },
    [CYL(0.05, 0.05, 0.035, 18), 0xfbf6ec, [0, 0.025, -0.085], [Math.PI / 2, 0, 0], [1, 1, 0.55]],
    [TOR(0.012, 0.003), 0xd9534f, [0, 0.03, -0.112], [0, Math.PI / 2, 0]],          // a hanging loop
  ]);
}

function rubberDuck() {
  const y = 0xf6d65a;
  return item([
    [SPHERE, y, [0, 0.04, 0], [0, 0, 0], [0.05, 0.04, 0.062]],
    [SPHERE, y, [0, 0.085, 0.03], [0, 0, 0], [0.032, 0.032, 0.032]],
    [SPHERE, 0xf0a040, [0, 0.08, 0.063], [0, 0, 0], [0.018, 0.008, 0.016]],
    [new THREE.ConeGeometry(0.018, 0.04, 10), y, [0, 0.06, -0.062], [-1.0, 0, 0]],
    [SPHERE, 0x241a17, [0.016, 0.093, 0.052], [0, 0, 0], [0.005, 0.006, 0.005]],
    [SPHERE, 0x241a17, [-0.016, 0.093, 0.052], [0, 0, 0], [0.005, 0.006, 0.005]],
    [SPHERE, 0xeec64a, [0.045, 0.045, -0.005], [0, 0, 0], [0.012, 0.022, 0.04]],    // wings
    [SPHERE, 0xeec64a, [-0.045, 0.045, -0.005], [0, 0, 0], [0.012, 0.022, 0.04]],
  ]);
}

function boat() {
  return item([
    [new THREE.CapsuleGeometry(0.04, 0.13, 6, 14), 0xd9534f, [0, 0.032, 0], [Math.PI / 2, 0, 0], [1, 1, 0.75]],
    [RB(0.06, 0.012, 0.15, 0.005), 0xfbf6ec, [0, 0.058, 0]],
    [CYL(0.004, 0.004, 0.2, 6), 0x8a6346, [0, 0.16, 0.0]],
    [slab([[0, 0.02], [0, 0.17], [0.09, 0.02]], 0.004), 0xfbf6ec, [0.004, 0.07, 0.0], [0, Math.PI / 2, 0]],
    [slab([[0, 0.25], [0, 0.22], [-0.035, 0.235]], 0.003), 0x5b86c4, [0, 0.0, 0.0], [0, Math.PI / 2, 0]], // a flag
  ]);
}

function toyCar() {
  const c = pick([0x5b86c4, 0x6f9a52, 0xe39a52]);
  const wheels = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [CYL(0.02, 0.02, 0.016, 14), 0x2b2b2b, [sx * 0.04, 0.02, sz * 0.05], [0, 0, Math.PI / 2]]));
  return item([
    [RB(0.085, 0.035, 0.16, 0.014), c, [0, 0.035, 0]],
    [RB(0.07, 0.035, 0.075, 0.014), c, [0, 0.065, -0.01]],
    [RB(0.072, 0.024, 0.077, 0.008), 0x9ab8cf, [0, 0.067, -0.01]],
    [SPHERE, 0xfff2c8, [0.025, 0.04, 0.08], [0, 0, 0], [0.008, 0.008, 0.004]],
    [SPHERE, 0xfff2c8, [-0.025, 0.04, 0.08], [0, 0, 0], [0.008, 0.008, 0.004]],
    ...wheels,
  ]);
}

function sunHat() {
  return item([
    [CYL(0.17, 0.17, 0.01, 32), 0xe8cf8a, [0, 0.006, 0]],
    [SPHERE, 0xe8cf8a, [0, 0.008, 0], [0, 0, 0], [0.085, 0.075, 0.085]],
    [TOR(0.083, 0.011, 28), 0xf2a0b4, [0, 0.022, 0], [Math.PI / 2, 0, 0]],
    [SPHERE, 0xfbf6ec, [0.07, 0.035, 0.05], [0, 0, 0], [0.018, 0.018, 0.018]],     // a flower on the ribbon
    [SPHERE, 0xf6d06a, [0.077, 0.04, 0.055], [0, 0, 0], [0.008, 0.008, 0.008]],
  ]);
}

function keys() {
  const brass = 0xe0b04a, silver = 0xc8cdd2;
  const key = (x, z, ry, c) => [
    [CYL(0.014, 0.014, 0.004, 16), c, [x, 0.003, z]],
    [RB(0.008, 0.004, 0.05, 0.002), c, [x + Math.sin(ry) * 0.032, 0.003, z + Math.cos(ry) * 0.032], [0, ry, 0]],
    [RB(0.008, 0.004, 0.006, 0.001), c, [x + Math.sin(ry) * 0.05 + Math.cos(ry) * 0.006, 0.003, z + Math.cos(ry) * 0.05 - Math.sin(ry) * 0.006], [0, ry, 0]],
  ];
  return item([
    [TOR(0.024, 0.0035), silver, [0, 0.004, 0], [Math.PI / 2, 0, 0]],
    ...key(0.03, 0.0, 1.2, brass), ...key(-0.02, 0.025, -0.4, silver),
    [RB(0.03, 0.012, 0.02, 0.005), 0xd9534f, [-0.02, 0.007, -0.032]],              // a fob
  ]);
}

/** A football (for nudging home: it rolls, it isn't carried). Radius 0.11, centred on its middle. */
export function footballMesh() {
  const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), e = new THREE.Euler();
  const patches = new THREE.IcosahedronGeometry(1, 0).toNonIndexed().attributes.position;
  const dirs = [];
  for (let i = 0; i < patches.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(patches, i).normalize();
    if (!dirs.some((o) => o.distanceTo(d) < 0.1)) dirs.push(d);
  }
  return item([
    [SPHERE, 0xfbf7ee, [0, 0, 0], [0, 0, 0], [0.11, 0.11, 0.11]],
    ...dirs.map((d) => [SPHERE, 0x2f2a2c, d.clone().multiplyScalar(0.1).toArray(), e.setFromQuaternion(q.setFromUnitVectors(Z, d)).toArray().slice(0, 3), [0.038, 0.038, 0.016]]),
  ], 0);
}

/** Registered with the other carryables (hold: [x, y, z] position and rotation in the mouth). */
export const JOB_ITEMS = {
  parcel: { name: 'parcel', emoji: '📦', build: parcel, hold: { pos: [0, -0.11, 0.08], rot: [0, 0, 0] } },
  letter: { name: 'letter', emoji: '✉️', build: letter, hold: { pos: [0, -0.04, 0.03], rot: [1.3, 0, 0] } },
  cake: { name: 'birthday cake', emoji: '🎂', build: cake, hold: { pos: [0, -0.1, 0.08], rot: [0, 0, 0] } },
  kite: { name: 'kite', emoji: '🪁', build: kite, hold: { pos: [0, -0.02, 0.04], rot: [0.2, 0, 0.6] } },
  balloon: { name: 'balloon', emoji: '🎈', build: balloon, hold: { pos: [0, -0.01, 0.02], rot: [0, 0, 0] } },
  wool: { name: 'knitting', emoji: '🧶', build: wool, hold: { pos: [0, -0.07, 0.04], rot: [0, 0, 0] } },
  scarf: { name: 'scarf', emoji: '🧣', build: scarf, hold: { pos: [0, -0.02, 0.01], rot: [0, 0, 0] } },
  glove: { name: 'oven glove', emoji: '🧤', build: glove, hold: { pos: [0, -0.05, 0.03], rot: [1.3, 0, 0] } },
  duck: { name: 'rubber duck', emoji: '🐤', build: rubberDuck, hold: { pos: [0, -0.06, 0.03], rot: [0, 0, 0] } },
  boat: { name: 'toy boat', emoji: '⛵', build: boat, hold: { pos: [0, -0.05, 0.03], rot: [0, Math.PI / 2, 0] } },
  car: { name: 'toy car', emoji: '🚗', build: toyCar, hold: { pos: [0, -0.05, 0.03], rot: [0, Math.PI / 2, 0] } },
  hat: { name: 'sun hat', emoji: '👒', build: sunHat, hold: { pos: [0, -0.13, 0.05], rot: [1.3, 0, 0] } },
  keys: { name: 'keys', emoji: '🔑', build: keys, hold: { pos: [0, -0.02, 0.02], rot: [0.6, 0, 0] } },
};
for (const [k, v] of Object.entries(JOB_ITEMS)) {
  // (In the mouth, take the LIFT back out again.)
  const up = new THREE.Vector3(0, LIFT, 0).applyEuler(new THREE.Euler(...v.hold.rot));
  v.hold = { pos: v.hold.pos.map((p, i) => p - up.getComponent(i)), rot: v.hold.rot };
  CARRYABLES[k] ??= v;
}
