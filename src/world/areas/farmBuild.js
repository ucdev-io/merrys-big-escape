import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../../render/watercolorMaterial.js';
import { PALETTE } from '../../render/palette.js';
import { RNG, fbm3 } from '../../core/rng.js';
import { tree, house, mesh, blobGeometry, washingLine } from '../props.js';
import { bench } from '../town/townProps.js';
import { groundAt } from './terrain.js';
import { inRect, toLocal, worldRect } from './areas.js';
import { ribbon, fingerpost } from './areaProps.js';
import {
  COL, barn, coop, pigsty, well, trough, tractor, scarecrow, hayCastle, roundBale, fenceAlongV, hedgerow,
  gateway, sheepPen, farmSign, duckPond, churns, cart, hayRack,
} from './farmProps.js';

/*
 * 🚜 Building a town's Farm from its layout (./farmLayout.js): the farmyard and its buildings, the fields
 * and their fences, the pigsty's mud, the duck pond, hay to climb, hedges, trees and buttercups. Built in
 * the area's (u, v) frame inside one turned group and baked into the town's merged meshes by mergeStatic.
 * The animals, the farmer and anything that changes with the seasons (crops, pumpkins…) are the game's
 * (game/town/farm/). Snow settles on roofs, hay and fields; the yard and the lanes go slushy (road);
 * water and mud never change (none).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TRACK = 0xc9b089, YARD = 0xbfa47c;

/** A flat, wobbly-edged splodge (mud, a yard), radius about 1, lying flat. */
const splodges = new Map();
function splodge(seed, wobble = 0.16, n = 30) {
  const key = `${seed}|${wobble}|${n}`;
  if (splodges.has(key)) return splodges.get(key);
  const shape = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 1 + (fbm3(Math.cos(a) * 1.4 + seed * 3.1, Math.sin(a) * 1.4, seed * 0.7, 2) - 0.5) * wobble * 2.4;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(shape, 2);
  g.rotateX(-Math.PI / 2);
  splodges.set(key, g);
  return g;
}

/** Ploughed earth in furrows along v (u0..u1 × v0..v1): ridges you can see, snow on their tops in winter. */
function furrows(u0, v0, u1, v1) {
  const n = Math.max(2, Math.round((u1 - u0) / 0.34)), pos = [], col = [], c = new THREE.Color(), lo = new THREE.Color(0x8c6a4e), hi = new THREE.Color(0xa88765);
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n, ridge = i % 2 === 0, y = ridge ? 0.03 : -0.035;
    c.copy(ridge ? hi : lo).offsetHSL(0, 0, (fbm3(u * 0.3, 1, v0 * 0.1, 2) - 0.5) * 0.06);
    pos.push(u, y, v0, u, y, v1);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const idx = [];
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A tree for further off (the hedges, up the hills): a simple trunk and a few soft blobs of leaves. */
function lightTree(u, v, s, rng, y = 0, blobs = 3) {
  const g = new THREE.Group();
  g.position.set(u, y, v);
  const bend = rng.float(-0.25, 0.25);
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(bend * 0.3, 1.0 * s, 0), V(bend, 2.0 * s, bend * 0.4)]);
  mesh(new THREE.TubeGeometry(curve, 5, 0.16 * s, 6, false), PALETTE.bark, g).userData.solid = true;
  const cols = [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafLight];
  for (let i = 0; i < blobs; i++) {
    const ang = (i / blobs) * Math.PI * 2 + rng.float(0, 0.6), r = i === 0 ? 0 : rng.float(0.5, 0.85) * s, sz = (i === 0 ? 1.05 : rng.float(0.65, 0.85)) * s;
    const leaf = mesh(blobGeometry(rng.int(0, 40), 0.3, 1), rng.pick(cols), g, [bend + Math.cos(ang) * r, (2.5 + rng.float(-0.25, 0.3)) * s, bend * 0.4 + Math.sin(ang) * r], [rng.float(0, 3), rng.float(0, 3), 0], [sz, sz * 0.85, sz]);
    leaf.userData.foliage = true;
  }
  return g;
}

/** An evergreen for the hills: a trunk and three soft tiers. */
let tierGeo = null;
function lightPine(u, v, s, rng, y = 0) {
  const g = new THREE.Group();
  g.position.set(u, y, v);
  mesh(new THREE.CylinderGeometry(0.08 * s, 0.16 * s, 1.5 * s, 6), PALETTE.bark, g, [0, 0.75 * s, 0]);
  tierGeo ??= new THREE.ConeGeometry(1, 1.3, 9, 1);
  for (let i = 0; i < 3; i++) mesh(tierGeo, [0x4d7a5a, 0x5a8763, 0x436d50][i], g, [0, (1.35 + i * 0.75) * s, 0], [0, rng.float(0, 3), 0], [(0.95 - i * 0.24) * s, s, (0.95 - i * 0.24) * s]);
  g.userData.season = 'world'; // (evergreen)
  return g;
}

