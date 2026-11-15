import * as THREE from 'three';
import { SPHERE, bake, bakedMat } from '../../../entities/shapes.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { fbm3 } from '../../../core/rng.js';
import { LineBag } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { MUD } from '../../lines/woods.js';
import { wsfx } from './sounds.js';

/*
 * 🟤 Glorious mud. Walk through it and your dog gets muddier — paws first, then legs, tummy, everything.
 * Roll in it for the full effect. Friends see it (it goes out with your dog's position, see pack.js), muddy
 * paws leave prints wherever you go, and a splash in the stream or the pond washes it all off.
 * Levels: 0 clean · 1 muddy paws · 2 muddy legs and tummy · 3 mud monster.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MUD_COLS = [0x6e4d35, 0x5f402c, 0x7c5a3e];
const DRY = 150;            // seconds for mud to dry off by a level (on its own)
const PRINTS = 90, PRINT_LIFE = 28;

/** A lumpy tube from y0 up to y1, radius r0 → r1, with a ragged top edge (a mud "sock"). */
function sock(y0, y1, r0, r1, seed) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 12, 5, true);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = v.y + 0.5, ang = Math.atan2(v.z, v.x);
    const ragged = t > 0.75 ? (fbm3(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2, seed, 2) - 0.5) * 0.5 : 0; // drips at the top
    const r = (r0 + (r1 - r0) * t) * (1 + (fbm3(v.x * 3 + seed, v.y * 4, v.z * 3, 2) - 0.5) * 0.35);
    p.setXYZ(i, v.x * r, y0 + (y1 - y0) * Math.min(1, t + ragged * (t > 0.75 ? 1 : 0)), v.z * r);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

const cache = new WeakMap(); // breed → its mud shapes (every dog of a breed is the same shape)
function shapes(dog) {
  if (cache.has(dog.breed)) return cache.get(dog.breed);
  const L = dog.legScale, T = dog.breed.T ?? 1, { gx, gy, len, F = 0 } = dog.dims, f = F * 0.6;
  const col = (i, v) => MUD_COLS[(Math.floor(v.x * 97 + v.y * 61 + v.z * 83) & 7) % 3];
  const paw = (y, z) => ({ geo: SPHERE, color: MUD_COLS[1], pos: [0, y, z + 0.004], scale: [0.034 * T + f * 0.35, 0.024 * T + f * 0.2, 0.05 * T + f * 0.35] }); // (a bit bigger than the paw, so it's all muddy)
  const S = {
    // Front legs (on the knee bone: the lower leg runs down to the paw at -0.2 L).
    frontLow: bake([{ geo: sock(-0.215 * L, -0.11 * L, 0.023 * T + f, 0.023 * T + f, 1), colors: col }, paw(-0.2 * L - 0.01, 0.022)]),
    frontHigh: bake([{ geo: sock(-0.215 * L, -0.005 * L, 0.023 * T + f, 0.027 * T + f, 2), colors: col }, paw(-0.2 * L - 0.01, 0.022)]),
    // Back legs: the bit from the hock down (ankle bone, paw at -0.125 L) and the shin above it (knee bone).
    rearLow: bake([{ geo: sock(-0.135 * L, 0.0, 0.022 * T + f, 0.024 * T + f, 3), colors: col }, paw(-0.125 * L - 0.008, 0.016)]),
    rearHigh: bake([{ geo: sock(-0.17 * L, -0.02 * L, 0.024 * T + f, 0.034 * T + f, 4), colors: col }]),
    // A muddy tummy, and splodges up the sides and on the back.
    belly: bake([{ geo: SPHERE, pos: [0, -0.125 * gy - f * 0.4, 0.02 * len], scale: [0.062 * gx + f, 0.04 * gy, 0.21 * len], colors: col }]),
    // (on the back, and low down the sides where the tummy curves round)
    splats: bake([
      { geo: SPHERE, pos: [0.018 * gx, 0.098 * gy + f * 0.6, -0.09 * len], rot: [0, 0.4, 0], scale: [0.03 * gx, 0.01, 0.045 * len], colors: col },
      { geo: SPHERE, pos: [-0.03 * gx - f * 0.5, 0.085 * gy + f * 0.5, 0.11 * len], rot: [0.1, 0, -0.5], scale: [0.02 * gx, 0.009, 0.03 * len], colors: col },
      { geo: SPHERE, pos: [0.04 * gx, -0.1 * gy - f * 0.3, 0.13 * len], rot: [0, 0, 0.9], scale: [0.022 * gx, 0.012, 0.04 * len], colors: col },
      { geo: SPHERE, pos: [-0.042 * gx, -0.085 * gy - f * 0.3, -0.12 * len], rot: [0, 0, -0.9], scale: [0.022 * gx, 0.012, 0.04 * len], colors: col },
    ]),
  };
  cache.set(dog.breed, S);
  return S;
}

