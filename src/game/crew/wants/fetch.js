import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { CARRYABLES } from '../../../entities/carryables.js';
import { freeSpot } from '../../../world/spots.js';
import { Game } from './base.js';
import { V, flat, lookAt, wet } from './common.js';

const ROUNDS = 3;
const FLY = 0.85;
const RANGES = [[7, 11], [9, 14], [11, 17]];

/**
 * 🎾 Fetch (Bonnie, in the park): you can't throw, so she does. Off goes her ball; you fetch it back. Three times,
 * a bit further each time.
 */
class Fetch extends Game {
  start() {
    this.rng = new RNG(`fetch:${Date.now()}`);
    this.round = 0;
    this.say('ask', {}, 4);
    this.e.dog.hold(CARRYABLES.ball.build(), CARRYABLES.ball.hold);
    this.throwIt(2.2);
  }

  throwIt(wait) {
    const e = this.e, [r0, r1] = RANGES[Math.min(this.round, RANGES.length - 1)];
    let s = null;
    for (let i = 0; i < 20 && !s; i++) { const c = freeSpot(this.world, this.rng, e.pos.x, e.pos.z, r0, r1, { pad: 0.6 }); if (c && !wet(this.world, c.x, c.z)) s = c; }
    this.to = s ?? { x: e.pos.x + r0, z: e.pos.z };
    this.phase = 'throw';
    this.t = -wait;
    this.item = null;
  }

  update(dt, P) {
    const e = this.e, td = this.td, d = flat(P.pos, e.pos);
    this.t += dt;
    this.pose = { happy: 1 };
    if (this.phase === 'throw') {
      if (this.t < -0.5) { lookAt(e.dog.root, P.pos.x, P.pos.z, dt); return; }
      lookAt(e.dog.root, this.to.x, this.to.z, dt, 8);
      if (this.t < 0) return;
      if (!this.fly) { // a flick of the head, and off it goes
        this.fly = CARRYABLES.ball.build();
        e.dog.hold(null);
        this.from = e.pos.clone().add(V(Math.sin(e.dog.root.rotation.y) * 0.45, 0.55 * e.size, Math.cos(e.dog.root.rotation.y) * 0.45));
        td.scene.add(this.fly);
        this.say('throw', {}, 1.6);
        sfx.boink?.();
      }
      const k = Math.min(1, this.t / FLY);
      this.fly.position.set(this.from.x + (this.to.x - this.from.x) * k, this.from.y * (1 - k) + 0.04 + Math.sin(k * Math.PI) * 2, this.from.z + (this.to.z - this.from.z) * k);
      if (k < 1) return;
      this.fly.removeFromParent();
      this.fly = null;
      this.item = td.carry.add('ball', this.to.x, this.to.z, { job: 'pal' });
      this.item.hop = 0.6; // (a little bounce)
      sfx.boink?.();
      this.phase = 'fetch';
      this.t = 0;
      return;
    }
    const carry = td.carry, held = carry.held === this.item;
    if (!held && this.item && !carry.items.includes(this.item)) { this.throwIt(0.3); return; } // (gone somehow: she has a spare)
    lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
    this.pose = { happy: held ? 1 : 0.8 };
    if (held && d < 2.3) {
      carry.consume();
      e.dog.hold(CARRYABLES.ball.build(), CARRYABLES.ball.hold);
      sfx.pop?.(); buzz(15);
      this.round++;
      td.actions.sparkle(e.pos.clone().add(V(0, 0.7, 0)), 12);
      if (this.round >= ROUNDS) return 'win';
      this.say('good', { n: this.round }, 2.6);
      this.throwIt(2.4);
      return;
    }
    if (this.away(dt, e.pos, 50, 25)) return 'stop';
  }

  end() {
    this.fly?.removeFromParent();
    this.e.dog.hold(null);
    if (this.item && this.td.carry.held !== this.item) this.td.carry.remove(this.item);
  }

  target() {
    if (this.item && this.td.carry.held === this.item) return { pos: this.e.pos, emoji: '🎾' };
    return { pos: this.item?.pos ?? V(this.to.x, 0, this.to.z), emoji: '🎾' };
  }

  objective() {
    const held = this.item && this.td.carry.held === this.item;
    return held ? { icon: '🎾', title: `Bring the ball back to ${this.name}!`, sub: `${this.round}/${ROUNDS}` }
      : { icon: '🎾', title: `Fetch ${this.name}’s ball <b>${this.round}/${ROUNDS}</b>`, sub: 'Grab it 🐾 and bring it back!' };
  }
}

export default { Game: Fetch };
