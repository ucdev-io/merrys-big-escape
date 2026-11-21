import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { PALETTE } from '../../render/palette.js';
import { RNG, fbm3 } from '../../core/rng.js';
import { mesh, blobGeometry } from '../props.js';
import { bench } from '../town/townProps.js';
import { inRect, toLocal } from './areas.js';
import { ribbon, fingerpost } from './areaProps.js';
import { SWASH } from './beachLayout.js';
import { seaUniforms, seaMaterial, swashMaterial, seaGeometry, swashGeometry } from './sea.js';

/*
 * 🏖️ Building a town's beach from its layout (./beachLayout.js): the dunes and their marram grass, the
 * boardwalk, the sand shelving into the sea, beach huts, the ice-cream kiosk, the lifeguard's tower, rock
 * pools, groynes, an old boat, picnic blankets, buoys round the swimming area and a lighthouse out on the
 * headland — plus the sea itself and the sheet of water the waves push up the sand (./sea.js). Scenery is
 * built in the area's (u, v) frame inside one turned group and baked into the town's merged meshes by
 * mergeStatic; the sea and the wave sheet have shaders of their own, so they're kept as they are.
 * Seasons: sand, huts and rocks get snow ('world'); the marram grass follows the season; the sea, the wet
 * sand and the rock pools never change ('none').
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SEA_LEVEL = 0.02;
export const HUT_PAINT = [0xf2a7b8, 0x9cc8e8, 0xf5dc7a, 0xa8dcbf, 0xc4b0e0, 0xf2a07c, 0x7fc4b8, 0xf7c99a];
const SAND = 0xead6aa, SAND_DUNE = 0xe4d0a0, SAND_WET = 0xcbb285, SAND_DEEP = 0xb39e70;
const WOOD = 0x9b8468, WOOD_DARK = 0x6f5d4b, WHITE = 0xf6f1e6, ROCKS = [0x9e958a, 0xa89f92, 0x8f877d, 0xb1a899];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tag = (o, kind) => { o.userData.season = kind; return o; };

// ---------------------------------------------------------------------------------------------
// Shapes used more than once (made once).

const G = {};
const geo = (key, make) => (G[key] ??= make());

/** A clump of marram grass: tall thin blades, arching out a little. */
function marramClump() {
  return geo('marram', () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.ConeGeometry(0.009, 0.7, 3, 2, true);
      b.translate(0, 0.35, 0);
      const p = b.attributes.position, lean = 0.25 + (i % 3) * 0.15;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k), t = y / 0.7; p.setXYZ(k, p.getX(k), y * (1 - t * lean * 0.3), p.getZ(k) + t * t * lean * 0.4); }
      b.scale(1, 0.7 + (i % 4) * 0.12, 1);
      b.rotateY((i / 7) * Math.PI * 2 + (i % 2) * 0.4);
      b.deleteAttribute('uv');
      parts.push(b.toNonIndexed());
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    return g;
  });
}

/** A heightfield over columns us × rows vs (the area's frame), coloured by colAt(u, v, y). */
function heightfield(us, vs, yAt, colAt) {
  const pos = [], col = [], idx = [], c = new THREE.Color(), n = us.length;
  for (const v of vs) for (const u of us) { const y = yAt(u, v); pos.push(u, y, v); c.set(colAt(u, v, y)); col.push(c.r, c.g, c.b); }
  for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, e = a + n, f = e + 1;
    idx.push(a, e, b, b, e, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, paint(0xffffff, { vertexColors: true }));
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

const steps = (a, b, step) => { const out = []; const n = Math.max(1, Math.ceil((b - a) / step)); for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n); return out; };

/** Mix two hex colours (t: 0 → a, 1 → b), as a hex. */
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHex();

// ---------------------------------------------------------------------------------------------
// Things on the beach (each in its own little group, at (u, v), facing +v: the sea).

