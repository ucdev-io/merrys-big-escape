import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../render/palette.js';
import { mesh, blobGeometry } from '../props.js';
import { fenceWithGate } from './areaProps.js';

/*
 * 🚜 The Farm's buildings and bits, each built in its own little frame (facing +z) and turned into place
 * in the area's (u, v) frame (x = u, z = v). Colliders go through a `place` (see placer()): the
 * area's colliders, moved and turned with the thing. Smooth, soft shapes (rounded boxes, lathes, blobs),
 * a few hundred vertices each; the whole farm is baked into the town's merged meshes.
 */

export const COL = {
  barn: 0xbb5a4c, barnDark: 0x94443a, trim: 0xf3ece0, roof: 0x6f6762, iron: 0x3e3b3a,
  hay: 0xe3c47c, hayDark: 0xc6a55f, straw: 0xe9d6a0,
  stone: 0xb6ad9f, stone2: 0xa59c8e, stone3: 0xc6bdae,
  tractor: 0xd45a45, hub: 0xf2c14e, tyre: 0x3f3b39,
  coop: 0xeadcbf, coopTrim: 0x8fb3a6, coopRoof: 0xa25a4c,
  ark: 0x9aa595, coat: 0x5d7aa8, patch: 0xd9534f, sack: 0xd9c49c,
  mud: 0x6e4d35, mudDark: 0x58392a, mudWet: 0x8f7058,
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const geos = new Map();
/** A shared rounded box (w × h × d). */
export function rbox(w, h, d, r = 0.05, seg = 1) {
  const key = `${w}|${h}|${d}|${r}|${seg}`;
  if (!geos.has(key)) geos.set(key, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)));
  return geos.get(key);
}
const cyl = (r0, r1, h, n = 12, open = false) => { const key = `c${r0}|${r1}|${h}|${n}|${open}`; if (!geos.has(key)) geos.set(key, new THREE.CylinderGeometry(r0, r1, h, n, 1, open)); return geos.get(key); };
const sph = (n = 12, m = 8) => { const key = `s${n}|${m}`; if (!geos.has(key)) geos.set(key, new THREE.SphereGeometry(1, n, m)); return geos.get(key); };

/**
 * Colliders for a thing at (u, v) turned by `ang` (as three.js turns a group round y): give them in the
 * thing's own frame. Boxes stay boxes (things are turned by quarter turns, or the box grows to fit).
 */
export function placer(C, u, v, ang = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const p = (x, z) => [u + x * c + z * s, v - x * s + z * c];
  return {
    p,
    box(x0, z0, x1, z1, top, stand) {
      const pts = [p(x0, z0), p(x1, z0), p(x0, z1), p(x1, z1)];
      return C.box(Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])), top, stand);
    },
    circle(x, z, r, top, stand) { const [a, b] = p(x, z); return C.circle(a, b, r, top, stand); },
  };
}

const group = (parent, u, v, ang = 0) => { const g = new THREE.Group(); g.position.set(u, 0, v); g.rotation.y = ang; parent?.add(g); return g; };
const solid = (m) => { m.userData.solid = true; return m; }; // (the camera comes round in front of it)

// ---------------------------------------------------------------------------------------------
// Hay

/** A square bale of hay (1 × 0.46 × 0.55), lying along x, with its two strings. */
const BALE = { w: 1.0, h: 0.46, d: 0.55 };
const stringGeo = new THREE.BoxGeometry(0.035, 0.468, 0.558);
export function squareBale(parent, x, y, z, rotY = 0, tone = 0) {
  const col = [COL.hay, 0xdcbd73, 0xe8cd8a][tone % 3];
  const b = mesh(rbox(BALE.w, BALE.h, BALE.d, 0.09), col, parent, [x, y + BALE.h / 2, z], [0, rotY, 0]);
  for (const s of [-0.25, 0.25]) {
    const str = mesh(stringGeo, COL.hayDark, parent, [x + Math.cos(rotY) * s, y + BALE.h / 2, z - Math.sin(rotY) * s], [0, rotY, 0]);
    str.castShadow = false;
  }
  return b;
}

/**
 * A stack of bales on a grid (cells 1 × 0.55 m, from x0, z0 going +x and +z), as layers of [i0, i1, j0, j1]
 * cell ranges (layer 0 on the ground, each up on the one below). Bales nobody could ever see (covered
 * on top and on every side, by bales or by `walls(i, j)`) aren't built at all.
 */
export function baleStack(parent, x0, z0, layers, { walls = () => false, dirX = 1, seed = 0 } = {}) {
  const has = (i, j, L) => { const r = layers[L]; return !!r && i >= r[0] && i <= r[1] && j >= r[2] && j <= r[3]; };
  const shut = (i, j, L) => has(i, j, L) || walls(i, j);
  layers.forEach(([i0, i1, j0, j1], L) => {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (has(i, j, L + 1) && shut(i - 1, j, L) && shut(i + 1, j, L) && shut(i, j - 1, L) && shut(i, j + 1, L)) continue;
      const k = i * 3 + j * 5 + L * 7 + seed, jit = ((k % 5) - 2) * 0.012;
      squareBale(parent, x0 + dirX * (i + 0.5) * BALE.w + jit, L * BALE.h, z0 + (j + 0.5) * BALE.d, jit * 2, k);
    }
  });
}

/** A round bale lying on its side (axis along x), 1.3 across and 1.15 long, with a swirl on each end. */
let roundGeo = null;
export function roundBale(parent, x, z, rotY) {
  const g = group(parent, x, z, rotY);
  roundGeo ??= new THREE.CylinderGeometry(0.65, 0.65, 1.15, 22, 1);
  mesh(roundGeo, COL.hay, g, [0, 0.64, 0], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) for (const [r, c] of [[0.48, COL.hayDark], [0.3, 0xd8b86e], [0.13, COL.hayDark]]) {
    const ring = mesh(new THREE.RingGeometry(r - 0.035, r, 24), c, g, [s * 0.577, 0.64, 0], [0, (s * Math.PI) / 2, 0]);
    ring.castShadow = false;
  }
  return g;
}

/**
 * The hay castle: square bales stacked into steps (0.5, 1.0, 1.5 m) with a round bale "throne" on top.
 * Built facing +z: you climb it from the front. Each step is a collider you can stand on.
 */
