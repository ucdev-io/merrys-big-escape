import * as THREE from 'three';
import { bake } from './shapes.js';
import { blobGeometry } from '../world/props.js';
import { paint } from '../render/watercolorMaterial.js';

/*
 * 🐑🐷🐔 The farm's animals, as a few rigid parts each (body, head, legs, wings) baked into single
 * geometries with vertex colours, so a whole flock is a handful of instanced meshes: one draw call per
 * part however many sheep there are. Each faces +z with its feet at y = 0; part pivots are given so the
 * game can pose them (see game/town/farm/): a head nods from its neck, a leg swings from its hip.
 * Colours are pale where an instance colour tints them (a brown hen, the black sheep).
 */

const S = (w, h) => new THREE.SphereGeometry(1, w, h);
const BALL = S(12, 8), SMALL = S(8, 6), DOT = S(6, 4);
const cache = {};

/** One instanced mesh of a part: n of them, painted with its own vertex colours (times an instance colour). */
export function instancedPart(geo, n, { shadow = true } = {}) {
  const m = new THREE.InstancedMesh(geo, paint(0xffffff, { vertexColors: true }), Math.max(1, n));
  m.count = n;
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.frustumCulled = false; // (they wander about: the box would need working out every frame)
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const z = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < Math.max(1, n); i++) { m.setMatrixAt(i, z); m.setColorAt(i, white); }
  return m;
}

// ---------------------------------------------------------------------------------------------
/** 🐑 A woolly sheep with a black face (and her lambs: the same, smaller). Neck at NECK, hips at HIPS. */
export const SHEEP = { NECK: [0, 0.74, 0.4], HIPS: [[0.15, 0.42, 0.25], [-0.15, 0.42, 0.25], [0.15, 0.42, -0.24], [-0.15, 0.42, -0.24]] };
export function sheepGeometry() {
  if (cache.sheep) return cache.sheep;
  const W = [0xf6f1e6, 0xebe3d3, 0xfbf8f0], FACE = 0x3b3431;
  const wool = (i, v) => W[(Math.floor(v.x * 31 + v.y * 23 + v.z * 41) & 3) % 3];
  const body = bake([
    { geo: blobGeometry(3, 0.18, 2), color: W[0], pos: [0, 0.62, -0.02], scale: [0.34, 0.29, 0.47], colors: wool },
    { geo: blobGeometry(5, 0.3, 1), color: W[1], pos: [0.12, 0.8, 0.12], scale: [0.17, 0.13, 0.19], colors: wool },
    { geo: blobGeometry(7, 0.3, 1), color: W[2], pos: [-0.12, 0.81, -0.08], scale: [0.17, 0.13, 0.21], colors: wool },
    { geo: blobGeometry(9, 0.3, 1), color: W[0], pos: [0.01, 0.83, -0.26], scale: [0.16, 0.12, 0.17], colors: wool },
    { geo: blobGeometry(11, 0.3, 1), color: W[1], pos: [0.23, 0.62, -0.1], scale: [0.13, 0.18, 0.23], colors: wool },
    { geo: blobGeometry(13, 0.3, 1), color: W[2], pos: [-0.23, 0.63, 0.08], scale: [0.13, 0.17, 0.23], colors: wool },
    { geo: blobGeometry(17, 0.25, 1), color: W[1], pos: [0, 0.67, 0.37], scale: [0.21, 0.21, 0.15], colors: wool }, // (a woolly chest)
    [blobGeometry(15, 0.3, 1), W[0], [0, 0.63, -0.48], [0, 0, 0], [0.08, 0.1, 0.08]], // a little tail
  ]);
  const head = bake([
    [BALL, FACE, [0, -0.03, 0.12], [0.3, 0, 0], [0.1, 0.11, 0.17]],          // a long face, a little bowed
    [SMALL, 0x2b2523, [0, -0.09, 0.25], [0.35, 0, 0], [0.068, 0.058, 0.06]], // muzzle
    [SMALL, FACE, [0.12, 0.02, 0.05], [0, 0.2, -0.45], [0.085, 0.028, 0.045]], // ears, out to the sides
    [SMALL, FACE, [-0.12, 0.02, 0.05], [0, -0.2, 0.45], [0.085, 0.028, 0.045]],
    [blobGeometry(19, 0.3, 1), 0xf2ede2, [0, 0.07, 0.03], [0, 0, 0], [0.1, 0.07, 0.1]], // a woolly fringe on top
    [DOT, 0xf4f1ea, [0.066, 0.015, 0.165], [0, 0, 0], [0.018, 0.018, 0.012]],
    [DOT, 0xf4f1ea, [-0.066, 0.015, 0.165], [0, 0, 0], [0.018, 0.018, 0.012]],
    [DOT, 0x15110f, [0.069, 0.014, 0.174], [0, 0, 0], [0.01, 0.011, 0.007]],
    [DOT, 0x15110f, [-0.069, 0.014, 0.174], [0, 0, 0], [0.01, 0.011, 0.007]],
  ]);
  const leg = bake([
    [new THREE.CapsuleGeometry(0.034, 0.3, 2, 7), 0x332d2b, [0, -0.2, 0]],
    [SMALL, 0x221d1b, [0, -0.39, 0.012], [0, 0, 0], [0.042, 0.028, 0.05]], // hoof
  ]);
  return (cache.sheep = { body, head, leg });
}

