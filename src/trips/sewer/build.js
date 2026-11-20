import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry } from '../../world/props.js';
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

const BRICK = 0x9c8f80, BRICK_DARK = 0x857a6d, EARTH = 0x62574a, MOSS = 0x7f9a5c, STONE = 0xaaa293, CURB = 0xc3bbac, WATER = 0x6f9d8f, DEEP = 0x5e8c80;

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
    const w = x1 - x0, d = z1 - z0;
    box(g, w, H, d, BRICK, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, { occluder: true });
    flat(g, new THREE.PlaneGeometry(w, d), EARTH, (x0 + x1) / 2, H + 0.005, (z0 + z1) / 2);
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

  // ---- the floor, the channel, its curbs ----
  flat(g, new THREE.PlaneGeometry(2 * X, ZN - ZS), STONE, 0, 0, (ZN + ZS) / 2);
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
    const x = rnd() * 2 * L - L, z = (rnd() < 0.5 ? 1 : -1) * (CW + 0.6 + rnd() * (WALK - CW - 1.1));
    const m = flat(g, new THREE.CircleGeometry(0.3 + rnd() * 0.35, 12), 0x8fa8a2, x, 0.006, z);
    m.scale.set(1.6, 1, 1);
  }
  for (const [x, z] of [[0, 12], [0, -10], [-11, 3], [12, -3]]) {
    flat(g, new THREE.PlaneGeometry(0.9, 0.6), 0x4c4a47, x, 0.008, z);
    for (let k = -3; k <= 3; k++) box(g, 0.035, 0.012, 0.56, 0x6b6964, x + k * 0.12, 0.015, z, { cast: false });
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
  };
  for (const x of [-26, -18, -10, 10, 18, 26]) { lantern(x, 1.15, WALK, Math.PI); lantern(x + 4, 1.15, -WALK, 0); }
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
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 5, 16, 1, true), paint(0xfff3c8, { transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  shaft.position.set(0, 2.2, NORTH - 0.7);
  g.add(shaft);
  flat(g, new THREE.CircleGeometry(0.9, 18), 0xe8dcb0, 0, 0.01, NORTH - 0.9, 0, { transparent: true, opacity: 0.55 });

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
  scene.add(mergeStatic(g));
  const dyn = new THREE.Group();
  dyn.position.set(origin.x, 0, origin.z);
  scene.add(dyn);

  // The water: one channel, flowing east (see the chapter's current). (Surface as the pond's and the woods' stream's.)
  const water = [{ kind: 'stream', pts: [[W(-L - 1, 0).x, W(0, 0).z], [W(L + 1, 0).x, W(0, 0).z]], w: CW, surface: 0.075, box: R(-L - 1, -CW, L + 1, CW) }];

  const world = {
    group: g, colliders: col, water, gardens: [], beds: [], bins: [],
    bounds: R(-L, SOUTH, L, NORTH),
    occluders,
    camera: { pitchMin: 0.78, distMax: 9, distMin: 3 }, // (looking down into the tunnels: no ceiling to see)
    W, R,
  };
  return { scene, world, dyn };
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
