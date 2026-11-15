import * as THREE from 'three';
import { Dog } from '../../entities/dog.js';
import { Duck } from '../../entities/duck.js';
import { CARRYABLES } from '../../entities/carryables.js';
import { RNG } from '../../core/rng.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { freeSpot, blocked } from '../../world/spots.js';
import { waterAt } from '../../world/water.js';
import { LineBag } from '../dialogue.js';
import { GUS, DUCHESS } from '../lines/friends.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { noticeboard } from './friendModels.js';
import { JobBoard } from './jobs/board.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Friends around the neighbourhood, and the jobs they need doing — an endless supply:
 *   👴 Gus, a very old basset hound in the park, keeps losing things (some of them buried).
 *   🦆 Duchess at the pond keeps losing her three ducklings: find them and they follow you home.
 *   📋 The Lost & Found board by your house: pick a job from it (see ./jobs/) — lost things, deliveries,
 *      kites stuck up high, runaway hens, things Pickles "borrowed"… a new mix every time.
 * Walk up to a friend and they'll ask. Finished jobs earn stars and friendship (and, after a few,
 * something special to wear). Jobs are your own: each player's game has its own.
 * Other friends (the squirrels, Pepper…) join in with add(): anything with a `job` and update().
 */
export class Friends {
  constructor({ scene, world, hud, actions, player, seed, dogName, others = () => [], postman = null, busy = () => false }) {
    Object.assign(this, { scene, world, hud, actions, player, dogName });
    this.extras = []; // more friends with jobs (see add())
    this.carry = actions.carry;
    this.rng = new RNG(`jobs:${seed}:${Date.now()}`); // where lost things turn up: different every time
    const home = new RNG(`friends:${seed}`);          // where friends live: the same every time
    this.bags = {};
    this.time = 0;
    this.focus = null; // the job the compass points at
    const park = world.layout.places.find((p) => p.type === 'park');
    const pond = world.water?.find((w) => w.kind === 'pond');

    // Gus snoozes in the park.
    const gs = freeSpot(world, home, park.x, park.z, 2.5, 7, { pad: 0.9 }) ?? { x: park.x + 3, z: park.z + 3 };
    const gus = new Dog('gus');
    gus.root.position.set(gs.x, 0, gs.z);
    gus.root.rotation.y = home.float(0, Math.PI * 2);
    scene.add(gus.root);
    world.colliders.circle(gs.x, gs.z, 0.45, 0.62);
    this.gus = { dog: gus, pos: gus.root.position, job: null, cool: 0, talkT: 0, zzzT: 2, asked: false, lastItem: null };

    // Duchess paddles at the edge of the pond nearest home.
    const sp = world.spawn;
    const a = Math.atan2(sp.z - pond.z, sp.x - pond.x);
    const duck = new Duck({ duchess: true });
    duck.root.position.set(pond.x + Math.cos(a) * (pond.rx - 1.4), pond.surface - 0.06, pond.z + Math.sin(a) * (pond.rz - 1.4));
    duck.root.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    scene.add(duck.root);
    this.duchess = { duck, pos: duck.root.position, pond, job: null, cool: 0, talkT: 0, home: duck.root.position.clone() };

    // The Lost & Found board, on the pavement beside your gate.
    const side = V(Math.cos(world.spawnFace ?? 0), 0, -Math.sin(world.spawnFace ?? 0));
    let bp = null;
    for (const d of [2.8, -2.8, 4, -4]) { const x = sp.x + side.x * d, z = sp.z + side.z * d; if (!blocked(world, x, z, 0.7)) { bp = { x, z }; break; } }
    bp ??= freeSpot(world, home, sp.x, sp.z, 2.5, 6) ?? { x: sp.x + 3, z: sp.z };
    scene.add(noticeboard(bp.x, bp.z, (world.spawnFace ?? 0) + Math.PI));
    world.colliders.circle(bp.x, bp.z, 0.6);
    this.board = new JobBoard({
      scene, world, hud, carry: this.carry, actions, player, seed, pos: V(bp.x, 0, bp.z), friends: this, others, busy,
      live: { gus: () => this.gus.pos, duchess: () => this.duchess.pos, postman },
    });
  }

  /** Another friend with jobs: { job (or null), update(dt, player, ctx), onBark?(pos), hint? }. */
  add(friend) { this.extras.push(friend); return friend; }

