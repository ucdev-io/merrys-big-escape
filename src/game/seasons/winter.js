import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeasonPart } from './part.js';
import { paint } from '../../render/watercolorMaterial.js';
import { Particles } from '../../fx/particles.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { season } from '../season.js';
import { SNOWMAN as SAY, SLEDGE, ICE, PRESENT } from '../lines/seasons.js';
import { TOWN } from '../../world/town/generator.js';
import { blocked } from '../../world/spots.js';
import { V, flat, rand, pick, seasonRng, lawnSpot, clearSpot } from './common.js';
import {
  instanced, snowballGeometry, snowmanDressing, moundGeometry, SNOWMAN, sledgeGeometry, christmasTree, starGeometry,
  presentGeometry, skatingDuck, iceGeometry,
} from './models.js';

const H = TOWN.BLOCK / 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pop = (t) => (t >= 1 ? 1 : Math.max(0.001, 1 + 0.25 * Math.sin(t * Math.PI) - (1 - t) ** 3)); // grows in with a little bounce

/**
 * ❄️ Winter: snow on everything (painted in), and
 *   the pond freezes: ice to slide about on (dogs can't grip!), with ducks skating figures of eight;
 *   snowmen to build (🐾, a snowball at a time — friends can help) and to knock over (woof, or zoom into one);
 *   a snowy hill in the park with a sledge: hop on at the top 🐾, steer, wheee — then tow it back up 🐾;
 *   and at Christmas, lights on every house, a big tree in the park, and presents to deliver (📋 board).
 */
export class Winter extends SeasonPart {
  constructor(S) {
    super(S);
    this.puffs = new Particles(S.scene, { max: 220 });
    this.objects.push(this.puffs.mesh);
    this.ice = new Ice(this);
    this.hill = this.town ? Hill.build(this) : null;
    this.sledge = this.hill ? new Sledge(this, this.hill) : null;
    this.xmas = season.christmas ? new Christmas(this) : null;
    this.snowmen = new Snowmen(this); // (after the hill and the tree: not on top of either)
    this.puffT = 0;
  }

  line(list) { return this.S.line(list, list); }
  anchor() { return this.S.actions.anchor(); }
  me() { return this.S.me(); }

  /** A puff of snow (a snowball landing, a snowman falling…). */
  puff(at, n = 14, power = 1) {
    this.puffs.burst(n, () => ({
      pos: at.clone().add(V(rand(-0.2, 0.2), rand(0, 0.3), rand(-0.2, 0.2))),
      vel: V(rand(-1.2, 1.2) * power, rand(0.8, 2.4) * power, rand(-1.2, 1.2) * power),
      life: rand(0.6, 1.1), size: rand(0.03, 0.06), gravity: 6, drag: 1.5, floor: at.y, color: pick([0xffffff, 0xf3f6fb, 0xe8eef8]),
    }));
  }

  /** Remove one collider early (a snowman knocked down). */
  uncollide(c) {
    const C = this.world.colliders;
    C.circles = C.circles.filter((q) => q !== c);
    this.cols = this.cols.filter((q) => q !== c);
  }

  heightAt(x, z) { return Math.max(this.ice.heightAt(x, z), this.hill?.heightAt(x, z) ?? 0); }

  update(dt, f) {
    const P = this.player;
    this.ice.update(dt, P);
    this.snowmen.update(dt, P, f);
    this.sledge?.update(dt, P, f);
    this.xmas?.update(dt, P);
    // Snow kicked up by galloping paws.
    this.puffT -= dt;
    if (P.grounded && P.speed > 3.4 && !P.inWater && !P.sledging && P.grip > 0.5 && this.puffT <= 0) {
      this.puffT = 0.07;
      const back = V(-Math.sin(P.heading), 0, -Math.cos(P.heading));
      this.puffs.burst(2, () => ({
        pos: P.pos.clone().add(back.clone().multiplyScalar(0.25)).add(V(rand(-0.12, 0.12), 0.05, rand(-0.12, 0.12))),
        vel: back.clone().multiplyScalar(rand(0.5, 1.4)).add(V(rand(-0.4, 0.4), rand(0.6, 1.4), rand(-0.4, 0.4))),
        life: rand(0.4, 0.7), size: rand(0.025, 0.045), gravity: 5, drag: 2, floor: P.pos.y, color: pick([0xffffff, 0xeef2f8]),
      }));
    }
    // Things lying about on the snowy hill sit on top of it, not inside it.
    if (this.hill) for (const it of this.S.actions?.carry.items ?? []) {
      const h = this.hill.heightAt(it.pos.x, it.pos.z);
      if (h > 0.02 && !it.hop) { it.pos.y = Math.max(it.pos.y, h + 0.02); if (it.mound) it.mound.position.y = h + 0.02; }
    }
    this.puffs.update(dt);
  }

  onDig(nose) { return this.sledge?.onDig(nose) || this.snowmen.onDig(nose); }
  onBark(pos) { this.snowmen.onBark(pos); this.ice.skaters?.onBark(pos); }
  get prompt() { return this.sledge?.prompt ?? this.snowmen.prompt ?? this.xmas?.prompt ?? null; }
  get pawAct() { return this.sledge?.pawAct ?? this.snowmen.pawAct ?? null; }
  toy(m, mine) { if (m.id?.startsWith('sm')) this.snowmen.toy(m, mine); }
  adopt(toys) { this.snowmen.adopt(toys); }

