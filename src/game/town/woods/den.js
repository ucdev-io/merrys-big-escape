import * as THREE from 'three';
import { SPHERE, bake, bakedMat } from '../../../entities/shapes.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { PALETTE } from '../../../render/palette.js';
import { RNG } from '../../../core/rng.js';
import { dressSeason } from '../../../world/merge.js';
import { DEN_DONE, DEN_FULL, DEN_STAGES, denStage } from '../../denRules.js';

/*
 * 🏕️ The den's model: a tepee of big sticks that grows one stick at a time, with something new at each
 * milestone (denRules.js): a frame, walls, a leafy roof (finished!), bunting, a flag, a jar of fireflies, a
 * sign — and then a woodpile. Rebuilt (as three baked meshes) whenever the count changes.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = 1.3, APEX = 2.15, DOOR = 0.62; // ring radius, apex height, half the doorway (radians)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), UP = V(0, 1, 0);

/** A cylinder from a to b (for bake()). */
function pole(a, b, r, color) {
  const d = b.clone().sub(a), len = d.length();
  _q.setFromUnitVectors(UP, d.normalize());
  _e.setFromQuaternion(_q);
  return [new THREE.CylinderGeometry(r * 0.75, r, len, 6), color, a.clone().lerp(b, 0.5).toArray(), [_e.x, _e.y, _e.z]];
}

/** Where each stick goes, in the order they arrive: the frame (door posts and the back) first, then the gaps. */
function slots() {
  const n = 13, step = (Math.PI * 2 - DOOR * 2) / (n - 1), out = [];
  const order = [0, n - 1, 6, 3, 9, 1, 11, 5, 7, 2, 10, 4, 8];
  for (const i of order) out.push(DOOR + i * step);
  return out;
}
const SLOTS = slots();

/** The ring of posts (for colliders), leaving the doorway open. */
export function denRing() { return SLOTS.map((a) => [Math.sin(a) * R, Math.cos(a) * R]); }

export function buildDen(n) {
  const rng = new RNG('den-sticks'), wood = [], leaves = [], deco = [];
  const cols = [PALETTE.bark, PALETTE.woodDark, 0x7a5a42, PALETTE.bark];
  const apex = V(0, APEX, 0);
  // Main poles: from the ring up past the apex (where they cross, like a real one).
  const main = Math.min(n, SLOTS.length);
  for (let i = 0; i < main; i++) {
    const a = SLOTS[i] + rng.float(-0.05, 0.05), base = V(Math.sin(a) * R, 0, Math.cos(a) * R);
    const top = apex.clone().add(V(rng.float(-0.08, 0.08), rng.float(-0.1, 0.05), rng.float(-0.08, 0.08)));
    const over = top.clone().add(top.clone().sub(base).normalize().multiplyScalar(rng.float(0.25, 0.45)));
    wood.push(pole(base, over, rng.float(0.045, 0.06), cols[i % cols.length]));
  }
  // More sticks fill in the walls (shorter, leaning on the frame between the poles).
  for (let i = SLOTS.length; i < Math.min(n, DEN_FULL); i++) {
    const k = i - SLOTS.length, a = SLOTS[(k * 5) % SLOTS.length] + 0.2 + rng.float(-0.06, 0.06), h = rng.float(0.9, 1.6);
    const base = V(Math.sin(a) * (R + 0.08), 0, Math.cos(a) * (R + 0.08)), top = V(Math.sin(a) * R * (1 - h / APEX) * 0.95, h + 0.25, Math.cos(a) * R * (1 - h / APEX) * 0.95);
    wood.push(pole(base, top, rng.float(0.035, 0.045), cols[(i + 1) % cols.length]));
  }
  // A lintel over the door once there's a frame.
  if (n >= 3) wood.push(pole(V(Math.sin(DOOR) * R * 0.62, 0.95, Math.cos(DOOR) * R * 0.62), V(Math.sin(-DOOR) * R * 0.62, 0.95, Math.cos(-DOOR) * R * 0.62), 0.04, PALETTE.bark));
  // Finished: a leafy roof, and a mossy doormat.
  if (n >= DEN_DONE) {
    for (let i = 0; i < 10; i++) {
      const a = DOOR + 0.25 + (i / 9) * (Math.PI * 2 - DOOR * 2 - 0.5), h = 1.0 + (i % 3) * 0.32, r = R * (1 - h / APEX) + 0.12;
      leaves.push([SPHERE, [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafLight][i % 3], [Math.sin(a) * r, h, Math.cos(a) * r], [rng.float(0, 2), a, 0], [0.32, 0.2, 0.26]]);
    }
    leaves.push([SPHERE, PALETTE.leafDark, [0, APEX - 0.15, 0], [0, 0, 0], [0.26, 0.2, 0.26]]);
    deco.push([SPHERE, PALETTE.leafDark, [0, 0.02, R + 0.45], [0, 0, 0], [0.5, 0.025, 0.32]]);
  }
  // Bunting from the top down to a peg out in front.
  if (n >= 16) {
    const a = V(0, APEX - 0.1, 0.15), b = V(1.2, 0.5, R + 1.6);
    deco.push(pole(a, b, 0.008, 0xf1e8d8));
    deco.push(pole(b.clone().setY(0), b, 0.03, PALETTE.woodDark));
    for (let i = 1; i < 9; i++) {
      const p = a.clone().lerp(b, i / 9).add(V(0, -Math.sin((i / 9) * Math.PI) * 0.18, 0));
      deco.push([new THREE.ConeGeometry(0.07, 0.15, 3), PALETTE.flowers[i % PALETTE.flowers.length], [p.x, p.y - 0.08, p.z], [Math.PI, 0.6, 0], [1, 1, 0.15]]);
    }
  }
  // A flag on top.
  if (n >= 20) {
    deco.push(pole(V(0, APEX + 0.2, 0), V(0, APEX + 0.95, 0), 0.018, PALETTE.woodDark));
    const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(0.42, -0.12); f.lineTo(0, -0.26); f.lineTo(0, 0);
    deco.push([new THREE.ExtrudeGeometry(f, { depth: 0.01, bevelEnabled: false }), 0xd9534f, [0.015, APEX + 0.93, 0]]);
  }
  // A sign by the door: the grandest den in the world.
  if (n >= DEN_FULL) {
    const sx = Math.sin(DOOR + 0.4) * (R + 0.9), sz = Math.cos(DOOR + 0.4) * (R + 0.9);
    deco.push(pole(V(sx, 0, sz), V(sx, 0.75, sz), 0.03, PALETTE.woodDark));
    deco.push([new THREE.BoxGeometry(0.55, 0.3, 0.05), PALETTE.wood, [sx, 0.75, sz], [0, DOOR + 0.4, 0.05]]);
    deco.push([SPHERE, 0xd9534f, [sx, 0.76, sz], [0, DOOR + 0.4, 0], [0.07, 0.07, 0.04]]); // (a painted heart, sort of)
    for (let i = 0; i < 8; i++) { const a = rng.float(0, Math.PI * 2); deco.push([SPHERE, PALETTE.flowers[i % 5], [Math.sin(a) * (R + 0.35), 0.12, Math.cos(a) * (R + 0.35)], [0, 0, 0], [0.06, 0.04, 0.06]]); }
  }
  // After that: a woodpile beside it.
  for (let i = DEN_FULL; i < n; i++) {
    const k = i - DEN_FULL, row = Math.floor(k / 4), j = k % 4, x = -R - 1.0, z = -0.45 + j * 0.3 + (row % 2) * 0.15;
    deco.push(pole(V(x - 0.55, 0.09 + row * 0.15, z), V(x + 0.55, 0.09 + row * 0.15, z), 0.075, cols[k % 4]));
  }
  const mk = (parts) => { if (!parts.length) return null; const m = new THREE.Mesh(bake(parts), bakedMat()); m.castShadow = true; m.receiveShadow = true; return m; };
  return { wood: mk(wood), leaves: mk(leaves), deco: mk(deco) };
}

