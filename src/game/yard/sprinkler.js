import * as THREE from 'three';
import { mesh } from '../../world/props.js';
import { Particles } from '../../fx/particles.js';
import { sfx } from '../../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** The garden sprinkler: walk near it and it springs to life — and soaks you. */
export class Sprinkler {
  constructor(scene, world, pos) {
    const g = new THREE.Group();
    g.position.copy(pos);
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 18), 0x6f9a52, g, [0, 0.03, 0]);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), 0x9aa3a8, g, [0, 0.15, 0]);
    this.head = new THREE.Group();
    this.head.position.y = 0.27;
    g.add(this.head);
    mesh(new THREE.CapsuleGeometry(0.025, 0.24, 4, 8), 0xd9534f, this.head, [0, 0, 0], [0, 0, Math.PI / 2]);
    // Hose snaking off to the house.
    const pts = [V(0, 0.03, 0), V(0.6, 0.03, -0.5), V(0.2, 0.03, -1.4), V(0.9, 0.03, -2.4), V(0.5, 0.03, -3.4)];
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 6, false), 0x6f9a52, g);
    scene.add(g);
    world.colliders.circle(pos.x, pos.z, 0.2);
    this.pos = pos;
    this.spray = new Particles(scene, { max: 300 });
    this.on = 0;
    this.cd = 0;
    this.soaked = false;
  }

  /** @returns true on the frame the dog gets soaked (once per spray) */
  update(dt, dogPos, active) {
    this.cd -= dt;
    let soakedNow = false;
    const d = Math.hypot(dogPos.x - this.pos.x, dogPos.z - this.pos.z);
    if (active && this.on <= 0 && this.cd <= 0 && d < 1.8) {
      this.on = 3.5; this.cd = 12; this.soaked = false;
      sfx.puddle(1.2);
    }
    if (this.on > 0) {
      this.on -= dt;
      this.head.rotation.y += dt * 9;
      for (let k = 0; k < 2; k++) {
        const a = this.head.rotation.y + k * Math.PI;
        const dir = V(Math.cos(a), 0, -Math.sin(a));
        for (let j = 0; j < 3; j++) {
          this.spray.spawn({
            pos: this.pos.clone().add(V(0, 0.3, 0)),
            vel: dir.clone().multiplyScalar(rand(1.5, 3.2)).add(V(0, rand(2.5, 3.6), 0)),
            life: 1.0, size: rand(0.02, 0.035), gravity: 9, floor: 0.02, color: pick([0x8fc4d8, 0xbfe0ec, 0xffffff]),
          });
        }
      }
      if (!this.soaked && d < 2.6) { this.soaked = true; soakedNow = true; }
    }
    this.spray.update(dt);
    return soakedNow;
  }
}
