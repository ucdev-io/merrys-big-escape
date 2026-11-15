import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bake, SPHERE } from '../../entities/shapes.js';
import { paint } from '../../render/watercolorMaterial.js';

// Models for the seasons' things to do: baked into single geometries (vertex colours), so a whole
// set of them (every snowman, every pumpkin…) can be one instanced mesh — one draw call.

const CYL = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);
const CONE = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);
const RB = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, r);
const TUBE = (pts, r, n = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), n, r, 6, false);
export const SNOW = 0xf6f8fc;

/** One instanced mesh of a baked geometry (vertex colours), n of them, all hidden to start. */
export function instanced(geo, n, { mat = paint(0xffffff, { vertexColors: true }), shadow = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  m.count = n;
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.frustumCulled = false;
  const z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < n; i++) m.setMatrixAt(i, z);
  return m;
}

// ---------- ❄️ winter ----------

/** A snowball (unit radius, lumpy enough to look hand-rolled). */
export function snowballGeometry() {
  const g = new THREE.SphereGeometry(1, 22, 16);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + Math.sin(v.x * 7 + v.y * 3) * 0.025 + Math.cos(v.z * 6 - v.y * 4) * 0.02);
    p.setXYZ(i, v.x, v.y * 0.94, v.z);
  }
  g.computeVertexNormals();
  return bake([[g, SNOW]]);
}

/** A snowman's face, buttons, arms, scarf and hat (sized for the stack in SNOWMAN below). scarf/hat: colours. */
export function snowmanDressing(scarf = 0xd9534f, hat = 0x2f3a52) {
  const head = SNOWMAN.head, mid = SNOWMAN.mid;
  const hy = head.y, hr = head.r, my = mid.y, mr = mid.r;
  const parts = [
    [CONE(0.035, 0.2, 10), 0xe8822e, [0, hy, hr + 0.07], [Math.PI / 2, 0, 0]],                        // carrot nose
    [SPHERE, 0x2b2522, [-0.06, hy + 0.06, hr * 0.9], [0, 0, 0], [0.022, 0.022, 0.022]],                 // coal eyes
    [SPHERE, 0x2b2522, [0.06, hy + 0.06, hr * 0.9], [0, 0, 0], [0.022, 0.022, 0.022]],
    ...[-0.05, -0.02, 0.01, 0.04, 0.07].map((x, i) => [SPHERE, 0x2b2522, [x * 1.1, hy - 0.07 - Math.abs(x) * 0.5 + (i === 2 ? -0.01 : 0), hr * 0.92], [0, 0, 0], [0.012, 0.012, 0.012]]), // a smile
    ...[0.08, -0.02, -0.12].map((y) => [SPHERE, 0x2b2522, [0, my + y, mr * 0.97], [0, 0, 0], [0.024, 0.024, 0.02]]), // buttons
    [TUBE([[-mr * 0.9, my + 0.05, 0], [-mr - 0.22, my + 0.18, 0.02], [-mr - 0.38, my + 0.3, 0]], 0.014), 0x7a5232], // stick arms
    [TUBE([[-mr - 0.24, my + 0.2, 0.01], [-mr - 0.3, my + 0.3, 0.04]], 0.009, 4), 0x7a5232],
    [TUBE([[mr * 0.9, my + 0.05, 0], [mr + 0.2, my + 0.2, 0.03], [mr + 0.34, my + 0.36, 0]], 0.014), 0x7a5232],
    [new THREE.TorusGeometry(hr * 0.86, 0.045, 8, 26), scarf, [0, hy - hr * 0.62, 0], [Math.PI / 2, 0, 0], [1, 1, 0.8]], // scarf
    [RB(0.09, 0.26, 0.03, 0.012), scarf, [0.1, hy - hr * 0.95, hr * 0.7], [0.15, 0, 0.25]],
    [CYL(hr * 0.72, hr * 0.78, 0.04, 20), hat, [0, hy + hr * 0.82, 0], [0.08, 0, 0.1]],                  // hat brim
    [CYL(hr * 0.52, hr * 0.56, 0.24, 20), hat, [0.01, hy + hr * 0.82 + 0.13, 0.01], [0.08, 0, 0.1]],    // top hat
    [CYL(hr * 0.565, hr * 0.565, 0.05, 20), scarf, [0.008, hy + hr * 0.82 + 0.05, 0.008], [0.08, 0, 0.1]],
  ];
  return bake(parts);
}

/** Where a snowman's three snowballs go (bottom up): y = centre height, r = radius. */
export const SNOWMAN = { base: { y: 0.3, r: 0.38 }, mid: { y: 0.82, r: 0.27 }, head: { y: 1.2, r: 0.19 } };

