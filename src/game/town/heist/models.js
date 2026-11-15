import * as THREE from 'three';
import { bakeParts } from '../../../entities/treats.js';
import { paint } from '../../../render/watercolorMaterial.js';

// Odds and ends for heists that come and go (so they aren't baked into the town).

/** Your stash: a big red dog bowl just inside your garden gate, where the loot piles up. */
export function dogBowl() {
  const geo = bakeParts([
    [new THREE.CylinderGeometry(0.3, 0.24, 0.13, 28, 1, true), 0xd9534f, [0, 0.065, 0]],
    [new THREE.TorusGeometry(0.3, 0.025, 8, 32), 0xe8705f, [0, 0.13, 0], [Math.PI / 2, 0, 0]],
    [new THREE.CylinderGeometry(0.235, 0.235, 0.02, 28), 0xb8433c, [0, 0.03, 0]],
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
  PUFF ??= { geo: new THREE.SphereGeometry(1, 12, 8), mat: paint(0xe8e4dc, { transparent: true, opacity: 0.55 }) };
  const m = new THREE.Mesh(PUFF.geo, PUFF.mat);
  m.castShadow = false;
  return m;
}
