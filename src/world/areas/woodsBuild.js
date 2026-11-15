import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../../render/watercolorMaterial.js';
import { PALETTE } from '../../render/palette.js';
import { RNG, fbm3 } from '../../core/rng.js';
import { tree, mesh, blobGeometry } from '../props.js';
import { groundAt } from './terrain.js';
import { inRect } from './areas.js';
import { ribbon, fenceWithGate, fingerpost } from './areaProps.js';

/*
 * 🌲 Building a town's Woods from its layout (./woodsLayout.js): trees, the stream and its crossings, the
 * paths, mud, the den's clearing, the owl's oak, Brock's sett and all the bits lying about. Everything's
 * built in the area's (u, v) frame inside one turned group and baked into the town's merged meshes by
 * mergeStatic, so a whole wood is a handful of draw calls. Leaves on broadleaf trees are foliage (they
 * turn with the seasons); pines are evergreen.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const EVERGREEN = [0x4d7a5a, 0x5a8763, 0x436d50]; // pine needles stay green all year (so they aren't foliage)
const BIRCH_BARK = 0xeee6d8;
const MUD = 0x6e4d35, MUD_DARK = 0x58392a, MUD_WET = 0x8f7058;
const PATH = 0xc6aa82, BANK = 0xa08867, DEEP = 0x78afc8;

/** A flat, wobbly-edged splodge (mud, puddles), radius about 1, lying flat. */
const splodges = new Map();
function splodge(seed, wobble = 0.16) {
  const key = `${seed}|${wobble}`;
  if (splodges.has(key)) return splodges.get(key);
  const shape = new THREE.Shape(), n = 30;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 1 + (fbm3(Math.cos(a) * 1.4 + seed * 3.1, Math.sin(a) * 1.4, seed * 0.7, 2) - 0.5) * wobble * 2.4;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(shape, 2);
  g.rotateX(-Math.PI / 2);
  splodges.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Trees (lighter than props.tree(): there are a lot of them).

function oak(u, v, s, rng, { blobs = 4, detail = 2, y = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(u, y, v);
  const bend = rng.float(-0.25, 0.25);
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(bend * 0.3, 1.0 * s, 0), V(bend, 2.0 * s, bend * 0.4)]);
  mesh(new THREE.TubeGeometry(curve, 6, 0.16 * s, 7, false), PALETTE.bark, g).userData.solid = true;
  mesh(new THREE.CylinderGeometry(0.17 * s, 0.28 * s, 0.4 * s, 7, 1, true), PALETTE.bark, g, [0, 0.14 * s, 0]); // root flare
  const a = rng.float(0, Math.PI * 2);
  const bc = new THREE.CatmullRomCurve3([V(bend * 0.6, 1.5 * s, 0), V(bend * 0.6 + Math.cos(a) * 0.6 * s, 2.1 * s, Math.sin(a) * 0.6 * s)]);
  mesh(new THREE.TubeGeometry(bc, 3, 0.06 * s, 5, false), PALETTE.bark, g);
  const cols = [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafLight];
  for (let i = 0; i < blobs; i++) {
    const ang = (i / blobs) * Math.PI * 2 + rng.float(0, 0.6), r = i === 0 ? 0 : rng.float(0.5, 0.85) * s, sz = (i === 0 ? 1.05 : rng.float(0.6, 0.85)) * s;
    const leaf = mesh(blobGeometry(rng.int(0, 40), 0.3, detail), rng.pick(cols), g,
      [bend + Math.cos(ang) * r, (2.5 + rng.float(-0.25, 0.35)) * s, bend * 0.4 + Math.sin(ang) * r], [rng.float(0, 3), rng.float(0, 3), 0], [sz, sz * 0.85, sz]);
    leaf.userData.foliage = true;
  }
  return g;
}

