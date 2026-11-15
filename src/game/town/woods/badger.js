import * as THREE from 'three';
import { Badger } from '../../../entities/badger.js';
import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { BROCK } from '../../lines/woods.js';
import { wsfx } from './sounds.js';
import '../../../entities/woodsItems.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const BUNDLES = 3, DIGS = 3;

/**
 * 🦡 Brock the badger lives in a sett in the wood. In the daytime he's mostly asleep, nose poking out of
 * his front door — but come close and he'll wake up and ask for a hand, two jobs taking turns:
 *   🌾 Fresh bedding: fetch three bundles of dry bracken; he drags each one in backwards (as badgers do).
 *   🍂 Blocked doors: the wind's blown leaves into all three of his doors; dig them clear.
 * Friendship (the `badger` stat) earns a present. Your own Brock, like Gus and Pepper.
 */
export class Brock {
  constructor({ scene, world, area, hud, player, actions, friends, dogName }) {
    Object.assign(this, { scene, world, area, hud, player, actions, friends, dogName });
    this.carry = actions.carry;
    const st = area.sett;
    this.face = st.face;
    this.fx = Math.sin(st.face); this.fz = Math.cos(st.face);
    this.door = st.door.clone();
    this.in = V(this.door.x - this.fx * 0.15, -0.2, this.door.z - this.fz * 0.15); // just his face peeping out
    this.out = V(this.door.x + this.fx * 1.15, 0, this.door.z + this.fz * 1.15);    // on his doorstep
    this.b = new Badger();
    this.pos = this.b.root.position;
    this.pos.copy(this.in);
    this.b.root.rotation.y = st.face;
    scene.add(this.b.root);
    this.rng = new RNG(`brock:${Date.now()}`);
    this.state = 'sleep';
    this.stateT = 0;
    this.job = null;
    this.cool = 0;
    this.talkT = 3;
    this.zzzT = 2;
    this.bags = new Map();
    this.leafMat = paint(0xc27a3c);
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }
  say(text, dur = 3.4) { this.hud.say(`🦡 ${text}`, () => this.pos.clone().add(V(0, 0.75, 0)), dur); }

  get helped() { return progress.stats.badger ?? 0; }

  // ---------- the jobs ----------

  start() {
    const kind = this.helped % 2 === 0 ? 'bedding' : 'doors';
    this.job = { giver: 'brock', stat: 'badger', icon: '🦡', who: 'Brock', kind, done: false, n: 0, target: () => this.target(), objective: () => this.objective() };
    if (kind === 'bedding') {
      this.job.items = [];
      for (let i = 0, t = 0; i < BUNDLES && t < 40; t++) {
        const s = this.area.spot(this.rng);
        if (!s || flat(s, this.out) < 9 || flat(s, this.out) > 34 || this.job.items.some((it) => flat(it.pos, s) < 5)) continue;
        this.job.items.push(this.carry.add('bracken', s.x, s.z, { job: 'brock' }));
        i++;
      }
      if (!this.job.items.length) { this.job = null; return; }
      this.say(this.line(BROCK.askBedding), 6);
    } else {
      this.job.plugs = this.area.sett.holes.map((h) => {
        const it = this.carry.add('leaves', h.x + this.fx * 0.5, h.z + this.fz * 0.5, { buried: DIGS, job: 'brock' });
        it.mound.material = this.leafMat; // (a heap of leaves, not earth)
        it.mound.scale.set(1.25, 0.3, 1.25);
        return it;
      });
      this.say(this.line(BROCK.askDoors), 6);
    }
    wsfx.snort();
    this.friends.focus = this.job;
    this.talkT = 9;
    this.friends.onChange?.();
  }

  finish() {
    const job = this.job;
    job.done = true;
    this.job = null;
    this.cool = 40;
    this.friends.finish(job, () => this.say(this.line(BROCK.thanks), 4.5), 24 + 3 * Math.min(5, this.helped));
    this.go('home', 1.5);
  }

