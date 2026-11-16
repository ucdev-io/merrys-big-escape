import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, seasonalPaint, spotRandom, SEASON_KINDS } from '../render/watercolorMaterial.js';

const _m = new THREE.Matrix4(), _im = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();

/**
 * What a mesh is, as far as the seasons go (see SEASON_KINDS in render/watercolorMaterial.js): its own
 * userData.season tag, else tree leaves (userData.foliage), else what its group was tagged, else a
 * plant (whose greens follow the season: anything that isn't green just gets snow and rain).
 */
export function seasonKindOf(o, inherited = null) {
  return o.userData.season ?? (o.userData.foliage ? 'foliage' : inherited ?? 'plant');
}

/**
 * Give everything under `root` the seasonal version of its paint (snow on top in winter, autumn leaves…).
 * The town and garden do this for themselves (mergeStatic); use it for scenery added any other way.
 * `kind` forces one kind for the lot; otherwise each mesh says (see seasonKindOf).
 */
export function dressSeason(root, kind = null, inherited = null) {
  root.updateMatrixWorld(true);
  const walk = (o, tag) => {
    const t = o.userData.season ?? tag;
    if (o.isMesh && !Array.isArray(o.material)) o.material = seasonalPaint(o.material, kind ?? seasonKindOf(o, tag), treeRandom(o));
    for (const c of o.children) walk(c, t);
  };
  walk(root, inherited);
  return root;
}

/**
 * Bake a big static scene into a handful of meshes: every mesh's colour goes into vertex
 * colours, and geometry is grouped by area (chunks, so off-screen parts are culled) and by
 * a few material flags. Thousands of draw calls become a few dozen — essential on phones.
 * Each vertex also remembers what it is for the seasons (attribute wcKind; see seasonKindOf).
 *
 * Objects (or ancestors) with userData.noMerge are kept as they are (with seasonal paint).
 */
/** A tree's dice roll (from where it stands), shared by all its leaves: its autumn colour, and whether it blossoms. */
function treeRandom(o) {
  _v.setFromMatrixPosition((o.parent ?? o).matrixWorld);
  return spotRandom(_v.x, _v.z);
}

/**
 * One bucket's pieces as one shape: their attributes end to end, and their indices, if any has one (a
 * piece without gets a plain 0, 1, 2… run). Quicker than BufferGeometryUtils for big indexed merges,
 * which matters on a phone; anything unusual (mismatched attribute types) goes to mergeGeometries.
 */
function mergeBucket(geos) {
  const names = Object.keys(geos[0].attributes);
  const odd = geos.some((g) => Object.keys(g.attributes).length !== names.length || names.some((k) => {
    const a = g.attributes[k], f = geos[0].attributes[k];
    return !a || a.isInterleavedBufferAttribute || a.array.constructor !== f.array.constructor || a.itemSize !== f.itemSize || a.normalized !== f.normalized;
  }));
  if (odd) {
    if (geos.some((g) => g.index)) for (const g of geos) if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    return mergeGeometries(geos, false);
  }
  let nv = 0, ni = 0;
  for (const g of geos) { const n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
  const out = new THREE.BufferGeometry();
  for (const k of names) {
    const f = geos[0].attributes[k], arr = new f.array.constructor(nv * f.itemSize);
    let o = 0;
    for (const g of geos) { const a = g.attributes[k].array; arr.set(a, o); o += a.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, f.itemSize, f.normalized));
  }
  if (geos.some((g) => g.index)) {
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let o = 0, base = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      if (g.index) { const s = g.index.array; for (let j = 0; j < s.length; j++) idx[o + j] = s[j] + base; o += s.length; }
      else { for (let j = 0; j < n; j++) idx[o + j] = base + j; o += n; }
      base += n;
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return out;
}

/**
 * Once a merged shape has gone to the graphics chip, the copy kept here is never read again: let it go
 * (it's the biggest thing a town keeps in memory). Its bounds are worked out first, for culling. If the
 * picture is ever lost and comes back, the page starts again (main.js), as the shapes can't be resent.
 */
/**
 * Move a piece into place straight on its arrays, with the same sums as three's applyMatrix4 (positions by
 * the matrix, normals by its normal matrix, normalised) but without its per-vertex helpers, which made this
 * the slowest step of building a town. Returns the middle of where it ends up (it picks the piece's chunk).
 */
const _nm = new THREE.Matrix3(), _mid = new THREE.Vector3();
function place(g, m) {
  const pa = g.attributes.position, na = g.attributes.normal;
  const plain = (a) => a.array instanceof Float32Array && a.itemSize === 3 && !a.normalized && !a.isInterleavedBufferAttribute;
  if (!plain(pa) || (na && !plain(na))) { // (anything unusual: three's own way)
    g.applyMatrix4(m);
    g.computeBoundingBox();
    return g.boundingBox.getCenter(_mid);
  }
  const e = m.elements, p = pa.array;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    p[i] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    p[i + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    p[i + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    const X = p[i], Y = p[i + 1], Z = p[i + 2]; // (as stored)
    if (X < x0) x0 = X; if (X > x1) x1 = X;
    if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
  }
  if (na) {
    const n = na.array, ne = _nm.getNormalMatrix(m).elements;
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i], y = n[i + 1], z = n[i + 2];
      const X = ne[0] * x + ne[3] * y + ne[6] * z, Y = ne[1] * x + ne[4] * y + ne[7] * z, Z = ne[2] * x + ne[5] * y + ne[8] * z;
      const inv = 1 / (Math.sqrt(X * X + Y * Y + Z * Z) || 1);
      n[i] = X * inv; n[i + 1] = Y * inv; n[i + 2] = Z * inv;
    }
  }
  return _mid.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
}

