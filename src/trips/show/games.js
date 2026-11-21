import * as THREE from 'three';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { music } from '../../core/music.js';
import { CARRYABLES } from '../../entities/carryables.js';
import { TrickBar, TRICKS } from './ui.js';

/*
 * 🏆 Three of the dog show's rings (the fourth, agility, is ./agility.js). Each is a round with a score, and the
 * chapter (./index.js) turns the score into a rosette:
 *   🎀 TrickRound  the judge calls out tricks in time with the band; do the one she calls (quick is best).
 *   👃 SeekRound   a toy's hidden in the sniffing garden; hold sniff for warmer or colder, 🐾 where it is.
 *   🥏 Frisbee     Ruby throws, you catch (a leap in the air counts double), and bring it back. Ten throws.
 * ch (the chapter) gives: hud, player, input, actions, O (the trip's middle), say(text, at, secs), at(x, z, y) (a spot, into the world), local(), scene.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const lerpColor = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ======================================================================= 🎀 the show ring

const CALLS = 8;
export class TrickRound {
  constructor(ch, { judge, mark }) {
    Object.assign(this, { ch, judge, mark });
    this.t = 0;
    this.score = 0;
    this.n = 0;          // tricks called so far
    this.cur = null;     // { id, at, done }
    const nb = music.nextBeat();
    this.beat = nb?.beat ?? 60 / 112;
    this.next = (nb?.in ?? 0) + this.beat * 4; // (a bar to get ready: "Ready? Steady…")
    this.bar = new TrickBar(ch.hud.root, (id) => ch.input.touchButtons.add(`emote:${id}!`));
    this.bar.say('Ready?', true);
    this.last = null;
    this.over = false;
    ch.say('Ready? Do the trick I call!', this.judgeHead(), 2.2);
    sfx.whistle?.();
  }

  judgeHead() { return (this._jh ??= () => this.judge.root.position.clone().add(V(0, 2.05, 0))); } // (one anchor: a new line replaces the last)

  /** Every frame: the next call on the beat; her trick (P.emoted) checked against it. Returns the score when it's over. */
  update(dt) {
    const P = this.ch.player;
    this.t += dt;
    if (!this.cur && this.n === 0 && this.t > this.next - this.beat * 2 && !this.steady) { this.steady = true; this.bar.say('Steady…', true); }
    // A trick! (Right or wrong, she does it: friends see it, and it's still a lovely trick.)
    if (P.emoted && this.cur && !this.cur.done) {
      const good = P.emoted === this.cur.id, quick = this.t - this.cur.at < Math.max(1.4, this.beat * 2.6);
      this.bar.flash(P.emoted, good);
      if (good) {
        this.cur.done = true;
        const pts = quick ? 2 : 1;
        this.score += pts;
        this.ch.hud.float(quick ? 'Perfect! ✨' : 'Lovely!', this.ch.actions.anchor(), 'xp');
        if (quick) sfx.spark?.(); else sfx.pop?.();
        buzz(15);
        this.judge.wave = 0.6;
      } else if (!this.cur.oops) {
        this.cur.oops = true;
        this.ch.hud.float(`That’s ${TRICKS[P.emoted].emoji} ${TRICKS[P.emoted].short.toLowerCase()}! 😄`, this.ch.actions.anchor());
      }
    }
    if (this.t >= this.next) {
      if (this.cur && !this.cur.done) this.ch.hud.float('Never mind!', this.ch.actions.anchor());
      if (this.n >= CALLS) { this.finish(); return this.score; }
      // The next call (a different trick from the last), on the beat; they come a little quicker in the second half.
      const id = pick(Object.keys(TRICKS).filter((k) => k !== this.last));
      this.last = id;
      this.cur = { id, at: this.t, done: false };
      this.n++;
      this.next += this.beat * (this.n < CALLS / 2 ? 5 : 4);
      const T = TRICKS[id];
      this.bar.say(`${T.emoji} ${T.call}`);
      this.ch.say(`${T.emoji} ${T.call}`, this.judgeHead(), Math.min(2, this.beat * 3.6));
      sfx.clack?.();
    }
    this.bar.score(`${Math.max(1, this.n)}/${CALLS} · ⭐ ${this.score}`);
    // Wandered off out of the ring: that's the round over (no fuss).
    if (flat(P.pos, this.ch.at(this.mark.x, this.mark.z)) > 9) { this.finish(); return -1; }
    return null;
  }

  /** The prompt while it's on. */
  hint() { return `🎀 Trick ${Math.max(1, this.n)}/${CALLS} · ⭐ ${this.score}`; }

  finish() { this.over = true; this.bar.remove(); }
  dispose() { if (!this.over) this.finish(); }
}
export const TRICK_MAX = CALLS * 2;

