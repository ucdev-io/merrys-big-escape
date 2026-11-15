import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { PALETTE } from '../../render/palette.js';
import { RNG, fbm3 } from '../../core/rng.js';
import { Colliders } from '../collision.js';
import { mergeStatic, collectOccluders } from '../merge.js';
import { GrassField } from '../grassField.js';
import { tree, bush, picketFence, house, flowerBed, steppingStones, skyDome, gnome, paddlingPool, mesh, blobGeometry } from '../props.js';
import { TOWN } from './generator.js';
import {
  HOUSE_WALLS, HOUSE_ROOFS, DOORS, bench, lamppost, wheelieBin, crate, cardboardBox, puddle, birdbath, mailbox,
  kennel, swingSet, slide, lawnmower, bbq, cafeTable, shop, brickBuilding, car, hedge, pathRibbon,
} from './townProps.js';

const H = TOWN.BLOCK / 2;          // 15: half block
const EDGE = H - 0.4;              // where garden fences sit

/** Colliders in block-local coordinates (blocks are never rotated, only offset). */
/** A wheelie bin that can be knocked over: pivot (spins to face the fall) → tilt (hinged at the front edge) → bin. */
function tippableBin(x, z, ry, color) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  pivot.userData.noMerge = true;
  const tilt = new THREE.Group();
  tilt.position.z = 0.3;
  const body = mergeStatic(wheelieBin(0, 0, ry, color));
  body.position.z = -0.3;
  tilt.add(body);
  pivot.add(tilt);
  return pivot;
}

function localColliders(col, bx, bz, bones, extra) {
  const W = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1) + bx, z0: Math.min(z0, z1) + bz, x1: Math.max(x0, x1) + bx, z1: Math.max(z0, z1) + bz });
  return {
    // Mischief bookkeeping (world coordinates).
    bed: (x, z, w, d) => extra?.beds.push(W(x - w / 2, z - d / 2, x + w / 2, z + d / 2)),
    garden: (x0, z0, x1, z1, door) => { const gdn = { rect: W(x0, z0, x1, z1), door: new THREE.Vector3(door[0] + bx, 1.4, door[1] + bz) }; extra?.gardens.push(gdn); return gdn; },
    bin: (x, z, ry, color, garden = null) => {
      const pivot = tippableBin(x + bx, z + bz, ry, color);
      extra?.root.add(pivot);
      const collider = col.circle(x + bx, z + bz, 0.4, 1.05);
      extra?.bins.push({ id: `bin${extra.bins.length}`, pivot, x: x + bx, z: z + bz, collider, garden });
    },
    circle: (x, z, r, top, stand) => col.circle(x + bx, z + bz, r, top, stand),
    box: (x0, z0, x1, z1, top) => col.box(x0 + bx, z0 + bz, x1 + bx, z1 + bz, top),
    // A golden bone resting on something `top` high. `friend`: too high to reach alone.
    bone: (x, z, top, friend = false) => bones?.push({ x: x + bx, y: top + 0.18, z: z + bz, need: top - 0.15, friend }),
  };
}

/** Quarter-turn transform so district layouts can face any road. */
function turn(k) {
  const c = Math.round(Math.cos(k * Math.PI / 2)), s = Math.round(Math.sin(k * Math.PI / 2));
  return { p: (x, z) => [x * c + z * s, -x * s + z * c], ry: (r) => r + k * Math.PI / 2 };
}

