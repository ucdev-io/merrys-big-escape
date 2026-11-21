import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry, skyDome } from '../../world/props.js';
import { PALETTE } from '../../render/palette.js';
import { tripWorld } from '../kit.js';
import { buildCourse } from './agility.js';

/*
 * 🏆 The Big Dog Show: a sunny showground in a field (a day out on the bus). A post-and-rail fence all round, the
 * gate and its bus stop at the south end, a mown avenue up to the bandstand, and the rings round about:
 *
 *        👃 the sniffing garden          🥏 the frisbee field
 *            (Sniff & Seek)                 (Ruby throws)
 *   🎀 the show ring       🎺 bandstand       🏅 the agility ring
 *     (the judge's table)                     (jumps, weaves, tunnel, tyre, seesaw)
 *         ⛺ the secretary's tent   │   ☕ the tea tent
 *                            gate + 🚌 stop
 *
 * Its own coordinates (0, 0 is the middle of the green; the gate is at +z).
 */

export const PLAN = {
  X: 34, Z0: -34, Z1: 28,                      // the fence: |x| < X, Z0 < z < Z1
  gate: { x: 0, z: 28, w: 5 },
  stop: { x: -4.2, z: 25.6 },                  // the bus stop sign, just inside the gate (the way home)
  spawn: { x: 0, z: 20.5 },
  bandstand: { x: 0, z: -5, r: 2.6, h: 0.5 },
  ring: { x: -15, z: 3, r: 7.5 },              // the show ring (its way in faces the green, east)
  judge: { x: -15, z: -3.4 },                  // behind her table, looking down the ring
  mark: { x: -15, z: 1.2 },                    // where a dog stands to show off
  agility: { x0: 3.5, x1: 26.5, z0: -11, z1: 10.5 },
  frisbee: { kid: { x: 16, z: -16.5 }, x0: 6, x1: 27, z0: -31, z1: -20 },
  seek: { x0: -28, x1: -6, z0: -31, z1: -14, master: { x: -9.2, z: -12.2 }, gap: { x: -9.2, w: 2.6 } },
  tea: { x: 10.5, z: 19, w: 6, d: 4.2 },
  office: { x: -11, z: 19, w: 5.5, d: 4 },
  // Where the toy can be hidden in the sniffing garden: x, z, r (how far out the thing it's in or behind reaches), kind.
  hides: [
    { x: -25.5, z: -28.5, r: 1.1, kind: 'bales' }, { x: -19, z: -29, r: 0.6, kind: 'kennel' }, { x: -12, z: -28.8, r: 0.7, kind: 'barrow' },
    { x: -8.5, z: -24.5, r: 0.45, kind: 'pots' }, { x: -15.5, z: -24, r: 1.1, kind: 'bales' }, { x: -22, z: -23.5, r: 0.55, kind: 'crates' },
    { x: -26.5, z: -19, r: 0.5, kind: 'bucket' }, { x: -20, z: -17.5, r: 0.7, kind: 'straw' }, { x: -13.5, z: -18.5, r: 0.55, kind: 'crates' },
    { x: -8, z: -18, r: 0.5, kind: 'basket' }, { x: -17.5, z: -21, r: 0.45, kind: 'pots' }, { x: -24, z: -26, r: 0.7, kind: 'straw' },
    { x: -10.5, z: -21.5, r: 0.55, kind: 'logs' }, { x: -27, z: -24, r: 1.1, kind: 'bales' },
  ],
};

const RB = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);
const GRASS = PALETTE.grass ?? 0x8dbb6a, PATH = 0xe6d6b4, WOOD = 0x8a5a3a, STRAW = 0xe2c47a;
export const ROSETTE = { 1: 0xd9534f, 2: 0x5b86c4, 3: 0xf2c94c, 4: 0x6f9a52 }; // (1st red, 2nd blue, 3rd yellow, highly commended green)

export function add(g, geo, color, pos, { rot = [0, 0, 0], scale = null, cast = true, opts, occluder = false, season } = {}) {
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
  for (let i = 0; i <= n; i++) { const t = i / n, p = A.clone().lerp(B, t); p.y -= Math.sin(t * Math.PI) * len * 0.07; pts.push(p); }
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.012, 4, false), 0xf3ead8, [0, 0, 0], { cast: false });
  const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.14, 0, 0), new THREE.Vector3(0.14, 0, 0), new THREE.Vector3(0, -0.3, 0)]);
  flag.setIndex([0, 2, 1, 0, 1, 2]);
  flag.computeVertexNormals();
  const dir = B.clone().sub(A).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z) - Math.PI / 2;
  for (let i = 1; i < n; i++) add(g, flag, colors[i % colors.length], pts[i].toArray(), { rot: [0, yaw, 0], cast: false, opts: { side: THREE.DoubleSide } });
}

