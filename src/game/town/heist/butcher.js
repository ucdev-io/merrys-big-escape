import * as THREE from 'three';
import { Lookout } from './lookout.js';
import { butcher as butcherPerson } from './people.js';
import { SausageString, STRING_LENGTH } from './links.js';
import { heistSfx } from './sounds.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { bakeParts } from '../../../entities/treats.js';
import { LINKS } from '../../heistRules.js';
import { BUTCHER, GETAWAY, TUG, SNEAKY, OOPS } from '../../lines/heists.js';
import { buzz } from '../../../core/haptics.js';
import { sfx } from '../../../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** The sausage machine's handle (it turns while the butcher's busy). */
function crank(c) {
  const g = new THREE.Group();
  g.position.set(c.x, c.y, c.z);
  g.rotation.y = c.ry;
  const arm = new THREE.Mesh(bakeParts([
    [new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), 0x8a8f96, [0.01, 0, 0], [0, 0, Math.PI / 2]],
    [new THREE.CapsuleGeometry(0.011, 0.11, 4, 8), 0x8a8f96, [0.035, 0.06, 0]],
    [new THREE.CapsuleGeometry(0.018, 0.04, 4, 10), 0x3a3a3a, [0.065, 0.12, 0], [0, 0, Math.PI / 2]],
  ]), paint(0xffffff, { vertexColors: true }));
  arm.castShadow = true;
  g.add(arm);
  g.userData.arm = arm;
  return g;
}

/**
 * 🌭 The butcher's sausages. A long string of them hangs on a rail outside his shop; grab the end
 * that dangles down while his back's turned and run: the whole string comes off and trails along
 * behind you. Another dog can grab the other end: TUG OF WAR. Running away (or mashing 🐾) decides
 * it — or it snaps, and it's half each. Get them home to your garden to bank them.
 *
 * The HeistRoom settles who's holding which end and how the tug goes; each game swings the string
 * between whoever's holding it (heist/links.js). The ends are carry.js items, so 🐾 grabs them.
 */
export class SausageHeist {
  constructor(H, data) {
    this.H = H;
    this.data = data;
    const person = butcherPerson();
    H.scene.add(person.root);
    this.L = H.lookouts.butcher = new Lookout({ hud: H.hud, person, pos: data.butcher, faces: { busy: data.busy, look: data.look }, zone: data.zone, work: 'crank' });
    this.L.site = {
      door: data.door, lines: BUTCHER, goods: () => (this.state.at === 'hook' ? this.string.end(0) : null),
      prompts: { busy: '🤫 His back’s turned… grab the sausages! 🐾', warn: '❗ He’s about to look round!', look: '👀 He’s watching! Wait for it…', door: '❓ He’s distracted… quick! 🐾', woof: '🗣️ Woof at the door to distract the butcher!' },
    };
    this.crank = crank(data.crank);
    H.scene.add(this.crank);
    this.string = new SausageString(H.scene, data.hooks);
    this.state = { at: 'hook', ends: [null, null], cut: false, banked: [false, false], tug: false };
    // The two ends: invisible handles at each end of the string, for 🐾 to grab (carry.js).
    this.items = [0, 1].map((e) => {
      const p = this.string.end(e), it = H.carry.add('links', p.x, p.z);
      it.obj.visible = false;
      it.links = { e };
      it.pulls = () => this.inTug;            // (the 🐾 button says "Pull")
      it.onPress = () => this.mash();         // (and in a tug of war, 🐾 pulls rather than drops)
      return it;
    });
    this.mouths = [V(0, 0, 0), V(0, 0, 0)]; // where each end is being held this frame
    this.m = 0;          // the tug meter (-1…1: + is end 0 winning)
    this.pullT = 0;
    this.mashes = 0;
    this.crankT = 0;
    this.meter = document.createElement('div');
    this.meter.className = 'tug-meter hidden';
    this.meter.innerHTML = '<div class="tug-text">🌭 Tug of war! Run away, or mash 🐾</div><div class="tug-bar"><i></i></div>';
    H.hud.root.appendChild(this.meter);
    this.sync();
  }

  send(msg) { this.H.send(msg); }
  /** Which end our dog has (0 or 1), or -1. */
  get myEnd() { return this.state.at === 'out' ? this.state.ends.indexOf(this.H.me()) : -1; }
  get inTug() { return this.state.tug && !this.state.cut && this.myEnd >= 0; }
  near(r) { return flat(this.H.player.pos, this.L.pos) < r; }
  say(text, dur = 3, cls = '') { this.H.say(this.L, text, dur, cls); }

  // ---------- the room says… ----------

  adopt(links) {
    if (!links) return;
    if (this.H.carry.held?.links) { this.H.carry.remove(this.H.carry.held); this.H.lastHeld = this.H.carry.held; }
    this.onLinks({ ...links, ev: 'state' });
  }

