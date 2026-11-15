import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Glowing beads that flow from Merry's nose toward a goal while she sniffs. */
export class ScentTrail {
  constructor(scene, { count = 42, maxLen = 9 } = {}) {
    this.count = count;
    this.maxLen = maxLen;
    this.time = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), paint(0xffffff, { emissive: 0x6a4a20 }), count);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, c.set(i % 3 ? 0xf6c25a : 0xf29ab0));
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
  }

  /** @param amt 0..1 how strongly she's sniffing; goal: Vector3 or null */
  update(dt, amt, nose, goal) {
    this.time += dt;
    if (!goal || amt < 0.02) { this.mesh.count = 0; return; }
    this.mesh.count = this.count;
    const end = goal.clone().setY(0.15);
    const dir = end.clone().sub(nose);
    if (dir.length() > this.maxLen) end.copy(nose).addScaledVector(dir.normalize(), this.maxLen);
    const side = V(-(end.z - nose.z), 0, end.x - nose.x).normalize();
    const mid = nose.clone().lerp(end, 0.5).addScaledVector(side, Math.sin(this.time * 0.7) * 0.5).add(V(0, 0.5, 0));
    const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const u = (i / this.count + this.time * 0.3) % 1;
      a.copy(nose).lerp(mid, u);
      b.copy(mid).lerp(end, u);
      p.copy(a).lerp(b, u);
      p.addScaledVector(side, Math.sin(u * 14 + this.time * 3 + i) * 0.07);
      p.y += Math.sin(u * 9 + this.time * 2) * 0.05;
      const sz = 0.07 * amt * Math.sqrt(Math.sin(u * Math.PI)) * (0.8 + 0.3 * Math.sin(this.time * 6 + i));
      this._m.compose(p, this._q, this._s.set(sz, sz, sz));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