  dispose() {
    this.sledge?.stop(true);
    this.ice.dispose();
    this.xmas?.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
/** The pond (and the garden's paddling pool) frozen over: ice to stand on and slide about on. */
class Ice {
  constructor(W) {
    this.W = W;
    this.zones = (W.world.water ?? []).filter((w) => w.kind === 'pond' || w.kind === 'pool');
    for (const z of this.zones) {
      z.frozen = true;
      const pond = z.kind === 'pond', rx = pond ? z.rx : z.r, rz = pond ? z.rz : z.r;
      z.iceTop = pond ? 0.108 : z.surface + 0.006;
      z.standY = pond ? 0.075 : z.surface - 0.02;
      const m = new THREE.Mesh(iceGeometry(rx, rz, z.iceTop, pond ? {} : { rings: 6, segs: 40 }), paint(0xffffff, { vertexColors: true }));
      m.position.set(z.x, 0, z.z);
      m.receiveShadow = true;
      W.add(m);
    }
    this.pond = this.zones.find((z) => z.kind === 'pond') ?? null;
    this.skaters = this.pond ? new Skaters(W, this.pond) : null;
    this.slideT = 3;
    this.onIce = false;
  }

  inside(w, x, z, k = 1) {
    return w.kind === 'pond' ? ((x - w.x) / w.rx) ** 2 + ((z - w.z) / w.rz) ** 2 < k * k : (x - w.x) ** 2 + (z - w.z) ** 2 < (w.r * k) ** 2;
  }

  heightAt(x, z) { for (const w of this.zones) if (this.inside(w, x, z)) return w.standY; return 0; }

  update(dt, P) {
    const on = P.pos.y < 0.6 && this.zones.some((w) => this.inside(w, P.pos.x, P.pos.z, 0.98));
    P.grip = on ? 0.16 : 1; // wheee!
    this.slideT -= dt;
    if (on && !this.onIce && P.speed > 1.5 && this.slideT <= 0) { this.slideT = 14; this.W.hud.float(this.W.line(ICE.slide), this.W.anchor()); }
    this.onIce = on;
    this.skaters?.update(dt, P);
  }

  dispose() {
    for (const z of this.zones) z.frozen = false;
    this.W.player.grip = 1;
  }
}

/** Mallards in woolly scarves, skating figures of eight on the frozen pond. (Woof and they speed up!) */
class Skaters {
  constructor(W, pond) {
    Object.assign(this, { W, pond });
    this.mesh = W.add(instanced(skatingDuck(), 3));
    this.ducks = [0, 1, 2].map((i) => ({ a: i * 2.1, speed: 0.22 + i * 0.05, r: 0.42 + i * 0.13, k: i % 2 ? 2 : 1, spin: 0, spinT: 3 + i * 4, fast: 0, h: 0, lean: 0, quackT: i * 3 }));
  }

  where(d, a) {
    const p = this.pond;
    return [p.x + Math.cos(a) * p.rx * d.r, p.z + Math.sin(a * d.k) * p.rz * d.r * (d.k === 2 ? 0.75 : 1)];
  }

  update(dt, P) {
    this.ducks.forEach((d, i) => {
      d.fast = Math.max(0, d.fast - dt);
      d.a += dt * d.speed * (d.fast > 0 ? 2.4 : 1);
      const [x, z] = this.where(d, d.a), [x2, z2] = this.where(d, d.a + 0.05);
      const h = Math.atan2(x2 - x, z2 - z);
      let turn = h - d.h; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      d.h = h;
      d.lean += (Math.max(-0.35, Math.min(0.35, -turn * 8)) - d.lean) * (1 - Math.exp(-dt * 3));
      d.spinT -= dt;
      if (d.spinT <= 0) { d.spinT = 7 + Math.random() * 8; d.spin = Math.PI * 2; } // a twirl!
      d.spin = Math.max(0, d.spin - dt * 7);
      d.quackT -= dt;
      if (d.quackT <= 0 && flat(P.pos, { x, z }) < 4) { d.quackT = 10 + Math.random() * 6; sfx.quack?.(); this.W.hud.float(this.W.line(ICE.duck), V(x, 0.7, z), 'sniff'); }
      _q.setFromEuler(_e.set(0, h + d.spin, d.lean, 'YXZ'));
      _m.compose(_p.set(x, this.pond.iceTop - 0.004, z), _q, _s.set(1, 1, 1));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  onBark(pos) {
    for (const d of this.ducks) {
      const [x, z] = this.where(d, d.a);
      if (flat(pos, { x, z }) < 7) { d.fast = 2.5; d.spin = Math.PI * 2; }
    }
  }
}

// ---------------------------------------------------------------------------------------------
/**
 * Snowmen to build, a snowball at a time (🐾 at a little heap of snow), and to knock over (woof, or zoom
 * into one). In a pack they're shared: friends can help build, and everyone who did gets the credit.
 */
class Snowmen {
  constructor(W) {
    this.W = W;
    const { world } = W, spots = [];
    if (W.town) {
      const rng = seasonRng(W.S.seed, 'snowmen');
      const taken = [...spots, ...(W.xmas?.spot ? [W.xmas.spot] : [])], ok = (s) => s && !(W.hill?.heightAt(s.x, s.z) > 0) && flat(s, W.xmas?.spot ?? { x: 1e4, z: 1e4 }) > 3;
      const near = (x, z, a, b, n, lawn = true) => {
        for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const s = lawnSpot(world, rng, x, z, a, b, { pad: 0.9, avoid: [...taken, ...spots], gap: 5, lawn }); if (ok(s)) { spots.push(s); break; } }
      };
      for (const type of ['park', 'pond']) { const p = world.layout.places.find((q) => q.type === type); if (p) near(p.x, p.z, type === 'park' ? 4 : 10.5, 13.5, type === 'park' ? 3 : 2); }
      const gardens = rng.shuffle((world.gardens ?? []).filter((g) => g.front && g.rect).slice());
      for (const g of gardens.slice(0, 7)) {
        const r = g.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        near(cx + g.front.x * 2.5, cz + g.front.z * 2.5, 0, 3, 1);
      }
    } else spots.push(V(-3.6, 0, 1.2)); // (the back garden)
    this.list = spots.map((p, i) => ({ id: `sm${i}`, x: p.x, z: p.z, ry: ((i * 2.399) % (Math.PI * 2)), s: 0, shown: [1, 1, 1, 1], knock: null, col: null }));
    const n = this.list.length;
    this.balls = W.add(instanced(snowballGeometry(), n * 3));
    this.dress = W.add(instanced(snowmanDressing(), n));
    this.mounds = W.add(instanced(moundGeometry(), n, { shadow: false }));
    for (const sm of this.list) this.draw(sm);
    this.knockCD = 0;
    this.near = null;
  }

  /** Put a snowman's instances where its stage (and any animation) says. */
  draw(sm) {
    const i = this.list.indexOf(sm), parts = [SNOWMAN.base, SNOWMAN.mid, SNOWMAN.head];
    const set = (mesh, k, x, y, z, s, rx = 0, ry = sm.ry, rz = 0) => {
      if (s <= 0.002) { mesh.setMatrixAt(k, ZERO); return; }
      _q.setFromEuler(_e.set(rx, ry, rz));
      mesh.setMatrixAt(k, _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s)));
    };
    const K = sm.knock;
    parts.forEach((b, j) => {
      if (K) { const f = K.parts[j]; set(this.balls, i * 3 + j, f.x, f.y, f.z, b.r * f.s, f.rx, sm.ry, f.rz); return; }
      set(this.balls, i * 3 + j, sm.x, b.y, sm.z, sm.s > j ? b.r * pop(sm.shown[j]) : 0);
    });
    if (K) set(this.dress, i, K.dress.x, K.dress.y, sm.z + K.dress.dz, K.dress.s, K.dress.rx, sm.ry, K.dress.rz);
    else set(this.dress, i, sm.x, 0, sm.z, sm.s >= 4 ? pop(sm.shown[3]) : 0);
    set(this.mounds, i, sm.x, 0.03, sm.z, sm.s === 0 && !K ? 1 : 0, 0, sm.ry);
    this.balls.instanceMatrix.needsUpdate = this.dress.instanceMatrix.needsUpdate = this.mounds.instanceMatrix.needsUpdate = true;
  }

  height(sm) { return sm.s >= 3 ? 1.45 : sm.s === 2 ? 1.1 : 0.68; }

  /** A snowman's stage changed: grow it (with a pop) or knock it down (with a tumble). */
  setStage(sm, s, animate = true) {
    const was = sm.s;
    sm.s = s;
    if (s > was) for (let j = was; j < s; j++) sm.shown[j] = animate ? 0 : 1;
    if (s === 0 && was > 0 && animate) {
      const out = V(Math.sin(sm.ry + 1.2), 0, Math.cos(sm.ry + 1.2));
      sm.knock = {
        t: 0,
        parts: [SNOWMAN.base, SNOWMAN.mid, SNOWMAN.head].map((b, j) => ({ x: sm.x, y: b.y, z: sm.z, vx: out.x * (0.4 + j * 0.8) + rand(-0.5, 0.5), vz: out.z * (0.4 + j * 0.8) + rand(-0.5, 0.5), vy: rand(0.5, 2) * (j ? 1 : 0.3), r: b.r, s: was > j ? 1 : 0, rx: 0, rz: 0 })),
        dress: { x: sm.x, y: 0, dz: 0, s: was >= 4 ? 1 : 0, rx: 0, rz: 0 },
      };
    }
    if (s >= 1 && !sm.col) sm.col = this.W.circle(sm.x, sm.z, 0.36, 1.5, false);
    if (sm.col) sm.col.top = s >= 1 ? this.height(sm) : 0;
    if (s === 0 && sm.col) { this.W.uncollide(sm.col); sm.col = null; }
    this.draw(sm);
  }

  update(dt, P) {
    this.knockCD -= dt;
    for (const sm of this.list) {
      let dirty = false;
      for (let j = 0; j < 4; j++) if (sm.shown[j] < 1) { sm.shown[j] = Math.min(1, sm.shown[j] + dt * 2.6); dirty = true; }
      const K = sm.knock;
      if (K) {
        K.t += dt;
        for (const f of K.parts) {
          f.vy -= 9 * dt;
          f.x += f.vx * dt; f.z += f.vz * dt; f.y = Math.max(f.r * 0.9, f.y + f.vy * dt);
          if (f.y <= f.r * 0.9) { f.vy = 0; f.vx *= 0.96; f.vz *= 0.96; }
          f.rx += f.vz * dt / f.r; f.rz -= f.vx * dt / f.r; // (rolling)
          if (K.t > 1.3) f.s = Math.max(0, f.s - dt * 1.4);
        }
        K.dress.rx = Math.min(Math.PI / 2, K.dress.rx + dt * 3);
        K.dress.dz = Math.min(0.5, K.dress.dz + dt * 1.2);
        if (K.t > 1.3) K.dress.s = Math.max(0, K.dress.s - dt * 1.4);
        if (K.t > 2.2) sm.knock = null;
        dirty = true;
      }
      if (dirty) this.draw(sm);
    }
    // Zooming into a snowman knocks it flat.
    const near = this.nearest(P.pos, 1.6);
    this.near = near;
    if (near && near.s >= 2 && P.speed > 4.6 && this.knockCD <= 0 && flat(P.pos, near) < 0.85) { this.knockCD = 1; this.W.S.send({ a: 'toy', id: near.id, op: 'knock' }); }
  }

  nearest(pos, r) {
    let best = null, bd = r;
    for (const sm of this.list) { const d = flat(pos, sm); if (d < bd) { bd = d; best = sm; } }
    return best;
  }

  onDig(nose) {
    const sm = this.nearest(nose, 1.25);
    if (!sm) return false;
    if (sm.s >= 4) { this.W.hud.float('⛄ Woof to knock it over!', this.W.anchor()); return true; }
    this.W.S.send({ a: 'toy', id: sm.id, op: 'build' });
    this.W.player.digTimer = 0.35;
    return true;
  }

  onBark(pos) {
    const sm = this.nearest(pos, 2.8);
    if (sm && sm.s >= 1 && this.knockCD <= 0) { this.knockCD = 0.8; this.W.S.send({ a: 'toy', id: sm.id, op: 'knock' }); }
  }

  /** From the SeasonRoom: a snowball added, a snowman finished, or one knocked down. */
  toy(m, mine) {
    const sm = this.list.find((q) => q.id === m.id);
    if (!sm) return;
    const W = this.W, head = V(sm.x, 1.7, sm.z), close = flat(W.player.pos, sm) < 18;
    if (m.op === 'build') {
      if (m.s === 1) { // (a new snowman looks at whoever started him)
        const who = m.by === W.me() ? W.player.pos : W.S.remotes?.get(m.by)?.dog.root.position;
        if (who) sm.ry = Math.atan2(who.x - sm.x, who.z - sm.z);
      }
      this.setStage(sm, m.s);
      W.puff(V(sm.x, [SNOWMAN.base, SNOWMAN.mid, SNOWMAN.head, SNOWMAN.head][m.s - 1].y + 0.2, sm.z), 10, 0.6);
      if (close) sfx.dig?.();
      if (mine && m.s < 4) W.hud.float(SAY.stage[m.s - 1] ?? '⛄', head, 'sniff');
      if (m.s === 4) {
        if (close) { sfx.found?.(); W.S.actions.sparkle(head.clone(), 22); }
        if (m.team?.includes(W.me())) {
          const before = progress.stats.snowmen ?? 0;
          progress.stat('snowmen');
          progress.award(10, m.team.length > 1 ? 'Team snowman!' : 'Snowman!');
          W.hud.float(W.line(m.team.length > 1 ? SAY.team : SAY.done), head, 'xp');
          buzz([20, 30, 20]);
          for (const c of COSMETICS) if (c.friend === 'snowmen' && before < c.jobs && before + 1 >= c.jobs) W.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'For all those snowmen. Wear it from ☰ → My dog → Dress up.');
        }
      }
    } else if (m.op === 'knock') {
      this.setStage(sm, 0);
      W.puff(V(sm.x, 0.6, sm.z), 26, 1.2);
      if (close) { sfx.bonk?.(); W.hud.float(W.line(SAY.knock), head); }
      if (mine) progress.award(2, 'Splat!');
    }
  }

  adopt(toys) {
    const got = new Map(toys.filter(([id]) => id.startsWith('sm')));
    for (const sm of this.list) this.setStage(sm, got.get(sm.id) ?? 0, false);
  }

  get prompt() {
    const sm = this.near;
    if (!sm || flat(this.W.player.pos, sm) > 1.6) return null;
    return sm.s >= 4 ? '⛄ Woof to knock him over! (or zoom into him)' : sm.s ? `⛄ Keep building! 🐾 (${sm.s}/4)` : '⛄ Build a snowman! 🐾';
  }

  get pawAct() { const sm = this.near; return sm && sm.s < 4 && flat(this.W.player.pos, sm) < 1.6 ? 'build' : null; }
}

// ---------------------------------------------------------------------------------------------
/** A snowy hill in a corner of the park, for sledging. Height along the corner's diagonal (a) and across it (b). */
class Hill {
  static A = [8.6, 14.0, 15.0, 16.5]; // rises from A0 to A1, flat to A2, down again by A3
  static B = [1.9, 2.9];               // full width to B0, gone by B1
  static TOP = 1.3;