function birch(u, v, s, rng, detail = 2) {
  const g = new THREE.Group();
  g.position.set(u, 0, v);
  const lean = rng.float(-0.12, 0.12), h = 3.3 * s;
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(lean * 0.5, h * 0.5, lean * 0.2), V(lean, h, lean * 0.4)]);
  mesh(new THREE.TubeGeometry(curve, 6, 0.085 * s, 6, false), BIRCH_BARK, g).userData.solid = true;
  for (let i = 0; i < 3; i++) { // the dark marks on a birch
    const t = 0.15 + i * 0.2 + rng.float(-0.04, 0.04), p = curve.getPoint(t), a = rng.float(0, Math.PI * 2);
    mesh(new THREE.SphereGeometry(1, 6, 4), PALETTE.ink, g, [p.x + Math.cos(a) * 0.08 * s, p.y, p.z + Math.sin(a) * 0.08 * s], [0, -a, 0], [0.012 * s, 0.022 * s, 0.05 * s]);
  }
  const cols = [PALETTE.leafLight, PALETTE.leaf, PALETTE.leafLight];
  for (let i = 0; i < 3; i++) {
    const t = 0.66 + i * 0.15, p = curve.getPoint(Math.min(1, t)), a = rng.float(0, Math.PI * 2), r = (i === 2 ? 0.1 : rng.float(0.25, 0.45)) * s, sz = rng.float(0.48, 0.66) * s;
    const leaf = mesh(blobGeometry(rng.int(0, 40), 0.35, detail), rng.pick(cols), g, [p.x + Math.cos(a) * r, p.y + 0.25 * s, p.z + Math.sin(a) * r], [rng.float(0, 3), rng.float(0, 3), 0], [sz, sz * 1.15, sz]);
    leaf.userData.foliage = true;
  }
  return g;
}

/** One soft tier of a pine: a cone whose sides bulge a little and droop at the edge (radius and height 1). */
let tierGeo = null;
function tier() {
  if (tierGeo) return tierGeo;
  const pts = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector2(Math.sin(t * Math.PI * 0.5), 1 - t + Math.sin(t * Math.PI) * 0.12 - (t > 0.85 ? (t - 0.85) * 0.6 : 0))); }
  pts.push(new THREE.Vector2(0.7, -0.06), new THREE.Vector2(0.001, -0.02));
  tierGeo = new THREE.LatheGeometry(pts.reverse(), 9);
  return tierGeo;
}

function pine(u, v, s, rng, y = 0) {
  const g = new THREE.Group();
  g.position.set(u, y, v);
  mesh(new THREE.CylinderGeometry(0.08 * s, 0.17 * s, 1.6 * s, 7), PALETTE.bark, g, [0, 0.8 * s, 0]).userData.solid = true;
  const c = rng.pick(EVERGREEN);
  for (let i = 0; i < 3; i++) {
    const r = (0.98 - i * 0.25) * s, h = (1.35 - i * 0.18) * s;
    mesh(tier(), i === 1 ? rng.pick(EVERGREEN) : c, g, [rng.float(-0.04, 0.04), (1.45 + i * 0.8) * s - 0.2 * s, rng.float(-0.04, 0.04)], [0, rng.float(0, 3), 0], [r, h, r]);
  }
  return g;
}

