import * as THREE from 'three';
import { mesh } from '../world/props.js';

const group = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };
const SKINS = [0xf2d3b8, 0xe0b48e, 0xc68e64, 0x9a6440, 0x6e4630];
const HAIRS = [0x3b2b25, 0x6b4a32, 0xc89a5a, 0x2a2224, 0xa8a49e, 0xd8b070];

/**
 * A person in the neighbourhood (postman, dog walkers…): soft, rounded and storybook-simple, to
 * match the dogs. Faces +Z, feet on the ground. update() swings arms and legs as they walk.
 */
export class Person {
  constructor({ shirt = 0x5b86c4, trousers = 0x4a4a52, skin = null, hair = null, cap = null, bag = false } = {}) {
    skin ??= SKINS[Math.floor(Math.random() * SKINS.length)];
    hair ??= HAIRS[Math.floor(Math.random() * HAIRS.length)];
    this.root = new THREE.Group();
    this.body = group(this.root);
    this.legs = [-1, 1].map((s) => {
      const hip = group(this.body, [s * 0.09, 0.82, 0]);
      mesh(new THREE.CapsuleGeometry(0.07, 0.62, 4, 10), trousers, hip, [0, -0.38, 0]);
      mesh(new THREE.SphereGeometry(0.075, 10, 8), 0x3a3030, hip, [0, -0.78, 0.05], [0, 0, 0], [1, 0.6, 1.5]); // shoe
      return hip;
    });
    mesh(new THREE.CapsuleGeometry(0.17, 0.38, 6, 14), shirt, this.body, [0, 1.16, 0], [0, 0, 0], [1, 1, 0.75]);
    this.arms = [-1, 1].map((s) => {
      const sh = group(this.body, [s * 0.22, 1.38, 0]);
      mesh(new THREE.CapsuleGeometry(0.05, 0.46, 4, 8), shirt, sh, [0, -0.27, 0]);
      mesh(new THREE.SphereGeometry(0.055, 10, 8), skin, sh, [0, -0.56, 0]); // hand
      return sh;
    });
    this.head = group(this.body, [0, 1.62, 0]);
    mesh(new THREE.SphereGeometry(0.13, 18, 14), skin, this.head, [0, 0, 0]);
    mesh(new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, this.head, [0, 0.015, -0.01]);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.016, 8, 6), 0x241a17, this.head, [s * 0.045, 0.01, 0.12]);
    mesh(new THREE.SphereGeometry(0.022, 8, 6), skin, this.head, [0, -0.02, 0.13]); // nose
    mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 12, Math.PI), 0x8a4a3a, this.head, [0, -0.055, 0.115], [0, 0, Math.PI]); // smile
    if (cap) { // a peaked cap (the postman's has a red band)
      mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.08, 18), cap.color, this.head, [0, 0.11, 0]);
      mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 18, 1, false, -Math.PI / 2, Math.PI), cap.color, this.head, [0, 0.075, 0.07], [0, Math.PI, 0], [1, 1, 1.2]);
      if (cap.band) mesh(new THREE.CylinderGeometry(0.137, 0.137, 0.02, 18, 1, true), cap.band, this.head, [0, 0.085, 0]);
    }
    if (bag) { // a satchel full of letters
      mesh(new THREE.BoxGeometry(0.1, 0.26, 0.3), 0x9a5a3a, this.body, [0.24, 0.9, 0.02]);
      mesh(new THREE.BoxGeometry(0.02, 0.6, 0.05), 0x7a4a2e, this.body, [0, 1.2, 0.0], [0, 0, 0.75]);
      for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.01, 0.1, 0.16), 0xfbf6ec, this.body, [0.25, 1.05, -0.06 + i * 0.05]);
    }
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.phase = Math.random() * 6;
    this.wave = 0;
  }

  /** speed: metres per second (0 = standing). wave: 0..1, an arm up to wave hello. */
  update(dt, speed = 0) {
    this.phase += dt * (2 + speed * 2.4);
    const sw = Math.sin(this.phase) * Math.min(0.6, speed * 0.35);
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * 0.8; this.arms[1].rotation.x = sw * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * Math.min(1, speed);
    this.wave = Math.max(0, this.wave - dt);
    if (this.wave > 0) { this.arms[0].rotation.z = -2.6 + Math.sin(this.phase * 3) * 0.3; this.arms[0].rotation.x = 0; }
    else this.arms[0].rotation.z *= 0.8;
    this.head.rotation.y = Math.sin(this.phase * 0.15) * 0.2;
  }
}
