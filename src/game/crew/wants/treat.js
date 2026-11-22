import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { CARRYABLES } from '../../../entities/carryables.js';
import { freeSpot } from '../../../world/spots.js';
import { Game } from './base.js';
import { flat, lookAt, wet } from './common.js';

const TASTY = ['sausage', 'croissant', 'bun', 'burger', 'links']; // (anything tasty will do, really)
const ASKS = ['sausage', 'croissant', 'bun'];

/**
 * 🌭 A treat for Noodle: something tasty's turned up somewhere nearby (it twinkles). Grab it and bring it
 * back. (He's not fussy: bring him any treat at all, say a croissant from the bakery stall, and he'll take it.)
 */
class Treat extends Game {
  start() {
    const e = this.e, rng = new RNG(`treat:${Date.now()}`);
    this.kind = rng.pick(ASKS);
    let s = null;
    for (let i = 0; i < 20 && !s; i++) { const c = freeSpot(this.world, rng, e.pos.x, e.pos.z, 14, 34, { pad: 0.7 }); if (c && !wet(this.world, c.x, c.z)) s = c; }
    s ??= { x: e.pos.x + 10, z: e.pos.z };
    this.item = this.td.carry.add(this.kind, s.x, s.z, { job: 'pal' });
    this.say('ask', { treat: CARRYABLES[this.kind].name }, 4.5);
    this.remindT = 12;
  }

  get held() { const h = this.td.carry.held; return h && TASTY.includes(h.kind) ? h : null; }

  update(dt, P) {
    const e = this.e, td = this.td, d = flat(P.pos, e.pos);
    this.remindT -= dt;
    this.pose = { happy: this.held ? 1 : 0.7, sniff: !this.held && d > 8 };
    if (d < 9) lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
    else if (e.state !== 'back') this.td.move(e, e.home.x, e.home.z, 1.2, dt, { stop: 0.5 });
    // (The treat got gobbled up somewhere, or tidied away? Another turns up.)
    if (!this.held && !td.carry.items.includes(this.item)) {
      const s = freeSpot(this.world, new RNG(`treat2:${Date.now()}`), e.pos.x, e.pos.z, 10, 26, { pad: 0.7 });
      if (s) this.item = td.carry.add(this.kind, s.x, s.z, { job: 'pal' });
    }
    const h = this.held;
    if (h && d < 6 && !this.nearSaid) { this.nearSaid = true; this.say('nearly', { treat: h.def.name }, 2.4); }
    if (h && d < 2.1) {
      const other = h.kind !== this.kind;
      if (this.item !== h) td.carry.remove(this.item); // (brought him a different one: the first can go)
      td.carry.consume();
      sfx.chomp?.();
      this.wasOther = other;
      return 'win';
    }
    if (!h && d < 4 && this.remindT <= 0) { this.remindT = 14; this.say('remind', { treat: CARRYABLES[this.kind].name }, 3); }
  }

  end() { if (this.td.carry.held !== this.item) this.td.carry.remove(this.item); }

  target() {
    if (this.held) return { pos: this.e.pos, emoji: '🌭' };
    return { pos: this.item.pos, emoji: CARRYABLES[this.kind].emoji };
  }

  objective() {
    const what = `${CARRYABLES[this.kind].emoji} ${CARRYABLES[this.kind].name}`;
    return this.held
      ? { icon: '🌭', title: `Take the ${this.held.def.name} to ${this.name}!`, sub: 'He’s drooling already.' }
      : { icon: '🌭', title: `Find ${this.name} a ${what}`, sub: 'It’s somewhere nearby, twinkling. Grab it 🐾 and bring it back!' };
  }
}

export default { Game: Treat };
