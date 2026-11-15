import * as THREE from 'three';
import { CARRYABLES } from './carryables.js';
import { SPHERE, bake, bakedMat, profileTube } from './shapes.js';
import { PALETTE } from '../render/palette.js';

/*
 * Things to carry in the Woods: BIG sticks (for the den: held crossways, they're wider than most gates),
 * bundles of bracken (Brock's bed) and a heap of leaves (stuck in Brock's front doors). Same shape as
 * carryables.js and added to CARRYABLES, so they work everywhere a carryable does (friends see them too).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const item = (geo, lift = 0.03) => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, bakedMat());
  m.position.y = lift;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
};

export const BIG_STICK = 1.65; // how long a big stick is (m): crossways in a mouth, that's wider than a garden gate

let stickGeo = null;
/** A big knobbly branch lying along x (so a dog holds it crossways), with a twig and a few leaves. */
function bigStick() {
  if (!stickGeo) {
    const L = BIG_STICK, bark = PALETTE.bark, dark = PALETTE.woodDark;
    const main = profileTube([[-L / 2, 0.04, 0.01], [-L / 4, 0.05, -0.03], [0, 0.045, 0.02], [L / 4, 0.05, -0.01], [L / 2, 0.035, 0.03]], (t) => 0.034 - t * 0.012 + Math.sin(t * 19) * 0.003, 22, 7);
    const twig = profileTube([[0.25, 0.05, 0.0], [0.38, 0.07, 0.12], [0.45, 0.1, 0.22]], (t) => 0.016 - t * 0.011, 6, 5);
    const twig2 = profileTube([[-0.45, 0.05, 0.0], [-0.55, 0.06, -0.12]], (t) => 0.013 - t * 0.008, 4, 5);
    stickGeo = bake([
      { geo: main, color: bark, colors: (i, v) => (Math.sin(v.x * 23) > 0.6 ? dark : bark) },
      [twig, bark], [twig2, bark],
      [SPHERE, PALETTE.leaf, [0.47, 0.11, 0.25], [0.3, 0.5, 0.2], [0.035, 0.008, 0.022]],
      [SPHERE, PALETTE.leafLight, [0.43, 0.1, 0.21], [-0.2, 1.4, 0.1], [0.03, 0.007, 0.018]],
      [SPHERE, PALETTE.wood, [L / 2 + 0.005, 0.035, 0.03], [0, 0, 0], [0.006, 0.022, 0.022]],
      [SPHERE, PALETTE.wood, [-L / 2 - 0.005, 0.04, 0.01], [0, 0, 0], [0.006, 0.03, 0.03]],
    ]);
  }
  return item(stickGeo, 0.0);
}

let brackenGeo = null;
/** A bundle of dry golden bracken, tied up for carrying. */
function bracken() {
  if (!brackenGeo) {
    const parts = [], cols = [0xc9984a, 0xb5803c, 0xd8ab5c, 0xa8743a];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 0.02 + (i % 3) * 0.012;
      const pts = [[Math.cos(a) * r - 0.2, 0.05, Math.sin(a) * r], [0, 0.06 + Math.sin(a) * 0.01, Math.sin(a) * r * 1.4], [0.24, 0.07 + Math.cos(a) * 0.04, Math.sin(a) * 0.1]];
      parts.push([profileTube(pts, (t) => 0.012 + t * 0.022 * (1 - t) * 2, 8, 4), cols[i % 4]]);
    }
    parts.push([new THREE.TorusGeometry(0.035, 0.008, 5, 12), 0x8a6a46, [-0.02, 0.06, 0], [0, Math.PI / 2, 0]]); // the tie
    brackenGeo = bake(parts);
  }
  return item(brackenGeo, 0.01);
}

let leavesGeo = null;
/** A heap of crunchy leaves. */
function leaves() {
  if (!leavesGeo) {
    const cols = [0xd9893c, 0xc0632d, 0xe0b04a, 0x9a6a3a, 0x8a9a52];
    leavesGeo = bake(Array.from({ length: 14 }, (_, i) => {
      const a = i * 2.4, r = Math.sqrt(i / 14) * 0.13;
      return [SPHERE, cols[i % cols.length], [Math.cos(a) * r, 0.04 - r * 0.15, Math.sin(a) * r], [0.35 * Math.sin(i), a, 0.3 * Math.cos(i)], [0.05, 0.012, 0.03]];
    }));
  }
  return item(leavesGeo, 0.0);
}

const ADD = {
  // reach: grab it from further away (it's long). wide: held crossways — see game/town/woods/sticks.js.
  bigstick: { name: 'big stick', emoji: '🪵', build: bigStick, hold: { pos: [0, -0.025, 0.02], rot: [0, 0, 0] }, reach: 0.55, wide: BIG_STICK },
  bracken: { name: 'bundle of bracken', emoji: '🌾', build: bracken, hold: { pos: [0, -0.04, 0.03], rot: [0, 0, 0] } },
  leaves: { name: 'heap of leaves', emoji: '🍂', build: leaves, hold: { pos: [0, -0.04, 0.03], rot: [0, 0, 0] }, digText: 'Leaves stuck in the doorway! Dig them out! 🐾' },
};
for (const [k, v] of Object.entries(ADD)) CARRYABLES[k] ??= v;
export { V };