// ---------------------------------------------------------------------------------------------
function ground() {
  const size = 420, seg = 140;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cA = new THREE.Color(PALETTE.grass), cB = new THREE.Color(PALETTE.grassDark), cC = new THREE.Color(PALETTE.grassLight), c = new THREE.Color();
  const half = TOWN.SIZE / 2 + 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const out = Math.hypot(Math.max(0, Math.abs(x) - half), Math.max(0, Math.abs(z) - half));
    const hill = (fbm3(x * 0.03, 0, z * 0.03, 4) - 0.3) * 10 * Math.min(1, out / 25);
    p.setY(i, out > 0 ? Math.max(0, hill) - 0.05 : -0.05);
    const n = fbm3(x * 0.12, 5, z * 0.12, 3);
    c.copy(cA).lerp(n > 0.5 ? cC : cB, Math.abs(n - 0.5) * 1.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

function streets(g, layout, rng, col, bones) {
  const S = TOWN.SIZE;
  // Tarmac under the whole town.
  const tarmac = mesh(new THREE.PlaneGeometry(S + 6, S + 6), 0xb7b2aa, g, [0, 0.01, 0], [-Math.PI / 2, 0, 0]);
  tarmac.castShadow = false;
  // Pavement ring + lawn for each block.
  for (const b of layout.blocks) {
    const pv = mesh(new RoundedBoxGeometry(TOWN.BLOCK + 4, 0.09, TOWN.BLOCK + 4, 2, 0.04), 0xddd2bf, g, [b.x, 0, b.z]);
    pv.castShadow = false;
    const lawnColor = b.type === 'alley' ? 0xc9bfae : b.type === 'bakery' ? 0xa9c47a : PALETTE.grass;
    const lw = mesh(new RoundedBoxGeometry(TOWN.BLOCK, 0.12, TOWN.BLOCK, 2, 0.05), lawnColor, g, [b.x, 0, b.z]);
    lw.castShadow = false;
  }
  // Dashed centre lines.
  const step = TOWN.BLOCK + TOWN.ROAD;
  const dashGeo = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  for (let k = 0; k <= TOWN.N; k++) {
    const line = -S / 2 + TOWN.ROAD / 2 + k * step;
    for (let t = -S / 2; t < S / 2; t += 4) {
      const nearCross = (((t + S / 2 - TOWN.ROAD / 2) % step) + step) % step;
      if (nearCross < TOWN.ROAD / 2 + 1 || nearCross > step - TOWN.ROAD / 2 - 1) continue;
      const a = mesh(dashGeo, 0xf4ecd8, g, [line, 0.015, t]); a.castShadow = false;
      const b = mesh(dashGeo, 0xf4ecd8, g, [t, 0.015, line], [0, Math.PI / 2, 0]); b.castShadow = false;
    }
  }
  // Lampposts on block corners, street trees, parked cars.
  for (const b of layout.blocks) {
    const br = new RNG(`${b.seed}:street`);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(lamppost(b.x + sx * (H + 1.4), b.z + sz * (H + 1.4)));
      col.circle(b.x + sx * (H + 1.4), b.z + sz * (H + 1.4), 0.12);
    }
    for (let side = 0; side < 4; side++) {
      if (!br.chance(0.6)) continue;
      const along = br.float(-9, 9);
      const [x, z] = [[along, H + 1.2], [H + 1.2, along], [along, -H - 1.2], [-H - 1.2, along]][side];
      g.add(tree(b.x + x, b.z + z, br.float(0.75, 0.95), br, col, { detail: 2, blobs: 3 }));
    }
  }
  const carCols = [0xd9534f, 0x5b86c4, 0xf6d06a, 0x6f9a52, 0xf1e8d8, 0x8e6fb0];
  for (let i = 0; i < 9; i++) {
    const k = rng.int(0, TOWN.N), alongIdx = rng.int(0, TOWN.N - 1);
    const line = -S / 2 + TOWN.ROAD / 2 + k * step;
    const along = -S / 2 + TOWN.ROAD + TOWN.BLOCK / 2 + alongIdx * step + rng.float(-8, 8);
    const side = rng.pick([-1, 1]) * 3;
    const vertical = rng.chance(0.5);
    const [x, z] = vertical ? [line + side, along] : [along, line + side];
    const ry = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.add(car(x, z, ry, rng.pick(carCols)));
    // Bonnet you can hop onto, then the roof.
    if (vertical) col.box(x - 0.95, z - 1.9, x + 0.95, z + 1.9, 0.75); else col.box(x - 1.9, z - 0.95, x + 1.9, z + 0.95, 0.75);
    const cz = -0.2, cx = Math.sin(ry) * cz, czz = Math.cos(ry) * cz;
    if (vertical) col.box(x + cx - 0.75, z + czz - 1.0, x + cx + 0.75, z + czz + 1.0, 1.33);
    else col.box(x + cx - 1.0, z + czz - 0.75, x + cx + 1.0, z + czz + 0.75, 1.33);
    if (i < 3) bones?.push({ x: x + cx, y: 1.33 + 0.18, z: z + czz, need: 1.18, friend: false });
  }
}

// ---------------------------------------------------------------------------------------------
/** One garden lot in the corner (qx,qz) of a block, facing the x-road or z-road. */
function lot(g, lc, rng, qx, qz, faceX, { home = false } = {}) {
  const c = [qx * H / 2, qz * H / 2];
  const f = faceX ? [qx, 0] : [0, qz];
  const p = faceX ? [0, 1] : [1, 0];
  const ry = Math.atan2(f[0], f[1]);
  const at = (fwd, side = 0) => [c[0] + f[0] * fwd + p[0] * side, c[1] + f[1] * fwd + p[1] * side];

  const w = home ? 7 : rng.float(6, 7.5), d = home ? 5.5 : rng.float(5, 6);
  const [hx, hz] = at(-1.8);
  g.add(house(hx, hz, ry, rng, lc, home
    ? { w, d, h: 3.4, wall: PALETTE.wall, roof: PALETTE.roof, door: PALETTE.door }
    : { w, d, h: rng.float(3, 3.6), wall: rng.pick(HOUSE_WALLS), roof: rng.pick(HOUSE_ROOFS), door: rng.pick(DOORS) }));

  // Fences on the two outer edges; the front one has a gate gap.
  const fenceStyle = home ? 'white' : rng.pick(['white', 'white', 'wood', 'hedge']);
  const gate = faceX ? c[1] : c[0];
  const edge = (alongX, fixed, from, to, gapAt) => {
    const segs = gapAt === null ? [[from, to]] : [[from, gapAt - 1.0 * Math.sign(to - from)], [gapAt + 1.0 * Math.sign(to - from), to]];
    for (const [a, b] of segs) {
      if (Math.abs(b - a) < 0.5) continue;
      const [x0, z0, x1, z1] = alongX ? [a, fixed, b, fixed] : [fixed, a, fixed, b];
      if (fenceStyle === 'hedge') g.add(hedge(x0, z0, x1, z1, rng, lc));
      else g.add(picketFence(x0, z0, x1, z1, lc, fenceStyle === 'wood' ? { color: PALETTE.wood, height: 1.1, simple: true } : { simple: true }));
    }
  };
  // x-edge: fixed x = qx*EDGE, runs along z.   z-edge: fixed z = qz*EDGE, runs along x.
  edge(false, qx * EDGE, qz * 0.6, qz * EDGE, faceX ? gate : null);
  edge(true, qz * EDGE, qx * 0.6, qx * EDGE, faceX ? null : gate);

  // Path from door to gate.
  const pts = [];
  for (let i = 0; i <= 4; i++) { const [x, z] = at(-1.8 + d / 2 + 0.6 + i * ((H / 2 - d / 2 + 1) / 4)); pts.push([x + rng.float(-0.15, 0.15), z + rng.float(-0.15, 0.15)]); }
  g.add(steppingStones(pts, rng));

  // Garden.
  const [tx, tz] = at(-5.6, rng.float(-3.5, 3.5));
  g.add(tree(tx, tz, rng.float(0.9, 1.25), rng, lc, { detail: 2, blobs: 4 }));
  const [bx, bz] = at(H / 2 - 1.2, rng.pick([-1, 1]) * 5.6);
  g.add(bush(bx, bz, rng.float(0.8, 1.1), rng, lc, undefined, 2));
  const [fx, fz] = at(-1.8 + d / 2 + 1.1, rng.pick([-1, 1]) * 2.6);
  const [bw, bd] = faceX ? [0.9, 2.2] : [2.2, 0.9];
  g.add(flowerBed(fx, fz, bw, bd, rng, null)); // walk right through it… and get told off
  lc.bed(fx, fz, bw, bd);
  const [dx, dz] = at(-1.8 + d / 2 + 0.15);
  const garden = lc.garden(0, 0, qx * H, qz * H, [dx, dz]);
  garden.home = home;
  const [mx, mz] = at(H / 2 - 0.9, 1.6);
  g.add(mailbox(mx, mz, ry, rng.pick([0xd9534f, 0x5b86c4, 0x6f9a52])));
  lc.circle(mx, mz, 0.2);

  if (home) {
    const [px, pz] = at(-6, -3.5);
    g.add(paddlingPool(px, pz, lc));
    const [gx, gz] = at(3.5, 3.8);
    g.add(gnome(gx, gz, ry));
    return { gateOutside: at(H / 2 + 1.3), front: f, home: true, garden };
  }
  const extras = [
    () => { const [x, z] = at(-5.5, 4); g.add(kennel(x, z, ry)); lc.circle(x, z, 0.6, 1.05); },
    () => { const [x, z] = at(2.5, -4.5); g.add(birdbath(x, z)); lc.circle(x, z, 0.3); },
    () => { const [x, z] = at(-6, -4); g.add(bench(x, z, ry)); lc.circle(x, z, 0.75, 0.5); },
    () => { const [x, z] = at(3.8, 4.2); g.add(gnome(x, z, ry)); lc.circle(x, z, 0.2); },
    () => { const [x, z] = at(-6.2, 0); g.add(swingSet(x, z, ry + Math.PI / 2)); },
  ];
  rng.shuffle(extras).slice(0, rng.int(1, 2)).forEach((fn) => fn());
  // Bin day: some houses have put their bin out on the pavement.
  if (rng.chance(0.4)) { const [bx2, bz2] = at(H / 2 + 0.9, -2.6); lc.bin(bx2, bz2, ry + Math.PI, rng.pick([0x5d8c55, 0x5b86c4, 0x4a4a52]), garden); }
  return { gateOutside: at(H / 2 + 1.3), front: f, garden };
}

function housesBlock(g, lc, rng, homeLot) {
  const lots = [];
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    const isHome = homeLot && homeLot.qx === qx && homeLot.qz === qz;
    lots.push(lot(g, lc, rng, qx, qz, isHome ? homeLot.faceX : rng.chance(0.5), { home: isHome }));
  }
  // Hedges between gardens, with gaps so a sneaky dog can slip through.
  g.add(hedge(0, -EDGE, 0, EDGE, rng, lc, { skipFrom: 0.4, skipTo: 0.48 }));
  g.add(hedge(-EDGE, 0, EDGE, 0, rng, lc, { skipFrom: 0.55, skipTo: 0.63 }));
  return lots;
}

