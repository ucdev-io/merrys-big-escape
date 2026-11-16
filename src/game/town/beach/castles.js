import * as THREE from 'three';
import { paint } from '../../../render/watercolorMaterial.js';
import { SPHERE, bake } from '../../../entities/shapes.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { COSMETICS } from '../../cosmetics.js';
import { CASTLE } from '../../beachRules.js';
import { CASTLE_SAY } from '../../lines/beach.js';
import { bsfx } from './sounds.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const pop = (t) => (t >= 1 ? 1 : Math.max(0.001, 1 + 0.25 * Math.sin(t * Math.PI) - (1 - t) ** 3)); // grows in with a little bounce
const SANDY = 0xe3c994, DARK = 0xcdb07b, WET = 0xb59c6c;
const HEIGHT = [0, 0.32, 0.66, 0.7, 0.95]; // how tall a castle is at each stage (for bumping into it)

/** The parts of a sandcastle, a stage at a time (baked, drawn instanced: one draw call each). */
function parts() {
  const sand = (i, v) => ((Math.floor(v.y * 40) % 3) ? SANDY : DARK); // (bucket-shaped ridges)
  const crenels = (r, y, n, s) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [new THREE.BoxGeometry(s, s * 0.8, s), SANDY, [Math.cos(a) * r, y, Math.sin(a) * r], [0, -a, 0]]; });
  return {
    // Stage 0: a little heap with a bucket and spade, waiting for someone to start.
    mark: bake([
      [SPHERE, SANDY, [0, 0.02, 0], [0, 0, 0], [0.26, 0.09, 0.22]],
      [new THREE.CylinderGeometry(0.1, 0.075, 0.15, 14, 1, true), 0xe8743c, [0.25, 0.075, 0.12], [0, 0, 0]],
      [new THREE.CircleGeometry(0.075, 14), 0xc95c2c, [0.25, 0.002, 0.12], [-Math.PI / 2, 0, 0]],
      [new THREE.TorusGeometry(0.1, 0.008, 4, 14, Math.PI), 0xe8743c, [0.25, 0.15, 0.12], [0, 0.4, 0]],
      [new THREE.BoxGeometry(0.1, 0.012, 0.13), 0xf2c94e, [-0.06, 0.12, 0.0], [1.1, 0.3, 0]],
      [new THREE.CylinderGeometry(0.01, 0.01, 0.28, 6), 0xf2c94e, [-0.08, 0.25, -0.08], [0.6, 0.3, 0]],
    ]),
    // Stage 1: a good big heap.
    heap: bake([{ geo: SPHERE, pos: [0, 0.02, 0], scale: [0.5, 0.3, 0.45], colors: (i, v) => (v.y < 0.06 ? DARK : SANDY) }]),
    // Stage 2: the keep — a bucketful turned out on top, with battlements.
    keep: bake([
      { geo: new THREE.CylinderGeometry(0.19, 0.24, 0.36, 18), pos: [0, 0.44, 0], colors: sand },
      ...crenels(0.17, 0.66, 6, 0.07),
      [new THREE.BoxGeometry(0.06, 0.09, 0.02), 0x8a7350, [0, 0.47, 0.21]], // a door
    ]),
    // Stage 3: four corner towers and walls between them.
    towers: bake([
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([x, z]) => [
        { geo: new THREE.CylinderGeometry(0.1, 0.13, 0.3, 14), pos: [x * 0.42, 0.15, z * 0.42], colors: sand },
        ...crenels(0.09, 0.32, 4, 0.045).map(([g, c, [px, py, pz], r]) => [g, c, [px + x * 0.42, py, pz + z * 0.42], r]),
      ]),
      ...[[0, 0.42, 0], [0, -0.42, 0], [0.42, 0, Math.PI / 2], [-0.42, 0, Math.PI / 2]].map(([x, z, r]) => [new THREE.BoxGeometry(0.66, 0.16, 0.06), SANDY, [x, 0.08, z], [0, r, 0]]),
    ]),
    // Stage 4: finished — a flag on top, shells pressed into the walls, and a moat.
    top: bake([
      [new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), 0x9b7452, [0, 0.86, 0]],
      [new THREE.BoxGeometry(0.005, 0.1, 0.16), 0xd9534f, [0, 0.98, 0.08]],
      ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.2, r = 0.42; return [SPHERE, i % 2 ? 0xf6e7dc : 0xf2b6b0, [Math.cos(a) * r * (Math.abs(Math.cos(a)) > 0.7 ? 1 : 1.05), 0.1, Math.sin(a) * r], [0, 0, 0], [0.025, 0.02, 0.012]]; }),
      { geo: new THREE.TorusGeometry(0.72, 0.09, 6, 30), pos: [0, 0.008, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.15], colors: () => WET },
    ]),
  };
}

