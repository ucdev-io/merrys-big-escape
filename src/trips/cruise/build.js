import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry, skyDome } from '../../world/props.js';
import { bake } from '../../entities/shapes.js';
import { deckchair } from '../../world/areas/beachBuild.js';
import { seaUniforms, seaMaterial } from '../../world/areas/sea.js';
import { shipShape, halfBeam, SHIP, NAVY, RED, WHITE, FUNNEL } from '../../entities/ship.js';
import { tripWorld } from '../kit.js';

/*
 * 🚢 The Sunny Dolphin, out at sea: a little cruise ship to run about on. Its own coordinates: x across (port −,
 * starboard +), z along (the bow points to −z), the main deck at y = 0 and the sea far below at −SHIP.H.
 *
 *      bow ▲  (z −30) the bell, the anchor winch, the mast, crates
 *          │  the forward cabins (z −19…−8), the top deck on their roof (y 2.6): the wheelhouse, the captain at the
 *          │      helm with the horn; stairs up on the starboard side; the diving board out over the pool
 *          │  the splash pool (z −6…2), sun loungers round it; the gangway down to the tender (starboard, z 3.6)
 *          │  the aft cabins (z 8…19), the sun deck on their roof (y 2.6): the funnel, the lifeboats, deckchairs;
 *          │      stairs up on the port side
 *    stern ▼  (z 26) the stern deck: Grandad Ted's fetch, the flagpole
 */

export const UP = 2.6; // the top deck and the sun deck
export const PLAN = {
  fore: { x: 4.4, z0: -19, z1: -8 },
  aft: { x: 4.4, z0: 8, z1: 19 },
  wheel: { x: 3, z0: -18.6, z1: -14.6, top: 4.7 },
  pool: { x: 0, z: -2, rx: 2.8, rz: 4.0, surface: -0.28, depth: 1.6 },
  board: { w: 0.35, z0: -8, z1: -5.4 },
  gangway: { x: 6.3, z: 3.6 },
  funnel: { x: 0, z: 15, rx: 1.2, rz: 1.6, top: 8.2 },
  boats: [-1, 1].map((s) => ({ x: s * 3.4, z0: 10.4, z1: 13.6 })),
  helm: { x: 0.9, z: -13.4 },
  horn: { x: 2.0, z: -13.9 },
  bell: { x: 1.8, z: -21.6 },
  captain: { x: 2.6, z: -12.6 },
  ted: { x: -3.0, z: 20.6 },
  pemberton: { x: 2.4, z: 17.3 },
  fetch: { x0: -4.3, x1: 4.3, z0: 21.2, z1: 24.4 },
  stairsFore: { x0: 4.4, x1: 5.85, zTop: -14, dir: -1 },   // up towards the bow, from z −8
  stairsAft: { x0: -5.85, x1: -4.4, zTop: 14, dir: 1 },     // up towards the stern, from z 8
};

const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, r);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);
/** The rotation (as [x, y, z]) that lays a cylinder (along y) from a to b. */
const along = (a, b) => _e.setFromQuaternion(_q.setFromUnitVectors(_up, b.clone().sub(a).normalize())).toArray().slice(0, 3);

/** The deck's outline with the pool cut out of it, as a slab from y0 to y1. */
function slab(shape, y0, y1, holes = []) {
  for (const h of holes) shape.holes.push(h);
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(Math.PI / 2);
  g.translate(0, y1, 0);
  return g;
}
/** A ring: the outline, minus the outline `inset` in from it (the hull's sides, the bulwark), from y0 to y1. */
function ring(outer, inset, y0, y1) {
  const s = shipShape(outer);
  s.holes.push(new THREE.Path(shipShape(outer + inset).getPoints(14)));
  return slab(s, y0, y1);
}

function add(g, geo, color, pos = [0, 0, 0], { rot = [0, 0, 0], scale = null, cast = true, opts, occluder = false } = {}) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (occluder) m.userData.occluder = true;
  g.add(m);
  return m;
}

/** A white handrail: posts and two rails along a run of points (at height y), as baked parts. */
function railParts(pts, y, parts, color = 0xf3efe6) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    parts.push([new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6), color, [x, y + 0.475, z]]);
    if (i === pts.length - 1) break;
    const [x2, z2] = pts[i + 1], len = Math.hypot(x2 - x, z2 - z), rot = Math.abs(x2 - x) > Math.abs(z2 - z) ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    for (const h of [0.5, 0.95]) parts.push([new THREE.CylinderGeometry(0.03, 0.03, len, 6), h > 0.9 ? 0xc8a47a : color, [(x + x2) / 2, y + h, (z + z2) / 2], rot]);
  }
}
/** Points every `step` along a straight run. */
const run = (x0, z0, x1, z1, step = 1.2) => {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  return out;
};