// ======================================================================= 👃 sniff & seek

const SEEK_SECS = 75;
const TOYS = ['squeaky', 'ball', 'rubberduck', 'bone', 'teddy'];
export class SeekRound {
  constructor(ch, { hides, master, area }) {
    Object.assign(this, { ch, hides, master, area });
    this.t = SEEK_SECS;
    this.found = 0;
    this.spot = null;
    this.feelT = 0;
    this.prevD = null;
    this.popping = [];
    this.over = false;
    this.hide(true);
    ch.say('Ooh, a sniffer! The toy’s in the garden. Hold sniff: warmer or colder?', () => master.root.position.clone().add(V(0, 2.05, 0)), 3.2);
    sfx.whistle?.();
  }

  /** Tuck the toy away somewhere new (not where it was, and not right by her). */
  hide(first = false) {
    const l = this.ch.local(), was = this.spot;
    const far = this.hides.filter((h) => h !== was && Math.hypot(h.x - l.x, h.z - l.z) > (first ? 3 : 6));
    this.spot = pick(far.length ? far : this.hides.filter((h) => h !== was));
    this.kind = pick(TOYS);
    this.prevD = null;
  }

  /** How far her nose is from the toy's hiding place (from its edge). */
  dist(nose) { const s = this.spot; return Math.max(0, Math.hypot(nose.x - this.ch.O.x - s.x, nose.z - this.ch.O.z - s.z) - s.r); }

  /** The hiding place her nose is at (if any). */
  at(nose) { return this.hides.find((h) => Math.hypot(nose.x - this.ch.O.x - h.x, nose.z - this.ch.O.z - h.z) < h.r + 0.85) ?? null; }

  update(dt, sniffing, nose) {
    const P = this.ch.player;
    this.t -= dt;
    // Sniffing: warmer or colder? (A word, the wisps' colour, a little tone, and her tail.)
    this.feelT -= dt;
    if (sniffing && this.feelT <= 0) {
      this.feelT = 0.55;
      const d = this.dist(nose), k = THREE.MathUtils.clamp(1 - d / 18, 0, 1);
      const word = d < 1.4 ? pick(['Hot! 🔥', 'Hot hot HOT! 🔥', 'It’s right here! 🔥'])
        : this.prevD !== null && d < this.prevD - 0.35 ? (k > 0.6 ? 'Warmer! 🔥' : 'Warmer!')
          : this.prevD !== null && d > this.prevD + 0.35 ? 'Colder… ❄️'
            : d < 5 ? 'Warm…' : d < 10 ? 'Hmm… cool' : 'Cold… ❄️';
      this.prevD = d;
      this.ch.hud.float(word, this.ch.actions.anchor(), k > 0.75 ? 'xp' : '');
      const col = k < 0.5 ? lerpColor(0x8fb8e8, 0xf6d06a, k * 2) : lerpColor(0xf6d06a, 0xe8543c, (k - 0.5) * 2);
      for (let i = 0; i < 2; i++) this.ch.actions.smellPuff(nose, col);
      sfx.warm?.(k);
      P.happy = 0.25 + 0.75 * k; // (her tail goes faster the closer she gets)
    }
    // Found toys pop up, spin, and fly off to the Sniff Master's basket.
    for (const p of this.popping) {
      p.t += dt;
      const k = Math.min(1, p.t / 1.1);
      p.obj.position.y = 0.1 + Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * 1.1;
      p.obj.rotation.y += dt * 8;
      if (k > 0.65) { const q = (k - 0.65) / 0.35; p.obj.position.lerp(p.to, q * 0.25); p.obj.scale.setScalar(Math.max(0.01, 1 - q)); }
    }
    for (const p of this.popping.filter((q) => q.t >= 1.1)) this.unpop(p);
    if (this.t <= 0) { this.finish(); return this.found; }
    const l = this.ch.local(), A = this.area;
    if (l.x < A.x0 - 12 || l.x > A.x1 + 12 || l.z < A.z0 - 12 || l.z > A.z1 + 12) { this.finish(); return this.found || -1; } // (wandered off: what she found still counts)
    return null;
  }