export function hayCastle(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang), P = placer(C, u, v, ang);
  // (front to back: a step of one bale, two, three: rows 4–5, 2–3 and 0–1)
  baleStack(g, -1.5, -1.65, [[0, 2, 0, 5], [0, 2, 0, 3], [0, 2, 0, 1]]);
  P.box(-1.5, 0.55, 1.5, 1.65, 0.46);
  P.box(-1.5, -0.55, 1.5, 0.55, 0.92);
  P.box(-1.5, -1.65, 1.5, -0.55, 1.38);
  // A pitchfork stuck in the top, and loose hay scattered round about.
  mesh(cyl(0.022, 0.022, 1.5, 6), PALETTE.woodDark, g, [1.05, 1.38 + 0.55, -1.15], [0.25, 0, 0.2]);
  for (let i = 0; i < 3; i++) mesh(cyl(0.008, 0.006, 0.3, 4), COL.iron, g, [1.05 + 0.25 * 0.2 + (i - 1) * 0.04 - 0.16, 1.38 + 1.33, -1.15 + 0.2], [0.25, 0, 0.2]);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1, r = 2.0 + (i % 3) * 0.35;
    const m = mesh(blobGeometry(30 + i, 0.4, 1), COL.straw, g, [Math.cos(a) * r, 0.0, Math.sin(a) * r * 0.8], [0, a, 0], [0.35, 0.05, 0.22]);
    m.castShadow = false;
    m.userData.season = 'world';
  }
  return { top: P.p(0, -1.1), y: 1.38 };
}

// ---------------------------------------------------------------------------------------------
// The barn

/** A gambrel roof's line (the classic barn roof: steep, then shallow), x across, y up, from eave to eave. */
function gambrel(w, H) {
  const hw = w / 2;
  return [[-hw, H], [-hw + 1.05, H + 1.75], [0, H + 2.75], [hw - 1.05, H + 1.75], [hw, H]];
}

/** A line moved out by t (to the left of its direction: up and out, for a roof line drawn eave to eave). */
function offsetLine(pts, t) {
  const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  return pts.map((b, i) => {
    const n1 = i > 0 ? nrm(pts[i - 1], b) : null, n2 = i < pts.length - 1 ? nrm(b, pts[i + 1]) : null;
    const one = n1 ?? n2, sum = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : one, l = Math.hypot(sum[0], sum[1]) || 1;
    const k = t / ((sum[0] / l) * one[0] + (sum[1] / l) * one[1]); // (further out at the bends, so the band keeps its thickness)
    return [b[0] + (sum[0] / l) * k, b[1] + (sum[1] / l) * k];
  });
}

/** Stretch a line's two ends out along its first and last bits (the eaves hang over the walls). */
function overhang(pts, e) {
  const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + (dx / l) * e, a[1] + (dy / l) * e]; };
  return [ext(pts[0], pts[1]), ...pts.slice(1, -1), ext(pts[pts.length - 1], pts[pts.length - 2])];
}

/**
 * The big red barn: walls you can walk inside, its doors flung open, a gambrel roof, a hayloft door, a
 * weathervane, and a mountain of hay bales piled up in one back corner (steps up to the "hayloft").
 * Built facing +z (doors at the front). side: which way (±x) the hay is piled.
 * Returns where things are, in the area's frame.
 */
