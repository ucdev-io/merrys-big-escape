import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../render/watercolorMaterial.js';
import { bake } from './shapes.js';

/*
 * 🚢 The Sunny Dolphin, a little cruise ship: its outline (shared by the far-off view from the beach and the ship
 * you walk about on: trips/cruise/), the far-off version itself (one cheap mesh), and the tender, the little motor
 * boat that runs you out to it from the jetty.
 * Ship coordinates: x across (port −, starboard +), z along (the bow points to −z), the main deck at y = 0.
 */

export const SHIP = { B: 6.5, BOW: -30, STERN: 26, SIDE: -16, H: 3.6 }; // half-beam, bow tip, stern, where the bow starts to narrow, hull depth (to the waterline)
export const NAVY = 0x2f4a7a, RED = 0xd9534f, WHITE = 0xf6f2ea, CREAM = 0xfbf6ec, FUNNEL = 0xe0603e;

/** The ship's outline seen from above (as a Shape in (x, z)), `inset` metres in from the hull's side. */
export function shipShape(inset = 0) {
  const B = SHIP.B - inset, S = SHIP.STERN - inset, T = SHIP.BOW + inset * 1.6, F = SHIP.SIDE;
  const s = new THREE.Shape();
  s.moveTo(-B, S - 3);
  s.quadraticCurveTo(-B, S, -B + 3, S);
  s.lineTo(B - 3, S);
  s.quadraticCurveTo(B, S, B, S - 3);
  s.lineTo(B, F);
  s.quadraticCurveTo(B * 0.95, -26 + inset * 0.4, 0, T);
  s.quadraticCurveTo(-B * 0.95, -26 + inset * 0.4, -B, F);
  s.lineTo(-B, S - 3);
  return s;
}

/** How far out from the middle the hull's side is at z (the bow narrows to a point). */
export function halfBeam(z) {
  if (z >= SHIP.SIDE) return SHIP.B;
  const t = Math.min(1, (SHIP.SIDE - z) / (SHIP.SIDE - SHIP.BOW));
  return SHIP.B * Math.sqrt(Math.max(0, 1 - t * t * 1.02));
}

/** A slab of the outline, from y0 up to y1 (`inset` in from the side). */
export function hullSlab(y0, y1, inset = 0, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shipShape(inset), { depth: y1 - y0, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(Math.PI / 2); // (the shape's y is the ship's z; it's pushed out downwards from y = 0)
  g.translate(0, y1, 0);
  return g;
}

const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, r);

/**
 * The ship far off (from the beach): the hull, two white decks of cabins with rows of windows, the funnel. One
 * geometry with vertex colours; the main deck at y = 0, the waterline at y = −SHIP.H.
 */
export function farShipGeometry() {
  const parts = [
    [hullSlab(-SHIP.H, 0.25), NAVY],
    [hullSlab(-SHIP.H - 0.05, -SHIP.H + 0.55, -0.03), RED],
    [hullSlab(-0.15, 0.3, -0.04), WHITE],
    [rbox(9, 2.6, 11), WHITE, [0, 1.3, -13.5]],
    [rbox(6, 2, 4), WHITE, [0, 3.6, -16.5]],
    [rbox(9, 2.6, 11), WHITE, [0, 1.3, 13.5]],
    [new THREE.CylinderGeometry(1.15, 1.35, 5.4, 18), FUNNEL, [0, 5.3, 15], [0, 0, 0], [1, 1, 1.35]],
    [new THREE.CylinderGeometry(1.17, 1.17, 0.6, 18, 1, true), WHITE, [0, 6.6, 15], [0, 0, 0], [1, 1, 1.35]],
    [new THREE.CylinderGeometry(1.16, 1.16, 0.5, 18), 0x3a3a40, [0, 7.8, 15], [0, 0, 0], [1, 1, 1.35]],
  ];
  // Rows of windows along the cabins, and portholes along the hull.
  for (const zc of [-13.5, 13.5]) for (const s of [-1, 1]) for (let i = 0; i < 6; i++) parts.push([new THREE.BoxGeometry(0.05, 0.7, 1.1), 0x8fb8d8, [s * 4.51, 1.5, zc - 4.2 + i * 1.7]]);
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) parts.push([new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10), 0xf3ead0, [s * (SHIP.B + 0.06), -1.2, -12 + i * 2.6], [0, 0, Math.PI / 2]]);
  return bake(parts);
}

/** The tender: a little white motor boat with a red stripe, a cabin with a roof, and a seat at the back. Faces +z. One mesh. */
export function tenderModel() {
  const hull = new THREE.Shape();
  hull.moveTo(-0.9, -1.8); hull.lineTo(0.9, -1.8); hull.lineTo(0.95, 1.0); hull.quadraticCurveTo(0.8, 2.0, 0, 2.4); hull.quadraticCurveTo(-0.8, 2.0, -0.95, 1.0); hull.lineTo(-0.9, -1.8);
  const slab = (y0, y1, inset = 0) => {
    const geo = new THREE.ExtrudeGeometry(hull, { depth: y1 - y0, bevelEnabled: true, bevelSize: 0.06 - inset, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 8 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, y1, 0);
    return geo;
  };
  const floor = new THREE.ShapeGeometry(hull);
  floor.rotateX(Math.PI / 2);
  floor.scale(0.9, 1, 0.9);
  floor.translate(0, 0.2, 0);
  const g = new THREE.Group();
  const m = new THREE.Mesh(bake([
    [slab(-0.35, 0.35), WHITE],
    [slab(0.05, 0.16, 0.03), RED],
    [floor, 0xb48a5e],
    [rbox(1.3, 0.8, 1.0, 0.08), WHITE, [0, 0.6, 0.9]],
    [rbox(1.5, 0.08, 1.3, 0.03), NAVY, [0, 1.04, 0.85]],
    [new THREE.BoxGeometry(1.1, 0.35, 0.04), 0x9cc8e0, [0, 0.75, 0.39]],
    [rbox(1.4, 0.18, 0.5, 0.05), 0x5b86c4, [0, 0.32, -1.35]],
  ]), paint(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = true;
  g.add(m);
  return g;
}
