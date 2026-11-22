import { flat } from './common.js';

/**
 * A town dog's game (see ../townDogs.js): what you do to make friends. td: the TownDogs, e: the dog playing.
 * update() returns 'win' (friends!), 'stop' (it fizzled out: no harm done, ask again later) or nothing.
 */
export class Game {
  constructor(td, e) {
    this.td = td;
    this.e = e;
    this.t = 0;
    this.awayT = 0;
  }

  get P() { return this.td.player; }
  get world() { return this.td.world; }
  get name() { return this.e.pal.name; }

  /** Say one of this dog's lines (see ../../lines/pals.js). */
  say(key, vars = {}, dur = 3.2) { this.td.say(this.e, this.td.line(this.e, key, vars), dur); }

  /** Wandered off? More than `r` from `at` for `secs` and the game's off (gently). */
  away(dt, at, r = 45, secs = 18) {
    this.awayT = flat(this.P.pos, at) > r ? this.awayT + dt : 0;
    return this.awayT > secs;
  }

  start() {}
  update() {}
  end() {}
  onBark() {}
  onDig() { return false; }

  /** Where the compass and the sniff trail point: { pos, emoji, label?, compass? }. */
  target() { return { pos: this.e.pos, emoji: this.td.emoji(this.e) }; }
  objective() { return { icon: this.td.emoji(this.e), title: `Play with ${this.name}`, sub: '' }; }
  get hint() { return null; }
}
