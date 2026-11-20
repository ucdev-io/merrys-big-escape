import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bakeParts } from '../../../entities/treats.js';
import { paint } from '../../../render/watercolorMaterial.js';

// Odds and ends for heists that come and go (so they aren't baked into the town).

/** Your stash: a big red dog bowl just inside your garden gate, where the loot piles up. */
export function dogBowl() {
  const geo = bakeParts([
    [new THREE.CylinderGeometry(0.3, 0.24, 0.13, 28, 1, true), 0xd9534f, [0, 0.065, 0]],
    [new THREE.TorusGeometry(0.3, 0.025, 8, 32), 0xe8705f, [0, 0.13, 0], [Math.PI / 2, 0, 0]],
    // The inside floor reaches right out to the wall (which flares from 0.24 to 0.3), so there's no gap
    // round its edge, and its top (0.035) is well clear of the ground the bowl stands on.
    [new THREE.CylinderGeometry(0.2555, 0.242, 0.03, 28), 0xb8433c, [0, 0.02, 0]],
    [new THREE.CylinderGeometry(0.24, 0.24, 0.03, 28), 0xd9534f, [0, 0.015, 0]],
    [new THREE.SphereGeometry(0.06, 12, 8), 0xf6efe0, [0, 0.07, 0.3], [0, 0, 0], [1, 0.7, 0.25]], // a little bone badge
    [new THREE.SphereGeometry(0.03, 10, 6), 0xf6efe0, [-0.055, 0.085, 0.3], [0, 0, 0], [1, 1, 0.4]],
    [new THREE.SphereGeometry(0.03, 10, 6), 0xf6efe0, [0.055, 0.085, 0.3], [0, 0, 0], [1, 1, 0.4]],
  ]);
  const m = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Where the loot sits in the bowl (bowl space), first to last. */
export const PILE = [[0, 0.06, 0], [-0.1, 0.07, 0.06], [0.1, 0.07, -0.05], [0.04, 0.12, 0.08], [-0.07, 0.13, -0.07], [0.11, 0.1, 0.09], [-0.12, 0.09, -0.02], [0, 0.17, 0]];

/** A cartoon puff of smoke (BBQs), sharing one geometry and material. */
let PUFF = null;
export function puff() {
  PUFF ??= { geo: new THREE.SphereGeometry(1, 12, 8), mat: paint(0xece8e0, { transparent: true, opacity: 0.42 }) };
  const m = new THREE.Mesh(PUFF.geo, PUFF.mat);
  m.castShadow = false;
  return m;
}

/** Where the food sits on the BBQ's grill (BBQ space): three sausages, then three burgers. */
export const GRILL_SLOTS = [[-0.22, 0.575, -0.15, 0.05], [-0.2, 0.575, 0, -0.04], [-0.23, 0.575, 0.15, 0.02], [0.06, 0.575, -0.13, 0.3], [0.23, 0.575, -0.08, 1.1], [0.15, 0.575, 0.13, 2.2]];

/**
 * A low brick barbecue (front faces +Z; the cook stands behind it), with a grill rack and glowing
 * coals. Baked into two meshes: the bricks and rack, and the coals (which glow).
 */
export function brickBbq() {
  const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
  const g = new THREE.Group();
  const parts = [
    [RB(0.95, 0.5, 0.6), 0xb5654a, [0, 0.25, 0]],
    [RB(1.0, 0.06, 0.66, 0.025), 0x8f4a36, [0, 0.52, 0]],
    [RB(0.36, 0.04, 0.5, 0.015), 0xc79b6d, [0.68, 0.48, 0]], // a shelf for the ketchup
    [new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), 0xd9534f, [0.62, 0.57, 0.08]],
    [new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), 0xf6d06a, [0.73, 0.57, -0.06]],
    [RB(0.82, 0.02, 0.5, 0.008), 0x3a3a3a, [0, 0.555, 0]],
  ];
  for (let i = 0; i < 7; i++) parts.push([new THREE.CylinderGeometry(0.007, 0.007, 0.5, 6), 0x6a6a6a, [-0.36 + i * 0.12, 0.568, 0], [Math.PI / 2, 0, 0]]); // the bars
  for (const y of [0.12, 0.27, 0.42]) parts.push([RB(0.966, 0.012, 0.616, 0.006), 0xd99a82, [0, y, 0]]); // a hint of brickwork
  const body = new THREE.Mesh(bakeParts(parts), paint(0xffffff, { vertexColors: true }));
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const coals = [];
  for (let i = 0; i < 9; i++) coals.push([new THREE.SphereGeometry(1, 10, 8), i % 3 ? 0xf08a3a : 0xf6d06a, [-0.32 + (i % 5) * 0.16 + (i > 4 ? 0.08 : 0), 0.53, i > 4 ? 0.1 : -0.08], [0, 0, 0], [0.07, 0.035, 0.06]]);
  g.add(new THREE.Mesh(bakeParts(coals), paint(0xffffff, { vertexColors: true, emissive: 0x7a2a08 })));
  return g;
}
