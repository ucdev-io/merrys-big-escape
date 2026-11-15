import * as THREE from 'three';
import { mesh } from '../world/props.js';

// Little 3D treasures that pop out of the ground. Each returns a Group about 0.2–0.3m across.

export function squeakyDuck() {
  const g = new THREE.Group();
  mesh(new THREE.SphereGeometry(0.1, 20, 14), 0xf6d06a, g, [0, 0.08, 0], [0, 0, 0], [1, 0.8, 1.25]);
  mesh(new THREE.SphereGeometry(0.065, 18, 12), 0xf6d06a, g, [0, 0.17, 0.07]);
  mesh(new THREE.ConeGeometry(0.03, 0.06, 10), 0xf08a4a, g, [0, 0.16, 0.15], [Math.PI / 2, 0, 0], [1.3, 1, 0.6]);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.01, 8, 6), 0x241a17, g, [s * 0.035, 0.19, 0.12]);
  mesh(new THREE.SphereGeometry(0.04, 12, 8), 0xf6d06a, g, [0, 0.12, -0.12], [0.6, 0, 0], [1, 0.5, 1]);
  return g;
}

export function smellySock() {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.02, 0.04, 0.04), new THREE.Vector3(0.03, 0.04, 0.14),
  ]);
  mesh(new THREE.TubeGeometry(curve, 20, 0.045, 12, false), 0xf2a0b4, g);
  mesh(new THREE.SphereGeometry(0.045, 12, 8), 0xf2a0b4, g, [0.03, 0.04, 0.14]);
  for (const y of [0.13, 0.18]) mesh(new THREE.TorusGeometry(0.046, 0.008, 6, 20), 0xffffff, g, [0, y, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.SphereGeometry(0.03, 10, 8), 0xc9a26a, g, [0.025, 0.05, 0.07], [0, 0, 0], [1.2, 0.5, 1]); // a hole!
  g.userData.stinky = true;
  return g;
}

export function ancientBiscuit() {
  const g = new THREE.Group();
  const col = 0xd9a865;
  mesh(new THREE.CapsuleGeometry(0.035, 0.18, 6, 12), col, g, [0, 0.05, 0], [0, 0, Math.PI / 2]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) mesh(new THREE.SphereGeometry(0.04, 12, 10), col, g, [x * 0.12, 0.05, z * 0.035]);
  for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.008, 6, 4), 0x9a6a3a, g, [-0.07 + i * 0.035, 0.085, (i % 2) * 0.01]);
  return g;
}

export const ITEMS = {
  duck: { name: 'Squeaky Duck', emoji: '🦆', blurb: 'Squeaks when you bite it. Best. Toy. Ever.', build: squeakyDuck },
  sock: { name: 'Smelly Sock', emoji: '🧦', blurb: 'Fell off the washing line in 2019. Still stinky. Perfect.', build: smellySock },
  biscuit: { name: 'Ancient Biscuit', emoji: '🦴', blurb: 'Buried by a dog long, long ago. Slightly crunchy.', build: ancientBiscuit },
  tunnel: { name: 'The Great Escape', emoji: '🕳️', blurb: 'A secret tunnel under the fence. Freedom smells like mud!', build: null },
};