  onLinks(m) {
    const H = this.H, me = H.me(), S = this.state, mid = this.string.p[LINKS.half].clone();
    this.pending = false;
    const had = this.myEnd;
    Object.assign(S, { at: m.at, ends: [...m.ends], cut: m.cut, banked: [...m.banked], tug: m.tug });
    const involved = S.ends.includes(me) || m.by === me || m.loser === me;
    switch (m.ev) {
      case 'nope': H.hud.float('Too slow!', H.actions.anchor()); break;
      case 'unhook': if (m.by !== me && this.near(20)) H.hud.float('😮', this.L.top(0.2)); break;
      case 'tug': {
        if (involved) { buzz([30, 30, 30]); heistSfx.hmm(); }
        for (const id of S.ends) { const at = this.dogTop(id); if (at) H.hud.float(H.line('tug', TUG), at, 'xp'); }
        if (this.near(14)) this.say(`😲 ${H.line('butcher-tug', BUTCHER.tug)}`, 2.6);
        break;
      }
      case 'won':
        if (m.by === me) { heistSfx.getaway(); buzz([20, 30, 60]); H.hud.showToastRaw('💪', 'You won the tug of war!', 'All the sausages are yours. Now get them home!'); }
        else if (m.loser === me) { heistSfx.wahwah(); H.hud.float('Whoops! It slipped!', H.actions.anchor()); }
        break;
      case 'letgo': if (S.ends.includes(me)) H.hud.float('They let go! All yours!', H.actions.anchor(), 'xp'); break;
      case 'snap':
        heistSfx.snap();
        buzz(involved ? [60, 20, 60] : 20);
        H.hud.float('💥 SNAP!', mid.setY(mid.y + 0.6), 'xp');
        if (involved) H.hud.showToastRaw('🌭', 'SNAP! Half each!', 'Five sausages for you. Get them home!');
        break;
      case 'caught':
        this.L.shout();
        if (this.near(30)) { this.say(`😠 ${H.line('butcher-caught', BUTCHER.caught)}`, 3, 'angry'); sfx.shout?.(); }
        if (m.by === me || had >= 0) { heistSfx.wahwah(); buzz([60, 40, 60]); H.hud.float(H.line('oops', OOPS), H.actions.anchor()); }
        break;
      case 'bank':
        if (m.by === me) this.banked(m.n, m.e);
        else H.othersHeist(m.by, '🌭', m.n < LINKS.n ? 'half a string of sausages' : 'a whole string of sausages');
        if (m.helper === me && m.by !== me) H.teamHeist(m.by, 'the butcher', 'the sausages');
        break;
      case 'tidy': if (this.near(24)) this.say(`😤 ${H.line('butcher-tidy', BUTCHER.tidy)}`); break;
      case 'restock': this.L.noticed = false; if (this.near(24)) { heistSfx.ding(); this.say(`😊 ${H.line('butcher-restock', BUTCHER.restock)}`); } break;
    }
    if (!S.tug) this.m = 0;
    this.sync();
  }

  onTug(m) { this.m = Math.max(-1, Math.min(1, Number(m.m) || 0)); }

  /** Make the string and its two handles match the state. */
  sync() {
    const S = this.state, me = this.H.me(), C = this.H.carry;
    if (S.at === 'hook') { if (!this.string.onHook) this.string.hang(); } else this.string.unhook();
    this.string.setCut(S.cut, S.at === 'gone' ? [true, true] : S.banked);
    for (const it of this.items) {
      const e = it.links.e, mine = S.at === 'out' && S.ends[e] === me;
      if (C.held === it && !mine) { C.remove(it); this.H.lastHeld = C.held; } // (we lost it: the tug, the butcher…)
      const free = S.at === 'hook' ? e === 0 : S.at === 'out' && S.ends[e] === null && !S.banked[e];
      this.list(it, free && C.held !== it);
    }
  }

  /** A handle lies at the end of the string ready to be grabbed, or doesn't. */
  list(it, on) {
    const C = this.H.carry, listed = C.items.includes(it), scene = this.H.scene;
    if (on && !listed) C.items.push(it);
    if (!on && listed) C.items.splice(C.items.indexOf(it), 1);
    if (on && it.obj.parent !== scene) scene.add(it.obj);
    if (!on && it.obj.parent === scene) scene.remove(it.obj);
    if (on) it.obj.visible = false;
  }

  // ---------- our dog ----------

  /** Our dog just grabbed or let go of an end (🐾, a woof…): tell the room. */
  watch(held, last) {
    const S = this.state, me = this.H.me(), C = this.H.carry;
    if (last?.links && C.items.includes(last)) {
      const e = last.links.e;
      last.obj.visible = false;
      if (S.ends[e] === me) { S.ends[e] = null; S.tug = false; this.send({ a: 'ldrop', e }); }
    }
    if (held?.links) {
      const e = held.links.e, off = S.at === 'hook';
      if (off) this.H.onNaughty?.(); // (the whole string, off the butcher's rail!)
      held.obj.visible = true;
      S.ends[e] = me; S.at = 'out'; // (we'll hear if someone beat us to it)
      this.string.unhook();
      this.send({ a: 'lgrab', e });
      if (off && !(this.L.watching && this.L.inZone(this.H.player.pos))) { heistSfx.sneak(); this.H.hud.float(this.H.line('sneaky', SNEAKY), this.H.actions.anchor(), 'sniff'); }
    }
  }