export function barn(parent, b, C, side = 1) {
  const g = group(parent, b.u, b.v, b.face), P = placer(C, b.u, b.v, b.face);
  const { w, d, door } = b, H = 3.3, t = 0.24, doorH = 2.75, hw = w / 2, hd = d / 2;
  const wall = (W, Hh, D, x, y, z) => solid(mesh(rbox(W, Hh, D, 0.07), COL.barn, g, [x, y, z]));
  // Floor: straw over beaten earth (no snow gets in).
  const floor = mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), COL.straw, g, [0, 0.045, 0], [-Math.PI / 2, 0, 0]);
  floor.castShadow = false;
  floor.userData.season = 'none';
  // Walls.
  wall(w, H, t, 0, H / 2, -hd + t / 2);
  for (const s of [-1, 1]) wall(t, H, d, s * (hw - t / 2), H / 2, 0);
  const side2 = (w - door) / 2;
  for (const s of [-1, 1]) wall(side2, H, t, s * (door / 2 + side2 / 2), H / 2, hd - t / 2);
  wall(door + 0.02, H - doorH, t, 0, doorH + (H - doorH) / 2, hd - t / 2);
  P.box(-hw, -hd, hw, -hd + t);
  for (const s of [-1, 1]) P.box(s > 0 ? hw - t : -hw, -hd, s > 0 ? hw : -hw + t, hd);
  for (const s of [-1, 1]) P.box(s > 0 ? door / 2 : -hw, hd - t, s > 0 ? hw : -door / 2, hd);
  // White trim: the corners, round the doorway, a band under the eaves.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(rbox(0.17, H, 0.17, 0.04), COL.trim, g, [sx * (hw - 0.05), H / 2, sz * (hd - 0.05)]);
  for (const s of [-1, 1]) mesh(rbox(0.16, doorH, 0.12, 0.03), COL.trim, g, [s * (door / 2 + 0.06), doorH / 2, hd + 0.02]);
  mesh(rbox(door + 0.32, 0.16, 0.12, 0.03), COL.trim, g, [0, doorH + 0.05, hd + 0.02]);
  // The doors, flung wide open (hinged at the sides of the doorway): red, with white frames and a white X.
  const leafW = door / 2 - 0.04, leafH = doorH - 0.1;
  for (const s of [-1, 1]) {
    const hinge = group(g, s * door / 2, hd + 0.08, s * (Math.PI / 2 + 0.22));
    const leaf = group(hinge, 0, 0);
    const x0 = -s * leafW / 2; // (the leaf runs from its hinge towards where the middle of the doorway was)
    mesh(rbox(leafW, leafH, 0.08, 0.025), COL.barnDark, leaf, [x0, leafH / 2 + 0.04, 0]);
    for (const y of [0.1, leafH - 0.02]) mesh(rbox(leafW, 0.12, 0.1, 0.02), COL.trim, leaf, [x0, y + 0.04, 0.01]);
    for (const x of [0.06, leafW - 0.06]) mesh(rbox(0.12, leafH, 0.1, 0.02), COL.trim, leaf, [-s * x, leafH / 2 + 0.04, 0.01]);
    const diag = Math.hypot(leafW, leafH - 0.2), ang = Math.atan2(leafH - 0.2, leafW);
    for (const k of [-1, 1]) mesh(rbox(diag, 0.1, 0.1, 0.02), COL.trim, leaf, [x0, leafH / 2 + 0.04, 0.02], [0, 0, k * ang]);
    // (open, each lies nearly flat against the front: a thin wall)
    const ex = s * door / 2 + Math.cos(s * (Math.PI / 2 + 0.22)) * -s * leafW, ez = hd + 0.08 - Math.sin(s * (Math.PI / 2 + 0.22)) * -s * leafW;
    P.box(Math.min(s * door / 2, ex) - 0.08, Math.min(hd, ez), Math.max(s * door / 2, ex) + 0.08, Math.max(hd + 0.1, ez));
  }
  // The roof: red gable ends (with a hayloft door at the front) under a slate-grey gambrel roof.
  const shape = (pts) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath(); return sh; };
  const line = gambrel(w - 0.02, H - 0.02);
  const fill = new THREE.ExtrudeGeometry(shape(line), { depth: d - 0.04, bevelEnabled: false });
  fill.translate(0, 0, -(d - 0.04) / 2);
  const gable = solid(mesh(fill, COL.barn, g));
  gable.userData.season = 'world';
  const inner = overhang(line, 0.42), outer = overhang(offsetLine(line, 0.22), 0.42); // (the roof sits right on the gables)
  const band = new THREE.ExtrudeGeometry(shape([...outer, ...inner.reverse()]), { depth: d + 0.7, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  band.translate(0, 0, -(d + 0.7) / 2);
  const roof = solid(mesh(band, COL.roof, g));
  roof.userData.season = 'world';
  // The hayloft door up in the front gable, and the hoist beam over it.
  mesh(rbox(1.25, 1.2, 0.08, 0.03), COL.trim, g, [0, H + 0.95, hd + 0.01]);
  mesh(rbox(1.0, 0.98, 0.1, 0.02), COL.barnDark, g, [0, H + 0.95, hd + 0.03]);
  for (const k of [-1, 1]) mesh(rbox(1.3, 0.08, 0.08, 0.02), COL.trim, g, [0, H + 0.95, hd + 0.09], [0, 0, k * 0.78]);
  mesh(rbox(0.16, 0.16, 0.9, 0.03), PALETTE.woodDark, g, [0, H + 2.42, hd + 0.3]);
  mesh(cyl(0.012, 0.012, 0.9, 4), 0xd8cfbf, g, [0, H + 1.95, hd + 0.68]);
  // A weathervane: a little cockerel on the ridge.
  const vane = group(g, 0, 0);
  mesh(cyl(0.025, 0.03, 0.9, 6), COL.iron, vane, [0, H + 3.05, 0]);
  for (const r of [0, Math.PI / 2]) mesh(rbox(0.7, 0.025, 0.025, 0.01), COL.iron, vane, [0, H + 3.2, 0], [0, r, 0]);
  const cock = new THREE.Shape();
  cock.moveTo(-0.28, 0); cock.lineTo(0.12, 0); cock.quadraticCurveTo(0.26, 0.05, 0.24, 0.2); cock.lineTo(0.3, 0.24); cock.lineTo(0.23, 0.27);
  cock.quadraticCurveTo(0.2, 0.36, 0.13, 0.3); cock.quadraticCurveTo(0.0, 0.12, -0.12, 0.14); cock.quadraticCurveTo(-0.3, 0.38, -0.36, 0.2); cock.closePath();
  const cg = new THREE.ExtrudeGeometry(cock, { depth: 0.025, bevelEnabled: false });
  cg.translate(0, 0, -0.0125);
  mesh(cg, COL.iron, vane, [0, H + 3.45, 0], [0, 0.6, 0]);
  // Inside: a mountain of bales in one back corner, in steps (the hayloft), and loose straw.
  const ix = side, xin = hw - t - 0.02, zin = hd - t - 0.02;
  const tiers = [[0, 4, 0, 8], [0, 3, 0, 5], [0, 2, 0, 3]]; // (bale cells from the corner: 5 × 9, then 4 × 6, then 3 × 4)
  baleStack(g, ix * xin, -zin, tiers, { dirX: -ix, walls: (i, j) => i < 0 || j < 0 });
  tiers.forEach(([, i1, , j1], k) => {
    const xa = ix * (xin - (i1 + 1) * BALE.w), xb = ix * xin;
    P.box(Math.min(xa, xb), -zin, Math.max(xa, xb), -zin + (j1 + 1) * BALE.d, (k + 1) * BALE.h);
  });
  for (let i = 0; i < 7; i++) {
    const m = mesh(blobGeometry(40 + i, 0.4, 1), COL.straw, g, [(-ix) * (1 + (i % 4) * 1.0), 0.04, -1.5 + (i % 3) * 1.4], [0, i, 0], [0.45, 0.05, 0.3]);
    m.castShadow = false;
    m.userData.season = 'none';
  }
  // A lantern on a hook by the door, inside.
  mesh(cyl(0.07, 0.08, 0.16, 8), 0xf1d98a, g, [-ix * (door / 2 + 0.5), 2.1, hd - t - 0.12]);
  mesh(cyl(0.085, 0.085, 0.03, 8), COL.iron, g, [-ix * (door / 2 + 0.5), 2.2, hd - t - 0.12]);
  return {
    loft: P.p(ix * 3.6, -2.4), loftY: 3 * BALE.h,
    door: P.p(0, hd + 0.9), inside: P.p(0, 0),
    rosettes: P.p(-ix * (door / 2 + side2 / 2), hd + 0.02), // (a board for rosettes, on the front wall beside the doors)
  };
}

// ---------------------------------------------------------------------------------------------
// Little buildings

/** The hen house: a cosy box on legs with a ramp up to its pop-hole and a nesting box on the side. Facing +z. */
export function coop(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang), P = placer(C, u, v, ang);
  for (const x of [-0.65, 0.65]) for (const z of [-0.45, 0.45]) mesh(cyl(0.045, 0.05, 0.5, 6), PALETTE.woodDark, g, [x, 0.25, z]);
  mesh(rbox(1.55, 0.85, 1.1, 0.06), COL.coop, g, [0, 0.92, 0]);
  for (const x of [-0.78, 0.78]) mesh(rbox(0.08, 0.86, 1.12, 0.02), COL.coopTrim, g, [x, 0.92, 0]);
  for (const s of [-1, 1]) { // the roof: two boards meeting at the top
    const r = mesh(rbox(1.8, 0.07, 0.78, 0.03), COL.coopRoof, g, [0, 1.55, s * 0.31], [s * 0.62, 0, 0]);
    r.userData.season = 'world';
  }
  for (const s of [-1, 1]) {
    const tri = new THREE.Shape(); tri.moveTo(-0.55, 0); tri.lineTo(0.55, 0); tri.lineTo(0, 0.38); tri.closePath();
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false });
    mesh(tg, COL.coop, g, [s * 0.75, 1.33, 0], [0, Math.PI / 2, 0]);
  }
  // The pop-hole, the ramp (with slats) and the nesting box.
  mesh(new THREE.CircleGeometry(0.16, 14), 0x3a2a22, g, [0.25, 0.82, 0.56]).castShadow = false;
  const ramp = group(g, 0.25, 0.56);
  ramp.position.y = 0.0;
  const rl = 1.0, ra = Math.atan2(0.62, rl);
  mesh(rbox(0.3, 0.04, Math.hypot(rl, 0.62), 0.015), PALETTE.wood, ramp, [0, 0.33, rl / 2], [ra, 0, 0]);
  for (let i = 0; i < 4; i++) mesh(rbox(0.3, 0.025, 0.03, 0.01), PALETTE.woodDark, ramp, [0, 0.62 - (i + 0.5) * 0.15 + 0.03, (i + 0.5) * (rl / 4)], [ra, 0, 0]);
  mesh(rbox(0.6, 0.45, 0.45, 0.04), COL.coop, g, [-0.25, 0.8, -0.75]);
  mesh(rbox(0.66, 0.05, 0.52, 0.02), COL.coopRoof, g, [-0.25, 1.06, -0.75], [-0.3, 0, 0]).userData.season = 'world';
  P.box(-0.8, -1.0, 0.8, 0.6, 1.3, false);
  return { door: P.p(0.25, 1.7) };
}