/** A clump of ferns (one geometry, used for every clump: an InstancedMesh). */
function fernClump() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.ConeGeometry(0.09, 0.8, 3, 3, true);
    f.translate(0, 0.4, 0);
    f.scale(1, 1, 0.22);
    const p = f.attributes.position;
    for (let k = 0; k < p.count; k++) { // arch out and over
      const y = p.getY(k), t = y / 0.8, ang = 0.35 + t * 0.9;
      p.setXYZ(k, p.getX(k), Math.sin(ang) * y * 0.75, p.getZ(k) + Math.cos(0.35) * y * 0.15 + t * t * 0.32);
    }
    f.rotateY((i / 5) * Math.PI * 2 + (i % 2) * 0.3);
    f.deleteAttribute('uv');
    parts.push(f.toNonIndexed());
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** A red toadstool with white spots. */
function toadstool(g, u, v, s, rng) {
  const t = new THREE.Group();
  t.position.set(u, 0, v);
  t.scale.setScalar(s);
  mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 6), 0xf1e8d8, t, [0, 0.08, 0]);
  mesh(new THREE.SphereGeometry(0.1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9534f, t, [0, 0.15, 0], [0, 0, 0], [1, 0.75, 1]);
  for (let i = 0; i < 3; i++) { const a = rng.float(0, 6.28); mesh(new THREE.IcosahedronGeometry(0.016, 0), 0xffffff, t, [Math.cos(a) * 0.055, 0.205, Math.sin(a) * 0.055]); }
  g.add(t);
}

// ---------------------------------------------------------------------------------------------

/**
 * Build the woods into `g` (a group turned into the area's frame). C: area-frame colliders. extra: the
 * town's bits and pieces (water zones). flats: where the ground is flat (for trees up the hills).
 * Returns what the game needs to know (world coordinates).
 */
