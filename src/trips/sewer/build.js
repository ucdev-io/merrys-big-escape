import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry } from '../../world/props.js';
import { fbm3 } from '../../core/rng.js';
import { tripWorld } from '../kit.js';

/*
 * 🕳️ The sewers, built: a plus of tunnels round a hub, seen from above with the earth cut away (no ceiling,
 * so the camera looks down into them). Their own coordinates (0, 0 is the middle of the hub):
 *
 *                 ┃ ladder up to the alley (north)
 *                 ┃
 *   duck pipe ════╋════════ the channel (water, flowing east) ════ outfall to the beach (grilled shut,
 *   + sluice      ┃ hub (bridge)                                  until the sluice wheel is turned)
 *                 ┃
 *                 ┃ Nibbles' Lost Property (south)
 *
 * Bright and silly, not scary: warm lanterns, mossy bricks, pipes and puddles.
 */

export const S = {
  L: 30,      // the channel runs from x −L to L
  CW: 1.5,    // half the channel's width (water)
  WALK: 4,    // the walkways go out to |z| = WALK
  HUB: 7,     // the hub: |x|, |z| < HUB
  NA: 2,      // the north tunnel: |x| < NA, up to z = NORTH
  NORTH: 22,
  SA: 2.5,    // the south tunnel: |x| < SA, down to z = SOUTH
  SOUTH: -17,
  H: 1.4,     // how high the walls are
  bridges: [-16, 0, 16],
  wheel: { x: -27.5, z: 3.55 },   // the sluice wheel, on the north wall at the west end
  bucket: { x: -3.4, z: 2.75 },   // where rescued ducks go (in the hub)
  nibbles: { x: 0, z: -15.2 },    // Nibbles' counter
};

const BRICK = 0x9c8f80, BRICK_DARK = 0x857a6d, MOSS = 0x7f9a5c, CURB = 0xc3bbac, WATER = 0x6f9d8f, DEEP = 0x5e8c80;
const SOIL = 0.26, SOIL_C = 0x7a644d, MORTAR = 0x8b7f71, ROOT = 0x8a6a4a;
const BRICKS = [0xb48468, 0xa9775e, 0xbb8f72, 0xa88470, 0xb79a7c];  // (patches of old red brick showing through)
const PEBBLES = [0x9a8f84, 0xb3a796, 0x857869, 0xc2b6a2];
const STONES = [0x857a6c, 0x958a7b, 0x786d60, 0x9f9484];                 // (in the earth on top: duller than the ones in the wall)
const EARTH_MIX = { dark: 0x564b3f, light: 0x6c5f4f, tint: 0x66704a, scale: 0.32, tintAt: 0.6 };  // (mottled soil, mossy here and there)
const FLOOR_MIX = { dark: 0xa0988a, light: 0xb2aa9a, tint: 0x9aa294, scale: 0.4, tintAt: 0.64 }; // (damp patches on the stones)
const GRASS = [0x7f9a5c, 0x8eaa62, 0x6f8c52];
const LIGHT = 0xfff3c8;                                              // (daylight down the drains)
const SHAFTS = [[-20, 2.7], [17, -2.9], [0, 15.5], [-0.5, -12]];      // (where the street's drains are, above)
const FLOW = 0.75;                                                   // (the current, m/s east: as the chapter's)
// See-through things come in just three kinds (each kind is merged into one shape: few draw calls on a phone).
const GLOW = { transparent: true, opacity: 0.2 };                            // light on the floor and walls
const BEAM = { transparent: true, opacity: 0.2, side: THREE.DoubleSide };    // daylight coming down
const WET = { transparent: true, opacity: 0.55 };                            // trickles and puddles