/** A beach hut: pastel walls, a pitched roof with white trim, a planked door (or an open one, with a deckchair). */
function beachHut(h) {
  const g = new THREE.Group();
  g.position.set(h.u, 0, h.v);
  const paintCol = HUT_PAINT[h.color % HUT_PAINT.length], W = 2.2, D = 2.0, H = 2.0;
  mesh(geo('hutBody', () => new RoundedBoxGeometry(W, H, D, 2, 0.05)), paintCol, g, [0, H / 2 + 0.06, 0]);
  mesh(geo('hutBase', () => new THREE.BoxGeometry(W + 0.3, 0.12, D + 0.5)), WOOD, g, [0, 0.06, 0.18]); // a little deck
  // The roof: a gable over the front, white bargeboards along its edges.
  const roof = geo('hutRoof', () => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2 - 0.18, 0); s.lineTo(W / 2 + 0.18, 0); s.lineTo(0, 0.82); s.lineTo(-W / 2 - 0.18, 0);
    const e = new THREE.ExtrudeGeometry(s, { depth: D + 0.3, bevelEnabled: false });
    e.translate(0, 0, -(D + 0.3) / 2);
    return e;
  });
  mesh(roof, mixHex(paintCol, 0x5a4a52, 0.35), g, [0, H + 0.06, -0.05]);
  const board = geo('hutBoard', () => new THREE.BoxGeometry(1.5, 0.09, 0.05));
  for (const s of [-1, 1]) mesh(board, WHITE, g, [s * 0.66, H + 0.06 + 0.42, D / 2 + 0.12], [0, 0, s * -0.64]);
  // The door: white planks (one hut's door stands open, with a deckchair outside).
  const plank = geo('hutPlank', () => new THREE.BoxGeometry(0.98, 0.17, 0.04));
  if (!h.open) {
    for (let i = 0; i < 9; i++) mesh(plank, i % 2 ? WHITE : mixHex(WHITE, paintCol, 0.35), g, [0, 0.22 + i * 0.185, D / 2 + 0.02]);
    mesh(geo('knob', () => new THREE.SphereGeometry(0.035, 8, 6)), 0x8a7356, g, [0.36, 0.95, D / 2 + 0.06]);
  } else {
    mesh(geo('hutDark', () => new THREE.BoxGeometry(1.0, 1.66, 0.02)), 0x4a3f44, g, [0, 0.98, D / 2 + 0.005]);
    const door = new THREE.Group();
    door.position.set(-0.5, 0, D / 2 + 0.02);
    door.rotation.y = -1.9;
    for (let i = 0; i < 9; i++) mesh(plank, i % 2 ? WHITE : mixHex(WHITE, paintCol, 0.35), door, [0.49, 0.22 + i * 0.185, 0]);
    g.add(door);
    g.add(deckchair(0.8, D / 2 + 1.0, 0.3, [0xd9534f, WHITE]));
  }
  // Trim: white corner posts.
  const post = geo('hutPost', () => new THREE.BoxGeometry(0.08, H, 0.08));
  for (const sx of [-1, 1]) mesh(post, WHITE, g, [sx * (W / 2 + 0.01), H / 2 + 0.06, D / 2 + 0.01]);
  return g;
}

/** A stripy deckchair (also used by the beach's seasonal crowd: game/town/beach/crowd.js). */
export function deckchair(u, v, ry, [a, b]) {
  const g = new THREE.Group();
  g.position.set(u, 0, v);
  g.rotation.y = ry;
  const leg = geo('chairLeg', () => new THREE.BoxGeometry(0.04, 0.9, 0.04));
  for (const s of [-1, 1]) {
    mesh(leg, WOOD, g, [s * 0.27, 0.42, -0.12], [-0.55, 0, 0]);
    mesh(leg, WOOD, g, [s * 0.27, 0.28, 0.18], [0.75, 0, 0]);
  }
  const strip = geo('chairStrip', () => new THREE.BoxGeometry(0.1, 0.02, 0.85));
  for (let i = 0; i < 5; i++) mesh(strip, i % 2 ? b : a, g, [-0.2 + i * 0.1, 0.42, -0.02], [-0.85, 0, 0]);
  return g;
}

/** The ice-cream kiosk: pink and white, a stripy awning over the hatch, a huge cone on the roof. */
function kiosk(k) {
  const g = new THREE.Group();
  g.position.set(k.u, 0, k.v);
  const W = 3.2, D = 2.4, H = 2.4, T = 0.08, HW = 1.9, H0 = 0.98, H1 = 1.93, WALL = 0xf8e8ec;
  // Walls round a little room, with a hatch in the front (the keeper stands inside, behind the counter).
  const wall = (w, h, d, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 1, 0.025), WALL, g, [x, y, z]);
  wall(W, H, T, 0, H / 2, -D / 2 + T / 2);
  for (const s of [-1, 1]) wall(T, H, D, s * (W / 2 - T / 2), H / 2, 0);
  wall(W, H0, T, 0, H0 / 2, D / 2 - T / 2);
  wall(W, H - H1, T, 0, (H1 + H) / 2, D / 2 - T / 2);
  for (const s of [-1, 1]) wall((W - HW) / 2, H1 - H0, T, s * (HW / 2 + (W - HW) / 4), (H0 + H1) / 2, D / 2 - T / 2);
  mesh(new THREE.PlaneGeometry(W - 2 * T, H), 0x5a4448, g, [0, H / 2, -D / 2 + T + 0.01]).castShadow = false; // (dim inside)
  mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), 0xdfe8ee, g, [0.9, 0.95, -0.6]); // the freezer
  const stripe = geo('kioskStripe', () => new THREE.BoxGeometry(0.22, H - 0.1, 0.02));
  for (let i = 0; i < 6; i++) mesh(stripe, 0xf2a7b8, g, [-W / 2 + 0.35 + i * 0.5, H / 2, -D / 2 - 0.01]); // (stripes on the back)
  mesh(geo('kioskCounter', () => new RoundedBoxGeometry(2.2, 0.08, 0.5, 1, 0.02)), WHITE, g, [0, H0, D / 2 + 0.12]);
  mesh(geo('kioskRoof', () => new RoundedBoxGeometry(W + 0.4, 0.16, D + 0.4, 2, 0.05)), 0xd9708a, g, [0, H + 0.06, 0]);
  // The awning: stripes sloping out over the hatch (high enough to see the keeper under it).
  const awn = new THREE.Group();
  awn.position.set(0, 2.3, D / 2 + 0.02);
  awn.rotation.x = 0.32;
  const slat = geo('awnSlat', () => new THREE.BoxGeometry(0.25, 0.02, 0.8));
  for (let i = 0; i < 9; i++) mesh(slat, i % 2 ? WHITE : 0xe0607e, awn, [-1.0 + i * 0.25, 0, 0.38]);
  g.add(awn);
  // A giant ice cream on the roof (you can see it from the dunes).
  const cone = new THREE.Group();
  cone.position.set(0, H + 0.14, 0);
  mesh(new THREE.ConeGeometry(0.32, 0.9, 16), 0xd9a45a, cone, [0, 0.45, 0], [Math.PI, 0, 0]);
  mesh(new THREE.SphereGeometry(0.36, 18, 12), 0xf6efe0, cone, [0, 1.0, 0]);
  mesh(new THREE.SphereGeometry(0.28, 16, 10), 0xf2a7b8, cone, [0.04, 1.36, 0.02]);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), 0x7a4a2e, cone, [0.15, 1.5, 0.05], [0, 0, -0.5]); // a chocolate flake
  g.add(cone);
  // A little bin beside it (seagulls love a bin).
  mesh(geo('litter', () => new THREE.CylinderGeometry(0.26, 0.22, 0.8, 14)), 0x4f8a76, g, [W / 2 + 0.55, 0.4, D / 2 - 0.2]);
  mesh(geo('litterLid', () => new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14)), 0x3f7262, g, [W / 2 + 0.55, 0.83, D / 2 - 0.2]);
  return g;
}

