import * as THREE from 'three';
import { mesh } from '../world/props.js';
import { mergeRigid } from '../world/merge.js';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Pickles: a smug ginger cat who sits on the fence and makes fun of Merry.
 * Faces +Z. Can hop between fence spots and react to barks.
 */
export class Cat {
  constructor() {
    this.root = new THREE.Group();
    const orange = 0xe39a52, cream = 0xf6e6cf, dark = 0xb9703a;
    this.body = new THREE.Group();
    this.root.add(this.body);
    // Sitting loaf body.
    mesh(new THREE.SphereGeometry(0.13, 24, 16), orange, this.body, [0, 0.13, 0], [0, 0, 0], [0.9, 1.05, 1.1]);
    mesh(new THREE.SphereGeometry(0.09, 18, 12), cream, this.body, [0, 0.13, 0.08], [0, 0, 0], [0.8, 1.1, 0.6]);
    for (const s of [-1, 1]) {
      mesh(new THREE.CapsuleGeometry(0.025, 0.08, 4, 10), orange, this.body, [s * 0.05, 0.05, 0.1]);
      mesh(new THREE.SphereGeometry(0.03, 10, 8), cream, this.body, [s * 0.05, 0.015, 0.12], [0, 0, 0], [1, 0.6, 1.3]);
    }
    // Tabby stripes on the back.
    for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20, Math.PI), dark, this.body, [0, 0.13 + i * 0.06 - 0.05, -0.02], [0, Math.PI / 2, Math.PI / 2], [1, 1, 1.05]);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.3, 0.03);
    this.body.add(this.head);
    mesh(new THREE.SphereGeometry(0.09, 24, 16), orange, this.head, [0, 0, 0], [0, 0, 0], [1.1, 0.95, 1]);
    mesh(new THREE.SphereGeometry(0.05, 14, 10), cream, this.head, [0, -0.03, 0.06], [0, 0, 0], [1.1, 0.7, 0.8]);
    mesh(new THREE.SphereGeometry(0.012, 8, 6), 0xd97a8a, this.head, [0, -0.008, 0.095]);
    this.eyes = [-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.018, 10, 8), 0x9bbf5a, this.head, [s * 0.037, 0.015, 0.075], [0, 0, 0], [1, 0.55, 0.6]));
    this.eyes.forEach((e) => mesh(new THREE.SphereGeometry(0.011, 8, 6), 0x1d1512, e, [0, 0, 0.011], [0, 0, 0], [0.35, 1, 0.5]));
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.035, 0.07, 4), orange, this.head, [s * 0.055, 0.075, -0.01], [0, Math.PI / 4, s * -0.3]);
      mesh(new THREE.ConeGeometry(0.02, 0.04, 4), 0xf2b8b0, ear, [0, -0.005, 0.012], [0, 0, 0]);
      for (let w = 0; w < 2; w++) mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.08, 3), 0xffffff, this.head, [s * 0.07, -0.02 - w * 0.012, 0.07], [0, 0, Math.PI / 2 + s * (0.15 - w * 0.25)]);
    }
    // Tail: hangs down over the fence and swishes.
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.05, -0.12);
    this.body.add(this.tail);
    const pts = [[0, 0, 0], [0, -0.05, -0.06], [0, -0.18, -0.08], [0, -0.3, -0.04]].map((p) => new THREE.Vector3(...p));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 8, false), orange, this.tail);
    mesh(new THREE.SphereGeometry(0.024, 8, 6), dark, this.tail, [0, -0.3, -0.04]);

    this.time = Math.random() * 10;
    this.hop = null;        // {from, to, t, dur}
    this.startle = 0;       // fur-up jump when barked at
    this.laugh = 0;         // shoulders shaking
    this.lookAt = new THREE.Vector3();
    this.bake();
  }

  /**
   * Her ~25 little meshes baked into a few (world/merge.js): body, head and tail (her eyes stay their own: they
   * blink). Call it again after giving her a hat (before she's first drawn) and that joins in too.
   */
  bake() {
    for (const g of [this.head, this.tail, this.body]) for (const o of g.children) if (o.isMesh && !this.eyes.includes(o)) o.castShadow = true; // (a hat added since, too)
    for (const e of this.eyes) e.userData.noMerge = true;
    for (const g of [this.head, this.tail]) { mergeRigid(g); g.userData.noMerge = true; }
    mergeRigid(this.body);
    return this;
  }

  /** Hop along the fence to a new spot. */
  hopTo(pos, yaw) {
    this.hop = { from: this.root.position.clone(), to: pos.clone(), fromYaw: this.root.rotation.y, toYaw: yaw, t: 0, dur: 0.7 };
  }

  update(dt, target) {
    this.time += dt;
    const t = this.time;
    if (this.hop) {
      const h = this.hop;
      h.t += dt / h.dur;
      const k = Math.min(1, h.t);
      this.root.position.lerpVectors(h.from, h.to, k);
      this.root.position.y += Math.sin(k * Math.PI) * 0.6;
      this.root.rotation.y = lerp(h.fromYaw, h.toYaw, k);
      this.body.scale.set(1, k < 0.15 || k > 0.85 ? 0.85 : 1.1, 1);
      if (h.t >= 1) { this.hop = null; this.body.scale.set(1, 1, 1); }
    }
    this.startle = Math.max(0, this.startle - dt * 1.5);
    this.laugh = Math.max(0, this.laugh - dt * 0.6);
    const st = this.startle;
    this.body.position.y = Math.sin(Math.min(1, st) * Math.PI) * 0.25;
    this.body.scale.x = this.hop ? 1 : 1 + st * 0.35; // fur puffs up!
    this.body.rotation.z = Math.sin(t * 30) * 0.04 * this.laugh;
    this.body.position.x = Math.sin(t * 40) * 0.01 * this.laugh;

    // Head follows Merry, with a bored tilt.
    if (target) {
      const local = this.root.worldToLocal(target.clone().setY(target.y + 0.4));
      const yaw = Math.atan2(local.x, local.z);
      const pitch = Math.atan2(local.y - 0.3, Math.hypot(local.x, local.z));
      this.head.rotation.y = lerp(this.head.rotation.y, THREE.MathUtils.clamp(yaw, -1.2, 1.2), 1 - Math.exp(-dt * 4));
      this.head.rotation.x = lerp(this.head.rotation.x, THREE.MathUtils.clamp(-pitch, -0.5, 0.7), 1 - Math.exp(-dt * 4));
    }
    this.head.rotation.z = Math.sin(t * 0.6) * 0.12 + Math.sin(t * 34) * 0.06 * this.laugh;
    this.tail.rotation.z = Math.sin(t * 1.8) * 0.4 + st * Math.sin(t * 20);
    const blink = (t % 4.3) < 0.12 ? 0.15 : 1;
    this.eyes.forEach((e) => (e.scale.y = 0.55 * blink * (1 - this.laugh * 0.6) + st * 0.5));
  }

  /** Head position in world space, for speech bubbles. */
  bubbleAnchor(out) {
    return this.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.22, 0));
  }
}
