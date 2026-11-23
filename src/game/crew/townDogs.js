import * as THREE from 'three';
import { Dog } from '../../entities/dog.js';
import { BREEDS } from '../../entities/breeds.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { LineBag, fill } from '../dialogue.js';
import { progress } from '../progress.js';
import { PAL_LINES, PAL_EMOJI, ANY } from '../lines/pals.js';
import { PALS, palBreed } from './roster.js';
import { pals } from './pals.js';
import { palHomes } from './homes.js';
import { WANTS } from './wants/index.js';
import { V, flat, wrap, stepTo, groundY, turnTo, lookAt } from './wants/common.js';

const FAR = 125;      // past the fog (it's all the way in by 120 m): not drawn, not moved
const NEAR = 45;      // further than this: posed a few times a second, no chatting
const SHADOW = 30;    // shadows only this close
const ASK = 3.4;      // walk up this close and they ask you to play
const STAR = 40;      // stars for a new pal

/*
 * 🐕 The town dogs (see ./roster.js), out and about in their own spots (./homes.js), each with a game to play
 * before they'll be friends (./wants/). Added to the town's friends, like Pepper: `job` is the game being played.
 * Walk up and they ask; win and they're your pal (pals.befriend), and the crew takes their dog over
 * (crew.welcome: into your crew, or home to your garden). Nobody ever loses: a game that fizzles out just ends,
 * and they'll ask again in a bit. Each player's town dogs are their own (like Gus and Duchess).
 */
export class TownDogs {
  constructor({ scene, world, hud, player, actions, friends, seed, dogName, crew }) {
    Object.assign(this, { scene, world, hud, player, actions, friends, seed, dogName, crew });
    this.carry = actions.carry;
    this.dogs = [];          // the town dogs out and about (not your pals yet)
    this.handed = new Set(); // pals handed over to the crew this visit
    this.game = null;        // the game being played (one at a time)
    this.job = null;         // …as a job for Friends (compass, objective)
    this.bags = new Map();
    this.time = 0;
    this.busy = () => false; // (the town sets this: a challenge on, the warden after you…)
    const avoid = [friends.gus?.pos, friends.duchess?.pos, friends.board?.pos].filter(Boolean);
    this.homes = palHomes(world, seed, PALS, avoid);
    for (const pal of PALS) WANTS[pal.want]?.setup?.(this, pal, this.homes[pal.id]);
    this.breedSeen = player.breedKey;
    this.sync();
    pals.onChange(() => this.sync());
  }

  // ---------- who's out and about ----------

  /** Everyone who isn't a pal yet is out at home; pals aren't (the crew has them). */
  sync() {
    for (const pal of PALS) {
      const e = this.dogs.find((q) => q.pal === pal);
      const want = !pals.isPal(pal.id) && !this.handed.has(pal.id);
      if (want && !e) this.add(pal);
      else if (!want && e && this.game?.e !== e && e.state !== 'party') this.remove(e);
    }
  }

  add(pal) {
    const h = this.homes[pal.id], key = palBreed(pal, this.player.breedKey);
    const dog = new Dog(key);
    dog.root.position.set(h.x, groundY(this.world, h.x, h.z), h.z);
    dog.root.rotation.y = h.face ?? 0;
    this.scene.add(dog.root);
    const casters = [];
    dog.root.traverse((o) => { if (o.isMesh && o.castShadow) casters.push(o); });
    const e = {
      pal, id: pal.id, key, dog, pos: dog.root.position, home: h, casters, size: BREEDS[key].size ?? 1,
      state: 'idle', talkT: 2 + Math.random() * 4, cool: 0, greeted: false, far: false, shade: true,
      wanderT: Math.random() * 4, to: null, sitT: 8 + Math.random() * 10, sniffT: 0, barkIn: 0, copyIn: 0, copyKind: null,
      lastX: h.x, lastZ: h.z, speed: 0, lastH: dog.root.rotation.y,
    };
    this.dogs.push(e);
    return e;
  }

  remove(e) {
    e.dog.root.removeFromParent();
    this.dogs = this.dogs.filter((q) => q !== e);
  }