  line(key, list, vars = {}) {
    this.bags[key] ??= new LineBag(list);
    return fill(this.bags[key].next(), { name: this.dogName(), ...vars });
  }
  say(text, at, dur = 3.6) { this.hud.say(text, typeof at === 'function' ? at : () => at.clone(), dur); }

  get jobs() { return [this.gus.job, this.duchess.job, this.board.job, ...this.extras.map((e) => e.job)].filter(Boolean); }

  // ---------- Gus ----------

  updateGus(dt, P) {
    const g = this.gus, d = flat(P.pos, g.pos);
    g.cool -= dt; g.talkT -= dt; g.zzzT -= dt;
    const head = () => g.pos.clone().add(V(0, 1.05, 0));
    // Turn to look at a dog who comes close.
    if (d < 8) {
      const want = Math.atan2(P.pos.x - g.pos.x, P.pos.z - g.pos.z);
      let diff = want - g.dog.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.dog.root.rotation.y += diff * (1 - Math.exp(-dt * 2));
    } else if (g.zzzT <= 0) { g.zzzT = 3.5; this.hud.float('Zzz…', head(), 'sniff'); }
    g.dog.update(dt, { speed: 0, turnRate: 0, sniff: false, dig: false, happy: d < 4 ? 0.9 : 0.2 });

    const job = g.job;
    if (!job && d < 3.4 && g.cool <= 0) {
      const opts = GUS.jobs.filter((j) => j.item !== g.lastItem);
      const def = opts[Math.floor(this.rng.float(0, opts.length))];
      const at = freeSpot(this.world, this.rng, g.pos.x, g.pos.z, 12, 36) ?? freeSpot(this.world, this.rng, g.pos.x, g.pos.z, 5, 60);
      if (!at) return;
      g.lastItem = def.item;
      const item = this.carry.add(def.item, at.x, at.z, { buried: def.buried ?? 0, job: 'gus' });
      g.job = { giver: 'gus', icon: '👴', who: 'Gus', item, buried: !!def.buried, name: CARRYABLES[def.item].name };
      this.focus = g.job;
      this.say(`👴 ${fill(def.ask, { name: this.dogName() })}`, head, 5.5);
      sfx.bark?.(0.55, 0.5);
      g.talkT = 7;
      this.onChange?.();
      return;
    }
    if (job && this.carry.held === job.item && d < 2) return this.finish(job, () => this.say(`👴 ${this.line('gus-thanks', GUS.thanks, { item: job.name })}`, head, 4), 25);
    if (job && d < 3.4 && g.talkT <= 0) { g.talkT = 14; this.say(`👴 ${this.line('gus-remind', GUS.remind, { item: job.name })}`, head); }
    else if (!job && d < 7 && g.talkT <= 0 && g.cool > 0) { g.talkT = 16; this.say(`👴 ${this.line('gus-idle', GUS.idle)}`, head, 2.6); }
  }

  // ---------- Duchess and the ducklings ----------