/** The lifeguard's tower: legs, a platform with a tall chair, a ladder up the back, a flag and a life ring. */
function lifeguardTower(t) {
  const g = new THREE.Group();
  g.position.set(t.u, 0, t.v);
  const leg = geo('towerLeg', () => new THREE.CylinderGeometry(0.07, 0.08, 1.62, 8));
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) mesh(leg, WHITE, g, [x, 0.81, z]);
  mesh(geo('towerDeck', () => new RoundedBoxGeometry(1.6, 0.1, 1.6, 1, 0.03)), WOOD, g, [0, 1.62, 0]);
  for (const s of [-1, 1]) mesh(geo('towerBrace', () => new THREE.BoxGeometry(0.05, 0.05, 1.5)), WHITE, g, [s * 0.62, 0.8, 0], [0.8, 0, 0]);
  // The chair, painted red.
  mesh(geo('towerSeat', () => new RoundedBoxGeometry(0.7, 0.08, 0.6, 1, 0.02)), 0xd9534f, g, [0, 2.1, -0.2]);
  mesh(geo('towerBack', () => new RoundedBoxGeometry(0.7, 0.75, 0.08, 1, 0.02)), 0xd9534f, g, [0, 2.48, -0.5], [-0.15, 0, 0]);
  for (const s of [-1, 1]) mesh(geo('chairPost', () => new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6)), WHITE, g, [s * 0.3, 1.88, -0.2]);
  // A ladder up the back (the steps a dog can hop up are colliders: see buildBeach).
  for (const s of [-1, 1]) mesh(geo('ladderRail', () => new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6)), WOOD, g, [s * 0.32, 0.8, -1.25], [-0.45, 0, 0]);
  const rung = geo('ladderRung', () => new THREE.BoxGeometry(0.62, 0.06, 0.32));
  for (let i = 0; i < 3; i++) mesh(rung, WOOD, g, [0, 0.42 * (i + 1) - 0.03, -1.65 + i * 0.36]);
  // The flag (red over yellow: lifeguards on duty) and a red-and-white life ring.
  mesh(geo('flagPole', () => new THREE.CylinderGeometry(0.025, 0.03, 2.2, 6)), WHITE, g, [0.7, 2.75, 0.7]);
  mesh(geo('flagRed', () => new THREE.BoxGeometry(0.02, 0.24, 0.6)), 0xd9534f, g, [0.7, 3.62, 1.0]);
  mesh(geo('flagYellow', () => new THREE.BoxGeometry(0.02, 0.24, 0.6)), 0xf2c94e, g, [0.7, 3.38, 1.0]);
  for (let i = 0; i < 8; i++) mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 6, Math.PI / 4), i % 2 ? WHITE : 0xd9534f, g, [0, 1.2, 0.71], [0, 0, (i * Math.PI) / 4]);
  return g;
}

/** An old wooden groyne running down the beach into the sea: posts stepping down, boards between. */
function groyne(gr, sandY) {
  const g = new THREE.Group();
  const post = geo('groynePost', () => new THREE.CylinderGeometry(0.085, 0.1, 1, 8));
  const boardG = geo('groyneBoard', () => new THREE.BoxGeometry(0.06, 0.24, 1));
  const top = (v) => 0.78 - 0.32 * smooth(gr.v0, gr.v1, v);
  const vs = steps(gr.v0, gr.v1, 1.3);
  vs.forEach((v, i) => {
    const base = sandY(gr.u, v) - 0.25, h = top(v) - base + Math.sin(i * 1.9) * 0.04;
    mesh(post, i % 3 ? WOOD : WOOD_DARK, g, [gr.u, base + h / 2, v], [Math.sin(i * 2.3) * 0.03, 0, Math.sin(i * 1.3) * 0.04], [1, h, 1]);
    if (i < vs.length - 1) {
      const len = vs[i + 1] - v, mid = v + len / 2;
      for (const [y, s] of [[top(mid) - 0.17, 1], [top(mid) - 0.43, -1]]) mesh(boardG, WOOD, g, [gr.u + s * 0.02, y, mid], [0, 0, 0], [1, 1, len + 0.05]);
      if (v > gr.v1 - 9 && i % 2) mesh(blobGeometry(i, 0.35, 1), 0x5f6b3e, g, [gr.u, sandY(gr.u, v) + 0.06, mid], [0, i, 0], [0.22, 0.09, 0.5]).castShadow = false; // (seaweed at its foot)
    }
  });
  return g;
}