/**
 * 🏰 Sandcastles at the beach's castle spots: pat one into shape with 🐾, a stage at a time (a heap, a keep,
 * towers and walls, then a flag and shells), with friends if you like; zoom into one (or land on it from a
 * jump) and it's flat again. Shared through a BeachRoom (../../beachRules.js): the pack's on the server
 * (kept with the town), or our own. Everyone who helped build one gets the credit when it's finished.
 */
export class Castles {
  /** B: the beach (game/town/beach/index.js): send(msg), me(), the world, the hud… */
  constructor(B) {
    this.B = B;
    const P = parts(), n = B.area.castles.length;
    const make = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, paint(0xffffff, { vertexColors: true, season: 'world' }), count); // (snow on them in winter)
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      for (let i = 0; i < count; i++) m.setMatrixAt(i, ZERO);
      B.scene.add(m);
      return m;
    };
    this.meshes = { mark: make(P.mark, n), heap: make(P.heap, n), keep: make(P.keep, n), towers: make(P.towers, n), top: make(P.top, n) };
    this.list = B.area.castles.map((c, i) => ({ i, id: c.id, x: c.pos.x, z: c.pos.z, ry: c.face, s: 0, shown: [1, 1, 1, 1], squash: 0, col: null }));
    for (const c of this.list) this.draw(c);
    this.knockCD = 0;
    this.near = null;
    this.bags = {};
  }

  line(key) { return (this.bags[key] ??= new LineBag(CASTLE_SAY[key])).next(); }

  /** Put a castle's instances where its stage (and any animation) says. */
  draw(c) {
    const M = this.meshes, squash = c.squash > 0 ? Math.max(0.12, 1 - c.squash) : 1, fade = c.squash > 0.85 ? Math.max(0, (1.25 - c.squash) / 0.4) : 1;
    const set = (mesh, s, sy = 1) => {
      if (s <= 0.002) { mesh.setMatrixAt(c.i, ZERO); return; }
      _q.setFromEuler(_e.set(0, c.ry, 0));
      mesh.setMatrixAt(c.i, _m.compose(_p.set(c.x, 0, c.z), _q, _s.set(s, s * sy, s)));
    };
    const was = c.squash > 0 ? c.squashFrom : c.s;
    set(M.mark, was === 0 && c.squash <= 0 ? 1 : c.squash > 0.9 ? Math.min(1, (c.squash - 0.9) * 3) : 0);
    set(M.heap, was >= 1 ? pop(c.shown[0]) * (c.squash > 0 ? fade : 1) : 0, squash);
    set(M.keep, was >= 2 ? pop(c.shown[1]) * (c.squash > 0 ? fade : 1) : 0, squash);
    set(M.towers, was >= 3 ? pop(c.shown[2]) * (c.squash > 0 ? fade : 1) : 0, squash);
    set(M.top, was >= 4 ? pop(c.shown[3]) * (c.squash > 0 ? fade : 1) : 0, squash);
    for (const m of Object.values(M)) m.instanceMatrix.needsUpdate = true;
    // (Parts nobody's built yet aren't drawn at all; nor is anything while the beach is lost in the fog.)
    const most = this.hidden ? -1 : Math.max(...this.list.map((q) => Math.max(q.s, q.squash > 0 ? q.squashFrom : 0)));
    M.mark.visible = most >= 0; M.heap.visible = most >= 1; M.keep.visible = most >= 2; M.towers.visible = most >= 3; M.top.visible = most >= 4;
  }

  /** A castle's stage changed: grow it (with a pop) or squash it flat. */
  setStage(c, s, animate = true) {
    const was = c.s;
    c.s = s;
    if (s > was) for (let j = was; j < s; j++) c.shown[j] = animate ? 0 : 1;
    if (s === 0 && was > 0 && animate) { c.squash = 0.001; c.squashFrom = was; }
    if (s >= 1 && !c.col) c.col = this.B.world.colliders.circle(c.x, c.z, 0.42, HEIGHT[s], false);
    if (c.col) c.col.top = s >= 1 ? HEIGHT[s] : 0;
    if (s === 0 && c.col) { this.B.uncollide(c.col); c.col = null; }
    this.draw(c);
  }

  update(dt, P) {
    this.knockCD -= dt;
    for (const c of this.list) {
      let dirty = false;
      for (let j = 0; j < 4; j++) if (c.shown[j] < 1) { c.shown[j] = Math.min(1, c.shown[j] + dt * 2.6); dirty = true; }
      if (c.squash > 0) { c.squash += dt * 2.2; if (c.squash >= 1.25) c.squash = 0; dirty = true; }
      if (dirty) this.draw(c);
    }
    // Zooming into a castle (or landing on one) knocks it flat.
    const near = this.nearest(P.pos, 1.6);
    this.near = near;
    if (near && near.s >= 1 && this.knockCD <= 0 && !P.frozen) {
      const d = flat(P.pos, near);
      if ((P.speed > 4.4 && d < 0.95) || (P.landed > 0.2 && d < 0.75)) { this.knockCD = 1; this.B.send({ a: 'castle', id: near.id, op: 'knock' }); }
    }
  }

  nearest(pos, r) {
    let best = null, bd = r;
    for (const c of this.list) { const d = flat(pos, c); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /** 🐾 by a castle: pat on another bit. */
  onDig(nose) {
    const c = this.nearest(nose, 1.3);
    if (!c) return false;
    if (c.s >= CASTLE.stages) { this.B.hud.float('Zoom into it! 🏰', this.B.actions.anchor()); return true; }
    this.B.send({ a: 'castle', id: c.id, op: 'build' });
    this.B.player.digTimer = 0.35;
    return true;
  }

  /** From the BeachRoom: a bit added, a castle finished, or one squashed. */
  handle(m, mine) {
    const c = this.list.find((q) => q.id === m.id);
    if (!c) return;
    const B = this.B, head = V(c.x, 1.2, c.z), close = flat(B.player.pos, c) < 20;
    if (m.op === 'build') {
      if (m.s === 1) { // (a new castle faces whoever started it)
        const who = mine ? B.player.pos : B.remotes?.get(m.by)?.dog.root.position;
        if (who) c.ry = Math.atan2(who.x - c.x, who.z - c.z);
      }
      this.setStage(c, m.s);
      this.puff(V(c.x, 0.15 + HEIGHT[m.s] * 0.5, c.z), 8, 0.6);
      if (close) bsfx.pat(mine ? 1 : 0.6);
      if (mine && m.s < CASTLE.stages) B.hud.float(CASTLE_SAY.stage[m.s - 1] ?? '🏰', head, 'sniff');
      if (m.s === CASTLE.stages) {
        if (close) { sfx.found?.(); B.actions.sparkle(head.clone(), 22); }
        if (m.team?.includes(B.me())) {
          const before = progress.stats.castles ?? 0;
          progress.stat('castles');
          progress.award(10, m.team.length > 1 ? 'Team sandcastle!' : 'Sandcastle!');
          B.hud.float(this.line(m.team.length > 1 ? 'team' : 'done'), head, 'xp');
          buzz([20, 30, 20]);
          for (const k of COSMETICS) if (k.friend === 'castles' && before < k.jobs && before + 1 >= k.jobs) B.hud.showToastRaw(k.emoji, `New: ${k.name}!`, 'For all those sandcastles. Wear it from ☰ → My dog → Dress up.');
        } else if (close && m.by !== B.me()) {
          const name = B.remotes?.get(m.by)?.name;
          if (name) B.hud.float(`🏰 ${fill(CASTLE_SAY.friend, { who: name })}`, head, 'xp');
        }
      }
    } else if (m.op === 'knock') {
      this.setStage(c, 0);
      this.puff(V(c.x, 0.3, c.z), 26, 1.3);
      if (close) { bsfx.flump(mine ? 1 : 0.6); B.hud.float(this.line('knock'), head); }
      if (mine) progress.award(2, 'Splat!');
    }
  }

  /** The castles as the pack (or our own room) has them: [stage, …] by index. */
  adopt(list) { for (const c of this.list) this.setStage(c, list?.[c.i] ?? 0, false); }

  puff(at, n, power) {
    this.B.actions.dirt.burst(n, () => ({
      pos: at.clone().add(V(rand(-0.25, 0.25), rand(0, 0.2), rand(-0.25, 0.25))),
      vel: V(rand(-1.2, 1.2) * power, rand(0.8, 2.2) * power, rand(-1.2, 1.2) * power),
      life: rand(0.5, 0.9), size: rand(0.025, 0.05), gravity: 8, floor: 0.02, color: [SANDY, DARK, 0xeedbb0][Math.floor(Math.random() * 3)],
    }));
  }

  get prompt() {
    const c = this.near, P = this.B.player;
    if (!c || flat(P.pos, c) > 1.6) return null;
    return c.s >= CASTLE.stages ? '🏰 Zoom into it: SPLAT!' : c.s ? `🏰 Keep building! 🐾 ${c.s}/${CASTLE.stages}` : '🏰 Build a sandcastle! 🐾';
  }

  get pawAct() { const c = this.near; return c && c.s < CASTLE.stages && flat(this.B.player.pos, c) < 1.6 ? 'build' : null; }

  dispose() { for (const m of Object.values(this.meshes)) m.removeFromParent(); }
}
