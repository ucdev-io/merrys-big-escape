import * as THREE from 'three';
import { SPHERE, bake, bakedMesh, group, profileTube } from './shapes.js';

const RUST = 0xc4622d, DARK = 0xa24c24, CREAM = 0xf3dcc0, TIP = 0xe39a5c, EYE = 0x1f1714;
const cache = {};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The great bushy tail: one plump tube shaped like a question mark — up from her bottom, along her back
 * and curling over at the top — rust, going lighter at the curl.
 */
function tailGeo() {
  const pts = [[0, 0, 0], [0, 0.07, -0.075], [0, 0.18, -0.105], [0, 0.29, -0.075], [0, 0.35, 0.0], [0, 0.32, 0.075], [0, 0.26, 0.1]];
  const r = (t) => 0.068 * (0.42 + 0.58 * smooth(0, 0.3, t)) * (1 - 0.72 * smooth(0.82, 1, t)) * (1 + 0.05 * Math.sin(t * Math.PI * 3));
  return bake([
    { geo: profileTube(pts, r, 40, 16), colors: (i, v) => (v.y > 0.27 && v.z > -0.03 ? TIP : RUST) },
    [SPHERE, TIP, [0, 0.26, 0.1], [0, 0, 0], [0.02, 0.02, 0.02]],              // (a rounded tip)
    [SPHERE, RUST, [0, 0.005, 0.0], [0, 0, 0], [0.03, 0.03, 0.03]],             // (and a rounded root)
  ]);
}

function parts(kind) {
  if (cache[kind]) return cache[kind];
  const nut = kind === 'nut';
  const body = bake([
    [SPHERE, RUST, [0, 0.105, 0], [0.25, 0, 0], [0.075, 0.088, 0.1]],
    [SPHERE, CREAM, [0, 0.1, 0.045], [0.25, 0, 0], [0.058, 0.07, 0.065]],          // tummy
    [SPHERE, RUST, [0.045, 0.065, -0.035], [0, 0, 0], [0.048, 0.055, 0.068]],    // haunches
    [SPHERE, RUST, [-0.045, 0.065, -0.035], [0, 0, 0], [0.048, 0.055, 0.068]],
    [SPHERE, DARK, [0.048, 0.013, 0.012], [0, 0, 0], [0.022, 0.014, 0.052]],     // big back feet
    [SPHERE, DARK, [-0.048, 0.013, 0.012], [0, 0, 0], [0.022, 0.014, 0.052]],
    [new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), RUST, [0.028, 0.115, 0.085], [0.9, 0, -0.25]], // little arms
    [new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), RUST, [-0.028, 0.115, 0.085], [0.9, 0, 0.25]],
    ...(nut ? [ // Nut always has an acorn on the go
      [SPHERE, 0x9a6a3a, [0, 0.118, 0.115], [0, 0, 0], [0.019, 0.024, 0.019]],
      [SPHERE, 0x6e4a2a, [0, 0.137, 0.115], [0, 0, 0], [0.022, 0.012, 0.022]],
    ] : []),
  ]);
  const head = bake([
    [SPHERE, RUST, [0, 0, 0], [0, 0, 0], [0.058, 0.055, 0.06]],
    [SPHERE, CREAM, [0.027, -0.02, 0.034], [0, 0, 0], [0.03, 0.026, 0.03]],     // chubby cheeks
    [SPHERE, CREAM, [-0.027, -0.02, 0.034], [0, 0, 0], [0.03, 0.026, 0.03]],
    [SPHERE, CREAM, [0, -0.016, 0.052], [0, 0, 0], [0.026, 0.021, 0.025]],      // muzzle
    [SPHERE, 0x4a2a24, [0, -0.004, 0.076], [0, 0, 0], [0.01, 0.008, 0.008]],   // nose
    [SPHERE, EYE, [0.03, 0.013, 0.044], [0, 0, 0], [0.016, 0.019, 0.012]],     // big shiny eyes
    [SPHERE, EYE, [-0.03, 0.013, 0.044], [0, 0, 0], [0.016, 0.019, 0.012]],
    [SPHERE, 0xffffff, [0.035, 0.02, 0.055], [0, 0, 0], [0.005, 0.005, 0.003]],
    [SPHERE, 0xffffff, [-0.025, 0.02, 0.055], [0, 0, 0], [0.005, 0.005, 0.003]],
    [new THREE.ConeGeometry(0.018, 0.045, 12), RUST, [0.031, 0.05, -0.008], [-0.15, 0, -0.25]], // ears…
    [new THREE.ConeGeometry(0.018, 0.045, 12), RUST, [-0.031, 0.05, -0.008], [-0.15, 0, 0.25]],
    [new THREE.ConeGeometry(0.01, 0.03, 8), 0xe8a2a0, [0.031, 0.048, -0.002], [-0.15, 0, -0.25]],
    [new THREE.ConeGeometry(0.01, 0.03, 8), 0xe8a2a0, [-0.031, 0.048, -0.002], [-0.15, 0, 0.25]],
    [new THREE.ConeGeometry(0.008, 0.03, 6), DARK, [0.037, 0.083, -0.012], [-0.1, 0, -0.35]], // …with tufts
    [new THREE.ConeGeometry(0.008, 0.03, 6), DARK, [-0.037, 0.083, -0.012], [-0.1, 0, 0.35]],
    ...(nut ? [] : [ // Meg wears a pink bow
      [SPHERE, 0xf2a0b4, [-0.05, 0.05, 0.0], [0, 0, 0.6], [0.02, 0.012, 0.012]],
      [SPHERE, 0xf2a0b4, [-0.028, 0.068, 0.0], [0, 0, 0.6], [0.02, 0.012, 0.012]],
      [SPHERE, 0xe58aa0, [-0.04, 0.06, 0.0], [0, 0, 0], [0.009, 0.009, 0.009]],
    ]),
  ]);
  return (cache[kind] = { body, head, tail: tailGeo() });
}

