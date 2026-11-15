import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mesh, blobGeometry } from '../props.js';
import { paint } from '../../render/watercolorMaterial.js';
import { treatGeometry } from '../../entities/treats.js';

// The bakery street's heist props (static, so they're baked in with the rest of the town). Each piece
// is built at its own origin, front facing +Z. The moving parts (the baker, the treats on the trays)
// are added by the game: see src/game/town/heists.js.
const G = (x = 0, z = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; return g; };
const RB = (w, h, d, r = 0.03, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);
const WOOD = 0xc79b6d, DARK_WOOD = 0x8a6346;
export const SAUSAGE = 0xd98f84, SAUSAGE_TWIST = 0xc4786c; // raw pork bangers, pink

/** Where the treats sit on the stall's two trays (stall space): 6 croissants, then 6 iced buns. */
export const STALL_SLOTS = [];
for (const [tx] of [[-0.58], [0.58]]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) STALL_SLOTS.push([tx + (c - 1) * 0.3, 0.535, (r - 0.5) * 0.24]);

/** The baker's stall: a trestle table with a scalloped cloth, a wicker tray and a baking tray. */
export function bakeryStall(x, z, ry) {
  const g = G(x, z, ry);
  mesh(RB(2.3, 0.06, 0.62, 0.025), WOOD, g, [0, 0.47, 0]);
  for (const sx of [-1.05, 1.05]) for (const sz of [-0.24, 0.24]) mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.46, 8), DARK_WOOD, g, [sx, 0.23, sz]);
  mesh(RB(2.36, 0.022, 0.68, 0.01), 0xf6d9de, g, [0, 0.505, 0]);
  for (let i = 0; i < 10; i++) mesh(new THREE.SphereGeometry(0.075, 12, 8), i % 2 ? 0xfbf6ee : 0xf2a0b4, g, [-1.06 + i * 0.235, 0.46, 0.335], [0, 0, 0], [1.05, 0.62, 0.3]); // scallops
  // Croissants on a wicker tray (left), iced buns on a baking tray (right).
  mesh(RB(1.0, 0.03, 0.5, 0.012), 0xd8b07a, g, [-0.58, 0.525, 0]);
  for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.014, 0.96, 4, 8), 0xc4955e, g, [-0.58, 0.545, s * 0.25], [0, 0, Math.PI / 2]);
  mesh(RB(1.0, 0.03, 0.5, 0.012), 0xd8d4cc, g, [0.58, 0.525, 0]);
  for (const s of [-1, 1]) mesh(RB(1.0, 0.03, 0.02, 0.008), 0xbdb8ae, g, [0.58, 0.545, s * 0.25]);
  // A basket of baguettes at the end (just for show) and a chalkboard sign with a croissant drawn on.
  mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.32, 16, 1, true), 0xc4955e, g, [-1.42, 0.16, 0.05], [0, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16), 0xa87a48, g, [-1.42, 0.02, 0.05]);
  for (let i = 0; i < 4; i++) mesh(new THREE.CapsuleGeometry(0.035, 0.55, 4, 10), 0xdcae66, g, [-1.42 + (i - 1.5) * 0.07, 0.42, 0.05 + (i % 2) * 0.05 - 0.025], [(i % 2 ? 0.2 : -0.15), 0, (i - 1.5) * 0.12]);
  const board = G(1.48, 0.25, -0.35);
  for (const s of [-1, 1]) {
    const leaf = G(0, s * 0.12, 0);
    leaf.rotation.x = s * 0.22;
    mesh(RB(0.46, 0.62, 0.03, 0.012), DARK_WOOD, leaf, [0, 0.33, 0]);
    mesh(RB(0.38, 0.52, 0.01, 0.006), 0x3b3a3a, leaf, [0, 0.34, s * 0.017]);
    for (const [y, w] of [[0.5, 0.26], [0.44, 0.18]]) mesh(RB(w, 0.018, 0.004, 0.004), 0xf4efe6, leaf, [0, y, s * 0.023]); // chalk scribbles
    mesh(new THREE.TorusGeometry(0.07, 0.009, 6, 16, Math.PI * 1.2), 0xf4efe6, leaf, [0, 0.26, s * 0.023], [0, 0, Math.PI * 0.9]); // a croissant!
    board.add(leaf);
  }
  g.add(board);
  return g;
}

