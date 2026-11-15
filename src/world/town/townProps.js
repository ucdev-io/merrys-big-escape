import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mesh, blobGeometry } from '../props.js';
import { paint } from '../../render/watercolorMaterial.js';

// Street furniture & district props. All face +Z unless rotated; all built at the origin of a group.
const G = (x = 0, z = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; return g; };
const RB = (w, h, d, r = 0.04, s = 1) => new RoundedBoxGeometry(w, h, d, s, r);

export const HOUSE_WALLS = [0xf0dcc0, 0xe9d3c0, 0xdfe3cf, 0xf1e1c7, 0xd8e2e8, 0xf2d4d0, 0xe8dcb0];
export const HOUSE_ROOFS = [0x9d6a73, 0x7d8fa8, 0xb87a5e, 0x8a9a6e, 0x6e7f99, 0xa6766b];
export const DOORS = [0x6c8fb0, 0xd9534f, 0x6f9a52, 0xe0b04a, 0x8e6fb0];

export function bench(x, z, ry) {
  const g = G(x, z, ry);
  for (let i = 0; i < 3; i++) mesh(RB(1.6, 0.05, 0.14), 0xc79b6d, g, [0, 0.45, -0.18 + i * 0.17]);
  for (let i = 0; i < 2; i++) mesh(RB(1.6, 0.12, 0.04), 0xc79b6d, g, [0, 0.62 + i * 0.16, -0.3], [-0.15, 0, 0]);
  for (const sx of [-0.7, 0.7]) mesh(RB(0.06, 0.45, 0.5), 0x4a4a52, g, [sx, 0.22, -0.05]);
  return g;
}

export function lamppost(x, z) {
  const g = G(x, z);
  mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.2, 8), 0x3f4a55, g, [0, 1.6, 0]);
  mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.3, 8), 0x3f4a55, g, [0, 3.25, 0]);
  mesh(new THREE.SphereGeometry(0.13, 12, 8), 0xfff2c8, g, [0, 3.05, 0], [0, 0, 0], [1, 0.9, 1]);
  return g;
}

export function wheelieBin(x, z, ry, color = 0x5d8c55) {
  const g = G(x, z, ry);
  mesh(RB(0.55, 0.95, 0.6, 0.06), color, g, [0, 0.5, 0]);
  mesh(RB(0.6, 0.06, 0.66, 0.03), color, g, [0, 1.0, 0], [-0.05, 0, 0]);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), 0x2b2b2b, g, [s * 0.25, 0.09, -0.25], [0, 0, Math.PI / 2]);
  return g;
}

export function crate(x, z, ry, s = 1) {
  const g = G(x, z, ry);
  mesh(RB(0.6 * s, 0.5 * s, 0.6 * s, 0.03), 0xc79b6d, g, [0, 0.25 * s, 0]);
  for (const y of [0.12, 0.38]) mesh(new THREE.BoxGeometry(0.62 * s, 0.05 * s, 0.62 * s), 0x9b7452, g, [0, y * s, 0]);
  return g;
}

export function cardboardBox(x, z, ry) {
  const g = G(x, z, ry);
  mesh(RB(0.5, 0.35, 0.4, 0.02), 0xc9a26a, g, [0, 0.175, 0]);
  mesh(new THREE.PlaneGeometry(0.5, 0.2), 0xc9a26a, g, [0, 0.4, 0.22], [0.6, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
  return g;
}

export function puddle(x, z, s = 1) {
  const g = G(x, z);
  const m = mesh(blobGeometry(7, 0.2, 2), 0x9fbfd0, g, [0, 0.03, 0], [0, s * 3, 0], [0.8 * s, 0.01, 0.5 * s]);
  m.castShadow = false;
  return g;
}

export function birdbath(x, z) {
  const g = G(x, z);
  mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.8, 12), 0xd8d2c4, g, [0, 0.4, 0]);
  mesh(new THREE.CylinderGeometry(0.35, 0.15, 0.12, 16), 0xd8d2c4, g, [0, 0.85, 0]);
  mesh(new THREE.CircleGeometry(0.3, 16), 0x8fc4d8, g, [0, 0.915, 0], [-Math.PI / 2, 0, 0]);
  return g;
}

export function mailbox(x, z, ry, color = 0xd9534f) {
  const g = G(x, z, ry);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), 0x7a5a42, g, [0, 0.45, 0]);
  mesh(RB(0.25, 0.25, 0.45, 0.1), color, g, [0, 1.0, 0]);
  mesh(RB(0.03, 0.15, 0.06, 0.01), 0xf6d06a, g, [0.14, 1.12, -0.1]);
  return g;
}