  /** Change what he's doing (t: seconds before he does it). */
  go(state, t = 0) { this.state = state; this.stateT = -t; }

  // ---------- per frame ----------

  update(dt, P, { canAct = true } = {}) {
    this.cool -= dt; this.talkT -= dt; this.zzzT -= dt;
    this.stateT += dt;
    const d = flat(P.pos, this.out), b = this.b, pos = this.pos;
    let moving = 0, snuffle = false, dig = false;
    const toward = (to, speed) => {
      const dx = to.x - pos.x, dz = to.z - pos.z, l = Math.hypot(dx, dz);
      if (l < 0.03) return true;
      const st = Math.min(l, speed * dt);
      pos.x += (dx / l) * st; pos.z += (dz / l) * st;
      return false;
    };
    switch (this.state) {
      case 'sleep': // nose out of the door, fast asleep
        pos.lerp(this.in, 1 - Math.exp(-dt * 4));
        if (this.zzzT <= 0 && d < 14) { this.zzzT = 3.5; this.hud.float(`💤 ${this.line(BROCK.sleep)}`, pos.clone().add(V(0, 0.5, 0)), 'sniff'); }
        if (canAct && this.cool <= 0 && d < 4.5 && this.stateT > 0) this.go('wake');
        else if (canAct && this.cool > 0 && d < 4 && this.talkT <= 0) { this.talkT = 16; this.say(this.line(BROCK.idle), 2.6); }
        break;
      case 'wake': // out he comes (blinking)
        pos.y += (0 - pos.y) * (1 - Math.exp(-dt * 6));
        moving = 0.6;
        if (toward(this.out, 1.2) && this.stateT > 0.6) { pos.y = 0; this.go('ask'); this.start(); if (!this.job) this.go('home'); }
        break;
      case 'ask': { // standing about on his doorstep while you help
        snuffle = true;
        const job = this.job;
        if (!job) { this.go('home'); break; }
        if (d < 8) b.root.rotation.y += wrap(Math.atan2(P.pos.x - pos.x, P.pos.z - pos.z) - b.root.rotation.y) * (1 - Math.exp(-dt * 2)); // (watching you)
        if (job.kind === 'bedding') {
          const held = this.carry.held;
          if (held && held.kind === 'bracken' && job.items.includes(held) && d < 2.2) {
            this.carry.consume();
            this.carrying = held;
            held.obj.position.set(0, 0, 0); held.obj.rotation.set(0, Math.PI / 2, 0); held.obj.scale.setScalar(1 / 1.1);
            b.mouth.add(held.obj);
            job.n++;
            sfx.pop?.(); buzz(15);
            this.say(this.line(BROCK.bundle), 3);
            this.actions.sparkle(this.out.clone().add(V(0, 0.4, 0)), 10);
            this.go('backin');
            this.friends.onChange?.();
          }
        } else {
          for (const it of job.plugs) {
            if (it.cleared || it.buried > 0) continue;
            it.cleared = true; // dug right out: whoosh, leaves everywhere
            this.carry.remove(it);
            job.n++;
            wsfx.leaves();
            this.actions.dirt.burst(16, () => ({ pos: it.pos.clone().add(V(0, 0.15, 0)), vel: V(Math.random() * 3 - 1.5, 1.5 + Math.random() * 2, Math.random() * 3 - 1.5), life: 1.4, size: 0.04, gravity: 4, drag: 1.2, floor: 0.03, color: [0xd9893c, 0xc0632d, 0xe0b04a, 0x9a6a3a][Math.floor(Math.random() * 4)] }));
            if (job.n < job.plugs.length) this.say(this.line(BROCK.door), 2.6);
            this.friends.onChange?.();
          }
          if (job.n >= job.plugs.length) { this.finish(); break; }
          dig = job.plugs.some((it) => !it.cleared && it.buried < DIGS); // (he joins in)
        }
        if (job.kind === 'bedding' && job.n >= BUNDLES && this.state === 'ask') this.finish();
        else if (this.talkT <= 0 && d < 5) { this.talkT = 15; this.say(this.line(job.kind === 'bedding' ? BROCK.remindBedding : BROCK.remindDoors), 3); }
        break;
      }
      case 'backin': { // backwards into the sett with the bracken, as is traditional
        b.root.rotation.y += wrap(this.face - b.root.rotation.y) * (1 - Math.exp(-dt * 6));
        if (this.stateT > 0.5) {
          moving = -0.8;
          toward(this.in, 0.55);
          pos.y = Math.max(-0.45, pos.y - dt * 0.25 * (flat(pos, this.in) < 0.5 ? 1 : 0));
        }
        if (this.stateT > 2.6) {
          if (this.carrying) { this.carrying.obj.removeFromParent(); this.carrying = null; }
          wsfx.snort();
          if (this.job?.kind === 'bedding' && this.job.n >= BUNDLES) { this.go('out'); this.finishing = true; }
          else this.go('out');
        }
        break;
      }
      case 'out': // and back out again for more
        pos.y += (0 - pos.y) * (1 - Math.exp(-dt * 5));
        moving = 0.6;
        if (toward(this.out, 1.0) && this.stateT > 0.5) {
          pos.y = 0;
          if (this.finishing) { this.finishing = false; this.finish(); } else this.go('ask');
        }
        break;
      case 'home': // off for a snooze (backwards, naturally)
        if (this.stateT < 0) { snuffle = true; break; }
        b.root.rotation.y += wrap(this.face - b.root.rotation.y) * (1 - Math.exp(-dt * 6));
        moving = -0.7;
        if (toward(this.in, 0.6)) pos.y += (this.in.y - pos.y) * (1 - Math.exp(-dt * 4));
        if (this.stateT > 3) { pos.copy(this.in); this.go('sleep'); }
        break;
    }
    b.update(dt, { moving, snuffle, dig });
  }

