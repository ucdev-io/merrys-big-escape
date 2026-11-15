import * as THREE from 'three';
import { SPHERE, bakedMesh, group } from './shapes.js';

// Hens that live in the neighbours' gardens (and keep escaping): brown, white or speckled grey.
const LOOKS = {
  brown: { body: 0xb5683a, breast: 0xc98a5a, wing: 0x9a5530, tail: 0x5a3a2a },
  white: { body: 0xf3ede2, breast: 0xfbf7ee, wing: 0xe2d8c8, tail: 0xd8ccb8 },
  grey: { body: 0x9a9690, breast: 0xc2beb6, wing: 0x7e7a74, tail: 0x3e3a38 },
};
const RED = 0xd9483f, BEAK = 0xf0b040, LEG = 0xe8a040;

/**
 * A plump, round hen. Faces +Z, feet on the ground. Struts with a bobbing head when walking,
 * flaps and hops when flustered (barked at, chased…).
 */
export class Chicken {
  constructor(look = 'brown') {
    const L = LOOKS[look] ?? LOOKS.brown;
    this.root = new THREE.Group();
    this.lift = group(this.root); // (hops lift the whole hen, legs and all)
    this.body = group(this.lift);
    bakedMesh([
      [SPHERE, L.body, [0, 0.2, 0], [0, 0, 0], [0.13, 0.12, 0.16]],
      [SPHERE, L.breast, [0, 0.19, 0.07], [0, 0, 0], [0.105, 0.1, 0.1]],
      [SPHERE, L.tail, [0, 0.29, -0.13], [-0.5, 0, 0], [0.035, 0.1, 0.05]],
      [SPHERE, L.tail, [-0.04, 0.27, -0.12], [-0.6, 0, 0.35], [0.03, 0.085, 0.045]],
      [SPHERE, L.tail, [0.04, 0.27, -0.12], [-0.6, 0, -0.35], [0.03, 0.085, 0.045]],
      [SPHERE, L.body, [0, 0.27, 0.07], [0, 0, 0], [0.07, 0.08, 0.07]], // the neck, rising into the head
    ], this.body);
    this.wings = [-1, 1].map((s) => {
      const w = group(this.body, [s * 0.115, 0.23, 0.0]);
      bakedMesh([[SPHERE, L.wing, [s * 0.012, -0.03, -0.02], [0.15, 0, 0], [0.032, 0.075, 0.11]]], w);
      return w;
    });
    this.head = group(this.body, [0, 0.34, 0.1]);
    bakedMesh([
      [SPHERE, L.body, [0, 0, 0], [0, 0, 0], [0.062, 0.065, 0.064]],
      [SPHERE, RED, [0, 0.062, 0.03], [0, 0, 0], [0.014, 0.022, 0.016]],     // the comb
      [SPHERE, RED, [0, 0.07, 0.0], [0, 0, 0], [0.015, 0.026, 0.018]],
      [SPHERE, RED, [0, 0.062, -0.03], [0, 0, 0], [0.013, 0.02, 0.016]],
      [new THREE.ConeGeometry(0.02, 0.05, 12), BEAK, [0, -0.005, 0.075], [Math.PI / 2, 0, 0], [1, 1, 0.75]],
      [SPHERE, RED, [0, -0.04, 0.05], [0, 0, 0], [0.013, 0.022, 0.012]],     // the wattle
      [SPHERE, 0x241a17, [0.038, 0.012, 0.042], [0, 0, 0], [0.009, 0.011, 0.008]],
      [SPHERE, 0x241a17, [-0.038, 0.012, 0.042], [0, 0, 0], [0.009, 0.011, 0.008]],
      [SPHERE, 0xffffff, [0.041, 0.017, 0.047], [0, 0, 0], [0.003, 0.003, 0.003]],
      [SPHERE, 0xffffff, [-0.041, 0.017, 0.047], [0, 0, 0], [0.003, 0.003, 0.003]],
    ], this.head);
    const toe = new THREE.CapsuleGeometry(0.006, 0.035, 3, 6);
    this.legs = [-1, 1].map((s) => {
      const hip = group(this.lift, [s * 0.045, 0.12, 0]);
      bakedMesh([
        [new THREE.CylinderGeometry(0.008, 0.009, 0.11, 8), LEG, [0, -0.06, 0]],
        [toe, LEG, [0, -0.115, 0.02], [Math.PI / 2, 0, 0]],
        [toe, LEG, [0.015, -0.115, 0.015], [Math.PI / 2, 0, -0.6]],
        [toe, LEG, [-0.015, -0.115, 0.015], [Math.PI / 2, 0, 0.6]],
      ], hip);
      return hip;
    });
    this.t = Math.random() * 10;
    this.flapT = 0;
    this.hopT = 0;
  }

  /** Bwaak! A flustered flap (and a little hop). */
  fluster() { this.flapT = 0.7; this.hopT = 0.35; }

  /** moving: 0..1 how fast she's strutting. */
  update(dt, { moving = 0 } = {}) {
    this.t += dt;
    const t = this.t, step = t * (7 + moving * 9);
    this.body.position.y = Math.abs(Math.sin(step)) * 0.015 * moving;
    this.body.rotation.z = Math.sin(step) * 0.08 * moving;
    // Chickens keep their heads still and then jerk them forward: a bob when walking, pecks when not.
    const peck = moving < 0.1 && Math.sin(t * 0.9) > 0.85 ? Math.sin(t * 18) * 0.5 + 0.5 : 0;
    this.head.position.z = 0.1 + (moving > 0.1 ? Math.max(0, Math.sin(step)) * 0.03 : 0) + peck * 0.04;
    this.head.position.y = 0.34 - peck * 0.08;
    this.head.rotation.x = peck * 0.9;
    this.head.rotation.y = moving < 0.1 ? Math.sin(t * 0.7) * 0.6 : 0;
    this.legs[0].rotation.x = Math.sin(step) * 0.6 * moving;
    this.legs[1].rotation.x = -Math.sin(step) * 0.6 * moving;
    this.flapT = Math.max(0, this.flapT - dt);
    this.hopT = Math.max(0, this.hopT - dt);
    const flap = this.flapT > 0 ? (Math.sin(t * 38) * 0.5 + 0.5) * 1.1 : 0;
    this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * flap));
    this.lift.position.y = this.hopT > 0 ? Math.sin((this.hopT / 0.35) * Math.PI) * 0.12 : 0;
  }
}