/** A pig ark: a little curved tin hut with an arched doorway. Facing +z. */
function pigArk(parent, x, z, ang) {
  const g = group(parent, x, z, ang);
  const shell = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 18, 1, true, Math.PI / 2, Math.PI);
  shell.rotateX(Math.PI / 2);
  const arkMesh = mesh(shell, COL.ark, g, [0, 0, 0], [0, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
  arkMesh.userData.season = 'world';
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.TorusGeometry(0.755, 0.012, 4, 18, Math.PI);
    mesh(rib, 0x88927f, g, [0, 0, i * 0.21]).castShadow = false;
  }
  const back = new THREE.CircleGeometry(0.75, 18, 0, Math.PI);
  mesh(back, 0x88927f, g, [0, 0, -0.74], [0, Math.PI, 0]);
  const front = new THREE.Shape();
  front.absarc(0, 0, 0.75, 0, Math.PI, false); front.lineTo(-0.3, 0); front.absarc(0, 0, 0.3, Math.PI, 0, true); front.lineTo(0.75, 0);
  mesh(new THREE.ShapeGeometry(front, 10), 0x88927f, g, [0, 0, 0.74]);
  mesh(new THREE.CircleGeometry(0.3, 12, 0, Math.PI), 0x2c221d, g, [0, 0.0, 0.7]).castShadow = false;
  mesh(new THREE.PlaneGeometry(1.4, 1.4), COL.straw, g, [0, 0.03, 0], [-Math.PI / 2, 0, 0]).userData.season = 'none';
  return g;
}

/**
 * The pigsty: low stone walls (two courses of stones) round a muddy pen, a gap for a gate on the side
 * facing the yard, a pig ark in the far corner and a wooden trough. s: which way (±u) is away from the yard.
 */
export function pigsty(parent, st, C, s) {
  const g = group(parent, st.u, st.v), P = placer(C, st.u, st.v);
  const { hu, hv, gate } = st, H = 0.62;
  const stone = sph(7, 4); // (smooth, squashed pebbles of stone, stacked in two courses)
  const stones = (x0, z0, x1, z1, seed) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.6)), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let course = 0; course < 2; course++) for (let i = 0; i < n + course; i++) {
      const end = course && (i === 0 || i === n), t = course ? (i === 0 ? 0.25 / n : i === n ? 1 - 0.25 / n : i / n) : (i + 0.5) / n, w = (len / n) * (end ? 0.5 : 1);
      const k = (i * 7 + course * 3 + seed) % 3;
      mesh(stone, [COL.stone, COL.stone2, COL.stone3][k], g, [x0 + (x1 - x0) * t, 0.15 + course * 0.28, z0 + (z1 - z0) * t], [0.04 * (k - 1), ang, 0.05 * (k - 1)], [0.19, 0.17, w * 0.56]);
    }
    mesh(rbox(0.4, 0.06, len + 0.2, 0.03), COL.stone3, g, [(x0 + x1) / 2, H - 0.02, (z0 + z1) / 2], [0, ang, 0]).userData.season = 'world';
  };
  // (the gate gap: in the wall nearest the yard, at -s)
  const gx = -s * hu;
  stones(-hu, -hv, hu, -hv, 0); stones(-hu, hv, hu, hv, 1); stones(s * hu, -hv, s * hu, hv, 2);
  stones(gx, -hv, gx, -gate / 2, 3); stones(gx, gate / 2, gx, hv, 4);
  P.box(-hu - 0.2, -hv - 0.2, hu + 0.2, -hv + 0.2, H + 0.02, false);
  P.box(-hu - 0.2, hv - 0.2, hu + 0.2, hv + 0.2, H + 0.02, false);
  P.box(s * hu - 0.2, -hv, s * hu + 0.2, hv, H + 0.02, false);
  P.box(gx - 0.2, -hv, gx + 0.2, -gate / 2, H + 0.02, false);
  P.box(gx - 0.2, gate / 2, gx + 0.2, hv, H + 0.02, false);
  // A wooden gate standing open, folded back against the outside of the wall.
  const glen = gate - 0.1, gzc = gate / 2 + glen / 2 + 0.05, gxo = gx - s * 0.26;
  for (let i = 0; i < 4; i++) mesh(rbox(0.05, 0.06, glen, 0.02), PALETTE.wood, g, [gxo, 0.14 + i * 0.15, gzc]);
  for (const z of [gzc - glen / 2 + 0.04, gzc + glen / 2 - 0.04]) mesh(rbox(0.06, 0.62, 0.06, 0.02), PALETTE.woodDark, g, [gxo, 0.33, z]);
  // The pig ark (in the far back corner) and the trough (along the front wall).
  pigArk(g, s * (hu - 0.95), hv - 0.95, s > 0 ? -Math.PI * 0.75 : Math.PI * 0.75);
  P.circle(s * (hu - 0.95), hv - 0.95, 0.72, 0.8);
  mesh(rbox(1.4, 0.3, 0.42, 0.04), PALETTE.woodDark, g, [s * 0.4, 0.15, -hv + 0.45]);
  mesh(rbox(1.25, 0.06, 0.3, 0.02), 0x4a3a2c, g, [s * 0.4, 0.29, -hv + 0.45]).castShadow = false;
  P.box(s * 0.4 - 0.7, -hv + 0.24, s * 0.4 + 0.7, -hv + 0.66, 0.32);
  return {
    gate: P.p(gx - s * 0.9, 0), inGate: P.p(gx + s * 0.8, 0), trough: P.p(s * 0.4, -hv + 0.95), ark: P.p(s * (hu - 0.95), hv - 0.95),
  };
}

