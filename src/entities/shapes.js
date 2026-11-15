import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../render/watercolorMaterial.js';

// Helpers for the neighbourhood's smaller critters and things (squirrels, hedgehogs, chickens, toys…):
// smooth shapes, baked together so a whole rigid part is one mesh (one draw call) — light on phones.

export const SPHERE = new THREE.SphereGeometry(1, 22, 16);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Shared material for baked parts: the colour lives in the vertices. */
export const bakedMat = () => paint(0xffffff, { vertexColors: true });

/**
 * Bake parts into one geometry with vertex colours.
 * parts: [geometry, color, pos?, rot?, scale?] (or { geo, color, pos, rot, scale, colors(i, v) → hex }).
 */
export function bake(parts) {
  const geos = parts.map((part) => {
    const [geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], paintFn] = Array.isArray(part) ? part : [part.geo, part.color, part.pos, part.rot, part.scale, part.colors];
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      _c.set(paintFn ? paintFn(i, v.fromBufferAttribute(g.attributes.position, i)) : color);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const out = mergeGeometries(geos);
  out.computeBoundingSphere();
  return out;
}

/** A baked part as a mesh (casting soft shadows), added to `parent`. */
export function bakedMesh(parts, parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(Array.isArray(parts) ? bake(parts) : parts, bakedMat());
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

/** A group at pos (with rotation), added to parent. */
export function group(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.rotation.set(...rot);
  parent?.add(g);
  return g;
}

/**
 * A soft tube along points whose radius follows r(t) for t = 0..1 — bushy tails, scarves, strings.
 * Rounded ends (the radius should taper towards 0 at the ends for a closed look).
 */
export function profileTube(points, r, segs = 28, radial = 14) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), rad = Math.max(0.0005, r(t));
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(rad).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Radius profile helper: grows from 0 to `max` and back, with a fat middle (power < 1 = fuller). */
export const plump = (max, power = 0.5, at = 0.5) => (t) => max * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, Math.log(0.5) / Math.log(at)))), power);