  /** You changed breed in the lobby: nobody in town should be your twin. */
  retwin(mine) {
    this.breedSeen = mine;
    for (const e of [...this.dogs]) {
      if (palBreed(e.pal, mine) === e.key || this.game?.e === e || e.state === 'party') continue;
      const at = { x: e.pos.x, z: e.pos.z, h: e.dog.root.rotation.y };
      this.remove(e);
      const n = this.add(e.pal);
      n.pos.set(at.x, groundY(this.world, at.x, at.z), at.z);
      n.dog.root.rotation.y = at.h;
      Object.assign(n, { greeted: e.greeted, cool: e.cool, lastX: at.x, lastZ: at.z });
    }
  }

  /** A card open (a new pal, the menu…): nobody chats or starts a game behind it. */
  get carded() { return !this.hud.card.classList.contains('hidden'); }

  // ---------- talking ----------

  emoji(e) { return e.pal.emoji ?? PAL_EMOJI[e.id] ?? '🐶'; }

  line(e, key, vars = {}) {
    const list = PAL_LINES[e.id]?.[key] ?? ANY[key];
    if (!list?.length) return '';
    const k = `${e.id}:${key}`;
    if (!this.bags.has(k)) this.bags.set(k, new LineBag(list));
    return fill(this.bags.get(k).next(), { name: this.dogName(), pal: e.pal.name, ...vars });
  }

  /** A speech bubble over their head, with their name (there are a lot of dogs about). */
  say(e, text, dur = 3.2) {
    if (!text || this.carded) return; // (no chatting over a card)
    e.head ??= () => e.pos.clone().add(V(0, 0.95 * e.size + 0.2, 0)); // (the same anchor each time: a new line replaces their last one)
    this.hud.say(`${this.emoji(e)} <b>${e.pal.name}:</b> ${text}`, e.head, dur);
  }

  woof(e, vol = 0.6) {
    e.dog.bark();
    const d = flat(this.player.pos, e.pos);
    if (d < 40) sfx.bark(BREEDS[e.key]?.bark ?? 1, Math.max(0.15, vol * (1 - d / 40)));
  }

  // ---------- moving ----------

  /** Walk/run towards (x, z), veering round things. True once there. */
  move(e, x, z, speed, dt, { pad = 0.2, stop = 0.15, turn = 8 } = {}) {
    if (Math.hypot(x - e.pos.x, z - e.pos.z) <= stop) return true;
    const h = stepTo(this.world, e.pos, x, z, speed, dt, pad);
    if (h !== null) turnTo(e.dog.root, h, dt, turn);
    return Math.hypot(x - e.pos.x, z - e.pos.z) <= stop;
  }

  /** Pose the dog for this frame (its speed worked out from how far it moved). */
  animate(e, dt, { sniff = false, dig = false, happy = null } = {}) {
    const d = e.dog, root = d.root;
    if (!e.yFree) e.pos.y = groundY(this.world, e.pos.x, e.pos.z);
    const moved = Math.hypot(e.pos.x - e.lastX, e.pos.z - e.lastZ) / Math.max(dt, 1e-3);
    e.speed += (Math.min(moved, 9) - e.speed) * (1 - Math.exp(-dt * 10));
    e.lastX = e.pos.x; e.lastZ = e.pos.z;
    const turn = wrap(root.rotation.y - e.lastH) / Math.max(dt, 1e-3);
    e.lastH = root.rotation.y;
    if (e.speed > 0.6 && (d.emoteT ?? 0) > 0.25) d.stopEmote();
    d.update(dt, { speed: e.speed < 0.08 ? 0 : e.speed, turnRate: turn, sniff, dig, happy: happy ?? e.happy ?? 0.6, air: e.air ?? 0, vy: 0, swim: 0 });
  }