/** A rowing boat, upturned on the sand, propped up a little on one side (just room underneath to hide something). */
function rowingBoat(b) {
  const g = new THREE.Group();
  g.position.set(b.u, 0, b.v);
  g.rotation.y = b.rot;
  const hull = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); // (a dome: the hull, upside down)
  mesh(hull, 0x4f7fa8, g, [0, 0.04, 0], [0, 0, 0.12], [0.7, 0.42, 1.75]);
  mesh(new THREE.TorusGeometry(1, 0.035, 6, 32), WHITE, g, [0, 0.05, 0], [Math.PI / 2, 0, 0.12], [0.7, 1.75, 1]); // the gunwale
  mesh(new THREE.BoxGeometry(0.08, 0.08, 3.1), WOOD_DARK, g, [-0.05, 0.47, 0], [0, 0, 0.12]); // the keel
  mesh(blobGeometry(3, 0.3, 1), WOOD, g, [0.55, 0.12, 0.6], [0, 0, 0], [0.28, 0.14, 0.3]); // the old crate propping it up
  return g;
}

/** A checked picnic blanket with a wicker basket on it. */
function picnicBlanket(p, colA) {
  const g = new THREE.Group();
  g.position.set(p.u, 0.012, p.v);
  g.rotation.y = p.rot;
  const parts = [], nx = 6, nz = 5, w = 1.7, d = 1.4;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const q = new THREE.PlaneGeometry(w / nx, d / nz);
    q.rotateX(-Math.PI / 2);
    q.translate(-w / 2 + (i + 0.5) * (w / nx), 0, -d / 2 + (j + 0.5) * (d / nz));
    const c = new THREE.Color((i + j) % 2 ? WHITE : colA), n = q.attributes.position.count, col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
    q.setAttribute('color', new THREE.BufferAttribute(col, 3));
    q.deleteAttribute('uv');
    parts.push(q);
  }
  const blanket = new THREE.Mesh(mergeGeometries(parts), paint(0xffffff, { vertexColors: true }));
  blanket.receiveShadow = true;
  blanket.castShadow = false;
  g.add(blanket);
  mesh(geo('basket', () => new RoundedBoxGeometry(0.42, 0.26, 0.3, 2, 0.04)), 0xc49a5c, g, [0.62, 0.13, -0.45]);
  mesh(geo('basketLid', () => new THREE.TorusGeometry(0.13, 0.016, 6, 14, Math.PI)), 0x9c7440, g, [0.62, 0.26, -0.45]);
  return g;
}

/** A rock pool: still water in a rocky dip, with seaweed and a starfish. */
function rockPool(p, rng) {
  const g = new THREE.Group();
  g.position.set(p.u, 0, p.v);
  const rim = mesh(new THREE.CircleGeometry(p.r + 0.35, 24), 0xa49a86, g, [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
  rim.castShadow = false;
  const water = mesh(new THREE.CircleGeometry(p.r, 24), 0x8cc6c8, g, [0, 0.045, 0], [-Math.PI / 2, 0, 0]);
  water.castShadow = false;
  tag(water, 'none');
  const deep = mesh(new THREE.CircleGeometry(p.r * 0.55, 18), 0x6eb0bb, g, [rng.float(-0.2, 0.2), 0.053, rng.float(-0.2, 0.2)], [-Math.PI / 2, 0, 0]);
  deep.castShadow = false;
  tag(deep, 'none');
  for (let i = 0; i < 3; i++) { const a = rng.float(0, 6.28), r = p.r * rng.float(0.3, 0.75); tag(mesh(blobGeometry(rng.int(0, 20), 0.35, 1), 0x4f7a45, g, [Math.cos(a) * r, 0.046, Math.sin(a) * r], [0, a, 0], [0.22, 0.02, 0.12]), 'none').castShadow = false; }
  // A starfish on the bottom.
  const star = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.05 : 0.13; if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  const sm = mesh(new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false }), 0xe8875a, g, [p.r * 0.3, 0.05, -p.r * 0.2], [-Math.PI / 2, 0, rng.float(0, 6)]);
  sm.castShadow = false;
  tag(sm, 'none');
  return g;
}