/** Mud on one dog (yours or a friend's): meshes on its bones, shown a bit at a time. */
export class MudCoat {
  constructor(dog) {
    this.dog = dog;
    this.level = 0;
    this.meshes = null;
  }

  build() {
    const d = this.dog, S = shapes(d), mat = bakedMat();
    const on = (bone, geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = true; m.visible = false; bone.add(m); return m; };
    this.front = d.legs.filter((l) => l.front).map((l) => on(l.knee, S.frontLow));
    this.rearLow = d.legs.filter((l) => !l.front).map((l) => on(l.ankle, S.rearLow));
    this.rearHigh = d.legs.filter((l) => !l.front).map((l) => on(l.knee, S.rearHigh));
    this.belly = on(d.body, S.belly);
    this.splats = on(d.body, S.splats);
    this.meshes = [...this.front, ...this.rearLow, ...this.rearHigh, this.belly, this.splats];
    this.S = S;
  }

  set(level) {
    if (level === this.level) return;
    this.level = level;
    if (!this.meshes) { if (!level) return; this.build(); }
    for (const m of this.front) { m.visible = level >= 1; m.geometry = level >= 2 ? this.S.frontHigh : this.S.frontLow; }
    for (const m of this.rearLow) m.visible = level >= 1;
    for (const m of this.rearHigh) m.visible = level >= 2;
    this.belly.visible = level >= 2;
    this.splats.visible = level >= 3;
  }

  dispose() { for (const m of this.meshes ?? []) m.removeFromParent(); this.meshes = null; this.level = 0; }
}