/** A flagpole with a little pennant. */
function flagpole(g, x, z, h, color) {
  add(g, new THREE.CylinderGeometry(0.04, 0.05, h, 8), 0xf7f3ea, [x, h / 2, z]);
  const pen = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.36, 0), new THREE.Vector3(0.7, -0.18, 0)]);
  pen.setIndex([0, 1, 2, 0, 2, 1]);
  pen.computeVertexNormals();
  add(g, pen, color, [x + 0.03, h - 0.05, z], { cast: false, opts: { side: THREE.DoubleSide } });
  add(g, new THREE.SphereGeometry(0.07, 10, 8), 0xe0b04a, [x, h + 0.04, z], { cast: false });
}

/**
 * A striped marquee: walls of coloured and white stripes, a white roof (a long pyramid), a scalloped valance, a
 * flag on top. `open`: no wall at the front (+z, before it's turned), for the tea tent.
 */
function marquee(g, m, color, C, { open = false } = {}) {
  const grp = new THREE.Group();
  grp.position.set(m.x, 0, m.z);
  grp.rotation.y = m.face ?? 0;
  g.add(grp);
  const { w, d } = m, h = 2.3, n = Math.round(w / 0.5), k = Math.round(d / 0.5);
  const stripes = (len, count, at, rotY, skip) => {
    for (let i = 0; i < count; i++) {
      if (skip?.(i)) continue;
      const s = -len / 2 + (i + 0.5) * (len / count);
      const p = rotY ? [at, h / 2, s] : [s, h / 2, at];
      add(grp, new THREE.BoxGeometry(rotY ? 0.05 : len / count, h, rotY ? len / count : 0.05), i % 2 ? 0xfbf7ee : color, p, { cast: i % 3 === 0, occluder: i === Math.floor(count / 2) });
    }
  };
  stripes(w, n, -d / 2, false);
  if (!open) stripes(w, n, d / 2, false, (i) => Math.abs(i - (n - 1) / 2) < 1); // (a doorway in the middle)
  stripes(d, k, -w / 2, true);
  stripes(d, k, w / 2, true);
  // The roof: a white pyramid, stretched to fit, and a flag on top.
  const RH = 1.5, roof = add(grp, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), 0xfbf7ee, [0, h + RH / 2, 0], { rot: [0, Math.PI / 4, 0], scale: [w * 1.08, RH, d * 1.08] });
  roof.userData.occluder = true;
  // A coloured cap on top and coloured seams down the four corners of the roof.
  add(grp, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), color, [0, h + RH * 0.86, 0], { rot: [0, Math.PI / 4, 0], scale: [w * 0.32, RH * 0.3, d * 0.32], cast: false });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = new THREE.Vector3(sx * w * 0.54, h, sz * d * 0.54), b = new THREE.Vector3(0, h + RH, 0), len = a.distanceTo(b);
    const seam = add(grp, new THREE.CylinderGeometry(0.035, 0.035, len, 5), color, a.clone().lerp(b, 0.5).toArray(), { cast: false });
    seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  for (let i = 0; i < n + 1; i++) for (const s of [-1, 1]) add(grp, new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), color, [-w / 2 + i * (w / n), h + 0.02, s * (d / 2 + 0.04)], { cast: false });
  flagpole(grp, 0, 0, h + RH + 1.0, color);
  if (open) { // a counter with a cloth, cups and cakes
    add(grp, RB(w - 1.2, 0.85, 0.7, 0.05), 0xfbf7ee, [0, 0.43, d / 2 - 0.7]);
    for (let i = 0; i < 4; i++) add(grp, new THREE.CylinderGeometry(0.06, 0.05, 0.1, 10), [0xd9534f, 0x5b86c4, 0x6f9a52, 0xf2c94c][i], [-1.4 + i * 0.9, 0.91, d / 2 - 0.7], { cast: false });
    add(grp, new THREE.CylinderGeometry(0.22, 0.22, 0.14, 16), 0xf2a0c8, [1.9, 0.93, d / 2 - 0.7]);
    add(grp, new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16), 0xfbf7ee, [1.9, 1.06, d / 2 - 0.7]);
  }
  const c = Math.cos(m.face ?? 0), sn = Math.sin(m.face ?? 0), ex = Math.abs(c) * w / 2 + Math.abs(sn) * d / 2, ez = Math.abs(sn) * w / 2 + Math.abs(c) * d / 2;
  C.box(m.x - ex, m.z - ez, m.x + ex, m.z + ez, Infinity, false);
}