export function kennel(x, z, ry) {
  const g = G(x, z, ry);
  mesh(RB(0.9, 0.7, 1.0, 0.05), 0xd28e72, g, [0, 0.35, 0]);
  const roof = new THREE.Shape();
  roof.moveTo(-0.55, 0); roof.lineTo(0, 0.4); roof.lineTo(0.55, 0); roof.lineTo(-0.55, 0);
  const geo = new THREE.ExtrudeGeometry(roof, { depth: 1.1, bevelEnabled: false });
  geo.translate(0, 0, -0.55);
  mesh(geo, 0x9d6a73, g, [0, 0.7, 0]);
  const door = mesh(new THREE.CircleGeometry(0.22, 16), 0x3a2a22, g, [0, 0.3, 0.505]);
  door.castShadow = false;
  return g;
}

export function swingSet(x, z, ry) {
  const g = G(x, z, ry);
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), 0xd9534f, g, [s * 1.3, 1.1, 0.35], [-0.3, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), 0xd9534f, g, [s * 1.3, 1.1, -0.35], [0.3, 0, 0]);
  }
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), 0xd9534f, g, [0, 2.2, 0], [0, 0, Math.PI / 2]);
  for (const s of [-0.5, 0.5]) {
    for (const r of [-0.15, 0.15]) mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), 0x555555, g, [s + r, 1.4, 0]);
    mesh(RB(0.4, 0.05, 0.2, 0.02), 0x5b86c4, g, [s, 0.6, 0]);
  }
  return g;
}

export function slide(x, z, ry) {
  const g = G(x, z, ry);
  mesh(RB(0.9, 0.08, 0.9), 0xf6d06a, g, [0, 1.5, -1.0]);
  for (const sx of [-0.4, 0.4]) for (const sz of [-1.4, -0.6]) mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), 0x5b86c4, g, [sx, 0.75, sz]);
  mesh(RB(0.7, 0.06, 2.2, 0.03), 0xd9534f, g, [0, 0.8, 0.4], [0.6, 0, 0]);
  for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), 0x5b86c4, g, [0, 0.25 + i * 0.28, -1.5], [0, 0, Math.PI / 2]);
  return g;
}

export function lawnmower(x, z, ry) {
  const g = G(x, z, ry);
  mesh(RB(0.6, 0.25, 0.7, 0.08), 0xd9534f, g, [0, 0.25, 0]);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 10), 0x3a3a3a, g, [0, 0.42, -0.1]);
  for (const sx of [-0.33, 0.33]) for (const sz of [-0.28, 0.28]) mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), 0x2b2b2b, g, [sx, 0.1, sz], [0, 0, Math.PI / 2]);
  const h = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.25, 0.3, -0.3), new THREE.Vector3(-0.25, 0.9, -0.8), new THREE.Vector3(0.25, 0.9, -0.8), new THREE.Vector3(0.25, 0.3, -0.3)]);
  mesh(new THREE.TubeGeometry(h, 16, 0.02, 6, false), 0x3a3a3a, g);
  return g;
}

export function bbq(x, z, ry) {
  const g = G(x, z, ry);
  mesh(new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x2f2f33, g, [0, 0.85, 0]);
  mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16), 0x777777, g, [0, 0.86, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), 0x2f2f33, g, [Math.cos(a) * 0.25, 0.4, Math.sin(a) * 0.25], [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2]);
  }
  // a string of sausages!
  for (let i = 0; i < 5; i++) mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), 0xb8604a, g, [-0.2 + i * 0.1, 0.9, 0], [Math.PI / 2, 0, 0]);
  return g;
}

export function cafeTable(x, z, color = 0xf2a0b4) {
  const g = G(x, z);
  mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), 0xf1e8d8, g, [0, 0.72, 0]);
  mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.72, 8), 0x4a4a52, g, [0, 0.36, 0]);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), 0x4a4a52, g, [0, 1.3, 0]);
  mesh(new THREE.ConeGeometry(0.9, 0.35, 8, 1, true), color, g, [0, 2.05, 0], [0, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + 0.4;
    mesh(RB(0.36, 0.05, 0.36), 0xc79b6d, g, [Math.cos(a) * 0.65, 0.45, Math.sin(a) * 0.65]);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), 0x4a4a52, g, [Math.cos(a) * 0.65, 0.22, Math.sin(a) * 0.65]);
  }
  return g;
}