/** Muddy paw prints: one instanced mesh; old prints shrink away. */
class Prints {
  constructor(scene) {
    const pad = new THREE.CircleGeometry(1, 10);
    pad.rotateX(-Math.PI / 2);
    // A paw: a big pad and four toes, as one flat shape.
    const parts = [pad.clone().scale(0.05, 1, 0.045).translate(0, 0, -0.01)];
    for (const [x, z] of [[-0.045, 0.035], [-0.016, 0.055], [0.016, 0.055], [0.045, 0.035]]) parts.push(pad.clone().scale(0.017, 1, 0.02).translate(x, 0, z));
    const geo = bake(parts.map((p) => [p, 0xffffff]));
    this.mesh = new THREE.InstancedMesh(geo, paint(0x5f402c), PRINTS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.userData.noMerge = true;
    scene.add(this.mesh);
    this.list = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  add(x, y, z, heading, size) {
    if (this.list.length >= PRINTS) this.list.shift();
    this.list.push({ x, y: y + 0.055, z, h: heading, s: size, age: 0 });
  }

  update(dt) {
    let n = 0;
    this.list = this.list.filter((p) => (p.age += dt) < PRINT_LIFE);
    for (const p of this.list) {
      const k = p.s * Math.min(1, (PRINT_LIFE - p.age) / 6);
      this._q.setFromEuler(this._e.set(0, p.h, 0));
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(k, 1, k));
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0; // (no prints, no drawing)
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Your dog's mud (and your friends' muddy coats). */
export class Mud {
  /** zones: [{ x, z, rx, rz, big }] (world). */
  constructor({ scene, hud, player, actions, zones }) {
    Object.assign(this, { scene, hud, player, actions, zones });
    this.mud = 0;        // 0..3 (the level is how much)
    this.level = 0;
    this.coat = null;
    this.prints = new Prints(scene);
    this.stepT = 0;
    this.squelchT = 0;
    this.wetT = 0;
    this.lastPos = player.pos.clone();
    this.travel = 0;
    this.side = 1;
    this.bags = {};
    this.wasIn = false;
    this.remote = new WeakMap(); // dog → MudCoat (friends' dogs)
  }

  line(key) { return (this.bags[key] ??= new LineBag(MUD[key])).next(); }

  /** The mud zone at (x, z), if any. */
  zoneAt(x, z) { return this.zones.find((m) => ((x - m.x) / m.rx) ** 2 + ((z - m.z) / m.rz) ** 2 < 1) ?? null; }

  splodge(at, n = 10, up = 2.4) {
    this.actions.dirt.burst(n, () => ({
      pos: at.clone().add(V(Math.random() * 0.3 - 0.15, 0.05, Math.random() * 0.3 - 0.15)),
      vel: V(Math.random() * 2.4 - 1.2, 1 + Math.random() * up, Math.random() * 2.4 - 1.2),
      life: 0.9 + Math.random() * 0.4, size: 0.03 + Math.random() * 0.03, gravity: 9, floor: 0.06, color: MUD_COLS[Math.floor(Math.random() * 3)],
    }));
  }

  update(dt, canAct) {
    const P = this.player, pos = P.pos;
    if (this.coat && this.coat.dog !== P.dog) { this.coat.dispose(); this.coat = null; } // (changed dog in the lobby)
    this.coat ??= new MudCoat(P.dog);
    const zone = canAct && P.grounded && !P.inWater && pos.y < 0.15 ? this.zoneAt(pos.x, pos.z) : null;
    const moving = P.speed > 0.4;
    const before = this.mud;
    if (zone) {
      this.mud = Math.min(3, this.mud + dt * (moving ? 0.75 : 0.25) * (zone.big ? 1.4 : 1));
      this.squelchT -= dt;
      if (moving && this.squelchT <= 0) { this.squelchT = 0.32; wsfx.squelch(0.7); this.splodge(pos, 3, 1.2); }
      if (!this.wasIn) { this.hud.float(`🟤 ${this.line('splodge')}`, this.actions.anchor()); wsfx.squelch(); this.splodge(pos, 8); }
      if (P.landed > 0.2 && !this.landedHere) { this.mud = Math.min(3, this.mud + 1); this.splodge(pos, 18, 3.4); wsfx.splat(); this.hud.float('SPLAT! 🟤', this.actions.anchor()); }
      if (P.emoted === 'roll') { this.mud = 3; this.splodge(pos, 24, 3); wsfx.splat(); this.hud.say(`🟤 ${this.line('roll')}`, () => this.actions.anchor().add(V(0, 0.3, 0)), 2.6); }
    }
    this.landedHere = P.landed > 0.2;
    this.wasIn = !!zone;
    // A paddle or a swim washes it off.
    if (P.inWater && this.mud > 0) {
      this.wetT += dt * (P.swim > 0.4 ? 3 : 1);
      if (this.wetT > 0.9) {
        if (this.mud > 0.6) { this.hud.float(`✨ ${this.line('clean')}`, this.actions.anchor(), 'xp'); this.actions.sparkle(pos.clone().add(V(0, 0.5, 0)), 12); }
        this.mud = 0;
      }
    } else this.wetT = 0;
    if (!zone) this.mud = Math.max(0, this.mud - dt / DRY);
    const level = this.mud >= 2.4 ? 3 : this.mud >= 1.3 ? 2 : this.mud >= 0.25 ? 1 : 0;
    if (level === 3 && this.level < 3 && before < 2.4) { this.hud.say(`🟤 ${this.line('muddy')}`, () => this.actions.anchor().add(V(0, 0.3, 0)), 2.6); progress.award(2, 'Muddy dog!'); }
    this.level = level;
    P.mudLevel = level; // (friends see it: pack.js sends it with your position)
    this.coat.set(level);
    // Muddy paws leave prints (not in the mud itself, where you can't see them).
    const step = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    this.lastPos.copy(pos);
    if (level > 0 && P.grounded && !P.inWater && !zone && step < 1) {
      this.travel += step;
      const gap = 0.36 * P.dog.breed.size;
      if (this.travel > gap) {
        this.travel = 0;
        this.side = -this.side;
        const s = 0.07 * P.dog.breed.size, hx = Math.sin(P.heading), hz = Math.cos(P.heading);
        this.prints.add(pos.x + hz * s * this.side, pos.y, pos.z - hx * s * this.side, P.heading, P.dog.breed.size * (0.8 + level * 0.1));
      }
    }
    this.prints.update(dt);
  }

  /** A friend's dog is this muddy (from their position updates). */
  setRemote(dog, level) {
    let c = this.remote.get(dog);
    if (!c) { c = new MudCoat(dog); this.remote.set(dog, c); }
    c.set(level);
  }
}
