import * as THREE from 'three';
import { Person } from '../../../entities/person.js';
import { mesh } from '../../../world/props.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { bakeParts } from '../../../entities/treats.js';

// The grown-ups guarding the goodies, dressed for the job. Each is a Person (entities/person.js) with
// a hat and an apron, then baked down to a handful of meshes (one per moving part) for phones.
const SPHERE = new THREE.SphereGeometry(1, 14, 10);

/** Rosy cheeks: everyone's a bit flushed from working hard. */
function cheeks(p) { for (const s of [-1, 1]) mesh(SPHERE, 0xf0a8a0, p.head, [s * 0.075, -0.035, 0.095], [0, 0, 0], [0.026, 0.018, 0.012]); }

/** An apron hanging from the chest to the knees (stripes: [colour, x] down the front). */
function apron(p, color, stripes = []) {
  mesh(new THREE.CapsuleGeometry(0.15, 0.5, 6, 12), color, p.body, [0, 0.98, 0.115], [0, 0, 0], [1, 1, 0.14]);
  for (const [c, x] of stripes) mesh(new THREE.CapsuleGeometry(0.018, 0.56, 4, 8), c, p.body, [x, 0.98, 0.14], [0, 0, 0], [1, 1, 0.3]);
  mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24, Math.PI), color, p.body, [0, 1.06, 0.0], [Math.PI / 2, 0, Math.PI], [1, 0.8, 1]); // the tie round the back
}

/**
 * Merge each moving part's meshes (legs, arms, head, body) into one vertex-coloured mesh: a person
 * becomes ~6 draw calls instead of ~20, and still walks, waves and turns their head.
 */
export function bakePerson(p) {
  for (const g of [...p.legs, ...p.arms, p.head, p.body]) {
    const parts = g.children.filter((o) => o.isMesh);
    if (parts.length < 2) continue;
    const geo = bakeParts(parts.map((m) => [m.geometry, m.material.color.getHex(), m.position.toArray(), [m.rotation.x, m.rotation.y, m.rotation.z], m.scale.toArray()]));
    for (const m of parts) g.remove(m);
    const merged = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true }));
    merged.castShadow = true;
    g.add(merged);
  }
  return p;
}

/** The baker: whites, a pink apron and a tall puffy chef's hat. */
export function baker() {
  const p = new Person({ shirt: 0xf6f1e6, trousers: 0x6d7385, hair: 0x6b4a32 });
  apron(p, 0xf2b8c0);
  mesh(new THREE.CylinderGeometry(0.125, 0.13, 0.1, 18), 0xfbf8f2, p.head, [0, 0.11, -0.005]);
  for (const [x, y, z, r] of [[0, 0.25, 0, 0.1], [-0.07, 0.22, 0.02, 0.075], [0.07, 0.22, 0.02, 0.075], [0, 0.22, -0.07, 0.075], [0, 0.21, 0.07, 0.07]]) mesh(SPHERE, 0xfbf8f2, p.head, [x, y, z], [0, 0, 0], [r, r * 0.9, r]);
  cheeks(p);
  return bakePerson(p);
}

/** The butcher: a straw boater, a blue-and-white striped apron and a fine moustache. */
export function butcher() {
  const p = new Person({ shirt: 0xf6f1e6, trousers: 0x3a3a44, hair: 0x2a2224 });
  apron(p, 0xf4f1ea, [[0x5b86c4, -0.1], [0x5b86c4, -0.035], [0x5b86c4, 0.035], [0x5b86c4, 0.1]]);
  mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.014, 22), 0xe8d29a, p.head, [0, 0.1, 0]);
  mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.085, 20), 0xe8d29a, p.head, [0, 0.145, 0]);
  mesh(new THREE.CylinderGeometry(0.127, 0.127, 0.03, 20, 1, true), 0x2f3a62, p.head, [0, 0.125, 0]);
  for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.014, 0.05, 4, 8), 0x2a2224, p.head, [s * 0.03, -0.042, 0.125], [0, 0, s * 1.2]);
  cheeks(p);
  return bakePerson(p);
}

/** The BBQ cook: a stripy apron, a little chef's hat and a spatula. */
export function cook() {
  const p = new Person({ shirt: 0x6f9a52, trousers: 0x5b6f8a });
  apron(p, 0xd9534f, [[0xfbf6ee, -0.08], [0xfbf6ee, 0.0], [0xfbf6ee, 0.08]]);
  mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.08, 18), 0xfbf8f2, p.head, [0, 0.11, -0.005]);
  for (const [x, z] of [[0, 0], [-0.05, 0.03], [0.05, 0.03], [0, -0.05]]) mesh(SPHERE, 0xfbf8f2, p.head, [x, 0.18, z], [0, 0, 0], [0.07, 0.055, 0.07]);
  mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), 0x7a5a42, p.arms[0], [0, -0.62, 0.05], [0.6, 0, 0]);   // spatula handle
  mesh(new THREE.BoxGeometry(0.09, 0.012, 0.11), 0x9aa0a8, p.arms[0], [0, -0.7, 0.14], [0.6, 0, 0]);  // and its flipper
  cheeks(p);
  return bakePerson(p);
}

const GUEST_SHIRTS = [0xf2a0b4, 0x5b86c4, 0xe39a52, 0x8e6fb0, 0x4aa3a0];
/** A party guest with a drink (and, sometimes, a paper party hat). */
export function guest(i) {
  const p = new Person({ shirt: GUEST_SHIRTS[i % GUEST_SHIRTS.length], trousers: [0x4a4a52, 0x7a6248, 0x5b6f8a][i % 3] });
  mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 12), [0xf6d06a, 0xd9534f, 0x9fc6e8][i % 3], p.arms[1], [0, -0.6, 0.05]); // a drink
  if (i % 2 === 0) mesh(new THREE.ConeGeometry(0.07, 0.2, 14), 0xf6d06a, p.head, [0.02, 0.2, 0], [0, 0, -0.15]);
  cheeks(p);
  return bakePerson(p);
}
