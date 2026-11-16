import * as THREE from 'three';
import { bakedMesh, group } from '../../../entities/shapes.js';
import { RNG } from '../../../core/rng.js';
import { buzz } from '../../../core/haptics.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { season } from '../../season.js';
import { FARMER, FARMER_NAME } from '../../lines/farm.js';
import { fmsfx } from './sounds.js';
import '../../../entities/farmItems.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SEASONAL = { autumn: 'pumpkins', spring: 'lamb', winter: 'hay', summer: 'apples' };
const FETCH = { // things to bring somewhere, three at a time
  eggs: { item: 'henegg', emoji: '🥚', said: 'egg', to: 'basket', title: 'Find the eggs 🥚 for Farmer Mabel’s basket', sub: 'The hens hide them all over the farm: sniff them out, then carry them (gently!) to the basket by the farmhouse door.' },
  pumpkins: { item: 'pumpkin', emoji: '🎃', said: 'pumpkin', to: 'cart', title: 'Bring 3 pumpkins 🎃 to the cart', sub: 'They’re in the field by its gate. The cart’s by the barn.' },
  hay: { item: 'hay', emoji: '🌾', said: 'hayIn', to: 'rack', title: 'Hay for the sheep 🌾 (to their hay rack)', sub: 'Armfuls of hay in the barn: carry them to the rack in the sheep field.' },
  apples: { item: 'apple', emoji: '🍎', said: 'apple', to: 'trough', title: 'Apples 🍎 for the pigs’ trough', sub: 'Windfalls under the trees in the orchard, behind the barn.' },
};

/**
 * Farmer Mabel herself: soft and rounded like the town's people (see entities/person.js), in a straw hat,
 * blue dungarees over a red shirt and green wellies, but each part baked into one mesh (six in all).
 * Faces +z. update() swings her arms and legs as she walks; `wave` puts an arm up to wave hello.
 */
class Mabel {
  constructor() {
    const SKIN = 0xf2d3b8, HAIR = 0xb8b2aa, SHIRT = 0xc8584a, DENIM = 0x4f6f9e, WELLY = 0x4f7f4a, STRAW = 0xe8cf86;
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10), ball = new THREE.SphereGeometry(1, 14, 10);
    this.root = new THREE.Group();
    this.body = group(this.root);
    this.legs = [-1, 1].map((s) => {
      const hip = group(this.body, [s * 0.09, 0.82, 0]);
      bakedMesh([[cap(0.07, 0.5), DENIM, [0, -0.32, 0]], [new THREE.CylinderGeometry(0.085, 0.08, 0.32, 12), WELLY, [0, -0.63, 0.01]], [ball, 0x3d5f3a, [0, -0.78, 0.05], [0, 0, 0], [0.085, 0.045, 0.13]]], hip);
      return hip;
    });
    bakedMesh([
      [cap(0.17, 0.38), SHIRT, [0, 1.16, 0], [0, 0, 0], [1, 1, 0.75]],
      [new THREE.CylinderGeometry(0.17, 0.19, 0.3, 14), DENIM, [0, 0.98, 0], [0, 0, 0], [1, 1, 0.78]],
      [new THREE.BoxGeometry(0.27, 0.24, 0.06), DENIM, [0, 1.13, 0.12]],
      [new THREE.BoxGeometry(0.04, 0.32, 0.02), DENIM, [0.1, 1.33, 0.115], [0.15, 0, 0]],
      [new THREE.BoxGeometry(0.04, 0.32, 0.02), DENIM, [-0.1, 1.33, 0.115], [0.15, 0, 0]],
      [ball, 0xf2c14e, [0, 1.1, 0.153], [0, 0, 0], [0.025, 0.025, 0.01]], // (a button)
    ], this.body);
    this.arms = [-1, 1].map((s) => {
      const sh = group(this.body, [s * 0.22, 1.38, 0]);
      bakedMesh([[cap(0.05, 0.46), SHIRT, [0, -0.27, 0]], [ball, SKIN, [0, -0.56, 0], [0, 0, 0], [0.055, 0.055, 0.055]]], sh);
      return sh;
    });
    this.head = group(this.body, [0, 1.62, 0]);
    bakedMesh([
      [ball, SKIN, [0, 0, 0], [0, 0, 0], [0.13, 0.13, 0.13]],
      [new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), HAIR, [0, 0.015, -0.01], [0, 0, 0], [0.136, 0.136, 0.136]],
      [ball, HAIR, [0, -0.02, -0.12], [0, 0, 0], [0.07, 0.07, 0.06]], // (a bun)
      [ball, 0x241a17, [0.045, 0.01, 0.12], [0, 0, 0], [0.016, 0.016, 0.016]],
      [ball, 0x241a17, [-0.045, 0.01, 0.12], [0, 0, 0], [0.016, 0.016, 0.016]],
      [ball, 0xe8a090, [0.07, -0.03, 0.1], [0, 0, 0], [0.025, 0.018, 0.012]], // rosy cheeks
      [ball, 0xe8a090, [-0.07, -0.03, 0.1], [0, 0, 0], [0.025, 0.018, 0.012]],
      [ball, SKIN, [0, -0.02, 0.13], [0, 0, 0], [0.022, 0.022, 0.022]],
      [new THREE.TorusGeometry(0.03, 0.006, 4, 12, Math.PI), 0x8a4a3a, [0, -0.055, 0.115], [0, 0, Math.PI]],
      [new THREE.CylinderGeometry(0.27, 0.28, 0.02, 22), STRAW, [0, 0.09, 0], [0, 0, 0.08]],
      [new THREE.CylinderGeometry(0.13, 0.15, 0.12, 16), STRAW, [0.005, 0.15, 0], [0, 0, 0.08]],
      [new THREE.CylinderGeometry(0.152, 0.152, 0.035, 16, 1, true), 0xd9534f, [0.003, 0.115, 0], [0, 0, 0.08]],
    ], this.head);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.phase = 0;
    this.wave = 0;
  }

  /** speed: metres per second (0 = standing). */
  update(dt, speed = 0) {
    this.phase += dt * (2 + speed * 2.4);
    const sw = Math.sin(this.phase) * Math.min(0.6, speed * 0.35);
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * 0.8; this.arms[1].rotation.x = sw * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * Math.min(1, speed);
    this.wave = Math.max(0, this.wave - dt);
    if (this.wave > 0) { this.arms[0].rotation.z = -2.6 + Math.sin(this.phase * 3) * 0.3; this.arms[0].rotation.x = 0; }
    else this.arms[0].rotation.z *= 0.8;
    this.head.rotation.y = Math.sin(this.phase * 0.15) * 0.2;
  }
}