/** A block of cabins: rounded white walls, windows all round, doors at the ends, a teak rail round the roof. */
function cabins(g, b, parts, { doorEnds = [] } = {}) {
  const w = b.x * 2, d = b.z1 - b.z0, zc = (b.z0 + b.z1) / 2;
  add(g, rbox(w, UP, d, 0.18), WHITE, [0, UP / 2, zc], { occluder: true });
  add(g, rbox(w + 0.08, 0.1, d + 0.08, 0.04), 0xd9cfbf, [0, UP - 0.02, zc], { cast: false }); // (the roof's deck)
  for (const s of [-1, 1]) for (let z = b.z0 + 1.1; z < b.z1 - 0.8; z += 1.55) {
    parts.push([rbox(0.06, 0.8, 1.05, 0.03), 0x9cc8e0, [s * (b.x + 0.01), 1.45, z]]);
    parts.push([rbox(0.05, 0.92, 1.17, 0.04), NAVY, [s * (b.x - 0.005), 1.45, z]]);
  }
  for (const e of doorEnds) {
    const z = e > 0 ? b.z1 : b.z0;
    parts.push([rbox(1.0, 1.9, 0.06, 0.04), 0x8a5a3a, [-1.6, 0.95, z + e * 0.01]]);
    parts.push([new THREE.SphereGeometry(0.05, 8, 6), 0xe0b04a, [-1.25, 0.95, z + e * 0.05]]);
    for (const x of [0.6, 2.2]) parts.push([new THREE.CylinderGeometry(0.32, 0.32, 0.05, 16), 0x9cc8e0, [x, 1.5, z + e * 0.02], [Math.PI / 2, 0, 0]]);
    for (const x of [0.6, 2.2]) parts.push([new THREE.TorusGeometry(0.33, 0.05, 6, 18), NAVY, [x, 1.5, z + e * 0.03]]);
  }
}

/** Steps up the side of a block: `n` boxes (each a step up), then a landing at the top. */
function stairs(g, C, s, parts) {
  const n = 10, step = UP / n, run_ = 0.6, w = s.x1 - s.x0, xc = (s.x0 + s.x1) / 2, z0 = s.zTop - s.dir * n * run_;
  for (let i = 0; i < n; i++) {
    const za = z0 + s.dir * i * run_, zb = za + s.dir * run_, top = step * (i + 1);
    parts.push([rbox(w, top, run_ + 0.02, 0.03), i % 2 ? 0xd9cfbf : 0xcfc3b0, [xc, top / 2, (za + zb) / 2]]);
    C.box(s.x0, Math.min(za, zb), s.x1, Math.max(za, zb), top);
  }
  const la = s.zTop, lb = s.zTop + s.dir * 1.2;
  parts.push([rbox(w, UP, 1.22, 0.03), 0xd9cfbf, [xc, UP / 2, (la + lb) / 2]]);
  C.box(s.x0, Math.min(la, lb), s.x1, Math.max(la, lb), UP);
  // A handrail up the outside.
  const out = s.x1 > 0 ? s.x1 - 0.06 : s.x0 + 0.06, pts = [];
  for (let i = 0; i <= n; i += 2) pts.push([out, z0 + s.dir * i * run_]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, z] = pts[i], [, z2] = pts[i + 1], y = (i * 2) * step, y2 = (i * 2 + 2) * step, len = Math.hypot(z2 - z, y2 - y);
    parts.push([new THREE.CylinderGeometry(0.03, 0.03, len, 6), 0xc8a47a, [x, (y + y2) / 2 + 0.9, (z + z2) / 2], [Math.atan2(z2 - z, y2 - y), 0, 0]]);
    parts.push([new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), 0xf3efe6, [x, y + 0.45 + step, z]]);
  }
  return { z0, la, lb };
}

/** A foam trail behind the stern, scrolling away as she sails (a little shader of its own). */
function wake() {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 24);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = p.getY(i) + 0.5, x = p.getX(i); p.setXYZ(i, x * (9 + v * 46), 0, SHIP.STERN - 1 + v * 110); }
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uFoam: { value: new THREE.Color(0xf7f8f2) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFoam; varying vec2 vUv;
      float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float along = vUv.y, across = abs(vUv.x - 0.5) * 2.0;
        float churn = n(vec2(vUv.x * 14.0, along * 70.0 - uTime * 3.0)) * n(vec2(vUv.x * 5.0 + 3.0, along * 22.0 - uTime * 1.2));
        float mid = (1.0 - smoothstep(0.0, 0.5 + along * 0.4, across)) * (1.0 - along);
        float sides = smoothstep(0.12, 0.0, abs(across - 0.86)) * smoothstep(1.0, 0.2, along) * n(vec2(vUv.x * 30.0, along * 50.0 - uTime * 2.0));
        float a = smoothstep(0.18, 0.5, churn) * mid * 0.85 + sides * 0.7;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uFoam, a * smoothstep(0.0, 0.04, along));
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -SHIP.H + 0.03;
  m.renderOrder = 1;
  return m;
}