/** The lighthouse on its rocky island, out on the headland. */
function lighthouse(L, groundY, rng) {
  const g = new THREE.Group();
  g.position.set(L.u, 0, L.v);
  const base = groundY;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.float(0, 0.5), r = i ? rng.float(1.6, 3.2) : 0, s = i ? rng.float(1.3, 2.2) : 2.8;
    mesh(blobGeometry(rng.int(0, 30), 0.28, 3), rng.pick(ROCKS), g, [Math.cos(a) * r, base + s * 0.35, Math.sin(a) * r], [rng.float(0, 3), rng.float(0, 3), 0], [s, s * 0.8, s]);
  }
  const y0 = base + 2.0, H = 9;
  mesh(new THREE.CylinderGeometry(0.85, 1.15, H, 22), WHITE, g, [0, y0 + H / 2, 0]);
  const rad = (t) => 1.15 - 0.3 * t + 0.015; // (the tower's radius, t of the way up, and a hair more)
  for (const t of [0.18, 0.48, 0.78]) mesh(new THREE.CylinderGeometry(rad(t + 0.11), rad(t), H * 0.11, 22, 1, true), 0xd65a50, g, [0, y0 + H * t + H * 0.055, 0]);
  mesh(new THREE.BoxGeometry(0.5, 0.9, 0.12), 0x4a3f44, g, [0, y0 + 0.45, 1.13]); // the door
  mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 22), 0x3f4a52, g, [0, y0 + H + 0.06, 0]); // the gallery
  mesh(new THREE.TorusGeometry(1.2, 0.03, 4, 28), 0x3f4a52, g, [0, y0 + H + 0.45, 0], [Math.PI / 2, 0, 0]);
  tag(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 16), 0xfff1b0, g, [0, y0 + H + 0.6, 0], [0, 0, 0], [1, 1, 1], { emissive: 0x8a7a30 }), 'none'); // the lamp room
  mesh(new THREE.SphereGeometry(0.72, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xd65a50, g, [0, y0 + H + 1.07, 0]);
  mesh(new THREE.SphereGeometry(0.1, 8, 6), 0x3f4a52, g, [0, y0 + H + 1.85, 0]);
  return g;
}

// ---------------------------------------------------------------------------------------------

/**
 * Build the beach into `g` (a group turned into the area's frame). C: area-frame colliders. extra: the
 * town's bits and pieces (water zones). flats: where the ground is flat (and the sea's sinking).
 * Returns what the game needs to know (world coordinates).
 */