// ---------------------------------------------------------------------------------------------
/** 🐷 A pig: pink, or a Gloucester Old Spot (pale, with black spots). Neck at NECK, hips at HIPS. */
export const PIG = { NECK: [0, 0.47, 0.38], HIPS: [[0.14, 0.26, 0.26], [-0.14, 0.26, 0.26], [0.14, 0.26, -0.27], [-0.14, 0.26, -0.27]] };
export function pigGeometry() {
  if (cache.pig) return cache.pig;
  const PINK = 0xf3b8ae, DEEP = 0xe59a90;
  const shape = (spots) => {
    const g = new THREE.SphereGeometry(1, 16, 12);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setXYZ(i, v.x * (1 - Math.max(0, -v.y) * 0.12), v.y * (v.y < 0 ? 0.88 : 1), v.z); } // (flatter underneath)
    g.computeVertexNormals();
    return { geo: g, color: PINK, pos: [0, 0.44, 0], scale: [0.27, 0.25, 0.46], colors: spots ? (i, q) => (Math.sin(q.x * 31 + 1.3) * Math.sin(q.z * 17 + q.y * 9) > 0.55 ? 0x3a3434 : 0xf4ddd2) : null };
  };
  const tail = new THREE.TorusGeometry(0.035, 0.011, 5, 12, Math.PI * 1.6);
  const rest = [[tail, PINK, [0, 0.52, -0.47], [0, Math.PI / 2, 0.3]]];
  const body = bake([shape(false), ...rest]);
  const spotty = bake([shape(true), [tail, 0xf4ddd2, [0, 0.52, -0.47], [0, Math.PI / 2, 0.3]]]);
  const snout = new THREE.CylinderGeometry(0.072, 0.08, 0.09, 14);
  const head = bake([
    [BALL, PINK, [0, 0, 0.05], [0, 0, 0], [0.17, 0.155, 0.17]],
    [snout, DEEP, [0, -0.035, 0.21], [Math.PI / 2, 0, 0]],
    [DOT, 0x7a4a46, [0.026, -0.035, 0.257], [0, 0, 0], [0.014, 0.018, 0.006]],
    [DOT, 0x7a4a46, [-0.026, -0.035, 0.257], [0, 0, 0], [0.014, 0.018, 0.006]],
    [new THREE.ConeGeometry(0.07, 0.13, 8), DEEP, [0.09, 0.11, 0.08], [1.1, 0, -0.4], [1, 1, 0.45]], // floppy ears
    [new THREE.ConeGeometry(0.07, 0.13, 8), DEEP, [-0.09, 0.11, 0.08], [1.1, 0, 0.4], [1, 1, 0.45]],
    [DOT, 0x2a1f1d, [0.07, 0.04, 0.17], [0, 0, 0], [0.016, 0.018, 0.01]],
    [DOT, 0x2a1f1d, [-0.07, 0.04, 0.17], [0, 0, 0], [0.016, 0.018, 0.01]],
  ]);
  const leg = bake([[new THREE.CylinderGeometry(0.045, 0.04, 0.22, 8), PINK, [0, -0.11, 0]], [new THREE.CylinderGeometry(0.042, 0.045, 0.05, 8), 0x6e4e48, [0, -0.235, 0]]]);
  return (cache.pig = { body, spotty, head, leg });
}