/** An island far off (sliding past as she sails): a soft green hill on a sandy shore, maybe a lighthouse. One mesh. */
function island(seed, s, lighthouse) {
  const y0 = -SHIP.H, parts = [[new THREE.CylinderGeometry(s * 1.15, s * 1.25, 1.2, 28), 0xe0cc98, [0, y0 + 0.3, 0]]];
  for (let k = 0; k < 4; k++) parts.push([blobGeometry(seed + k, 0.25, 2), k % 2 ? 0x7fae64 : 0x6f9a52, [Math.cos(k * 2.1) * s * 0.4, y0 + s * 0.35, Math.sin(k * 2.1) * s * 0.35], [0, 0, 0], [s * 0.7, s * 0.55, s * 0.6]]);
  if (lighthouse) {
    const x = s * 0.5, b = y0 + s * 0.6;
    parts.push([new THREE.CylinderGeometry(1.0, 1.4, 9, 16), 0xf6f2ea, [x, b + 4.5, 0]]);
    for (const y of [2.5, 6]) parts.push([new THREE.CylinderGeometry(1.15, 1.25, 1.2, 16), RED, [x, b + y, 0]]);
    parts.push([new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), RED, [x, b + 9.6, 0]]);
  }
  return new THREE.Mesh(bake(parts), paint(0xffffff, { vertexColors: true }));
}