export function buildBeach(g, d, { C, extra, flats }) {
  const { a, uL, uR, vF, vB, vS, gateU } = d;
  const rng = new RNG(`beach-build:${d.seed}`);
  g.userData.season = 'world'; // (sand, huts, rocks: snow and rain; things that differ say so)
  const W = d.W;

  // ---- the meadow: sea pinks by the lane, the lane, signposts, a bench looking out over the dunes ----
  {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.013, 1, 3), paint(PALETTE.leafDark, { kind: 'inst' }), d.thrift.length);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), paint(0xffffff, { kind: 'inst' }), d.thrift.length);
    const m = new THREE.Matrix4(), c = new THREE.Color(), pinks = [0xf2a0c4, 0xf5b8d0, 0xe98ab6, 0xfbe6ee];
    d.thrift.forEach((f, i) => {
      const h = 0.18 * f.s + 0.08;
      m.makeScale(1, h, 1).setPosition(f.u, h / 2, f.v); stems.setMatrixAt(i, m);
      m.makeScale(0.06, 0.05, 0.06).setPosition(f.u, h, f.v); heads.setMatrixAt(i, m);
      heads.setColorAt(i, c.set(rng.pick(pinks)));
    });
    stems.castShadow = heads.castShadow = false;
    tag(stems, 'plant'); tag(heads, 'plant');
    g.add(stems, heads);
  }
  g.add(tag(ribbon(d.lane, 3.0, 0xd9c79c, 0.058, { seed: 21 }), 'road'));
  const ln = d.lane, l0 = ln[0], l1 = ln[Math.min(ln.length - 1, 6)];
  g.add(fingerpost(l0[0] + 2.4, l0[1] + 3.4, Math.atan2(l1[0] - l0[0], l1[1] - l0[1]), C, 'sea'));
  g.add(fingerpost(gateU - 2.2, vF - 4.6, 0, C, 'sea'));
  g.add(bench(gateU + 3.2, vF - 5.2, 0));
  C.circle(gateU + 3.2, vF - 5.2, 0.75, 0.5);

  // ---- the sand: dunes, the beach, and on down under the sea ----
  const us = steps(uL - 2.5, uR + 2.5, 2);
  const lip = (u, v) => d.sandY(u, v) - 0.075 * (1 - smooth(vF - 3.6, vF - 2.2, v)); // (tucks under the meadow's edge)
  const dryRows = [...steps(vF - 3.6, vF + 9, 0.6), ...steps(vF + 9, vS - SWASH, 2).slice(1)];
  const wetRows = [...steps(vS - SWASH, vS + 0.6, 0.7), ...steps(vS + 0.6, vS + 15, 2.4).slice(1)];
  const sandCol = (u, v, y) => {
    const n = fbm3(u * 0.21, 0.3, v * 0.21, 2), dune = Math.min(1, Math.max(0, y * 1.4));
    let c = mixHex(SAND, SAND_DUNE, dune * 0.8 + (n - 0.5) * 0.6);
    c = mixHex(c, 0xd8c59a, Math.max(0, n - 0.6) * 1.2); // (patches of darker sand)
    return mixHex(c, SAND_WET, smooth(vS - SWASH - 1.5, vS - SWASH + 1.2, v));
  };
  const wetCol = (u, v) => {
    const n = fbm3(u * 0.3, 1.7, v * 0.3, 2);
    return mixHex(mixHex(SAND_WET, SAND_DEEP, smooth(vS - 1, vS + 4, v)), 0xb8a47a, (n - 0.5) * 0.5);
  };
  // (Snow settles on the dry sand in winter, patchy and windswept, and only a few autumn leaves blow onto it: 'road'…)
  g.add(tag(heightfield(us, dryRows, lip, sandCol), 'road'));
  g.add(tag(heightfield(us, wetRows, d.sandY, wetCol), 'none')); // (…but the sea keeps the wet sand clear)
  // Seaweed and shells along the strandline (where the biggest waves leave things).
  for (let i = 0; i < 70; i++) {
    const u = rng.float(uL + 2, uR - 2), v = vS - SWASH - 0.35 + rng.float(-0.45, 0.45);
    if (rng.chance(0.7)) mesh(blobGeometry(rng.int(0, 20), 0.45, 1), rng.pick([0x6b6a3a, 0x7a6f40, 0x5f5a33]), g, [u, d.sandY(u, v) + 0.012, v], [0, rng.float(0, 6), 0], [rng.float(0.08, 0.2), 0.018, rng.float(0.035, 0.08)]).castShadow = false;
    else mesh(geo('shell', () => new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)), rng.pick([0xf4e7d8, 0xf0d2c4, 0xe9dcc4]), g, [u, d.sandY(u, v), v], [0, rng.float(0, 6), 0], [0.05, 0.025, 0.04]).castShadow = false;
  }
  // Driftwood here and there.
  for (let i = 0; i < 6; i++) {
    const [u, v] = d.treasures[(i * 7) % d.treasures.length] ?? [gateU + 8, vF + 14];
    mesh(geo('drift', () => new THREE.CylinderGeometry(0.05, 0.07, 1.4, 7)), 0xc2b4a0, g, [u + 0.8, 0.05, v + 0.4], [Math.PI / 2, 0, rng.float(0, 6)], [1, rng.float(0.6, 1.2), 1]);
  }

  // ---- marram grass on the dunes ----
  {
    const tufts = new THREE.InstancedMesh(marramClump(), paint(0xffffff, { kind: 'inst' }), d.tufts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), greens = [0x8fa868, 0x9db574, 0x7f9a5e, 0xa8b97d];
    d.tufts.forEach((t, i) => {
      q.setFromEuler(e.set(0, t.rot, 0));
      m.compose(V(t.u, t.y - 0.04, t.v), q, V(t.s, t.s * rng.float(0.85, 1.2), t.s));
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, c.set(rng.pick(greens)));
    });
    tufts.castShadow = false;
    g.add(tag(tufts, 'plant'));
  }

  // ---- the boardwalk through the dunes ----
  {
    const B = d.board, plank = geo('bwPlank', () => new RoundedBoxGeometry(B.w, 0.05, 0.24, 1, 0.015));
    for (const v of steps(B.v0, B.v1, 0.29)) {
      const y = Math.max(0, d.duneH(B.u, v)) + 0.045;
      mesh(plank, (Math.round(v * 3.4) % 3) ? WOOD : mixHex(WOOD, WOOD_DARK, 0.4), g, [B.u + Math.sin(v * 2.1) * 0.02, y, v], [0, Math.sin(v * 3.7) * 0.03, 0]).castShadow = false;
    }
    for (const s of [-1, 1]) for (const v of steps(B.v0 + 0.2, B.v1 - 0.2, 2.2)) { // rope posts along it
      mesh(geo('ropePost', () => new THREE.CylinderGeometry(0.05, 0.06, 0.7, 7)), WOOD_DARK, g, [B.u + s * (B.w / 2 + 0.12), d.duneH(B.u + s * (B.w / 2 + 0.12), v) + 0.3, v]);
    }
  }

  // ---- beach huts, the kiosk, the lifeguard's tower ----
  for (const h of d.huts) { g.add(beachHut(h)); C.box(h.u - 1.25, h.v - 1.1, h.u + 1.25, h.v + 1.1, 2.3); }
  g.add(kiosk(d.kiosk));
  C.box(d.kiosk.u - 1.7, d.kiosk.v - 1.3, d.kiosk.u + 1.7, d.kiosk.v + 1.3, 2.5);
  C.circle(d.kiosk.u + 2.15, d.kiosk.v + 1.0, 0.3, 0.86); // (its bin)
  const T = d.tower;
  g.add(lifeguardTower(T));
  C.box(T.u - 0.8, T.v - 0.8, T.u + 0.8, T.v + 0.8, 1.66);
  [1.26, 0.84, 0.42].forEach((top, i) => C.circle(T.u, T.v - 0.98 - i * 0.36, 0.26, top)); // hop, hop, hop up the ladder

  // ---- the rock pools, and the rocks round them ----
  const pools = d.pools.map((p) => {
    g.add(rockPool(p, rng));
    const [x, z] = W(p.u, p.v), zone = { kind: 'rockpool', x, z, r: p.r, surface: 0.045 };
    extra.water.push(zone);
    return { pos: V(x, 0, z), r: p.r, zone };
  });
  const rocks = d.rocks.map((r) => {
    const y = r.h * 0.22;
    mesh(blobGeometry(r.seed, 0.3, r.s > 0.6 ? 3 : 2), rng.pick(ROCKS), g, [r.u, y, r.v], [rng.float(0, 3), r.rot, 0], [r.s, r.h, r.s * 0.9]); // (smooth, not chunky)
    if (r.s > 0.7 && rng.chance(0.5)) mesh(blobGeometry(rng.int(0, 20), 0.35, 1), 0x5f6b3e, g, [r.u, y + r.h * 0.82, r.v], [0, rng.float(0, 3), 0], [r.s * 0.55, r.h * 0.18, r.s * 0.45]).castShadow = false; // seaweed on top
    const top = y + r.h * 0.95;
    C.circle(r.u, r.v, r.s * 0.82, top);
    const [x, z] = W(r.u, r.v);
    return { pos: V(x, top, z), s: r.s };
  });

  // ---- groynes, the old boat, picnic blankets ----
  const groynes = d.groynes.map((gr) => {
    g.add(groyne(gr, d.sandY));
    for (const v of steps(gr.v0, gr.v1, 2.4)) C.box(gr.u - 0.16, v - 1.3, gr.u + 0.16, v + 1.3, 0.62 - 0.3 * smooth(gr.v0, gr.v1, v));
    const [x0, z0] = W(gr.u, gr.v0), [x1, z1] = W(gr.u, gr.v1);
    return { a: V(x0, 0, z0), b: V(x1, 0, z1), u: gr.u };
  });
  if (d.boat) {
    g.add(rowingBoat(d.boat));
    C.box(d.boat.u - 0.75, d.boat.v - 1.6, d.boat.u + 0.75, d.boat.v + 1.6, 0.86);
  }
  const blanketCols = [0xd9534f, 0x5b86c4, 0x6fae8f];
  const picnics = d.picnics.map((p, i) => {
    g.add(picnicBlanket(p, blanketCols[i % 3]));
    const cs = Math.cos(p.rot), sn = Math.sin(p.rot), bu = p.u + cs * 0.62 + sn * -0.45, bv = p.v - sn * 0.62 + cs * -0.45;
    C.circle(bu, bv, 0.24, 0.3);
    const [x, z] = W(p.u, p.v), [cx, cz] = W(p.u - cs * 0.35 + sn * 0.2, p.v + sn * 0.35 + cs * 0.2);
    return { pos: V(x, 0, z), chips: V(cx, 0.02, cz), face: a.turn + p.rot, u: p.u, v: p.v, rot: p.rot };
  });

  // ---- buoys round the swimming area (the swimming area ends at the strip's far end) ----
  {
    const pts = [];
    const line = (u0, v0, u1, v1) => { const n = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / 2.6)); for (let i = 0; i <= n; i++) pts.push([u0 + ((u1 - u0) * i) / n, v0 + ((v1 - v0) * i) / n]); };
    line(uL - 0.1, vS + 4, uL - 0.1, vB + 0.35);
    line(uL - 0.1, vB + 0.35, uR + 0.1, vB + 0.35);
    line(uR + 0.1, vB + 0.35, uR + 0.1, vS + 4);
    const ball = geo('buoy', () => new THREE.SphereGeometry(0.2, 9, 6));
    const rope = geo('rope', () => new THREE.CylinderGeometry(0.014, 0.014, 1, 4));
    const bg = tag(new THREE.Group(), 'none');
    pts.forEach(([u, v], i) => {
      mesh(ball, i % 2 ? 0xf2c94e : 0xe8743c, bg, [u, SEA_LEVEL + 0.04, v], [0, 0, 0], [1, 0.85, 1]).castShadow = false;
      const nx = pts[i + 1];
      if (nx && Math.hypot(nx[0] - u, nx[1] - v) < 3) { const len = Math.hypot(nx[0] - u, nx[1] - v); mesh(rope, 0xf1e8d8, bg, [(u + nx[0]) / 2, SEA_LEVEL + 0.03, (v + nx[1]) / 2], [Math.PI / 2, 0, -Math.atan2(nx[0] - u, nx[1] - v)], [1, len, 1]).castShadow = false; }
    });
    g.add(bg);
  }

  // ---- the lighthouse, out on the headland ----
  {
    const [lx, lz] = W(d.lighthouse.u, d.lighthouse.v);
    g.add(lighthouse(d.lighthouse, Math.min(-0.6, d.sink(lx, lz, 0)), rng));
  }

  // ---- the sea (to the horizon), and the sheet of water the waves push up the sand ----
  const uniforms = seaUniforms(a, vS);
  const p1 = rng.float(0, 6.28), p2 = rng.float(0, 6.28);
  const edgeV = (u) => { // (straight along the beach; round the headlands it starts further in, under the sloping shore)
    const out = Math.max(0, uL - 1 - u, u - uR - 1), k = smooth(0, 8, out);
    return vS + 0.5 - k * (3.2 + 1.2 * Math.sin(u * 0.11 + p1) + 0.7 * Math.sin(u * 0.27 + p2));
  };
  const sea = new THREE.Mesh(seaGeometry(uL, uR, edgeV, SEA_LEVEL, { edgeY: d.sandY(gateU, vS + 0.5) + 0.012 }), seaMaterial(uniforms));
  sea.castShadow = false;
  sea.receiveShadow = false;
  sea.frustumCulled = false;
  sea.name = 'sea';
  g.add(sea);
  const swash = new THREE.Mesh(swashGeometry(uL - 1, uR + 1, vS - SWASH - 0.6, vS + 0.8, vS, d.sandY), swashMaterial(uniforms));
  swash.castShadow = false;
  swash.renderOrder = 1;
  swash.name = 'swash';
  g.add(swash);
  const zone = { kind: 'sea', dir: a.dir, across: a.across, shore: vS, edge: vS + 0.5, shelf: 7.5, u0: uL - 2, u1: uR + 2, v1: vB + 2, surface: SEA_LEVEL };
  extra.water.push(zone);

  // ---- the ground you see, and the ground you stand on ----
  const B = d.board, onBoard = (u, v) => Math.abs(u - B.u) < B.w / 2 && v > B.v0 && v < B.v1;
  const laneDist = (u, v) => {
    let best = Infinity;
    for (let i = 0; i < ln.length - 1; i += 2) best = Math.min(best, (u - ln[i][0]) ** 2 + (v - ln[i][1]) ** 2);
    return Math.sqrt(best);
  };

  // ---- where the game's things go (world coordinates) ----
  const at = (u, v, y = 0) => { const [x, z] = W(u, v); return V(x, y, z); };
  const [gx, gz] = W(gateU, vF);
  const perches = [
    ...d.huts.map((h) => at(h.u, h.v, 2.86)),
    at(d.kiosk.u - 1.1, d.kiosk.v - 0.6, 2.62),
    at(T.u, T.v - 0.5, 2.88),
    ...groynes.flatMap((gr) => [0.2, 0.45].map((t) => gr.a.clone().lerp(gr.b, t).setY(0.78 - 0.32 * t))),
    ...rocks.filter((r) => r.s > 0.8).map((r) => r.pos.clone()),
  ];
  return {
    kind: 'beach', name: a.name, plan: a, layout: d,
    strip: a.strip, rect: a.rect, gate: V(gx, 0, gz),
    shore: vS, dir: a.dir, across: a.across,
    sea: { mesh: sea, swash, uniforms, zone },
    huts: d.huts.map((h) => ({ n: h.n, pos: at(h.u, h.v), door: at(h.u, h.v + 1.3), open: h.open, face: a.turn, color: h.color })),
    kiosk: { pos: at(d.kiosk.u, d.kiosk.v), counter: at(d.kiosk.u, d.kiosk.v + 1.75), keeper: at(d.kiosk.u, d.kiosk.v + 0.7), face: a.turn }, // (keeper: inside, behind the counter)
    tower: { pos: at(T.u, T.v), top: at(T.u, T.v, 1.67), stand: at(d.stand.u, d.stand.v), face: a.turn },
    pools, rocks, groynes, picnics, perches,
    boat: d.boat && { pos: at(d.boat.u, d.boat.v), under: at(d.boat.u + 0.5, d.boat.v + 0.6), face: a.turn + d.boat.rot },
    castles: d.castles.map((c, i) => ({ id: `sc${i}`, pos: at(c.u, c.v), face: a.turn + c.rot })),
    crowd: d.crowd.map((c) => ({ pos: at(c.u, c.v), face: a.turn + c.rot, u: c.u, v: c.v })),
    treasureSpots: d.treasures.map(([u, v]) => W(u, v)),
    smellSpots: d.smellSpots.map(([u, v]) => W(u, v)),
    lighthouse: at(d.lighthouse.u, d.lighthouse.v, 11),
    swimEnd: vB, // (the buoys)
    /** Area-frame (u, v) of a world point. */
    local: (x, z) => toLocal(a, x, z),
    /** World point of an area-frame (u, v). */
    at,
    /** A free spot on the dry sand for a job (world {x, z}), or null. */
    spot(q) { const p = d.free(q); if (!p) return null; const [x, z] = W(p[0], p[1]); return { x, z }; },
    /** How far onto the beach (0 in the meadow or town … 1 on the sand, past the dunes). */
    depth(x, z) {
      const [u, v] = toLocal(a, x, z);
      if (u < uL - 6 || u > uR + 6 || v < vF - 6) return 0;
      return Math.max(0, Math.min(1, (v - vF + 5) / 9, (u - uL + 6) / 8, (uR + 6 - u) / 8));
    },
    /** On the sand (not the meadow, not in the sea)? */
    onSand(x, z) { const [u, v] = toLocal(a, x, z); return u > uL && u < uR && v > vF - 3 && v < zone.edge; },
    inBeach: (x, z) => inRect(a.rect, x, z),
    /** The height of the ground you stand on here: up and over the dunes, along the boardwalk. */
    heightAt(x, z) {
      const [u, v] = toLocal(a, x, z);
      if (u < uL || u > uR || v < vF - 5.5 || v > vF + 9.5) return 0;
      return Math.max(d.duneH(u, v), onBoard(u, v) ? 0.07 : 0);
    },
    /** The height of the ground you see at (x, z) in this area's strip: sand, dunes, the boardwalk, the lane. */
    surfaceY(x, z) {
      const [u, v] = toLocal(a, x, z);
      if (v < vF - 3.6) return laneDist(u, v) < 1.5 ? 0.058 : -0.05;
      return Math.max(d.sandY(u, v), onBoard(u, v) ? 0.07 : -1);
    },
  };
}
