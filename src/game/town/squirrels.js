import * as THREE from 'three';
import { Squirrel } from '../../entities/squirrel.js';
import { RNG } from '../../core/rng.js';
import { sfx } from '../../core/audio.js';
import { fsfx } from '../../core/friendSounds.js';
import { buzz } from '../../core/haptics.js';
import { blocked } from '../../world/spots.js';
import { LineBag, fill } from '../dialogue.js';
import { progress } from '../progress.js';
import { SQUIRRELS } from '../lines/park.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const RUN = 4.2, CLIMB = 2.6;   // squirrels are quick
const REACH = 3.6;              // woof within this of a trunk to be woofing at that tree
const WANDER = 40;              // further than this from the park for a while, and they give up

/** A park tree's trunk centre at height y (trunks lean a little: see tree() in world/props.js). */
function trunkAt(t, y) {
  const b = t.bend ?? 0, k = Math.max(0, y / t.s);
  return k < 1 ? { x: t.x + b * 0.3 * k, z: t.z } : { x: t.x + b * (0.3 + 0.7 * Math.min(1, k - 1)), z: t.z + b * 0.4 * Math.min(1, k - 1) };
}

/**
 * 🐿️ Nut & Meg, squirrel twins who live in the park and LOVE hide-and-seek. Come close and they dash
 * up two of the park's trees. Sniff out which ones (nutty wisps rise from the right tree, giggles get
 * louder), then woof at it: out pops a twin with a giggle and darts off — to hide again, the more
 * rounds you've played. Find them all to win. Friendship (the `squirrels` stat) earns a prize.
 * Like Gus and Duchess, it's your own game (each player's twins are their own).
 */
export class NutAndMeg {
  constructor({ scene, world, hud, player, actions, friends, seed, dogName }) {
    Object.assign(this, { scene, world, hud, player, actions, friends, dogName });
    this.trees = world.parkTrees ?? [];
    const park = world.layout.places.find((p) => p.type === 'park');
    this.park = V(park?.x ?? 0, 0, park?.z ?? 0);
    const rng = new RNG(`squirrels:${seed}`);
    this.home = this.trees.length ? rng.pick(this.trees) : { x: this.park.x + 4, z: this.park.z + 4, s: 1.2, bend: 0 };
    this.twins = ['nut', 'meg'].map((kind, i) => {
      const sq = new Squirrel(kind);
      scene.add(sq.root);
      const a = i * Math.PI + rng.float(0, 1);
      sq.root.position.set(this.home.x + Math.cos(a) * 1.1, 0, this.home.z + Math.sin(a) * 1.1);
      return { kind, name: kind === 'nut' ? 'Nut' : 'Meg', sq, pos: sq.root.position, state: 'play', t: 0, to: null, hides: 0, tree: null };
    });
    this.job = null;
    this.cool = 0;
    this.talkT = 3;
    this.teaseT = 4;
    this.wrongT = 0;
    this.awayT = 0;
    this.bags = new Map();
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }

  /** Say a line: "Nut: …" / "Meg: …" lines come from that twin (anyone else's from whoever's handy). */
  say(text, tw = null, dur = 3) {
    const m = /^(Nut|Meg): (.*)$/.exec(text);
    const who = m ? this.twins.find((q) => q.name === m[1]) : tw ?? this.twins[0];
    this.hud.say(`🐿️ ${m ? m[2] : text}`, () => who.pos.clone().add(V(0, who.sq.mode === 'hide' ? 0.6 : 0.45, 0)), dur);
    fsfx.chitter(Math.max(0.25, 1 - flat(who.pos, this.player.pos) / 20));
  }

  get round() { return progress.stats.squirrels ?? 0; }

  // ---------- moving about ----------

  /** Dash along the ground towards `to` (hopping over benches and such). True on arrival. */
  runTo(tw, to, dt, stopAt = 0.15) {
    const dx = to.x - tw.pos.x, dz = to.z - tw.pos.z, d = Math.hypot(dx, dz);
    tw.sq.mode = 'run';
    if (d <= stopAt) return true;
    const step = Math.min(d, RUN * dt);
    tw.pos.x += (dx / d) * step;
    tw.pos.z += (dz / d) * step;
    tw.pos.y += ((blocked(this.world, tw.pos.x, tw.pos.z, 0) ? 0.55 : 0) - tw.pos.y) * (1 - Math.exp(-dt * 14));
    tw.sq.root.rotation.y = Math.atan2(dx, dz);
    return false;
  }