export function buildShip(origin) {
  const { group: g, C, W, R, col, ox, oz } = tripWorld(origin);
  g.userData.season = 'none'; // (no snow or autumn leaves out at sea)
  const P = PLAN, parts = [], H = SHIP.H;

  // ---- the hull: navy sides with a red stripe at the waterline, a white band, the bulwark round the main deck ----
  add(g, ring(0, 0.25, -H - 0.8, 0), NAVY, [0, 0, 0], { cast: false });
  add(g, ring(-0.03, 0.3, -H - 0.1, -H + 0.35), RED, [0, 0, 0], { cast: false });
  add(g, ring(-0.02, 0.3, -0.45, -0.1), WHITE, [0, 0, 0], { cast: false });
  add(g, ring(0, 0.18, -0.1, 0.95), WHITE, [0, 0, 0]);
  add(g, ring(-0.03, 0.26, 0.95, 1.03), 0xc8a47a, [0, 0, 0], { cast: false }); // (a teak cap along the top)
  add(g, slab(shipShape(0.5), -H - 0.8, -H - 0.3), NAVY, [0, 0, 0], { cast: false }); // (its bottom)
  // Portholes along the sides.
  for (const s of [-1, 1]) for (let z = -13; z < 23; z += 2.4) {
    parts.push([new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), 0xbfdcec, [s * (SHIP.B + 0.02), -1.5, z], [0, 0, Math.PI / 2]]);
    parts.push([new THREE.TorusGeometry(0.21, 0.04, 6, 14), 0xe0b04a, [s * (SHIP.B + 0.04), -1.5, z], [0, Math.PI / 2, 0]]);
  }
  // The ship's name on the bow, in big friendly letters (dabs of paint).
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) parts.push([rbox(0.05, 0.42, 0.28, 0.02), 0xf6f2ea, [s * (halfBeam(-20 + i * 0.5) + 0.03), -0.9, -20 + i * 0.5]]);

  // ---- the main deck: planks, with the pool cut out of it ----
  const pool = new THREE.Path().absellipse(P.pool.x, P.pool.z, P.pool.rx, P.pool.rz, 0, Math.PI * 2, false);
  add(g, slab(shipShape(0.17), -0.12, 0, [pool]), 0xd8b98c, [0, 0, 0], { cast: false });
  for (let x = -6.25; x <= 6.25; x += 0.5) { // (the lines between the planks, from the bow's curve to the stern's)
    const ax = Math.abs(x) + 0.25;
    if (ax > SHIP.B - 0.2) continue;
    let zf = SHIP.BOW + 1;
    while (zf < SHIP.SIDE && halfBeam(zf) - 0.2 < ax) zf += 0.25;
    const zs = SHIP.STERN - 0.3 - (ax > SHIP.B - 3 ? 3 - Math.sqrt(Math.max(0, 9 - (ax - SHIP.B + 3) ** 2)) : 0);
    const inPool = Math.abs(x) < P.pool.rx - 0.05, dz = inPool ? P.pool.rz * Math.sqrt(1 - (x / P.pool.rx) ** 2) : 0;
    const segs = inPool ? [[zf, P.pool.z - dz - 0.12], [P.pool.z + dz + 0.12, zs]] : [[zf, zs]];
    for (const [a, b] of segs) if (b - a > 0.2) parts.push([new THREE.BoxGeometry(0.025, 0.004, b - a), 0xb89a70, [x, 0.003, (a + b) / 2]]);
  }
  // ---- the splash pool: tiled sides and bottom, a white rim, a ladder ----
  {
    const p = P.pool;
    const tank = new THREE.CylinderGeometry(1, 1, p.depth, 40, 1, true);
    add(g, tank, 0x8fd0d8, [p.x, -p.depth / 2, p.z], { scale: [p.rx, 1, p.rz], cast: false, opts: { side: THREE.BackSide } });
    add(g, new THREE.CircleGeometry(1, 40), 0x7cc4d0, [p.x, -p.depth + 0.01, p.z], { rot: [-Math.PI / 2, 0, 0], scale: [p.rx, p.rz, 1], cast: false });
    for (let k = 0; k < 3; k++) add(g, new THREE.RingGeometry(0.98 - k * 0.3, 1 - k * 0.3, 40), 0xa8dde4, [p.x, -p.depth + 0.015, p.z], { rot: [-Math.PI / 2, 0, 0], scale: [p.rx, p.rz, 1], cast: false });
    add(g, new THREE.TorusGeometry(1, 0.09, 8, 48), 0xfbfaf6, [p.x, 0.02, p.z], { rot: [Math.PI / 2, 0, 0], scale: [p.rx + 0.05, p.rz + 0.05, 1], cast: false });
    for (const s of [-1, 1]) parts.push([new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI), 0xc9ccd4, [p.x + s * 0.3, 0.05, p.z + p.rz - 0.05], [0, 0, 0]]);
  }
  // ---- the forward cabins, their roof (the top deck), the wheelhouse ----
  cabins(g, P.fore, parts, { doorEnds: [1] });
  C.box(-P.fore.x, P.fore.z0, P.fore.x, P.fore.z1, UP);
  {
    const w = P.wheel, d = w.z1 - w.z0, zc = (w.z0 + w.z1) / 2, h = w.top - UP;
    add(g, rbox(w.x * 2, h, d, 0.15), WHITE, [0, UP + h / 2, zc], { occluder: true });
    add(g, rbox(w.x * 2 + 0.5, 0.14, d + 0.5, 0.05), NAVY, [0, w.top + 0.05, zc]);
    for (let i = -2; i <= 2; i++) parts.push([rbox(0.9, 0.8, 0.06, 0.03), 0x9cc8e0, [i * 1.12, UP + 1.25, w.z0 - 0.01]]);
    for (const s of [-1, 1]) for (const z of [zc - 0.9, zc + 0.9]) parts.push([rbox(0.06, 0.7, 1.0, 0.03), 0x9cc8e0, [s * (w.x + 0.01), UP + 1.3, z]]);
    parts.push([rbox(1.0, 1.7, 0.06, 0.04), 0x8a5a3a, [-1.4, UP + 0.85, w.z1 + 0.01]]);
    C.box(-w.x, w.z0, w.x, w.z1, w.top);
    // The radar and the little flag on top.
    add(g, new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8), 0xc9ccd4, [0, w.top + 0.7, zc]);
    add(g, rbox(1.4, 0.12, 0.25, 0.05), 0xc9ccd4, [0, w.top + 1.35, zc]);
  }
  // The helm: the ship's wheel on its stand, and the horn's lever beside it.
  {
    const h = P.helm;
    add(g, new THREE.CylinderGeometry(0.12, 0.16, 1.0, 12), 0x8a5a3a, [h.x, UP + 0.5, h.z]);
    const wheelG = new THREE.Group();
    wheelG.position.set(h.x, UP + 1.15, h.z + 0.14);
    g.add(wheelG);
    add(wheelG, new THREE.TorusGeometry(0.42, 0.04, 8, 28), 0x9a6a3e);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(wheelG, new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6), 0x9a6a3e, [0, 0, 0], { rot: [0, 0, a] }); add(wheelG, new THREE.SphereGeometry(0.045, 8, 6), 0xc8a47a, [Math.cos(a) * 0.53, Math.sin(a) * 0.53, 0]); }
    add(wheelG, new THREE.SphereGeometry(0.08, 10, 8), 0xe0b04a);
    C.circle(h.x, h.z, 0.35, UP + 1.2);
    const n = P.horn;
    add(g, rbox(0.4, 0.9, 0.3, 0.05), 0xc9ccd4, [n.x, UP + 0.45, n.z]);
    add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), 0x3a3a40, [n.x, UP + 1.1, n.z], { rot: [0, 0, 0.35] });
    add(g, new THREE.SphereGeometry(0.07, 10, 8), RED, [n.x - 0.09, UP + 1.34, n.z]);
    C.box(n.x - 0.22, n.z - 0.17, n.x + 0.22, n.z + 0.17, UP + 0.9);
  }
  // The diving board out over the pool (a springy plank on the top deck's edge).
  add(g, rbox(P.board.w * 2, 0.08, P.board.z1 - P.board.z0, 0.03), 0x5b86c4, [0, UP - 0.04, (P.board.z0 + P.board.z1) / 2]);
  C.box(-P.board.w, P.board.z0, P.board.w, P.board.z1, UP);
  // Rails round the top deck (open at the stairs and the board).
  const fr = P.fore;
  railParts(run(-fr.x + 0.1, fr.z0 + 0.1, fr.x - 0.1, fr.z0 + 0.1), UP, parts);
  railParts(run(-fr.x + 0.1, fr.z0 + 0.1, -fr.x + 0.1, fr.z1 - 0.1), UP, parts);
  railParts(run(fr.x - 0.1, fr.z0 + 0.1, fr.x - 0.1, -15.3), UP, parts);
  railParts(run(fr.x - 0.1, -13.3, fr.x - 0.1, fr.z1 - 0.1), UP, parts);
  railParts(run(-fr.x + 0.1, fr.z1 - 0.1, -P.board.w - 0.1, fr.z1 - 0.1), UP, parts);
  railParts(run(P.board.w + 0.1, fr.z1 - 0.1, fr.x - 0.1, fr.z1 - 0.1), UP, parts);
  const wall = (x0, z0, x1, z1, top) => C.box(Math.min(x0, x1) - 0.06, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.06, Math.max(z0, z1) + 0.06, top, false);
  wall(-fr.x, fr.z0, fr.x, fr.z0, UP + 1); wall(-fr.x, fr.z0, -fr.x, fr.z1, UP + 1);
  wall(fr.x, fr.z0, fr.x, -15.3, UP + 1); wall(fr.x, -13.3, fr.x, fr.z1, UP + 1);
  wall(-fr.x, fr.z1, -P.board.w - 0.05, fr.z1, UP + 1); wall(P.board.w + 0.05, fr.z1, fr.x, fr.z1, UP + 1);
  stairs(g, C, P.stairsFore, parts);

  // ---- the aft cabins, the sun deck on their roof: the funnel, the lifeboats, deckchairs ----
  const af = P.aft;
  cabins(g, af, parts, { doorEnds: [-1] });
  C.box(-af.x, af.z0, af.x, af.z1, UP);
  railParts(run(-af.x + 0.1, af.z1 - 0.1, af.x - 0.1, af.z1 - 0.1), UP, parts);
  railParts(run(af.x - 0.1, af.z0 + 0.1, af.x - 0.1, af.z1 - 0.1), UP, parts);
  railParts(run(-af.x + 0.1, af.z0 + 0.1, af.x - 0.1, af.z0 + 0.1), UP, parts);
  railParts(run(-af.x + 0.1, af.z0 + 0.1, -af.x + 0.1, 13.3), UP, parts);
  railParts(run(-af.x + 0.1, 15.3, -af.x + 0.1, af.z1 - 0.1), UP, parts);
  wall(-af.x, af.z1, af.x, af.z1, UP + 1); wall(af.x, af.z0, af.x, af.z1, UP + 1); wall(-af.x, af.z0, af.x, af.z0, UP + 1);
  wall(-af.x, af.z0, -af.x, 13.3, UP + 1); wall(-af.x, 15.3, -af.x, af.z1, UP + 1);
  stairs(g, C, P.stairsAft, parts);
  {
    const f = P.funnel, h = f.top - UP;
    add(g, new THREE.CylinderGeometry(1, 1.12, h, 28), FUNNEL, [f.x, UP + h / 2, f.z], { scale: [f.rx, 1, f.rz / 1.0 * 0.85], occluder: true });
    add(g, new THREE.CylinderGeometry(1.012, 1.03, 0.7, 28, 1, true), WHITE, [f.x, f.top - 1.6, f.z], { scale: [f.rx, 1, f.rz * 0.85] });
    add(g, new THREE.CylinderGeometry(1.0, 1.0, 0.5, 28), 0x3a3a40, [f.x, f.top - 0.2, f.z], { scale: [f.rx * 0.98, 1, f.rz * 0.83] });
    // A big sun on each side (the Sunny Dolphin's badge), on the funnel's skin.
    for (const s of [-1, 1]) {
      const x = s * (f.rx * 1.075 + 0.03);
      add(g, new THREE.CircleGeometry(0.42, 24), 0xf2c94c, [x, UP + 3.0, f.z], { rot: [0, s * Math.PI / 2, 0], cast: false });
      add(g, new THREE.RingGeometry(0.5, 0.62, 24), 0xf6e08a, [x * 0.995, UP + 3.0, f.z], { rot: [0, s * Math.PI / 2, 0], cast: false });
    }
    C.circle(f.x, f.z, Math.max(f.rx, f.rz * 0.85) + 0.15, Infinity);
  }
  for (const b of P.boats) {
    const zc = (b.z0 + b.z1) / 2, len = b.z1 - b.z0;
    for (const z of [b.z0 + 0.4, b.z1 - 0.4]) add(g, rbox(1.0, 0.3, 0.2, 0.04), 0x8a5a3a, [b.x, UP + 0.15, z]); // chocks
    const hull = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    add(g, hull, 0xe8843a, [b.x, UP + 0.95, zc], { scale: [0.6, 0.55, len / 2] });
    add(g, new THREE.TorusGeometry(1, 0.06, 6, 28), 0xf6f2ea, [b.x, UP + 0.95, zc], { rot: [Math.PI / 2, 0, 0], scale: [0.6, len / 2, 1] });
    add(g, new THREE.CircleGeometry(1, 24), 0xb48a5e, [b.x, UP + 0.9, zc], { rot: [-Math.PI / 2, 0, 0], scale: [0.54, len / 2 - 0.08, 1], cast: false });
    C.box(b.x - 0.6, b.z0, b.x + 0.6, b.z1, UP + 0.95);
  }
  for (const [x, z, r] of [[-1.6, 9.5, 0.2], [-0.4, 9.5, -0.1], [1.4, 17.6, Math.PI + 0.15], [-1.9, 17.6, Math.PI - 0.1]]) { const c = deckchair(x, z, r, [0x5b86c4, 0xfaf6ec]); c.position.y = UP; g.add(c); }
  // Mrs Pemberton's sun lounger (she's on it: see the chapter).
  add(g, rbox(0.8, 0.35, 2.0, 0.06), 0xfaf6ec, [P.pemberton.x, UP + 0.2, P.pemberton.z]);
  add(g, rbox(0.75, 0.08, 1.95, 0.03), 0xf2a0b4, [P.pemberton.x, UP + 0.4, P.pemberton.z]);
  C.box(P.pemberton.x - 0.42, P.pemberton.z - 1.0, P.pemberton.x + 0.42, P.pemberton.z + 1.0, UP + 0.42);

  // ---- round the pool on the main deck: sun loungers and parasols ----
  for (const [x, z, c] of [[-4.6, -4.4, 0xd9534f], [-4.6, -1.2, 0x5b86c4], [4.6, -4.4, 0x6fae8f], [4.6, -0.6, 0xf2c94e]]) {
    add(g, rbox(0.8, 0.3, 1.9, 0.06), 0xfaf6ec, [x, 0.17, z]);
    add(g, rbox(0.75, 0.07, 1.85, 0.03), c, [x, 0.35, z]);
    C.box(x - 0.42, z - 0.95, x + 0.42, z + 0.95, 0.38);
  }
  for (const [x, z, c] of [[-5.3, -2.8, 0xd9534f], [5.3, -2.5, 0x6fae8f]]) {
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), 0xf1e8d8, [x, 1.15, z]);
    const cone = new THREE.ConeGeometry(1.2, 0.5, 12, 1, true);
    const cols = [];
    for (let i = 0; i < cone.attributes.position.count; i++) { const a = Math.atan2(cone.attributes.position.getZ(i), cone.attributes.position.getX(i)); new THREE.Color(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 2 ? c : 0xfaf6ec).toArray(cols, i * 3); }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    add(g, cone, 0xffffff, [x, 2.3, z], { opts: { vertexColors: true, side: THREE.DoubleSide } });
    C.circle(x, z, 0.12, Infinity);
  }
  // The gangway's gate in the bulwark (starboard), a life ring beside it.
  {
    const gw = P.gangway;
    parts.push([new THREE.BoxGeometry(0.06, 0.06, 1.4), 0xe0b04a, [SHIP.B - 0.17, 0.98, gw.z]]); // (a brass rail over the gap)
    add(g, new THREE.TorusGeometry(0.3, 0.08, 8, 20), 0xf2f0ea, [SHIP.B - 0.2, 0.6, gw.z + 1.6], { rot: [0, Math.PI / 2, 0] });
    // The gangway itself, down along the hull's side to a little landing, where the tender waits.
    const y0 = 0.9, y1 = -H + 0.55, z0 = gw.z + 0.3, z1 = gw.z + 6.3, len = Math.hypot(z1 - z0, y0 - y1), x = SHIP.B + 0.65;
    add(g, rbox(0.9, 0.07, len, 0.02), 0xc8a47a, [x, (y0 + y1) / 2, (z0 + z1) / 2], { rot: [Math.atan2(y0 - y1, z1 - z0), 0, 0] });
    for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.025, 0.025, len, 6), 0xe8dcc0, [x + s * 0.42, (y0 + y1) / 2 + 0.75, (z0 + z1) / 2], { rot: [Math.PI / 2 + Math.atan2(y0 - y1, z1 - z0), 0, 0], cast: false });
    add(g, rbox(1.4, 0.12, 1.6, 0.03), 0xc8a47a, [x + 0.1, y1 - 0.06, z1 + 0.75]);
    add(g, rbox(0.12, 0.6, 2.2, 0.03), 0xf6f2ea, [SHIP.B + 0.06, 0.55 - 0.3, gw.z], { cast: false }); // (the gate, open)
  }

  // ---- the bow: the bell, the anchor winch, the mast, crates and coils of rope ----
  {
    const b = P.bell;
    add(g, new THREE.CylinderGeometry(0.05, 0.06, 1.6, 8), 0x8a5a3a, [b.x, 0.8, b.z]);
    add(g, new THREE.BoxGeometry(0.5, 0.06, 0.06), 0x8a5a3a, [b.x - 0.2, 1.6, b.z]);
    add(g, new THREE.CylinderGeometry(0.08, 0.2, 0.32, 16, 1, true), 0xe0b04a, [b.x - 0.35, 1.38, b.z], { opts: { side: THREE.DoubleSide } });
    C.circle(b.x, b.z, 0.15, Infinity);
    add(g, new THREE.CylinderGeometry(0.5, 0.55, 0.6, 18), 0x3a3a40, [0, 0.3, -24.5]);
    add(g, new THREE.CylinderGeometry(0.56, 0.56, 0.1, 18), 0xe0b04a, [0, 0.62, -24.5]);
    C.circle(0, -24.5, 0.6, 0.67);
    add(g, new THREE.CylinderGeometry(0.11, 0.14, 9.5, 10), 0xc8a47a, [0, 4.75, -21.2]);
    C.circle(0, -21.2, 0.2, Infinity);
    for (const [x, z, s] of [[-3.0, -19.9, 0.9], [-2.1, -19.9, 0.75], [-2.6, -19.85, 0.6]]) add(g, rbox(s, s, s, 0.05), 0xa8784e, [x, s / 2 + (s === 0.6 ? 0.9 : 0), z]);
    C.box(-3.5, -20.4, -1.7, -19.4, 1.2);
    for (const [x, z] of [[2.6, -19.8], [-1.0, -26.8]]) {
      for (let k = 0; k < 3; k++) add(g, new THREE.TorusGeometry(0.3 - k * 0.04, 0.05, 6, 18), 0xe8dcc0, [x, 0.05 + k * 0.09, z], { rot: [Math.PI / 2, 0, 0] });
    }
  }
  // ---- the stern deck: a shuffleboard court painted on the planks, the flagpole ----
  {
    const f = P.fetch;
    for (const x of [-2.2, 0, 2.2]) {
      parts.push([new THREE.BoxGeometry(1.4, 0.006, 0.05), 0xfbfaf6, [x, 0.006, f.z0 + 0.3]]);
      parts.push([new THREE.CylinderGeometry(0.5, 0.5, 0.006, 20), 0xfbfaf6, [x, 0.004, f.z1 - 0.8]]);
      parts.push([new THREE.CylinderGeometry(0.42, 0.42, 0.006, 20), 0xd8b98c, [x, 0.005, f.z1 - 0.8]]);
    }
    add(g, new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8), 0xf6f2ea, [0, 2.1, 25.0]);
    C.circle(0, 25.0, 0.12, Infinity);
  }
  // ---- bunting: strings of little flags from the mast to the bow, the wheelhouse, and the funnel to the stern ----
  {
    const flags = [], cols = [0xd9534f, 0xf2c94e, 0x5b86c4, 0x6fae8f, 0xf6f2ea];
    const string = (a, b, sag, n) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        if (i > 0 && i < n) {
          const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.13, 0, 0), new THREE.Vector3(0.13, 0, 0), new THREE.Vector3(0, -0.3, 0)]);
          tri.computeVertexNormals();
          const dir = b.clone().sub(a);
          flags.push([tri, cols[i % cols.length], p.toArray(), [0, Math.atan2(dir.x, dir.z) + Math.PI / 2, 0]]);
        }
      }
      for (let i = 0; i < n; i++) { // (the string itself, sagging between the two ends)
        const p0 = a.clone().lerp(b, i / n), p1 = a.clone().lerp(b, (i + 1) / n);
        p0.y -= Math.sin((i / n) * Math.PI) * sag; p1.y -= Math.sin(((i + 1) / n) * Math.PI) * sag;
        flags.push([new THREE.CylinderGeometry(0.012, 0.012, p0.distanceTo(p1), 4), 0xe8dcc0, p0.clone().lerp(p1, 0.5).toArray(), along(p0, p1)]);
      }
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    string(V(0, 9.3, -21.2), V(0, 1.1, -29.6), 0.5, 16);
    string(V(0, 9.3, -21.2), V(0, P.wheel.top + 1.4, -16.6), 0.3, 9);
    string(V(0, P.funnel.top - 0.3, P.funnel.z + 1.3), V(0, 4.2, 25.0), 0.6, 16);
    const m = new THREE.Mesh(bake(flags), paint(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    m.castShadow = false;
    g.add(m);
  }
  // All the little bits, baked into one.
  g.add(new THREE.Mesh(bake(parts), paint(0xffffff, { vertexColors: true })));
  g.children[g.children.length - 1].castShadow = true;
  g.children[g.children.length - 1].receiveShadow = true;

  // ---- colliders: the ship's sides (no falling overboard!), the bow narrowing to its point, the stern ----
  const BIG = 30;
  C.box(SHIP.B - 0.2, SHIP.SIDE, BIG, SHIP.STERN, Infinity);
  C.box(-BIG, SHIP.SIDE, -SHIP.B + 0.2, SHIP.STERN, Infinity);
  C.box(-BIG, SHIP.STERN - 0.55, BIG, BIG, Infinity);
  for (const s of [-1, 1]) { C.box(s > 0 ? 4.4 : -BIG, SHIP.STERN - 1.4, s > 0 ? BIG : -4.4, BIG, Infinity); C.box(s > 0 ? 5.6 : -BIG, SHIP.STERN - 2.4, s > 0 ? BIG : -5.6, BIG, Infinity); }
  for (let z = SHIP.SIDE; z > SHIP.BOW + 0.5; z -= 1.5) {
    const hw = halfBeam(z - 1.5) - 0.25;
    C.box(Math.max(0.2, hw), z - 1.5, BIG, z, Infinity);
    C.box(-BIG, z - 1.5, -Math.max(0.2, hw), z, Infinity);
  }
  C.box(-BIG, -BIG - 30, BIG, SHIP.BOW + 1.2, Infinity);

  // ---- the sea, to the horizon, and the wake ----
  const scene = new THREE.Scene();
  const occluders = collectOccluders(g);
  scene.add(mergeStatic(g, { chunk: 128 }));
  const sea = new THREE.PlaneGeometry(1400, 1400, 1, 1);
  sea.rotateX(-Math.PI / 2);
  sea.setAttribute('aEdge', new THREE.Float32BufferAttribute([30, 30, 30, 30], 1));
  const uniforms = seaUniforms({ dir: [0, -1], across: [1, 0] }, 0);
  const seaMesh = new THREE.Mesh(sea, seaMaterial(uniforms));
  seaMesh.position.set(ox, -H, oz);
  scene.add(seaMesh);
  const wk = wake();
  wk.position.x = ox; wk.position.z = oz;
  scene.add(wk);
  // Islands far off, sliding past (the ship's sailing along).
  const islands = [[-110, -60, 22, true], [140, 40, 30, false], [-150, 150, 26, false], [120, -200, 18, true]].map(([x, z, s, lh], i) => {
    const m = island(i * 7 + 3, s, lh);
    m.position.set(ox + x, 0, oz + z);
    scene.add(m);
    return { m, x, z };
  });
  const sky = skyDome(170);
  scene.add(sky);
  const dyn = new THREE.Group();
  dyn.position.set(ox, 0, oz);
  scene.add(dyn);
  const world = {
    group: g, colliders: col, water: [], gardens: [], beds: [], bins: [],
    bounds: R(-SHIP.B, SHIP.BOW, SHIP.B, SHIP.STERN),
    occluders,
    camera: { distMax: 11, pitchMin: 0.22 },
    W, R, C,
  };
  // The splash pool (a pond, as far as the dog's concerned: you can swim in it).
  const pw = W(P.pool.x, P.pool.z);
  world.water.push({ kind: 'pond', x: pw.x, z: pw.z, rx: P.pool.rx - 0.15, rz: P.pool.rz - 0.15, surface: P.pool.surface });
  const water = add(dyn, new THREE.CircleGeometry(1, 40), 0x8fd8e0, [P.pool.x, P.pool.surface, P.pool.z], { rot: [-Math.PI / 2, 0, 0], scale: [P.pool.rx - 0.02, P.pool.rz - 0.02, 1], cast: false, opts: { transparent: true, opacity: 0.72 } });
  return { scene, world, dyn, sky, uniforms, wake: wk, islands, water };
}