export function buildWoods(g, d, { C, extra, flats }) {
  const { a, uL, uR, vF, vB } = d;
  const rng = new RNG(`woods-build:${d.seed}`);

  // ---- the meadow: flowers by the lane, a few big old trees ----
  {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.015, 1, 3), paint(PALETTE.leafDark), d.flowers.length);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), paint(0xffffff), d.flowers.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    d.flowers.forEach((f, i) => {
      const h = 0.25 * f.s + 0.12;
      m.makeScale(1, h, 1).setPosition(f.u, h / 2, f.v); stems.setMatrixAt(i, m);
      m.makeScale(0.07, 0.05, 0.07).setPosition(f.u, h, f.v); heads.setMatrixAt(i, m);
      heads.setColorAt(i, c.set(rng.pick(PALETTE.flowers)));
    });
    stems.castShadow = heads.castShadow = false;
    g.add(stems, heads);
  }
  for (const t of d.meadowTrees) { g.add(oak(t.u, t.v, t.s, new RNG(t.seed), { blobs: 5 })); C.circle(t.u, t.v, 0.32 * t.s); }

  // ---- the fence along the front of the wood, with its gate, and signs pointing the way ----
  g.add(fenceWithGate(uL, uR, vF, d.gateU, C));
  const ln = d.lane, l0 = ln[0], l1 = ln[Math.min(ln.length - 1, 6)];
  const laneAng = Math.atan2(l1[0] - l0[0], l1[1] - l0[1]);
  g.add(fingerpost(l0[0] + 2.4, l0[1] + 3.4, laneAng, C));
  g.add(fingerpost(d.gateU - 1.8, vF - 0.6, 0, C));

  // ---- paths, the lane, the stream ----
  g.add(ribbon(d.lane, 3.0, 0xcdb994, 0.058, { seed: 1 }));
  g.add(ribbon(d.lane.slice(4), 0.45, PALETTE.grassDark, 0.062, { seed: 2, wobble: 0.3 })); // grass up the middle
  d.paths.forEach((p, i) => g.add(ribbon(p, 2.0, PATH, 0.05 + i * 0.001, { seed: 3 + i, wobble: 0.16 })));
  const S = d.stream;
  g.add(ribbon(S.pts, (S.w + 0.95) * 2, BANK, 0.06, { seed: 9, wobble: 0.08 }));
  g.add(ribbon(S.pts, S.w * 2, PALETTE.water, 0.075, { seed: 10, wobble: 0.04 }));
  g.add(ribbon(S.pts, S.w * 0.85, DEEP, 0.08, { seed: 11, wobble: 0.15 }));
  const W = d.W, worldPts = S.pts.map(([u, v]) => W(u, v));
  const box = worldPts.reduce((b, [x, z]) => ({ x0: Math.min(b.x0, x - S.w), z0: Math.min(b.z0, z - S.w), x1: Math.max(b.x1, x + S.w), z1: Math.max(b.z1, z + S.w) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const stream = { kind: 'stream', pts: worldPts, w: S.w, surface: 0.075, box };
  extra.water.push(stream);
  // Pebbles and reeds along the banks.
  for (let i = 0; i < 70; i++) {
    const u = rng.float(uL - 4, uR + 4), side = rng.chance(0.5) ? 1 : -1, [pu, pv] = S.off(u, side * (S.w + rng.float(0.1, 0.8)));
    if (rng.chance(0.55)) { const s = rng.float(0.08, 0.2); mesh(blobGeometry(rng.int(0, 20), 0.25, 1), rng.pick([0xb8b0a4, 0xa39b90, 0xc9c2b4]), g, [pu, 0.05, pv], [rng.float(0, 3), rng.float(0, 3), 0], [s, s * 0.55, s]).castShadow = false; }
    else for (let k = 0; k < 4; k++) { const h = rng.float(0.5, 1.0); mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 4), 0x6f9a52, g, [pu + rng.float(-0.25, 0.25), h / 2, pv + rng.float(-0.25, 0.25)], [rng.float(-0.15, 0.15), 0, rng.float(-0.15, 0.15)]); }
  }
  // Stepping stones (hop, hop, hop) and a fallen tree for a bridge.
  for (const [u, v] of d.stones) {
    mesh(blobGeometry(rng.int(0, 20), 0.12, 1), rng.pick([0xb8b0a4, 0xa8a094]), g, [u, 0.04, v], [0, rng.float(0, 3), 0], [0.44, 0.2, 0.4]);
    C.circle(u, v, 0.38, 0.22);
  }
  {
    const [au, av] = d.log.a, [bu, bv] = d.log.b, len = Math.hypot(bu - au, bv - av), ang = Math.atan2(bu - au, bv - av);
    const lg = new THREE.Group();
    lg.position.set((au + bu) / 2, 0.24, (av + bv) / 2);
    lg.rotation.y = ang;
    mesh(new THREE.CylinderGeometry(0.28, 0.32, len + 1.2, 10), PALETTE.bark, lg, [0, 0, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.CircleGeometry(0.28, 10), PALETTE.wood, lg, [0, 0, (len + 1.2) / 2 + 0.005]);
    mesh(blobGeometry(5, 0.4, 1), PALETTE.bark, lg, [0, 0.05, -(len + 1.2) / 2 - 0.2], [0, 0, 0], [0.7, 0.55, 0.25]); // roots
    mesh(blobGeometry(8, 0.3, 1), PALETTE.leafDark, lg, [0.12, 0.25, len * 0.2], [0, 0, 0], [0.22, 0.08, 0.5]).userData.foliage = true; // moss
    g.add(lg);
    const n = Math.ceil((len + 1.2) / 0.5);
    for (let i = 0; i <= n; i++) { const t = i / n - 0.5, cu = (au + bu) / 2 + Math.sin(ang) * t * (len + 1.2), cv = (av + bv) / 2 + Math.cos(ang) * t * (len + 1.2); C.circle(cu, cv, 0.3, 0.5); }
  }

  // ---- mud: dark, wet and glorious ----
  const mud = d.mud.map((m) => {
    const wob = rng.float(0, 6);
    mesh(splodge(rng.int(0, 9)), MUD, g, [m.u, 0.062, m.v], [0, wob, 0], [m.ru * 1.06, 1, m.rv * 1.06]).castShadow = false;
    mesh(splodge(rng.int(0, 9), 0.25), MUD_DARK, g, [m.u + rng.float(-0.2, 0.2), 0.066, m.v + rng.float(-0.2, 0.2)], [0, wob + 1, 0], [m.ru * 0.58, 1, m.rv * 0.52]).castShadow = false;
    for (let k = 0; k < (m.big ? 4 : 2); k++) mesh(splodge(rng.int(0, 9), 0.3), MUD_WET, g, [m.u + rng.float(-0.45, 0.45) * m.ru, 0.07, m.v + rng.float(-0.45, 0.45) * m.rv], [0, rng.float(0, 3), 0], [rng.float(0.1, 0.22), 1, rng.float(0.06, 0.13)]).castShadow = false;
    const [x, z] = W(m.u, m.v), across = Math.abs(a.across[0]) > 0.5;
    return { x, z, rx: across ? m.ru : m.rv, rz: across ? m.rv : m.ru, big: !!m.big };
  });

  // ---- trees ----
  for (const t of d.trees) {
    const q = new RNG(t.seed);
    const detail = t.near ? 2 : 1; // (smooth where you'll see them close up)
    g.add(t.kind === 'pine' ? pine(t.u, t.v, t.s, q) : t.kind === 'birch' ? birch(t.u, t.v, t.s, q, detail) : oak(t.u, t.v, t.s, q, { detail }));
    C.circle(t.u, t.v, (t.kind === 'birch' ? 0.16 : t.kind === 'pine' ? 0.22 : 0.3) * t.s);
  }
  // Up the hills round about (just to look at: sat on the hillside).
  for (const t of d.hillTrees) {
    const [x, z] = W(t.u, t.v), y = groundAt(flats, x, z) - 0.25 * t.s, q = new RNG(t.seed);
    g.add(t.kind === 'pine' ? pine(t.u, t.v, t.s, q, y) : oak(t.u, t.v, t.s, q, { blobs: 3, detail: 1, y }));
  }

  // ---- the owl's oak, by the path: a big old tree with a perch ----
  const owlTree = tree(d.owl.u, d.owl.v, 2.0, rng, null, { detail: 2, blobs: 6 });
  g.add(owlTree);
  C.circle(d.owl.u, d.owl.v, 0.6);
  // (low enough to see her from the path, under the leaves: where the trunk is at that height, from tree()'s own curve)
  const ob = owlTree.userData.bend ?? 0, perchY = 1.95;
  const tc = new THREE.CatmullRomCurve3([V(0, 0, 0), V(ob * 0.3, 2.0, 0), V(ob, 4.0, ob * 0.4)]);
  let tp = tc.getPoint(0);
  for (let i = 0; i <= 40; i++) { const q = tc.getPoint(i / 40); if (Math.abs(q.y - perchY) < Math.abs(tp.y - perchY)) tp = q; }
  const trunk = { u: d.owl.u + tp.x, v: d.owl.v + tp.z };
  const fx = Math.sin(d.owl.face), fz = Math.cos(d.owl.face);
  const stub = new THREE.CatmullRomCurve3([V(trunk.u, perchY - 0.15, trunk.v), V(trunk.u + fx * 0.35, perchY - 0.06, trunk.v + fz * 0.35), V(trunk.u + fx * 0.75, perchY - 0.02, trunk.v + fz * 0.75)]);
  mesh(new THREE.TubeGeometry(stub, 5, 0.075, 6, false), PALETTE.bark, g);
  const perch = W(trunk.u + fx * 0.62, trunk.v + fz * 0.62);

  // ---- Brock's sett: a bank with three front doors, under an old tree ----
  const st = d.sett, sf = st.face;
  {
    const sg = new THREE.Group();
    sg.position.set(st.u, 0, st.v);
    sg.rotation.y = sf;
    mesh(blobGeometry(11, 0.18, 2), 0x8f7055, sg, [0, 0.05, -0.4], [0, 0, 0], [2.4, 0.8, 1.8]);
    mesh(blobGeometry(12, 0.25, 1), 0x9a7a5c, sg, [0.4, 0.05, 0.9], [0, 0, 0], [1.6, 0.25, 1.0]).castShadow = false; // spoil heap
    for (const [x, s] of [[0, 1], [-1.15, 0.8], [1.2, 0.75]]) {
      const ring = mesh(new THREE.TorusGeometry(0.27 * s, 0.07 * s, 6, 14), 0x7a5a42, sg, [x, 0.3 * s, 1.22 - Math.abs(x) * 0.25], [0.25, 0, 0]);
      ring.castShadow = false;
      mesh(new THREE.CircleGeometry(0.27 * s, 14), 0x241812, sg, [x, 0.3 * s, 1.2 - Math.abs(x) * 0.25], [-0.25 + 0.0, 0, 0]).castShadow = false;
    }
    g.add(sg);
    C.circle(st.u - Math.sin(sf) * 0.4, st.v - Math.cos(sf) * 0.4, 1.7, 0.62);
    const ht = tree(st.u - Math.sin(sf) * 2.3, st.v - Math.cos(sf) * 2.3, 1.8, rng, null, { detail: 2, blobs: 5 });
    g.add(ht);
    C.circle(st.u - Math.sin(sf) * 2.3, st.v - Math.cos(sf) * 2.3, 0.54);
  }
  const holeAt = (x, s) => W(st.u + Math.cos(sf) * x + Math.sin(sf) * (1.3 - Math.abs(x) * 0.25), st.v - Math.sin(sf) * x + Math.cos(sf) * (1.3 - Math.abs(x) * 0.25));
  const holes = [[0, 1], [-1.15, 0.8], [1.2, 0.75]].map(([x, s]) => { const [hx, hz] = holeAt(x, s); return V(hx, 0.3 * s, hz); });

  // ---- the den's clearing: logs to sit on round a good flat spot ----
  {
    mesh(new THREE.CircleGeometry(d.den.r - 0.6, 28), 0xb8c47f, g, [d.den.u, 0.035, d.den.v], [-Math.PI / 2, 0, 0]).castShadow = false;
    mesh(new THREE.CircleGeometry(1.9, 20), 0xa8916c, g, [d.den.u, 0.045, d.den.v], [-Math.PI / 2, 0, 0]).castShadow = false; // trodden earth where the den goes
    for (let i = 0; i < 3; i++) {
      const ang = rng.float(0, 0.6) + (i / 3) * Math.PI * 2 + 0.9, r = d.den.r - 1.6, cu = d.den.u + Math.cos(ang) * r, cv = d.den.v + Math.sin(ang) * r;
      const lg = new THREE.Group();
      lg.position.set(cu, 0.24, cv);
      lg.rotation.y = -ang;
      mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.9, 9), PALETTE.bark, lg, [0, 0, 0], [Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) mesh(new THREE.CircleGeometry(0.24, 9), PALETTE.wood, lg, [0, 0, s * 0.951], [0, s > 0 ? 0 : Math.PI, 0]);
      g.add(lg);
      for (const t of [-0.7, 0, 0.7]) C.circle(cu + Math.sin(ang) * t, cv - Math.cos(ang) * t, 0.3, 0.48);
    }
  }

  // ---- things lying about ----
  for (const L of d.logs) {
    const lg = new THREE.Group();
    lg.position.set(L.u, L.r, L.v);
    lg.rotation.y = L.rot;
    mesh(new THREE.CylinderGeometry(L.r, L.r * 1.1, L.len, 9), PALETTE.bark, lg, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) mesh(new THREE.CircleGeometry(L.r, 9), PALETTE.wood, lg, [0, 0, (s * L.len) / 2 + s * 0.003], [0, s > 0 ? 0 : Math.PI, 0]);
    if (rng.chance(0.6)) mesh(blobGeometry(rng.int(0, 20), 0.3, 1), PALETTE.leafDark, lg, [0, L.r * 0.8, rng.float(-0.4, 0.4) * L.len], [0, 0, 0], [L.r * 0.9, L.r * 0.35, L.len * 0.25]);
    g.add(lg);
    const n = Math.max(2, Math.ceil(L.len / 0.55));
    for (let i = 0; i <= n; i++) { const t = (i / n - 0.5) * L.len; C.circle(L.u + Math.sin(L.rot) * t, L.v + Math.cos(L.rot) * t, L.r + 0.04, L.r * 2 + 0.02); }
  }
  for (const s of d.stumps) {
    mesh(new THREE.CylinderGeometry(s.r * 0.92, s.r * 1.15, s.h, 10), PALETTE.bark, g, [s.u, s.h / 2, s.v]);
    mesh(new THREE.CircleGeometry(s.r * 0.88, 10), PALETTE.wood, g, [s.u, s.h + 0.003, s.v], [-Math.PI / 2, 0, 0]).castShadow = false;
    C.circle(s.u, s.v, s.r, s.h);
  }
  for (const r of d.rocks) {
    mesh(blobGeometry(r.seed, 0.28, 1), rng.pick([0xb8b0a4, 0xa39b90, 0xbab4a2]), g, [r.u, r.s * 0.25, r.v], [rng.float(0, 3), rng.float(0, 3), 0], [r.s, r.s * 0.65, r.s * 0.9]);
    if (rng.chance(0.5)) mesh(blobGeometry(rng.int(0, 20), 0.3, 1), PALETTE.leafDark, g, [r.u, r.s * 0.62, r.v], [0, rng.float(0, 3), 0], [r.s * 0.6, r.s * 0.12, r.s * 0.5]); // moss on top
    C.circle(r.u, r.v, r.s * 0.85, r.s * 0.75);
  }
  for (const t of d.toadstools) toadstool(g, t.u, t.v, t.s, rng);
  {
    const ferns = new THREE.InstancedMesh(fernClump(), paint(0xffffff), d.ferns.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    const greens = [PALETTE.leaf, PALETTE.leafDark, 0x6f9a52, PALETTE.grassDark];
    d.ferns.forEach((f, i) => {
      q.setFromEuler(e.set(0, f.rot, 0));
      m.compose(V(f.u, 0.02, f.v), q, V(f.s, f.s * rng.float(0.8, 1.15), f.s));
      ferns.setMatrixAt(i, m);
      ferns.setColorAt(i, c.set(rng.pick(greens)));
    });
    ferns.castShadow = false;
    g.add(ferns);
  }

  // ---- where the game's things go (world coordinates) ----
  const turn = a.turn, at = (u, v, y = 0) => { const [x, z] = W(u, v); return V(x, y, z); };
  const [gx, gz] = W(d.gateU, vF);
  return {
    kind: 'woods', name: a.name, plan: a, layout: d,
    strip: a.strip, rect: a.rect, gate: V(gx, 0, gz),
    stream, mud,
    den: { pos: at(d.den.u, d.den.v), r: d.den.r, face: turn + Math.atan2(d.gateU - d.den.u, vF - d.den.v) },
    owl: { perch: V(perch[0], perchY, perch[1]), face: turn + d.owl.face },
    sett: { pos: at(st.u, st.v), face: turn + sf, door: holes[0].clone().setY(0), holes },
    stickSpots: d.stickSpots.map(([u, v]) => W(u, v)),
    smellSpots: d.smellSpots.map(([u, v]) => W(u, v)),
    /** A free spot in the wood for a job (world {x, z}), or null. */
    spot(q) { const p = d.free(q); if (!p) return null; const [x, z] = W(p[0], p[1]); return { x, z }; },
    /** How far into the trees (0 in the meadow or town … 1 well inside the wood). */
    depth(x, z) {
      const u = a.across[0] * x + a.across[1] * z, v = a.dir[0] * x + a.dir[1] * z;
      if (u < uL - 6 || u > uR + 6 || v < vF - 4) return 0;
      return Math.max(0, Math.min(1, (v - vF + 2) / 14, (u - uL + 6) / 10, (uR + 6 - u) / 10));
    },
    inWood: (x, z) => inRect(a.rect, x, z),
  };
}