  /** Where a twin hides in a tree: tucked into the leaves, tail dangling (and where she pops out). */
  spots(t, dir) {
    const top = trunkAt(t, 2 * t.s), fork = trunkAt(t, 1.45 * t.s);
    return {
      base: V(t.x + dir.x * (0.16 * t.s + 0.04), 0, t.z + dir.z * (0.16 * t.s + 0.04)),
      hide: V(top.x + dir.x * 0.5 * t.s, 1.82 * t.s, top.z + dir.z * 0.5 * t.s), // (low in the leaves: her tail dangles out)
      pop: V(fork.x + dir.x * (0.16 * t.s + 0.1), 1.45 * t.s, fork.z + dir.z * (0.16 * t.s + 0.1)), // (on the fork, under the leaves)
      land: V(t.x + dir.x * 1.5, 0, t.z + dir.z * 1.5),
    };
  }

  /** Off to hide up a tree (any tree but the ones in `not`). */
  sendToHide(tw, not = []) {
    const opts = this.trees.filter((t) => !not.includes(t) && !this.twins.some((q) => q !== tw && q.tree === t));
    const t = opts[Math.floor(Math.random() * opts.length)] ?? this.trees[0];
    const from = V(tw.pos.x - t.x, 0, tw.pos.z - t.z);
    const dir = from.lengthSq() > 1e-4 ? from.normalize() : V(1, 0, 0);
    Object.assign(tw, { state: 'go', tree: t, dir, at: this.spots(t, dir), t: 0 });
  }

  // ---------- the game ----------

  startRound() {
    const n = this.round, total = n < 2 ? [1, 1] : n < 5 ? [2, 1] : [2, 2];
    this.job = {
      giver: 'squirrels', stat: 'squirrels', icon: '🐿️', who: 'Nut & Meg', found: 0, total: total[0] + total[1],
      target: () => this.target(), objective: () => this.objective(),
    };
    this.twins.forEach((tw, i) => { tw.hides = total[i]; this.sendToHide(tw, [this.home]); });
    this.friends.focus = this.job;
    this.say(this.line(SQUIRRELS.ask, { round: String(n + 1) }), null, 3.5);
    setTimeout(() => this.hud.float(this.line(SQUIRRELS.count), this.actions.anchor(), 'sniff'), 1200);
    this.friends.onChange?.();
  }

  /** Woof! At a tree? Is anyone up it? */
  onBark(pos) {
    if (!this.job || this.job.over) return;
    let tree = null, best = REACH;
    for (const t of this.trees) { const d = flat(pos, t); if (d < best) { best = d; tree = t; } }
    if (!tree) return;
    const tw = this.twins.find((q) => q.tree === tree && q.state === 'hidden');
    if (tw) { this.found(tw); return; }
    if (this.wrongT > 0) return;
    this.wrongT = 2.5;
    const top = trunkAt(tree, 2 * tree.s);
    const early = this.twins.find((q) => q.tree === tree && (q.state === 'go' || q.state === 'up'));
    this.hud.say(early ? `🐿️ Hey! No peeking! I’m not hidden yet!` : `🍃 ${this.line(SQUIRRELS.wrong)}`, () => V(top.x, 2.3 * tree.s, top.z), 2.6);
    sfx.rustle?.();
    this.leaves(V(top.x, 2.1 * tree.s, top.z), 10);
  }

  found(tw) {
    const job = this.job;
    job.found++;
    tw.hides--;
    tw.state = 'pop';
    tw.t = 0;
    tw.pos.copy(tw.at.pop);
    tw.sq.root.rotation.y = Math.atan2(this.player.pos.x - tw.pos.x, this.player.pos.z - tw.pos.z);
    tw.sq.mode = 'sit';
    tw.sq.giggle(1.3);
    fsfx.giggle(); sfx.found?.(); buzz([20, 30, 20]);
    this.leaves(tw.at.pop.clone(), 14);
    this.actions.sparkle(tw.at.pop.clone(), 14);
    const again = tw.hides > 0 ? ` ${this.line(SQUIRRELS.again[tw.kind])}` : '';
    this.say(`${this.line(SQUIRRELS.found[tw.kind])}${again}`, tw, 3);
    this.hud.float(`🐿️ ${job.found}/${job.total}`, this.actions.anchor(), 'xp');
    this.friends.onChange?.();
  }

  /** Everyone's been found: down they come, a little celebration, and a thank-you. */
  win() {
    const job = this.job;
    job.over = true;
    job.endT = 2.2;
    this.twins.forEach((tw) => { tw.state = 'cheer'; });
    this.say(this.line(SQUIRRELS.allFound), null, 2.6);
  }

  finish() {
    const job = this.job;
    this.job = null;
    this.cool = 25;
    this.talkT = 10;
    this.friends.finish(job, () => this.say(this.line(SQUIRRELS.thanks), null, 3.6), 8 + job.total * 10);
    this.twins.forEach((tw) => { tw.state = 'home'; tw.tree = null; });
  }

