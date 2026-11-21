import * as THREE from 'three';
import { CARRYABLES } from './carryables.js';
import { SPHERE, bake, bakedMat, profileTube } from './shapes.js';

/*
 * 🏖️ Things at the beach: a beach ball and Sandy's whistle to carry (added to CARRYABLES, so they work
 * wherever a carryable does, and friends see them in your mouth), the treasures that turn up in the sand,
 * and the shapes of the seagulls, crabs, chips and sandcastles (baked: one geometry each, drawn instanced).
 */

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const item = (geo, lift = 0) => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, bakedMat());
  m.position.y = lift;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
};

// ---------------------------------------------------------------------------------------------
// Things to carry.

/** A big, light, stripy beach ball (it floats). */
export function beachBallGeometry() {
  return once('ball', () => {
    const cols = [0xd9534f, 0xf7f3ea, 0x5b86c4, 0xf2c94e, 0xf7f3ea, 0x6fae8f];
    return bake([{ geo: SPHERE, pos: [0, 0.16, 0], scale: [0.16, 0.16, 0.16], colors: (i, v) => (Math.abs(v.y - 0.16) > 0.145 ? 0xf7f3ea : cols[Math.floor(((Math.atan2(v.z, v.x) + Math.PI) / (Math.PI * 2)) * 6) % 6]) }]);
  });
}

/** Sandy's silver whistle, on its red cord. */
function whistleGeometry() {
  return once('whistle', () => bake([
    [new THREE.CylinderGeometry(0.022, 0.022, 0.05, 14), 0xc9ced6, [0, 0.025, 0], [0, 0, Math.PI / 2]],
    [new THREE.BoxGeometry(0.045, 0.018, 0.02), 0xc9ced6, [0.04, 0.035, 0]],
    [SPHERE, 0xd9534f, [0.0, 0.03, 0.02], [0, 0, 0], [0.008, 0.008, 0.008]],
    [new THREE.TorusGeometry(0.05, 0.006, 6, 18), 0xd9534f, [-0.05, 0.008, 0], [Math.PI / 2, 0, 0]],
  ]));
}

const ADD = {
  beachball: { name: 'beach ball', emoji: '🏐', build: () => item(beachBallGeometry()), hold: { pos: [0, -0.15, 0.1], rot: [0, 0, 0] } },
  whistle: { name: 'whistle', emoji: '📯', build: () => item(whistleGeometry(), 0.012), hold: { pos: [0, -0.03, 0.02], rot: [0, 0, 0] }, digText: '📯 Something shiny! Dig! 🐾' },
};
for (const [k, v] of Object.entries(ADD)) CARRYABLES[k] ??= v;

// ---------------------------------------------------------------------------------------------
// Treasures that turn up in the sand (see TREASURES in game/lines/beach.js).

function star(r0, r1, depth, color) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r0 : r1; if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return [g, color];
}
const fan = (r, a, b) => ({ geo: new THREE.SphereGeometry(r, 16, 6, 0, Math.PI, 0, Math.PI / 2), scale: [1, 0.32, 1.1], colors: (i, v) => (Math.floor(((Math.atan2(v.z, v.x) + Math.PI) / Math.PI) * 9) % 2 ? a : b) });