/**
 * 👩‍🌾 Farmer Mabel: cheerful, busy, wellies always muddy. She potters about the farmyard, and when a dog
 * comes by she asks for a hand, the jobs taking turns: 🐑 round the sheep into the pen (the shared flock:
 * friends can help), 🥚 find three eggs the hens have hidden, 🐷 shoo Percy back into his sty, and one for
 * the season (🎃 pumpkins to the cart in autumn, 🐑 a lost lamb in spring, 🌾 hay for the sheep in winter,
 * 🍎 apples for the pigs in summer). Three jobs and she gives you her straw hat. Each player's own, like Brock.
 */
export class Farmer {
  constructor({ scene, world, area, hud, player, actions, friends, dogName, farm }) {
    Object.assign(this, { scene, world, area, hud, player, actions, friends, dogName, farm });
    this.carry = actions.carry;
    this.p = new Mabel();
    this.pos = this.p.root.position;
    this.pos.copy(area.farmer);
    this.p.root.rotation.y = area.house.face;
    scene.add(this.p.root);
    this.rng = new RNG(`mabel:${Date.now()}`);
    this.job = null;
    this.cool = 4; this.talkT = 0; this.greeted = false; this.walkT = 8; this.goal = null; this.post = 0;
    this.bags = new Map();
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }
  head() { return this.pos.clone().add(V(0, 2.15, 0)); }
  say(text, dur = 3.6) { this.hud.say(`👩‍🌾 ${text}`, (this.anchorFn ??= () => this.head()), dur); } // (one anchor: a new line replaces the last)

  get helped() { return progress.stats.farmer ?? 0; }

  // ---------- the jobs ----------

  kinds() {
    const out = ['sheep', 'eggs', 'pig'];
    if (SEASONAL[season.name]) out.push(SEASONAL[season.name]);
    return out;
  }

  start() {
    const kinds = this.kinds();
    let kind = kinds[this.helped % kinds.length];
    if (kind === 'sheep' && this.farm.flock.gateShut) kind = kinds[(this.helped + 1) % kinds.length]; // (they're all in already!)
    const job = { giver: 'farmer', stat: 'farmer', icon: '👩‍🌾', who: FARMER_NAME, kind, done: false, n: 0, target: () => this.target(), objective: () => this.objective() };
    if (FETCH[kind]) {
      job.items = this.place(kind);
      if (!job.items.length) return;
      job.count = job.items.length;
    } else if (kind === 'pig') {
      const to = this.farm.awayFromSty(this.rng);
      this.farm.pigs.escape(to);
    } else if (kind === 'lamb') {
      if (!this.farm.loseLamb(this.rng)) return;
    }
    this.job = job;
    this.say(this.line(FARMER[kind]), 6.5);
    this.friends.focus = job;
    this.talkT = 9;
    this.friends.onChange?.();
  }

