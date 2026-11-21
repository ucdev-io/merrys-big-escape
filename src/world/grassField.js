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
    const blade = new THREE.ConeGeometry(0.014, 0.13, 3, 1, true); // (open-ended: its base faces the ground, never seen)
    blade.translate(0, 0.065, 0);
    const parts = [0, 1, 2].map((i) => { const b = blade.clone(); b.rotateZ((i - 1) * 0.35); b.rotateY(i * 2.1); return b; });
    const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    this.mesh = new THREE.InstancedMesh(geo, paint(0xffffff, { kind: 'inst' }), count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0; // (none till the first update puts them)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData.noMerge = true;
    scene.add(this.mesh);
    this.lawnAt = isLawn;
    this.out = new Map(); // key → { x, z, r2 }: little circles kept clear (the dog bowl)
    this.isLawn = (x, z) => this.lawnAt(x, z) && !this.kept(x, z);
    this.tile = tile;
    this.y = y;
    this.last = new THREE.Vector2(Infinity, Infinity);

    // Fixed random layout inside one tile.
    let s = 12345;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const cols = [PALETTE.grass, PALETTE.grassLight, 0x8fb565].map((c) => new THREE.Color(c));
    this.items = [];
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const it = { ox: r() * tile, oz: r() * tile, rot: r() * 6.28, s: 0.6 + r() * 0.7, sy: 0.7 + r() * 0.6, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3 };
      it.q = new THREE.Quaternion().setFromEuler(e.set(it.tx, it.rot, it.tz)); // (its lean never changes)
      it.kx = it.kz = NaN; it.lawn = false; it.sc = -1; // (where it was last put, and how big)
      it.m = new Float32Array(16); it.c = cols[i % 3]; // (its matrix as last put, and its colour)
      this.items.push(it);
      this.mesh.setColorAt(i, it.c);
    }
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  kept(x, z) {
    for (const c of this.out.values()) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r2) return true;
    return false;
  }

  /** Keep the grass out of a circle (or let it back, with r = 0), e.g. so it doesn't grow up through the dog bowl. */
  keepOut(key, x, z, r) {
    if (r > 0) this.out.set(key, { x, z, r2: r * r });
    else this.out.delete(key);
    for (const it of this.items) it.kx = NaN; // (tufts only look at the lawn when they move: make them all look again)
    this.last.set(Infinity, Infinity);
  }

  /**
   * Each tuft sits at its own spot plus a whole number of tiles, in the tile centred on the dog. As she
   * walks, most tufts stay exactly where they are at full size, so only the few that wrap round to the
   * far side, or fade in and out at the edge, are put again (and the lawn's only asked about new spots).
   */
  update(px, pz) {
    if (Math.abs(px - this.last.x) < 0.5 && Math.abs(pz - this.last.y) < 0.5) return; // only when she's moved
    this.last.set(px, pz);
    const T = this.tile, half = T / 2;
    let changed = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const kx = Math.ceil((px - half - it.ox) / T), kz = Math.ceil((pz - half - it.oz) / T);
      const x = it.ox + kx * T, z = it.oz + kz * T;
      const moved = kx !== it.kx || kz !== it.kz; // (wrapped round, or the dog popped somewhere new)
      if (moved) { it.kx = kx; it.kz = kz; it.lawn = this.isLawn(x, z); }
      const sc = it.lawn ? it.s * Math.min(1, Math.max(0, (half - Math.hypot(x - px, z - pz)) / 4)) : 0;
      if (sc === it.sc && !moved) continue;
      it.sc = sc;
      if (sc > 0) this._m.compose(this._p.set(x, this.y, z), it.q, this._s.set(sc, sc * it.sy, sc)).toArray(it.m);
      changed = true;
    }
    if (!changed) return;
    // Only the tufts that show (about a third: the rest are off the lawn), packed at the front of the list and
    // the rest left off: hidden ones were still drawn, shrunk to nothing, and the whole list sent every time.
    const M = this.mesh.instanceMatrix, C = this.mesh.instanceColor, ma = M.array, ca = C.array;
    let n = 0;
    for (const it of this.items) {
      if (!(it.sc > 0)) continue;
      ma.set(it.m, n * 16);
      ca[n * 3] = it.c.r; ca[n * 3 + 1] = it.c.g; ca[n * 3 + 2] = it.c.b;
      n++;
    }
    this.mesh.count = n;
    M.clearUpdateRanges(); M.addUpdateRange(0, n * 16); M.needsUpdate = true;
    C.clearUpdateRanges(); C.addUpdateRange(0, n * 3); C.needsUpdate = true;
  }
}
