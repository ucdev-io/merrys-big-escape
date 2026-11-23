import { EMOTES } from '../../../entities/dog.js';
import { BREEDS } from '../../../entities/breeds.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { Game } from './base.js';
import { V, flat, lookAt } from './common.js';

const EMOTE = Object.fromEntries(EMOTES.map((m, i) => [m.id, { ...m, key: i + 1 }]));
const TRICKS = ['bow', 'spin', 'sit', 'roll', 'dance', 'howl'];
const SEE = 9; // she has to see you do it

const label = (id) => `${EMOTE[id].emoji} ${EMOTE[id].name}`;
const touch = () => document.body.classList.contains('touch-mode'); // (phones: no keys to mention)
const how = (id) => touch() ? 'tap 😀' : `😀 menu, or key ${EMOTE[id].key}`;

/**
 * 🎭 Copycat (Pebble, down the alley): she does a trick, you do the same one (the 😀 tricks, or keys 1–6).
 * Three rounds; the last one is two tricks in a row. Get one wrong and she just shows you again.
 */
class Copy extends Game {
  start() {
    this.round = 0;
    this.say('ask', {}, 4);
    this.newRound(2.4);
  }

  newRound(wait) {
    const n = this.round === 2 ? 2 : 1, list = [];
    while (list.length < n) { const k = TRICKS[Math.floor(Math.random() * TRICKS.length)]; if (k !== list.at(-1) && k !== this.last) list.push(k); }
    this.seq = list;
    this.i = 0;
    this.show(wait);
  }

  /** Watch me! (after `wait`): the tricks one after another, then "your turn". */
  show(wait = 0.8) {
    this.phase = 'show';
    this.t = -wait;
    const e = this.e, steps = [{ at: 0, fn: () => this.say('watch', {}, 1.8) }];
    this.seq.forEach((k, i) => steps.push({ at: 1 + i * 2.4, fn: () => {
      e.dog.emote(k);
      if (k === 'howl') sfx.howl?.(BREEDS[e.key]?.bark ?? 1, Math.max(0.2, 1 - flat(this.P.pos, e.pos) / 30));
      this.td.hud.float(label(k), e.pos.clone().add(V(0, 0.9 * e.size + 0.3, 0)), 'xp');
    } }));
    steps.push({ at: 1 + this.seq.length * 2.4, fn: () => {
      this.say('your', { trick: this.seq.map(label).join(', then ') }, 2.6);
      this.phase = 'copy'; this.t = 0; this.wrongT = 0;
    } });
    this.steps = steps;
  }

  update(dt, P) {
    const e = this.e, d = flat(P.pos, e.pos);
    this.t += dt;
    this.pose = { happy: 1 };
    if (d > 2.2 && (e.dog.emoteT ?? 0) <= 0) lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
    if (this.phase === 'show') {
      while (this.steps.length && this.t >= this.steps[0].at) this.steps.shift().fn();
      return;
    }
    if (this.phase === 'copy') {
      if (this.away(dt, e.pos, 30, 15)) return 'stop';
      this.wrongT -= dt;
      const did = P.emoted;
      if (!did) { if (this.t > 14) this.show(0.4); return; } // (forgotten? she shows it again)
      if (d > SEE) { this.say('far', {}, 2.2); return; }
      const want = this.seq[this.i];
      if (did === want) {
        this.i++;
        sfx.pop?.(); buzz(15);
        this.td.actions.sparkle(P.pos.clone().add(V(0, 0.7, 0)), 10);
        if (this.i < this.seq.length) { this.td.hud.float('✔️ And…?', e.pos.clone().add(V(0, 1.1, 0)), 'xp'); return; }
        this.round++;
        this.last = want;
        if (this.round >= 3) return 'win';
        this.say('right', { n: this.round }, 2.4);
        this.newRound(2.6);
        return;
      }
      if (this.wrongT <= 0) { this.wrongT = 2.5; this.say('wrong', { did: label(did), want: label(want) }, 3); }
    }
  }

  end() { this.e.dog.stopEmote(); }

  objective() {
    return { icon: '🎭', title: `Copy ${this.name}’s tricks <b>${this.round}/3</b>`, sub: `Watch, then do the same trick: tap 😀${touch() ? '' : ' (or keys 1–6)'}.` };
  }

  get hint() {
    if (this.phase !== 'copy') return this.phase === 'show' ? `Watch ${this.name}… 👀` : null;
    const want = this.seq[this.i];
    return `Copy ${this.name}: ${label(want)} (${how(want)})`;
  }
}

/**
 * 🐺 Howl along (Fern, in the woods): she howls, you howl back (the 🐺 trick, key 5). Three times; the last
 * one together, at the same moment. If you don't, she just howls again.
 */
class Howl extends Game {
  start() {
    this.n = 0;
    this.say('ask', {}, 4);
    this.phase = 'wait';
    this.t = -2.6;
  }

  howl(e, d) {
    e.dog.emote('howl');
    sfx.howl?.(BREEDS[e.key]?.bark ?? 1, Math.max(0.25, 1 - d / 40));
  }

  update(dt, P) {
    const e = this.e, d = flat(P.pos, e.pos);
    this.t += dt;
    this.pose = { happy: 1 };
    if (d > 2) lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
    if (this.away(dt, e.pos, 40, 15)) return 'stop';
    const did = P.emoted === 'howl' && d < 14;
    if (this.phase === 'wait') { // her turn: a big howl (the third time, a count-in, then together)
      if (this.t < 0) return;
      if (this.n === 2) { this.say('together', {}, 3); this.phase = 'count'; this.t = -1.8; return; }
      this.howl(e, d);
      this.phase = 'listen';
      this.t = 0;
      return;
    }
    if (this.phase === 'listen') {
      if (this.t > 2.4 && !this.yourSaid) { this.yourSaid = true; this.say('your', {}, 2.4); }
      if (did && this.t > 0.5) return this.good(e, P);
      if (this.t > 10) { this.phase = 'wait'; this.t = 0; this.yourSaid = false; } // again!
      return;
    }
    if (this.phase === 'count') { // …and AWOOO together
      if (this.t >= 0 && !this.went) { this.went = true; this.howl(e, d); this.td.hud.float('🐺 Now!', e.pos.clone().add(V(0, 1.2, 0)), 'xp'); }
      if (did && this.t > -0.6) return this.good(e, P);
      if (this.t > 3.5) { this.went = false; this.phase = 'wait'; this.t = 0; this.say('again', {}, 2.4); this.n = 2; }
    }
  }

  good(e, P) {
    this.n++;
    this.yourSaid = false;
    sfx.pop?.(); buzz(15);
    this.td.actions.sparkle(P.pos.clone().add(V(0, 0.8, 0)), 12);
    if (this.n >= 3) return 'win';
    this.say('right', { n: this.n }, 2.4);
    this.phase = 'wait';
    this.t = -2.4;
  }

  end() { this.e.dog.stopEmote(); }

  objective() {
    return { icon: '🐺', title: `Howl with ${this.name} <b>${this.n}/3</b>`, sub: `When she howls, howl back: 😀 → 🐺 Howl${touch() ? '' : ' (or key 5)'}.` };
  }

  get hint() { return this.phase === 'listen' || this.phase === 'count' ? `Howl back! 🐺 (${how('howl')})` : null; }
}

export const CopyGame = { Game: Copy };
export const HowlGame = { Game: Howl };