export const TREASURE_MODELS = {
  scallop: () => bake([{ ...fan(0.075, 0xf2b6b0, 0xfbe9e2), pos: [0, 0.005, 0] }, [SPHERE, 0xf2b6b0, [0, 0.01, -0.012], [0, 0, 0], [0.02, 0.012, 0.012]]]),
  cockle: () => bake([{ ...fan(0.05, 0xd9b48a, 0xf4e6d0), pos: [0, 0.005, 0] }]),
  conch: () => bake([
    { geo: new THREE.ConeGeometry(0.035, 0.12, 12), pos: [0, 0.035, 0.03], rot: [Math.PI / 2, 0, 0], colors: (i, v) => (Math.sin(v.z * 120) > 0.3 ? 0xe8a68a : 0xf7e6d6) },
    [new THREE.TorusGeometry(0.03, 0.016, 8, 16), 0xf7e6d6, [0, 0.035, -0.035], [0, 0, 0]],
  ]),
  glass: () => bake([[new THREE.IcosahedronGeometry(0.036, 1), 0x9fd8b0, [0, 0.015, 0], [0, 0.5, 0], [1, 0.5, 0.8]]]),
  starfish: () => bake([star(0.032, 0.085, 0.02, 0xe8875a), [SPHERE, 0xf4b07a, [0, 0.028, 0], [0, 0, 0], [0.02, 0.006, 0.02]]]),
  stone: () => bake([[SPHERE, 0x9a948a, [0, 0.025, 0], [0, 0.3, 0], [0.06, 0.028, 0.05]], [new THREE.CircleGeometry(0.014, 12), 0x3a3430, [0.008, 0.053, 0], [-Math.PI / 2, 0, 0]]]),
  duck: () => bake([
    [SPHERE, 0xf6d04a, [0, 0.04, 0], [0, 0, 0], [0.05, 0.04, 0.065]],
    [SPHERE, 0xf6d04a, [0, 0.095, 0.04], [0, 0, 0], [0.033, 0.033, 0.033]],
    [new THREE.ConeGeometry(0.012, 0.03, 8), 0xe8743c, [0, 0.09, 0.08], [Math.PI / 2, 0, 0]],
    [SPHERE, 0x241a17, [0.02, 0.105, 0.065], [0, 0, 0], [0.005, 0.005, 0.005]], [SPHERE, 0x241a17, [-0.02, 0.105, 0.065], [0, 0, 0], [0.005, 0.005, 0.005]],
  ]),
  boot: () => bake([[new THREE.CylinderGeometry(0.04, 0.045, 0.14, 12), 0x6b4a32, [0, 0.07, 0]], [SPHERE, 0x6b4a32, [0, 0.025, 0.05], [0, 0, 0], [0.045, 0.03, 0.08]], [new THREE.TorusGeometry(0.04, 0.008, 6, 14), 0x4a3424, [0, 0.14, 0], [Math.PI / 2, 0, 0]]]),
  coin: () => bake([[new THREE.CylinderGeometry(0.04, 0.04, 0.008, 18), 0xe8c04a, [0, 0.01, 0], [0.2, 0, 0.1]], [new THREE.TorusGeometry(0.032, 0.003, 4, 18), 0xc9a032, [0, 0.016, 0], [Math.PI / 2 + 0.2, 0, 0.1]]]),
  fossil: () => bake([[SPHERE, 0xb8ab94, [0, 0.025, 0], [0, 0, 0], [0.065, 0.03, 0.06]], [new THREE.TorusGeometry(0.035, 0.008, 6, 20), 0x8f8068, [0, 0.052, 0], [Math.PI / 2, 0, 0]], [new THREE.TorusGeometry(0.018, 0.006, 6, 16), 0x8f8068, [0.008, 0.054, 0], [Math.PI / 2, 0, 0]]]),
  bottle: () => bake([
    [new THREE.CylinderGeometry(0.035, 0.035, 0.13, 14), 0x8fbf9a, [0, 0.035, 0], [Math.PI / 2, 0, 0]],
    [new THREE.CylinderGeometry(0.014, 0.03, 0.06, 12), 0x8fbf9a, [0, 0.035, 0.09], [Math.PI / 2, 0, 0]],
    [new THREE.CylinderGeometry(0.013, 0.013, 0.025, 10), 0xc49a5c, [0, 0.035, 0.13], [Math.PI / 2, 0, 0]],
    [new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), 0xf7f0de, [0, 0.035, 0], [Math.PI / 2, 0, 0]], // (the message, rolled up inside)
  ]),
};
/** A treasure's model (cached), as a geometry with vertex colours. */
export const treasureGeometry = (id) => once(`t:${id}`, TREASURE_MODELS[id] ?? TREASURE_MODELS.scallop);

/** A tiny bit of shell poking out of the sand (where something's buried). */
export const shellTipGeometry = () => once('tip', () => bake([{ ...fan(0.05, 0xf2c2b8, 0xfbf1ea), pos: [0, 0.0, 0], rot: [0.9, 0.4, 0] }, [SPHERE, 0xd8c39a, [0, 0, 0], [0, 0, 0], [0.12, 0.03, 0.1]]]));

// ---------------------------------------------------------------------------------------------
// Seagulls (herring gulls: white, with grey wings tipped in black, a yellow beak with a red spot).

// (Gulls and crabs are a few centimetres to a few tens of centimetres, and there are a lot of them about: rounder
// spheres than these went unseen, at 660 triangles a ball. A gull was 6,000 triangles; now it's about 1,300.)
const MID = new THREE.SphereGeometry(1, 14, 10), LOW = new THREE.SphereGeometry(1, 10, 6), DOT = new THREE.SphereGeometry(1, 6, 4);