  /** Put out a fetch job's three things (eggs in hiding places, pumpkins in the patch…). */
  place(kind) {
    const F = FETCH[kind], A = this.area, out = [], q = this.rng;
    const spots = [];
    if (kind === 'eggs') {
      const hides = q.shuffle(A.hides.slice());
      for (const h of hides.slice(0, 3)) spots.push({ x: h.pos.x + q.float(-0.25, 0.25), z: h.pos.z + q.float(-0.25, 0.25), y: h.pos.y });
    } else if (kind === 'pumpkins') {
      const r = A.patch;
      for (let i = 0; i < 3; i++) spots.push({ x: q.float(r.x0 + 1, r.x1 - 1), z: q.float(r.z0 + 1, r.z1 - 1), y: 0 });
    } else if (kind === 'hay') {
      for (const off of this.farm.haySpots()) spots.push({ ...off, y: 0 });
    } else if (kind === 'apples') {
      const trees = q.shuffle(A.orchard.slice());
      for (let i = 0; i < 3 && trees.length; i++) { const t = trees[i % trees.length], a = q.float(0, 6.28), r = q.float(1.0, 1.8); spots.push({ x: t.pos.x + Math.cos(a) * r, z: t.pos.z + Math.sin(a) * r, y: 0 }); }
    }
    for (const s of spots) {
      const it = this.carry.add(F.item, s.x, s.z, { job: 'farmer' });
      it.obj.position.y = (s.y ?? 0) + 0.02;
      out.push(it);
    }
    return out;
  }

  /** Where a fetch job's things go: { pos, r }. */
  dest(kind) {
    const A = this.area, to = FETCH[kind].to;
    if (to === 'basket') return { pos: A.basket, r: 1.35 };
    if (to === 'cart') return { pos: A.cart.pos, r: 1.8 };
    if (to === 'rack') return { pos: A.rack, r: 1.8 };
    return { pos: A.sty.trough, r: 1.7 };
  }

  finish() {
    const job = this.job;
    if (!job) return;
    job.done = true;
    this.job = null;
    this.cool = 25;
    for (const it of job.items ?? []) this.carry.remove(it);
    this.friends.finish(job, () => this.say(this.line(FARMER.thanks), 4.5), 26 + 3 * Math.min(5, this.helped));
    this.p.wave = 2;
  }

  /** The sheep are all in the pen: that's our round-up job done (if we helped). */
  onPenned(mine) {
    if (this.job?.kind === 'sheep' && mine) this.finish();
    else if (this.near) this.say(this.line(FARMER.roundup), 3.5);
  }

  /** Percy's back in his sty. */
  onPercyHome() { if (this.job?.kind === 'pig') this.finish(); }
  /** The lost lamb's back with the flock. */
  onLambHome() { if (this.job?.kind === 'lamb') this.finish(); }

  // ---------- per frame ----------