/** A clump of long grass (for along the fences and hedges): one geometry, for an instanced mesh. */
function tuftGeometry() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.ConeGeometry(0.035, 0.5 + (i % 3) * 0.12, 3, 1);
    b.translate(0, 0.25, 0);
    b.rotateZ((i % 3 - 1) * 0.3 + 0.05 * i);
    b.rotateY(i * 0.9);
    b.translate(Math.cos(i * 2.1) * 0.06, 0, Math.sin(i * 2.1) * 0.06);
    b.deleteAttribute('uv');
    parts.push(b.toNonIndexed());
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/**
 * Build the farm into `g` (a group turned into the area's frame). C: area-frame colliders. extra: the
 * town's bits and pieces (water zones). flats: where the ground is flat (for trees up the hills).
 * Returns what the game needs to know (world coordinates).
 */
export function buildFarm(g, d, { C, extra, flats }) {
  const { a, uL, uR, vF, vB, s } = { ...d, s: d.side };
  const rng = new RNG(`farm-build:${d.seed}`);
  const W = d.W, at = (u, v, y = 0) => { const [x, z] = W(u, v); return V(x, y, z); };
  const tag = (m, kind) => { m.userData.season = kind; return m; };

  // ---- the buttercup meadow out front ----
  {
    const n = d.flowers.length, m = new THREE.Matrix4(), c = new THREE.Color();
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.015, 1, 3), paint(PALETTE.leafDark, { kind: 'inst' }), n);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), paint(0xffffff, { kind: 'inst' }), n);
    const HEADS = [0xf6d04a, 0xfbf6ec, 0xe8a0c0];
    d.flowers.forEach((f, i) => {
      const h = (f.kind === 2 ? 0.12 : 0.24) * f.s + 0.1;
      m.makeScale(1, h, 1).setPosition(f.u, h / 2, f.v); stems.setMatrixAt(i, m);
      m.makeScale(0.065, 0.045, 0.065).setPosition(f.u, h, f.v); heads.setMatrixAt(i, m);
      heads.setColorAt(i, c.set(HEADS[f.kind]));
    });
    stems.castShadow = heads.castShadow = false;
    g.add(stems, heads);
  }
  for (const t of d.meadowTrees) g.add(tree(t.u, t.v, t.s, new RNG(t.seed), C, { detail: 2, blobs: 5 }));

  // ---- the hedges: a gate in the front one; round the sides and the back (the hills are beyond) ----
  const hl = uR - uL - 0.8, gapAt = (u) => (u - uL - 0.4) / hl;
  hedgerow(g, uL + 0.4, vF, uR - 0.4, vF, rng, C, { gap: [gapAt(d.gateU - 1.35), gapAt(d.gateU + 1.35)], step: 1.45 });
  gateway(g, d.gateU, vF, C);
  hedgerow(g, uL + 0.7, vF + 1.5, uL + 0.7, vB - 0.7, rng, null, { h: 1.15, step: 2.1 });
  hedgerow(g, uR - 0.7, vF + 1.5, uR - 0.7, vB - 0.7, rng, null, { h: 1.15, step: 2.1 });
  hedgerow(g, uL + 1.8, vB - 0.7, uR - 1.8, vB - 0.7, rng, null, { h: 1.15, step: 2.1 });
  farmSign(g, d.gateU + 2.6, vF - 0.9, 0, C);
  const ln = d.lane, l0 = ln[0], l1 = ln[Math.min(ln.length - 1, 6)];
  g.add(fingerpost(l0[0] + 2.4, l0[1] + 3.4, Math.atan2(l1[0] - l0[0], l1[1] - l0[1]), C, 'farm'));

  // ---- the lane in, the track to the yard, the yard ----
  g.add(tag(ribbon(d.lane, 3.0, 0xcdb994, 0.058, { seed: 21 }), 'road'));
  g.add(ribbon(d.lane.slice(4), 0.45, PALETTE.grassDark, 0.062, { seed: 22, wobble: 0.3 })); // grass up the middle
  g.add(tag(ribbon(d.track, 3.0, TRACK, 0.055, { seed: 23, wobble: 0.08 }), 'road'));
  const Y = d.yard;
  const yardMesh = mesh(splodge(31, 0.1, 40), YARD, g, [Y.u, 0.04, Y.v], [0, 0, 0], [Y.ru, 1, Y.rv]);
  yardMesh.castShadow = false;
  tag(yardMesh, 'road');
  for (let i = 0; i < 26; i++) { // cobbles and pebbles here and there
    const ang = rng.float(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 0.85, sz = rng.float(0.1, 0.22);
    const p = mesh(blobGeometry(rng.int(0, 20), 0.2, 1), rng.pick([0xa59c8e, 0xb6ad9f, 0x978e80]), g, [Y.u + Math.cos(ang) * Y.ru * r, 0.04, Y.v + Math.sin(ang) * Y.rv * r], [0, rng.float(0, 3), 0], [sz, sz * 0.3, sz * 0.8]);
    p.castShadow = false;
  }

  // ---- the fields: a fence each side of the yard, with a gate; ploughed furrows in the crop field ----
  const SF = d.sheepField, CF = d.cropField;
  g.add(fenceAlongV(g, SF.fenceU, vF + 0.5, vB - 0.5, SF.gateV, C));
  g.add(fenceAlongV(g, CF.fenceU, vF + 0.5, vB - 0.5, CF.gateV, C));
  const soil = new THREE.Mesh(furrows(CF.u0 + 0.4, CF.v0 + 0.4, CF.u1 - 0.4, CF.v1 - 0.4), paint(0xffffff, { vertexColors: true }));
  soil.receiveShadow = true;
  tag(soil, 'world');
  g.add(soil);
  g.add(sheepPen(g, d.pen, C));
  const rackAt = [d.pen.gateU + s * 4.5, d.pen.v1 + 3.5];
  hayRack(g, rackAt[0], rackAt[1], Math.PI / 2, C);
  const crow = scarecrow(g, d.scarecrow.u, d.scarecrow.v, s > 0 ? -Math.PI / 2 : Math.PI / 2, C); // (looking over the field towards the yard)

  // ---- the farmyard ----
  const B = barn(g, d.barn, C, -s);
  const H = d.house;
  g.add(house(H.u, H.v, H.face, rng, C, { w: H.w, d: H.d, h: 3.5, wall: 0xf4e8d2, roof: 0x7a6870, door: 0x6f8f6a }));
  {
    const bx = H.u + s * (H.d / 2 + 0.45), bv = H.v - 2.2;
    g.add(bench(bx, bv, H.face));
    C.circle(bx, bv, 0.75, 0.5);
    churns(g, H.door[0] + s * 0.3, H.v + 2.4);
    C.circle(H.door[0] + s * 0.3, H.v + 2.4, 0.5, 0.63);
    // The egg basket on the step.
    const bk = new THREE.Group();
    bk.position.set(d.basket[0], 0, d.basket[1]);
    g.add(bk);
    mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.17, 14, 1, true), 0xb88a52, bk, [0, 0.085, 0], [0, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
    mesh(new THREE.CircleGeometry(0.15, 12), 0x9a7040, bk, [0, 0.01, 0], [-Math.PI / 2, 0, 0]);
    mesh(new THREE.TorusGeometry(0.19, 0.014, 5, 16, Math.PI), 0xa07a46, bk, [0, 0.17, 0], [0, 0, 0]);
    for (let i = 0; i < 3; i++) mesh(new THREE.SphereGeometry(1, 10, 8), 0xe9d2b0, bk, [Math.cos(i * 2.1) * 0.07, 0.1, Math.sin(i * 2.1) * 0.07], [0.3 * i, 0, 0.2], [0.045, 0.06, 0.045]);
    C.circle(d.basket[0], d.basket[1], 0.22, 0.2);
    // The washing line beside the house (the farmer's things out to dry).
    const wv = H.v + H.w / 2 + 2.6, wl0 = [d.yu - s * 13.6, wv], wl1 = [d.yu - s * 8.4, wv];
    g.add(washingLine(wl0[0], wl0[1], wl1[0], wl1[1], rng));
    for (const [u, v] of [wl0, wl1]) C.circle(u, v, 0.08);
  }
  const P = d.pond;
  g.add(duckPond(g, P.u, P.v, P.r, rng));
  const [px, pz] = W(P.u, P.v), pondZone = { kind: 'pool', x: px, z: pz, r: P.r, surface: 0.075 };
  extra.water.push(pondZone); // (a paddle washes the mud off; in winter it freezes over: slide!)
  const CO = coop(g, d.coop.u, d.coop.v, d.coop.face, C);
  g.add(well(g, d.well.u, d.well.v, C));
  g.add(trough(g, d.trough.u, d.trough.v, d.trough.rot, C));
  const ST = pigsty(g, d.sty, C, s);
  const TR = tractor(g, d.tractor.u, d.tractor.v, d.tractor.face, C);
  const HC = hayCastle(g, d.stack.u, d.stack.v, d.stack.face, C);
  const cartAt = [d.barn.u - s * (d.barn.w / 2 + 2.3), d.barn.front + 1.6];
  const CT = cart(g, cartAt[0], cartAt[1], s > 0 ? 0.35 : -0.35, C);

  // ---- behind the barn: the orchard, and round bales in the hay meadow ----
  const apples = d.orchard.map((t) => { const tr = tree(t.u, t.v, t.s, new RNG(t.seed), C, { detail: 2, blobs: 4 }); g.add(tr); return { ...t, bend: tr.userData.bend }; });
  for (const b of d.bales) { roundBale(g, b.u, b.v, b.rot); C.circle(b.u, b.v, 0.66, 1.3); }
  for (const t of d.hedgeTrees) { g.add(lightTree(t.u, t.v, t.s, new RNG(t.seed), 0, 4)); C.circle(t.u, t.v, 0.3 * t.s); }
  // Up the hills round about (just to look at: sat on the hillside).
  for (const t of d.hillTrees) {
    const [x, z] = W(t.u, t.v), y = groundAt(flats, x, z) - 0.25 * t.s, q = new RNG(t.seed);
    g.add(t.kind === 'pine' ? lightPine(t.u, t.v, t.s, q, y) : lightTree(t.u, t.v, t.s, q, y, 3));
  }

  // ---- mud: the pigsty's, the field gateway's, the puddles ----
  const mud = d.mud.map((m) => {
    const wob = rng.float(0, 6), mg = new THREE.Group();
    mg.userData.season = 'none'; // (mud stays mud: churned up and brown, even in the snow)
    g.add(mg);
    mesh(splodge(rng.int(0, 9)), COL.mud, mg, [m.u, 0.062, m.v], [0, wob, 0], [m.ru * 1.06, 1, m.rv * 1.06]).castShadow = false;
    mesh(splodge(rng.int(0, 9), 0.25), COL.mudDark, mg, [m.u + rng.float(-0.2, 0.2), 0.066, m.v + rng.float(-0.2, 0.2)], [0, wob + 1, 0], [m.ru * 0.58, 1, m.rv * 0.52]).castShadow = false;
    for (let k = 0; k < (m.big ? 5 : 2); k++) mesh(splodge(rng.int(0, 9), 0.3), COL.mudWet, mg, [m.u + rng.float(-0.45, 0.45) * m.ru, 0.07, m.v + rng.float(-0.45, 0.45) * m.rv], [0, rng.float(0, 3), 0], [rng.float(0.1, 0.22), 1, rng.float(0.06, 0.13)]).castShadow = false;
    const [x, z] = W(m.u, m.v), across = Math.abs(a.across[0]) > 0.5;
    return { x, z, rx: across ? m.ru : m.rv, rz: across ? m.rv : m.ru, big: !!m.big };
  });

  // ---- long grass along the fences and hedges ----
  {
    const tufts = new THREE.InstancedMesh(tuftGeometry(), paint(0xffffff, { kind: 'inst' }), d.tufts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), greens = [0x7fa45a, 0x8fb565, 0x6f9a52, 0x9cbf6a];
    d.tufts.forEach((t, i) => {
      q.setFromEuler(e.set(0, t.rot, 0));
      m.compose(V(t.u, -0.02, t.v), q, V(t.s, t.s * rng.float(0.8, 1.2), t.s));
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, c.set(rng.pick(greens)));
    });
    tufts.castShadow = false;
    g.add(tufts);
  }

  // ---- how high the ground looks (for things laid on it: paw prints in the snow or the mud) ----
  const lineDist = (pts, u, v) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [au, av] = pts[i], du = pts[i + 1][0] - au, dv = pts[i + 1][1] - av, l2 = du * du + dv * dv;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / l2)) : 0;
      best = Math.min(best, (u - au - du * t) ** 2 + (v - av - dv * t) ** 2);
    }
    return Math.sqrt(best);
  };
  const bn = d.barn;

  // ---- where the game's things go (world coordinates) ----
  const turn = a.turn, rectOf = (u0, v0, u1, v1) => worldRect(a, u0, v0, u1, v1);
  const sty = d.sty, pen = d.pen;
  const [gx, gz] = W(d.gateU, vF);
  return {
    kind: 'farm', name: a.name, plan: a, layout: d, side: s,
    strip: a.strip, rect: a.rect, gate: V(gx, 0, gz),
    mud, pond: { pos: at(P.u, P.v), r: P.r, zone: pondZone },
    barn: { pos: at(bn.u, bn.v), door: at(...B.door), inside: at(...B.inside), loft: at(...B.loft, B.loftY), rosettes: at(...B.rosettes), face: turn + bn.face, rect: rectOf(bn.u - bn.w / 2, bn.v - bn.d / 2, bn.u + bn.w / 2, bn.v + bn.d / 2) },
    house: { door: at(...H.door), face: turn + H.face },
    basket: at(...d.basket),
    coop: { pos: at(d.coop.u, d.coop.v), door: at(...CO.door), face: turn + d.coop.face },
    sty: { pos: at(sty.u, sty.v), rect: rectOf(sty.u - sty.hu + 0.3, sty.v - sty.hv + 0.3, sty.u + sty.hu - 0.3, sty.v + sty.hv - 0.3), gate: at(...ST.gate), inGate: at(...ST.inGate), trough: at(...ST.trough), ark: at(...ST.ark) },
    pen: { rect: rectOf(pen.u0, pen.v0, pen.u1, pen.v1), gate: at(pen.gateU, pen.gateV), out: at(pen.gateU + s * 2.2, pen.gateV), mid: at((pen.u0 + pen.u1) / 2, pen.gateV), gap: pen.gap, side: s },
    sheepField: { rect: rectOf(SF.u0, SF.v0, SF.u1, SF.v1), gate: at(SF.fenceU, SF.gateV) },
    cropField: { rect: rectOf(CF.u0, CF.v0, CF.u1, CF.v1), gate: at(CF.fenceU, CF.gateV), u0: CF.u0, u1: CF.u1, v0: CF.v0, v1: CF.v1 },
    patch: rectOf(d.patch.u0, d.patch.v0, d.patch.u1, d.patch.v1),
    scarecrow: { pos: at(d.scarecrow.u, d.scarecrow.v), hat: at(...crow.hat, crow.hatY) },
    stack: { top: at(...HC.top, HC.y) },
    tractor: { pos: at(d.tractor.u, d.tractor.v), seat: at(...TR.seat, 1.08), face: turn + d.tractor.face },
    cart: { bed: at(...CT.bed, CT.y), pos: at(...cartAt) },
    well: at(d.well.u, d.well.v), trough: at(d.trough.u, d.trough.v), rack: at(...rackAt),
    farmer: at(d.farmer.u, d.farmer.v), posts: d.posts.map((p) => at(p.u, p.v)),
    orchard: apples.map((t) => ({ pos: at(t.u, t.v), s: t.s, bend: t.bend ?? 0 })),
    yard: { pos: at(Y.u, Y.v), r: Math.min(Y.ru, Y.rv) },
    hides: d.hides.map((h) => ({ id: h.id, name: h.name, pos: at(h.u, h.v, h.y ?? 0) })),
    smellSpots: d.smellSpots.map(([u, v]) => W(u, v)),
    /** A free spot on the farm for a job (world {x, z}), or null. */
    spot(q) { const p = d.free(q); if (!p) return null; const [x, z] = W(p[0], p[1]); return { x, z }; },
    /** In past the farm's hedge? */
    inFarm: (x, z) => inRect(a.rect, x, z),
    /** (u, v) in the farm's own frame, for a world point. */
    local: (x, z) => toLocal(a, x, z),
    W,
    /** The height of the ground you see at (x, z) in the farm's strip: the lane, the track, the yard, the barn floor, furrows, mud. */
    surfaceY(x, z) {
      const [u, v] = toLocal(a, x, z);
      let y = -0.05;
      if (((u - Y.u) / Y.ru) ** 2 + ((v - Y.v) / Y.rv) ** 2 < 0.92) y = 0.04;
      if (Math.abs(u - bn.u) < bn.w / 2 - 0.2 && Math.abs(v - bn.v) < bn.d / 2 - 0.2) y = 0.045;
      if (u > CF.u0 + 0.4 && u < CF.u1 - 0.4 && v > CF.v0 + 0.4 && v < CF.v1 - 0.4) y = 0.0;
      if (y < 0.058 && lineDist(d.lane, u, v) < 1.5) y = 0.058;
      if (y < 0.055 && lineDist(d.track, u, v) < 1.5) y = 0.055;
      for (const m of mud) if (((x - m.x) / m.rx) ** 2 + ((z - m.z) / m.rz) ** 2 < 1) y = Math.max(y, 0.066);
      return y;
    },
  };
}
