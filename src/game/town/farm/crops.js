import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG } from '../../../core/rng.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { dressSeason } from '../../../world/merge.js';
import { bake } from '../../../entities/shapes.js';
import { pumpkinGeometry } from '../../seasons/models.js';

/*
 * 🌱🌾🎃 What's growing on the Farm, season by season: green shoots in rows in spring; tall golden wheat
 * (with poppies) in summer, to run through; pumpkins in the patch by the gate in autumn (and stubble where
 * the wheat was), apples in the orchard; and in winter, nothing but snowy furrows. Rebuilt when the season
 * changes; a few instanced meshes, hidden when you're nowhere near.
 */

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Stalk shapes (radius, height up a unit-tall stalk): wheat has a plump ear on top; shoots and stubble don't.
const EAR = [[0.016, 0], [0.012, 0.58], [0.034, 0.68], [0.03, 0.86], [0.0, 1]];
const BLADE = [[0.022, 0], [0.014, 0.55], [0.0, 1]];

/** A clump of stalks (unit height): `base` colour at the bottom, `tip` at the top (wheat ears, or new leaves). */
function clumpGeometry(base, tip, n = 6, profile = EAR) {
  const parts = [], cb = new THREE.Color(base), ct = new THREE.Color(tip);
  for (let i = 0; i < n; i++) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 3); // (three sides: plenty, this thin)
    g.rotateZ(((i % 3) - 1) * 0.14 + Math.sin(i * 2.3) * 0.08);
    g.rotateY(i * 2.4);
    g.translate(Math.cos(i * 2.4) * 0.06, 0, Math.sin(i * 2.4) * 0.06);
    g.scale(1, 0.85 + (i % 3) * 0.08, 1);
    const p = g.attributes.position, col = [];
    for (let k = 0; k < p.count; k++) { const t = p.getY(k); _c.copy(cb).lerp(ct, Math.min(1, Math.max(0, (t - 0.5) * 3))); col.push(_c.r, _c.g, _c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const out = mergeGeometries(parts); // (kept indexed: the shared corners are only worked out once)
  out.computeVertexNormals();
  return out;
}

export class Crops {
  constructor({ scene, area }) {
    Object.assign(this, { scene, area });
    this.objects = [];
    this.season = null;
    this.field = area.cropField;
    const F = this.field;
    this.mid = new THREE.Vector3((F.rect.x0 + F.rect.x1) / 2, 0, (F.rect.z0 + F.rect.z1) / 2);
    this.radius = Math.hypot(F.rect.x1 - F.rect.x0, F.rect.z1 - F.rect.z0) / 2;
    this.wheat = false;
  }

  add(o) { o.castShadow = false; o.receiveShadow = true; this.scene.add(o); this.objects.push(o); return o; }

  clear() { for (const o of this.objects) o.removeFromParent(); this.objects = []; this.wheat = false; }

  /** Rows of clumps along the furrows (every other ridge), `step` apart along them, up to about `max` of them. */
  rows(geo, h, { step = 0.9, max = 1200, skip = null, rng, lean = 0.12, color = null, fat = 0.9 } = {}) {
    const F = this.field, W = this.area.W;
    const u0 = F.u0 + 0.75, u1 = F.u1 - 0.75, v0 = F.v0 + 1.2, v1 = F.v1 - 1.2;
    let du = 0.68, dv = step;
    while (((u1 - u0) / du) * ((v1 - v0) / dv) > max) { du += 0.34; dv *= 1.06; }
    const spots = [];
    for (let u = u0; u <= u1; u += du) for (let v = v0 + rng.float(0, dv); v <= v1; v += dv) if (!skip?.(u, v)) spots.push([u, v]);
    const m = new THREE.InstancedMesh(geo, paint(0xffffff, { vertexColors: true }), Math.max(1, spots.length));
    spots.forEach(([u, v], i) => {
      const [x, z] = W(u + rng.float(-0.08, 0.08), v + rng.float(-0.15, 0.15)), k = h * rng.float(0.85, 1.12);
      _q.setFromEuler(_e.set(rng.float(-lean, lean), rng.float(0, 6.28), rng.float(-lean, lean)));
      m.setMatrixAt(i, _m.compose(_p.set(x, 0.0, z), _q, _s.set(k * fat, k, k * fat)));
      if (color) m.setColorAt(i, _c.set(color[i % color.length]));
    });
    m.count = spots.length;
    m.computeBoundingSphere();
    return this.add(m);
  }

  /** Build what grows this season. */
  set(name) {
    if (name === this.season) return;
    this.season = name;
    this.clear();
    const rng = new RNG(`crops:${this.area.layout.seed}:${name}`), A = this.area, P = this.inPatch.bind(this);
    if (name === 'spring') {
      this.rows(clumpGeometry(0x5f8a48, 0xa9c97a, 5, BLADE), 0.22, { step: 0.5, max: 1500, rng, lean: 0.25 });
    } else if (name === 'summer') {
      this.rows(clumpGeometry(0xc9a95a, 0xf2d488, 6), 0.95, { step: 0.6, max: 1100, rng, fat: 1.5 });
      this.wheat = true;
      // Poppies here and there among the wheat.
      const n = 70, stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.01, 1, 3), paint(0x6f9a52), n), heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), paint(0xd9433a), n);
      const F = this.field;
      for (let i = 0; i < n; i++) {
        const [x, z] = A.W(rng.float(F.u0 + 1, F.u1 - 1), rng.float(F.v0 + 1, F.v1 - 1)), h = rng.float(0.85, 1.1);
        stems.setMatrixAt(i, _m.makeScale(1, h, 1).setPosition(x, h / 2, z));
        heads.setMatrixAt(i, _m.makeScale(0.06, 0.035, 0.06).setPosition(x, h, z));
      }
      stems.computeBoundingSphere(); heads.computeBoundingSphere();
      this.add(stems); this.add(heads);
    } else if (name === 'autumn') {
      // Stubble where the wheat was (not in the pumpkin patch), and pumpkins in the patch.
      this.rows(clumpGeometry(0xb8a060, 0xe0c888, 5, BLADE), 0.16, { step: 0.6, max: 1200, rng, skip: (u, v) => P(u, v), lean: 0.3 });
      const pts = [], r = this.area.layout.patch;
      for (let t = 0; t < 120 && pts.length < 16; t++) {
        const u = rng.float(r.u0 + 0.8, r.u1 - 0.8), v = rng.float(r.v0 + 0.8, r.v1 - 0.8);
        if (pts.some(([a, b]) => Math.hypot(a - u, b - v) < 1.6)) continue;
        pts.push([u, v]);
      }
      const pumpkins = new THREE.InstancedMesh(pumpkinGeometry(), paint(0xffffff, { vertexColors: true }), Math.max(1, pts.length));
      const leaves = new THREE.InstancedMesh(bake([[new THREE.IcosahedronGeometry(1, 1), 0x5d8c55]]), paint(0xffffff, { vertexColors: true }), Math.max(1, pts.length * 2));
      pts.forEach(([u, v], i) => {
        const [x, z] = A.W(u, v), s = rng.float(0.8, 1.35);
        _q.setFromEuler(_e.set(0, rng.float(0, 6.28), rng.float(-0.12, 0.12)));
        pumpkins.setMatrixAt(i, _m.compose(_p.set(x, -0.03, z), _q, _s.set(s, s, s)));
        for (let k = 0; k < 2; k++) {
          const a = rng.float(0, 6.28);
          _q.setFromEuler(_e.set(rng.float(-0.3, 0.3), a, 0));
          leaves.setMatrixAt(i * 2 + k, _m.compose(_p.set(x + Math.cos(a) * 0.4 * s, 0.03, z + Math.sin(a) * 0.4 * s), _q, _s.set(0.26, 0.05, 0.18)));
        }
      });
      pumpkins.count = pts.length; leaves.count = pts.length * 2;
      pumpkins.computeBoundingSphere(); leaves.computeBoundingSphere();
      this.add(pumpkins); this.add(leaves);
      this.pumpkinSpots = pts.map(([u, v]) => A.W(u, v));
      // Apples on the orchard trees.
      const apples = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), paint(0xffffff), Math.max(1, A.orchard.length * 9));
      let n = 0;
      for (const t of A.orchard) for (let k = 0; k < 9; k++) {
        const a = rng.float(0, 6.28), rr = rng.float(0.55, 1.05) * t.s, y = rng.float(2.0, 2.9) * t.s;
        apples.setMatrixAt(n, _m.makeScale(0.07, 0.07, 0.07).setPosition(t.pos.x + t.bend + Math.cos(a) * rr, y, t.pos.z + t.bend * 0.4 + Math.sin(a) * rr));
        apples.setColorAt(n++, _c.set(k % 3 ? 0xc8463a : 0xd9a040));
      }
      apples.count = n;
      apples.computeBoundingSphere();
      this.add(apples);
    }
    for (const o of this.objects) dressSeason(o, 'world'); // (rain makes them glisten)
  }

  /** In the pumpkin patch? (the area's own (u, v)) */
  inPatch(u, v) { const r = this.area.layout.patch; return u > r.u0 - 0.5 && u < r.u1 + 0.5 && v > r.v0 - 0.5 && v < r.v1 + 0.5; }

  /** Hide it all when you're nowhere near (it's a lot of little stalks). */
  update(pos) {
    const show = Math.hypot(pos.x - this.mid.x, pos.z - this.mid.z) < this.radius + 70;
    for (const o of this.objects) o.visible = show;
  }

  /** Running through the wheat? (summer) */
  inWheat(x, z) { const r = this.field.rect; return this.wheat && x > r.x0 + 0.6 && x < r.x1 - 0.6 && z > r.z0 + 1 && z < r.z1 - 1; }

  dispose() { this.clear(); }
}
