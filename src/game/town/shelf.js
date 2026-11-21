import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bake, bakedMat } from '../../entities/shapes.js';
import { buriedGeometry } from '../../entities/buriedItems.js';
import { treasureGeometry } from '../../entities/beachItems.js';
import { blocked } from '../../world/spots.js';
import { groundY } from '../seasons/common.js';
import { collection, BURIED_PLACES, BEACH_KINDS } from '../collection.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const W = 1.7, H = 1.1, D = 0.36;           // the shelf: wide, tall (under the lowest window sill), deep (metres)
const ROWS = [0.06, 0.32, 0.58, 0.84];       // the tops of the four shelves things stand on
const PER_ROW = 9, SLOT = (W - 0.12) / PER_ROW, FIT = 0.15;
const WOOD = 0x9a6b45, WOOD_DARK = 0x7a5232, BACK = 0xe8d6b4;

/** Every kind of treasure, in shelf order: its place on the shelf never changes (gaps for ones still to find). */
const ORDER = [
  ...BURIED_PLACES.flatMap((p) => p.kinds).map((t) => ({ kind: 'buried', id: t.id, geo: () => buriedGeometry(t.model ?? t.id) })),
  ...BEACH_KINDS.map((t) => ({ kind: 'beach', id: t.id, geo: () => treasureGeometry(t.id) })),
];

/** The shelf itself: two sides, a back, the shelves, a top with a little cream plaque (one baked geometry). */
function frameParts() {
  const p = [];
  for (const s of [-1, 1]) p.push([BOX, WOOD, [s * (W / 2 - 0.025), H / 2, 0], [0, 0, 0], [0.05, H, D]]);
  p.push([BOX, BACK, [0, H / 2, -D / 2 + 0.015], [0, 0, 0], [W - 0.06, H - 0.02, 0.03]]);
  for (const y of ROWS) p.push([BOX, WOOD, [0, y - 0.02, 0.01], [0, 0, 0], [W - 0.06, 0.04, D - 0.03]]);
  p.push([BOX, WOOD_DARK, [0, H + 0.02, 0.01], [0, 0, 0], [W + 0.08, 0.05, D + 0.06]]);       // the top
  p.push([BOX, 0xf4ead2, [0, H + 0.02, D / 2 + 0.046], [0, 0, 0], [0.4, 0.045, 0.01]]);      // a little plaque on the front (painted cream)
  return p;
}

/**
 * 🎒 Your treasure shelf, against the house in your own garden: everything you've dug up (round town, in
 * the woods, on the farm, at the beach) on display, each in its own place, with gaps for what's still to
 * find. One mesh (the shelf and its treasures baked together, made again when something new turns up).
 * Walk up to it and the Sniff Book opens at 🎒 Treasures. It moves if you get a different house in a pack.
 */
export class TreasureShelf {
  constructor({ scene, world, hud, player, busy = () => false }) {
    Object.assign(this, { scene, world, hud, player, busy });
    this.group = new THREE.Group();
    this.mesh = null;
    this.garden = null;
    this.collider = null;
    this.near = false;
    this.checkT = 0;
    this.stopCollection = collection.on((kind) => { if (kind !== 'notes') this.dirty = true; });
    this.dirty = true;
  }

