import * as THREE from 'three';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { bakedMesh } from '../../../entities/shapes.js';
import { blocked } from '../../../world/spots.js';
import { Game } from './base.js';
import { V, flat, lookAt, clearLine, wet, inRect } from './common.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 3);
const SPEED = { zip: 4.3, willow: 4.6 }; // (your trot is 3.4, a gallop with zoomies 6.8: zoomies win it)
const SLOWER = 0.86;  // each time they win, a bit slower next time (everybody wins in the end)
const FLAG = 1.7;     // touch the flag this close
const HOME = 2.2;     // …and back over the line this close

/** A little red flag on a pole. */
function flagMesh(at) {
  return bakedMesh([
    [BOX, 0xe9e2d3, [0, 0.65, 0], [0, 0, 0], [0.05, 1.3, 0.05]],
    [CONE, 0xd9534f, [0.2, 1.12, 0], [0, 0, -Math.PI / 2], [0.14, 0.36, 0.03]],
  ], null, [at.x, 0, at.z]);
}

/**
 * 🏁 A race (Zip at the farm, Willow on the beach): round the flag and back. Woof when you're ready. If they win
 * they're off again whenever you woof, and a little slower each time, so you'll get them in the end.
 */
class Race extends Game {
  start() {
    const e = this.e;
    this.speed = SPEED[e.id] ?? 4.3;
    this.startAt = { x: e.home.x, z: e.home.z };
    this.flagAt = this.findFlag();
    this.flag = flagMesh(this.flagAt);
    this.td.scene.add(this.flag);
    this.phase = 'ready';
    this.t = 0;
    this.say('ask', {}, 4.5);
    this.remindT = 10;
  }

  /** Somewhere 14–30 m away in a straight, clear line (and in their own area, if they have one). */
  findFlag() {
    const e = this.e, w = this.world, A = e.home.area, s = this.startAt;
    for (const r of [28, 24, 20, 17, 14, 11]) {
      const a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i < 24; i++) {
        const a = a0 + (i / 24) * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        if (A && !inRect(A.rect, x, z, -2)) continue;
        if (blocked(w, x, z, 0.9) || wet(w, x, z) || !clearLine(w, s.x, s.z, x, z, 0.45)) continue;
        return { x, z };
      }
    }
    return { x: s.x + 8, z: s.z };
  }

  onBark(pos) {
    if (this.phase !== 'ready' || flat(pos, this.startAt) > 7) return;
    this.phase = 'count';
    this.t = 0;
    this.n = 3;
    this.say('ready', {}, 1.6);
  }

  update(dt, P) {
    const e = this.e, td = this.td, d = flat(P.pos, e.pos);
    this.t += dt;
    this.pose = { happy: 1 };
    if (this.phase === 'ready') { // waiting on the line for your woof
      if (td.move(e, this.startAt.x, this.startAt.z, 2.4, dt, { stop: 0.3 })) lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
      this.remindT -= dt;
      if (this.remindT <= 0 && d < 9) { this.remindT = 12; this.say('remind', {}, 2.6); }
      if (this.away(dt, this.startAt, 45, 20)) return 'stop';
      return;
    }
    if (this.phase === 'count') { // 3… 2… 1… GO!
      lookAt(e.dog.root, this.flagAt.x, this.flagAt.z, dt, 8);
      if (this.t >= 0.8) {
        this.t = 0;
        if (this.n > 0) { td.hud.float(`${this.n}…`, e.pos.clone().add(V(0, 1.2, 0)), 'xp'); sfx.pop?.(); this.n--; }
        else {
          td.hud.float('GO!', e.pos.clone().add(V(0, 1.3, 0)), 'xp');
          sfx.whistle?.(); buzz(30);
          this.phase = 'race'; this.t = 0;
          this.dogLeg = 0; this.youLeg = 0;
          this.taunted = false;
        }
      }
      return;
    }
    if (this.phase === 'race') {
      // Them: to the flag, round it, and back.
      if (this.dogLeg === 0) { if (td.move(e, this.flagAt.x, this.flagAt.z, this.speed, dt, { stop: 0.7, turn: 10 })) this.dogLeg = 1; }
      else if (td.move(e, this.startAt.x, this.startAt.z, this.speed, dt, { stop: 0.4, turn: 10 })) return this.over(false);
      // You: touch the flag, then back over the line.
      if (this.youLeg === 0 && flat(P.pos, this.flagAt) < FLAG) { this.youLeg = 1; sfx.pop?.(); buzz(15); td.hud.float('🚩 Now back!', P.pos.clone().add(V(0, 1.2, 0)), 'xp'); }
      if (this.youLeg === 1 && flat(P.pos, this.startAt) < HOME) return this.over(true);
      const ahead = this.dogLeg > this.youLeg || (this.dogLeg === this.youLeg && flat(e.pos, this.dogLeg ? this.startAt : this.flagAt) < flat(P.pos, this.dogLeg ? this.startAt : this.flagAt));
      if (!this.taunted && this.t > 3) { this.taunted = true; this.say(ahead ? 'lead' : 'behind', {}, 1.8); }
      if (this.t > 60) return 'stop';
      return;
    }
    if (this.phase === 'done') { // they won: a little gloat, then back to the line
      lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
      if (this.t > 1.5) { this.phase = 'ready'; this.t = 0; this.remindT = 8; }
    }
  }

  over(youWon) {
    if (youWon) return 'win';
    this.e.dog.emote('spin');
    this.say('iwon', {}, 3.2);
    this.speed *= SLOWER;
    this.phase = 'done';
    this.t = 0;
    return undefined;
  }

  end() { this.flag?.removeFromParent(); }

  target() {
    if (this.phase === 'race') return this.youLeg ? { pos: V(this.startAt.x, 0, this.startAt.z), emoji: '🏁', label: '🏁 Back!' } : { pos: V(this.flagAt.x, 0, this.flagAt.z), emoji: '🚩' };
    return { pos: V(this.startAt.x, 0, this.startAt.z), emoji: '🏁' };
  }

  objective() {
    if (this.phase === 'race') return { icon: '🏁', title: this.youLeg ? 'Back to the start! Go go go!' : 'Round the 🚩 flag and back!', sub: 'Zoomies! 💨' };
    return { icon: '🏁', title: `Race ${this.name} round the flag and back`, sub: 'Woof 🗣️ on the start line when you’re ready! (Fill up your zoomies first.)' };
  }

  get hint() {
    if (this.phase === 'ready') return flat(this.P.pos, this.startAt) < 7 ? 'Woof 🗣️ to start the race!' : `Back to ${this.name} to start the race 🏁`;
    return null;
  }
}

export default { Game: Race };
