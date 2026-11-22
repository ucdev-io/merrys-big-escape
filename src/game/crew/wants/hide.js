import { RNG } from '../../../core/rng.js';
import { fsfx } from '../../../core/friendSounds.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { freeSpot } from '../../../world/spots.js';
import { Game } from './base.js';
import { V, flat, lookAt, wet } from './common.js';

const ROUNDS = 3;
const FIND = 1.8;   // this close and you've found her
const RANGES = [[9, 15], [13, 21], [17, 27]]; // how far she hides, round by round

/**
 * 🙈 Hide-and-seek (Biscuit): she dives into a hole, tunnels off and pops up somewhere nearby, lying low.
 * Sniff her out (the trail leads to her; giggles when you're close). Three rounds, each a bit further.
 */
class Hide extends Game {
  start() {
    this.round = 0;
    this.rng = new RNG(`hide:${Date.now()}`);
    this.say('ask', {}, 4);
    this.next(2.2);
  }

  /** Down she goes (after `wait`), and up somewhere else. */
  next(wait = 0.6) {
    this.phase = 'dive';
    this.t = -wait;
    const e = this.e, h = e.home, [r0, r1] = RANGES[Math.min(this.round, RANGES.length - 1)];
    let s = null;
    for (let i = 0; i < 20 && !s; i++) {
      const c = freeSpot(this.world, this.rng, h.x, h.z, r0, r1, { pad: 0.7 });
      if (c && !wet(this.world, c.x, c.z) && flat(c, this.P.pos) > 6) s = c;
    }
    this.spot = s ?? { x: h.x + 6, z: h.z + 6 };
    const a = this.rng.float(0, Math.PI * 2), r = this.rng.float(2.5, 5.5); // (the compass points near, not right at her)
    this.near = V(this.spot.x + Math.cos(a) * r, 0, this.spot.z + Math.sin(a) * r);
    this.giggleT = 2;
  }

  update(dt, P) {
    const e = this.e, td = this.td;
    this.t += dt;
    this.pose = { happy: 1 };
    if (this.phase === 'dive') {
      if (this.t < 0) { lookAt(e.dog.root, P.pos.x, P.pos.z, dt); return; }
      this.pose = { dig: true, happy: 1 };
      if (this.t < 0.9) { if (Math.random() < dt * 12) td.actions.dirtBurst(e.pos.clone(), 2); return; }
      if (this.t < 1.3) { e.yFree = true; e.pos.y = -0.9 * (this.t - 0.9) / 0.4; return; }
      // Underground… and up at her hiding spot.
      e.hidden = true;
      if (this.t < 2.4) return;
      e.pos.set(this.spot.x, 0, this.spot.z);
      e.lastX = e.pos.x; e.lastZ = e.pos.z;
      e.dog.root.rotation.y = this.rng.float(0, Math.PI * 2);
      e.hidden = false; e.yFree = false;
      td.actions.dirtBurst(e.pos.clone(), 5);
      e.dog.emote('sit');
      this.phase = 'hidden';
      this.t = 0;
      return;
    }
    if (this.phase === 'hidden') {
      const d = flat(P.pos, e.pos);
      if (this.away(dt, e.pos, 50, 20)) return 'stop';
      if ((e.dog.emoteT ?? 0) < 0.5) e.dog.emote('sit'); // (sitting very still. Ish.)
      this.giggleT -= dt;
      if (d < 10 && this.giggleT <= 0) { // hee hee
        this.giggleT = 2.4 + Math.random();
        fsfx.giggle(Math.max(0.3, 1 - d / 10));
        td.hud.float(td.line(e, 'giggle'), e.pos.clone().add(V(0, 0.8 * e.size, 0)), 'sniff');
      }
      if (d < 5 && !this.nearSaid) { this.nearSaid = true; this.say('nearly', {}, 2); }
      if (d < FIND && Math.abs(P.pos.y - e.pos.y) < 1) {
        this.round++;
        this.nearSaid = false;
        sfx.pop?.(); buzz(20);
        e.dog.stopEmote();
        td.actions.sparkle(e.pos.clone().add(V(0, 0.6, 0)), 14);
        if (this.round >= ROUNDS) return 'win';
        this.say('found', { n: this.round, left: ROUNDS - this.round }, 3);
        this.next(1.6);
      }
    }
  }

  end() { this.e.dog.stopEmote(); }

  target() {
    if (this.phase !== 'hidden') return { pos: this.e.pos, emoji: '🙈', compass: false };
    return { pos: this.e.pos, emoji: '🙈', label: `🙈 ${this.name}?`, compass: this.near };
  }

  objective() {
    return { icon: '🙈', title: `Hide-and-seek with ${this.name} <b>${this.round}/${ROUNDS}</b>`, sub: 'Sniff her out! Hold 👃 to follow your nose. Listen for giggles!' };
  }

  get hint() { return this.phase === 'hidden' && flat(this.P.pos, this.e.pos) > 12 ? `Where’s ${this.name}? Sniff 👃 to find her!` : null; }
}

export default { Game: Hide };