/** The old well: a round stone wall, two posts, a little roof, a winch and a bucket. */
export function well(parent, u, v, C) {
  const g = group(parent, u, v, 0.3);
  const ring = new THREE.LatheGeometry([V(0.62, 0, 0), V(0.82, 0, 0), V(0.84, 0.66, 0), V(0.8, 0.74, 0), V(0.66, 0.74, 0), V(0.62, 0.66, 0)].map((p) => new THREE.Vector2(p.x, p.y)), 22);
  const r = mesh(ring, COL.stone, g);
  r.userData.season = 'world';
  mesh(new THREE.CircleGeometry(0.62, 18), 0x2e3b44, g, [0, 0.3, 0], [-Math.PI / 2, 0, 0]).userData.season = 'none';
  for (const s of [-1, 1]) mesh(rbox(0.12, 1.5, 0.12, 0.03), PALETTE.woodDark, g, [s * 0.74, 1.4, 0]);
  mesh(cyl(0.07, 0.07, 1.36, 10), PALETTE.wood, g, [0, 1.55, 0], [0, 0, Math.PI / 2]);
  mesh(cyl(0.008, 0.008, 0.6, 4), 0xd8cfbf, g, [0.12, 1.25, 0]);
  mesh(cyl(0.11, 0.09, 0.18, 10), PALETTE.woodDark, g, [0.12, 0.88, 0]);
  for (const s of [-1, 1]) { const rf = mesh(rbox(1.9, 0.06, 0.72, 0.02), COL.coopRoof, g, [0, 2.32, s * 0.28], [s * 0.7, 0, 0]); rf.userData.season = 'world'; }
  C.circle(u, v, 0.86, 0.76, false);
  return g;
}

/** A stone water trough (hop up on its edge). */
export function trough(parent, u, v, rot, C) {
  const g = group(parent, u, v, rot);
  mesh(rbox(1.6, 0.5, 0.62, 0.08), COL.stone2, g, [0, 0.25, 0]).userData.season = 'world';
  const w = mesh(new THREE.PlaneGeometry(1.3, 0.36), PALETTE.water, g, [0, 0.503, 0], [-Math.PI / 2, 0, 0]); // (full to the brim)
  w.castShadow = false;
  w.userData.season = 'none';
  placer(C, u, v, rot).box(-0.8, -0.31, 0.8, 0.31, 0.5);
  return g;
}

/** A little red tractor, parked. Facing +z. Its bonnet (and the cab roof) can be stood on. */
export function tractor(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang), P = placer(C, u, v, ang);
  const tyreB = new THREE.TorusGeometry(0.42, 0.17, 10, 22), tyreS = new THREE.TorusGeometry(0.22, 0.1, 8, 18);
  for (const s of [-1, 1]) {
    mesh(tyreB, COL.tyre, g, [s * 0.74, 0.59, -0.5], [0, Math.PI / 2, 0]);
    mesh(cyl(0.3, 0.3, 0.22, 16), COL.hub, g, [s * 0.74, 0.59, -0.5], [0, 0, Math.PI / 2]);
    mesh(cyl(0.08, 0.08, 0.26, 8), COL.tyre, g, [s * 0.74, 0.59, -0.5], [0, 0, Math.PI / 2]);
    mesh(tyreS, COL.tyre, g, [s * 0.52, 0.32, 0.95], [0, Math.PI / 2, 0]);
    mesh(cyl(0.15, 0.15, 0.13, 12), COL.hub, g, [s * 0.52, 0.32, 0.95], [0, 0, Math.PI / 2]);
    const guard = new THREE.CylinderGeometry(0.66, 0.66, 0.42, 16, 1, true, 0.25, Math.PI - 0.5);
    mesh(guard, COL.tractor, g, [s * 0.74, 0.6, -0.5], [0, 0, Math.PI / 2], [1, 1, 1], { side: THREE.DoubleSide });
  }
  mesh(rbox(0.72, 0.6, 1.55, 0.14, 2), COL.tractor, g, [0, 0.78, 0.45]);            // bonnet
  mesh(rbox(0.6, 0.42, 0.06, 0.03), 0x4a4440, g, [0, 0.76, 1.22]);                  // grille
  for (const s of [-1, 1]) mesh(sph(10, 8), 0xfbf3d8, g, [s * 0.24, 0.98, 1.2], [0, 0, 0], [0.07, 0.07, 0.04]);
  mesh(rbox(1.05, 0.3, 1.05, 0.08), COL.tractor, g, [0, 0.55, -0.45]);              // under the cab
  mesh(rbox(0.5, 0.12, 0.42, 0.05), 0x3a3634, g, [0, 1.02, -0.62]);                 // seat
  mesh(rbox(0.5, 0.4, 0.08, 0.04), 0x3a3634, g, [0, 1.2, -0.84]);
  mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 16), 0x2f2c2b, g, [0, 1.3, -0.15], [-0.9, 0, 0]);
  mesh(cyl(0.02, 0.02, 0.4, 6), 0x2f2c2b, g, [0, 1.15, -0.05], [-0.6, 0, 0]);
  for (const sx of [-1, 1]) for (const z of [-0.95, -0.12]) mesh(cyl(0.03, 0.03, 1.15, 6), 0x2f2c2b, g, [sx * 0.52, 1.5, z]);
  mesh(rbox(1.25, 0.09, 1.1, 0.04), COL.trim, g, [0, 2.1, -0.53]).userData.season = 'world'; // cab roof
  mesh(cyl(0.045, 0.05, 0.62, 8), 0x2f2c2b, g, [0.22, 1.35, 0.95]);                 // exhaust
  mesh(cyl(0.06, 0.045, 0.08, 8), 0x2f2c2b, g, [0.22, 1.68, 0.95]);
  P.box(-0.95, -1.0, 0.95, 0.05, 1.08);
  P.box(-0.4, 0.05, 0.4, 1.25, 1.08);
  P.box(-0.62, -1.0, 0.62, -0.06, 2.15);
  return { seat: P.p(0, -0.6) };
}