  /** Pick the park corner with the least in the way (trees, benches, Gus, Pepper's nest…), and build it there. */
  static build(W) {
    const park = W.world.layout.places.find((p) => p.type === 'park');
    if (!park) return null;
    const avoid = [W.S.friends?.gus?.pos, ...(W.S.friends?.extras ?? []).map((e) => e.nest), { x: park.x - 10, z: park.z + 6 }, { x: park.x + 9.5, z: park.z - 6.5 }].filter(Boolean); // (Gus, Pepper's nest, the swings, the slide)
    let best = null;
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const u = { x: sx / Math.SQRT2, z: sz / Math.SQRT2 };
      let bad = 0;
      for (let a = Hill.A[0]; a <= Hill.A[3]; a += 0.7) for (let b = -Hill.B[1]; b <= Hill.B[1]; b += 0.7) {
        const x = park.x + u.x * a - u.z * b, z = park.z + u.z * a + u.x * b;
        if (blocked(W.world, x, z, 0.25)) bad++;
        if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) bad += 3;
      }
      if (!best || bad < best.bad) best = { u, bad };
    }
    return new Hill(W, park, best.u);
  }

  constructor(W, park, u) {
    Object.assign(this, { W, c: { x: park.x, z: park.z }, u });
    // The mesh: a grid over the hill, a little sunk at its edges so it rises out of the lawn.
    const A = Hill.A, B = Hill.B, na = 34, nb = 18, pos = [], idx = [];
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
      const a = A[0] - 0.4 + (A[3] - A[0] + 0.8) * (i / na), b = -B[1] - 0.2 + (B[1] * 2 + 0.4) * (j / nb);
      const x = this.c.x + u.x * a - u.z * b, z = this.c.z + u.z * a + u.x * b;
      pos.push(x, this.local(a, b) + 0.035, z);
      if (i < na && j < nb) { const k = i * (nb + 1) + j; idx.push(k, k + 1, k + nb + 1, k + 1, k + nb + 2, k + nb + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, paint(0xf6f8fc));
    m.receiveShadow = true;
    m.castShadow = true;
    W.add(m);
    this.top = V(this.c.x + u.x * (A[1] + 0.35), 0, this.c.z + u.z * (A[1] + 0.35));
    this.down = Math.atan2(-u.x, -u.z); // facing down the hill
  }

  local(a, b) {
    const [A0, A1, A2, A3] = Hill.A, [B0, B1] = Hill.B;
    const along = a < A1 ? smooth(A0, A1, a) : a < A2 ? 1 : 1 - smooth(A2, A3, a);
    return Hill.TOP * along * (1 - smooth(B0, B1, Math.abs(b)));
  }

  ab(x, z) { const dx = x - this.c.x, dz = z - this.c.z; return [dx * this.u.x + dz * this.u.z, -dx * this.u.z + dz * this.u.x]; }
  heightAt(x, z) { const [a, b] = this.ab(x, z); return a < Hill.A[0] || a > Hill.A[3] || Math.abs(b) > Hill.B[1] ? 0 : this.local(a, b); }
  onTop(x, z) { const [a, b] = this.ab(x, z); return a > Hill.A[1] - 0.6 && a < Hill.A[2] + 0.4 && Math.abs(b) < 1.4; }
}