/** The den in the clearing: model, colliders once it has walls, and fireflies. */
export class DenModel {
  constructor(scene, world, at, face) {
    this.group = new THREE.Group();
    this.group.position.copy(at);
    this.group.rotation.y = face;
    scene.add(this.group);
    this.world = world;
    this.n = -1;
    this.flies = null;
  }

  set(n) {
    if (n === this.n) return;
    this.n = n;
    for (const c of [...this.group.children]) { c.removeFromParent(); c.geometry?.dispose(); }
    const m = buildDen(n);
    this.group.updateMatrixWorld(true);
    for (const k of ['wood', 'leaves', 'deco']) {
      if (!m[k]) continue;
      this.group.add(m[k]);
      dressSeason(m[k], k === 'leaves' ? 'foliage' : 'world'); // (snow on the sticks in winter; the leafy roof turns in autumn)
    }
    // Walls up: dogs go round (or in through the door).
    if (n >= 8 && !this.walls) {
      this.walls = [];
      this.group.updateMatrixWorld(true);
      for (const [x, z] of denRing()) { const p = V(x, 0, z).applyMatrix4(this.group.matrixWorld); this.walls.push(this.world.colliders.circle(p.x, p.z, 0.26)); }
    }
    // A jar of fireflies hanging by the door.
    this.flies = null;
    if (n >= 25) {
      const jar = new THREE.Group(); // (hanging from the lintel, by the door)
      jar.position.set(Math.sin(-DOOR) * R * 0.5, 0.7, Math.cos(-DOOR) * R * 0.66 + 0.05);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4), paint(0xf1e8d8));
      string.position.y = 0.19;
      jar.add(string);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 12), paint(0xdfeee8, { transparent: true, opacity: 0.45 }));
      jar.add(glass);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 12), paint(PALETTE.woodDark));
      lid.position.y = 0.11;
      jar.add(lid);
      this.flies = [0, 1, 2, 3].map((i) => { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.018, 1), paint(0xfff2a0, { emissive: 0xc9b23a })); jar.add(f); f.userData.p = i * 1.7; return f; });
      this.group.add(jar);
    }
  }

  /** Where a stick lands when it's brought (the top of the den, roughly). */
  top() { return this.group.localToWorld(V(0, Math.min(APEX, 0.6 + Math.max(0, this.n) * 0.15), 0)); }

  update(dt, t) {
    if (this.flies) for (const f of this.flies) { const p = f.userData.p + t; f.position.set(Math.sin(p * 1.3) * 0.05, Math.sin(p * 2.1) * 0.06, Math.cos(p * 1.7) * 0.05); f.visible = Math.sin(p * 3.1) > -0.6; }
  }
}

export { DEN_STAGES, denStage };
