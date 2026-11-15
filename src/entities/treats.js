import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../render/watercolorMaterial.js';

/*
 * Tasty things to pinch (heists): croissants, iced buns, sausages and burgers. Each is baked into one
 * geometry with its colours in the vertices, so a whole tray of them can be one instanced draw call.
 * Real-world sized (a little generous, so they read at a distance), lying on the ground at y = 0.
 */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const DOME = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

/** [geometry, colour, position, rotation, scale] parts → one vertex-coloured geometry. */
export function bakeParts(parts) {
  const geos = parts.map(([geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]]) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(_m.compose(new THREE.Vector3(...pos), _q.setFromEuler(_e.set(...rot)), new THREE.Vector3(...scale)));
    _c.set(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const out = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

const PARTS = {
  // A golden crescent of flaky lobes.
  croissant() {
    const lobes = [[-1.05, 0.026, 0xe2b064], [-0.55, 0.036, 0xd39a4c], [0, 0.044, 0xc98b3e], [0.55, 0.036, 0xd39a4c], [1.05, 0.026, 0xe2b064]];
    const R = 0.085;
    return lobes.map(([a, s, c]) => [SPHERE, c, [Math.sin(a) * R, s * 0.78, Math.cos(a) * R - R * 0.75], [0, a + Math.PI / 2, 0], [s * 1.25, s * 0.78, s]]);
  },
  // A soft round bun, thick white icing and a cherry on top.
  bun() {
    const p = [
      [SPHERE, 0xd9a35a, [0, 0.042, 0], [0, 0, 0], [0.068, 0.042, 0.068]],
      [SPHERE, 0xfbf6ee, [0, 0.062, 0], [0, 0, 0], [0.06, 0.026, 0.06]],
      [SPHERE, 0xd9384a, [0, 0.092, 0], [0, 0, 0], [0.016, 0.016, 0.016]],
    ];
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; p.push([SPHERE, 0xfbf6ee, [Math.cos(a) * 0.055, 0.05, Math.sin(a) * 0.055], [0, 0, 0], [0.014, 0.018, 0.014]]); } // drips
    return p;
  },
  // A sizzled banger with grill stripes.
  sausage() {
    const p = [[new THREE.CapsuleGeometry(0.028, 0.13, 6, 12), 0xa65a3c, [0, 0.028, 0], [0, 0, Math.PI / 2]]];
    for (const x of [-0.04, 0, 0.04]) p.push([SPHERE, 0x6b3524, [x, 0.052, 0], [0, 0, 0.5], [0.006, 0.004, 0.024]]);
    return p;
  },
  // Bun, burger, cheese, lettuce, bun, seeds.
  burger() {
    const p = [
      [SPHERE, 0xd9a35a, [0, 0.022, 0], [0, 0, 0], [0.062, 0.024, 0.062]],
      [SPHERE, 0x6b3a26, [0, 0.046, 0], [0, 0, 0], [0.066, 0.016, 0.066]],
      [new THREE.CylinderGeometry(0.07, 0.07, 0.006, 4), 0xf2c14e, [0, 0.058, 0], [0, Math.PI / 4, 0]],
      [SPHERE, 0x7fae64, [0, 0.064, 0], [0, 0, 0], [0.07, 0.007, 0.07]],
      [DOME, 0xe0a85c, [0, 0.066, 0], [0, 0, 0], [0.064, 0.046, 0.064]],
    ];
    for (let i = 0; i < 5; i++) { const a = i * 1.25, r = i ? 0.03 : 0; p.push([SPHERE, 0xfbf3df, [Math.cos(a) * r, 0.11 - r * 0.25, Math.sin(a) * r], [0, 0, 0], [0.006, 0.004, 0.006]]); }
    return p;
  },
  // The knot at the end of a string of sausages (the rest trails behind: see heist/links.js).
  links() { return [[SPHERE, 0xc9806e, [0, 0.016, 0], [0, 0, 0], [0.018, 0.016, 0.018]]]; },
};

const GEO = {};
/** The shared geometry for a treat. */
export const treatGeometry = (kind) => (GEO[kind] ??= bakeParts(PARTS[kind]()));
/** The one material every treat shares. */
export const treatMaterial = () => paint(0xffffff, { vertexColors: true });

/** A treat to put in the world (or in a dog's mouth). */
export function treatMesh(kind) {
  const m = new THREE.Mesh(treatGeometry(kind), treatMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const TREATS = {
  croissant: { name: 'croissant', emoji: '🥐' },
  bun: { name: 'iced bun', emoji: '🧁' },
  sausage: { name: 'sausage', emoji: '🌭' },
  burger: { name: 'burger', emoji: '🍔' },
  links: { name: 'string of sausages', emoji: '🌭' },
};
