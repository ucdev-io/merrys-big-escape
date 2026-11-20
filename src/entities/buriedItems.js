import * as THREE from 'three';
import { SPHERE, bake } from './shapes.js';
import { TREASURE_MODELS } from './beachItems.js';

/*
 * 🦴 Things buried round town, in the woods and on the farm (see ../game/town/buried.js): little baked
 * models with vertex colours, one geometry each (made the first time one turns up). A few borrow the
 * beach's (an old boot, a gold coin, a fossil, a lucky stone).
 */

const cache = new Map();
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const lump = (color, s, seed = 1) => ({ geo: new THREE.IcosahedronGeometry(1, 1), scale: s, pos: [0, s[1] * 0.9, 0], colors: () => color, seed });

/** A dog's bone: a shaft and four knobbly ends. */
const boneParts = (len, r, color) => [
  [CYL, color, [0, r, 0], [0, 0, Math.PI / 2], [r * 0.7, len, r * 0.7]],
  ...[-1, 1].flatMap((x) => [-1, 1].map((z) => [SPHERE, color, [x * (len / 2 + r * 0.4), r, z * r * 0.75], [0, 0, 0], [r * 1.1, r * 1.1, r * 1.1]])),
];

export const BURIED_MODELS = {
  bone: () => bake(boneParts(0.14, 0.03, 0xefe6d2)),
  bigbone: () => bake(boneParts(0.3, 0.055, 0xd9ccb0)),
  ball: () => bake([[SPHERE, 0xc8d84a, [0, 0.04, 0], [0, 0, 0], [0.05, 0.035, 0.05]], [new THREE.TorusGeometry(0.046, 0.004, 4, 20), 0xf4f1e4, [0, 0.04, 0], [0.4, 0, 0.2], [1, 0.75, 1]]]),
  bottletop: () => bake([[CYL, 0xd9534f, [0, 0.006, 0], [0, 0, 0], [0.028, 0.012, 0.028]], [new THREE.TorusGeometry(0.028, 0.004, 4, 16), 0xb83a36, [0, 0.006, 0], [Math.PI / 2, 0, 0]]]),
  spoon: () => bake([[CYL, 0xb8bcc2, [0, 0.008, 0.02], [Math.PI / 2, 0, 0], [0.006, 0.09, 0.004]], [SPHERE, 0xc8ccd2, [0, 0.012, -0.05], [0, 0, 0], [0.025, 0.008, 0.035]]]),
  marble: () => bake([{ geo: SPHERE, pos: [0, 0.022, 0], scale: [0.022, 0.022, 0.022], colors: (i, v) => (Math.sin(v.x * 260 + v.y * 140) > 0.2 ? 0xd9534f : 0x8fc4e8) }]),
  penny: () => bake([[CYL, 0xb8733e, [0, 0.005, 0], [0.15, 0, 0], [0.032, 0.006, 0.032]], [new THREE.TorusGeometry(0.027, 0.002, 4, 18), 0x8f5428, [0, 0.009, 0], [Math.PI / 2 + 0.15, 0, 0]]]),
  soldier: () => bake([
    [CYL, 0x2f3a52, [0, 0.025, 0], [0, 0, 0], [0.013, 0.05, 0.013]],
    [CYL, 0xc94a3a, [0, 0.065, 0], [0, 0, 0], [0.016, 0.035, 0.014]],
    [SPHERE, 0xe8c4a0, [0, 0.093, 0], [0, 0, 0], [0.012, 0.012, 0.012]],
    [CYL, 0x241a17, [0, 0.115, 0], [0, 0, 0], [0.012, 0.03, 0.012]],
  ]),
  toycar: () => bake([
    [BOX, 0x5b86c4, [0, 0.025, 0], [0, 0, 0], [0.05, 0.022, 0.1]],
    [BOX, 0x5b86c4, [0, 0.045, -0.008], [0, 0, 0], [0.042, 0.02, 0.05]],
    [BOX, 0x9ab8cf, [0, 0.046, 0.018], [0, 0, 0], [0.038, 0.016, 0.004]],
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => [CYL, 0x2b2b2b, [x * 0.027, 0.012, z * 0.03], [0, 0, Math.PI / 2], [0.012, 0.008, 0.012]])),
  ]),
  key: () => bake([
    [new THREE.TorusGeometry(0.018, 0.005, 6, 16), 0xc9a032, [0, 0.006, -0.04], [Math.PI / 2, 0, 0]],
    [CYL, 0xc9a032, [0, 0.006, 0.01], [Math.PI / 2, 0, 0], [0.004, 0.08, 0.004]],
    [BOX, 0xc9a032, [0.008, 0.006, 0.04], [0, 0, 0], [0.014, 0.006, 0.006]],
    [BOX, 0xc9a032, [0.006, 0.006, 0.028], [0, 0, 0], [0.01, 0.006, 0.006]],
  ]),
  ring: () => bake([[new THREE.TorusGeometry(0.02, 0.005, 8, 20), 0xe8c04a, [0, 0.02, 0], [0, 0, 0]], [new THREE.OctahedronGeometry(0.009), 0xd8f0ff, [0, 0.043, 0], [0, 0.4, 0]]]),
  tin: () => bake([
    [CYL, 0x9a5a3a, [0, 0.045, 0], [0, 0, 0], [0.045, 0.09, 0.045]],
    [CYL, 0x7a4a30, [0, 0.093, 0], [0, 0, 0], [0.048, 0.012, 0.048]],
    [CYL, 0xe8c04a, [0, 0.05, 0], [0, 0, 0], [0.0455, 0.025, 0.0455]],
  ]),
  // 🌳 the woods
  acorns: () => bake([0, 1, 2, 3].flatMap((i) => {
    const a = i * 1.7, x = Math.cos(a) * 0.03 * (i ? 1 : 0), z = Math.sin(a) * 0.03 * (i ? 1 : 0);
    return [[SPHERE, 0xb08a4a, [x, 0.017, z], [0, 0, 0], [0.014, 0.018, 0.014]], [SPHERE, 0x7a5a32, [x, 0.03, z], [0, 0, 0], [0.015, 0.008, 0.015]]];
  })),
  conker: () => bake([[SPHERE, 0x7a3a1e, [0, 0.025, 0], [0, 0, 0], [0.03, 0.026, 0.03]], [SPHERE, 0xd9c49a, [0, 0.045, 0.004], [0, 0, 0], [0.016, 0.006, 0.014]]]),
  worm: () => bake([0, 1, 2, 3, 4, 5].map((i) => [SPHERE, 0xd9908a, [Math.sin(i * 0.9) * 0.02, 0.008, (i - 2.5) * 0.016], [0, 0, 0], [0.009, 0.008, 0.011]])),
  truffle: () => bake([{ ...lump(0x4a3426, [0.032, 0.026, 0.03]) }, [SPHERE, 0x5f4632, [0.015, 0.035, 0.01], [0, 0, 0], [0.014, 0.012, 0.014]]]),
  arrowhead: () => bake([[CONE, 0x8f8a84, [0, 0.008, 0], [Math.PI / 2, 0, 0], [0.022, 0.06, 0.006]]]),
  // 🚜 the farm
  potato: () => bake([{ ...lump(0xc49a64, [0.04, 0.028, 0.03]) }, [SPHERE, 0x9a7448, [0.02, 0.04, 0.01], [0, 0, 0], [0.004, 0.003, 0.004]]]),
  carrot: () => bake([
    [CONE, 0xe8843a, [0, 0.016, 0], [-Math.PI / 2, 0, 0], [0.016, 0.1, 0.016]],
    [CONE, 0x6f9a52, [0, 0.022, -0.06], [-Math.PI / 2 - 0.4, 0, 0], [0.008, 0.04, 0.008]],
    [CONE, 0x6f9a52, [0, 0.016, -0.062], [-Math.PI / 2 + 0.4, 0, 0], [0.008, 0.04, 0.008]],
  ]),
  egg: () => bake([[SPHERE, 0xf4ecd8, [0, 0.022, 0], [Math.PI / 2, 0, 0], [0.022, 0.03, 0.022]]]),
  horseshoe: () => bake([[new THREE.TorusGeometry(0.04, 0.009, 6, 18, Math.PI * 1.3), 0x8a8580, [0, 0.009, 0], [Math.PI / 2, 0, -Math.PI * 0.15]]]),
};

/** A buried thing's model (cached), as a geometry with vertex colours. */
export function buriedGeometry(id) {
  if (!cache.has(id)) cache.set(id, (BURIED_MODELS[id] ?? TREASURE_MODELS[id] ?? BURIED_MODELS.bone)());
  return cache.get(id);
}