function parkBlock(g, lc, rng) {
  // Hedge border with an entrance in the middle of each side.
  for (const [x0, z0, x1, z1] of [[-EDGE, -EDGE, EDGE, -EDGE], [-EDGE, EDGE, EDGE, EDGE], [-EDGE, -EDGE, -EDGE, EDGE], [EDGE, -EDGE, EDGE, EDGE]]) {
    g.add(hedge(x0, z0, x1, z1, rng, lc, { skipFrom: 0.43, skipTo: 0.57, height: 0.8 }));
  }
  const loop = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = 8.5 + rng.float(-1.2, 1.2);
    loop.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  g.add(pathRibbon(loop, 2.0, 0xe2d3b8));
  // Spokes to the entrances.
  for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) g.add(pathRibbon([[x * 7, z * 7], [x * 11, z * 11], [x * 15, z * 15], [x * 11.1, z * 11.1]], 1.6, 0xe2d3b8));

  const free = (x, z) => { const r = Math.hypot(x, z); return Math.abs(r - 8.5) > 2.6 && Math.abs(x) > 1.5 && Math.abs(z) > 1.5; };
  let n = 0;
  for (let t = 0; t < 40 && n < 8; t++) {
    const x = rng.float(-12.5, 12.5), z = rng.float(-12.5, 12.5);
    if (!free(x, z) || (Math.abs(x) < 5 && Math.abs(z) < 5)) continue;
    g.add(tree(x, z, rng.float(1.1, 1.6), rng, lc, { detail: 2, blobs: 5 }));
    n++;
  }
  g.add(birdbath(0, 0)); lc.circle(0, 0, 0.35, 0.92);
  lc.bone(0, 0, 1.15, true); // floating above the birdbath: needs a friend's back to reach
  g.add(flowerBed(-2.8, 2.8, 2, 2, rng, null)); lc.bed(-2.8, 2.8, 2, 2);
  g.add(flowerBed(2.8, -2.8, 2, 2, rng, null)); lc.bed(2.8, -2.8, 2, 2);
  for (const a of [0.6, 2.4, 4.3]) {
    const x = Math.cos(a) * 10.4, z = Math.sin(a) * 10.4;
    g.add(bench(x, z, Math.atan2(-x, -z))); lc.circle(x, z, 0.75, 0.5);
    if (a === 2.4) lc.bone(x, z, 0.5);
  }
  g.add(swingSet(-10, 6, 0.3));
  g.add(slide(9.5, -6.5, -0.8));
  {
    // Steps (0.4, 0.8, 1.2) up to the platform (1.55): hop, hop, hop!
    const ry = -0.8, s = Math.sin(ry), c = Math.cos(ry);
    const at = (lz) => [9.5 + s * lz, -6.5 + c * lz];
    [[-2.5, 0.3], [-2.14, 0.6], [-1.78, 0.9]].forEach(([lz, top]) => { const [x, z] = at(lz); lc.circle(x, z, 0.24, top); });
    const [px, pz] = at(-1.0);
    lc.circle(px, pz, 0.48, 1.2);
    lc.bone(px, pz, 1.2);
  }
  const mower = lawnmower(6, 4, -0.6);
  g.add(mower); lc.circle(6, 4, 0.5);
}

