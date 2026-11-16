import * as THREE from 'three';
import { CARRYABLES } from './carryables.js';
import { SPHERE, bake, bakedMat, profileTube } from './shapes.js';

/*
 * Things to carry on the Farm: a hen's egg (very gently), a little pumpkin (autumn), a windfall apple
 * (summer) and an armful of hay (winter, for the sheep). Same shape as carryables.js and added to
 * CARRYABLES, so they work everywhere a carryable does (friends see them in your mouth too).
 */

const item = (geo, lift = 0.0) => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, bakedMat());
  m.position.y = lift;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
};

const geos = {};

/** A brown hen's egg. */
function henEgg() {
  if (!geos.egg) {
    const g = new THREE.SphereGeometry(1, 12, 10), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setXYZ(i, v.x * (1 - v.y * 0.13), v.y * 1.28, v.z * (1 - v.y * 0.13)); }
    g.computeVertexNormals();
    geos.egg = bake([{ geo: g, color: 0xe3c29a, pos: [0, 0.058, 0], scale: [0.042, 0.042, 0.042], colors: (i, q) => (Math.sin(q.x * 300) * Math.sin(q.z * 260 + q.y * 90) > 0.93 ? 0xc9a27a : 0xe3c29a) }]);
  }
  return item(geos.egg);
}

/** A little pumpkin, with a curly stalk to carry it by. */
function pumpkin() {
  if (!geos.pumpkin) {
    const g = new THREE.SphereGeometry(1, 18, 12), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x), rib = 1 - 0.07 * Math.abs(Math.sin(a * 4)); p.setXYZ(i, v.x * rib, v.y * 0.74, v.z * rib); }
    g.computeVertexNormals();
    geos.pumpkin = bake([
      [g, 0xe07b28, [0, 0.1, 0], [0, 0, 0], [0.13, 0.13, 0.13]],
      [new THREE.CylinderGeometry(0.012, 0.017, 0.06, 7), 0x5f7a32, [0.005, 0.2, 0], [0, 0, 0.25]],
      [SPHERE, 0x6f9a52, [0.04, 0.19, 0.02], [0.3, 0.6, 0.2], [0.035, 0.008, 0.025]],
    ]);
  }
  return item(geos.pumpkin);
}

/** A rosy windfall apple. */
function apple() {
  if (!geos.apple) {
    geos.apple = bake([
      { geo: new THREE.SphereGeometry(1, 14, 10), color: 0xc8463a, pos: [0, 0.042, 0], scale: [0.045, 0.042, 0.045], colors: (i, q) => (q.y > 0.05 && q.x > 0 ? 0xd9a040 : 0xc8463a) },
      [new THREE.CylinderGeometry(0.003, 0.004, 0.025, 4), 0x5a3a20, [0, 0.09, 0], [0, 0, 0.2]],
      [SPHERE, 0x6f9a52, [0.012, 0.09, 0.006], [0.2, 0.4, 0.5], [0.016, 0.004, 0.009]],
    ]);
  }
  return item(geos.apple);
}

/** An armful of sweet hay, tied up with string. */
function hay() {
  if (!geos.hay) {
    const parts = [], cols = [0xe3c47c, 0xd8b86e, 0xeccf8e, 0xcfa95f];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = 0.022 + (i % 3) * 0.012;
      const pts = [[-0.2, 0.05 + Math.sin(a) * r, Math.cos(a) * r], [0, 0.06 + Math.sin(a) * r * 0.7, Math.cos(a) * r * 1.3], [0.22, 0.06 + Math.sin(a) * 0.05, Math.cos(a) * 0.09]];
      parts.push([profileTube(pts, (t) => 0.014 + t * (1 - t) * 0.04, 8, 4), cols[i % 4]]);
    }
    parts.push([new THREE.TorusGeometry(0.04, 0.007, 5, 12), 0xa07a46, [-0.03, 0.06, 0], [0, Math.PI / 2, 0]]);
    geos.hay = bake(parts);
  }
  return item(geos.hay);
}

const ADD = {
  henegg: { name: 'egg', emoji: '🥚', build: henEgg, hold: { pos: [0, -0.07, 0.04], rot: [0, 0, 0] } },
  pumpkin: { name: 'pumpkin', emoji: '🎃', build: pumpkin, hold: { pos: [0, -0.2, 0.06], rot: [0, 0, 0] } },
  apple: { name: 'apple', emoji: '🍎', build: apple, hold: { pos: [0, -0.07, 0.04], rot: [0, 0, 0] } },
  hay: { name: 'armful of hay', emoji: '🌾', build: hay, hold: { pos: [0, -0.045, 0.03], rot: [0, 0, 0] } },
};
for (const [k, v] of Object.entries(ADD)) CARRYABLES[k] ??= v;