  /** The compass: the nearest bundle of bracken (or back to Brock with one), or the next door to dig out. */
  target() {
    const job = this.job, P = this.player.pos;
    if (!job) return null;
    if (job.kind === 'bedding') {
      if (this.carry.held?.kind === 'bracken') return { pos: this.out, emoji: '🦡' };
      const left = job.items.filter((it) => this.carry.items.includes(it));
      if (!left.length) return { pos: this.out, emoji: '🦡' };
      return { pos: left.reduce((a, c) => (flat(a.pos, P) < flat(c.pos, P) ? a : c)).pos, emoji: '🌾' };
    }
    const plug = job.plugs.find((it) => !it.cleared);
    return plug ? { pos: plug.pos, emoji: '🍂' } : { pos: this.out, emoji: '🦡' };
  }

  objective() {
    const job = this.job;
    if (job.kind === 'bedding') {
      const holding = this.carry.held?.kind === 'bracken';
      return holding ? { icon: '🦡', title: 'Take the 🌾 bracken to Brock!', sub: `He’s by his sett. <b>${job.n}/${BUNDLES}</b>` }
        : { icon: '🦡', title: `Fetch Brock some bracken 🌾 <b>${job.n}/${BUNDLES}</b>`, sub: 'Dry bracken bundles, somewhere in the wood. Grab one with 🐾' };
    }
    return { icon: '🦡', title: `Dig out Brock’s doors 🍂 <b>${job.n}/${job.plugs.length}</b>`, sub: 'Leaves stuck in his doorways. Dig dig dig with 🐾' };
  }

  /** A woof nearby wakes him up (a little early). */
  onBark(pos) {
    if (this.state === 'sleep' && flat(pos, this.out) < 7 && this.cool <= 0) this.stateT = Math.max(this.stateT, 0);
  }

  get hint() {
    const job = this.job;
    if (!job || job.kind !== 'doors') return null;
    return flat(this.player.pos, this.out) < 5 && !this.carry.held ? 'Dig the leaves out of Brock’s doors! 🐾' : null;
  }
}