  /** Wandered off mid-game: they get bored and go home (no harm done — play again any time). */
  giveUp() {
    this.say(this.line(SQUIRRELS.bored), null, 3);
    this.job = null;
    this.cool = 8;
    this.twins.forEach((tw) => { if (tw.state === 'hidden' || tw.state === 'up') { tw.pos.copy(tw.at.land); tw.pos.y = 0; } tw.state = 'home'; tw.tree = null; });
    if (this.friends.focus?.giver === 'squirrels') this.friends.focus = this.friends.jobs.find((j) => !j.done) ?? null;
    this.friends.onChange?.();
  }

  /** A little flurry of leaves (and a nutty wisp or two) from a tree. */
  leaves(at, n) {
    this.actions.glow.burst(n, () => ({
      pos: at.clone().add(V(Math.random() - 0.5, Math.random() * 0.4 - 0.2, Math.random() - 0.5)),
      vel: V(Math.random() * 1.2 - 0.6, Math.random() * 0.6, Math.random() * 1.2 - 0.6),
      life: 1.4, size: 0.045, gravity: 1.2, drag: 1.5, color: [0x7fae64, 0x6f9a52, 0xa9c47a, 0xe39a52][Math.floor(Math.random() * 4)],
    }));
  }

  // ---------- per frame ----------

  update(dt, P, { canAct = true, sniffing = false } = {}) {
    this.cool -= dt; this.talkT -= dt; this.teaseT -= dt; this.wrongT -= dt;
    const d = flat(P.pos, this.home);
    if (!this.job && canAct && this.trees.length >= 3 && this.cool <= 0 && d < 4.5 && this.twins.every((tw) => tw.state === 'play')) this.startRound();
    else if (!this.job && canAct && d < 6 && this.talkT <= 0) { this.talkT = 15; this.say(this.line(SQUIRRELS.idle), null, 2.8); }
    for (const tw of this.twins) this.step(tw, dt, P);
    const job = this.job;
    if (!job) return;
    if (job.over) { job.endT -= dt; if (job.endT <= 0) this.finish(); return; }
    if (job.found >= job.total) { if (!this.twins.some((tw) => tw.state === 'pop' || tw.state === 'leap')) this.win(); return; } // (after the last one's giggle)
    // Sniffing near a hiding twin: nutty wisps drift out of her tree. Close by: giggles.
    for (const tw of this.twins) {
      if (tw.state !== 'hidden') continue;
      const dd = flat(P.pos, tw.tree);
      if (sniffing && dd < 13 && Math.random() < dt * 5) this.actions.smellPuff(tw.at.hide.clone().add(V(0, -0.3, 0)), Math.random() < 0.5 ? 0xe39a52 : 0xc4622d);
      if (dd < 7 && this.teaseT <= 0) { this.teaseT = 6 + Math.random() * 3; this.hud.float(this.line(SQUIRRELS.tease).replace(/^(Nut|Meg): /, ''), this.actions.anchor().add(V(0, 0.4, 0)), 'sniff'); fsfx.giggle(0.5); } // (not saying who: that'd give it away)
    }
    this.awayT = flat(P.pos, this.park) > WANDER ? this.awayT + dt : 0;
    if (this.awayT > 30) this.giveUp();
  }