/** A little heap of snow: where a snowman can be built. */
export function moundGeometry() {
  const g = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  return bake([[g, SNOW, [0, 0, 0], [0, 0, 0], [0.42, 0.14, 0.36]]]);
}

/** A wooden sledge with red runners and a rope to pull it by. Front: +z. */
export function sledgeGeometry() {
  const parts = [];
  for (const x of [-0.2, 0.2]) {
    parts.push([TUBE([[x, 0.02, -0.5], [x, 0.0, -0.1], [x, 0.0, 0.3], [x, 0.06, 0.52], [x, 0.17, 0.56]], 0.02, 20), 0xc0392b]);
    for (const z of [-0.36, 0.0, 0.32]) parts.push([CYL(0.016, 0.016, 0.13, 6), 0x9b2d22, [x, 0.08, z]]);
  }
  for (let i = 0; i < 6; i++) parts.push([RB(0.54, 0.035, 0.12, 0.012), i % 2 ? 0xc79b6d : 0xb88a5c, [0, 0.16, -0.38 + i * 0.15]]);
  parts.push([TUBE([[-0.2, 0.17, 0.54], [-0.08, 0.2, 0.75], [0.08, 0.2, 0.75], [0.2, 0.17, 0.54]], 0.008, 12), 0xe8dcc0]);
  return bake(parts);
}

/** Cones of a Christmas tree (dark, with a little snow-white tip on each tier), its trunk and its star. */
export function christmasTree() {
  const parts = [[CYL(0.16, 0.22, 0.7, 10), 0x7a5232, [0, 0.35, 0]]];
  [[1.55, 1.5, 0.75], [1.2, 1.35, 1.65], [0.85, 1.15, 2.45], [0.5, 0.95, 3.15]].forEach(([r, h, y], i) => parts.push([CONE(r, h, 14), i % 2 ? 0x2f5a3c : 0x35643f, [0, y + h / 2 - 0.1, 0]]));
  return bake(parts);
}

/** The star on top of the tree (it glows). */
export function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.1 : 0.24; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
  g.translate(0, 0, -0.03);
  return g;
}

/** A wrapped present with a ribbon and bow (unit-ish: ~0.3 m). */
export function presentGeometry(paper = 0xd9534f, ribbon = 0xf6d06a, [w, h, d] = [0.3, 0.24, 0.26]) {
  return bake([
    [RB(w, h, d, 0.02), paper, [0, h / 2, 0]],
    [RB(w + 0.008, h + 0.008, 0.04, 0.008), ribbon, [0, h / 2, 0]],
    [RB(0.04, h + 0.008, d + 0.008, 0.008), ribbon, [0, h / 2, 0]],
    [new THREE.TorusGeometry(0.045, 0.014, 6, 14), ribbon, [-0.035, h + 0.03, 0], [0, 0, 0.6]],
    [new THREE.TorusGeometry(0.045, 0.014, 6, 14), ribbon, [0.035, h + 0.03, 0], [0, 0, -0.6]],
  ]);
}

/** A mallard on ice skates, with a woolly scarf (they're very good at it). Faces +z. */
export function skatingDuck(scarf = 0xd9534f) {
  return bake([
    [SPHERE, 0xa8876a, [0, 0.13, 0], [0, 0, 0], [0.14, 0.1, 0.2]],
    [CONE(0.065, 0.13, 10), 0xa8876a, [0, 0.18, -0.19], [-1.1, 0, 0], [1, 1, 0.5]],
    [SPHERE, 0x86684e, [-0.12, 0.15, 0], [0, 0, 0], [0.03, 0.06, 0.14]],
    [SPHERE, 0x86684e, [0.12, 0.15, 0], [0, 0, 0], [0.03, 0.06, 0.14]],
    [CYL(0.04, 0.055, 0.1, 10), 0x2f7a52, [0, 0.22, 0.12], [0.3, 0, 0]],
    [SPHERE, 0x2f7a52, [0, 0.29, 0.14], [0, 0, 0], [0.068, 0.068, 0.072]],
    [SPHERE, 0xe8c040, [0, 0.28, 0.24], [0, 0, 0], [0.04, 0.015, 0.055]],
    [SPHERE, 0x241a17, [-0.045, 0.31, 0.19], [0, 0, 0], [0.01, 0.012, 0.01]],
    [SPHERE, 0x241a17, [0.045, 0.31, 0.19], [0, 0, 0], [0.01, 0.012, 0.01]],
    [new THREE.TorusGeometry(0.05, 0.016, 6, 18), scarf, [0, 0.215, 0.115], [Math.PI / 2 + 0.3, 0, 0]],
    [RB(0.035, 0.12, 0.012, 0.005), scarf, [0.03, 0.17, 0.05], [0.4, 0, 0.3]],
    [RB(0.02, 0.01, 0.12, 0.004), 0xc9ced6, [-0.05, 0.005, 0.02]], // skate blades
    [RB(0.02, 0.01, 0.12, 0.004), 0xc9ced6, [0.05, 0.005, 0.02]],
    [SPHERE, 0xe8c040, [-0.05, 0.025, 0.03], [0, 0, 0], [0.035, 0.012, 0.05]],
    [SPHERE, 0xe8c040, [0.05, 0.025, 0.03], [0, 0, 0], [0.035, 0.012, 0.05]],
  ]);
}