  /** Dogs are solid: you slide round them. */
  push(P, e) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz), r = 0.28 * e.size + (P.radius ?? 0.28);
    if (d < r && d > 1e-4 && P.pos.y < e.pos.y + 0.55 * e.size) { P.pos.x = e.pos.x + (dx / d) * r; P.pos.z = e.pos.z + (dz / d) * r; }
  }

  // ---------- per frame ----------

  update(dt, P, { canAct = true } = {}) {
    this.time += dt;
    if (P.breedKey !== this.breedSeen) this.retwin(P.breedKey);
    const g = this.game;
    for (const e of [...this.dogs]) {
      const d = flat(P.pos, e.pos), mine = g?.e === e;
      const far = d > FAR && !mine;
      if (far !== e.far) { e.far = far; e.dog.root.visible = !far && !e.hidden; }
      if (far) continue;
      const shade = d < SHADOW;
      if (shade !== e.shade) { e.shade = shade; for (const m of e.casters) m.castShadow = shade; }
      if (mine) continue; // (the game moves this one: below)
      if (d > NEAR && e.state !== 'party') { // out of earshot: just potter, a few times a second
        e.skip = (e.skip ?? 0) + dt;
        if (e.skip < 0.12) continue;
        this.idle(e, e.skip, P, false, d);
        e.skip = 0;
        continue;
      }
      this.idle(e, dt, P, canAct, d);
    }
    if (g) {
      // (Somebody else offered a job mid-game, say Sandy at the beach? It waits: the compass stays on this game.)
      if (this.job && this.friends.focus !== this.job) { this.friends.focus = this.job; this.friends.onChange?.(); }
      const r = g.update(dt, P, { canAct });
      if (this.game === g && g.e.dog.root.visible !== !g.e.hidden) g.e.dog.root.visible = !g.e.hidden;
      if (this.game === g) this.animate(g.e, dt, g.pose ?? {});
      if (r === 'win') this.win(g.e);
      else if (r === 'stop') this.stop();
    }
  }

  /** Not playing: pottering about at home, saying hello, asking for a game. */
  idle(e, dt, P, canAct, d) {
    const W = WANTS[e.pal.want];
    e.talkT -= dt; e.cool -= dt; e.sitT -= dt; e.sniffT -= dt;
    if (e.state === 'party') return this.party(e, dt);
    let pose = {};
    if (e.state === 'home') { // back home after a game
      const h = e.home;
      if (this.move(e, h.x, h.z, 2.2, dt, { stop: 0.4 })) e.state = 'idle';
    } else if (W.idle?.(this, e, dt, P, d)) pose = { sniff: e.sniffT > 0, happy: d < 7 ? 1 : 0.55 };
    else pose = this.potter(e, dt, P, d);
    // A woof nearby? Woof back. A trick? Join in, sometimes.
    if (e.barkIn > 0 && (e.barkIn -= dt) <= 0) this.woof(e, 0.5);
    if (e.copyIn > 0 && (e.copyIn -= dt) <= 0 && e.speed < 0.3) e.dog.emote(e.copyKind);
    if (canAct && P.emoted && d < 6 && e.copyIn <= 0 && Math.random() < 0.45) { e.copyIn = 0.4 + Math.random() * 0.5; e.copyKind = P.emoted; }
    if (canAct) this.chat(e, P, d, W);
    if (e.state !== 'home') this.push(P, e);
    this.animate(e, dt, pose);
  }

  /** The default way to spend the day: a little wander round home, a sniff, a sit, and a look at whoever comes by. */
  potter(e, dt, P, d) {
    const h = e.home;
    if (d < 7) { // somebody's here! Stop and look (tail going)
      e.to = null;
      lookAt(e.dog.root, P.pos.x, P.pos.z, dt, 5);
      return { happy: 1 };
    }
    e.wanderT -= dt;
    if (!e.to && e.wanderT <= 0) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.6;
      e.to = { x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r };
      e.wanderT = 3 + Math.random() * 5;
    }
    if (e.to && this.move(e, e.to.x, e.to.z, 0.9, dt, { stop: 0.2 })) { e.to = null; if (Math.random() < 0.4) e.sniffT = 1.6; }
    if (!e.to && e.sitT <= 0) { e.sitT = 10 + Math.random() * 12; e.dog.emote('sit'); }
    return { sniff: e.sniffT > 0 && !e.to, happy: 0.5 };
  }

  chat(e, P, d, W) {
    const askR = W.askR ?? ASK;
    if (!e.greeted && d < 11) {
      e.greeted = true;
      e.talkT = 6;
      this.woof(e, 0.7);
      this.say(e, this.line(e, 'hello'), 3);
      return;
    }
    if (d < askR && e.cool <= 0 && !this.game && !this.busy() && !this.carded && !(W.canAsk && !W.canAsk(this, e, P))) return this.begin(e);
    if (e.talkT > 0 || d > 7.5) return;
    if (this.game && d < askR + 1) { e.talkT = 14; this.say(e, this.line(e, 'busy', { other: this.game.e.pal.name }), 2.8); return; }
    e.talkT = 13 + Math.random() * 8;
    const others = this.dogs.filter((q) => q !== e);
    if (others.length && Math.random() < 0.3) this.say(e, this.line(e, 'about', { other: others[Math.floor(Math.random() * others.length)].pal.name }), 3.4);
    else this.say(e, this.line(e, e.cool > 0 ? 'later' : 'idle'), 2.8);
  }

  // ---------- games ----------

  begin(e) {
    const W = WANTS[e.pal.want];
    const game = new W.Game(this, e);
    this.game = game;
    e.dog.stopEmote();
    e.to = null;
    this.job = { giver: 'pal', pal: e.id, icon: this.emoji(e), who: e.pal.name, target: () => game.target(), objective: () => game.objective() };
    this.friends.focus = this.job;
    game.start();
    this.friends.onChange?.();
  }

  clearJob() {
    const j = this.job, f = this.friends;
    this.job = null;
    this.game = null;
    if (f.focus === j) f.focus = f.jobs.find((q) => !q.done) ?? null;
    f.onChange?.();
  }

  /** It fizzled out (wandered off, ran out of time): no harm done. They'll ask again in a bit. */
  stop() {
    const g = this.game, e = g.e;
    g.end();
    this.clearJob();
    e.hidden = false; e.yFree = false;
    e.dog.root.visible = !e.far;
    e.cool = 15;
    e.talkT = 3;
    e.state = WANTS[e.pal.want].idle ? 'idle' : 'home'; // (back home, unless they've their own way of getting about)
    this.say(e, this.line(e, 'later'), 3.2);
  }

  /** Friends! A happy moment, then the crew takes them. */
  win(e) {
    const g = this.game;
    g.end();
    this.clearJob();
    e.hidden = false; e.yFree = false;
    e.dog.root.visible = true;
    e.state = 'party';
    e.partyT = 2.2;
    e.dog.emote('dance');
    this.say(e, this.line(e, 'win'), 4);
    sfx.found?.();
    buzz([25, 40, 25]);
    progress.award(STAR, `New pal: ${e.pal.name}!`);
    this.actions.sparkle(e.pos.clone().add(V(0, 0.7, 0)), 30);
    this.player.happy = 1;
    setTimeout(() => (this.player.happy = 0.5), 2500);
  }

  party(e, dt) {
    lookAt(e.dog.root, this.player.pos.x, this.player.pos.z, dt, 4);
    e.partyT -= dt;
    if (Math.random() < dt * 6) this.actions.glow.spawn({ pos: e.pos.clone().add(V((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6)), vel: V(0, 0.8, 0), life: 0.9, size: 0.035, color: [0xf6d06a, 0xf2a0b4, 0xffffff][Math.floor(Math.random() * 3)] });
    this.animate(e, dt, { happy: 1 });
    if (e.partyT <= 0) this.handover(e);
  }

  /** Over to the crew: from now on the dog's theirs (we stop moving it, and don't take it away). */
  handover(e) {
    this.dogs = this.dogs.filter((q) => q !== e);
    this.handed.add(e.id);
    for (const m of e.casters) m.castShadow = true;
    e.dog.root.visible = true;
    const { first } = pals.befriend(e.id);
    this.crew?.welcome(e.id, { x: e.pos.x, z: e.pos.z, heading: e.dog.root.rotation.y }, { first, dog: e.dog });
  }

  // ---------- from the town ----------

  /** The local dog woofed: a game might want to know (start a race…), and dogs nearby woof back. */
  onBark(pos) {
    this.game?.onBark(pos);
    for (const e of this.dogs) if (e !== this.game?.e && e.state !== 'party' && flat(pos, e.pos) < 9 && Math.random() < 0.7) e.barkIn = 0.25 + Math.random() * 0.4;
  }

  /** The local dog dug at `nose`: true if a game used it (digging Tank out). */
  onDig(nose) { return !!this.game?.onDig(nose); }

  get hint() { return this.game?.hint ?? null; }
}