/** The baker's worktop under the shop window: dough, a rolling pin and a dusting of flour. */
export function bakersWorktop(x, z, ry) {
  const g = G(x, z, ry);
  mesh(RB(1.5, 0.06, 0.3, 0.02), WOOD, g, [0, 0.86, 0]);
  for (const sx of [-0.65, 0.65]) mesh(RB(0.05, 0.84, 0.05, 0.015), DARK_WOOD, g, [sx, 0.42, -0.05]);
  mesh(blobGeometry(3, 0.12, 2), 0xf1e3c8, g, [-0.2, 0.93, 0.02], [0, 0, 0], [0.13, 0.07, 0.11]);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 12), 0xd8b07a, g, [0.3, 0.92, 0.03], [0, 0.3, Math.PI / 2]);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), DARK_WOOD, g, [0.3 + Math.cos(0.3) * s * 0.21, 0.92, 0.03 - Math.sin(0.3) * s * 0.21], [0, 0.3, Math.PI / 2]);
  mesh(new THREE.CircleGeometry(0.16, 14), 0xfbf8f2, g, [0.05, 0.892, 0.0], [-Math.PI / 2, 0, 0], [1.3, 1, 1]).castShadow = false; // flour
  return g;
}

/** An iron bracket sticking out of a shop wall, for a hanging sign (two little chains at z 0.34 and 0.86). */
function bracket(g, y) {
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), 0x3f4a55, g, [0, y, 0.45], [Math.PI / 2, 0, 0]);
  mesh(new THREE.SphereGeometry(0.06, 10, 8), 0xe0b04a, g, [0, y, 0.92]);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), 0x3f4a55, g, [0, y - 0.13, 0.6 + s * 0.26]);
}

/** A big golden croissant hanging from a bracket over the bakery door: you can spot it from the end of the street. */
export function croissantSign(x, z, ry, y = 3.0) {
  const g = G(x, z, ry);
  bracket(g, y);
  // Hung side-on to the street (so people walking along see it), arched like a rainbow.
  const c = new THREE.Mesh(treatGeometry('croissant'), paint(0xffffff, { vertexColors: true }));
  c.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  c.position.set(0, y - 0.42, 0.6);
  c.scale.setScalar(4.2);
  c.castShadow = true;
  g.add(c);
  return g;
}

/** A string of three giant sausages hanging over the butcher's door. */
export function sausageSign(x, z, ry, y = 3.0) {
  const g = G(x, z, ry);
  bracket(g, y);
  const geo = new THREE.CapsuleGeometry(0.11, 0.3, 8, 16);
  [[0.25, -0.36, 0.5], [0.6, -0.5, 0], [0.95, -0.36, -0.5]].forEach(([z0, dy, a]) => mesh(geo, SAUSAGE, g, [0, y + dy, z0], [a + Math.PI / 2, 0, 0]));
  for (const [z0, dy] of [[0.42, -0.45], [0.78, -0.45]]) mesh(new THREE.SphereGeometry(0.06, 10, 8), SAUSAGE_TWIST, g, [0, y + dy, z0]);
  return g;
}

/** Where the sausages hang on the butcher's rail (rail space, right to left), and how high. */
export const RAIL_HOOKS = [0.7, 0.3, -0.1, -0.5];
export const RAIL_Y = 1.74;

/** The butcher's rail: two posts and a steel bar with hooks, for a long string of sausages. */
export function sausageRail(x, z, ry) {
  const g = G(x, z, ry);
  for (const sx of [-0.95, 0.95]) {
    mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.85, 10), DARK_WOOD, g, [sx, 0.925, 0]);
    mesh(new THREE.SphereGeometry(0.07, 12, 8), DARK_WOOD, g, [sx, 1.86, 0]);
    mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.06, 14), DARK_WOOD, g, [sx, 0.03, 0]);
  }
  mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.9, 10), 0xb8b2a8, g, [0, 1.8, 0], [0, 0, Math.PI / 2]);
  for (const hx of RAIL_HOOKS) mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI * 1.4), 0x8a8f96, g, [hx, RAIL_Y + 0.03, 0], [0, Math.PI / 2, Math.PI * 0.8]);
  return g;
}

