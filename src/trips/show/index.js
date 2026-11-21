import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { Person } from '../../entities/person.js';
import { Dog } from '../../entities/dog.js';
import { BREED_KEYS } from '../../entities/breeds.js';
import { CARRYABLES } from '../../entities/carryables.js';
import { sfx } from '../../core/audio.js';
import { progress } from '../../game/progress.js';
import { COSMETICS } from '../../game/cosmetics.js';
import { TripChapter } from '../kit.js';
import { buildShow, PLAN } from './build.js';
import { Agility, agilityTime } from './agility.js';
import { TrickRound, SeekRound, Frisbee, TRICK_MAX } from './games.js';
import { showStyles, rosetteAward, PLACES } from './ui.js';

/*
 * 🏆 The Big Dog Show: a day out on the bus (from any town's bus stop: see game/town/busStop.js). Four rings, each
 * with a rosette to win (1st red, 2nd blue, 3rd yellow; and a green "highly commended" for having a go):
 *   🏅 Agility      through the green flags, round the course in order, out through the chequered ones. Quickest wins.
 *   🎀 The show ring the judge calls out tricks in time with the band: do the one she calls. (Big trick buttons.)
 *   👃 Sniff & Seek  a toy's hidden in the sniffing garden: hold sniff, warmer or colder? 🐾 where it's hidden.
 *   🥏 Frisbee       Ruby throws ten; catch them (a leap in the air counts double) and bring them back.
 * Five rosettes (1st to 3rd, any rings) win the Best in Show rosette to wear. 1st in all four: Best in Show!
 * Stats: agility (runs finished), tricks (rounds), seek (toys found), catches, rosettes, trips.
 * The bus home is by the gate.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const BEST_KEY = 'merry.trips.v1';
const bests = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; } catch { return {}; } };
/** Keep a best (higher is better, or lower with `low`): true if it's a new one. */
const keepBest = (k, n, low = false) => {
  try {
    const s = bests(), b = s[k];
    if (b === undefined || (low ? n < b : n > b)) { localStorage.setItem(BEST_KEY, JSON.stringify({ ...s, [k]: n })); return true; }
  } catch { /* private mode */ }
  return false;
};
const RINGS = {
  agility: { emoji: '🏅', name: 'Agility', best: 'agilityMs', low: true },
  tricks: { emoji: '🎀', name: 'the show ring', best: 'tricks' },
  seek: { emoji: '👃', name: 'Sniff & Seek', best: 'seek' },
  frisbee: { emoji: '🥏', name: 'Frisbee', best: 'frisbee' },
};
/** A score as a placing: 1st, 2nd, 3rd, or 4 (highly commended). */
const placeFor = (ring, v) => {
  if (ring === 'agility') return v <= 20000 ? 1 : v <= 28000 ? 2 : v <= 40000 ? 3 : 4;
  if (ring === 'tricks') return v >= 13 ? 1 : v >= 9 ? 2 : v >= 5 ? 3 : 4;
  if (ring === 'seek') return v >= 6 ? 1 : v >= 4 ? 2 : v >= 2 ? 3 : 4;
  return v >= 12 ? 1 : v >= 8 ? 2 : v >= 4 ? 3 : 4; // (frisbee points)
};
const LINES = {
  judge: ['What a handsome dog!', 'Lovely coat!', 'Come and show me your tricks!', 'Such a waggy tail!'],
  crowd: ['Go on, pup!', 'Isn’t she lovely?', 'Ooh, look at that one!', 'What a good dog!'],
  tea: ['Cup of tea?', 'Lovely day for it!', 'Scone, anyone?'],
  band: ['Oom-pah-pah!', 'Woof along!', 'Toot toot!'],
};

/** Sitting, and staying sat (an emote that's started again blends in from standing: this holds it mid-sit). */
function sitStill(dog) {
  if (dog.emoteKind === 'sit' && (dog.emoteT ?? 0) > 0.3) dog.emoteT = Math.max(dog.emoteT, 1.5);
  else dog.emote('sit');
}

