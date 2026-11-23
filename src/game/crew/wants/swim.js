import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { CARRYABLES } from '../../../entities/carryables.js';
import { waterAt } from '../../../world/water.js';
import { blocked } from '../../../world/spots.js';
import { Game } from './base.js';
import { V, flat, lookAt } from './common.js';

const ROUNDS = 2;
const FLY = 0.9; // seconds a flung stick is in the air

/**
 * 🪵 Barnaby's stick (Barnaby, by the pond): it's floating out on the pond and he does NOT do water. Swim out,
 * grab it, bring it back. Then he flings it in again (by accident, he says). Twice. On a frozen pond the stick's
 * out on the ice instead.
 */
class Swim extends Game {
  start() {
    this.pond = this.e.home.pond ?? this.world.water?.find((w) => w.kind === 'pond');
    this.rng = new RNG(`swim:${Date.now()}`);
    this.round = 0;
    this.say('ask', {}, 4.5);
    this.throwIt(1.2);
  }

  /** A spot out on the pond (not right at the edge). */
  spot() {
    const p = this.pond;
    if (!p) return { x: this.e.pos.x + 3, z: this.e.pos.z };
    const a0 = Math.atan2(this.e.pos.z - p.z, this.e.pos.x - p.x);
    for (let i = 0; i < 30; i++) {
      const a = a0 + this.rng.float(-0.9, 0.9), k = this.rng.float(0.35, 0.7);
      const x = p.x + Math.cos(a) * p.rx * k, z = p.z + Math.sin(a) * p.rz * k;
      if (waterAt(this.world.water, x, z, true)) return { x, z };
    }
    return { x: p.x, z: p.z };
  }

  /** In goes the stick: off his nose, in a big arc, after `wait`. */
  throwIt(wait = 0.4) {
    this.phase = 'throw';
    this.t = -wait;
    this.to = this.spot();
    this.from = this.e.pos.clone().add(V(Math.sin(this.e.dog.root.rotation.y) * 0.5, 0.6 * this.e.size, Math.cos(this.e.dog.root.rotation.y) * 0.5));
    this.fly = CARRYABLES.stick.build();
    this.fly.visible = false;
    this.td.scene.add(this.fly);
    this.item = null;
  }

  surface() { const p = this.pond; return p ? (p.frozen ? (p.iceTop ?? 0.1) : p.surface) : 0.05; }

  update(dt, P) {
    const e = this.e, td = this.td, d = flat(P.pos, e.pos);
    this.t += dt;
    this.pose = { happy: 1 };
    if (this.phase === 'throw') {
      lookAt(e.dog.root, this.to.x, this.to.z, dt, 6);
      if (this.t < 0) return;
      const k = Math.min(1, this.t / FLY), y0 = this.from.y, y1 = this.surface();
      this.fly.visible = true;
      this.fly.position.set(this.from.x + (this.to.x - this.from.x) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 2.2, this.from.z + (this.to.z - this.from.z) * k);
      this.fly.rotation.set(k * 9, k * 4, 0);
      if (k < 1) return;
      this.fly.removeFromParent();
      this.item = td.carry.add('stick', this.to.x, this.to.z, { job: 'pal' });
      this.item.pos.y = y1;
      this.item.floats = true;
      if (!this.pond?.frozen) { sfx.splash?.(0.5); td.actions.waterFx?.ring?.(this.item.pos, y1, 0.8); }
      this.phase = 'fetch';
      this.t = 0;
      this.cheerT = 3;
      return;
    }
    // Fetching: it bobs on the water till somebody grabs it.
    const carry = td.carry, held = carry.held === this.item;
    if (!held && this.item && carry.items.includes(this.item) && this.pond && waterAt(this.world.water, this.item.pos.x, this.item.pos.z, true)) {
      this.item.pos.y = this.surface() + (this.pond.frozen ? 0.01 : Math.sin(this.t * 2.3) * 0.02);
    }
    if (!held && this.item && !carry.items.includes(this.item)) { this.throwIt(0.3); return; } // (it's gone somehow: another stick)
    // He paces up and down the bank (never in).
    if (d > 2.5) {
      const near = this.bank(P);
      td.move(e, near.x, near.z, 1.6, dt, { stop: 0.4 });
      if (flat(e.pos, near) < 0.5) lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
    } else lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
    this.cheerT -= dt;
    if (P.swim > 0.4 && this.cheerT <= 0 && d < 30) { this.cheerT = 7; this.say(held ? 'nearly' : 'cheer', {}, 2.4); }
    if (held && d < 2.4) {
      carry.consume();
      sfx.pop?.();
      this.round++;
      td.actions.sparkle(e.pos.clone().add(V(0, 0.7, 0)), 12);
      if (this.round >= ROUNDS) return 'win';
      this.say('again', {}, 3.5);
      this.throwIt(2.2);
    }
    if (this.away(dt, e.pos, 50, 25)) return 'stop';
  }

  /** The bit of bank nearest the dog in the water (within a few steps of home: he doesn't go far). */
  bank(P) {
    const h = this.e.home, p = this.pond;
    if (!p) return h;
    const a = Math.atan2(P.pos.z - p.z, P.pos.x - p.x), ah = Math.atan2(h.z - p.z, h.x - p.x);
    const da = Math.atan2(Math.sin(a - ah), Math.cos(a - ah)), aa = ah + Math.max(-0.5, Math.min(0.5, da));
    const s = { x: p.x + Math.cos(aa) * (p.rx + 1.6), z: p.z + Math.sin(aa) * (p.rz + 1.6) };
    return blocked(this.world, s.x, s.z, 0.5) ? h : s;
  }

  end() {
    this.fly?.removeFromParent();
    if (this.item && this.td.carry.held !== this.item) this.td.carry.remove(this.item);
  }

  target() {
    if (this.td.carry.held === this.item && this.item) return { pos: this.e.pos, emoji: '🐻' };
    return { pos: this.item?.pos ?? this.to, emoji: '🪵', mark: !!this.item };
  }

  objective() {
    const held = this.item && this.td.carry.held === this.item;
    return held
      ? { icon: '🪵', title: `Take the stick back to ${this.name}!`, sub: `${this.round}/${ROUNDS} · he’s waiting on the bank.`, short: `↩ ${this.td.emoji(this.e)}` }
      : { icon: '🪵', title: `Fetch ${this.name}’s stick <b>${this.round}/${ROUNDS}</b>`, sub: this.pond?.frozen ? 'It’s out on the ice! Grab it 🐾' : 'It’s floating on the pond. Swim out and grab it 🐾!' };
  }
}

export default { Game: Swim };