/** The scarecrow: a patched coat on a cross of sticks, straw hands, a turnip head and a battered hat. */
export function scarecrow(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang);
  mesh(cyl(0.05, 0.06, 2.0, 7), PALETTE.woodDark, g, [0, 1.0, 0]);
  mesh(cyl(0.04, 0.04, 1.5, 7), PALETTE.woodDark, g, [0, 1.45, 0], [0, 0, Math.PI / 2]);
  const coat = new THREE.LatheGeometry([[0.001, 0.0], [0.33, 0.02], [0.28, 0.35], [0.22, 0.7], [0.12, 0.78], [0.001, 0.8]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  mesh(coat, COL.coat, g, [0, 0.92, 0]);
  mesh(rbox(0.16, 0.16, 0.03, 0.02), COL.patch, g, [0.08, 1.18, 0.26], [0.25, 0, 0.2]);
  mesh(rbox(0.12, 0.1, 0.03, 0.02), 0xf2c14e, g, [-0.12, 1.32, 0.21], [0.4, 0, -0.3]);
  for (const s of [-1, 1]) {
    mesh(cyl(0.085, 0.1, 0.5, 9), COL.coat, g, [s * 0.38, 1.45, 0], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(0.03, 0.2, 5), COL.straw, g, [s * 0.68, 1.45 + (i - 1) * 0.04, (i - 1) * 0.03], [0, 0, -s * (Math.PI / 2 + (i - 1) * 0.35)]);
  }
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; mesh(new THREE.ConeGeometry(0.035, 0.22, 5), COL.straw, g, [Math.cos(a) * 0.27, 0.86, Math.sin(a) * 0.27], [Math.PI + Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]); }
  // The turnip head: white below, purple on top, with button eyes and a stitched grin.
  const head = new THREE.SphereGeometry(0.21, 16, 12), cols = [], p = head.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.set(p.getY(i) > 0.06 ? 0xa86aa6 : 0xf3ede2); cols.push(c.r, c.g, c.b); }
  head.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  mesh(head, 0xffffff, g, [0, 1.95, 0], [0, 0, 0], [1, 0.92, 1], { vertexColors: true });
  for (const s of [-1, 1]) mesh(sph(8, 6), 0x2b2522, g, [s * 0.075, 1.99, 0.18], [0, 0, 0], [0.03, 0.03, 0.015]);
  mesh(new THREE.TorusGeometry(0.08, 0.008, 4, 12, Math.PI), 0x2b2522, g, [0, 1.92, 0.19], [0, 0, Math.PI]);
  mesh(cyl(0.15, 0.17, 0.2, 12), 0x7a5a3e, g, [0, 2.2, 0], [0.1, 0, -0.12]);
  mesh(cyl(0.34, 0.34, 0.025, 16), 0x7a5a3e, g, [0, 2.11, 0], [0.1, 0, -0.12]).userData.season = 'world';
  mesh(cyl(0.155, 0.155, 0.04, 12, true), 0xd9534f, g, [0, 2.15, 0], [0.1, 0, -0.12]);
  C.circle(u, v, 0.22);
  return { hat: [u, v], hatY: 2.33 };
}

/** A field gate fence along v (at u = fu, from v0 to v1), a gate at gateV: post-and-rail, like the woods'. */
export function fenceAlongV(parent, fu, v0, v1, gateV, C) {
  const g = new THREE.Group();
  g.rotation.y = -Math.PI / 2; // (its x runs along v; its z is minus u)
  parent.add(g);
  const C2 = {
    box: (x0, z0, x1, z1, top, stand) => C.box(-Math.max(z0, z1), Math.min(x0, x1), -Math.min(z0, z1), Math.max(x0, x1), top, stand),
    circle: (x, z, r, top, stand) => C.circle(-z, x, r, top, stand),
  };
  g.add(fenceWithGate(v0, v1, -fu, gateV, C2));
  return g;
}

/** A hedgerow from (u0, v0) to (u1, v1), with a gap (gap: [from, to] along it, 0..1) — soft blobs of green. */
export function hedgerow(parent, u0, v0, u1, v1, rng, C = null, { gap = null, h = 1.0, step = 1.25 } = {}) {
  const len = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (gap && t > gap[0] && t < gap[1]) continue;
    const s = rng.float(0.72, 0.92) * Math.max(1, step / 1.3); // (further apart: bigger, so they still meet)
    mesh(blobGeometry(rng.int(0, 30), 0.25, 1), rng.pick([0x6f9a52, 0x5d8c55, 0x7fae64, 0x678f4f]), parent,
      [u0 + (u1 - u0) * t + rng.float(-0.1, 0.1), h * 0.52, v0 + (v1 - v0) * t + rng.float(-0.1, 0.1)], [rng.float(0, 3), rng.float(0, 3), 0], [s, h * 0.62, s]);
  }
  if (!C) return;
  const pad = 0.5, top = h * 1.25;
  const seg = (a, b) => { const [ua, va] = [u0 + (u1 - u0) * a, v0 + (v1 - v0) * a], [ub, vb] = [u0 + (u1 - u0) * b, v0 + (v1 - v0) * b]; C.box(Math.min(ua, ub) - pad, Math.min(va, vb) - pad, Math.max(ua, ub) + pad, Math.max(va, vb) + pad, top, false); };
  if (gap) { seg(0, gap[0]); seg(gap[1], 1); } else seg(0, 1);
}