  updateDuchess(dt, P) {
    const D = this.duchess, d = flat(P.pos, D.pos);
    D.cool -= dt; D.talkT -= dt;
    const head = () => D.pos.clone().add(V(0, 0.55, 0));
    D.duck.update(dt, { swim: !D.pond.frozen });
    D.pos.x = D.home.x + Math.sin(this.time * 0.4) * 0.6; // paddling to and fro (or, when the pond's frozen, skating)
    D.pos.y = D.pond.frozen ? (D.pond.iceTop ?? 0.1) - 0.01 : D.home.y;
    const job = D.job;
    if (!job && d < 4 && D.cool <= 0) {
      const ducklings = [];
      for (let i = 0; i < 3; i++) {
        const at = freeSpot(this.world, this.rng, D.pond.x, D.pond.z, D.pond.rx + 6, D.pond.rx + 34);
        if (!at) continue;
        const duck = new Duck();
        duck.root.position.set(at.x, 0, at.z);
        this.scene.add(duck.root);
        ducklings.push({ duck, pos: duck.root.position, state: 'lost', peepT: this.rng.float(0, 3) });
      }
      if (!ducklings.length) return;
      D.job = { giver: 'duchess', icon: '🦆', who: 'Duchess', ducklings };
      this.focus = D.job;
      D.duck.quack(); sfx.quack?.();
      this.say(`🦆 ${this.line('duchess-ask', DUCHESS.ask)}`, head, 5.5);
      D.talkT = 8;
      this.onChange?.();
      return;
    }
    if (!job) {
      if (d < 7 && D.talkT <= 0 && D.cool > 0) { D.talkT = 15; D.duck.quack(); sfx.quack?.(); this.say(`🦆 ${this.line('duchess-idle', DUCHESS.idle)}`, head, 2.6); }
      return;
    }
    // Ducklings: peep when lost (louder when you're near), follow in a line once found.
    let leader = P.pos, following = 0;
    for (const k of job.ducklings) {
      k.duck.update(dt, { moving: k.moving ?? 0, swim: !!waterAt(this.world.water, k.pos.x, k.pos.z) });
      if (k.state === 'lost') {
        k.peepT -= dt;
        if (k.peepT <= 0) {
          k.peepT = 2 + Math.random() * 2;
          if (flat(P.pos, k.pos) < 14) { sfx.peep?.(); k.duck.quack(); this.hud.float('peep!', k.pos.clone().add(V(0, 0.35, 0)), 'sniff'); }
        }
        if (flat(P.pos, k.pos) < 1.4 && Math.abs(P.pos.y - k.pos.y) < 0.8) {
          k.state = 'following';
          sfx.peep?.(); buzz(15);
          const n = job.ducklings.filter((q) => q.state !== 'lost').length, left = job.ducklings.length - n;
          this.hud.float(`🐥 ${this.line('duckling-found', DUCHESS.found)}`, k.pos.clone().add(V(0, 0.4, 0)), 'xp');
          if (left) this.say(`🦆 ${this.line('duchess-progress', DUCHESS.progress, { n, left })}`, () => P.pos.clone().add(V(0, 1.4, 0)), 2.6);
          else this.say(`🦆 ${this.line('duchess-all', DUCHESS.allFound)}`, () => P.pos.clone().add(V(0, 1.4, 0)), 3);
          this.onChange?.();
        }
      }
      if (k.state === 'following' || k.state === 'home') {
        const target = k.state === 'home' ? D.pos : leader;
        const gap = k.state === 'home' ? 0.2 : 0.6;
        const dx = target.x - k.pos.x, dz = target.z - k.pos.z, dist = Math.hypot(dx, dz);
        const step = Math.min(dist - gap, Math.max(0, dist - gap) * 5 * dt + 0.0);
        k.moving = Math.min(1, Math.max(0, (dist - gap) * 2));
        if (dist > gap && step > 0) { k.pos.x += (dx / dist) * step; k.pos.z += (dz / dist) * step; k.duck.root.rotation.y = Math.atan2(dx, dz); }
        const w = waterAt(this.world.water, k.pos.x, k.pos.z), ground = this.world.heightAt?.(k.pos.x, k.pos.z) ?? 0;
        k.pos.y = w ? w.surface - 0.03 : ground > 0.02 ? ground + 0.03 : 0; // paddle across water; otherwise on the ground (or the ice)
        if (k.state === 'following') { leader = k.pos; following++; }
      }
    }
    if (job.done) { // ducklings swim home to Mum, then pop off for a nap
      job.doneT -= dt;
      if (job.doneT <= 0) { for (const k of job.ducklings) k.duck.root.removeFromParent(); D.job = null; this.onChange?.(); }
      return;
    }
    if (following === job.ducklings.length && d < 3.6) {
      for (const k of job.ducklings) k.state = 'home';
      job.done = true; job.doneT = 3;
      D.duck.quack(); sfx.quack?.();
      this.finish(job, () => this.say(`🦆 ${this.line('duchess-thanks', DUCHESS.thanks)}`, head, 4), 30, false);
      return;
    }
    if (d < 4 && D.talkT <= 0 && following < job.ducklings.length) { D.talkT = 14; this.say(`🦆 ${this.line('duchess-remind', DUCHESS.remind)}`, head); }
  }

  // ---------- shared ----------