/** A straw bale (a rounded block, a bit fuzzy), or a stack of them. */
function bale(g, x, z, y = 0, rotY = 0) {
  add(g, RB(1.1, 0.5, 0.55, 0.1), STRAW, [x, y + 0.25, z], { rot: [0, rotY, 0] });
  for (const s of [-0.28, 0.28]) add(g, new THREE.BoxGeometry(0.02, 0.51, 0.56), 0xb8935a, [x + Math.cos(rotY) * s, y + 0.25, z - Math.sin(rotY) * s], { rot: [0, rotY, 0], cast: false }); // (the twine)
}

/** A wooden crate. */
function crate(g, x, z, y = 0, s = 0.5) {
  add(g, RB(s, s, s, 0.03), 0xb08050, [x, y + s / 2, z]);
  for (const k of [-1, 1]) add(g, new THREE.BoxGeometry(s + 0.01, 0.06, 0.03), 0x8a5f3a, [x, y + s / 2 + k * s * 0.3, z + s / 2], { cast: false });
}

/** A flower pot with a bushy plant. */
function pot(g, x, z, s = 1, col = 0xf2a0c8) {
  add(g, new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.32 * s, 14), 0xc0703f, [x, 0.16 * s, z]);
  add(g, blobGeometry(Math.round(x * 7 + z), 0.25, 1), 0x6f9a52, [x, 0.42 * s, z], { scale: [0.24 * s, 0.2 * s, 0.24 * s], season: 'foliage' });
  for (let i = 0; i < 3; i++) add(g, new THREE.SphereGeometry(0.05 * s, 8, 6), col, [x + Math.cos(i * 2.1) * 0.13 * s, 0.52 * s, z + Math.sin(i * 2.1) * 0.13 * s], { cast: false });
}

/** Where the toy might be: something to hide it in or behind, at each spot. */
function hideProp(g, h, C) {
  const { x, z } = h;
  if (h.kind === 'bales') { bale(g, x - 0.3, z, 0, 0.1); bale(g, x + 0.5, z + 0.3, 0, -0.2); bale(g, x + 0.1, z + 0.1, 0.5, 0.05); C.box(x - 0.9, z - 0.4, x + 1.1, z + 0.7, 1.0); }
  else if (h.kind === 'kennel') {
    add(g, RB(0.9, 0.7, 1.0, 0.04), 0xd9534f, [x, 0.35, z]);
    add(g, new THREE.ConeGeometry(0.85, 0.5, 4), 0x6b4a32, [x, 0.95, z], { rot: [0, Math.PI / 4, 0], scale: [0.85, 1, 0.95] });
    add(g, new THREE.CircleGeometry(0.22, 16), 0x2e2420, [x, 0.3, z + 0.51], { cast: false });
    C.box(x - 0.45, z - 0.5, x + 0.45, z + 0.5, 1.1);
  } else if (h.kind === 'barrow') {
    add(g, RB(0.7, 0.3, 1.0, 0.05), 0x5b86c4, [x, 0.45, z], { rot: [0.12, 0, 0] });
    add(g, new THREE.TorusGeometry(0.16, 0.05, 6, 14), 0x2f3a52, [x, 0.17, z + 0.55], { rot: [0, Math.PI / 2, 0] });
    for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), WOOD, [x + s * 0.28, 0.4, z - 0.55], { rot: [1.25, 0, 0] });
    C.circle(x, z, 0.5, 0.6);
  } else if (h.kind === 'pots') { pot(g, x, z, 1.2); pot(g, x + 0.45, z + 0.25, 0.9, 0xf2c94c); pot(g, x - 0.35, z + 0.35, 0.8, 0xb69be0); C.circle(x, z, 0.3, 0.5); }
  else if (h.kind === 'crates') { crate(g, x, z); crate(g, x + 0.55, z + 0.1, 0, 0.45); crate(g, x + 0.2, z, 0.5, 0.4); C.box(x - 0.3, z - 0.3, x + 0.8, z + 0.35, 0.95); }
  else if (h.kind === 'bucket') {
    add(g, new THREE.CylinderGeometry(0.2, 0.16, 0.34, 14, 1, true), 0x7a8a9a, [x, 0.17, z], { opts: { side: THREE.DoubleSide } });
    add(g, new THREE.TorusGeometry(0.19, 0.012, 4, 14, Math.PI), 0x5a6a7a, [x, 0.34, z], { cast: false });
    C.circle(x, z, 0.22, 0.34);
  } else if (h.kind === 'straw') {
    for (let i = 0; i < 4; i++) add(g, blobGeometry(30 + i + Math.round(x), 0.35, 1), i % 2 ? STRAW : 0xd6b468, [x + Math.cos(i * 1.7) * 0.3, 0.12, z + Math.sin(i * 1.7) * 0.25], { scale: [0.55, 0.28, 0.5], cast: false });
  } else if (h.kind === 'basket') {
    add(g, new THREE.CylinderGeometry(0.3, 0.24, 0.3, 16, 1, true), 0xb88a52, [x, 0.15, z], { opts: { side: THREE.DoubleSide } });
    add(g, new THREE.TorusGeometry(0.3, 0.025, 5, 18), 0x9a6e3a, [x, 0.3, z], { rot: [Math.PI / 2, 0, 0], cast: false });
    add(g, new THREE.TorusGeometry(0.26, 0.02, 4, 16, Math.PI), 0x9a6e3a, [x, 0.3, z], { cast: false });
    C.circle(x, z, 0.3, 0.3);
  } else if (h.kind === 'logs') {
    for (const [dx, y] of [[-0.2, 0.12], [0.2, 0.12], [0, 0.33]]) add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), 0x7f5f45, [x + dx, y, z], { rot: [Math.PI / 2, 0, 0] });
    C.box(x - 0.35, z - 0.45, x + 0.35, z + 0.45, 0.45);
  }
}