function pondBlock(g, lc, rng) {
  const rx = 9.5, rz = 6.5;
  const sand = mesh(new THREE.CircleGeometry(1, 48), 0xd9cbb2, g, [0, 0.065, 0], [-Math.PI / 2, 0, 0], [rx + 1.3, rz + 1.3, 1]);
  sand.castShadow = false;
  const water = mesh(new THREE.CircleGeometry(1, 48), 0x8fc4d8, g, [0, 0.075, 0], [-Math.PI / 2, 0, 0], [rx, rz, 1]);
  water.castShadow = false;
  const deep = mesh(new THREE.CircleGeometry(1, 40), 0x78afc8, g, [0.8, 0.08, -0.4], [-Math.PI / 2, 0, 0], [rx * 0.6, rz * 0.55, 1]);
  deep.castShadow = false;
  for (const [x, r] of [[-6, 4.6], [-2, 6], [2, 6], [6, 4.6]]) lc.circle(x, 0, r, 0.31, false);
  // Lily pads.
  for (let i = 0; i < 14; i++) {
    const a = rng.float(0, Math.PI * 2), k = rng.float(0.3, 0.85);
    const x = Math.cos(a) * rx * k, z = Math.sin(a) * rz * k;
    const pad = mesh(new THREE.CircleGeometry(0.35, 12, 0.3, Math.PI * 1.85), 0x7fae64, g, [x, 0.09, z], [-Math.PI / 2, 0, rng.float(0, 6)], [rng.float(0.7, 1.3), rng.float(0.7, 1.3), 1]);
    pad.castShadow = false;
    if (rng.chance(0.35)) mesh(new THREE.IcosahedronGeometry(0.09, 0), 0xf2a0b4, g, [x, 0.14, z]);
  }
  // Reeds around the shore.
  for (let i = 0; i < 16; i++) {
    const a = rng.float(0, Math.PI * 2);
    const x = Math.cos(a) * (rx + 0.3), z = Math.sin(a) * (rz + 0.3);
    for (let k = 0; k < 6; k++) {
      const h = rng.float(0.6, 1.2);
      mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 4), 0x6f9a52, g, [x + rng.float(-0.3, 0.3), h / 2, z + rng.float(-0.3, 0.3)], [rng.float(-0.15, 0.15), 0, rng.float(-0.15, 0.15)]);
      if (rng.chance(0.4)) mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 6), 0x8a6346, g, [x + rng.float(-0.3, 0.3), h + 0.05, z + rng.float(-0.3, 0.3)]);
    }
  }
  // Little wooden jetty.
  const jx = 0, jz = rz + 1.6;
  for (let i = 0; i < 9; i++) mesh(new RoundedBoxGeometry(1.3, 0.08, 0.32, 1, 0.02), 0xc79b6d, g, [jx, 0.25, jz - i * 0.36]);
  for (const sx of [-0.6, 0.6]) for (const sz of [0, -2.9]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), 0x9b7452, g, [jx + sx, 0.15, jz + sz]);
  lc.box(jx - 0.65, jz - 3.05, jx + 0.65, jz + 0.2, 0.3);
  lc.bone(jx, jz - 2.8, 0.3);
  // Rocks, trees, benches.
  for (let i = 0; i < 8; i++) {
    const a = rng.float(0, Math.PI * 2);
    const s = rng.float(0.25, 0.5);
    mesh(blobGeometry(rng.int(0, 20), 0.3, 2), rng.pick([0xb8b0a4, 0xa39b90]), g, [Math.cos(a) * (rx + 1.1), s * 0.3, Math.sin(a) * (rz + 1.1)], [rng.float(0, 3), rng.float(0, 3), 0], [s, s * 0.6, s]);
  }
  for (const [x, z] of [[-12, -11], [12, -11], [-12, 11.5], [12.5, 10]]) g.add(tree(x + rng.float(-1, 1), z + rng.float(-1, 1), rng.float(1.1, 1.5), rng, lc, { detail: 2, blobs: 5 }));
  g.add(bench(-5, rz + 3.2, Math.PI)); lc.circle(-5, rz + 3.2, 0.75, 0.5);
  g.add(bench(5.5, -rz - 3.2, 0)); lc.circle(5.5, -rz - 3.2, 0.75, 0.5);
}