/** Into a group, in local coordinates. */
function box(g, w, h, d, color, x, y, z, { cast = true, occluder = false, ry = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint(color));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = true;
  if (occluder) m.userData.occluder = true;
  g.add(m);
  return m;
}
function flat(g, geo, color, x, y, z, ry = 0, opts) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.rotation.set(-Math.PI / 2, 0, ry);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function cyl(g, r0, r1, h, color, pos, rot = [0, 0, 0], seg = 10, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** @returns { scene, world, dyn, parts } — dyn: a group in the trip's own coordinates for things that move. */
export function buildSewer(origin) {
  const { group: g, C, W, R, col } = tripWorld(origin);
  const { L, CW, WALK, HUB, NA, NORTH, SA, SOUTH, H } = S;
  g.userData.season = 'none'; // (no snow down here)
  const rnd = mulberry(7);

  // ---- the earth all round, cut away: solid blocks with brick sides, mossy earth on top ----
  const X = L + 5, ZN = NORTH + 4, ZS = SOUTH - 4;
  const blocks = [
    [-X, WALK, -HUB, ZN], [-HUB, HUB, -NA, ZN], [HUB, WALK, X, ZN], [NA, HUB, HUB, ZN],             // north side
    [-X, ZS, -HUB, -WALK], [-HUB, ZS, -SA, -HUB], [HUB, ZS, X, -WALK], [SA, ZS, HUB, -HUB],         // south side
    [-NA, NORTH, NA, ZN], [-SA, ZS, SA, SOUTH],                                                     // the tunnels' ends
    [-X, -WALK, -L, WALK], [L, -WALK, X, WALK],                                                     // the channel's ends
  ];
  for (const [x0, z0, x1, z1] of blocks) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(g, w, H - SOIL, d, BRICK, cx, (H - SOIL) / 2, cz, { occluder: true });
    box(g, w, SOIL, d, SOIL_C, cx, H - SOIL / 2, cz, { occluder: true }); // (the cut-away's edge: a band of earth over the bricks)
    flat(g, mottled(w, d, cx, cz, EARTH_MIX), 0xffffff, cx, H + 0.005, cz, 0, { vertexColors: true });
    C.box(x0, z0, x1, z1);
  }
  // A darker band of brick along the foot of the walls, and moss here and there on top.
  const band = (x0, z0, x1, z1) => box(g, Math.max(0.06, x1 - x0), 0.28, Math.max(0.06, z1 - z0), BRICK_DARK, (x0 + x1) / 2, 0.14, (z0 + z1) / 2, { cast: false });
  band(-L, WALK - 0.03, -HUB, WALK + 0.01); band(HUB, WALK - 0.03, L, WALK + 0.01);
  band(-L, -WALK - 0.01, -HUB, -WALK + 0.03); band(HUB, -WALK - 0.01, L, -WALK + 0.03);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 2 * X - X, z = (rnd() < 0.5 ? 1 : -1) * (WALK + 0.6 + rnd() * 6);
    if (Math.abs(x) < HUB + 1) continue;
    const m = new THREE.Mesh(blobGeometry(i, 0.3, 1), paint(MOSS));
    m.scale.set(0.5 + rnd() * 0.9, 0.12, 0.4 + rnd() * 0.6);
    m.position.set(x, H + 0.02, z);
    g.add(m);
  }

  // ---- the walls' faces: courses of stone, patches of old red brick, and the earth band on top (pebbles in
  // it, roots hanging out of it, grass leaning over the edge). A seeded random of its own (the rest stays put).
  const art = mulberry(11);
  const faces = [];
  const face = (x0, z0, x1, z1, nx, nz, end = false) => faces.push({ x0, z0, x1, z1, nx, nz, end, len: Math.hypot(x1 - x0, z1 - z0) });
  for (const s of [-1, 1]) {
    face(-L, s * WALK, -HUB, s * WALK, 0, -s); face(HUB, s * WALK, L, s * WALK, 0, -s);  // along the walkways
    face(s * HUB, WALK, s * HUB, HUB, -s, 0); face(s * HUB, -HUB, s * HUB, -WALK, -s, 0); // the hub's sides
    face(s * NA, HUB, s * NA, NORTH, -s, 0); face(s * SA, SOUTH, s * SA, -HUB, -s, 0);    // the tunnels' sides
    face(s * L, -WALK, s * L, WALK, -s, 0, true);                                          // the channel's ends (pipes there)
  }
  face(-HUB, HUB, -NA, HUB, 0, -1); face(NA, HUB, HUB, HUB, 0, -1);      // the hub's north wall
  face(-HUB, -HUB, -SA, -HUB, 0, 1); face(SA, -HUB, HUB, -HUB, 0, 1);    // …and south
  face(-NA, NORTH, NA, NORTH, 0, -1, true); face(-SA, SOUTH, SA, SOUTH, 0, 1, true); // the tunnels' ends (the ladder, Nibbles' sign)
  const along = (f, s, out = 0) => { const k = s / f.len; return [f.x0 + (f.x1 - f.x0) * k + f.nx * out, f.z0 + (f.z1 - f.z0) * k + f.nz * out]; };
  const turnOf = (f) => Math.atan2(-(f.z1 - f.z0), f.x1 - f.x0); // (a box's length laid along the face)
  const TOP = H - SOIL, BLADE = new THREE.ConeGeometry(0.022, 1, 5);
  for (const f of faces) {
    const ry = turnOf(f), [mx, mz] = along(f, f.len / 2, 0.006);
    for (const y of [0.46, 0.64, 0.82, 1.0]) box(g, f.len, 0.016, 0.014, MORTAR, mx, y, mz, { cast: false, ry }); // courses
    if (!f.end) {
      // Patches of brick, a course or three high.
      const n = Math.max(1, Math.round(f.len / 5.5));
      for (let i = 0; i < n; i++) {
        const s0 = ((i + 0.2 + art() * 0.6) * f.len) / n, rows = 1 + Math.floor(art() * 3), cols = 3 + Math.floor(art() * 3), k0 = Math.floor(art() * (5 - rows));
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if ((c === 0 || c === cols - 1) && art() < 0.35) continue; // (ragged edges)
          const s = s0 + (c - cols / 2 + (r % 2) * 0.5) * 0.38;
          if (s < 0.35 || s > f.len - 0.35) continue;
          const [x, z] = along(f, s, 0.012);
          box(g, 0.35, 0.14, 0.03, BRICKS[Math.floor(art() * BRICKS.length)], x, 0.37 + 0.18 * (k0 + r), z, { cast: false, ry });
        }
      }
      // Roots hanging out of the earth, down over the stones.
      for (let s = 1 + art() * 3; s < f.len - 0.6; s += 3 + art() * 5) {
        const [x, z] = along(f, s, 0.012), side = (art() - 0.5) * 0.3, len = 0.25 + art() * 0.45, tx = (f.x1 - f.x0) / f.len, tz = (f.z1 - f.z0) / f.len;
        // (from a tree up in the town: across the earth, over the edge, and dangling down the wall)
        const back = 0.8 + art() * 2.2, wig = () => (art() - 0.5) * 0.35;
        const pts = [[wig() * 2, H + 0.012, -back], [wig(), H + 0.02, -back * 0.66], [wig(), H + 0.02, -back * 0.33], [0, H + 0.01, 0.01], [0, TOP + 0.08, 0.02], [side * 0.3, TOP + 0.08 - len * 0.4, 0.03], [side * 0.8, TOP + 0.08 - len * 0.75, 0.04], [side, TOP + 0.08 - len, 0.025]]
          .map(([a, y, o]) => new THREE.Vector3(x + tx * a + f.nx * o, y, z + tz * a + f.nz * o));
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.014, 5), paint(ROOT));
        m.castShadow = true;
        g.add(m);
      }
    }
    // Pebbles in the earth band.
    for (let s = 0.4 + art(); s < f.len - 0.3; s += 0.9 + art() * 1.6) {
      const [x, z] = along(f, s, 0.004), r = 0.035 + art() * 0.045;
      const m = new THREE.Mesh(blobGeometry(Math.floor(art() * 8), 0.3, 0), paint(PEBBLES[Math.floor(art() * PEBBLES.length)]));
      m.scale.set(r * 1.4, r, r * 1.2);
      m.position.set(x, H - SOIL * (0.25 + art() * 0.5), z);
      g.add(m);
    }
    // Tufts of grass along the top, leaning out over the edge.
    for (let s = 0.3 + art(); s < f.len - 0.2; s += 0.8 + art() * 1.8) {
      const [x, z] = along(f, s, -0.05);
      for (let k = 0; k < 3; k++) {
        const h = 0.14 + art() * 0.12, lean = 0.35 + art() * 0.4, j = (k - 1) * 0.05;
        const m = new THREE.Mesh(BLADE, paint(GRASS[Math.floor(art() * GRASS.length)]));
        m.scale.set(1, h, 1);
        m.position.set(x + (f.x1 - f.x0) / f.len * j, H + h * 0.4, z + (f.z1 - f.z0) / f.len * j);
        m.rotation.set(f.nz * lean, 0, -f.nx * lean);
        g.add(m);
      }
    }
  }

  // ---- the earth, seen from above: stones, and a worm or two ----
  const onEarth = (x, z) => blocks.some(([x0, z0, x1, z1]) => x > x0 + 0.25 && x < x1 - 0.25 && z > z0 + 0.25 && z < z1 - 0.25);
  const total = faces.reduce((n, f) => n + f.len, 0);
  const nearWall = (far) => { // (a spot on the earth not far behind a wall: where the camera sees)
    for (let tries = 0; tries < 8; tries++) {
      let s = art() * total, f = faces[0];
      for (const q of faces) { if (s < q.len) { f = q; break; } s -= q.len; }
      const [x, z] = along(f, s, -(0.3 + art() * far));
      if (onEarth(x, z)) return [x, z];
    }
    return null;
  };
  for (let i = 0; i < 110; i++) { // stones
    const p = nearWall(6);
    if (!p) continue;
    const r = 0.04 + art() * art() * 0.14;
    const m = new THREE.Mesh(blobGeometry(Math.floor(art() * 8), 0.3, 0), paint(STONES[Math.floor(art() * STONES.length)]));
    m.scale.set(r * 1.3, r * 0.55, r);
    m.rotation.y = art() * 6.3;
    m.position.set(p[0], H + 0.006, p[1]);
    g.add(m);
  }
  for (let i = 0; i < 9; i++) { // worms (wiggling about down here, minding their own business)
    const p = nearWall(3);
    if (!p) continue;
    const a = art() * 6.3, c = Math.cos(a), sn = Math.sin(a), pts = [];
    for (let k = 0; k < 5; k++) { const u = (k - 2) * 0.07, w = Math.sin(k * 1.9 + i) * 0.035; pts.push(new THREE.Vector3(p[0] + c * u - sn * w, H + 0.018, p[1] + sn * u + c * w)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.011, 5), paint(0xd98f8a));
    g.add(m);
  }

  // ---- the floor, the channel, its curbs ----
  flat(g, mottled(2 * X, ZN - ZS, 0, (ZN + ZS) / 2, FLOOR_MIX), 0xffffff, 0, 0, (ZN + ZS) / 2, 0, { vertexColors: true });
  flat(g, new THREE.PlaneGeometry(2 * L, 2 * CW), WATER, 0, 0.075, 0);
  flat(g, new THREE.PlaneGeometry(2 * L, CW * 0.9), DEEP, 0, 0.079, 0);
  for (const s of [-1, 1]) box(g, 2 * L, 0.06, 0.2, CURB, 0, 0.03, s * (CW + 0.1), { cast: false });
  // Flagstone joints: across the walkways, the tunnels and the hub (just lines, a shade darker).
  const joint = (x, z, w, d) => flat(g, new THREE.PlaneGeometry(w, d), 0x978f82, x, 0.003, z);
  for (let x = -L + 1.2; x < L; x += 1.4) for (const s of [-1, 1]) if (Math.abs(x) > HUB) joint(x, s * (CW + WALK) / 2 + s * 0.1, 0.04, WALK - CW - 0.2);
  for (let z = HUB + 0.8; z < NORTH; z += 1.1) joint(0, z, 2 * NA, 0.04);
  for (let z = -HUB - 0.8; z > SOUTH; z -= 1.1) joint(0, z, 2 * SA, 0.04);
  for (let k = -HUB + 1.4; k < HUB; k += 1.4) { for (const s of [-1, 1]) joint(k, s * (CW + HUB) / 2 + s * 0.1, 0.04, HUB - CW - 0.2); if (Math.abs(k) > CW + 0.1) joint(0, k, 2 * HUB, 0.04); }
  // Puddles and grates on the walkways.
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 2 * L - L, z = (rnd() < 0.5 ? 1 : -1) * (CW + 0.6 + rnd() * (WALK - CW - 1.1)), r = 0.3 + rnd() * 0.35;
    if (SHAFTS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 1.8)) continue; // (not in the daylight's patch)
    const m = flat(g, new THREE.CircleGeometry(r, 12), 0x8fa8a2, x, 0.006, z);
    m.scale.set(1.6, 1, 1);
  }
  for (const [x, z] of [[0, 12], [0, -10], [-11, 3], [12, -3]]) {
    flat(g, new THREE.PlaneGeometry(0.9, 0.6), 0x4c4a47, x, 0.008, z);
    for (let k = -3; k <= 3; k++) box(g, 0.035, 0.012, 0.56, 0x6b6964, x + k * 0.12, 0.015, z, { cast: false });
  }

  // ---- daylight down through the street's drains: a soft column of it, and the grille's stripes on the floor ----
  const beam = paint(0xe9e0c2, BEAM);
  for (const [x, z] of SHAFTS) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 4.6, 18, 1, true), beam);
    m.position.set(x, 2.3, z);
    g.add(m);
    flat(g, new THREE.CircleGeometry(0.75, 22), 0xfff0c0, x, 0.014, z, 0, GLOW);
    for (let k = -2; k <= 2; k++) flat(g, new THREE.PlaneGeometry(0.1, 0.95), 0xd8cfb6, x + k * 0.2, 0.012, z); // (sunlit stripes between the grille's bars)
  }

  // ---- drainpipes from the street above: down the wall, round an elbow, and a trickle into a little grate ----
  for (const [wx, wz, nx, nz] of [[-14, WALK, 0, -1], [22, WALK, 0, -1], [-18, -WALK, 0, 1], [10, -WALK, 0, 1], [NA, 14, -1, 0], [-SA, -12, 1, 0]]) {
    const px = wx + nx * 0.1, pz = wz + nz * 0.1, low = 0.42;
    cyl(g, 0.06, 0.06, H + 0.04 - low, 0x7f8a84, [px, (H + 0.04 + low) / 2, pz], [0, 0, 0], 10);
    for (const y of [0.75, H - SOIL - 0.02]) cyl(g, 0.075, 0.075, 0.05, 0x6b6964, [px, y, pz], [0, 0, 0], 10); // (brackets)
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 8), paint(0x7f8a84));
    elbow.position.set(px, low, pz);
    g.add(elbow);
    cyl(g, 0.06, 0.055, 0.2, 0x7f8a84, [px + nx * 0.1, low, pz + nz * 0.1], [nz ? Math.PI / 2 : 0, 0, nx ? Math.PI / 2 : 0], 10);
    const mouth = flat(g, new THREE.CircleGeometry(0.045, 12), 0x2b2a28, px + nx * 0.201, low, pz + nz * 0.201);
    mouth.rotation.set(0, Math.atan2(nx, nz), 0);
    const tx = px + nx * 0.17, tz = pz + nz * 0.17;
    const trickle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, low - 0.03, 8, 1, true), paint(0xcfe6e0, WET));
    trickle.position.set(tx, (low - 0.03) / 2 + 0.01, tz);
    g.add(trickle);
    flat(g, new THREE.CircleGeometry(0.32, 16), 0x8fb2aa, tx + nx * 0.1, 0.009, tz + nz * 0.1, 0, WET).scale.set(1.3, 1, 1);
  }

  // ---- bridges over the channel (and railings, so nobody falls in by accident… only on purpose) ----
  for (const bx of S.bridges) {
    box(g, 2.2, 0.12, 2 * CW + 0.6, 0x9a7a58, bx, 0.19, 0);
    for (let k = -4; k <= 4; k++) box(g, 2.2, 0.012, 0.03, 0x7f6347, bx, 0.252, k * 0.37, { cast: false });
    C.box(bx - 1.1, -CW - 0.3, bx + 1.1, CW + 0.3, 0.25);
    for (const s of [-1, 1]) {
      box(g, 0.07, 0.07, 2 * CW + 0.6, 0x7f6347, bx + s * 1.05, 0.72, 0);
      for (const z of [-CW, 0, CW]) box(g, 0.07, 0.5, 0.07, 0x7f6347, bx + s * 1.05, 0.47, z);
      C.box(bx + s * 1.05 - 0.06, -CW - 0.3, bx + s * 1.05 + 0.06, CW + 0.3, 0.75, false);
    }
  }

  // ---- pipes along the walls, slime, lanterns ----
  for (const s of [-1, 1]) {
    for (const [x0, x1] of [[-L, -HUB], [HUB, L]]) {
      cyl(g, 0.11, 0.11, x1 - x0, 0x7f8a84, [(x0 + x1) / 2, 1.02, s * (WALK - 0.13)], [0, 0, Math.PI / 2], 8);
      cyl(g, 0.06, 0.06, x1 - x0, 0x9b8a6a, [(x0 + x1) / 2, 0.72, s * (WALK - 0.08)], [0, 0, Math.PI / 2], 6);
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (HUB + 1 + rnd() * (L - HUB - 2)), s = rnd() < 0.5 ? 1 : -1;
    box(g, 0.25 + rnd() * 0.3, 0.6 + rnd() * 0.5, 0.02, 0x86a368, x, 0.5, s * (WALK - 0.005), { cast: false });
  }
  const glow = paint(0xffd98a, { emissive: 0x9a7020 });
  const lantern = (x, y, z, ry) => {
    const lg = new THREE.Group();
    lg.position.set(x, y, z);
    lg.rotation.y = ry;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), paint(0x4a4038));
    arm.position.set(0, 0.1, 0.15);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glow);
    lamp.position.set(0, 0, 0.3);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 8), paint(0x6b5a3a));
    cap.position.set(0, 0.15, 0.3);
    lg.add(arm, lamp, cap);
    g.add(lg);
    // Its warm light: a soft glow on the wall behind it, and a pool of it on the floor.
    const halo = new THREE.Mesh(HALO, warm);
    halo.position.set(x + Math.sin(ry) * 0.012, y - 0.33, z + Math.cos(ry) * 0.012); // (on the stones, under the earth)
    halo.rotation.y = ry;
    g.add(halo);
    for (const [k, c] of [[1, 0xe6d7ae], [0.6, 0xf0dca8]]) flat(g, POOL, c, x + Math.sin(ry) * 0.7, 0.012 + (1 - k) * 0.002, z + Math.cos(ry) * 0.7, ry, GLOW).scale.set(1.3 * k, k, 1);
  };
  const warm = paint(0xffe6a8, GLOW), HALO = new THREE.CircleGeometry(0.34, 24), POOL = new THREE.CircleGeometry(0.88, 24);
  for (const x of [-26, -18, -10, 10, 18, 26]) lantern(x, 1.15, WALK, Math.PI);
  for (const x of [-28.5, -22, -14, 14, 22, 28.5]) lantern(x, 1.15, -WALK, 0); // (in between the other side's)
  for (const z of [11, 17]) { lantern(-NA, 1.15, z, Math.PI / 2); lantern(NA, 1.15, z + 3, -Math.PI / 2); }
  for (const z of [-10, -14]) { lantern(-SA, 1.15, z, Math.PI / 2); lantern(SA, 1.15, z - 2, -Math.PI / 2); }
  for (const [x, z, ry] of [[-HUB, 5.5, Math.PI / 2], [HUB, -5.5, -Math.PI / 2], [4.5, HUB, Math.PI], [-4.5, -HUB, 0]]) lantern(x, 1.15, z, ry);
  // Round pillars in the hub's corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(g, 0.45, 0.5, H, BRICK, [sx * (HUB - 0.5), H / 2, sz * (HUB - 0.5)], [0, 0, 0], 12);
    C.circle(sx * (HUB - 0.5), sz * (HUB - 0.5), 0.5);
  }

  // ---- the ladder up to the alley, and the light coming down the drain ----
  for (const s of [-1, 1]) box(g, 0.07, H + 0.3, 0.07, 0x6b6964, s * 0.32, (H + 0.3) / 2, NORTH - 0.12);
  for (let k = 0; k < 5; k++) box(g, 0.64, 0.04, 0.05, 0x6b6964, 0, 0.25 + k * 0.28, NORTH - 0.12, { cast: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 5, 16, 1, true), paint(LIGHT, BEAM));
  shaft.position.set(0, 2.2, NORTH - 0.7);
  g.add(shaft);
  flat(g, new THREE.CircleGeometry(0.9, 18), 0xe8dcb0, 0, 0.01, NORTH - 0.9, 0, WET);

  // ---- the duck pipe at the west end (rubber ducks come bobbing out) ----
  cyl(g, 0.5, 0.5, 0.6, 0x8a908a, [-L + 0.2, 0.55, 0], [0, 0, Math.PI / 2], 16);
  flat(g, new THREE.CircleGeometry(0.4, 14), 0x2b2a28, -L + 0.52, 0.55, 0).rotation.set(0, Math.PI / 2, 0);

  // ---- the outfall at the east end: a big pipe mouth (daylight through it once the grille's up) ----
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.14, 8, 22), paint(0x8a908a));
  mouth.position.set(L - 0.05, 0.9, 0);
  mouth.rotation.y = Math.PI / 2;
  g.add(mouth);

  // ---- the sluice wheel's pipe, and the bucket for ducks ----
  cyl(g, 0.09, 0.09, 0.5, 0x7f8a84, [S.wheel.x, 0.85, WALK - 0.25], [Math.PI / 2, 0, 0], 8);
  cyl(g, 0.16, 0.16, 0.12, 0x6b6964, [S.wheel.x, 0.85, WALK - 0.02], [Math.PI / 2, 0, 0], 10);

  // ---- Nibbles' Lost Property: a counter of crates, a sign, and a pile of everything that ever fell down a drain ----
  const n = S.nibbles;
  box(g, 1.8, 0.55, 0.7, 0xa8784e, n.x, 0.275, n.z);
  box(g, 1.9, 0.05, 0.8, 0x8f6440, n.x, 0.575, n.z, { cast: false });
  C.box(n.x - 0.9, n.z - 0.35, n.x + 0.9, n.z + 0.35, 0.6);
  for (const s of [-1, 1]) box(g, 0.06, 1.1, 0.06, 0x6f5235, n.x + s * 0.85, 1.1, n.z - 0.3);
  box(g, 1.9, 0.38, 0.05, 0xe9dcc0, n.x, 1.6, n.z - 0.3); // the sign
  for (const [k, c] of [[0, 0xd9534f], [1, 0x5b86c4], [2, 0xf6d06a]]) box(g, 0.32, 0.08, 0.02, c, n.x - 0.5 + k * 0.5, 1.6, n.z - 0.27, { cast: false });
  // The pile: old bags and lumps, a crate or two, a boot, a hat box, and an umbrella.
  const junk = [[-1.6, -1.25, 0.26, 0xc46d4f], [1.55, -1.35, 0.22, 0x5d8c55], [-1.95, -0.3, 0.2, 0x9b7452], [1.95, -0.5, 0.24, 0x8d6fb5], [-1.15, -1.65, 0.17, 0xe0a24a], [0.85, -1.7, 0.17, 0x5b86c4]];
  for (const [dx, dz, s, c] of junk) {
    const m = new THREE.Mesh(blobGeometry(Math.round(dx * 10 + dz), 0.25, 1), paint(c));
    m.scale.set(s, s * 0.75, s);
    m.position.set(n.x + dx, s * 0.6, n.z + dz);
    m.castShadow = true;
    g.add(m);
    C.circle(n.x + dx, n.z + dz, s + 0.1, s * 1.2);
  }
  for (const [dx, dz, w, ry, c] of [[-1.55, -0.85, 0.5, 0.3, 0xa8784e], [1.3, -0.95, 0.42, -0.5, 0xb98a5e], [-0.4, -1.75, 0.34, 0.8, 0xd9c7a0]]) {
    box(g, w, w * 0.8, w, c, n.x + dx, w * 0.4, n.z + dz, { ry });
    C.circle(n.x + dx, n.z + dz, w * 0.6, w * 0.8);
  }
  box(g, 0.14, 0.26, 0.14, 0x4a3a2e, n.x + 0.25, 0.13, n.z - 1.35); // a boot
  box(g, 0.28, 0.08, 0.14, 0x4a3a2e, n.x + 0.32, 0.04, n.z - 1.35);
  cyl(g, 0.015, 0.015, 0.7, 0x4a4038, [n.x + 2.0, 0.35, n.z - 1.25], [0.3, 0, 0.2], 6); // the umbrella
  const brolly = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 8, 1, true), paint(0x7b5ea7, { side: THREE.DoubleSide }));
  brolly.position.set(n.x + 2.1, 0.72, n.z - 1.14);
  brolly.rotation.set(0.3, 0, 0.2);
  g.add(brolly);

  // ---- the camera's occluders (read before merging), then everything that doesn't move merged into a few shapes ----
  const occluders = collectOccluders(g);
  const scene = new THREE.Scene();
  scene.add(mergeStatic(g, { chunk: 128 })); // (the sewers sit at x 1600, a chunk edge for 50: this way it's split in two, north and south)
  const dyn = new THREE.Group();
  dyn.position.set(origin.x, 0, origin.z);
  scene.add(dyn);

  // ---- what moves: glints on the water, drifting east with the current, and dust in the daylight ----
  const glints = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), paint(0xe4f3ec, { transparent: true, opacity: 0.5 }), 46);
  const gl = Array.from({ length: glints.count }, () => ({ x: art() * 2 * L, z: (art() * 2 - 1) * (CW - 0.25), len: 0.22 + art() * 0.5, w: 0.025 + art() * 0.035, sp: FLOW * (0.85 + art() * 0.3), ph: art() * 6 }));
  const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), paint(0xfffbe8, { emissive: 0x8a7a50 }), 7 * (SHAFTS.length + 1));
  const ms = Array.from({ length: motes.count }, (_, i) => { const [x, z] = SHAFTS[Math.floor(i / 7)] ?? [0, NORTH - 0.7]; return { x, z, r: 0.1 + art() * 0.3, a: art() * 6.3, y: art() * 3.6, sp: 0.05 + art() * 0.08, s: 0.012 + art() * 0.012 }; });
  for (const m of [glints, motes]) { m.frustumCulled = false; dyn.add(m); } // (spread right along: never culled as one small shape)
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), K = new THREE.Vector3();
  const animate = (t) => {
    for (const [i, q] of gl.entries()) {
      const x = ((q.x + t * q.sp) % (2 * L)) - L, edge = Math.min(1, (L - Math.abs(x)) / 1.5); // (shrinking away at the ends)
      M.compose(P.set(x, 0.084, q.z + Math.sin(t * 0.8 + q.ph) * 0.05), Q.identity(), K.set(q.len * edge * (0.8 + 0.2 * Math.sin(t * 1.7 + q.ph)), 1, q.w * edge));
      glints.setMatrixAt(i, M);
    }
    glints.instanceMatrix.needsUpdate = true;
    for (const [i, q] of ms.entries()) {
      const y = 0.25 + ((q.y + t * q.sp) % 3.6), a = q.a + t * 0.25;
      M.compose(P.set(q.x + Math.cos(a) * q.r, y, q.z + Math.sin(a) * q.r), Q.identity(), K.setScalar(q.s * Math.min(1, y * 2, (3.85 - y) * 2)));
      motes.setMatrixAt(i, M);
    }
    motes.instanceMatrix.needsUpdate = true;
  };
  animate(0);

  // The water: one channel, flowing east (see the chapter's current). (Surface as the pond's and the woods' stream's.)
  const water = [{ kind: 'stream', pts: [[W(-L - 1, 0).x, W(0, 0).z], [W(L + 1, 0).x, W(0, 0).z]], w: CW, surface: 0.075, box: R(-L - 1, -CW, L + 1, CW) }];

  const world = {
    group: g, colliders: col, water, gardens: [], beds: [], bins: [],
    bounds: R(-L, SOUTH, L, NORTH),
    occluders,
    camera: { pitchMin: 0.78, distMax: 9, distMin: 3 }, // (looking down into the tunnels: no ceiling to see)
    W, R, animate,
  };
  return { scene, world, dyn };
}

/**
 * A flat w × d plane (centred on cx, cz in the trip's coordinates), its corners coloured in soft blotches between
 * `dark` and `light` with a `tint` here and there: watercolour mottling without any extra shapes (or outlines).
 */
function mottled(w, d, cx, cz, { dark, light, tint, scale, tintAt }) {
  const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / 1.3)), Math.max(1, Math.ceil(d / 1.3)));
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color(dark), b = new THREE.Color(light), t = new THREE.Color(tint), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = cx + p.getX(i), z = cz - p.getY(i); // (the plane's y is the world's −z once it's laid flat)
    c.copy(a).lerp(b, THREE.MathUtils.smoothstep(fbm3(x * scale, 0.5, z * scale, 3), 0.3, 0.7));
    c.lerp(t, THREE.MathUtils.smoothstep(fbm3(x * scale * 0.6 + 9, 2.5, z * scale * 0.6, 2), tintAt, tintAt + 0.15) * 0.7);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** A little seeded random (the sewers look the same every visit). */
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