export function gullBodyGeometry() {
  return once('gull', () => bake([
    [MID, 0xf7f6f2, [0, 0.2, 0], [0, 0, 0], [0.1, 0.095, 0.19]],
    [MID, 0xc4cad2, [0, 0.235, -0.04], [-0.05, 0, 0], [0.095, 0.05, 0.17]],   // the grey back
    [MID, 0xf7f6f2, [0, 0.31, 0.14], [0, 0, 0], [0.07, 0.068, 0.078]],         // head
    [new THREE.ConeGeometry(0.017, 0.085, 8), 0xf2c94e, [0, 0.3, 0.245], [Math.PI / 2, 0, 0]],
    [DOT, 0xd9534f, [0, 0.293, 0.245], [0, 0, 0], [0.008, 0.008, 0.012]],      // the red spot (it's where chicks peck)
    [DOT, 0x2b2420, [0.042, 0.325, 0.17], [0, 0, 0], [0.01, 0.011, 0.01]], [DOT, 0x2b2420, [-0.042, 0.325, 0.17], [0, 0, 0], [0.01, 0.011, 0.01]],
    [LOW, 0x3a3a40, [0, 0.215, -0.21], [-0.2, 0, 0], [0.06, 0.02, 0.07]],      // dark tail tips
    [new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), 0xe8a0a0, [0.035, 0.06, 0.0]], [new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), 0xe8a0a0, [-0.035, 0.06, 0.0]],
    [LOW, 0xe8a0a0, [0.035, 0.004, 0.025], [0, 0, 0], [0.025, 0.006, 0.035]], [LOW, 0xe8a0a0, [-0.035, 0.004, 0.025], [0, 0, 0], [0.025, 0.006, 0.035]],
  ]));
}

/** One wing, reaching out from the shoulder along +x (side 1, the right) or -x (side -1, the left). */
export function gullWingGeometry(side = 1) {
  return once(`gullWing${side}`, () => bake([{ geo: SPHERE, pos: [0.19 * side, 0, 0], scale: [0.2, 0.014, 0.075], colors: (i, v) => (v.x * side > 0.32 ? 0x2f2f36 : v.x * side > 0.29 ? 0xf7f6f2 : 0xbac1ca) }]));
}

/** A little paper tray of chips (the full one has chips in it: two parts, so the chips can go). */
export const chipTrayGeometry = () => once('tray', () => bake([
  { geo: new THREE.BoxGeometry(0.2, 0.045, 0.13), pos: [0, 0.022, 0], colors: (i, v) => (Math.floor((v.x + 0.1) * 30) % 2 ? 0xd9534f : 0xf7f3ea) },
]));
export const chipsGeometry = () => once('chips', () => {
  const parts = [];
  for (let i = 0; i < 9; i++) parts.push([new THREE.BoxGeometry(0.018, 0.018, 0.09), i % 3 ? 0xf2c46a : 0xe8b04e, [-0.07 + i * 0.017, 0.05 + (i % 2) * 0.012, (i % 3 - 1) * 0.015], [0.2 * (i % 2), (i - 4) * 0.12, 0.15 * ((i % 3) - 1)]]);
  return bake(parts);
});

// ---------------------------------------------------------------------------------------------
// Crabs (they walk sideways along x; facing +z).

export function crabBodyGeometry() {
  return once('crab', () => {
    const parts = [
      { geo: MID, pos: [0, 0.05, 0], scale: [0.085, 0.038, 0.062], colors: (i, v) => (v.y < 0.04 ? 0xf0a070 : 0xd9603b) },
      [new THREE.CylinderGeometry(0.006, 0.006, 0.04, 5), 0xd9603b, [0.022, 0.09, 0.04]], [new THREE.CylinderGeometry(0.006, 0.006, 0.04, 5), 0xd9603b, [-0.022, 0.09, 0.04]],
      [DOT, 0x1d1614, [0.022, 0.112, 0.042], [0, 0, 0], [0.011, 0.011, 0.011]], [DOT, 0x1d1614, [-0.022, 0.112, 0.042], [0, 0, 0], [0.011, 0.011, 0.011]],
      [DOT, 0xffffff, [0.025, 0.116, 0.049], [0, 0, 0], [0.003, 0.003, 0.003]], [DOT, 0xffffff, [-0.019, 0.116, 0.049], [0, 0, 0], [0.003, 0.003, 0.003]],
    ];
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { // four legs a side, bent down to the sand
      const z = -0.035 + k * 0.022;
      parts.push([profileTube([[s * 0.07, 0.05, z], [s * 0.11, 0.055, z + 0.004], [s * 0.135, 0.002, z + 0.01]], () => 0.007, 5, 4), 0xc9532f]);
    }
    return bake(parts);
  });
}

/** One claw on its arm, reaching forward from the right side (side 1) or the left (side -1: its mirror image). */
export function crabClawGeometry(side = 1) {
  const s = side;
  return once(`claw${s}`, () => bake([
    [profileTube([[0, 0, 0], [0.03 * s, 0.01, 0.03], [0.045 * s, 0.02, 0.06]], () => 0.009, 5, 5), 0xd9603b],
    [MID, 0xd9603b, [0.05 * s, 0.025, 0.085], [0, 0.3 * s, 0], [0.026, 0.02, 0.032]],
    [LOW, 0xe8754a, [0.042 * s, 0.03, 0.115], [0.4, 0.3 * s, 0], [0.01, 0.008, 0.028]],
    [LOW, 0xe8754a, [0.058 * s, 0.02, 0.113], [-0.3, 0.3 * s, 0], [0.009, 0.007, 0.024]],
  ]));
}