function bakeryBlock(g, lc, rng) {
  const T = turn(rng.int(0, 3));
  const box = (x0, z0, x1, z1) => { const [a, b] = T.p(x0, z0), [c, d] = T.p(x1, z1); lc.box(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)); };
  const names = [0xd9534f, 0x5b86c4, 0xe0b04a];
  [-9.5, 0, 9.5].forEach((x, i) => {
    const [px, pz] = T.p(x, 6.5);
    g.add(shop(px, pz, T.ry(0), rng, { w: 8.4, d: 7, h: rng.float(4, 5), sign: names[i] }));
    box(x - 4.3, 3, x + 4.3, 10.1);
    const [tx, tz] = T.p(x - 1.5, 12.6);
    g.add(cafeTable(tx, tz, rng.pick([0xf2a0b4, 0xf6d06a, 0x8fc4d8])));
    lc.circle(tx, tz, 0.45, 0.74);
    if (i === 1) lc.bone(tx, tz, 0.74);
  });
  // Back yard behind the shops: bins, crates and the famous BBQ. The baker shouts from the shop door.
  const [sdx, sdz] = T.p(-9.5 + 2.5, 10.2);
  const shopkeeper = lc.garden(sdx, sdz, sdx, sdz, [sdx, sdz]);
  const [qx, qz] = T.p(4, -2);
  g.add(bbq(qx, qz, T.ry(0))); lc.circle(qx, qz, 0.5);
  for (let i = 0; i < 4; i++) {
    const [x, z] = T.p(-12 + i * 1.2, 1.6);
    lc.bin(x, z, T.ry(Math.PI), rng.pick([0x5d8c55, 0x5b86c4, 0x4a4a52]), shopkeeper);
    if (i === 2) lc.bone(x, z, 1.05, true); // on a bin lid: give a friend a boost
  }
  for (let i = 0; i < 3; i++) { const [x, z] = T.p(10 + rng.float(-1, 1), 1.2 + i * 0.1); g.add(crate(x, z, rng.float(0, 1))); lc.circle(x, z, 0.4, 0.5); }
  for (const [x, z] of [[-9, -9], [0, -11], [9, -8]]) {
    const [tx, tz] = T.p(x + rng.float(-1, 1), z);
    g.add(tree(tx, tz, rng.float(1, 1.3), rng, lc, { detail: 2, blobs: 4 }));
  }
  g.add(hedge(...T.p(-EDGE, -EDGE), ...T.p(EDGE, -EDGE), rng, lc));
}