/** The sledge: hop on at the top of the hill (🐾), steer as you whoosh down; tow it back up (🐾, then 🐾 to let go). */
class Sledge {
  constructor(W, hill) {
    Object.assign(this, { W, hill });
    this.geo = sledgeGeometry();
    this.mat = paint(0xffffff, { vertexColors: true });
    this.mesh = W.add(new THREE.Mesh(this.geo, this.mat));
    this.mesh.castShadow = true;
    this.state = 'parked';
    this.pos = hill.top.clone();
    this.heading = hill.down;
    this.idleT = 0;
    this.v = new THREE.Vector2();
    this.remotes = new Map(); // other dogs on their sledges
    this.place();
  }

  place() {
    const h = this.hill.heightAt(this.pos.x, this.pos.z), f = V(Math.sin(this.heading), 0, Math.cos(this.heading));
    const ahead = this.hill.heightAt(this.pos.x + f.x * 0.4, this.pos.z + f.z * 0.4), behind = this.hill.heightAt(this.pos.x - f.x * 0.4, this.pos.z - f.z * 0.4);
    this.mesh.position.set(this.pos.x, h + 0.035, this.pos.z);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.rotateY(this.heading);
    this.mesh.rotateX(-Math.atan2(ahead - behind, 0.8));
  }

