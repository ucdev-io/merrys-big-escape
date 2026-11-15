import * as THREE from 'three';
import { SPHERE, bake, bakedMesh, group } from './shapes.js';

const BODY = 0x8a6644, BELLY = 0xc9a77c, DISC = 0xe6d2b0, DARK = 0x4e3826, EYE = 0x1d1614, BEAK = 0xd9b45a, FEET = 0xd9b45a;
let cache = null;

function build() {
  if (cache) return cache;
  // A round tawny owl: speckled brown back, a pale streaky front.
  const speckle = (base, alt) => (i, v) => ((Math.floor(v.x * 160) + Math.floor(v.y * 140) + Math.floor(v.z * 150)) % 5 === 0 ? alt : base);
  const body = bake([
    { geo: SPHERE, color: BODY, pos: [0, 0.16, 0], scale: [0.15, 0.19, 0.14], colors: speckle(BODY, DARK) },
    { geo: SPHERE, color: BELLY, pos: [0, 0.14, 0.05], scale: [0.115, 0.15, 0.1], colors: (i, v) => (Math.abs(Math.sin(v.y * 90)) > 0.85 ? 0xa88660 : BELLY) },
    [SPHERE, BODY, [0, 0.05, -0.1], [-0.5, 0, 0], [0.06, 0.02, 0.09]],          // tail
    [SPHERE, FEET, [0.04, 0.0, 0.06], [0, 0, 0], [0.025, 0.014, 0.035]],          // toes round the branch
    [SPHERE, FEET, [-0.04, 0.0, 0.06], [0, 0, 0], [0.025, 0.014, 0.035]],
  ]);
  const wing = bake([{ geo: SPHERE, color: BODY, pos: [0, 0, 0], scale: [0.04, 0.15, 0.11], colors: speckle(BODY, 0xd8c09a) }]);
  const head = bake([
    { geo: SPHERE, color: BODY, pos: [0, 0, 0], scale: [0.12, 0.105, 0.11], colors: speckle(BODY, DARK) },
    [SPHERE, DISC, [0.045, -0.005, 0.07], [0, 0.35, 0], [0.055, 0.065, 0.035]],   // the pale face, two round dishes
    [SPHERE, DISC, [-0.045, -0.005, 0.07], [0, -0.35, 0], [0.055, 0.065, 0.035]],
    [SPHERE, DARK, [0, 0.02, 0.095], [0, 0, 0], [0.012, 0.045, 0.012]],           // the dark line between them
    [new THREE.ConeGeometry(0.014, 0.04, 8), BEAK, [0, -0.02, 0.105], [Math.PI / 2 + 0.5, 0, 0]],
  ]);
  const eye = bake([
    [SPHERE, EYE, [0, 0, 0], [0, 0, 0], [0.028, 0.03, 0.016]],
    [SPHERE, 0xffffff, [0.008, 0.01, 0.012], [0, 0, 0], [0.007, 0.007, 0.005]],
  ]);
  const lid = bake([[SPHERE, BODY, [0, 0, 0], [0, 0, 0], [0.032, 0.034, 0.02]]]);
  return (cache = { body, wing, head, eye, lid });
}

/**
 * The owl in the wood: a round tawny owl on a branch. Faces +Z. Asleep (it's daytime), it dozes with its
 * eyes shut; woof and it wakes with a start, fluffs right up, and turns its head to see who it was —
 * further round than seems quite possible, if you go round behind it.
 */
export class Owl {
  constructor() {
    const B = build();
    this.root = new THREE.Group();
    this.body = group(this.root);
    bakedMesh(B.body, this.body);
    this.wings = [-1, 1].map((s) => { const w = group(this.body, [s * 0.13, 0.16, -0.01], [0, 0, s * 0.12]); bakedMesh(B.wing, w); return w; });
    this.head = group(this.body, [0, 0.36, 0.0]);
    bakedMesh(B.head, this.head);
    this.eyes = [-1, 1].map((s) => bakedMesh(B.eye, this.head, [s * 0.045, 0.0, 0.098]));
    this.lids = [-1, 1].map((s) => bakedMesh(B.lid, this.head, [s * 0.045, 0.0, 0.1]));
    this.t = Math.random() * 10;
    this.awake = 0;    // 0 asleep … 1 wide awake
    this.wantAwake = false;
    this.puff = 0;     // fluffed up after a fright
    this.look = 0;     // where the head points (radians from straight ahead)
    this.lookTo = 0;
    this.blinkT = 2;
  }

  /** Woken with a start: fluff up! */
  startle() { this.puff = 1; this.wantAwake = true; }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.awake += ((this.wantAwake ? 1 : 0) - this.awake) * (1 - Math.exp(-dt * (this.wantAwake ? 9 : 1.2)));
    this.puff = Math.max(0, this.puff - dt * 1.1);
    // Breathing, and a big fluff-up that settles with a shiver.
    const breathe = 1 + Math.sin(t * 1.7) * 0.015, fluff = 1 + this.puff * 0.28 + Math.sin(t * 38) * 0.05 * this.puff;
    this.body.scale.set(fluff * breathe, breathe * (1 + this.puff * 0.12), fluff * breathe);
    this.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.12 + this.puff * 0.5); });
    // Eyes: shut when asleep; a blink now and then when awake.
    this.blinkT -= dt;
    if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 3;
    const blink = this.blinkT < 0.12 ? 1 : 0;
    const shut = Math.max(1 - this.awake, blink);
    for (const l of this.lids) { l.scale.y = Math.max(0.05, shut); l.visible = shut > 0.06; }
    // The head: droops when dozing, swivels round to follow things when awake (owls can turn a long way).
    this.look += (this.lookTo * this.awake - this.look) * (1 - Math.exp(-dt * 5));
    this.head.rotation.y = this.look;
    this.head.rotation.x = (1 - this.awake) * 0.35 + Math.sin(t * 0.8) * 0.03;
    this.head.rotation.z = Math.sin(t * 0.6) * 0.06 * (1 - this.awake) + (this.puff > 0.5 ? Math.sin(t * 20) * 0.1 : 0);
  }
}
