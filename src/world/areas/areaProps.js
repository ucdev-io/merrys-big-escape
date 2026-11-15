import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { PALETTE } from '../../render/palette.js';
import { mesh, blobGeometry } from '../props.js';

// Things every area can use: lanes and paths as ribbons on the ground, a post-and-rail fence with a field
// gate, and a fingerpost pointing the way. Built in an area's (u, v) frame: x = u, z = v.

/**
 * A flat ribbon along points [[u, v]…] (an open line: lanes, paths, streams), `width` wide at height y.
 * wobble: let the edges wander a little, like a path worn by feet. Optional vertex colours: colorAt(t, side) → THREE.Color.
 */
export function ribbon(pts, width, color, y = 0.05, { wobble = 0.12, seed = 0 } = {}) {
  const pos = [], idx = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const [pu, pv] = pts[Math.max(0, i - 1)], [nu, nv] = pts[Math.min(n - 1, i + 1)];
    let tu = nu - pu, tv = nv - pv;
    const l = Math.hypot(tu, tv) || 1;
    tu /= l; tv /= l;
    const w = (width / 2) * (1 + wobble * Math.sin(i * 0.71 + seed) + wobble * 0.5 * Math.sin(i * 0.23 + seed * 2.1));
    const [u, v] = pts[i];
    pos.push(u - tv * w, y, v + tu * w, u + tv * w, y, v - tu * w);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // (wound to face up)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // (Normals point up whichever way the line runs.)
  const nor = geo.attributes.normal;
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  const m = new THREE.Mesh(geo, paint(color));
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

/**
 * A post-and-rail fence along u at v, from u0 to u1, with a gap for a field gate at gateU (swung open into
 * the area). Jumpable with a huge jump, like the town's fences. C: area-frame colliders ({ box, circle }).
 * Returns the group; the gap between the gate posts is about 2 m.
 */
export function fenceWithGate(u0, u1, v, gateU, C, { gap = 2.24, color = PALETTE.wood, dark = PALETTE.woodDark } = {}) {
  const g = new THREE.Group();
  const post = new THREE.BoxGeometry(0.13, 1.15, 0.13), rail = new THREE.BoxGeometry(1, 0.11, 0.06);
  const runs = [[u0, gateU - gap / 2], [gateU + gap / 2, u1]];
  for (const [a, b] of runs) {
    const len = b - a;
    if (len < 0.4) continue;
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const u = a + (len * i) / n;
      mesh(post, dark, g, [u, 0.55, v], [0, 0, Math.sin(i * 1.7) * 0.03]).castShadow = true;
    }
    for (const y of [0.45, 0.88]) mesh(rail, color, g, [(a + b) / 2, y, v + 0.07], [0, 0, 0], [len, 1, 1]);
    C.box(a, v - 0.14, b, v + 0.14, 1.2, false);
  }
  // The gate: two stout posts, and the gate itself standing open (hinged on one post, swung right round).
  const gp = new THREE.CylinderGeometry(0.1, 0.12, 1.4, 10);
  for (const s of [-1, 1]) {
    mesh(gp, dark, g, [gateU + (s * gap) / 2, 0.7, v]);
    mesh(new THREE.SphereGeometry(0.11, 10, 6), dark, g, [gateU + (s * gap) / 2, 1.4, v], [0, 0, 0], [1, 0.5, 1]);
    C.circle(gateU + (s * gap) / 2, v, 0.13, 1.45, false);
  }
  const leaf = new THREE.Group();
  leaf.position.set(gateU + gap / 2 + 0.06, 0, v + 0.08);
  leaf.rotation.y = Math.PI / 2 + 0.12; // open, swung back out of the way (into the area, away from the gap)
  const L = gap - 0.2;
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(L, 0.08, 0.05), color, leaf, [-L / 2, 0.3 + i * 0.2, 0]);
  for (const x of [-0.05, -L + 0.05]) mesh(new THREE.BoxGeometry(0.09, 1.0, 0.07), color, leaf, [x, 0.7, 0]);
  const brace = mesh(new THREE.BoxGeometry(Math.hypot(L, 0.8), 0.07, 0.05), color, leaf, [-L / 2, 0.7, 0.01]);
  brace.rotation.z = Math.atan2(0.8, L);
  g.add(leaf);
  // (Open, it lies along v from the hinge: a thin wall you can jump.)
  const ang = leaf.rotation.y, hx = leaf.position.x, hz = leaf.position.z;
  const ex = hx + Math.cos(ang) * -L, ez = hz - Math.sin(ang) * -L;
  C.box(Math.min(hx, ex) - 0.06, Math.min(hz, ez), Math.max(hx, ex) + 0.06, Math.max(hz, ez), 1.15, false);
  return g;
}

/** A wooden fingerpost at (u, v): its arm points along `ang` (radians, in the area's frame), with a little painted tree on it. */
export function fingerpost(u, v, ang, C, emoji = 'tree') {
  const g = new THREE.Group();
  g.position.set(u, 0, v);
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.9, 8), PALETTE.woodDark, g, [0, 0.95, 0]);
  mesh(new THREE.ConeGeometry(0.08, 0.1, 8), PALETTE.woodDark, g, [0, 1.95, 0]);
  const arm = new THREE.Group();
  arm.position.y = 1.55;
  arm.rotation.y = ang;
  g.add(arm);
  // The arm: a board with a pointed end.
  const shape = new THREE.Shape();
  shape.moveTo(-0.08, -0.12); shape.lineTo(0.62, -0.12); shape.lineTo(0.76, 0); shape.lineTo(0.62, 0.12); shape.lineTo(-0.08, 0.12); shape.lineTo(-0.08, -0.12);
  const board = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  board.translate(0, 0, -0.02);
  board.rotateY(-Math.PI / 2); // (points along +z of the arm)
  mesh(board, PALETTE.wood, arm);
  // A little tree painted on each side.
  if (emoji === 'tree') for (const s of [-1, 1]) {
    mesh(blobGeometry(3, 0.15, 1), PALETTE.leafDark, arm, [s * 0.026, 0.02, 0.36], [0, 0, 0], [0.012, 0.075, 0.07]);
    mesh(new THREE.BoxGeometry(0.01, 0.07, 0.02), PALETTE.bark, arm, [s * 0.026, -0.065, 0.36]);
  }
  C?.circle(u, v, 0.12, 2.0, false);
  return g;
}

/** A shared material for things in an area that should look wet (mud, puddles). */
export const wet = (color) => paint(color);