  near(P) { return flat(P.pos, this.pos) < 1.15 && Math.abs(P.pos.y - this.hill.heightAt(this.pos.x, this.pos.z)) < 0.5; }

  onDig() {
    const P = this.W.player;
    if (this.state === 'riding') return true;
    if (this.state === 'towed') { this.state = 'parked'; this.idleT = 0; sfx.boink?.(); return true; }
    if (!this.near(P)) return false;
    if (this.hill.heightAt(this.pos.x, this.pos.z) > 0.45) this.ride(P);
    else { this.state = 'towed'; this.W.hud.float(this.W.line(SLEDGE.tow), this.W.anchor()); sfx.pop?.(); }
    return true;
  }

  ride(P) {
    this.state = 'riding';
    this.t = 0; this.slowT = 0; this.bumped = 0;
    const f = V(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.v.set(f.x * 1.2, f.z * 1.2);
    Object.assign(P, { frozen: true, lockY: true, sledging: true });
    P.vel.set(0, 0);
    P.dog.emote('sit');
    this.W.S.pack?.act?.('emote', { id: 'sit' });
    this.W.hud.float(this.W.line(SLEDGE.hop), this.W.anchor(), 'xp');
    sfx.boing?.();
    buzz(20);
  }

  /** Off the sledge (at the bottom, after a bump, or the season's ending). */
  stop(quiet = false) {
    const P = this.W.player;
    if (this.state !== 'riding') return;
    this.state = 'parked';
    this.idleT = 0;
    Object.assign(P, { frozen: false, lockY: false, sledging: false });
    P.vy = 0;
    P.grounded = true;
    P.dog.stopEmote();
    if (!quiet) {
      this.W.hud.float(this.W.line(this.bumped ? SLEDGE.bump : SLEDGE.done), this.W.anchor(), this.bumped ? '' : 'xp');
      if ((this.starT ?? 0) < performance.now()) { this.starT = performance.now() + 30000; progress.award(4, 'Wheee!'); }
    }
  }

  update(dt, P, f) {
    if (this.state === 'riding') this.slide(dt, P);
    else if (this.state === 'towed') {
      const back = V(-Math.sin(P.heading), 0, -Math.cos(P.heading));
      const to = P.pos.clone().addScaledVector(back, 1.15);
      this.pos.lerp(to, 1 - Math.exp(-dt * 8));
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) > 0.2) this.heading = Math.atan2(dx, dz);
      if (this.hill.onTop(this.pos.x, this.pos.z)) { // at the top: ready to go again
        this.state = 'parked';
        this.pos.copy(this.hill.top);
        this.heading = this.hill.down;
        this.W.hud.float('🛷 Ready! Hop on 🐾', this.W.anchor(), 'xp');
        sfx.pop?.();
      }
      if (f.barked) this.state = 'parked';
      this.place();
    } else {
      // Left at the bottom for a while: it finds its own way back up the hill.
      this.idleT += dt;
      if (this.idleT > 40 && !this.hill.onTop(this.pos.x, this.pos.z) && flat(P.pos, this.pos) > 4) {
        this.idleT = 0;
        this.pos.copy(this.hill.top);
        this.heading = this.hill.down;
        this.W.S.actions?.sparkle(this.pos.clone().setY(1.5), 14);
        this.place();
      }
    }
    this.updateRemotes();
  }

  slide(dt, P) {
    const hill = this.hill, p = this.pos, e = 0.25;
    this.t += dt;
    const gx = (hill.heightAt(p.x + e, p.z) - hill.heightAt(p.x - e, p.z)) / (2 * e);
    const gz = (hill.heightAt(p.x, p.z + e) - hill.heightAt(p.x, p.z - e)) / (2 * e);
    const h = hill.heightAt(p.x, p.z), v = this.v;
    v.x -= gx * 9.8 * 0.85 * dt;
    v.y -= gz * 9.8 * 0.85 * dt;
    // Steer (left/right on the stick, relative to the way you're going).
    const mv = this.W.S.input?.move?.() ?? { x: 0 }, turn = -(mv.x ?? 0) * 1.5 * dt * Math.min(1, v.length() / 1.5);
    const c = Math.cos(turn), s = Math.sin(turn);
    v.set(v.x * c - v.y * s, v.x * s + v.y * c);
    const sp = v.length(), mu = h > 0.05 ? 0.035 : 0.15;
    if (sp > 0) v.multiplyScalar(Math.max(0, sp - mu * 9.8 * dt - 0.015 * sp * sp * dt) / sp);
    if (v.length() > 8.5) v.setLength(8.5);
    const was = { x: p.x, z: p.z };
    p.x += v.x * dt; p.z += v.y * dt;
    const q = { x: p.x, z: p.z, y: h };
    this.W.world.colliders.resolve(q, 0.4, 0.3);
    if (Math.hypot(q.x - p.x, q.z - p.z) > 0.01) { // bumped into something: bounce off, and that's the end of the ride
      p.x = q.x; p.z = q.z;
      if (v.length() > 1.8) { this.bumped = 0.5; this.W.puff(p.clone().setY(0.3), 14, 0.8); sfx.bonk?.(); buzz(25); }
      v.multiplyScalar(-0.25);
    }
    const b = this.W.world.bounds;
    if (b) { p.x = Math.min(b.x1 - 1, Math.max(b.x0 + 1, p.x)); p.z = Math.min(b.z1 - 1, Math.max(b.z0 + 1, p.z)); }
    if (v.length() > 0.3) this.heading = Math.atan2(v.x, v.y);
    this.place();
    // The dog sits on the sledge.
    const y = hill.heightAt(p.x, p.z);
    P.pos.set(p.x, y + 0.13, p.z);
    P.heading = this.heading;
    P.object.rotation.y = this.heading;
    P.vel.set(0, 0);
    P.speed = 0;
    if ((P.dog.emoteT ?? 0) < 1) P.dog.emote('sit');
    if (v.length() > 2.5 && Math.random() < dt * 30) this.W.puffs.spawn({ pos: p.clone().setY(y + 0.05), vel: V(-v.x * 0.15 + rand(-0.4, 0.4), rand(0.4, 1.2), -v.y * 0.15 + rand(-0.4, 0.4)), life: 0.6, size: rand(0.025, 0.05), gravity: 5, drag: 2, floor: y, color: 0xffffff });
    this.slowT = v.length() < 0.3 ? this.slowT + dt : 0;
    if (this.bumped) this.bumped = Math.max(0.001, this.bumped - dt);
    if ((this.t > 0.8 && this.slowT > 0.5) || (this.bumped && this.bumped < 0.05) || this.t > 18) this.stop();
  }

  /** Friends on their sledges (they say so in their state: flag 32). */
  updateRemotes() {
    const seen = new Set();
    for (const r of this.W.S.remotes?.dogs.values() ?? []) {
      const last = r.buf?.[r.buf.length - 1];
      if (!last || !(last.f & 32) || !r.dog.root.visible) continue;
      seen.add(r.id);
      let m = this.remotes.get(r.id);
      if (!m) { m = this.W.add(new THREE.Mesh(this.geo, this.mat)); m.castShadow = true; this.remotes.set(r.id, m); }
      const q = r.dog.root.position;
      m.position.set(q.x, q.y - 0.1, q.z);
      m.rotation.set(0, r.dog.root.rotation.y, 0);
      m.visible = true;
    }
    for (const [id, m] of this.remotes) if (!seen.has(id)) m.visible = false;
  }

  get prompt() {
    const P = this.W.player;
    if (this.state === 'riding') return '🛷 Wheee! Steer left and right';
    if (this.state === 'towed') return '🛷 Pull it to the top of the hill (🐾 lets go)';
    if (!this.near(P)) return null;
    return this.hill.heightAt(this.pos.x, this.pos.z) > 0.45 ? '🛷 Hop on the sledge! 🐾' : '🛷 Tow the sledge back up the hill 🐾';
  }

  get pawAct() { return this.state === 'riding' ? 'ride' : this.state === 'towed' ? 'drop' : this.near(this.W.player) ? (this.hill.heightAt(this.pos.x, this.pos.z) > 0.45 ? 'ride' : 'tow') : null; }
}

