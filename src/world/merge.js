import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../render/watercolorMaterial.js';

const _m = new THREE.Matrix4(), _im = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();

/**
 * Bake a big static scene into a handful of meshes: every mesh's colour goes into vertex
 * colours, and geometry is grouped by area (chunks, so off-screen parts are culled) and by
 * a few material flags. Thousands of draw calls become a few dozen — essential on phones.
 *
 * Objects (or ancestors) with userData.noMerge are kept as they are.
 */
export function mergeStatic(root, { chunk = 50, maxInstances = 400 } = {}) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];

  // A noMerge object is kept whole, children and all, so it can still move as one (a bin tipping
  // over, a gnome falling flat on his face) — not broken up into loose meshes.
  // (Meshes that can't be baked are kept the same way.)
  const walk = (o, bake) => {
    if (o !== root && o.userData.noMerge) { keep.push(o); return; }
    if (o.isMesh && o.visible && (!o.material.isMeshLambertMaterial || (o.isInstancedMesh && o.count > maxInstances))) { keep.push(o); return; }
    if (o.isMesh && o.visible) bake(o);
    for (const c of [...o.children]) walk(c, bake);
  };

  walk(root, (o) => {
    const mat = o.material;

    const flags = `${mat.transparent ? 't' + mat.opacity : 'o'}|${mat.side}|${o.castShadow ? 'c' : 'n'}|${mat.emissive?.getHex() ?? 0}`;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < n; i++) {
      _m.copy(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(i, _im); _m.multiply(_im); }
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(_m);

      // Bake colour: material × (vertex colour) × (instance colour).
      _c.copy(mat.color);
      if (o.isInstancedMesh && o.instanceColor) { const ic = new THREE.Color(); o.getColorAt(i, ic); _c.multiply(ic); }
      const count = g.attributes.position.count;
      const src = mat.vertexColors && g.attributes.color ? g.attributes.color : null;
      const col = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        const r = src ? src.getX(k) : 1, gg = src ? src.getY(k) : 1, b = src ? src.getZ(k) : 1;
        col[k * 3] = _c.r * r; col[k * 3 + 1] = _c.g * gg; col[k * 3 + 2] = _c.b * b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));

      g.computeBoundingSphere();
      _v.copy(g.boundingSphere.center);
      const key = `${Math.floor(_v.x / chunk)},${Math.floor(_v.z / chunk)}|${flags}`;
      if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, geos: [] });
      buckets.get(key).geos.push(g);
    }
  });

  const out = new THREE.Group();
  for (const { mat, cast, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, paint(0xffffff, {
      vertexColors: true, transparent: mat.transparent, opacity: mat.opacity, side: mat.side, emissive: mat.emissive?.getHex() ?? 0,
    }));
    m.castShadow = cast;
    m.receiveShadow = true;
    out.add(m);
  }
  for (const o of keep) out.attach(o);
  return out;
}

/** Camera occluders from tagged objects: buildings & trunks → boxes, tree canopies → spheres. */
export function collectOccluders(root) {
  root.updateMatrixWorld(true);
  const boxes = [], spheres = [];
  root.traverse((o) => {
    if (o.userData.occluder || o.userData.solid) boxes.push(new THREE.Box3().setFromObject(o));
    if (o.userData.foliage) {
      const s = new THREE.Vector3();
      o.getWorldScale(s);
      spheres.push(new THREE.Sphere(o.getWorldPosition(new THREE.Vector3()), Math.max(s.x, s.y, s.z) * 1.1));
    }
  });
  return { boxes, spheres };
}