/** A little high-street shop with a striped awning and sign. Front faces +Z. */
export function shop(x, z, ry, rng, { w = 6, d = 6, h = 4, wall, awning, sign } = {}) {
  const g = G(x, z, ry);
  g.userData.occluder = true;
  wall ??= rng.pick(HOUSE_WALLS);
  awning ??= rng.pick([0xd9534f, 0x5b86c4, 0x6f9a52, 0xe0b04a, 0x8e6fb0]);
  mesh(RB(w, h, d, 0.1, 3), wall, g, [0, h / 2, 0]);
  mesh(RB(w + 0.3, 0.3, d + 0.3, 0.08), 0xb8a990, g, [0, h + 0.1, 0]);
  // shop window + door
  mesh(RB(w * 0.55, 1.6, 0.1, 0.04), 0xfff8e8, g, [-w * 0.15, 1.3, d / 2 + 0.02]);
  mesh(RB(w * 0.5, 1.45, 0.06, 0.03), 0x9ab8cf, g, [-w * 0.15, 1.3, d / 2 + 0.06]);
  mesh(RB(1.0, 2.0, 0.1, 0.04), rng.pick(DOORS), g, [w * 0.3, 1.0, d / 2 + 0.03]);
  // striped awning
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const sw = (w - 0.4) / stripes;
    mesh(new THREE.BoxGeometry(sw, 0.05, 1.3), i % 2 ? 0xfff8e8 : awning, g, [-w / 2 + 0.2 + sw * (i + 0.5), 2.55, d / 2 + 0.6], [0.35, 0, 0]);
  }
  // sign board
  mesh(RB(w * 0.6, 0.6, 0.12, 0.05), sign ?? 0x3b2b25, g, [0, 3.35, d / 2 + 0.05]);
  mesh(RB(w * 0.5, 0.35, 0.05, 0.03), 0xf6efe0, g, [0, 3.35, d / 2 + 0.12]);
  return g;
}

export function brickBuilding(x, z, ry, w, d, h, color = 0xc88e74) {
  const g = G(x, z, ry);
  g.userData.occluder = true;
  mesh(RB(w, h, d, 0.08, 2), color, g, [0, h / 2, 0]);
  mesh(RB(w + 0.2, 0.25, d + 0.2, 0.06), 0x9d8a7a, g, [0, h, 0]);
  const cols = Math.max(1, Math.floor(w / 2.2));
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
    mesh(RB(0.8, 1.0, 0.08, 0.03), 0x9ab8cf, g, [-w / 2 + (c + 0.5) * (w / cols), 1.6 + r * 2.0, d / 2 + 0.03]);
  }
  mesh(RB(0.9, 1.9, 0.08, 0.03), 0x5a4a42, g, [w / 2 - 1, 0.95, d / 2 + 0.03]);
  return g;
}

export function car(x, z, ry, color) {
  const g = G(x, z, ry);
  mesh(RB(1.7, 0.6, 3.6, 0.25, 3), color, g, [0, 0.55, 0]);
  mesh(RB(1.5, 0.55, 2.0, 0.25, 3), color, g, [0, 1.05, -0.2]);
  for (const sz of [0.75, -1.15]) mesh(RB(1.38, 0.42, 0.06, 0.05), 0x9ab8cf, g, [0, 1.05, sz], [sz > 0 ? -0.3 : 0.3, 0, 0]);
  for (const sx of [-0.78, 0.78]) for (const sz of [-1.1, 1.1]) mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), 0x2b2b2b, g, [sx, 0.3, sz], [0, 0, Math.PI / 2]);
  for (const sx of [-0.55, 0.55]) mesh(new THREE.SphereGeometry(0.1, 8, 6), 0xfff2c8, g, [sx, 0.6, 1.8]);
  g.userData.occluder = true;
  return g;
}

/** A row of lumpy hedge blobs from a to b. */
export function hedge(x0, z0, x1, z1, rng, col, { height = 0.9, skipFrom = -1, skipTo = -1 } = {}) {
  const g = new THREE.Group();
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t > skipFrom && t < skipTo) continue;
    const s = rng.float(0.5, 0.65);
    mesh(blobGeometry(rng.int(0, 30), 0.25, 1), rng.pick([0x6f9a52, 0x5d8c55, 0x7fae64]), g,
      [x0 + (x1 - x0) * t, height * 0.55, z0 + (z1 - z0) * t], [rng.float(0, 3), rng.float(0, 3), 0], [s, height * 0.65, s]);
  }
  if (col) {
    const pad = 0.45;
    if (skipFrom < 0) col.box(Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad);
    else {
      const lerp = (t) => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
      const [ax, az] = lerp(skipFrom), [bx, bz] = lerp(skipTo);
      col.box(Math.min(x0, ax) - pad, Math.min(z0, az) - pad, Math.max(x0, ax) + pad, Math.max(z0, az) + pad);
      col.box(Math.min(bx, x1) - pad, Math.min(bz, z1) - pad, Math.max(bx, x1) + pad, Math.max(bz, z1) + pad);
    }
  }
  return g;
}

/** Flat ribbon path following points (for park paths). */
export function pathRibbon(points, width, color) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
  const segs = 120, pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const p = curve.getPointAt(i / segs), t = curve.getTangentAt(i / segs);
    const nx = -t.z, nz = t.x;
    const w = width * (0.9 + 0.2 * Math.sin(i * 0.7));
    pos.push(p.x + nx * w / 2, 0.055, p.z + nz * w / 2, p.x - nx * w / 2, 0.055, p.z - nz * w / 2);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, paint(color, { side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}