  /** 🐾 at a hiding place: is it here? */
  dig(nose) {
    const h = this.at(nose);
    if (!h) return false;
    if (h !== this.spot) {
      this.ch.hud.float(pick(['Not in here… keep sniffing!', 'Nope! Sniff again 👃', 'Just a bit of straw…']), this.ch.actions.anchor());
      this.ch.actions.dirtBurst(nose.clone().setY(0.02), 4);
      return true;
    }
    this.found++;
    sfx.found?.();
    buzz([20, 30, 20]);
    const def = CARRYABLES[this.kind], obj = def.build();
    obj.position.copy(this.ch.at(h.x, h.z, 0.1));
    this.ch.scene.add(obj);
    this.popping.push({ obj, t: 0, to: this.master.root.position.clone().add(V(0, 1.0, 0)) });
    this.ch.actions.sparkle(obj.position.clone().add(V(0, 0.4, 0)), 18);
    this.ch.hud.float(`Found it! ${def.emoji}`, this.ch.actions.anchor(), 'xp');
    this.ch.onSeekFind?.(this.kind);
    this.hide();
    return true;
  }

  unpop(p) { p.obj.removeFromParent(); p.obj.traverse((o) => o.geometry?.dispose()); this.popping = this.popping.filter((q) => q !== p); }

  hint(nose) {
    const h = this.at(nose);
    return h ? '🐾 Is it in here?' : `👃 Hold sniff: warmer or colder? · ⏱️ ${Math.ceil(this.t)} · ${this.found} found`;
  }

  finish() { this.over = true; this.ch.player.happy = 0.5; }
  dispose() { for (const p of [...this.popping]) this.unpop(p); this.finish(); }
}
export const SEEK_TIME = SEEK_SECS;

// ======================================================================= 🥏 frisbee with Ruby

const THROWS = 10;
const GLIDE = 0.42; // (how high it's still floating at the end of a throw, before it flutters down)
export class Frisbee {
  constructor(ch, { kid, field, disc }) {
    Object.assign(this, { ch, kid, field, disc });
    this.throws = 0;
    this.points = 0;
    this.catches = 0;
    this.state = 'ready';
    this.t = 1.4;
    this.throwT = 0;
    this.over = false;
    disc.visible = false;
    ch.say('Yay! Run out and I’ll throw it!', this.kidHead(), 2.4);
  }

  kidHead() { return (this._kh ??= () => this.kid.root.position.clone().add(V(0, 1.45, 0))); } // (one anchor: a new line replaces the last)
  hand() { return this.kid.root.position.clone().add(V(Math.sin(this.kid.root.rotation.y) * 0.25, 1.15, Math.cos(this.kid.root.rotation.y) * 0.25)); }

  throw() {
    const P = this.ch.player, f = this.field, l = this.ch.local(), k = this.kid.root.position;
    // Out into the field, to somewhere she can get to in time: a little ahead of where she's going.
    const guess = 2.1, lead = 0.5 * guess;
    let x = l.x + P.vel.x * lead + (Math.random() - 0.5) * 3, z = l.z + P.vel.y * lead + (Math.random() - 0.5) * 3;
    x = THREE.MathUtils.clamp(x, f.x0 + 1, f.x1 - 1);
    z = THREE.MathUtils.clamp(z, f.z0 + 1, f.z1 - 0.5);
    const to = this.ch.at(x, z, GLIDE), from = this.hand(), d = flat(from, to);
    if (d < 6) { const dir = to.clone().sub(k).setY(0).normalize(); to.copy(k).addScaledVector(dir, 7).setY(GLIDE); }
    this.fly = { from, to, k: 0, dur: 1.5 + flat(from, to) * 0.07, H: 0.35 + Math.random() * 0.55, side: (Math.random() - 0.5) * 1.4, drop: 0 };
    this.disc.visible = true;
    this.disc.position.copy(from);
    this.state = 'flying';
    this.throws++;
    this.throwT = 0.35;
    sfx.whoosh?.();
    if (this.throws === 1 || Math.random() < 0.4) this.ch.say(pick(['Catch!', 'Here it comes!', 'Wheee!', 'Go on, catch it!']), this.kidHead(), 1.4);
  }

