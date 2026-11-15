import * as THREE from 'three';
import { mesh } from '../world/props.js';

const SPHERE = new THREE.SphereGeometry(1, 20, 14);
const group = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

/**
 * A duck: Duchess (white, with a tiny tiara and pearls — she is a duchess, after all), one of her
 * fluffy yellow ducklings, or a mallard (brown, with a shiny green head). Faces +Z. Waddles when
 * walking, bobs when paddling, flaps when quacking.
 */
export class Duck {
  constructor({ duchess = false, mallard = false } = {}) {
    const s = duchess ? 1 : mallard ? 0.9 : 0.42;
    this.size = s;
    const body = duchess ? 0xf6f1e8 : mallard ? 0xa8876a : 0xf6d65a, wing = duchess ? 0xe6dccd : mallard ? 0x86684e : 0xeec64a;
    const bill = mallard ? 0xe8c040 : 0xf0a040, headCol = mallard ? 0x2f7a52 : body;
    this.root = new THREE.Group();
    this.body = group(this.root);
    mesh(SPHERE, body, this.body, [0, 0.13 * s, 0], [0, 0, 0], [0.15 * s, 0.11 * s, 0.22 * s]);
    mesh(new THREE.ConeGeometry(0.07 * s, 0.14 * s, 10), body, this.body, [0, 0.19 * s, -0.2 * s], [-1.1, 0, 0], [1, 1, 0.5]); // tail
    this.wings = [-1, 1].map((side) => {
      const w = group(this.body, [side * 0.12 * s, 0.16 * s, 0]);
      mesh(SPHERE, wing, w, [0, -0.02 * s, -0.02 * s], [0, 0, 0], [0.035 * s, 0.07 * s, 0.15 * s]);
      return w;
    });
    this.head = group(this.body, [0, 0.22 * s, 0.13 * s]);
    mesh(new THREE.CylinderGeometry(0.045 * s, 0.06 * s, 0.1 * s, 12), headCol, this.head, [0, -0.02 * s, -0.01 * s], [0.3, 0, 0]); // neck
    mesh(SPHERE, headCol, this.head, [0, 0.06 * s, 0.02 * s], [0, 0, 0], [0.075 * s, 0.075 * s, 0.08 * s]);
    if (mallard) mesh(new THREE.TorusGeometry(0.052 * s, 0.009 * s, 6, 18), 0xf6f1e8, this.head, [0, -0.045 * s, -0.012 * s], [Math.PI / 2 + 0.3, 0, 0]); // white collar
    mesh(SPHERE, bill, this.head, [0, 0.045 * s, 0.11 * s], [0, 0, 0], [0.045 * s, 0.017 * s, 0.06 * s]);
    for (const side of [-1, 1]) {
      mesh(SPHERE, 0x241a17, this.head, [side * 0.05 * s, 0.08 * s, 0.065 * s], [0, 0, 0], [0.011 * s, 0.013 * s, 0.01 * s]);
      mesh(SPHERE, bill, this.root, [side * 0.05 * s, 0.012, 0.03 * s], [0, 0, 0], [0.04 * s, 0.01, 0.055 * s]); // webbed feet
    }
    if (duchess) {
      // A tiny gold tiara…
      const t = group(this.head, [0, 0.13 * s, 0.0]);
      mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 18), 0xf2c14e, t, [0, 0, 0], [Math.PI / 2, 0, 0]);
      for (let i = -1; i <= 1; i++) mesh(new THREE.ConeGeometry(0.009, 0.03, 6), 0xf2c14e, t, [i * 0.02, 0.016, 0.02]);
      mesh(SPHERE, 0xd9534f, t, [0, 0.022, 0.03], [0, 0, 0], [0.008, 0.008, 0.008]);
      // …and pearls.
      for (let i = 0; i < 9; i++) {
        const a = -1.2 + (i / 8) * 2.4;
        mesh(SPHERE, 0xfbf6ec, this.head, [Math.sin(a) * 0.05, -0.04, Math.cos(a) * 0.045], [0, 0, 0], [0.009, 0.009, 0.009]);
      }
    }
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.t = Math.random() * 10;
    this.flapT = 0;
  }

  quack() { this.flapT = 0.6; }

  /** moving: 0..1 walking speed. swim: paddling (body low in the water, gentle bob). */
  update(dt, { moving = 0, swim = false } = {}) {
    this.t += dt;
    const t = this.t;
    this.body.rotation.z = Math.sin(t * 11) * 0.14 * moving;          // waddle
    this.body.position.y = swim ? Math.sin(t * 2.2) * 0.012 : Math.abs(Math.sin(t * 11)) * 0.02 * moving;
    this.head.rotation.x = Math.sin(t * (moving ? 11 : 1.3)) * (moving ? 0.12 : 0.08);
    this.head.rotation.y = Math.sin(t * 0.6) * 0.4 * (1 - moving);   // looking about
    this.flapT = Math.max(0, this.flapT - dt);
    const flap = this.flapT > 0 ? Math.sin(t * 40) * 0.6 : 0;
    this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.max(0, flap)));
  }
}