  update(dt, P, { canAct = true } = {}) {
    this.cool -= dt; this.talkT -= dt; this.walkT -= dt;
    const d = flat(P.pos, this.pos), p = this.p;
    this.near = d < 12;
    let speed = 0;
    // Pottering about the yard between her jobs (she stops for a chat).
    if (d < 4.5) { this.goal = null; this.walkT = Math.max(this.walkT, 4); }
    else if (this.walkT <= 0 && !this.goal) { this.post = (this.post + 1 + Math.floor(Math.random() * (this.area.posts.length - 1))) % this.area.posts.length; this.goal = this.area.posts[this.post]; }
    if (this.goal) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z, l = Math.hypot(dx, dz);
      if (l < 0.2) { this.goal = null; this.walkT = 14 + Math.random() * 14; }
      else {
        speed = 1.05;
        const st = Math.min(l, speed * dt), nx = this.pos.x + (dx / l) * st, nz = this.pos.z + (dz / l) * st;
        if (!this.farm.solid(nx, nz, 0.3)) { this.pos.x = nx; this.pos.z = nz; } else { this.goal = null; this.walkT = 3; }
        p.root.rotation.y += wrap(Math.atan2(dx, dz) - p.root.rotation.y) * (1 - Math.exp(-dt * 6));
      }
    } else if (d < 8) p.root.rotation.y += wrap(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - p.root.rotation.y) * (1 - Math.exp(-dt * 3)); // (watching you)
    p.update(dt, speed);
    if (!canAct) return;
    // Hello, and a job (or a chat, if she's just had help).
    if (!this.greeted && d < 6) { this.greeted = true; this.p.wave = 1.6; this.say(this.line(FARMER.hello), 4); this.talkT = 4.5; return; }
    const job = this.job;
    if (!job && d < 3.6 && this.cool <= 0 && this.talkT <= 0) { this.start(); return; }
    if (!job && d < 4 && this.cool > 0 && this.talkT <= 0) { this.talkT = 18; this.say(this.line(FARMER.idle), 2.8); }
    if (!job) return;
    // Fetch jobs: bring each thing to where it goes.
    if (FETCH[job.kind]) {
      const held = this.carry.held, D = this.dest(job.kind);
      if (held && job.items.includes(held) && flat(P.pos, D.pos) < D.r) {
        this.carry.consume();
        job.items = job.items.filter((it) => it !== held);
        job.n++;
        if (job.kind === 'eggs') fmsfx.plop(); else fmsfx.thud();
        buzz(15);
        this.actions.sparkle(D.pos.clone().add(V(0, 0.5, 0)), 12);
        this.farm.delivered(job.kind, held);
        this.hud.float(`${FETCH[job.kind].emoji} ${this.line(FARMER[FETCH[job.kind].said])}`, this.actions.anchor(), 'xp');
        this.friends.onChange?.();
        if (job.n >= job.count) { this.finish(); return; }
      }
    }
    if (this.talkT <= 0 && d < 5) { this.talkT = 16; this.say(this.line(FARMER.remind[job.kind] ?? FARMER.idle), 3.4); }
  }

  /** The compass: the next thing to fetch (or where it goes), the flock, Percy, the lost lamb. */
  target() {
    const job = this.job, P = this.player.pos;
    if (!job) return null;
    if (FETCH[job.kind]) {
      const F = FETCH[job.kind];
      if (this.carry.held && job.items.includes(this.carry.held)) return { pos: this.dest(job.kind).pos, emoji: job.kind === 'eggs' ? '🧺' : job.kind === 'pumpkins' ? '🛒' : job.kind === 'hay' ? '🐑' : '🐷' };
      const left = job.items.filter((it) => this.carry.items.includes(it));
      if (!left.length) return { pos: this.pos, emoji: '👩‍🌾' };
      return { pos: left.reduce((a, c) => (flat(a.pos, P) < flat(c.pos, P) ? a : c)).pos, emoji: F.emoji };
    }
    if (job.kind === 'sheep') {
      const s = this.farm.flock.nearest(P);
      return s ? { pos: V(s.x, 0, s.z), emoji: '🐑', compass: this.farm.inField(P) ? this.area.pen.gate : undefined } : { pos: this.area.pen.gate, emoji: '🐑' };
    }
    if (job.kind === 'pig') return { pos: this.farm.pigs.percy.out ? V(this.farm.pigs.percy.x, 0, this.farm.pigs.percy.z) : this.area.sty.gate, emoji: '🐷' };
    if (job.kind === 'lamb') return { pos: this.farm.lamb?.following ? this.farm.flockMid() : this.farm.lamb?.pos ?? this.pos, emoji: '🐑' };
    return null;
  }

  objective() {
    const job = this.job;
    if (!job) return null;
    if (FETCH[job.kind]) {
      const F = FETCH[job.kind], holding = this.carry.held && job.items.includes(this.carry.held);
      return holding ? { icon: '👩‍🌾', title: `${F.title} <b>${job.n}/${job.count}</b>`, sub: 'Got one! Now take it there.' } : { icon: '👩‍🌾', title: `${F.title} <b>${job.n}/${job.count}</b>`, sub: F.sub };
    }
    if (job.kind === 'sheep') {
      const fl = this.farm.flock;
      return { icon: '🐑', title: `Round the sheep into the pen <b>${fl.penned}/${fl.sheep.length}</b>`, sub: 'Sheep run away from dogs: get behind them and walk them in. Friends can help!' };
    }
    if (job.kind === 'pig') return { icon: '🐷', title: 'Shoo Percy back into his sty!', sub: 'He runs away from dogs: get behind him and walk him to the gate in the wall.' };
    if (job.kind === 'lamb') return { icon: '🐑', title: this.farm.lamb?.following ? 'Take the lamb back to the sheep field!' : 'Find the lost lamb 🐑', sub: this.farm.lamb?.following ? 'She’s following you. Her mum’s in the field with the flock.' : 'Listen for a little “meh!”. She’ll follow you once you find her.' };
    return null;
  }

  /** A woof nearby: she jumps (and laughs). */
  onBark(pos) { if (flat(pos, this.pos) < 5) this.p.wave = 0.8; }

  get hint() {
    const job = this.job;
    if (!job) return null;
    const P = this.player.pos;
    if (job.kind === 'sheep' && this.farm.inField(P)) return 'Get behind the sheep and walk them into the pen! 🐑';
    if (job.kind === 'pig' && this.farm.pigs.percy.out && flat(P, this.farm.pigs.percy) < 8) return 'Get behind Percy and shoo him to the sty gate! 🐷';
    return null;
  }

  dispose() { this.p.root.removeFromParent(); }
}