/** A gateway in a hedge along u at v: two stout posts and a five-bar gate swung open (into the farm). */
export function gateway(parent, u, v, C, gap = 2.4) {
  const g = group(parent, u, v);
  for (const s of [-1, 1]) {
    mesh(cyl(0.11, 0.13, 1.45, 10), PALETTE.woodDark, g, [s * gap / 2, 0.72, 0]);
    mesh(sph(10, 6), PALETTE.woodDark, g, [s * gap / 2, 1.45, 0], [0, 0, 0], [0.12, 0.06, 0.12]);
    C.circle(u + s * gap / 2, v, 0.14, 1.5, false);
  }
  const leaf = group(g, gap / 2 + 0.06, 0.1, Math.PI / 2 + 0.15), L = gap - 0.15;
  for (let i = 0; i < 5; i++) mesh(rbox(L, 0.08, 0.05, 0.02), PALETTE.wood, leaf, [-L / 2, 0.3 + i * 0.19, 0]);
  for (const x of [-0.05, -L + 0.05]) mesh(rbox(0.09, 1.0, 0.07, 0.02), PALETTE.wood, leaf, [x, 0.68, 0]);
  const br = Math.hypot(L, 0.76);
  mesh(rbox(br, 0.07, 0.05, 0.02), PALETTE.wood, leaf, [-L / 2, 0.68, 0.01], [0, 0, Math.atan2(0.76, L)]);
  // (open, it lies along +v from its hinge: a thin wall you can jump)
  C.box(u + gap / 2 - 0.1, v + 0.1, u + gap / 2 + 0.3, v + 0.1 + L * 0.99, 1.15, false);
  return g;
}

/**
 * The sheep pen: woven hurdles on three sides (the field's own fence is the fourth), the open side facing
 * out into the field, with a gate that the farmer swings shut once the flock's in (see game/town/farm/).
 */
export function sheepPen(parent, pen, C) {
  const g = new THREE.Group();
  parent.add(g);
  const H = 0.95, wood = 0xa8875e, dark = 0x86684a;
  const hurdle = (u0, v0, u1, v1, diagonal = false) => {
    const len = Math.hypot(u1 - u0, v1 - v0), ang = Math.atan2(u1 - u0, v1 - v0), n = Math.max(1, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) { const t = i / n; mesh(rbox(0.09, H + 0.1, 0.09, 0.02), dark, g, [u0 + (u1 - u0) * t, (H + 0.1) / 2, v0 + (v1 - v0) * t]); }
    for (let k = 0; k < 4; k++) mesh(rbox(0.05, 0.12, len, 0.02), k % 2 ? wood : 0xb8976c, g, [(u0 + u1) / 2, 0.2 + k * 0.22, (v0 + v1) / 2], [0, ang, 0]);
    if (!diagonal) { C.box(Math.min(u0, u1) - 0.12, Math.min(v0, v1) - 0.12, Math.max(u0, u1) + 0.12, Math.max(v0, v1) + 0.12, H + 0.05, false); return; }
    const m = Math.max(2, Math.ceil(len / 0.35)); // (a slanting hurdle: a row of little round colliders, not one big box)
    for (let i = 0; i <= m; i++) C.circle(u0 + ((u1 - u0) * i) / m, v0 + ((v1 - v0) * i) / m, 0.15, H + 0.05, false);
  };
  const fu = pen.fenceU, gu = pen.gateU;
  hurdle(fu, pen.v0, gu, pen.v0);
  hurdle(fu, pen.v1, gu, pen.v1);
  hurdle(gu, pen.v0, gu, pen.gateV - pen.gap / 2);
  hurdle(gu, pen.gateV + pen.gap / 2, gu, pen.v1);
  // Two wings opening out from the way in, like a funnel: sheep coming this way get steered inside.
  for (const k of [-1, 1]) {
    const v0 = pen.gateV + (k * pen.gap) / 2;
    hurdle(gu, v0, gu + pen.side * 2.6 * Math.cos(0.62), v0 + k * 2.6 * Math.sin(0.62), true);
  }
  for (const s of [-1, 1]) mesh(cyl(0.07, 0.08, 1.2, 8), dark, g, [gu, 0.6, pen.gateV + s * pen.gap / 2]);
  // Straw on the ground inside, and a water bucket.
  const straw = mesh(blobGeometry(12, 0.3, 1), COL.straw, g, [(fu + gu) / 2, -0.01, (pen.v0 + pen.v1) / 2], [0, 0.4, 0], [Math.abs(gu - fu) * 0.36, 0.05, (pen.v1 - pen.v0) * 0.36]);
  straw.castShadow = false;
  straw.userData.season = 'world';
  return g;
}

/** The farm's sign by the gate: a board on two posts with a sheep painted on it. Facing +z. */
export function farmSign(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang);
  for (const s of [-1, 1]) mesh(rbox(0.1, 1.5, 0.1, 0.03), PALETTE.woodDark, g, [s * 0.62, 0.75, 0]);
  mesh(rbox(1.5, 0.62, 0.07, 0.03), 0xf3ead6, g, [0, 1.15, 0.03]);
  mesh(rbox(1.56, 0.06, 0.09, 0.02), PALETTE.woodDark, g, [0, 1.48, 0.03]);
  // the sheep (both sides)
  for (const s of [-1, 1]) {
    const z = 0.03 + s * 0.04;
    mesh(blobGeometry(5, 0.2, 1), 0xffffff, g, [0.1, 1.13, z], [0, 0, 0], [0.26, 0.17, 0.02]);
    mesh(sph(10, 8), 0x2f2a28, g, [-0.2, 1.17, z], [0, 0, 0.4], [0.08, 0.06, 0.02]);
    for (const x of [-0.02, 0.2]) mesh(rbox(0.03, 0.12, 0.02, 0.005), 0x2f2a28, g, [x, 0.97, z]);
    mesh(sph(10, 8), 0xf2c14e, g, [0.48, 1.28, z], [0, 0, 0], [0.07, 0.07, 0.02]); // (a buttercup)
  }
  C?.circle(u, v, 0.15, 1.6, false);
  return g;
}

