import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../render/watercolorMaterial.js';
import { SPHERE, bake, bakedMesh, group } from './shapes.js';

const SHELL = 0xe8743c, TRIM = 0xf3ead6, SKIRT = 0x4a4a52, TYRE = 0x2b2b2b, VISOR = 0x2b3440;
let cache = null;

function build() {
  if (cache) return cache;
  const RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  const body = bake([
    [RB(0.62, 0.14, 0.84, 0.06), SKIRT, [0, 0.13, 0]],                                  // the chassis
    [SPHERE, SHELL, [0, 0.19, -0.01], [0, 0, 0], [0.34, 0.2, 0.44]],                     // a smooth round shell…
    [SPHERE, TRIM, [0, 0.33, -0.06], [0, 0, 0], [0.2, 0.065, 0.26]],                     // …with a pale lid
    [new THREE.TorusGeometry(0.3, 0.035, 10, 36, Math.PI), TRIM, [0, 0.13, 0.12], [Math.PI / 2, 0, 0], [1, 1.25, 1]], // a soft front bumper
    [RB(0.36, 0.13, 0.05, 0.03), VISOR, [0, 0.28, 0.33], [-0.5, 0, 0]],                  // the face
    [new THREE.CylinderGeometry(0.012, 0.014, 0.2, 8), SKIRT, [0.06, 0.45, -0.14]],      // an antenna
    [new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), 0xfff2e2, [0, 0.235, 0.355], [-0.5 + Math.PI, 0, 0]], // a smile
  ]);
  const wheel = (r, w) => bake([
    [new THREE.CylinderGeometry(r, r, w, 22), TYRE, [0, 0, 0], [0, 0, Math.PI / 2]],
    [new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.01, 16), SHELL, [0, 0, 0], [0, 0, Math.PI / 2]],
    [RB(w + 0.012, r * 1.5, r * 0.25, 0.01), TRIM, [0, 0, 0]],                           // (a spoke, so you can see it turn)
  ]);
  const eye = bake([[new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), 0xffffff, [0, 0, 0], [Math.PI / 2, 0, 0]]]);
  const pupil = bake([[SPHERE, 0x1d2a3a, [0, 0, 0], [0, 0, 0], [0.022, 0.026, 0.01]], [SPHERE, 0xffffff, [0.008, 0.01, 0.006], [0, 0, 0], [0.006, 0.006, 0.004]]]);
  return (cache = { body, rear: wheel(0.12, 0.07), front: wheel(0.075, 0.05), eye, pupil });
}

/**
 * The park's robot lawnmower ("Mowbot"): a round orange shell on chunky wheels, a happy face with big
 * googly eyes and a blinking antenna. Faces +Z. Perfectly harmless — not that hedgehogs believe it.
 */
export class RobotMower {
  constructor() {
    const B = build();
    this.root = new THREE.Group();
    this.body = group(this.root);
    bakedMesh(B.body, this.body);
    this.wheels = [];
    for (const [x, z, k] of [[0.33, -0.22, 'rear'], [-0.33, -0.22, 'rear'], [0.3, 0.27, 'front'], [-0.3, 0.27, 'front']]) {
      const w = bakedMesh(B[k], this.body, [x, k === 'rear' ? 0.12 : 0.075, z]);
      w.userData.r = k === 'rear' ? 0.12 : 0.075;
      this.wheels.push(w);
    }
    // Big friendly eyes on the visor (they look about and blink).
    this.face = group(this.body, [0, 0.285, 0.36], [-0.5, 0, 0]);
    this.pupils = [-1, 1].map((s) => {
      bakedMesh(B.eye, this.face, [s * 0.085, 0.01, 0.0]);
      return bakedMesh(B.pupil, this.face, [s * 0.085, 0.01, 0.012]);
    });
    this.light = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), paint(0x8fe08f, { emissive: 0x2a7a2a }));
    this.light.position.set(0.06, 0.56, -0.14);
    this.body.add(this.light);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.t = Math.random() * 10;
    this.look = 0;       // -1..1 where the eyes are looking
    this.worried = 0;    // backing away (eyes go wide, light blinks red-ish)
  }

  /** speed: metres per second (negative = reversing). */
  update(dt, speed = 0) {
    this.t += dt;
    const t = this.t;
    for (const w of this.wheels) w.rotation.x += (speed * dt) / w.userData.r;
    this.body.position.y = Math.abs(Math.sin(t * 9)) * 0.008 * Math.min(1, Math.abs(speed)); // trundle trundle
    this.body.rotation.z = Math.sin(t * 7) * 0.012 * Math.min(1, Math.abs(speed));
    this.worried = Math.max(0, this.worried - dt);
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    this.pupils.forEach((p, i) => {
      p.position.x = (i ? 1 : -1) * 0.085 + this.look * 0.018;
      p.scale.set(1, blink * (this.worried > 0 ? 1.25 : 1), 1);
    });
    this.light.scale.setScalar(Math.sin(t * (this.worried > 0 ? 18 : 4)) > 0 ? 1 : 0.6);
  }
}