function alleyBlock(g, lc, rng) {
  const colors = [0xc88e74, 0xb7836e, 0xd1a084, 0xa97c6c];
  let i = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = 10.4, h = rng.float(6, 8.5);
    const ry = Math.abs(sx) > 0 && rng.chance(0.5) ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : (sz > 0 ? 0 : Math.PI);
    g.add(brickBuilding(sx * 9.4, sz * 9.4, ry, w, w, h, colors[i++]));
    lc.box(sx * 9.4 - w / 2, sz * 9.4 - w / 2, sx * 9.4 + w / 2, sz * 9.4 + w / 2);
  }
  // Clutter in the alley.
  const spots = [];
  for (let k = 0; k < 14; k++) {
    const along = rng.float(-13, 13), off = rng.pick([-3.2, 3.2]);
    spots.push(rng.chance(0.5) ? [along, off] : [off, along]);
  }
  spots.forEach(([x, z], k) => {
    if (Math.abs(x) < 3 && Math.abs(z) < 3) return;
    if (x > 4.5 && x < 8.5 && z < -2) return; // keep the staircase clear
    const r = k % 3;
    if (r === 0) lc.bin(x, z, rng.float(0, 6), rng.pick([0x5d8c55, 0x5b86c4, 0x4a4a52, 0x9b7452]));
    else if (r === 1) { const s = rng.float(0.8, 1.2); g.add(crate(x, z, rng.float(0, 1), s)); lc.circle(x, z, 0.4, 0.5 * s); }
    else { g.add(cardboardBox(x, z, rng.float(0, 6))); lc.circle(x, z, 0.35, 0.36); }
  });
  // Crate staircase against the wall: 1, 2 then 3 crates high.
  for (let n = 1; n <= 3; n++) {
    const x = 5.2 + (n - 1) * 0.66, z = -3.55;
    for (let k = 0; k < n; k++) { const c = crate(x, z, 0); c.position.y = k * 0.5; g.add(c); }
    lc.box(x - 0.31, z - 0.31, x + 0.31, z + 0.31, n * 0.5);
  }
  lc.bone(5.2 + 2 * 0.66, -3.55, 1.5);
  for (let k = 0; k < 5; k++) g.add(puddle(rng.float(-1, 1) * (k % 2 ? 1 : 10), rng.float(-1, 1) * (k % 2 ? 10 : 1), rng.float(0.8, 1.6)));
}