// ---------------------------------------------------------------------------------------------
const BULBS = [0xff6b5b, 0x6fd28a, 0xffd25a, 0x6fa8ff, 0xfff4dc, 0xff9be0];

/** 🎄 Christmas: twinkly lights along every house's roof, and a big tree in the park with presents under it. */
class Christmas {
  constructor(W) {
    this.W = W;
    const L = W.world.landmarks ?? { houses: [], shops: [] }, pts = [], wires = [];
    const at = (o, lx, ly, lz) => { const c = Math.cos(o.ry), s = Math.sin(o.ry); return [o.x + lx * c + lz * s, ly, o.z - lx * s + lz * c]; };
    for (const o of L.houses) {
      const half = o.w / 2 + 0.35, top = o.h * 1.55, z = o.d / 2 + 0.45;
      const edge = (x0, y0, x1, y1) => {
        const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(3, Math.round(len / 0.36));
        const line = [];
        for (let i = 0; i <= n; i++) { const t = i / n, sag = Math.sin(t * Math.PI * Math.max(1, Math.round(n / 3))) * 0.03; const p = at(o, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - 0.07 - Math.abs(sag), z); line.push(p); if (i < n) pts.push(p); }
        wires.push(line);
      };
      edge(-half, o.h, 0, top);
      edge(0, top, half, o.h);
    }
    for (const o of L.shops) {
      const n = Math.round(o.w / 0.4), line = [];
      for (let i = 0; i <= n; i++) { const p = at(o, -o.w / 2 + (o.w * i) / n, o.h - 0.05 - Math.abs(Math.sin(i * 0.8)) * 0.06, o.d / 2 + 0.2); pts.push(p); line.push(p); }
      wires.push(line);
    }
    this.bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, pts.length));
    this.bulbs.frustumCulled = false;
    pts.forEach((p, i) => {
      this.bulbs.setMatrixAt(i, _m.makeTranslation(...p));
      this.bulbs.setColorAt(i, _c.set(BULBS[i % BULBS.length]));
    });
    this.bulbs.count = pts.length;
    W.add(this.bulbs);
    if (wires.length) {
      const geos = wires.filter((l) => l.length > 1).map((l) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(l.map((p) => new THREE.Vector3(p[0], p[1] + 0.035, p[2]))), l.length * 2, 0.008, 4, false));
      const wire = new THREE.Mesh(mergeAll(geos), paint(0x2c3a2e));
      W.add(wire);
    }
    this.phase = pts.map(() => Math.random() * 6.28);
    this.t = 0; this.tw = 0;
    if (W.town) this.tree();
  }

  /** The town's big tree, in the park (where the presents for the 📋 board's Christmas jobs are). */
  tree() {
    const W = this.W, park = W.world.layout.places.find((p) => p.type === 'park');
    if (!park) return;
    let spot = null;
    for (const [dx, dz] of [[3.6, 3.6], [-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [0, 5.2], [5.2, 0], [0, -5.2], [-5.2, 0]]) {
      const [a, b] = W.hill?.ab(park.x + dx, park.z + dz) ?? [-1, 0];
      if (a > -1 && Math.abs(b) < 3.4) continue; // (not in the way of the sledges)
      if (clearSpot(W.world, park.x + dx, park.z + dz, 1.6)) { spot = V(park.x + dx, 0, park.z + dz); break; }
    }
    if (!spot) return;
    const g = new THREE.Group();
    g.position.copy(spot);
    const t = new THREE.Mesh(christmasTree(), paint(0xffffff, { vertexColors: true, season: 'plant' })); // (snow settles on its branches)
    t.castShadow = true; t.receiveShadow = true;
    g.add(t);
    this.star = new THREE.Mesh(starGeometry(), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    this.star.position.set(0, 4.15, 0);
    g.add(this.star);
    const baubles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 34);
    for (let i = 0; i < 34; i++) {
      const tier = i % 4, [r, , y] = [[1.55, 1.5, 0.75], [1.2, 1.35, 1.65], [0.85, 1.15, 2.45], [0.5, 0.95, 3.15]][tier];
      const a = i * 2.4, k = 0.55 + ((i * 7) % 5) * 0.07;
      baubles.setMatrixAt(i, _m.makeTranslation(Math.cos(a) * r * (1 - k) * 1.05, y - 0.05 + 1.4 * k * ([1.5, 1.35, 1.15, 0.95][tier] / 1.5) * 0.85, Math.sin(a) * r * (1 - k) * 1.05));
      baubles.setColorAt(i, _c.set([0xe8423a, 0xffd25a, 0x6fa8ff, 0xf4f4f4, 0xb46bd8][i % 5]));
    }
    g.add(baubles);
    const presents = new THREE.Mesh(mergeAll([
      presentGeometry(0xd9534f, 0xf6d06a).translate(1.0, 0, 0.6), presentGeometry(0x5b86c4, 0xf4f4f4, [0.36, 0.2, 0.3]).translate(-0.9, 0, 0.75),
      presentGeometry(0x6f9a52, 0xd9534f, [0.24, 0.3, 0.24]).translate(0.2, 0, 1.15), presentGeometry(0xe0b04a, 0x8e6fb0).translate(-0.4, 0, -1.1),
      presentGeometry(0x8e6fb0, 0xf6d06a, [0.28, 0.18, 0.4]).translate(1.1, 0, -0.5),
    ]), paint(0xffffff, { vertexColors: true }));
    presents.castShadow = true;
    g.add(presents);
    W.add(g);
    W.circle(spot.x, spot.z, 1.25);
    this.spot = spot;
    // Where the 📋 board's present deliveries are picked up from (see jobs/types.js: present).
    (W.world.seasonal ??= {}).tree = { x: spot.x, z: spot.z + 1.9, name: `under the big tree in ${park.name}` };
    this.saidT = 0;
  }

  update(dt, P) {
    this.t += dt;
    if (this.star) this.star.rotation.y += dt * 0.8;
    this.tw -= dt;
    if (this.tw <= 0) { // twinkle twinkle
      this.tw = 0.3;
      const n = this.bulbs.count;
      for (let i = 0; i < n; i++) {
        const k = Math.sin(this.t * 1.7 + this.phase[i]) > -0.2 ? 1.25 : 0.45;
        this.bulbs.setColorAt(i, _c.set(BULBS[i % BULBS.length]).multiplyScalar(k));
      }
      this.bulbs.instanceColor.needsUpdate = true;
    }
    if (this.spot) {
      this.saidT -= dt;
      if (this.saidT <= 0 && flat(P.pos, this.spot) < 4) { this.saidT = 40; this.W.hud.float(`🎄 ${this.W.line(PRESENT.tree)}`, this.spot.clone().setY(3), 'xp'); }
    }
  }

  get prompt() { return null; }

  dispose() { delete this.W.world.seasonal?.tree; }
}

function mergeAll(geos) {
  const parts = geos.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'color'].includes(k)) q.deleteAttribute(k); return q; });
  const withColor = parts.some((g) => g.attributes.color);
  if (withColor) for (const g of parts) if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return mergeGeometries(parts);
}