/**
 * Nut or Meg, the squirrel twins: rusty red, chubby-cheeked, with an enormous bushy tail. Faces +Z,
 * feet on the ground. Modes: sit (upright, tail curled over), run (bounding, tail streaming), climb
 * (up a trunk: belly to the bark, nose to the sky) and hide (tucked up in the leaves, tail dangling).
 */
export class Squirrel {
  constructor(kind = 'nut') {
    const P = parts(kind);
    this.root = new THREE.Group();
    this.pose = group(this.root);            // tilts for climbing
    this.body = group(this.pose);            // bounces and wiggles
    bakedMesh(P.body, this.body);
    this.head = group(this.body, [0, 0.2, 0.07]);
    bakedMesh(P.head, this.head);
    this.tail = group(this.body, [0, 0.07, -0.085]);
    bakedMesh(P.tail, this.tail);
    this.root.scale.setScalar(1.25); // (a little bigger than life, so they're easy to spot)
    this.mode = 'sit';
    this.t = Math.random() * 10;
    this.giggleT = 0;
    this.moving = 0;
  }

  /** Hee hee! A wriggly, tail-swishing giggle. */
  giggle(secs = 1.1) { this.giggleT = secs; }

  update(dt, { moving = 0 } = {}) {
    this.t += dt;
    const t = this.t, m = this.mode;
    this.moving += (moving - this.moving) * (1 - Math.exp(-dt * 10));
    const run = m === 'run' ? Math.min(1, this.moving) : 0, climb = m === 'climb';
    this.giggleT = Math.max(0, this.giggleT - dt);
    const gg = this.giggleT > 0 ? Math.min(1, this.giggleT * 3) : 0;
    // Bounding: the whole body arcs and hops, tail streaming out behind.
    const hop = Math.abs(Math.sin(t * 15)) * run;
    this.pose.rotation.x = climb ? -Math.PI / 2 : 0;
    this.body.position.y = hop * 0.06 + (climb ? Math.abs(Math.sin(t * 16)) * 0.02 : 0);
    this.body.rotation.x = run * (0.75 + Math.sin(t * 15) * 0.25); // leaning forward to run
    this.body.rotation.z = Math.sin(t * 42) * 0.14 * gg;
    // Head: nibbling and looking about when sitting; a wiggle when giggling.
    const nibble = m === 'sit' && Math.sin(t * 0.8) > 0.6 ? Math.sin(t * 24) * 0.05 : 0;
    this.head.rotation.x = -run * 0.6 + nibble + (m === 'hide' ? 0.4 : 0);
    this.head.rotation.y = m === 'sit' ? Math.sin(t * 0.9) * 0.5 : 0;
    this.head.rotation.z = Math.sin(t * 30) * 0.15 * gg;
    // Tail: curled up behind when sitting, out behind when running, hanging down when hiding.
    const flick = m === 'sit' && Math.sin(t * 0.37) > 0.92 ? -0.35 : 0; // a flick now and then
    const sway = Math.sin(t * (gg ? 20 : 2.2)) * (gg ? 0.3 : 0.08);
    this.tail.rotation.x = m === 'hide' ? 2.6 + Math.sin(t * 1.7) * 0.1 : -run * 1.2 + (climb ? 0.5 : 0) + sway + flick + Math.sin(t * 15) * 0.15 * run;
    this.tail.rotation.z = Math.sin(t * 1.3) * 0.08 + Math.sin(t * 25) * 0.25 * gg;
  }
}