/**
 * Ice over an ellipse (rx × rz), top at y = top: pale blue in the middle, snowy at the edges, with a few
 * skate-scratched streaks. A polar grid, so the colours can vary across it.
 */
export function iceGeometry(rx, rz, top, { rings = 12, segs = 64 } = {}) {
  const pos = [], col = [], idx = [], c = new THREE.Color(), ice = new THREE.Color(0xa6cbe2), deep = new THREE.Color(0x82b0d2), snow = new THREE.Color(SNOW);
  for (let i = 0; i <= rings; i++) {
    const r = i / rings;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * r * rx, z = Math.sin(a) * r * rz;
      pos.push(x, top, z);
      const streak = Math.max(0, Math.sin(x * 1.7 + z * 0.6) * Math.sin(z * 2.3 - x * 0.4)) ** 6;
      c.copy(deep).lerp(ice, Math.min(1, r * 1.3)).lerp(snow, Math.min(1, Math.max(0, (r - 0.84) / 0.16) ** 1.5 * 0.9 + streak * 0.5));
      col.push(c.r, c.g, c.b);
      if (i < rings && j < segs) { const k = i * (segs + 1) + j, n = k + segs + 1; idx.push(k, k + 1, n, k + 1, n + 1, n); } // (facing up)
    }
  }
  // A little edge down to the shore, so it reads as a slab of ice.
  const base = pos.length / 3;
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    for (const [y, k] of [[top, 1], [top - 0.05, 1.02]]) { pos.push(Math.cos(a) * rx * k, y, Math.sin(a) * rz * k); col.push(snow.r, snow.g, snow.b); }
    if (j < segs) { const k = base + j * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } // (facing out)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- 🍂 autumn ----------

const AUTUMN = [0xd9893c, 0xc0632d, 0xe0b04a, 0xb5482a, 0x9a6a3a, 0xe3a23f];

/** A heap of fallen leaves (about a metre across). */
export function leafPileGeometry(seed = 1) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts = [];
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.5, h = Math.max(0, 0.32 * (1 - (d / 0.5) ** 1.6));
    parts.push([SPHERE, AUTUMN[i % AUTUMN.length], [Math.cos(a) * d, h * (0.6 + r() * 0.5) + 0.02, Math.sin(a) * d], [r() * 1.2 - 0.6, r() * 6, r() * 1.2 - 0.6], [0.09, 0.016, 0.055]]);
  }
  parts.push([SPHERE, 0xb8743a, [0, 0.06, 0], [0, 0, 0], [0.42, 0.13, 0.38]]); // (the heap under them)
  return bake(parts);
}

/** A shiny conker (with its pale spot). */
export function conkerGeometry() {
  return bake([[SPHERE, 0x6b3417, [0, 0.035, 0], [0, 0, 0], [0.04, 0.035, 0.038]], [SPHERE, 0xc9a57a, [0, 0.062, 0.006], [0, 0, 0], [0.018, 0.006, 0.016]]]);
}

/** A spiky conker case, split open. */
export function conkerCaseGeometry() {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push([new THREE.SphereGeometry(1, 12, 8, 0, Math.PI), 0x8fae4a, [s * 0.03, 0.03, 0], [0, s > 0 ? 0 : Math.PI, 0.6 * s], [0.05, 0.045, 0.05]]);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; parts.push([CONE(0.006, 0.03, 4), 0x9ab85a, [s * 0.05 + Math.cos(a) * 0.02 * s, 0.04 + Math.sin(a) * 0.03, Math.sin(a * 1.7) * 0.03], [Math.sin(a) * 0.8, 0, s * 1.2]]); }
  }
  return bake(parts);
}