  step(tw, dt, P) {
    const sq = tw.sq;
    tw.t += dt;
    let moving = 0;
    switch (tw.state) {
      case 'play': { // scampering round the home tree, sitting up to nibble now and then
        if (!tw.to || tw.t > tw.wait) {
          const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.4;
          tw.to = V(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          tw.wait = 2 + Math.random() * 3.5;
          tw.t = 0;
        }
        if (this.runTo(tw, tw.to, dt * 0.6)) { sq.mode = 'sit'; if (flat(P.pos, tw.pos) < 6) sq.root.rotation.y += (Math.atan2(P.pos.x - tw.pos.x, P.pos.z - tw.pos.z) - sq.root.rotation.y) * 0.05; }
        else moving = 1;
        break;
      }
      case 'go': // dashing to her tree…
        if (this.runTo(tw, tw.at.base, dt)) { tw.state = 'up'; tw.t = 0; sq.root.rotation.y = Math.atan2(-tw.dir.x, -tw.dir.z); }
        else moving = 1;
        break;
      case 'up': { // …up the trunk…
        sq.mode = 'climb';
        moving = 1;
        tw.pos.y = Math.min(tw.at.hide.y - 0.2, tw.pos.y + CLIMB * dt);
        const c = trunkAt(tw.tree, tw.pos.y), r = 0.16 * tw.tree.s * (1 - 0.3 * Math.min(1, tw.pos.y / (2 * tw.tree.s))) + 0.02;
        tw.pos.x = c.x + tw.dir.x * r;
        tw.pos.z = c.z + tw.dir.z * r;
        if (tw.pos.y >= tw.at.hide.y - 0.2) { tw.state = 'hidden'; tw.pos.copy(tw.at.hide); sq.mode = 'hide'; sq.root.rotation.y = Math.atan2(tw.dir.x, tw.dir.z); sfx.rustle?.(); }
        break;
      }
      case 'hidden': sq.mode = 'hide'; break; // …and into the leaves. Shh!
      case 'pop': // found! A giggle at the edge of the leaves…
        sq.root.rotation.y = Math.atan2(P.pos.x - tw.pos.x, P.pos.z - tw.pos.z);
        if (tw.t > 1.2) { tw.state = 'leap'; tw.t = 0; tw.from = tw.pos.clone(); }
        break;
      case 'leap': { // …a flying leap down to the grass…
        const k = Math.min(1, tw.t / 0.6), to = tw.at.land;
        tw.pos.lerpVectors(tw.from, to, k);
        tw.pos.y = tw.from.y * (1 - k) + Math.sin(k * Math.PI) * 0.6;
        sq.mode = 'run';
        moving = 1;
        sq.root.rotation.y = Math.atan2(to.x - tw.from.x, to.z - tw.from.z);
        if (k >= 1) {
          tw.pos.y = 0;
          if (tw.hides > 0) this.sendToHide(tw, [tw.tree]); // …and off to hide again!
          else { tw.state = 'wait'; tw.tree = null; tw.t = 0; tw.to = V(this.home.x + (tw.kind === 'nut' ? 1.3 : -1.3), 0, this.home.z + 1.0); }
        }
        break;
      }
      case 'wait': // found and done: cheering from the home tree
        if (this.runTo(tw, tw.to, dt)) { sq.mode = 'sit'; sq.root.rotation.y = Math.atan2(P.pos.x - tw.pos.x, P.pos.z - tw.pos.z); if (Math.random() < dt * 0.3 && flat(P.pos, tw.pos) < 15) { this.say(this.line(SQUIRRELS.waiting), tw, 2.4); } }
        else moving = 1;
        break;
      case 'cheer': { // round over: scamper to the dog for a little dance
        const to = V(P.pos.x + (tw.kind === 'nut' ? 0.8 : -0.8), 0, P.pos.z + 0.6);
        if (tw.pos.y > 0.01) { tw.pos.y = Math.max(0, tw.pos.y - dt * 6); sq.mode = 'climb'; moving = 1; }
        else if (this.runTo(tw, to, dt, 0.3)) { sq.mode = 'sit'; sq.root.rotation.y += dt * 9; if (sq.giggleT <= 0) sq.giggle(0.8); }
        else moving = 1;
        break;
      }
      case 'home': // back to their own tree
        if (tw.pos.y > 0.01) { tw.pos.y = Math.max(0, tw.pos.y - dt * 6); sq.mode = 'climb'; }
        else if (this.runTo(tw, V(this.home.x + (tw.kind === 'nut' ? 1 : -1), 0, this.home.z), dt)) { tw.state = 'play'; tw.to = null; }
        moving = 1;
        break;
    }
    sq.update(dt, { moving });
  }

  /** For the compass and sniff trail: the park from afar; up close, no compass — sniff them out! */
  target() {
    const P = this.player.pos;
    if (flat(P, this.park) > 22) return { pos: this.park, emoji: '🐿️' };
    const hidden = this.twins.filter((tw) => tw.state === 'hidden' || tw.state === 'up' || tw.state === 'go');
    if (!hidden.length) return { pos: this.park, emoji: '🐿️', compass: false };
    const t = hidden.map((tw) => tw.tree).reduce((a, b) => (flat(a, P) < flat(b, P) ? a : b));
    return { pos: V(t.x, 0, t.z), emoji: '🐿️', compass: false };
  }

  objective() {
    const j = this.job;
    return { icon: '🐿️', title: `Find Nut &amp; Meg! <b>${j.found}/${j.total}</b>`, sub: 'They’re hiding up the park’s trees. Sniff 👃 for the right tree, then woof at it! 🗣️' };
  }

  /** "Anyone up there?" when you're right under a tree mid-game. */
  get hint() {
    if (!this.job || this.job.over) return null;
    const P = this.player.pos;
    return this.trees.some((t) => flat(P, t) < 2.4) ? 'Anyone up there? Woof! 🗣️' : null;
  }
}
