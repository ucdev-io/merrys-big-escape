import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Person } from '../../../entities/person.js';
import { bakedMat } from '../../../entities/shapes.js';
import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { SANDY } from '../../lines/beach.js';
import { bsfx } from './sounds.js';
import '../../../entities/beachItems.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const BALLS = 3, GULLS = 3;

/**
 * A person's many little meshes baked into a few (one for the body, one per arm, so she can still wave):
 * a Person is ~17 draw calls (and as many again for its shadow); this is 3.
 */
function bakePerson(p) {
  const bakeUnder = (top, skip = []) => {
    top.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(top.matrixWorld).invert(), geos = [], meshes = [];
    top.traverse((o) => {
      if (!o.isMesh || skip.some((s) => s === o || s.getObjectById(o.id))) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const c = o.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g); meshes.push(o);
    });
    for (const m of meshes) m.removeFromParent();
    const m = new THREE.Mesh(mergeGeometries(geos), bakedMat());
    m.castShadow = true; m.receiveShadow = true;
    top.add(m);
  };
  for (const a of p.arms) bakeUnder(a);
  bakeUnder(p.root, p.arms);
}

/**
 * 🛟 Sandy the lifeguard (she), on duty by her tower whatever the weather. Come and say hello and she'll
 * ask for a hand, three jobs taking turns:
 *   🏐 Beach balls: the wind's blown three out to sea — swim out (not past the buoys!) and bring them back.
 *   📯 Her whistle: a seagull pinched it and buried it somewhere on the beach — sniff, dig, fetch.
 *   🐦 Seagulls: they're after the picnics' chips — woof them away three times.
 * Friendship (the `sandy` stat) earns a present: her spare whistle. She also keeps an eye on swimmers, and
 * blows her whistle if a dog swims right out to the buoys. Your own Sandy, like Brock and Gus.
 */
export class Sandy {
  constructor({ scene, world, area, hud, player, actions, friends, dogName }) {
    Object.assign(this, { scene, world, area, hud, player, actions, friends, dogName });
    this.carry = actions.carry;
    this.p = new Person({ shirt: 0xd9534f, trousers: 0xf2c94e, skin: 0xe0b48e, hair: 0x6b4a32, cap: { color: 0xf2c94e } });
    bakePerson(this.p);
    this.pos = this.p.root.position;
    this.pos.copy(area.tower.stand);
    this.sea = area.tower.face; // (out to sea)
    this.p.root.rotation.y = this.sea;
    scene.add(this.p.root);
    this.rng = new RNG(`sandy:${Date.now()}`);
    this.job = null;
    this.cool = 0;
    this.talkT = 2;
    this.helloT = 0;
    this.buoyT = 0;
    this.bags = new Map();
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }
  say(text, dur = 3.6) { this.hud.say(`🛟 ${text}`, () => this.pos.clone().add(V(0, 2.0, 0)), dur); }

  get helped() { return progress.stats.sandy ?? 0; }

  // ---------- the jobs ----------

  start() {
    const kind = ['balls', 'whistle', 'gulls'][this.helped % 3], A = this.area;
    this.job = { giver: 'sandy', stat: 'sandy', icon: '🛟', who: 'Sandy', kind, done: false, n: 0, target: () => this.target(), objective: () => this.objective() };
    if (kind === 'balls') {
      this.job.items = [];
      const L = A.layout;
      for (let t = 0; t < 60 && this.job.items.length < BALLS; t++) {
        const p = A.at(this.rng.float(L.uL + 8, L.uR - 8), this.rng.float(A.shore + 5, A.swimEnd - 3));
        if (this.job.items.some((it) => flat(it.pos, p) < 7)) continue;
        this.job.items.push(this.carry.add('beachball', p.x, p.z, { job: 'sandy' }));
      }
      this.say(this.line(SANDY.askBalls), 6.5);
    } else if (kind === 'whistle') {
      let s = null;
      for (let t = 0; t < 30 && !s; t++) { const q = A.spot(this.rng); if (q && flat(q, this.pos) > 12 && flat(q, this.pos) < 50) s = q; }
      if (!s) { this.job = null; return; }
      this.job.item = this.carry.add('whistle', s.x, s.z, { buried: 3, job: 'sandy' });
      this.job.name = 'whistle';
      this.say(this.line(SANDY.askWhistle), 6.5);
    } else this.say(this.line(SANDY.askGulls), 6);
    bsfx.whistle(0.35);
    this.friends.focus = this.job;
    this.talkT = 10;
    this.friends.onChange?.();
  }

  finish() {
    const job = this.job;
    job.done = true;
    this.job = null;
    this.cool = 35;
    this.p.wave = 2;
    this.friends.finish(job, () => this.say(this.line(SANDY.thanks), 4.5), 26 + 3 * Math.min(5, this.helped));
  }

  /** A seagull woofed away from the picnics (the beach tells her). */
  onGull() {
    const job = this.job;
    if (!job || job.kind !== 'gulls') return;
    job.n++;
    this.friends.onChange?.();
    if (job.n >= GULLS) this.finish();
    else this.say(this.line(SANDY.gull), 2.4);
  }