/** A normal as plain 32-bit floats, x y z (a shape merged before has compact ones: see compact). */
function floatNormal(a) {
  if (a.array instanceof Float32Array && a.itemSize === 3 && !a.normalized && !a.isInterleavedBufferAttribute) return new THREE.BufferAttribute(a.array.slice(), 3);
  const out = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) { out[i * 3] = a.getX(i); out[i * 3 + 1] = a.getY(i); out[i * 3 + 2] = a.getZ(i); }
  return new THREE.BufferAttribute(out, 3);
}

/**
 * Smaller vertices for the graphics chip: a town has ~1.4M of them, and phones run short of memory.
 * Normals go in 4 bytes (from 12) and colours in 8 (from 12), each as four numbers, the sizes every
 * graphics chip reads as they are (three-number ones are converted behind the scenes, into a second
 * copy). Colours keep 16 bits so dark shades stay exact; normals lose a fraction of a degree.
 */
function compact(g) {
  const n = g.attributes.normal, c = g.attributes.color;
  if (n && n.itemSize === 3 && n.array instanceof Float32Array) {
    const s = n.array, out = new Int8Array(n.count * 4);
    for (let i = 0, j = 0; i < s.length; i += 3, j += 4) {
      out[j] = Math.round(s[i] * 127); out[j + 1] = Math.round(s[i + 1] * 127); out[j + 2] = Math.round(s[i + 2] * 127);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(out, 4, true));
  }
  if (c && c.itemSize === 3 && c.array instanceof Float32Array) {
    const s = c.array, out = new Uint16Array(c.count * 4);
    const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 65535);
    for (let i = 0, j = 0; i < s.length; i += 3, j += 4) { out[j] = q(s[i]); out[j + 1] = q(s[i + 1]); out[j + 2] = q(s[i + 2]); out[j + 3] = 65535; }
    g.setAttribute('color', new THREE.BufferAttribute(out, 4, true));
  }
}

function dropArray() { this.array = null; }
function lighten(g) {
  g.computeBoundingSphere();
  g.computeBoundingBox();
  // (Asked for its bounds again later, a shape whose copy has gone keeps the ones it has.)
  const sphere = g.computeBoundingSphere, box = g.computeBoundingBox;
  g.computeBoundingSphere = function () { if (this.attributes.position.array) sphere.call(this); };
  g.computeBoundingBox = function () { if (this.attributes.position.array) box.call(this); };
  for (const a of Object.values(g.attributes)) a.onUpload(dropArray);
  g.index?.onUpload(dropArray);
}