  update(dt) {
    const P = this.ch.player, kid = this.kid;
    this.t -= dt;
    // Ruby turns to watch her, and swings her arm when she throws.
    const kp = kid.root.position, want = Math.atan2(P.pos.x - kp.x, P.pos.z - kp.z);
    kid.root.rotation.y += Math.atan2(Math.sin(want - kid.root.rotation.y), Math.cos(want - kid.root.rotation.y)) * (1 - Math.exp(-dt * 4));
    kid.update(dt, 0);
    this.throwT = Math.max(0, this.throwT - dt);
    if (this.state === 'ready') kid.arms[1].rotation.x = -0.6;
    if (this.throwT > 0) kid.arms[1].rotation.x = -2.2 + (1 - this.throwT / 0.35) * 2.6;
    const near = flat(P.pos, kp);
    if (this.state === 'ready') {
      this.disc.visible = false;
      if (this.t <= 0 && (near > 4 || this.t < -3)) this.throw();
    } else if (this.state === 'flying') {
      const F = this.fly;
      F.k += dt / F.dur;
      const k = Math.min(1, F.k), d = this.disc.position;
      d.lerpVectors(F.from, F.to, k);
      const across = V(F.to.z - F.from.z, 0, -(F.to.x - F.from.x)).normalize();
      d.addScaledVector(across, Math.sin(k * Math.PI) * F.side); // (it curves a little, like a real one)
      d.y = F.from.y * (1 - k) + F.to.y * k + F.H * Math.sin(k * Math.PI);
      if (k >= 1) { F.drop += dt; d.y = Math.max(0.03, GLIDE - 4.5 * F.drop * F.drop); } // (the end of its glide: down it flutters)
      this.disc.rotation.set(0.15 * Math.sin(k * 6), this.disc.rotation.y + dt * 14, 0.2);
      // A catch? Her mouth near enough, or it's come down onto her (up in the air, it's a leaping catch).
      const mouth = P.dog.mouth.getWorldPosition(V(0, 0, 0)), hd = flat(P.pos, d);
      if (k > 0.12 && (mouth.distanceTo(d) < 0.7 || (hd < 0.6 && d.y > P.pos.y - 0.1 && d.y < P.pos.y + 0.9))) this.caught(P.pos.y > 0.25 || !P.grounded);
      else if (F.drop > 0.3) { this.state = 'missed'; this.t = 1.6; sfx.boink?.(); if (Math.random() < 0.6) this.ch.say(pick(['Aww, nearly!', 'Ooh, so close!', 'Next one!']), this.kidHead(), 1.4); }
    } else if (this.state === 'held') {
      if (near < 2.4) {
        P.dog.hold(null);
        this.disc.scale.setScalar(1);
        this.ch.scene.add(this.disc);
        this.disc.visible = false;
        if (this.throws >= THROWS) { this.finish(); return this.points; }
        this.state = 'ready';
        this.t = 0.7;
        this.kid.wave = 0.5;
        if (Math.random() < 0.5) this.ch.say(pick(['Good dog!', 'Again!', 'You’re so fast!']), this.kidHead(), 1.3);
      }
    } else if (this.state === 'missed') {
      if (this.t <= 0) {
        this.disc.visible = false;
        if (this.throws >= THROWS) { this.finish(); return this.points; }
        this.state = 'ready';
        this.t = 0.4;
      }
    }
    if (near > 26) { // (wandered off, even with the frisbee: that's the game over, and Ruby gets it back)
      if (this.state === 'held') this.ch.say('Can I have my frisbee back? Thank you!', this.kidHead(), 2);
      this.finish();
      return this.catches ? this.points : -1;
    }
    return null;
  }

  caught(leap) {
    const P = this.ch.player;
    const pts = leap ? 2 : 1;
    this.points += pts;
    this.catches++;
    this.state = 'held';
    P.dog.hold(this.disc, CARRYABLES.frisbee.hold);
    sfx.chomp?.();
    buzz(leap ? [20, 30, 30] : 20);
    this.ch.hud.float(leap ? 'Leaping catch! ⭐⭐' : 'Caught it! ⭐', this.ch.actions.anchor(), 'xp');
    if (leap) this.ch.actions.sparkle(P.pos.clone().add(V(0, 0.6, 0)), 14);
    this.ch.onCatch?.(leap);
  }

  hint() {
    if (this.state === 'held') return `🥏 Bring it back to Ruby! · ⭐ ${this.points}`;
    return `🥏 Throw ${Math.max(1, this.throws)}/${THROWS} · ⭐ ${this.points} · a leap in the air counts double!`;
  }

  /** (Also on leaving: she's not still holding it.) */
  finish() {
    this.over = true;
    const P = this.ch.player;
    if (this.disc.parent && this.disc.parent !== this.ch.scene && this.disc.parent !== this.ch.dyn) { P.dog.hold(null); this.disc.scale.setScalar(1); this.ch.scene.add(this.disc); }
    this.disc.visible = false;
  }
  dispose() { this.finish(); }
}
export const FRISBEE_MAX = THROWS * 2;