  /** Holding the sausages where the butcher can see? Caught! Home? Got away with it! */
  check(P) {
    const it = this.H.carry.held;
    if (!it?.links || this.pending) return;
    if (this.L.watching && this.L.inZone(P)) { this.pending = true; this.send({ a: 'lcaught' }); return; }
    if (this.H.inHome(P)) { this.pending = true; this.send({ a: 'lbank', e: it.links.e }); }
  }

  /** Home with the sausages: into the bowl they go (stars, and a heist). */
  banked(n, e) {
    const H = this.H, half = n < LINKS.n, to = H.stash();
    if (to) H.fly('coil', this.string.end(e).clone(), to.clone().setY(0.12), 1.4, (m) => H.addToPile(m));
    H.reward(half ? 15 : 30, half ? 'Half the sausages!' : 'Sausage heist!', '🌭', half ? 'Got away with half the sausages!' : 'Got away with ALL the sausages!', H.line(half ? 'get-half' : 'get-links', half ? GETAWAY.half : GETAWAY.links));
  }

  /** 🐾 with an end in your mouth: in a tug of war, that's a pull (not a drop). */
  mash() {
    if (!this.inTug) return false;
    this.mashes++;
    buzz(10);
    if (Math.random() < 0.3) this.H.hud.float(this.H.line('tug', TUG), this.H.actions.anchor(), 'xp');
    return true;
  }

  dogTop(id) {
    const dog = id === this.H.me() ? this.H.player.dog : this.H.remotes.get(id)?.dog;
    return dog ? dog.root.position.clone().add(V(0, 1.1, 0)) : null;
  }

  // ---------- per frame ----------

  update(dt, P, canAct) {
    const S = this.state, me = this.H.me();
    // Each end that's being held follows its dog's mouth; the rest of the string swings along behind.
    for (const e of [0, 1]) {
      const who = S.at === 'out' ? S.ends[e] : null;
      const dog = who === null ? null : who === me ? this.H.player.dog : this.H.remotes.get(who)?.dog;
      const ok = !!dog && (who === me || dog.root.visible);
      if (ok) dog.mouth.getWorldPosition(this.mouths[e]);
      this.string.hold(e, ok ? this.mouths[e] : null);
    }
    this.string.update(dt);
    for (const it of this.items) {
      if (!this.H.carry.items.includes(it)) continue;
      const p = this.string.end(it.links.e);
      it.obj.position.set(p.x, Math.max(0.02, p.y), p.z);
    }
    // His sausage machine goes round while he's busy (squelch, squelch).
    if (this.L.s === 'busy') {
      this.crank.userData.arm.rotation.x -= dt * 6;
      this.crankT -= dt;
      if (this.crankT <= 0) { this.crankT = 1.05; if (this.near(12)) heistSfx.crank(); }
    }
    this.tug(dt, P, canAct);
  }

  /** In a tug of war: send our pulls (running away, mashing 🐾), get dragged about, show the meter. */
  tug(dt, P, canAct) {
    const on = this.inTug && canAct;
    this.meter.classList.toggle('hidden', !on);
    if (!on) { this.mashes = 0; return; }
    const e = this.myEnd, other = this.H.remotes.get(this.state.ends[1 - e])?.dog.root;
    this.meter.querySelector('i').style.width = `${Math.round(50 + (e === 0 ? this.m : -this.m) * 50)}%`;
    if (!other?.visible) return;
    const o = other.position, dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz) || 1;
    this.pullT -= dt;
    if (this.pullT <= 0) {
      this.pullT = 0.2;
      const v = this.H.player.vel, away = Math.max(0, (v.x * dx + v.y * dz) / d);
      const n = Math.min(4, Math.round(away / 1.7) + this.mashes * 1.5);
      this.mashes = 0;
      if (n > 0) this.send({ a: 'tug', n });
    }
    // The string's taut: you can't just run off, you drag each other about (each game moves its own dog).
    const max = STRING_LENGTH * 0.92;
    if (d > max) { const k = (d - max) * 0.5 * (1 - Math.exp(-dt * 10)); P.x -= (dx / d) * k; P.z -= (dz / d) * k; }
  }

  /** The prompt line when you've got hold of the sausages. */
  prompt(P) {
    const L = this.L;
    if (this.inTug) return '🌭 Tug of war! Run away, or mash 🐾!';
    if (L.inZone(P)) return L.s === 'look' ? '👀 Uh-oh…' : L.s === 'warn' ? '❗ Quick! Run for it!' : '🏃 Leg it with the sausages!';
    return '🏠 Drag the sausages home to your garden!';
  }
}
