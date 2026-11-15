import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

/**
 * A pool of little painted blobs (dirt clods, water drops, sparkles, smell puffs).
 * One draw call per pool.
 */
export class Particles {
  constructor(scene, { max = 300, geometry, emissive = false, shadows = false } = {}) {
    const geo = geometry ?? new THREE.IcosahedronGeometry(1, 1);
    const mat = emissive ? paint(0xffffff, { emissive: 0x332211 }) : paint(0xffffff);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.mesh);
    this.items = [];
    this.max = max;
  }

  /**
   * @param {object} o  pos, vel, life, size, color, gravity, drag, grow, floor, spin
   */
  spawn(o) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      pos: o.pos.clone(),
      vel: o.vel ? o.vel.clone() : new THREE.Vector3(),
      life: o.life ?? 1, age: 0,
      size: o.size ?? 0.05,
      color: new THREE.Color(o.color ?? 0xffffff),
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 0,
      grow: o.grow ?? 0,
      floor: o.floor ?? -Infinity,
      rot: o.flat ? new THREE.Euler(0, Math.random() * 6.28, 0) : new THREE.Euler(Math.random() * 3, Math.random() * 3, 0), // flat: lies on the ground/water
      squash: o.squash ?? 1,
      attract: o.attract ?? null,
    });
  }

  burst(n, fn) { for (let i = 0; i < n; i++) this.spawn(fn(i)); }

  update(dt) {
    let n = 0;
    const keep = [];
    for (const p of this.items) {
      p.age += dt;
      if (p.age >= p.life) continue;
      keep.push(p);
      p.vel.y -= p.gravity * dt;
      if (p.attract) p.vel.lerp(p.attract.clone().sub(p.pos).multiplyScalar(1.5), 1 - Math.exp(-dt * 2));
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) { p.pos.y = p.floor; p.vel.set(p.vel.x * 0.3, Math.abs(p.vel.y) * 0.25, p.vel.z * 0.3); }
      const t = p.age / p.life;
      const fade = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
      const s = p.size * (1 + p.grow * t) * Math.max(0.001, fade);
      _q.setFromEuler(p.rot);
      _m.compose(p.pos, _q, _s.set(s, s * p.squash, s));
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.items = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
