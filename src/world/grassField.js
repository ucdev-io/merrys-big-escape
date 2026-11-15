import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { PALETTE } from '../render/palette.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Dense grass that only exists near the player: a fixed set of tufts tiled on a wrapping
 * grid around the dog, hidden wherever `isLawn(x, z)` says there's no lawn.
 * Lush close up, no cost far away.
 */
export class GrassField {
  constructor(scene, isLawn, { count = 7000, tile = 44, y = 0.05 } = {}) {
    const blade = new THREE.ConeGeometry(0.014, 0.13, 3, 1);
    blade.translate(0, 0.065, 0);
    const parts = [0, 1, 2].map((i) => { const b = blade.clone(); b.rotateZ((i - 1) * 0.35); b.rotateY(i * 2.1); return b; });
    const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    this.mesh = new THREE.InstancedMesh(geo, paint(0xffffff), count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.userData.noMerge = true;
    scene.add(this.mesh);
    this.isLawn = isLawn;
    this.tile = tile;
    this.y = y;
    this.last = new THREE.Vector2(Infinity, Infinity);

    // Fixed random layout inside one tile.
    let s = 12345;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const cols = [PALETTE.grass, PALETTE.grassLight, 0x8fb565].map((c) => new THREE.Color(c));
    this.items = [];
    for (let i = 0; i < count; i++) {
      this.items.push({ ox: r() * tile, oz: r() * tile, rot: r() * 6.28, s: 0.6 + r() * 0.7, sy: 0.7 + r() * 0.6, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3 });
      this.mesh.setColorAt(i, cols[i % 3]);
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  update(px, pz) {
    if (Math.abs(px - this.last.x) < 0.5 && Math.abs(pz - this.last.y) < 0.5) return; // only when she's moved
    this.last.set(px, pz);
    const T = this.tile, half = T / 2;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      // Wrap each tuft into the tile centred on the dog.
      const x = px + ((((it.ox - px) % T) + T * 1.5) % T) - half;
      const z = pz + ((((it.oz - pz) % T) + T * 1.5) % T) - half;
      const d = Math.hypot(x - px, z - pz);
      let sc = this.isLawn(x, z) ? it.s * Math.min(1, Math.max(0, (half - d) / 4)) : 0;
      this._q.setFromEuler(this._e.set(it.tx, it.rot, it.tz));
      this._m.compose(this._p.set(x, this.y, z), this._q, this._s.set(sc, sc * it.sy, sc));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