export function build(ctx) {
  const { scene, world, dyn, sky, course } = buildShow(ctx.origin);
  const { W, R } = world;
  world.spawn = () => { const p = W(PLAN.spawn.x, PLAN.spawn.z); return { x: p.x, z: p.z, face: Math.PI }; }; // (just in through the gate, looking up the avenue)
  const s = PLAN.stop;
  world.exits = [{ id: 'bus', rect: R(s.x - 1.3, s.z - 1.1, s.x + 1.3, s.z + 1.6), open: () => !chapter.busy(), text: '🚌 The bus home!', paw: 'bus', style: 'bus', onTake: () => chapter.goHome() }];
  world.update = (t) => { sky.material.uniforms.uTime.value = t * 0.3; };
  world.dispose = () => {};
  const chapter = new ShowChapter(ctx, { scene, world, dyn, course });
  return { scene, world, chapter, sky, look: { fog: 0xece6d8, near: 34, far: 100, music: 'show', ambient: { birds: 1 } } };
}

class ShowChapter extends TripChapter {
  constructor(ctx, { scene, world, dyn, course }) {
    super(ctx, { scene, world });
    Object.assign(this, { dyn, W: world.W });
    showStyles(true);
    this.saved = ctx.town.state;
    this.placed = { ...(this.saved.placed ?? {}) }; // (the best rosette in each ring, here: 1–4)
    const o = world.W(0, 0);
    this.O = { x: o.x, z: o.z };
    this.later = [];
    this.game = null;  // { kind: 'tricks' | 'seek' | 'frisbee', round }
    this.agility = new Agility(course, {
      O: this.O, player: this.player, hud: this.hud, actions: this.actions, ring: PLAN.agility,
      onFinish: (r) => this.agilityDone(r),
    });
    this.makePeople();
    this.makeDogs();
    // Ruby's frisbee (one, thrown again and again).
    this.disc = CARRYABLES.frisbee.build();
    this.disc.visible = false;
    this.scene.add(this.disc);
    this.chatT = 3;
    this.objective();
  }

  local(p = this.player.pos) { return { x: p.x - this.O.x, z: p.z - this.O.z }; }
  at(x, z, y = 0) { return V(x + this.O.x, y, z + this.O.z); }
  near(x, z, r) { const l = this.local(); return Math.hypot(l.x - x, l.z - z) < r; }

  /** In the middle of something (no bus home just now). */
  busy() { return !!this.game || !!this.agility.run || !!this.agility.move || !!this.agility.seesaw; }

  // ---------- people and dogs ----------