/** A big log chopping block with a red sausage machine on top (its handle is added by the game, so it can turn). */
export function choppingBlock(x, z, ry) {
  const g = G(x, z, ry);
  mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.72, 20), 0xa87a52, g, [0, 0.36, 0]);
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.012, 20), 0xd8b48a, g, [0, 0.726, 0]);
  for (const r of [0.18, 0.09]) mesh(new THREE.TorusGeometry(r, 0.005, 4, 20), 0xc49a6c, g, [0, 0.733, 0], [Math.PI / 2, 0, 0]); // tree rings
  mesh(RB(0.16, 0.18, 0.22, 0.05), 0xd9534f, g, [0, 0.82, 0]);
  mesh(new THREE.CylinderGeometry(0.1, 0.045, 0.12, 14, 1, true), 0xd9534f, g, [0, 0.97, 0], [0, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 12), 0xb8b2a8, g, [0, 0.8, -0.14], [Math.PI / 2, 0, 0]); // the nozzle: sausages come out here
  [[-0.06, -0.2, 0.3], [0.05, -0.17, -0.5], [0.14, -0.08, 1.2]].forEach(([sx, sz, a]) => mesh(new THREE.CapsuleGeometry(0.03, 0.09, 4, 10), SAUSAGE, g, [sx, 0.76, sz], [Math.PI / 2, 0, a]));
  return g;
}

/** An axis-aligned collider box given in shop-street space (T: the block's quarter turn). */
function boxT(lc, T, x0, z0, x1, z1, top) {
  const [a, b] = T.p(x0, z0), [c, d] = T.p(x1, z1);
  lc.box(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d), top);
}

/**
 * The bakery (the first shop on the street, centred on x0, its front wall at z = 10): the baker's
 * stall and worktop, the croissant sign, and where everything is for the heist (world coordinates).
 */
export function bakeryHeist(g, lc, T, x0) {
  const ry = T.ry(0); // the shop faces the street
  const stall = [x0 - 1.26, 11.5], work = [x0 - 1.26, 10.26], baker = [x0 - 1.26, 10.78], door = [x0 + 2.52, 11.25];
  g.add(bakeryStall(...T.p(...stall), ry));
  boxT(lc, T, stall[0] - 1.18, stall[1] - 0.34, stall[0] + 1.18, stall[1] + 0.34, 0.52);
  g.add(bakersWorktop(...T.p(...work), ry));
  boxT(lc, T, work[0] - 0.75, 10.06, work[0] + 0.75, 10.42, 0.9);
  g.add(croissantSign(...T.p(x0 + 3.6, 10.0), ry, 3.6));
  lc.circle(...T.p(...baker), 0.3); // she stands just here
  const W = (x, z) => lc.at(...T.p(x, z));
  lc.heist('bakery', {
    slots: STALL_SLOTS.map(([sx, sy, sz]) => { const w = W(stall[0] + sx, stall[1] + sz); return { x: w.x, y: sy, z: w.z, ry }; }),
    baker: W(...baker), busy: T.ry(Math.PI), look: ry, door: W(...door), zone: { ...W(...stall), r: 6 },
  });
}

/**
 * The butcher's (the last shop on the street, centred on x0, its front wall at z = 10): the rail of
 * sausages, the chopping block and sausage machine, the sausage sign, and where it all is for the heist.
 */
export function butcherHeist(g, lc, T, x0) {
  const ry = T.ry(0);
  const rail = [x0 - 0.6, 10.95], block = [x0 + 1.3, 10.32], butcher = [x0 + 1.3, 10.86], door = [x0 + 2.52, 11.3];
  g.add(sausageRail(...T.p(...rail), ry));
  for (const sx of [-0.95, 0.95]) lc.circle(...T.p(rail[0] + sx, rail[1]), 0.08);
  g.add(choppingBlock(...T.p(...block), ry));
  lc.circle(...T.p(...block), 0.33, 0.75);
  g.add(sausageSign(...T.p(x0 + 3.6, 10.0), ry, 3.6));
  lc.circle(...T.p(...butcher), 0.3); // he stands just here
  const W = (x, z) => lc.at(...T.p(x, z));
  lc.heist('butcher', {
    butcher: W(...butcher), busy: T.ry(Math.PI), look: ry, door: W(...door), zone: { ...W(rail[0], rail[1] + 0.3), r: 6 },
    hooks: RAIL_HOOKS.map((hx) => W(rail[0] + hx, rail[1]).setY(RAIL_Y)),
    crank: { ...W(block[0] + 0.09, block[1]), y: 0.84, ry },
  });
}
