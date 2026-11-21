import * as THREE from 'three';
import { bake, bakedMesh, group } from './shapes.js';

const FACE = 0xdcb48c, FUR = 0x6e5240, BASE = 0x6a4e3c, TIP = 0xd9c4a2, NOSE = 0x1d1614, PINK = 0xe8a49a;
let cache = null;
// (She's a hand's length long: her face and body need only middling spheres, her eyes, nose and cheeks little ones.
// Full-size spheres made her 21,000 triangles; now about 6,000, and she looks the same.)
const MID = new THREE.SphereGeometry(1, 16, 11), LOW = new THREE.SphereGeometry(1, 9, 6);

/**
 * Spines on an egg shape: little cones pointing out (and swept back), dark at the root, pale at the tip.
 * keep(n): which way-out directions get spines (the back and sides; for a curled-up ball, all round).
 */
function spines(rx, ry, rz, cy, cz, count, keep, sweep = 0.9) {
  const parts = [], cone = new THREE.ConeGeometry(0.014, 0.05, 6, 1, true); // (open: its base is always inside her)
  cone.translate(0, 0.025, 0); // (base at the origin, pointing up)
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), e = new THREE.Euler();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2, r = Math.sqrt(1 - y * y), a = golden * i;
    const n = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (!keep(n)) continue;
    const at = [n.x * rx, cy + n.y * ry, cz + n.z * rz];
    const dir = n.clone().add(new THREE.Vector3(0, 0.15, -sweep)).normalize(); // swept back, like a hedgehog's
    parts.push({ geo: cone, pos: at, rot: e.setFromQuaternion(q.setFromUnitVectors(up, dir)).toArray().slice(0, 3), colors: (k, v) => {
      const d = Math.hypot(v.x / rx, (v.y - cy) / ry, (v.z - cz) / rz);
      return d > 1.27 ? TIP : BASE;
    } });
  }
  return parts;
}

function build() {
  if (cache) return cache;
  // Walking: a round, prickly back over a pale face and tummy.
  const body = bake([
    [MID, FACE, [0, 0.085, 0.01], [0, 0, 0], [0.105, 0.078, 0.135]],          // tummy and face fur
    [MID, FUR, [0, 0.105, -0.02], [0, 0, 0], [0.124, 0.106, 0.15]],           // under the spines
    ...spines(0.112, 0.096, 0.14, 0.105, -0.02, 460, (n) => n.y > -0.2 && n.z < 0.84 - Math.max(0, -n.y) * 0.6), // (from her forehead to her bottom)
  ]);
  const head = bake([
    [MID, FACE, [0, 0, 0.03], [0, 0, 0], [0.06, 0.055, 0.075]],                // a pointy face…
    [new THREE.ConeGeometry(0.035, 0.07, 14), FACE, [0, -0.008, 0.1], [Math.PI / 2, 0, 0]],
    [LOW, NOSE, [0, -0.006, 0.14], [0, 0, 0], [0.022, 0.019, 0.019]],          // …with a little black nose
    [LOW, 0xffffff, [0.007, 0.003, 0.155], [0, 0, 0], [0.005, 0.005, 0.003]],
    [LOW, NOSE, [0.03, 0.022, 0.07], [0, 0, 0], [0.013, 0.015, 0.01]],          // shiny black eyes
    [LOW, NOSE, [-0.03, 0.022, 0.07], [0, 0, 0], [0.013, 0.015, 0.01]],
    [LOW, 0xffffff, [0.033, 0.027, 0.077], [0, 0, 0], [0.0035, 0.0035, 0.002]],
    [LOW, 0xffffff, [-0.027, 0.027, 0.077], [0, 0, 0], [0.0035, 0.0035, 0.002]],
    [LOW, PINK, [0.038, 0.0, 0.06], [0, 0, 0], [0.012, 0.008, 0.008]],          // rosy cheeks
    [LOW, PINK, [-0.038, 0.0, 0.06], [0, 0, 0], [0.012, 0.008, 0.008]],
    [LOW, FACE, [0.045, 0.045, 0.01], [0, 0, 0], [0.016, 0.019, 0.009]],        // round ears
    [LOW, FACE, [-0.045, 0.045, 0.01], [0, 0, 0], [0.016, 0.019, 0.009]],
  ]);
  const foot = bake([[LOW, PINK, [0, 0.012, 0.012], [0, 0, 0], [0.018, 0.014, 0.026]]]);
  // Curled up: a tight ball, prickles all round.
  const ball = bake([
    [MID, FUR, [0, 0, 0], [0, 0, 0], [0.112, 0.108, 0.116]],
    ...spines(0.104, 0.1, 0.108, 0, 0, 380, (n) => n.y > -0.75, 0.3),
  ]);
  return (cache = { body, head, foot, ball });
}

/**
 * Pepper the hedgehog: a round, prickly little thing with a pointy face and a little black nose. Faces
 * +Z. Pitter-patters along, snuffles about, and when something scary comes along — pop! — she's a ball.
 */
export class Hedgehog {
  constructor() {
    const B = build();
    this.root = new THREE.Group();
    this.walk = group(this.root);              // the walking hedgehog
    this.body = group(this.walk);
    bakedMesh(B.body, this.body);
    this.head = group(this.body, [0, 0.085, 0.12]);
    bakedMesh(B.head, this.head);
    this.feet = [[0.055, 0.06], [-0.055, 0.06], [0.06, -0.07], [-0.06, -0.07]].map(([x, z]) => bakedMesh(B.foot, this.walk, [x, 0, z]));
    this.ball = bakedMesh(B.ball, this.root, [0, 0.11, 0]); // …and the curled-up one
    this.ball.scale.setScalar(0.01);
    this.ball.visible = false;
    this.root.scale.setScalar(1.15); // (a touch bigger than life, to be easy to see)
    this.curl = 0;      // 0 = walking, 1 = curled up tight
    this.curled = false;
    this.t = Math.random() * 10;
  }

  update(dt, { moving = 0, snuffle = false } = {}) {
    this.t += dt;
    const t = this.t;
    this.curl += ((this.curled ? 1 : 0) - this.curl) * (1 - Math.exp(-dt * (this.curled ? 14 : 5)));
    const c = this.curl;
    // Pop into a ball (and back): the walking shape shrinks away as the prickly ball swells.
    this.walk.scale.setScalar(Math.max(0.01, 1 - c));
    this.walk.visible = c < 0.98;
    this.ball.visible = c > 0.02;
    this.ball.scale.setScalar(Math.max(0.01, c) * (1 + (this.curled ? Math.sin(t * 40) * 0.02 : 0))); // (trembling)
    this.ball.rotation.x = c * 0.4;
    // Pitter-patter: tiny feet going like the clappers, the body swaying.
    const step = t * 18;
    this.feet.forEach((f, i) => { f.position.y = Math.max(0, Math.sin(step + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0))) * 0.022 * moving; });
    this.body.position.y = Math.abs(Math.sin(step)) * 0.008 * moving;
    this.body.rotation.z = Math.sin(step / 2) * 0.06 * moving;
    // Snuffling: the nose goes down to the ground and wiggles.
    const sn = snuffle || moving < 0.1 ? 1 : 0;
    this.head.rotation.x = 0.25 * sn + Math.sin(t * 13) * 0.06 * sn;
    this.head.rotation.y = Math.sin(t * 1.1) * 0.35 * sn + Math.sin(t * 9) * 0.04;
  }
}