  makePeople() {
    const add = (o, x, z, face, y = 0, s = 1) => {
      const p = new Person(o);
      p.root.position.copy(this.W(x, z)).setY(y); p.root.rotation.y = face; p.root.scale.setScalar(s);
      p.root.traverse((m) => { if (m.isMesh) { m.geometry.computeBoundingSphere(); if (m.geometry.boundingSphere.radius < 0.07) m.castShadow = false; } }); // (eyes, noses, hands, shoes: no shadows of their own)
      this.scene.add(p.root);
      return p;
    };
    // The judge: a tweedy jacket and a bowler hat, behind her table.
    const j = PLAN.judge;
    this.judge = add({ shirt: 0x6f7a4a, trousers: 0x5a4a3a }, j.x, j.z, 0);
    const hatMat = paint(0x3a2e2a);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatMat), brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 20), hatMat);
    crown.position.y = 0.075; brim.position.y = 0.075;
    crown.castShadow = brim.castShadow = true;
    this.judge.head.add(crown, brim);
    // Ruby, by the frisbee field; the Sniff Master at the sniffing garden's gate.
    const k = PLAN.frisbee.kid, m = PLAN.seek.master;
    this.kid = add({ shirt: 0xf2a0c8, trousers: 0x5b86c4 }, k.x, k.z, Math.PI, 0, 0.72);
    this.master = add({ shirt: 0xb69be0, trousers: 0x4a4a52, cap: { color: 0x6b4a32 } }, m.x, m.z, 0.9);
    // The band on the bandstand: a tuba, a drum, a cornet.
    const b = PLAN.bandstand, gold = paint(0xe0b04a);
    this.band = [-1, 0, 1].map((i) => {
      const p = add({ shirt: 0xd9534f, trousers: 0x2f3a52, cap: { color: 0x2f3a52, band: 0xe0b04a } }, b.x + i * 1.2, b.z + 0.4 - Math.abs(i) * 0.5, 0, b.h);
      const g = new THREE.Group();
      if (i === -1) { g.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 18), gold)); const bell = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 14, 1, true), gold); bell.position.set(0.05, 0.3, 0); g.add(bell); g.position.set(0, 1.1, 0.2); }
      else if (i === 0) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.28, 18), paint(0xfbf7ee)); d.rotation.x = Math.PI / 2; g.add(d); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 4, 18), paint(0xd9534f)); rim.position.z = 0.14; g.add(rim); g.position.set(0, 0.95, 0.28); }
      else { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 0.4, 10), gold); t.rotation.x = Math.PI / 2; t.position.z = 0.2; g.add(t); g.position.set(0, 1.55, 0.12); }
      g.traverse((q) => { if (q.isMesh) q.castShadow = true; });
      p.root.add(g);
      p.kind = ['tuba', 'drum', 'cornet'][i + 1];
      return p;
    });
    // At the tea tent: someone serving, two having a cuppa.
    const t = PLAN.tea;
    this.tea = [add({ shirt: 0xfbf7ee, trousers: 0x4a4a52 }, t.x - 0.4, t.z, -Math.PI / 2), add({ shirt: 0xe8743c, trousers: 0x4a4a52 }, t.x - 3.3, t.z - 1.0, Math.PI / 2), add({ shirt: 0x8fd0e0, trousers: 0x6b4a32, bag: true }, t.x - 3.4, t.z + 0.9, Math.PI / 2)];
    // The crowd round the show ring (each with a dog: see makeDogs).
    const r = PLAN.ring;
    this.crowdAt = [1.2, 1.62, 5.05].map((a) => ({ a, x: r.x + Math.cos(a) * (r.r + 1.1), z: r.z + Math.sin(a) * (r.r + 1.1) }));
    this.crowd = this.crowdAt.map((c, i) => add({ shirt: [0x6f9a52, 0xf2c94c, 0x5b86c4][i], trousers: [0x4a4a52, 0x6b4a32, 0x2f3a52][i] }, c.x, c.z, Math.atan2(r.x - c.x, r.z - c.z)));
    for (const c of this.crowdAt) this.world.C.circle(c.x, c.z, 0.25);
    this.people = [this.judge, this.kid, this.master, ...this.band, ...this.tea, ...this.crowd];
  }

  makeDogs() {
    const keys = BREED_KEYS.filter((k) => k !== this.player.breedKey).sort(() => Math.random() - 0.5), r = PLAN.ring;
    this.dogs = this.crowdAt.map((c, i) => {
      const dog = new Dog(keys[i]), side = c.a + 0.09;
      dog.root.position.copy(this.W(r.x + Math.cos(side) * (r.r + 1.0), r.z + Math.sin(side) * (r.r + 1.0)));
      dog.root.rotation.y = Math.atan2(r.x - c.x, r.z - c.z);
      this.dyn.parent.add(dog.root);
      this.world.C.circle(r.x + Math.cos(side) * (r.r + 1.0), r.z + Math.sin(side) * (r.r + 1.0), 0.3);
      return dog;
    });
  }

  tickPeople(dt) {
    const P = this.player.pos, t = this.time;
    for (const p of [this.judge, this.master, ...this.tea, ...this.crowd]) p.update(dt, 0);
    // The judge looks at her when she's in the ring.
    if (this.near(PLAN.ring.x, PLAN.ring.z, PLAN.ring.r + 2)) {
      const jp = this.judge.root.position, want = Math.atan2(P.x - jp.x, P.z - jp.z);
      this.judge.root.rotation.y += Math.atan2(Math.sin(want - this.judge.root.rotation.y), Math.cos(want - this.judge.root.rotation.y)) * (1 - Math.exp(-dt * 3));
    }
    // The band plays along: the tuba and cornet sway, the drummer drums.
    for (const b of this.band) {
      b.update(dt, 0);
      const k = Math.sin(t * 5.9);
      if (b.kind === 'drum') { b.arms[0].rotation.x = -1.0 + Math.max(0, k) * 0.5; b.arms[1].rotation.x = -1.0 + Math.max(0, -k) * 0.5; }
      else { b.arms[0].rotation.x = -1.3; b.arms[1].rotation.x = -1.3; b.body.rotation.z = 0.05 * Math.sin(t * 2.95 + (b.kind === 'tuba' ? 0 : 1)); }
    }
    if (!this.game || this.game.kind !== 'frisbee') { this.kid.update(dt, 0); this.kid.arms[1].rotation.x = -0.4; }
    // Now and then, someone nearby says something.
    this.chatT -= dt;
    if (this.chatT <= 0) {
      this.chatT = 7;
      const near = [[this.judge, LINES.judge], ...this.crowd.map((p) => [p, LINES.crowd]), ...this.tea.map((p) => [p, LINES.tea]), [this.band[1], LINES.band]]
        .find(([p]) => p.root.position.distanceTo(P) < 5.5);
      if (near && !this.game) this.say(pick(near[1]), () => near[0].root.position.clone().add(V(0, 2.1 * near[0].root.scale.y, 0)), 2.6);
    }
  }

  tickDogs(dt) {
    const far = this.player.pos.distanceTo(this.W(PLAN.ring.x, PLAN.ring.z)) > 27; // (a dog's a lot of shape: only drawn from close by)
    for (const d of this.dogs) {
      d.root.visible = !far;
      if (far) continue;
      sitStill(d);
      d.update(dt, { speed: 0, turnRate: 0, sniff: false, dig: false, happy: 0.8 });
    }
  }

  // ---------- what's what ----------

  objective() {
    const n = progress.stats?.rosettes ?? 0, line = (k) => {
      const p = this.placed[k], R = RINGS[k];
      return `${R.emoji} ${p ? { 1: '🔴 1st', 2: '🔵 2nd', 3: '🟡 3rd', 4: '🟢 ★' }[p] : '–'}`;
    };
    const got = Object.values(this.placed).filter((p) => p <= 3).length;
    this.hud.setObjective(`The Big Dog Show! 🏵️ Rosettes: <b>${n}</b>`,
      `Best here: ${Object.keys(RINGS).map(line).join(' · ')} · 🏵️ Win 5 for a prize · 🚌 The bus home’s by the gate`, { icon: '🏆', short: `${got}/4` });
  }

  arrive() {
    if (!this.saved.visited) {
      this.ctx.town.save({ visited: true });
      progress.stat('trips');
      progress.award(20, 'The Big Dog Show!');
    }
    this.hud.showToastRaw('🏆', 'The Big Dog Show!', 'Four rings to try: 🏅 agility, 🎀 tricks for the judge, 👃 Sniff & Seek and 🥏 frisbee. Win rosettes! The bus home is by the gate.', { tip: true });
  }

  goHome() { this.hud.showToastRaw('🚌', 'All aboard for home!', 'What a show!'); }

  /** What's what at the bottom while she's held still (going through the tunnel, up the seesaw…). */
  heldHint() { const h = this.agility.hint(); return h ? { text: h, paw: 'wait' } : null; }

  hint() {
    const nose = this.actions.nose();
    if (this.game) {
      const g = this.game;
      return { text: g.kind === 'seek' ? g.round.hint(nose) : g.round.hint(), paw: 'dig' };
    }
    const ag = this.agility.hint();
    if (ag) return { text: ag, paw: 'dig' };
    if (this.near(PLAN.mark.x, PLAN.mark.z, 2.4)) return { text: '🎀 Show off your tricks for the judge! 🐾', paw: 'show' };
    if (this.kid.root.position.distanceTo(this.player.pos) < 2.8) return { text: '🥏 Play frisbee with Ruby! 🐾', paw: 'play' };
    if (this.master.root.position.distanceTo(this.player.pos) < 2.8) return { text: '👃 Sniff & Seek! Find the hidden toy 🐾', paw: 'seek' };
    return null;
  }

  onDig(nose) {
    if (this.game?.kind === 'seek') return this.game.round.dig(nose);
    if (this.game || this.agility.run) return true;
    if (this.near(PLAN.mark.x, PLAN.mark.z, 2.4)) { this.startTricks(); return true; }
    if (this.kid.root.position.distanceTo(this.player.pos) < 2.8) { this.startGame('frisbee', new Frisbee(this, { kid: this.kid, field: PLAN.frisbee, disc: this.disc })); return true; }
    if (this.master.root.position.distanceTo(this.player.pos) < 2.8) { this.startGame('seek', new SeekRound(this, { hides: PLAN.hides, master: this.master, area: PLAN.seek })); return true; }
    return false;
  }

  onBark() {
    const P = this.player.pos;
    const p = this.people.find((q) => q.root.position.distanceTo(P) < 4);
    if (!p || this.game?.kind === 'tricks') return;
    const line = p === this.judge ? 'What a lovely voice!' : p === this.kid ? 'Hello, doggy!' : this.band.includes(p) ? pick(LINES.band) : pick(['Woof to you too!', 'Who’s a good dog?', 'Enjoying the show?']);
    this.say(line, () => p.root.position.clone().add(V(0, 2.1 * p.root.scale.y, 0)), 2);
  }

  goal() {
    if (this.game) return null; // (sniffing for the toy: no trail, that's the game!)
    const ag = this.agility.goal();
    if (ag) return ag;
    // The nearest ring she hasn't won a rosette in yet.
    const P = this.player.pos, spots = [];
    if (!this.placed.agility) spots.push(this.at(PLAN.agility.x0 + 2.5, 7.5));
    if (!this.placed.tricks) spots.push(this.at(PLAN.mark.x, PLAN.mark.z));
    if (!this.placed.seek) spots.push(this.master.root.position.clone().setY(0));
    if (!this.placed.frisbee) spots.push(this.kid.root.position.clone().setY(0));
    return spots.reduce((b, p) => (!b || p.distanceToSquared(P) < b.distanceToSquared(P) ? p : b), null);
  }

  // ---------- the rings ----------

  startGame(kind, round) {
    this.game = { kind, round };
    this.agility.stop();
    this.hud.setPrompt('');
  }

  startTricks() {
    const P = this.player, m = this.at(PLAN.mark.x, PLAN.mark.z), j = this.judge.root.position;
    P.pos.x = m.x; P.pos.z = m.z;
    P.vel.set(0, 0);
    P.heading = Math.atan2(j.x - m.x, j.z - m.z);
    P.object.rotation.y = P.heading;
    this.ctx.follow.yaw = P.heading + Math.PI + (innerWidth < innerHeight ? 0.25 : 0.55); // (from behind her shoulder: her, and the judge, even on a phone held upright)
    this.ctx.follow.pitch = Math.min(this.ctx.follow.pitch, 0.45);
    this.startGame('tricks', new TrickRound(this, { judge: this.judge, mark: PLAN.mark }));
  }

  /** A round's over: its score (or -1: she wandered off, no rosette). */
  gameOver(kind, score) {
    this.game = null;
    if (score < 0) { this.hud.float('Round over!', this.actions.anchor()); return; }
    if (kind === 'tricks') {
      progress.stat('tricks');
      this.award('tricks', score, `${score} of ${TRICK_MAX} points`);
    } else if (kind === 'seek') {
      this.award('seek', score, `${score} toy${score === 1 ? '' : 's'} found`);
    } else {
      const c = this.lastCatches ?? 0;
      this.award('frisbee', score, `${score} point${score === 1 ? '' : 's'} (${c} catch${c === 1 ? '' : 'es'})`);
    }
  }

  agilityDone({ ms, faults }) {
    progress.stat('agility');
    const clear = faults === 0;
    if (clear) this.later.push([1.2, () => this.hud.float('Clear round! 🎉', this.actions.anchor(), 'xp')]);
    this.award('agility', ms, `${agilityTime(ms)}${clear ? ' · a clear round!' : ` · ${faults} pole${faults === 1 ? '' : 's'} down`}`, clear ? 3 : 0);
  }

  onSeekFind() { progress.stat('seek'); progress.award(3, 'Found it!'); }
  onCatch(leap) { progress.stat('catches'); progress.award(leap ? 3 : 2, leap ? 'Leaping catch!' : 'Caught it!'); }

  /** A rosette! (1st–3rd count towards the prize; everyone who has a go gets at least a green one.) */
  award(ring, value, words, bonus = 0) {
    const R = RINGS[ring], place = placeFor(ring, value), P = PLACES[place];
    const best = keepBest(R.best, value, !!R.low);
    const before = progress.stats?.rosettes ?? 0;
    if (place <= 3) progress.stat('rosettes');
    progress.award(4 + { 1: 12, 2: 8, 3: 5, 4: 2 }[place] + bonus, `${R.emoji} ${P.word}`);
    rosetteAward(this.hud.root, place, `${P.word}`, `${R.emoji} ${R.name[0].toUpperCase()}${R.name.slice(1)}: ${words}${best ? ' · a new best!' : ''}`);
    sfx.hooray?.();
    this.actions.sparkle(this.player.pos.clone().add(V(0, 0.8, 0)), 24);
    if (!this.placed[ring] || place < this.placed[ring]) {
      this.placed[ring] = place;
      this.ctx.town.save({ placed: { ...this.placed } });
    }
    if (ring === 'tricks') this.say(place === 1 ? 'Marvellous! First place!' : place === 4 ? 'Lovely tricks! Have a rosette!' : 'Well done! A rosette for you!', () => this.judge.root.position.clone().add(V(0, 2.05, 0)), 2.6);
    // The prize, at five rosettes.
    if (place <= 3) for (const c of COSMETICS) if (c.friend === 'rosettes' && before < c.jobs && before + 1 >= c.jobs) this.later.push([3.6, () => this.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'Five rosettes! Wear it from ☰ → My dog → Dress up.')]);
    // First in every ring: Best in Show!
    if (!this.saved.bestInShow && Object.keys(RINGS).every((k) => this.placed[k] === 1)) {
      this.saved.bestInShow = true;
      this.ctx.town.save({ bestInShow: true });
      this.later.push([4, () => { progress.award(30, '🏆 Best in Show!'); sfx.hooray?.(); this.hud.showToastRaw('🏆', 'BEST IN SHOW!', 'First place in every ring. The finest dog at the show!'); this.actions.sparkle(this.player.pos.clone().add(V(0, 1, 0)), 40); }]);
    }
    this.objective();
  }

  // ---------- every frame ----------

  tick(dt) {
    if (this.later.length) { for (const l of this.later) l[0] -= dt; for (const l of this.later.filter((q) => q[0] <= 0)) l[1](); this.later = this.later.filter((q) => q[0] > 0); }
    this.agility.update(dt);
    const g = this.game;
    if (g) {
      const sniffing = !this.player.frozen && this.input.sniff;
      const r = g.kind === 'seek' ? g.round.update(dt, sniffing, this.actions.nose()) : g.round.update(dt);
      if (g.kind === 'frisbee') this.lastCatches = g.round.catches;
      if (r !== null && r !== undefined) this.gameOver(g.kind, r);
    }
    this.tickPeople(dt);
    this.tickDogs(dt);
  }

  dispose() {
    this.game?.round.dispose?.();
    this.game = null;
    this.agility.dispose();
    this.player.dog.hold(null);
    this.disc.traverse((q) => q.geometry?.dispose());
    this.hud.root.querySelector('.rosette-award')?.remove();
    document.body.classList.remove('show-round');
    showStyles(false);
    this.player.happy = 0.5;
    super.dispose();
  }
}