/** A carved pumpkin: ribbed and orange, with a stalk. (The glowing face is separate: pumpkinFace.) */
export function pumpkinGeometry() {
  const g = new THREE.SphereGeometry(1, 24, 14), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), rib = 1 - 0.07 * Math.abs(Math.sin(a * 4));
    p.setXYZ(i, v.x * rib, v.y * 0.72, v.z * rib);
  }
  g.computeVertexNormals();
  return bake([[g, 0xe07b28, [0, 0.17, 0], [0, 0, 0], [0.22, 0.22, 0.22]], [CYL(0.02, 0.028, 0.09, 8), 0x5f7a32, [0.01, 0.34, 0], [0, 0, 0.2]]]);
}

/** The pumpkin's face (eyes and a toothy grin), to glow from inside. */
export function pumpkinFace() {
  const tri = (cx, cy, s, up = 1) => { const t = new THREE.Shape(); t.moveTo(cx - s, cy - s * 0.6 * up); t.lineTo(cx + s, cy - s * 0.6 * up); t.lineTo(cx, cy + s * 0.8 * up); t.closePath(); return t; };
  const mouth = new THREE.Shape();
  mouth.moveTo(-0.1, 0.1); mouth.quadraticCurveTo(0, 0.02, 0.1, 0.1); mouth.lineTo(0.06, 0.07); mouth.lineTo(0.03, 0.09); mouth.lineTo(0, 0.06); mouth.lineTo(-0.03, 0.09); mouth.lineTo(-0.06, 0.07); mouth.closePath();
  const g = new THREE.ShapeGeometry([tri(-0.065, 0.2, 0.035), tri(0.065, 0.2, 0.035), tri(0, 0.155, 0.018), mouth]);
  g.translate(0, 0, 0.214);
  return g;
}

// ---------- 🌸 spring ----------

/** A painted egg (pastel, with a stripe). */
export function eggGeometry(shell = 0xf6c3d3, stripe = 0xb69be0) {
  const g = new THREE.SphereGeometry(1, 14, 12), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setXYZ(i, v.x * (1 - v.y * 0.12), v.y * 1.3, v.z * (1 - v.y * 0.12)); }
  g.computeVertexNormals();
  return bake([{ geo: g, color: shell, pos: [0, 0.06, 0], scale: [0.045, 0.045, 0.045], colors: (i, q) => (Math.abs(q.y - 0.06) < 0.008 ? stripe : Math.abs(q.y - 0.075) < 0.004 ? 0xffffff : shell) }]);
}

/** A mother duck and a duckling for the pond's spring parade. */
export function paradeDuck(baby = false) {
  const s = baby ? 0.42 : 0.9, body = baby ? 0xf6d65a : 0xa8876a, head = baby ? 0xf6d65a : 0x2f7a52;
  return bake([
    [SPHERE, body, [0, 0.12 * s, 0], [0, 0, 0], [0.15 * s, 0.1 * s, 0.22 * s]],
    [CONE(0.07 * s, 0.14 * s, 10), body, [0, 0.17 * s, -0.2 * s], [-1.1, 0, 0], [1, 1, 0.5]],
    [SPHERE, head, [0, 0.3 * s, 0.15 * s], [0, 0, 0], [0.075 * s, 0.075 * s, 0.08 * s]],
    [SPHERE, baby ? 0xf0a040 : 0xe8c040, [0, 0.285 * s, 0.25 * s], [0, 0, 0], [0.045 * s, 0.017 * s, 0.06 * s]],
    [SPHERE, 0x241a17, [-0.05 * s, 0.32 * s, 0.2 * s], [0, 0, 0], [0.011 * s, 0.013 * s, 0.01 * s]],
    [SPHERE, 0x241a17, [0.05 * s, 0.32 * s, 0.2 * s], [0, 0, 0], [0.011 * s, 0.013 * s, 0.01 * s]],
  ]);
}

// ---------- ☀️ summer ----------

/** A garden paddling pool (static parts: rims, water, a ball), baked. r: inner radius. */
export function paddlingPoolGeometry(rim = 0x6fa6d6) {
  return bake([
    [new THREE.TorusGeometry(1.0, 0.16, 12, 36), rim, [0, 0.16, 0], [Math.PI / 2, 0, 0]],
    [new THREE.TorusGeometry(1.0, 0.1, 10, 36), 0xf2f0e6, [0, 0.38, 0], [Math.PI / 2, 0, 0]],
    [new THREE.CircleGeometry(1.0, 36), 0x8fc4d8, [0, 0.26, 0], [-Math.PI / 2, 0, 0]],
    [SPHERE, 0xf6d06a, [0.4, 0.3, -0.25], [0, 0, 0], [0.13, 0.13, 0.13]],
  ]);
}
