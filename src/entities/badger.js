import * as THREE from 'three';
import { SPHERE, bake, bakedMesh, group } from './shapes.js';

const FUR = 0x9a968e, DARKFUR = 0x5e5a55, WHITE = 0xf1ece2, BLACK = 0x252220, NOSE = 0x1a1614, PINK = 0xd99a8e;
let cache = null;

function build() {
  if (cache) return cache;
  // A stout grey badger: long, low and wedge-shaped, darker underneath.
  const body = bake([
    { geo: SPHERE, color: FUR, pos: [0, 0.18, -0.04], scale: [0.18, 0.13, 0.35], colors: (i, v) => (v.y < 0.12 ? DARKFUR : (Math.floor(v.x * 120 + v.z * 90) % 6 === 0 ? 0xb4b0a8 : FUR)) },
    { geo: SPHERE, color: FUR, pos: [0, 0.2, 0.17], scale: [0.14, 0.11, 0.16], colors: (i, v) => (v.y < 0.15 ? DARKFUR : FUR) }, // shoulders
    [SPHERE, FUR, [0, 0.2, -0.37], [-0.5, 0, 0], [0.055, 0.035, 0.07]],                 // a stubby tail
  ]);
  // The famous face: a long white snout, and a black stripe from each side of the nose back over the eye to the ear.
  const head = bake([
    { geo: SPHERE, color: WHITE, pos: [0, 0, 0.0], scale: [0.09, 0.085, 0.12] },
    { geo: new THREE.ConeGeometry(0.06, 0.2, 16), color: WHITE, pos: [0, -0.02, 0.15], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.75] },
    [SPHERE, BLACK, [0.042, 0.022, 0.05], [0.12, 0.2, 0], [0.024, 0.032, 0.15]],      // the stripes: long and narrow
    [SPHERE, BLACK, [-0.042, 0.022, 0.05], [0.12, -0.2, 0], [0.024, 0.032, 0.15]],
    [SPHERE, NOSE, [0, -0.02, 0.25], [0, 0, 0], [0.024, 0.02, 0.018]],
    [SPHERE, 0xffffff, [0.047, 0.03, 0.07], [0, 0, 0], [0.006, 0.006, 0.004]],       // a glint of an eye, in each stripe
    [SPHERE, 0xffffff, [-0.041, 0.03, 0.07], [0, 0, 0], [0.006, 0.006, 0.004]],
    [SPHERE, BLACK, [0.065, 0.05, -0.06], [0, 0, 0], [0.026, 0.028, 0.015]],          // little round ears…
    [SPHERE, BLACK, [-0.065, 0.05, -0.06], [0, 0, 0], [0.026, 0.028, 0.015]],
    [SPHERE, WHITE, [0.068, 0.062, -0.057], [0, 0, 0], [0.016, 0.01, 0.011]],         // …with white tips
    [SPHERE, WHITE, [-0.068, 0.062, -0.057], [0, 0, 0], [0.016, 0.01, 0.011]],
    [SPHERE, PINK, [0, -0.05, 0.19], [0, 0, 0], [0.018, 0.008, 0.02]],                // chin
  ]);
  const leg = bake([[SPHERE, BLACK, [0, -0.05, 0], [0, 0, 0], [0.045, 0.075, 0.05]], [SPHERE, BLACK, [0, -0.11, 0.025], [0, 0, 0], [0.04, 0.02, 0.055]]]);
  return (cache = { body, head, leg });
}

/**
 * 🦡 Brock the badger: wide, low and stripy-faced. Faces +Z. Shuffles about on short legs, snuffles,
 * digs with his front paws, and goes into his sett backwards (as is traditional).
 */
export class Badger {
  constructor() {
    const B = build();
    this.root = new THREE.Group();
    this.body = group(this.root);
    bakedMesh(B.body, this.body);
    this.head = group(this.body, [0, 0.2, 0.33]);
    bakedMesh(B.head, this.head);
    this.legs = [[0.11, 0.2], [-0.11, 0.2], [0.11, -0.22], [-0.11, -0.22]].map(([x, z]) => { const g = group(this.body, [x, 0.12, z]); bakedMesh(B.leg, g); return g; });
    this.mouth = group(this.head, [0, -0.035, 0.2]); // (where bracken goes)
    this.t = Math.random() * 10;
    this.root.scale.setScalar(1.1);
  }

  /** moving: -1 (backwards) … 1. snuffle: nose down, wiggling. dig: front paws going. */
  update(dt, { moving = 0, snuffle = false, dig = false } = {}) {
    this.t += dt;
    const t = this.t, step = t * 11 * Math.sign(moving || 1), m = Math.abs(moving);
    this.legs.forEach((g, i) => {
      const ph = step + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0);
      g.rotation.x = Math.sin(ph) * 0.5 * m + (dig && i < 2 ? Math.sin(t * 22 + i * Math.PI) * 0.9 : 0);
      g.position.y = 0.12 + Math.max(0, Math.cos(ph)) * 0.02 * m;
    });
    this.body.position.y = Math.abs(Math.sin(step)) * 0.012 * m;
    this.body.rotation.z = Math.sin(step / 2) * 0.05 * m;
    this.body.rotation.x = dig ? 0.18 : 0;
    const sn = snuffle ? 1 : 0;
    this.head.rotation.x = 0.12 + 0.2 * sn + Math.sin(t * 12) * 0.05 * sn + (dig ? 0.3 : 0); // (nose down: badgers go about sniffing)
    this.head.rotation.y = Math.sin(t * 0.9) * 0.3 * sn + Math.sin(t * 7) * 0.03;
  }
}