  // ---------- per frame ----------

  update(dt, P, { canAct = true } = {}) {
    this.cool -= dt; this.talkT -= dt; this.helloT -= dt; this.buoyT -= dt;
    const d = flat(P.pos, this.pos), root = this.p.root;
    // Watching the sea — or the dog, when it comes over.
    const want = d < 9 ? Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) : this.sea;
    root.rotation.y += wrap(want - root.rotation.y) * (1 - Math.exp(-dt * 2.5));
    if (canAct && d < 7 && this.helloT <= 0 && !this.job) { this.helloT = 60; this.p.wave = 1.5; if (this.cool > 0) this.say(this.line(SANDY.hello), 3); }
    // Floating balls bob on the waves (job ones, or any dropped in the sea).
    for (const it of this.carry.items) {
      if (it.kind !== 'beachball') continue;
      const v = this.area.dir[0] * it.pos.x + this.area.dir[1] * it.pos.z;
      if (v > this.area.shore + 0.4) { it.pos.y = this.area.sea.zone.surface - 0.13 + Math.sin(performance.now() / 600 + it.id) * 0.035; it.obj.rotation.z = Math.sin(performance.now() / 900 + it.id) * 0.2; }
    }
    if (canAct) {
      const job = this.job;
      if (!job && this.cool <= 0 && d < 4.2) this.start();
      else if (job?.kind === 'balls') {
        const held = this.carry.held;
        if (held && job.items.includes(held) && d < 2.6) {
          this.carry.consume();
          job.n++;
          sfx.pop?.(); buzz(15);
          this.actions.sparkle(this.pos.clone().add(V(0, 1, 0)), 10);
          this.friends.onChange?.();
          if (job.n >= job.items.length) this.finish();
          else this.say(this.line(SANDY.ball), 2.4);
        }
      } else if (job?.kind === 'whistle' && this.carry.held === job.item && d < 2.6) this.finish();
      if (this.job && d < 5 && this.talkT <= 0) { this.talkT = 16; this.say(this.line({ balls: SANDY.remindBalls, whistle: SANDY.remindWhistle, gulls: SANDY.remindGulls }[this.job.kind]), 3); }
      else if (!this.job && this.cool > 0 && d < 4 && this.talkT <= 0) { this.talkT = 18; this.say(this.line(SANDY.idle), 2.8); }
      // Right out at the buoys: PHWEEEP!
      const pv = this.area.dir[0] * P.pos.x + this.area.dir[1] * P.pos.z;
      if (P.swim > 0.4 && pv > this.area.swimEnd - 1.6 && this.buoyT <= 0) { this.buoyT = 25; bsfx.whistle(0.8); this.say(this.line(SANDY.buoys), 3.2); this.p.wave = 1.5; }
    }
    this.p.update(dt, 0);
  }

  /** The compass: the nearest ball out at sea (or back to Sandy with one), the whistle, or a picnic. */
  target() {
    const job = this.job, P = this.player.pos;
    if (!job) return null;
    const home = { pos: this.pos, emoji: '🛟' };
    if (job.kind === 'balls') {
      if (this.carry.held?.kind === 'beachball') return home;
      const left = job.items.filter((it) => this.carry.items.includes(it));
      return left.length ? { pos: left.reduce((a, c) => (flat(a.pos, P) < flat(c.pos, P) ? a : c)).pos, emoji: '🏐' } : home;
    }
    if (job.kind === 'whistle') return this.carry.held === job.item ? home : { pos: job.item.pos, emoji: '📯' };
    const pics = this.area.picnics;
    return pics.length ? { pos: pics.reduce((a, c) => (flat(a.pos, P) < flat(c.pos, P) ? a : c)).pos, emoji: '🍟' } : null;
  }

  objective() {
    const job = this.job;
    if (job.kind === 'balls') {
      return this.carry.held?.kind === 'beachball' ? { icon: '🛟', title: `Take the 🏐 beach ball to Sandy! <b>${job.n}/${job.items.length}</b>`, sub: 'She’s by the lifeguard’s tower.' }
        : { icon: '🛟', title: `Fetch Sandy’s beach balls 🏐 <b>${job.n}/${job.items.length}</b>`, sub: 'Out at sea (not past the buoys!). Grab one with 🐾' };
    }
    if (job.kind === 'whistle') {
      return this.carry.held === job.item ? { icon: '🛟', title: 'Take the 📯 whistle back to Sandy!', sub: 'She’s by the lifeguard’s tower.' }
        : { icon: '🛟', title: 'Find Sandy’s whistle 📯', sub: 'A seagull buried it on the beach. Sniff it out, then dig 🐾' };
    }
    return { icon: '🛟', title: `Shoo the seagulls off the picnics 🐦 <b>${job.n}/${GULLS}</b>`, sub: 'When one swoops on the chips: WOOF!' };
  }

  get hint() {
    const job = this.job;
    if (job?.kind === 'gulls' && flat(this.player.pos, this.pos) < 5) return 'Watch the picnics for swooping seagulls, and woof! 🐦';
    return null;
  }
}