  /** A job's done: stars, friendship, maybe something new to wear. */
  finish(job, thank, xp, clear = true) {
    if (job.item) this.carry.consume();
    thank();
    sfx.found?.();
    buzz([25, 40, 25]);
    this.actions.sparkle(this.player.pos.clone().add(V(0, 0.8, 0)), 26);
    const key = job.stat ?? { gus: 'gus', duchess: 'duchess', board: 'helped' }[job.giver];
    const before = progress.stats[key] ?? 0;
    progress.stat(key);
    progress.award(xp, `Helped ${job.who}!`);
    for (const c of COSMETICS) {
      if (c.friend === key && before < c.jobs && before + 1 >= c.jobs) this.hud.showToastRaw(c.emoji, `New: ${c.name}!`, `A thank-you from ${job.who}. Wear it from ☰ → My dog → Dress up.`);
    }
    if (clear && job.giver === 'gus') { this.gus.job = null; this.gus.cool = 20; } // (the board and other friends tidy up their own)
    if (job.giver === 'duchess') this.duchess.cool = 40;
    this.gus.talkT = Math.max(this.gus.talkT, 8); this.duchess.talkT = Math.max(this.duchess.talkT, 8); // let the thank-you be heard
    if (this.focus === job) this.focus = this.jobs.find((j) => j !== job && !j.done) ?? null;
    this.onChange?.();
  }

  /** ctx: { sniffing, nose } this frame. */
  update(dt, P, canAct = true, ctx = {}) {
    this.time += dt;
    for (const e of this.extras) e.update(dt, P, { ...ctx, canAct });
    if (!canAct) { // still choosing a dog: friends just potter about
      this.gus.dog.update(dt, { speed: 0, turnRate: 0, sniff: false, dig: false, happy: 0.2 });
      this.duchess.duck.update(dt, { swim: !this.duchess.pond.frozen });
      return;
    }
    this.updateGus(dt, P);
    this.updateDuchess(dt, P);
    this.board.update(dt, P, { sniffing: false, nose: P.pos, ...ctx });
    // Carrying something for a job? That's the one to point at.
    if (this.carry.held?.job) this.focus = this.jobs.find((j) => j.item === this.carry.held) ?? this.focus;
  }

  /** The local dog woofed (squirrels peek out, Pickles drops things, a quiet job loses its bonus…). */
  onBark(pos) {
    this.board.onBark();
    for (const e of this.extras) e.onBark?.(pos);
  }

  /** The local dog did something naughty (a "no mischief" job loses its bonus). */
  onMischief() { this.board.onMischief(); }

  /** Something to tell the player right now ("Too high! Big jump!"), or null. */
  get hint() { return this.board.hint ?? this.extras.find((e) => e.hint)?.hint ?? null; }

  /**
   * Where the compass (and, if it's close, the sniff trail) should point: { pos, emoji, label?, compass? }.
   * compass: somewhere else for the compass (near, not on, something you have to sniff out), or false (hide it).
   */
  target() {
    const j = this.focus;
    if (!j || j.done) return null;
    if (j.target) return j.target();
    if (j.giver === 'duchess') {
      const lost = j.ducklings.filter((k) => k.state === 'lost');
      if (!lost.length) return { pos: this.duchess.pos, emoji: '🦆' };
      const P = this.player.pos;
      return { pos: lost.reduce((a, b) => (flat(a.pos, P) < flat(b.pos, P) ? a : b)).pos, emoji: '🐥' };
    }
    if (this.carry.held === j.item) return { pos: this.gus.pos, emoji: '👴' };
    return { pos: j.item.pos, emoji: CARRYABLES[j.item.kind].emoji };
  }

  /** For the HUD's objective box: { title, sub, icon } or null when nobody needs a hand. */
  objective() {
    const j = this.focus;
    if (!j || j.done) return null;
    const others = this.jobs.filter((q) => q !== j && !q.done).map((q) => q.icon).join(' ');
    const also = others ? ` · also ${others}` : '';
    if (j.objective) { const o = j.objective(); return o && { ...o, sub: `${o.sub}${also}` }; }
    if (j.giver === 'duchess') {
      const found = j.ducklings.filter((k) => k.state !== 'lost').length, n = j.ducklings.length;
      return found < n
        ? { icon: '🦆', title: `Find Duchess’s ducklings <b>${found}/${n}</b>`, sub: `They’ll follow you. Sniff for peeps!${also}` }
        : { icon: '🦆', title: 'Take the ducklings back to Duchess!', sub: `She’s at the pond.${also}` };
    }
    const holding = this.carry.held === j.item;
    const what = `${CARRYABLES[j.item.kind].emoji} ${j.name}`;
    if (j.giver === 'gus') {
      return holding ? { icon: '👴', title: `Take the ${what} back to Gus!`, sub: `He’s snoozing in the park.${also}` }
        : { icon: '👴', title: `Find Gus’s ${what}`, sub: `${j.item.buried ? 'It’s buried! Sniff it out, then dig 🐾' : 'Sniff it out, then grab it 🐾'}${also}` };
    }
    return null;
  }
}