/** The duck pond: a soft muddy rim, water, a darker middle, reeds and lily pads. */
export function duckPond(parent, u, v, r, rng) {
  const g = group(parent, u, v);
  const rim = mesh(blobGeometry(7, 0.1, 2), 0xa89a72, g, [0, -0.035, 0], [0, 0, 0], [r + 0.55, 0.09, r + 0.5]);
  rim.castShadow = false;
  const water = mesh(new THREE.CircleGeometry(r, 36), PALETTE.water, g, [0, 0.075, 0], [-Math.PI / 2, 0, 0]);
  water.castShadow = false;
  water.userData.season = 'none';
  const deep = mesh(new THREE.CircleGeometry(r * 0.6, 28), 0x78afc8, g, [0.2, 0.08, -0.15], [-Math.PI / 2, 0, 0]);
  deep.castShadow = false;
  deep.userData.season = 'none';
  for (let i = 0; i < 5; i++) {
    const a = rng.float(0, Math.PI * 2), k = rng.float(0.25, 0.75);
    const pad = mesh(new THREE.CircleGeometry(0.28, 10, 0.3, Math.PI * 1.85), 0x7fae64, g, [Math.cos(a) * r * k, 0.09, Math.sin(a) * r * k], [-Math.PI / 2, 0, rng.float(0, 6)], [rng.float(0.8, 1.2), rng.float(0.8, 1.2), 1]);
    pad.castShadow = false;
    pad.userData.season = 'none';
  }
  for (let i = 0; i < 11; i++) {
    const a = rng.float(-0.5, 2.6), x = Math.cos(a) * (r + 0.15), z = Math.sin(a) * (r + 0.15);
    for (let k = 0; k < 4; k++) {
      const h = rng.float(0.5, 1.0);
      mesh(cyl(0.012, 0.02, h, 4), 0x6f9a52, g, [x + rng.float(-0.25, 0.25), h / 2, z + rng.float(-0.25, 0.25)], [rng.float(-0.15, 0.15), 0, rng.float(-0.15, 0.15)]);
      if (rng.chance(0.35)) mesh(new THREE.CapsuleGeometry(0.028, 0.11, 3, 6), 0x8a6346, g, [x + rng.float(-0.25, 0.25), h + 0.05, z + rng.float(-0.25, 0.25)]);
    }
  }
  return g;
}

/** Milk churns: a little group of them (by the farmhouse door). */
export function churns(parent, u, v, n = 3) {
  const lathe = new THREE.LatheGeometry([[0.001, 0], [0.17, 0.0], [0.18, 0.05], [0.18, 0.42], [0.13, 0.52], [0.09, 0.58], [0.1, 0.62], [0.001, 0.63]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  for (let i = 0; i < n; i++) {
    const a = i * 2.3, x = u + Math.cos(a) * 0.32 * (i ? 1 : 0), z = v + Math.sin(a) * 0.32 * (i ? 1 : 0);
    mesh(lathe, 0xc9ccc9, parent, [x, 0, z]).userData.season = 'world';
    mesh(new THREE.TorusGeometry(0.18, 0.012, 4, 14), 0x9da09d, parent, [x, 0.4, z], [Math.PI / 2, 0, 0]);
  }
}

/** A wooden cart (for the harvest): two big wheels, a bed and handles. Facing +z. */
export function cart(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang), P = placer(C, u, v, ang);
  for (const s of [-1, 1]) {
    mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 18), PALETTE.woodDark, g, [s * 0.68, 0.42, 0], [0, Math.PI / 2, 0]);
    for (let k = 0; k < 4; k++) mesh(rbox(0.04, 0.78, 0.04, 0.01), PALETTE.woodDark, g, [s * 0.68, 0.42, 0], [(k * Math.PI) / 4, 0, 0]);
  }
  mesh(rbox(1.25, 0.08, 1.5, 0.02), PALETTE.wood, g, [0, 0.6, 0]);
  for (const s of [-1, 1]) mesh(rbox(0.06, 0.3, 1.5, 0.02), PALETTE.wood, g, [s * 0.6, 0.78, 0]);
  for (const s of [-1, 1]) mesh(rbox(1.25, 0.3, 0.06, 0.02), PALETTE.wood, g, [0, 0.78, s * 0.72]);
  for (const s of [-1, 1]) mesh(rbox(0.06, 0.06, 1.2, 0.02), PALETTE.woodDark, g, [s * 0.4, 0.52, 1.25], [0.25, 0, 0]);
  P.box(-0.75, -0.8, 0.75, 0.8, 0.93);
  return { bed: P.p(0, 0), y: 0.66 };
}

/** A wooden hay rack (for feeding the sheep in winter). Facing +z. */
export function hayRack(parent, u, v, ang, C) {
  const g = group(parent, u, v, ang);
  for (const s of [-1, 1]) {
    mesh(rbox(0.08, 1.0, 0.08, 0.02), PALETTE.woodDark, g, [s * 0.8, 0.5, 0.25]);
    mesh(rbox(0.08, 1.0, 0.08, 0.02), PALETTE.woodDark, g, [s * 0.8, 0.5, -0.25]);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) mesh(cyl(0.015, 0.015, 0.65, 4), PALETTE.wood, g, [-0.65 + i * 0.26, 0.72, s * 0.17], [s * 0.45, 0, 0]);
  mesh(rbox(1.7, 0.06, 0.12, 0.02), PALETTE.wood, g, [0, 1.0, 0.3]);
  mesh(rbox(1.7, 0.06, 0.12, 0.02), PALETTE.wood, g, [0, 1.0, -0.3]);
  placer(C, u, v, ang).box(-0.85, -0.32, 0.85, 0.32, 1.05, false);
  return g;
}