  /** Find our own garden's spot (again, if we've moved house). */
  place() {
    const g = this.world.gardens?.find((q) => q.own);
    if (!g || g === this.garden) return;
    this.garden = g;
    const h = this.world.homes?.find((q) => q.garden === g);
    if (!h || !g.door) { this.group.removeFromParent(); return; }
    const f = V(Math.sin(h.face), 0, Math.cos(h.face)), side = V(f.z, 0, -f.x);
    const base = V(g.door.x, 0, g.door.z).addScaledVector(f, 0.2); // (just in front of the house wall, by the door)
    const beds = this.world.beds ?? [];
    const fits = (c) => {
      const ends = [-0.75, 0, 0.75].map((k) => c.clone().addScaledVector(side, k));
      if (ends.some((p) => blocked(this.world, p.x, p.z, 0.22))) return false;
      if (ends.some((p) => p.x < g.rect.x0 + 0.3 || p.x > g.rect.x1 - 0.3 || p.z < g.rect.z0 + 0.3 || p.z > g.rect.z1 - 0.3)) return false;
      return !beds.some((b) => ends.some((p) => p.x > b.x0 - 0.5 && p.x < b.x1 + 0.5 && p.z > b.z0 - 0.5 && p.z < b.z1 + 0.5));
    };
    let at = null;
    for (const s of [2.1, -2.1, 2.6, -2.6, 1.6, -1.6, 3.0, -3.0]) {
      const c = base.clone().addScaledVector(side, s);
      if (fits(c)) { at = c; break; }
    }
    if (this.collider) { this.world.colliders.boxes = this.world.colliders.boxes.filter((b) => b !== this.collider); this.collider = null; }
    if (!at) { this.group.removeFromParent(); return; }
    this.group.position.set(at.x, groundY(this.world, at.x, at.z) - 0.01, at.z);
    this.group.rotation.y = h.face;
    this.front = f;
    if (!this.group.parent) this.scene.add(this.group);
    // Solid (axis-aligned: houses face along x or z), and too tall to hop onto.
    const hx = Math.abs(side.x) * W / 2 + Math.abs(f.x) * D / 2, hz = Math.abs(side.z) * W / 2 + Math.abs(f.z) * D / 2;
    this.collider = this.world.colliders.box(at.x - hx, at.z - hz, at.x + hx, at.z + hz, H + 0.2, false);
    this.world.grass?.keepOut?.('shelf', at.x, at.z, 0.9);
  }

  /** The shelf with today's treasures on it, baked into one mesh. */
  build() {
    this.dirty = false;
    const geos = [bake(frameParts())], m = new THREE.Matrix4(), q = new THREE.Quaternion(), box = new THREE.Box3();
    ORDER.forEach((t, i) => {
      if (!collection.has(t.kind, t.id)) return;
      const row = Math.floor(i / PER_ROW), col = i % PER_ROW;
      const g = t.geo();
      if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox);
      const sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, sz = box.max.z - box.min.z;
      const size = Math.max(sx, sz, sy * 0.8), k = Math.min(2.2, FIT / Math.max(size, 1e-3));
      const flat = sy < 0.45 * Math.max(sx, sz); // (coins, shells, bottle tops: propped up to show their faces)
      const c = g.clone();
      for (const key of Object.keys(c.attributes)) if (!['position', 'normal', 'color'].includes(key)) c.deleteAttribute(key);
      c.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); // (its middle, at the bottom)
      q.setFromEuler(new THREE.Euler(flat ? 1.05 : 0, flat ? 0 : ((i * 2.3) % 1 - 0.5) * 0.6, 0, 'YXZ'));
      const lift = flat ? (sz / 2) * Math.sin(1.05) * k : 0;
      const x = -W / 2 + 0.06 + SLOT * (col + 0.5), z = flat ? -0.04 : 0.02 + ((i * 7) % 3 - 1) * 0.015;
      m.compose(V(x, ROWS[row] + lift, z), q, V(k, k, k));
      c.applyMatrix4(m);
      geos.push(c);
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) return;
    merged.computeBoundingSphere();
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.geometry = merged; }
    else {
      this.mesh = new THREE.Mesh(merged, bakedMat());
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.group.add(this.mesh);
    }
  }

  /** Close enough (and in front of it) to look at what's on it? */
  facing(P) {
    if (!this.group.parent || !this.front) return false;
    const dx = P.x - this.group.position.x, dz = P.z - this.group.position.z;
    const ahead = dx * this.front.x + dz * this.front.z, across = Math.abs(dx * this.front.z - dz * this.front.x);
    return ahead > 0 && ahead < 1.6 && across < W / 2 + 0.3;
  }

  get hint() {
    if (!this.near) return null;
    const t = collection.totals();
    return `🎒 My treasure shelf: ${t.got} of ${t.all} found!`;
  }

  update(dt) {
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 1; this.place(); }
    if (this.dirty && this.group.parent) this.build();
    const P = this.player.pos, near = this.facing(P);
    if (near && !this.near && !this.busy() && this.hud.book.classList.contains('hidden') && this.hud.card.classList.contains('hidden')) {
      this.hud.bookTab = 'treasures'; // walk up to it: the Sniff Book opens at 🎒 Treasures
      this.hud.toggleBook(true);
    }
    if (!near && this.near && this.hud.bookTab === 'treasures') this.hud.bookTab = 'places';
    this.near = near;
  }
}