export function mergeStatic(root, { chunk = 50, maxInstances = 400 } = {}) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];

  // A noMerge object is kept whole, children and all, so it can still move as one (a bin tipping
  // over, a gnome falling flat on his face) — not broken up into loose meshes.
  // (Meshes that can't be baked are kept the same way.)
  const walk = (o, bake, tag) => {
    if (o !== root && o.userData.noMerge) { keep.push([o, tag]); return; }
    if (o.isMesh && o.visible && (!o.material.isMeshLambertMaterial || (o.isInstancedMesh && o.count > maxInstances))) { keep.push([o, tag]); return; }
    if (o.isMesh && o.visible) bake(o, tag);
    const t = o.userData.season ?? tag;
    for (const c of [...o.children]) walk(c, bake, t);
  };

  walk(root, (o, tag) => {
    const mat = o.material;
    const kind = (SEASON_KINDS[seasonKindOf(o, tag)] ?? SEASON_KINDS.plant) + 8 * Math.round(treeRandom(o) * 31);

    const flags = `${mat.transparent ? 't' + mat.opacity : 'o'}|${mat.side}|${o.castShadow ? 'c' : 'n'}|${mat.emissive?.getHex() ?? 0}`;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < n; i++) {
      _m.copy(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(i, _im); _m.multiply(_im); }
      // Shared corners stay shared (a sphere has a third of the vertices that way: less memory, which is
      // what phones run short of). Only what's kept is copied, once: position and normal (they're moved
      // into place); the index and season kind are only read, so they're shared. A shape without normals
      // is split up first, so the ones worked out for it stay flat, as they always were.
      const shape = o.geometry, A = shape.attributes;
      let g, colours;
      if ((shape.index && !A.normal) || Object.values(A).some((a) => a.isInterleavedBufferAttribute)) {
        g = shape.index ? shape.toNonIndexed() : shape.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'wcKind'].includes(k)) g.deleteAttribute(k);
        if (g.attributes.normal) g.setAttribute('normal', floatNormal(g.attributes.normal));
        colours = g.attributes.color;
      } else {
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(A.position.array.slice(), 3));
        if (A.normal) g.setAttribute('normal', floatNormal(A.normal));
        if (A.wcKind) g.setAttribute('wcKind', A.wcKind);
        if (shape.index) g.setIndex(shape.index);
        colours = A.color;
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      const mid = place(g, _m);

      // Bake colour: material × (vertex colour) × (instance colour).
      _c.copy(mat.color);
      if (o.isInstancedMesh && o.instanceColor) { const ic = new THREE.Color(); o.getColorAt(i, ic); _c.multiply(ic); }
      const count = g.attributes.position.count;
      const src = mat.vertexColors && colours ? colours : null;
      const col = new Float32Array(count * 3), cr = _c.r, cg = _c.g, cb = _c.b;
      if (src && !src.normalized && !src.isInterleavedBufferAttribute) {
        const s = src.array, st = src.itemSize;
        for (let k = 0, j = 0; k < count; k++, j += st) { col[k * 3] = cr * s[j]; col[k * 3 + 1] = cg * s[j + 1]; col[k * 3 + 2] = cb * s[j + 2]; }
      } else if (src) {
        for (let k = 0; k < count; k++) { col[k * 3] = cr * src.getX(k); col[k * 3 + 1] = cg * src.getY(k); col[k * 3 + 2] = cb * src.getZ(k); }
      } else {
        for (let k = 0; k < count; k++) { col[k * 3] = cr; col[k * 3 + 1] = cg; col[k * 3 + 2] = cb; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!g.attributes.wcKind) g.setAttribute('wcKind', new THREE.BufferAttribute(new Uint8Array(count).fill(kind), 1)); // (already merged once: keep what it says)

      const key = `${Math.floor(mid.x / chunk)},${Math.floor(mid.z / chunk)}|${flags}`;
      if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, geos: [] });
      buckets.get(key).geos.push(g);
    }
  });

  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const { mat, cast, geos } = b;
    const merged = mergeBucket(geos);
    geos.forEach((g) => g.dispose());
    b.geos = null; // (the pieces can go before the next bucket is merged: a lower peak while a phone builds)
    if (!merged) continue;
    compact(merged);
    lighten(merged);
    const m = new THREE.Mesh(merged, paint(0xffffff, {
      vertexColors: true, transparent: mat.transparent, opacity: mat.opacity, side: mat.side, emissive: mat.emissive?.getHex() ?? 0, season: 'attr',
    }));
    m.castShadow = cast;
    m.receiveShadow = true;
    out.add(m);
  }
  for (const [o, tag] of keep) { dressSeason(o, null, tag); out.attach(o); }
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

/**
 * Where the houses, shops and trees are (world coordinates), read from their tags before the scene is
 * merged: { houses: [{ x, z, ry, w, d, h }], shops: [{ x, z, ry, w, d, h }], trees: [{ x, z, s }] }.
 * (Seasonal things hang off them: Christmas lights, pumpkins on doorsteps, leaf piles under trees…)
 */
export function collectLandmarks(root) {
  root.updateMatrixWorld(true);
  const out = { houses: [], shops: [], trees: [] }, p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  root.traverse((o) => {
    const u = o.userData, kind = u.house ? 'houses' : u.shop ? 'shops' : u.tree ? 'trees' : null;
    if (!kind) return;
    o.getWorldPosition(p);
    o.getWorldQuaternion(q);
    out[kind].push({ x: p.x, z: p.z, ry: e.setFromQuaternion(q, 'YXZ').y, ...(u.house ?? u.shop ?? u.tree) });
  });
  return out;
}