export function buildShow(origin) {
  const { group: g, C, W, R, col, ox, oz } = tripWorld(origin);
  g.userData.season = 'world';
  const P = PLAN;

  // ---- the ground: the field, mown stripes, the avenue and the paths ----
  add(g, new THREE.PlaneGeometry(200, 200), GRASS, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'plant' });
  for (let i = 0; i < 9; i++) { // (stripes in the mown field, as at every good showground)
    if (i % 2) continue;
    add(g, new THREE.PlaneGeometry(2 * P.X - 2, 6.4), 0x9cc978, [0, 0.003, P.Z0 + 3.6 + i * 6.8], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'plant' });
  }
  const path = (x0, z0, x1, z1, w) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    add(g, new THREE.PlaneGeometry(w, len + w * 0.5), PATH, [(x0 + x1) / 2, 0.006, (z0 + z1) / 2], { rot: [-Math.PI / 2, 0, Math.atan2(x1 - x0, z1 - z0)], cast: false, season: 'road' });
  };
  path(0, P.Z1, 0, 1, 4);
  add(g, new THREE.CircleGeometry(4.6, 40), PATH, [P.bandstand.x, 0.007, P.bandstand.z], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'road' });
  path(0, 3, P.ring.x + P.ring.r, P.ring.z, 2.6);
  path(0, 3, P.agility.x0 + 0.5, 0, 2.6);
  path(0, -8, P.seek.master.x, P.seek.master.z + 1, 2.4);
  path(0, -8, P.frisbee.kid.x - 1, P.frisbee.kid.z + 1.5, 2.4);

  // ---- the fence all round (post and rail), and the gate with its arch ----
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), f = new THREE.Group();
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    f.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    g.add(f);
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 2.4) add(f, new THREE.BoxGeometry(0.12, 1.2, 0.12), 0x7a5232, [0, 0.6, s]);
    for (const y of [0.45, 0.95]) add(f, new THREE.BoxGeometry(0.06, 0.12, len), 0x8a6040, [0, y, 0], { cast: y > 0.5 });
    C.box(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12, 1.3, false);
  };
  const gw = P.gate.w / 2;
  fence(-P.X, P.Z0, P.X, P.Z0); fence(-P.X, P.Z0, -P.X, P.Z1); fence(P.X, P.Z0, P.X, P.Z1);
  fence(-P.X, P.Z1, -gw - 0.6, P.Z1); fence(gw + 0.6, P.Z1, P.X, P.Z1);
  C.box(-gw, P.Z1 - 0.1, gw, P.Z1 + 0.3, Infinity, false); // (out through the gate is on the bus, not on foot)
  // The arch: two posts wound with green, a board with a big rosette on it, and bunting.
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.2, 0.22, 5.2, 12), 0xfbf7ee, [s * (gw + 0.3), 2.6, P.Z1], { occluder: true });
    for (let k = 0; k < 8; k++) add(g, blobGeometry(k + (s > 0 ? 10 : 0), 0.3, 1), 0x6f9a52, [s * (gw + 0.3), 0.4 + k * 0.6, P.Z1], { scale: [0.3, 0.25, 0.3], cast: false, season: 'foliage' });
    add(g, new THREE.SphereGeometry(0.2, 12, 8), 0xe0b04a, [s * (gw + 0.3), 5.3, P.Z1]);
    bale(g, s * (gw + 1.6), P.Z1 - 0.8, 0, 0.2 * s);
    C.circle(s * (gw + 0.3), P.Z1, 0.3);
    C.box(s * (gw + 1.6) - 0.6, P.Z1 - 1.15, s * (gw + 1.6) + 0.6, P.Z1 - 0.45, 0.5);
  }
  const SY = 4.75; // (the sign: up high, over the camera's head as she comes in)
  add(g, RB(P.gate.w + 1.6, 1.0, 0.18, 0.1), 0x2f6a5a, [0, SY, P.Z1]);
  add(g, RB(P.gate.w + 1.2, 0.72, 0.22, 0.08), 0xfffaf0, [0, SY, P.Z1]);
  // A big rosette on the board (red, with its two tails), and paw prints either side (on both faces).
  for (const f of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), ROSETTE[1], [0, SY, P.Z1 + f * 0.15], { rot: [Math.PI / 2, 0, 0] });
    add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), 0xe0b04a, [0, SY, P.Z1 + f * 0.17], { rot: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.16, 0.42, 0.03), ROSETTE[1], [s * 0.13, SY - 0.5, P.Z1 + f * 0.13], { rot: [0, 0, s * 0.25] });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(g, new THREE.CircleGeometry(0.1, 12), 0x6b4a32, [s * (1.0 + k * 0.55), SY + (k % 2) * 0.1, P.Z1 + f * 0.12], { rot: [0, f < 0 ? Math.PI : 0, 0], cast: false });
  }
  bunting(g, [-gw - 0.3, SY + 0.5, P.Z1], [gw + 0.3, SY + 0.5, P.Z1]);
  // The bus stop, just inside: a sign on a pole and a bench.
  {
    const s = P.stop;
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), 0x7a7f88, [s.x, 1.2, s.z]);
    add(g, new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20), 0xd9534f, [s.x, 2.3, s.z], { rot: [Math.PI / 2, 0, 0] });
    add(g, new THREE.CircleGeometry(0.24, 18), 0xffffff, [s.x, 2.3, s.z - 0.035], { rot: [0, Math.PI, 0], cast: false });
    add(g, RB(1.6, 0.08, 0.45, 0.03), WOOD, [s.x - 1.4, 0.45, s.z + 0.3]);
    for (const sx of [-0.65, 0.65]) add(g, new THREE.BoxGeometry(0.06, 0.45, 0.4), 0x5a5f68, [s.x - 1.4 + sx, 0.22, s.z + 0.3]);
    C.circle(s.x, s.z, 0.1);
  }

  // ---- tents by the gate: the show secretary's (closed, striped green) and the tea tent (open at the front) ----
  marquee(g, { ...P.office, face: Math.PI / 2 }, 0x6f9a52, C);
  marquee(g, { ...P.tea, face: -Math.PI / 2 }, 0x5b86c4, C, { open: true });
  for (const [x, z] of [[6.2, 16.5], [6.2, 21.5]]) { // (picnic tables outside the tea tent)
    add(g, RB(1.6, 0.06, 0.8, 0.02), WOOD, [x, 0.72, z]);
    for (const s of [-1, 1]) add(g, RB(1.6, 0.05, 0.28, 0.02), WOOD, [x, 0.42, z + s * 0.62]);
    for (const s of [-0.6, 0.6]) add(g, new THREE.BoxGeometry(0.06, 0.72, 1.6), 0x6b4a32, [x + s, 0.36, z], { rot: [0, 0, 0] });
    C.box(x - 0.85, z - 0.8, x + 0.85, z + 0.8, 0.75);
  }

  // ---- the bandstand on the green: an eight-sided stage, posts, a striped roof ----
  {
    const b = P.bandstand;
    add(g, new THREE.CylinderGeometry(b.r, b.r + 0.1, b.h, 8), 0xf7f3ea, [b.x, b.h / 2, b.z]);
    add(g, new THREE.CylinderGeometry(b.r + 0.02, b.r + 0.02, 0.06, 8), 0x2f6a5a, [b.x, b.h, b.z], { cast: false });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8, x = b.x + Math.cos(a) * (b.r - 0.2), z = b.z + Math.sin(a) * (b.r - 0.2);
      add(g, new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), 0xfbf7ee, [x, b.h + 1.3, z]);
    }
    for (let k = 0; k < 8; k++) add(g, new THREE.ConeGeometry(b.r + 0.5, 1.4, 8, 1, true, (k / 8) * Math.PI * 2 + Math.PI / 8 - Math.PI / 2, Math.PI / 4), k % 2 ? 0xfbf7ee : 0x2f6a5a, [b.x, b.h + 3.3, b.z], { opts: { side: THREE.DoubleSide }, cast: k === 0 });
    add(g, new THREE.SphereGeometry(0.16, 10, 8), 0xe0b04a, [b.x, b.h + 4.1, b.z]);
    for (const s of [-1, 1]) { flagpole(g, s * 5, 5, 3.4, s < 0 ? ROSETTE[1] : ROSETTE[2]); C.circle(s * 5, 5, 0.1); bunting(g, [b.x + s * (b.r - 0.2), b.h + 2.5, b.z + 0.6], [s * 5, 3.2, 5]); }
    C.circle(b.x, b.z, b.r + 0.1, b.h); // (a step up: hop on and join the band)
  }

  // ---- 🎀 the show ring: a white rail round a ring of lighter grass, the judge's table, the rosette board ----
  {
    const r = P.ring, gapA = 0.32; // (the way in: east, facing the green)
    add(g, new THREE.CircleGeometry(r.r, 48), 0xa6cf82, [r.x, 0.004, r.z], { rot: [-Math.PI / 2, 0, 0], cast: false, season: 'plant' });
    for (const y of [0.5, 0.95]) add(g, new THREE.TorusGeometry(r.r, 0.04, 6, 64, Math.PI * 2 - gapA * 2), 0xfbf7ee, [r.x, y, r.z], { rot: [Math.PI / 2, 0, gapA] });
    for (let k = 0; k < 28; k++) {
      const a = gapA + (k / 27) * (Math.PI * 2 - gapA * 2), x = r.x + Math.cos(a) * r.r, z = r.z + Math.sin(a) * r.r;
      add(g, new THREE.CylinderGeometry(0.055, 0.06, 1.05, 6), 0xfbf7ee, [x, 0.52, z], { cast: k % 2 === 0 });
      C.circle(x, z, 0.08);
    }
    for (const s of [-1, 1]) flagpole(g, r.x + Math.cos(gapA * s) * r.r, r.z + Math.sin(gapA * s) * r.r, 2.2, ROSETTE[1 + (s > 0 ? 1 : 0)]);
    // The judge's table (a white cloth, rosettes laid out ready) and her chair.
    const j = P.judge;
    add(g, RB(2.2, 0.75, 0.8, 0.04), 0xfbf7ee, [j.x, 0.38, j.z + 0.75]);
    for (let i = 0; i < 4; i++) {
      const x = j.x - 0.75 + i * 0.5;
      add(g, new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), ROSETTE[i + 1], [x, 0.77, j.z + 0.7], { cast: false });
      add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.025, 12), 0xe0b04a, [x, 0.78, j.z + 0.7], { cast: false });
    }
    add(g, RB(0.5, 0.06, 0.5, 0.02), WOOD, [j.x + 1.4, 0.45, j.z - 0.1]);
    add(g, RB(0.5, 0.5, 0.06, 0.02), WOOD, [j.x + 1.4, 0.72, j.z - 0.33]);
    C.box(j.x - 1.15, j.z + 0.32, j.x + 1.15, j.z + 1.18, 0.8);
    // The rosette board: a green board with big rosettes, 1st to 4th.
    add(g, RB(2.6, 1.2, 0.1, 0.04), 0x2f6a5a, [j.x - 2.6, 1.3, j.z - 0.4], { rot: [0, 0.35, 0] });
    for (const sx of [-1.1, 1.1]) add(g, new THREE.BoxGeometry(0.08, 1.4, 0.08), WOOD, [j.x - 2.6 + sx * Math.cos(0.35), 0.7, j.z - 0.4 - sx * Math.sin(0.35)]);
    for (let i = 0; i < 4; i++) {
      const u = -0.9 + i * 0.6, x = j.x - 2.6 + u * Math.cos(0.35), z = j.z - 0.34 - u * Math.sin(0.35);
      add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18), ROSETTE[i + 1], [x, 1.45, z], { rot: [Math.PI / 2, 0, -0.35] });
      add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), 0xe0b04a, [x + 0.01, 1.45, z + 0.01], { rot: [Math.PI / 2, 0, -0.35] });
      add(g, new THREE.BoxGeometry(0.1, 0.35, 0.02), ROSETTE[i + 1], [x, 1.15, z], { rot: [0, 0.35, 0] });
    }
    C.box(j.x - 3.9, j.z - 0.9, j.x - 1.3, j.z + 0.1, Infinity, false);
    // The mark: a little white circle on the grass where a dog stands to show off.
    add(g, new THREE.RingGeometry(0.5, 0.62, 28), 0xfbf7ee, [P.mark.x, 0.012, P.mark.z], { rot: [-Math.PI / 2, 0, 0], cast: false });
    // Benches for the crowd, round the outside.
    for (const a of [2.0, 2.6, 3.4, 4.0, 4.7]) {
      const x = r.x + Math.cos(a) * (r.r + 1.6), z = r.z + Math.sin(a) * (r.r + 1.6), b = new THREE.Group();
      b.position.set(x, 0, z); b.rotation.y = -a - Math.PI / 2; g.add(b);
      add(b, RB(1.6, 0.07, 0.42, 0.02), WOOD, [0, 0.45, 0]);
      for (const sx of [-0.65, 0.65]) add(b, new THREE.BoxGeometry(0.06, 0.45, 0.38), 0x2f3a52, [sx, 0.22, 0]);
      C.circle(x, z, 0.75, 0.5);
    }
  }

  // ---- 🏅 the agility ring: a rope on posts all round, and the course itself (see ./agility.js) ----
  {
    const a = P.agility, rope = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 2.4));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        add(g, new THREE.CylinderGeometry(0.04, 0.05, 0.75, 6), 0xfbf7ee, [x, 0.37, z], { cast: false });
        add(g, new THREE.SphereGeometry(0.06, 8, 6), i % 2 ? 0xd9534f : 0x5b86c4, [x, 0.76, z], { cast: false });
      }
      add(g, new THREE.CylinderGeometry(0.015, 0.015, len, 4), 0xd9534f, [(x0 + x1) / 2, 0.62, (z0 + z1) / 2], { rot: [Math.PI / 2, 0, -Math.atan2(x1 - x0, z1 - z0)], cast: false });
    };
    rope(a.x0, a.z0, a.x1, a.z0); rope(a.x1, a.z0, a.x1, a.z1); rope(a.x0, a.z1, a.x1, a.z1);
    rope(a.x0, a.z0, a.x0, -3); rope(a.x0, 3, a.x0, a.z1); // (a way in on the green's side)
    flagpole(g, a.x0, -3, 2.2, 0x5b86c4);
    flagpole(g, a.x0, 3, 2.2, 0xf2c94c);
  }
  const dyn = new THREE.Group();
  dyn.position.set(ox, 0, oz);
  const course = buildCourse(g, dyn, C);

  // ---- 🥏 the frisbee field: cones marking it out, and a stack of frisbees by Ruby ----
  {
    const f = P.frisbee;
    for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1], [(f.x0 + f.x1) / 2, f.z0]]) {
      add(g, new THREE.ConeGeometry(0.16, 0.4, 12), 0xe8743c, [x, 0.2, z]);
      add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), 0xe8743c, [x, 0.015, z], { cast: false });
    }
    for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.12, 0.11, 0.02, 20), [0xe39a52, 0x5b86c4, 0xd9534f, 0x6f9a52][i], [f.kid.x + 0.9, 0.02 + i * 0.022, f.kid.z + 0.5], { cast: i === 3 });
  }

  // ---- 👃 the sniffing garden: a low picket fence, the Sniff & Seek tent, and things to hide a toy in ----
  {
    const s = P.seek, picket = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), f = new THREE.Group();
      f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      f.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      g.add(f);
      for (let q = -len / 2 + 0.15; q < len / 2; q += 0.3) add(f, new THREE.BoxGeometry(0.03, 0.55, 0.09), 0xfbf7ee, [0, 0.28, q], { cast: false });
      add(f, new THREE.BoxGeometry(0.04, 0.06, len), 0xfbf7ee, [0, 0.4, 0], { cast: false });
      C.box(Math.min(x0, x1) - 0.08, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(z0, z1) + 0.08, 0.6, false);
    };
    picket(s.x0, s.z1, s.gap.x - s.gap.w / 2, s.z1); picket(s.gap.x + s.gap.w / 2, s.z1, s.x1, s.z1);
    picket(s.x1, s.z0, s.x1, s.z1); picket(s.x0, s.z0, s.x0, s.z1);
    for (const h of P.hides) hideProp(g, h, C);
    // The Sniff & Seek tent by the way in: a little striped one (the Sniff Master stands in front with a basket).
    marquee(g, { x: s.x1 + 1.4, z: s.z1 - 1.5, w: 2.4, d: 2.0 }, 0xb69be0, C);
    add(g, RB(1.2, 0.7, 0.6, 0.04), 0xfbf7ee, [s.master.x - 1.2, 0.35, s.master.z - 0.2]);
    add(g, new THREE.CylinderGeometry(0.28, 0.22, 0.22, 14, 1, true), 0xb88a52, [s.master.x - 1.2, 0.81, s.master.z - 0.2], { opts: { side: THREE.DoubleSide } });
    for (let i = 0; i < 3; i++) add(g, new THREE.SphereGeometry(0.08, 10, 8), [0xd9534f, 0xc8dc4a, 0x5b86c4][i], [s.master.x - 1.3 + i * 0.1, 0.92, s.master.z - 0.2 + (i % 2) * 0.06], { cast: false });
    C.box(s.master.x - 1.8, s.master.z - 0.5, s.master.x - 0.6, s.master.z + 0.1, 0.75);
    // A few flower beds along the fence, for colour.
    for (let i = 0; i < 6; i++) pot(g, s.x0 + 1 + i * 3.6, s.z0 + 0.6, 1, [0xf2a0c8, 0xf2c94c, 0xb69be0][i % 3]);
  }

  // ---- bunting from pole to pole along the avenue, and flags ----
  for (const z of [9, 15, 21]) {
    for (const s of [-1, 1]) { flagpole(g, s * 2.6, z, 3.2, [0xd9534f, 0x5b86c4, 0xf2c94c][Math.abs(z) % 3]); C.circle(s * 2.6, z, 0.1); }
    bunting(g, [-2.6, 3.0, z], [2.6, 3.0, z]);
  }

  // ---- trees: a few inside along the edge, a ring of them out beyond the fence, hedges by the gate ----
  const tree = (x, z, s, k) => {
    add(g, new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 8), PALETTE.bark ?? 0x7a5a3e, [x, 0.8 * s, z], { cast: false });
    const leaf = add(g, blobGeometry(k, 0.3, 2), k % 2 ? 0x6f9a52 : 0x5f8f4a, [x, 2.1 * s, z], { scale: [1.5 * s, 1.3 * s, 1.5 * s], season: 'foliage' });
    leaf.userData.foliage = s > 1.2;
  };
  for (const [x, z, s] of [[-31, 20, 1.1], [-31, 8, 1.0], [31, 12, 1.2], [31, -26, 1.0], [-31, -6, 1.1], [24, 23, 0.9], [-22, 24, 1.0], [31, -2, 0.9]]) { tree(x, z, s, Math.round(x + z) + 40); C.circle(x, z, 0.28); }
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2, r = 44 + (k % 4) * 5, x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r;
    tree(x, z, 1.3 + (k % 3) * 0.3, k + 50);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) add(g, blobGeometry(70 + k, 0.3, 1), 0x5f8f4a, [s * (gw + 3 + k * 1.6), 0.55, P.Z1 + 0.8], { scale: [0.95, 0.65, 0.7], season: 'foliage', cast: false });

  const occluders = collectOccluders(g);
  const scene = new THREE.Scene();
  scene.add(mergeStatic(g));
  const sky = skyDome();
  scene.add(sky);
  scene.add(dyn);
  const world = {
    group: g, colliders: col, water: [], gardens: [], beds: [], bins: [],
    bounds: R(-P.X + 0.4, P.Z0 + 0.4, P.X - 0.4, P.Z1 - 0.4),
    occluders,
    camera: { distMax: 12 },
    W, R, C,
  };
  return { scene, world, dyn, sky, course };
}