// ---------------------------------------------------------------------------------------------
/** Build the whole town from a layout. Returns the same shape of "world" as the yard. */
export function buildTown(layout) {
  const rng = new RNG(`build:${layout.seed}`);
  const root = new THREE.Group();
  const col = new Colliders();
  const bones = [];
  const extra = { root, beds: [], gardens: [], bins: [] };

  root.add(ground());
  streets(root, layout, rng, col, bones);

  let spawn = new THREE.Vector3(0, 0, 0), spawnFace = 0;
  const otherHomes = []; // every other garden in town: one per dog in a pack
  for (const b of layout.blocks) {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    root.add(g);
    const lc = localColliders(col, b.x, b.z, bones, extra);
    const br = new RNG(b.seed);
    if (b.type === 'houses' || b.type === 'home') {
      const lots = housesBlock(g, lc, br, b.type === 'home' ? b.homeLot : null);
      for (const l of lots) if (!l.home) otherHomes.push({ pos: new THREE.Vector3(b.x + l.gateOutside[0], 0, b.z + l.gateOutside[1]), face: Math.atan2(l.front[0], l.front[1]), garden: l.garden });
      const home = lots.find((l) => l.home);
      if (home) {
        spawn = new THREE.Vector3(b.x + home.gateOutside[0], 0, b.z + home.gateOutside[1]);
        spawnFace = Math.atan2(home.front[0], home.front[1]);
        // The tunnel Merry dug in the yard chapter pops out here.
        const hole = mesh(new THREE.CircleGeometry(0.4, 18), 0x4a3426, root, [spawn.x - home.front[0] * 0.6, 0.06, spawn.z - home.front[1] * 0.6], [-Math.PI / 2, 0, 0]);
        hole.castShadow = false;
      }
    } else if (b.type === 'park') parkBlock(g, lc, br);
    else if (b.type === 'pond') pondBlock(g, lc, br);
    else if (b.type === 'bakery') bakeryBlock(g, lc, br);
    else if (b.type === 'alley') alleyBlock(g, lc, br);
  }

  // Countryside around the town.
  for (let i = 0; i < 60; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(TOWN.SIZE / 2 + 12, TOWN.SIZE / 2 + 60);
    root.add(tree(Math.cos(a) * r, Math.sin(a) * r, rng.float(1.2, 2), rng, null, { detail: 1, blobs: 3 }));
  }

  const sky = skyDome(190);
  root.add(sky);

  // Lawns (for the grass that follows Merry around): O(1) block lookup.
  const step = TOWN.BLOCK + TOWN.ROAD, origin = -TOWN.SIZE / 2 + TOWN.ROAD;
  const byIndex = new Map(layout.blocks.map((b) => [`${b.i},${b.j}`, b]));
  const isLawn = (x, z) => {
    const i = Math.floor((x - origin) / step), j = Math.floor((z - origin) / step);
    const b = byIndex.get(`${i},${j}`);
    if (!b || b.type === 'alley') return false;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) > H - 0.3 || Math.abs(dz) > H - 0.3) return false;
    if (b.type === 'pond' && (dx / 10.8) ** 2 + (dz / 7.8) ** 2 < 1) return false;
    if (b.type === 'park' && Math.abs(Math.hypot(dx, dz) - 8.5) < 1.3) return false;
    return true;
  };

  const occluders = collectOccluders(root);
  const group = mergeStatic(root, { chunk: 45 });
  const half = TOWN.SIZE / 2 + 4;
  return {
    group,
    colliders: col,
    occluders,
    spawn,
    spawnFace,
    bones: bones.map((b, i) => ({ ...b, id: `bone${i}` })),
    beds: extra.beds,
    gardens: extra.gardens,
    bins: extra.bins,
    // Home 0 is the first dog's garden; each extra dog in a pack gets the next one.
    homes: [{ pos: spawn.clone(), face: spawnFace, garden: extra.gardens.find((gd) => gd.home) }, ...new RNG(`homes:${layout.seed}`).shuffle(otherHomes)],
    bounds: { x0: -half, x1: half, z0: -half, z1: half },
    layout,
    props: {},
    grass: null,
    attach(scene) { this.grass = new GrassField(scene, isLawn); },
    update(t, player) { if (player && this.grass) this.grass.update(player.x, player.z); },
  };
}
