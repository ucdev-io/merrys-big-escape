import { sfx } from '../../../core/audio.js';
import { Game } from './base.js';
import { flat, lookAt, turnTo } from './common.js';
import { ring } from '../homes.js';

const PACE = 3.1;    // a bit slower than your trot (3.4)…
const BURST = 5.4;   // …but a dash when you get close
const CATCH = 1.35;  // this close: caught! (a lunge)
const TIRE = 45;     // he tires over this long: slower, and longer, more frequent puffs (so everybody catches him in the end)
const TIME = 75;     // then he's too puffed to go on (and so are you)

/**
 * 💨 Catch Sprout (round the pavements of a block near home): he's tiny and quick, and darts off whichever
 * way round the block takes him away from you. He has to stop for a puff now and then: that's your chance.
 */
class Chase extends Game {
  start() {
    this.phase = 'ready';
    this.t = -1.4;
    this.burstT = 0;
    this.burstCD = 0;
    this.puffIn = 5 + Math.random() * 2;
    this.puffT = 0;
    this.flipCD = 0;
    this.e.dir ??= this.e.home.dir ?? 1;
    this.say('ask', {}, 3.2);
    sfx.bark?.(2, 0.5);
  }

  update(dt, P) {
    const e = this.e, h = e.home, d = flat(P.pos, e.pos);
    this.t += dt;
    this.pose = { happy: 1 };
    if (this.phase === 'ready') { // (and he's off! A zoom away first, so there's a chase)
      lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
      if (this.t >= 0) { this.phase = 'run'; this.t = 0; this.burstT = 1.3; this.burstCD = 3; this.td.hud.float('zoom!', e.pos.clone().setY(0.9), 'sniff'); }
      return;
    }
    if (this.t > 1 && d < CATCH + 0.25 * e.size && Math.abs(P.pos.y - e.pos.y) < 1) return 'win';
    if (this.t > TIME || this.away(dt, e.pos, 40, 10)) return 'stop';
    if (!h.block) return; // (no streets here: he just bounces about)
    // Which way round the block gets him away from you?
    this.flipCD -= dt;
    const fwd = ring(h.block, e.s + 2 * e.dir), back = ring(h.block, e.s - 2 * e.dir);
    if (this.flipCD <= 0 && flat(back, P.pos) > flat(fwd, P.pos) + 1.2) { e.dir = -e.dir; this.flipCD = 1.4; }
    // A puff now and then; a dash when you're right behind him.
    this.puffIn -= dt; this.burstCD -= dt; this.burstT -= dt;
    if (this.puffT > 0) {
      this.puffT -= dt;
      lookAt(e.dog.root, P.pos.x, P.pos.z, dt, 6);
      if (d < 2.4 && this.puffT > 0.8) this.puffT = 0.8; // (you're nearly on him: pounce, quick, before his last dash!)
      return;
    }
    const tired = Math.min(1, this.t / TIRE);
    if (this.puffIn <= 0) { this.puffIn = 4.5 - 1.8 * tired + Math.random() * 2.5; this.puffT = 1.8 + 1.2 * tired; this.say('puff', {}, 1.8); return; }
    if (d < 2.6 && this.burstCD <= 0) { this.burstT = 0.8; this.burstCD = 2.6; this.td.hud.float('zoom!', e.pos.clone().setY(0.9), 'sniff'); }
    if (d < 6 && Math.random() < dt * 0.25) this.say('during', {}, 2);
    const v = this.burstT > 0 ? BURST * (1 - 0.15 * tired) : PACE * (1 - 0.22 * tired) * (d > 14 ? 0.7 : 1); // (waits for you a bit if you're miles behind)
    e.s += v * dt * e.dir;
    const r = ring(h.block, e.s, e.dir);
    e.pos.x = r.x; e.pos.z = r.z;
    turnTo(e.dog.root, r.heading, dt, 12);
  }

  objective() {
    return { icon: '💨', title: `Catch ${this.name}!`, sub: 'He’s quick! Zoomies help 💨, and he has to stop for a puff now and then.' };
  }

  target() { return { pos: this.e.pos, emoji: '💨' }; }

  get hint() { return this.phase === 'run' && this.puffT > 0 ? `${this.name}’s puffed out: get him! 🐾` : null; }
}

/** His day: trotting round the block's pavement, a sniff at every lamp post. */
function idle(td, e, dt, P, d) {
  const h = e.home;
  if (!h.block) return false;
  e.s ??= h.s; e.dir ??= h.dir ?? 1;
  if (d < 7) { lookAt(e.dog.root, P.pos.x, P.pos.z, dt, 5); return true; }
  e.stopT = (e.stopT ?? 0) - dt;
  if (e.stopT > 0) return true;
  if (Math.random() < dt * 0.08) { e.stopT = 1.5 + Math.random() * 2; e.sniffT = e.stopT; return true; }
  e.s += 1.5 * dt * e.dir;
  const r = ring(h.block, e.s, e.dir);
  e.pos.x = r.x; e.pos.z = r.z;
  turnTo(e.dog.root, r.heading, dt, 10);
  return true;
}

export default { Game: Chase, idle, askR: 3.6 };