// ---------------------------------------------------------------------------------------------
/** 🐔 A plump hen (pale: an instance colour makes her brown, white or speckled grey). Neck at NECK. */
export const HEN = { NECK: [0, 0.34, 0.1], WINGS: [[0.115, 0.23, 0], [-0.115, 0.23, 0]], HIPS: [[0.045, 0.12, 0], [-0.045, 0.12, 0]] };
export function henGeometry() {
  if (cache.hen) return cache.hen;
  const B = 0xffffff, BR = 0xfff8ee, TAIL = 0xc8beb4, RED = 0xd9483f, BEAK = 0xf0b040;
  const body = bake([
    [BALL, B, [0, 0.2, 0], [0, 0, 0], [0.13, 0.12, 0.16]],
    [BALL, BR, [0, 0.19, 0.07], [0, 0, 0], [0.105, 0.1, 0.1]],
    [SMALL, TAIL, [0, 0.29, -0.13], [-0.5, 0, 0], [0.035, 0.1, 0.05]],
    [SMALL, TAIL, [-0.04, 0.27, -0.12], [-0.6, 0, 0.35], [0.03, 0.085, 0.045]],
    [SMALL, TAIL, [0.04, 0.27, -0.12], [-0.6, 0, -0.35], [0.03, 0.085, 0.045]],
    [SMALL, B, [0, 0.27, 0.07], [0, 0, 0], [0.07, 0.08, 0.07]],
  ]);
  const head = bake([
    [SMALL, B, [0, 0, 0], [0, 0, 0], [0.062, 0.065, 0.064]],
    [DOT, RED, [0, 0.062, 0.03], [0, 0, 0], [0.014, 0.022, 0.016]],
    [DOT, RED, [0, 0.07, 0.0], [0, 0, 0], [0.015, 0.026, 0.018]],
    [DOT, RED, [0, 0.062, -0.03], [0, 0, 0], [0.013, 0.02, 0.016]],
    [new THREE.ConeGeometry(0.02, 0.05, 8), BEAK, [0, -0.005, 0.075], [Math.PI / 2, 0, 0], [1, 1, 0.75]],
    [DOT, RED, [0, -0.04, 0.05], [0, 0, 0], [0.013, 0.022, 0.012]],
    [DOT, 0x241a17, [0.038, 0.012, 0.042], [0, 0, 0], [0.009, 0.011, 0.008]],
    [DOT, 0x241a17, [-0.038, 0.012, 0.042], [0, 0, 0], [0.009, 0.011, 0.008]],
  ]);
  const wing = bake([[SMALL, 0xf2ece4, [0, -0.03, -0.02], [0.15, 0, 0], [0.032, 0.075, 0.11]]]);
  const toe = new THREE.CapsuleGeometry(0.006, 0.035, 2, 4);
  const leg = bake([
    [new THREE.CylinderGeometry(0.008, 0.009, 0.11, 6), 0xe8a040, [0, -0.06, 0]],
    [toe, 0xe8a040, [0, -0.115, 0.02], [Math.PI / 2, 0, 0]],
    [toe, 0xe8a040, [0.015, -0.115, 0.015], [Math.PI / 2, 0, -0.6]],
    [toe, 0xe8a040, [-0.015, -0.115, 0.015], [Math.PI / 2, 0, 0.6]],
  ]);
  return (cache.hen = { body, head, wing, leg });
}

// ---------------------------------------------------------------------------------------------
/** A crow (the one who sits on the scarecrow's hat): a body, and two wings that flap. */
export function crowGeometry() {
  if (cache.crow) return cache.crow;
  const INK = 0x2b2b35;
  const body = bake([
    [SMALL, INK, [0, 0.09, 0], [0.2, 0, 0], [0.065, 0.065, 0.12]],
    [SMALL, INK, [0, 0.15, 0.09], [0, 0, 0], [0.05, 0.05, 0.055]],
    [new THREE.ConeGeometry(0.018, 0.07, 6), 0x4a4a52, [0, 0.145, 0.165], [Math.PI / 2, 0, 0]],
    [DOT, 0xd8d0c0, [0.03, 0.165, 0.12], [0, 0, 0], [0.007, 0.007, 0.006]],
    [DOT, 0xd8d0c0, [-0.03, 0.165, 0.12], [0, 0, 0], [0.007, 0.007, 0.006]],
    [SMALL, INK, [0, 0.09, -0.15], [-0.35, 0, 0], [0.04, 0.012, 0.09]],
    [new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4), 0x4a4a52, [0.025, 0.02, 0], [0, 0, 0]],
    [new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4), 0x4a4a52, [-0.025, 0.02, 0], [0, 0, 0]],
  ]);
  const wing = bake([[SMALL, 0x33333e, [0.09, 0, -0.02], [0, 0, 0], [0.1, 0.012, 0.07]]]);
  return (cache.crow = { body, wing });
}

// ---------------------------------------------------------------------------------------------
// Posing instanced parts: a root (where an animal stands and which way it faces), then parts hung off it.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** An animal's root: at (x, y, z), facing h (round y), leaning (pitch, roll), scaled s. Writes into out. */
export function rootMatrix(out, x, y, z, h, s = 1, pitch = 0, roll = 0) {
  _q.setFromEuler(_e.set(pitch, h, roll, 'YXZ'));
  return out.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
}

/** A part hung off a root: at `at` (in the root's frame), turned by (rx, ry, rz). Writes into out. */
export function partMatrix(out, root, at, rx = 0, ry = 0, rz = 0, k = 1) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  _m.compose(_p.set(at[0], at[1], at[2]), _q, _s.set(k, k, k));
  return out.multiplyMatrices(root, _m);
}
