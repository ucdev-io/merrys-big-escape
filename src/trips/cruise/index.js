import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../../game/progress.js';
import { COSMETICS } from '../../game/cosmetics.js';
import { Person } from '../../entities/person.js';
import { bakePerson } from '../../game/town/heist/people.js';
import { Cat } from '../../entities/cat.js';
import { tenderModel, SHIP } from '../../entities/ship.js';
import { deckchair } from '../../world/areas/beachBuild.js';
import { bake } from '../../entities/shapes.js';
import { TripChapter } from '../kit.js';
import { buildShip, PLAN, UP } from './build.js';
import { SeaLife } from './sealife.js';

/*
 * 🚢 The Sunny Dolphin: out to sea in the tender from the jetty at the beach, and up the gangway.
 *   🧢 Captain Poppy's hat has blown off in the wind (it does that every time). Find it and bring it to her, up on
 *      the top deck by the wheel. The first time, she gives you her spare: the ⚓ Captain's hat.
 *   🧳 Mrs Pemberton has lost two things somewhere about the ship. She's on her sun lounger on the sun deck.
 *   🌊 Cannonballs! Run off the diving board into the splash pool: Mrs Pemberton holds up a score (out of 10). The
 *      higher you jump from, the bigger the splash. Your best is kept.
 *   🎾 Grandad Ted throws a ball down the stern deck for you, again and again. Your best run of fetches is kept.
 *   🐱 Admiral Whiskers, the ship's cat, is hiding somewhere (listen for a meow). Find him and woof!
 * With friends aboard (this.share: see trips/share.js), the hat, Mrs Pemberton's things and the cat are the pack's:
 * the same spots for everyone, one dog's mouth at a time, and found or handed over for everybody (a few ⭐ for
 * the friends who were there, the usual for whoever did it).
 *   🐬 Dolphins come leaping alongside now and then, and a whale blows further off: woof hello!
 *   🔔 Ring the bell at the bow, and 📯 sound the horn by the wheel.
 * Home: down the gangway (starboard, by the pool) into the tender, back to the jetty.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const BEST_KEY = 'merry.trips.v1';
const bests = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; } catch { return {}; } };
const keepBest = (k, n) => {
  try { const s = bests(); if (n > (s[k] ?? 0)) { localStorage.setItem(BEST_KEY, JSON.stringify({ ...s, [k]: n })); return true; } } catch { /* private mode */ }
  return false;
};
const SEA = -SHIP.H + 0.02;

// Where things can blow to / be dropped (the ship's coordinates; y: which deck).
const SPOTS = [
  [-2.8, 23.6, 0], [3.0, -25.2, 0], [-3.4, 18.0, UP], [-3.3, -18.0, UP], [5.5, 13.0, 0], [-5.6, -11.0, 0],
  [3.2, 9.2, UP], [-5.4, 5.2, 0], [1.6, -27.0, 0], [3.4, 23.0, 0], [-1.4, -10.0, UP], [5.4, 18.5, 0],
];
const LOST = ['teddy', 'slipper', 'newspaper', 'sock', 'frisbee', 'squeaky'];
// Where Admiral Whiskers hides (x, z, y, where).
const HIDES = [
  [-3.4, 12.0, UP + 0.95, 'in a lifeboat'], [3.4, 12.0, UP + 0.95, 'in a lifeboat'], [-2.6, -21.0, 0, 'behind the crates'],
  [4.6, -0.6, 0.38, 'sunbathing on a lounger'], [0.4, -16.6, PLAN.wheel.top + 0.12, 'up on the wheelhouse roof'], [1.7, 17.2, UP, 'behind the funnel'],
  [-1.0, -26.8, 0.3, 'in the coil of rope'], [1.4, 24.6, 0, 'by the flagpole'],
];

const LINES = {
  hello: ['Ahoy there, {name}! Welcome aboard the Sunny Dolphin!', 'Ahoy, {name}! Back aboard? Splendid!'],
  hat: ['Oh, whoops! The wind’s blown my hat clean off! Could you find it for me?', 'Not AGAIN! My hat’s blown off somewhere! Be a dear and find it?'],
  thanks: 'My hat! Thank you, {name}! A captain’s not a captain without her hat.',
  prize: 'Here: have my spare one. You’re an honorary captain now!',
  captain: ['Full steam ahead!', 'Lovely day for a sail.', 'Mind the gulls: they’re after the sandwiches.', 'Try the horn! Pull the lever by the wheel.'],
  pemberton: ['Oh, I’ve lost my {thing}! And my {thing2}! Somewhere about the ship…', 'Have you seen my things, dear? I’ve lost two of them again.'],
  pThanks: ['My {thing}! Thank you, dear!', 'Oh, my {thing}! You clever thing!'],
  pAll: 'Everything back! You’re a treasure. Now, show me a cannonball into the pool!',
  judge: { 10: 'A perfect cannonball!', 9: 'What a splash!', 7: 'Lovely!', 5: 'Not bad, dear.', 1: 'Hmm, more of a plop. Try the diving board!' },
  ted: ['Fetch, pup? Here we go!', 'Off you go!', 'Again? Go on then!', 'Good dog! And again!'],
  tedBack: 'Bring it back here, pup!',
  ollie: ['Admiral Whiskers is hiding again. He loves a game of hide-and-seek!', 'Have you rung the bell at the front? DING!', 'Run off the diving board for a cannonball!', 'Watch the water: dolphins sometimes race the ship!'],
  cat: ['Mrrrow! You found me!', 'Mew! Oh, it’s you.', 'Prrrp! Fine, you win.'],
  dolphins: ['🐬 The dolphins chatter back!', '🐬 Eek-eek-eek! They’re showing off!'],
  whale: ['🐋 Thar she blows!', '🐋 Woof! The whale waves its tail!'],
};

/** Bake the meshes straight under each group into one (keeping `keep` as they are), so a model costs a few draws. */
function bakeGroups(model, groups, keep = []) {
  for (const g of groups) {
    const parts = g.children.filter((o) => o.isMesh && !keep.includes(o));
    if (parts.length < 2) continue;
    const geo = bake(parts.map((m) => [m.geometry, m.material.color.getHex(), m.position.toArray(), [m.rotation.x, m.rotation.y, m.rotation.z], m.scale.toArray()]));
    for (const m of parts) g.remove(m);
    const merged = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true }));
    merged.castShadow = true;
    g.add(merged);
  }
  return model;
}

export function build(ctx) {
  const built = buildShip(ctx.origin);
  const { scene, world } = built;
  const { W, R } = world;
  const g = PLAN.gangway;
  world.spawn = () => { const p = W(g.x - 1.0, g.z - 0.4); return { x: p.x, z: p.z, face: Math.PI }; }; // (at the top of the gangway, looking along the deck to the pool)
  const chapter = new CruiseChapter(ctx, { scene, world, built });
  world.exits = [{
    id: 'jetty', rect: R(g.x - 1.0, g.z - 0.75, g.x, g.z + 0.75), open: () => true, text: '🐾 Back to the beach!', paw: 'aboard', style: 'boat',
    onTake: () => chapter.goHome(),
  }];
  world.update = (t) => chapter.animate(t);
  world.dispose = () => {};
  const look = { fog: 0xe9e6da, near: 60, far: 170, background: 0xbfd8e6, light: [1.03, 1.0, 0.96], shadow: [0.92, 0.95, 1.04], skyFill: 0.12, saturation: 1.02, music: 'cruise', ambient: {} };
  const u = built.uniforms;
  u.uFogCol.value.set(look.fog); u.uFogNear.value = 70; u.uFogFar.value = 150; u.uFar.value = 200; u.uChop.value = 0.12;
  u.uHorizon.value.copy(built.sky.material.uniforms.uHorizon.value);
  return { scene, world, chapter, sky: built.sky, look };
}

class CruiseChapter extends TripChapter {
  constructor(ctx, { scene, world, built }) {
    super(ctx, { scene, world });
    Object.assign(this, { W: world.W, dyn: built.dyn, built });
    this.name = () => ctx.town.dogName();
    this.saved = ctx.town.state;
    this.later = [];
    this.makePeople();
    this.makeThings();
    this.sea = new SeaLife(this.dyn, SEA, {
      splash: (p, n) => this.splash(this.local2world(p), n, 0.6),
      spout: (p) => this.spout(this.local2world(p)),
    });
    this.best = { cannon: bests().cannonball ?? 0, fetch: bests().fetch ?? 0 };
    this.fetch = { n: 0, state: 'idle', ball: null, t: 0 };
    this.rang = false;
    this.honked = 0;
    this.joinShared();
    this.objective();
  }

  /** The thing to find with key k as it is now (with friends, it's a new one each time a friend puts it down). */
  item(k) { return this.shared.get(k)?.item ?? this.things[k]; }

  /** With friends aboard: the hat, the lost things and the cat are the pack's (as it is when she arrives, quietly). */
  joinShared() {
    if (!this.share) return;
    this.onShared = (k, v, by) => { if (k === 'cat' && v === 1 && by !== this.share.me && !this.cat.found) this.catFoundBy(by); };
    this.onSharedDone = (k, by) => (k === 'hat' ? this.hatReturned(by) : this.lostReturned(k, by));
    for (const k of ['hat', 'lost0', 'lost1']) this.shareItem(k, this.things[k]);
    if (this.share.v.cat === 1 && !this.cat.found) this.catFoundBy(-1);
  }

  /** The ship's coordinates (+ deck height y) → the world's. */
  at(x, z, y = 0) { const p = this.W(x, z); p.y = y; return p; }
  local2world(p) { const o = this.W(0, 0); return V(p.x + o.x, p.y, p.z + o.z); }
  near(p, r, dy = 1.2) { const P = this.player.pos; return (P.x - p.x) ** 2 + (P.z - p.z) ** 2 < r * r && Math.abs(P.y - p.y) < dy; }

  // ---------- the people, the cat, the things ----------

  makePeople() {
    const put = (p, x, z, y, face) => { p.root.position.copy(this.at(x, z, y)); p.root.rotation.y = face; this.scene.add(p.root); return p; };
    // Captain Poppy at the helm (no hat: it's blown off!), with gold on her shoulders.
    this.captain = put(new Person({ shirt: 0xfbfaf6, trousers: 0x2f3a52, skin: 0xe0b48e, hair: 0x8a5a3a }), PLAN.captain.x, PLAN.captain.z, UP, Math.PI * 0.1);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), paint(0xe0b04a)); e.position.set(s * 0.22, 1.44, 0); this.captain.body.add(e); }
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), paint(0x2f3a52));
    tie.position.set(0, 1.36, 0.13); tie.rotation.x = Math.PI;
    this.captain.body.add(tie);
    this.capOn = false;
    // Mrs Pemberton on her sun lounger, in a big floppy sun hat and dark glasses, facing the pool (she's the judge).
    const mp = this.pemberton = put(new Person({ shirt: 0xb69be0, trousers: 0xb69be0, skin: 0xf2d3b8, hair: 0xa8a49e }), PLAN.pemberton.x, PLAN.pemberton.z + 0.5, UP + 0.02, Math.PI);
    mp.userData = { low: -0.42, legs: -1.4 };
    mp.body.position.y = -0.42;
    for (const l of mp.legs) l.rotation.x = -1.4;
    mp.arms[0].rotation.set(-0.45, 0, 0.25); mp.arms[1].rotation.set(-0.45, 0, -0.25);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.015, 24), paint(0xf6e6a8));
    brim.position.y = 0.1;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 18), paint(0xf6e6a8));
    crown.position.y = 0.16;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 18, 1, true), paint(0xf2a0b4));
    band.position.y = 0.12;
    mp.head.add(brim, crown, band);
    for (const s of [-1, 1]) { const gl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), paint(0x2b2b38)); gl.scale.set(1, 0.7, 0.4); gl.position.set(s * 0.045, 0.01, 0.12); mp.head.add(gl); }
    // Grandad Ted in a deckchair at the stern, in his holiday shirt, with a ball.
    const tc = deckchair(0, 0, 0, [0xd9534f, 0xfaf6ec]);
    tc.position.copy(this.at(PLAN.ted.x, PLAN.ted.z - 0.1));
    bakeGroups(tc, [tc]);
    this.dyn.parent.add(tc);
    const ted = this.ted = put(new Person({ shirt: 0x4aa3a0, trousers: 0xe8dcc0, skin: 0xc68e64, hair: 0xa8a49e }), PLAN.ted.x, PLAN.ted.z, 0, 0);
    ted.userData = { low: -0.42, legs: -1.15 };
    ted.body.position.y = -0.42;
    for (const l of ted.legs) l.rotation.x = -1.15;
    this.world.C.circle(PLAN.ted.x, PLAN.ted.z - 0.1, 0.5, 1.0);
    this.world.C.circle(PLAN.captain.x, PLAN.captain.z, 0.32, UP + 1.8);
    ted.arms[1].rotation.set(-0.45, 0, -0.25);
    // Ollie the deckhand, mopping his way up and down the port side.
    this.ollie = put(new Person({ shirt: 0x5b86c4, trousers: 0xf6f2ea, skin: 0xf2d3b8, hair: 0xc89a5a, cap: { color: 0xf6f2ea, band: 0x5b86c4 } }), -5.75, -4, 0, Math.PI);
    const mop = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), paint(0xc8a47a));
    stick.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), paint(0xe8e2d6));
    head.scale.set(1, 0.4, 1);
    mop.add(stick, head);
    mop.position.set(0.25, 0, 0.45);
    mop.rotation.x = 0.45;
    this.ollie.root.add(mop);
    this.ollieAt = { z: -4, dir: -1, chatT: 0, pause: 0 };
    for (const p of [this.captain, this.pemberton, this.ted, this.ollie]) bakePerson(p); // (a few meshes each, not dozens)
    this.chatT = new Map();
    // Admiral Whiskers, somewhere about the ship, in a little sailor's hat.
    this.cat = new Cat();
    const sailor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.05, 14), paint(0xfbfaf6));
    sailor.position.set(0, 0.1, -0.01);
    const sband = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.015, 14, 1, true), paint(0x2f3a52));
    sband.position.set(0, 0.085, -0.01);
    this.cat.head.add(sailor, sband);
    this.cat.root.scale.setScalar(1.25);
    this.cat.bake(); // (the hat joins the head's baked mesh; the eyes stay, to blink)
    const h = HIDES[Math.floor(this.random() * HIDES.length)]; // (the pack's dice: the same hiding place for everyone aboard)
    this.cat.root.position.copy(this.at(h[0], h[1], h[2]));
    this.cat.root.rotation.y = Math.random() * 6.28;
    this.cat.hide = h[3];
    this.cat.found = false;
    this.cat.meowT = 3;
    this.scene.add(this.cat.root);
  }

  makeThings() {
    const carry = this.actions.carry, spots = this.shuffled(SPOTS); // (the pack's dice: the same spots for everyone aboard)
    const put = (kind, s, job) => { const p = this.at(s[0], s[1]); const it = carry.add(kind, p.x, p.z, { job }); it.pos.y = s[2] + 0.02; return it; };
    this.hat = put('captainhat', spots[0], 'captain');
    const kinds = this.shuffled(LOST).slice(0, 2);
    this.lost = kinds.map((k, i) => put(k, spots[i + 1], 'pemberton'));
    this.lostNames = kinds.map((k) => this.lost.find((q) => q.kind === k).def.name);
    this.lostDone = 0;
    this.hatDone = false;
    // The things to find, by key (shared with friends under the same keys: see joinShared).
    this.things = { hat: this.hat, lost0: this.lost[0], lost1: this.lost[1] };
    this.lostLeft = new Set(['lost0', 'lost1']);
    this.lostName = { lost0: this.lostNames[0], lost1: this.lostNames[1] };
    // The tender, bobbing alongside at the foot of the gangway.
    this.tender = tenderModel();
    this.tender.position.set(SHIP.B + 2.3, SEA, PLAN.gangway.z + 8.2);
    this.tender.rotation.y = Math.PI;
    this.dyn.add(this.tender);
    // The flag at the stern: navy, with a sun on it.
    this.flag = new THREE.Group();
    this.flag.position.set(0, 3.9, 25.0);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 6, 1), paint(0x2f4a7a, { side: THREE.DoubleSide }));
    cloth.position.set(0, 0, 0.58);
    cloth.rotation.y = Math.PI / 2;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), paint(0xf2c94c, { side: THREE.DoubleSide }));
    sun.position.set(0.01, 0, 0.58);
    sun.rotation.y = Math.PI / 2;
    this.flag.add(cloth, sun);
    this.cloth = cloth;
    this.dyn.add(this.flag);
    // Ted's ball in the air (it becomes a real ball to fetch when it lands).
    this.ballFly = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), paint(0xc8dc4a));
    this.ballFly.visible = false;
    this.scene.add(this.ballFly);
  }

  // ---------- what's what ----------

  objective() {
    const jobs = (this.hatDone ? 1 : 0) + this.lostDone + (this.cat.found ? 1 : 0);
    const head = this.hatDone ? `The Sunny Dolphin! 🧳 Mrs Pemberton’s things: <b>${this.lostDone}/2</b>` : 'The Sunny Dolphin! 🧢 Find Captain Poppy’s hat';
    const cat = this.cat.found ? '🐱 Found Admiral Whiskers!' : '🐱 The ship’s cat is hiding (woof when you find him)';
    this.hud.setObjective(head, `${cat} · 🌊 Cannonball best: <b>${this.best.cannon || '–'}</b> · 🎾 Fetch best: <b>${this.best.fetch}</b> · 🔔 the bell at the front · 🐬 woof at dolphins!`, { icon: '🚢', short: `${jobs}/4` });
  }

  arrive() {
    const first = !this.saved.visited;
    if (first) {
      this.ctx.town.save({ visited: true });
      progress.stat('trips');
      progress.award(20, 'All aboard!');
    }
    this.hud.showToastRaw('🚢', first ? 'All aboard the Sunny Dolphin!' : 'Back aboard the Sunny Dolphin!', 'Stairs go up to the top deck and the sun deck. Captain Poppy’s up by the wheel.', { tip: true });
    sfx.horn?.(0.5);
    this.later.push([1.0, () => this.captainSay(LINES.hello[first ? 0 : 1].replace('{name}', this.name()), 3.4)]);
    if (this.hatDone) this.later.push([4.5, () => this.captainSay('Your friends found my hat already! What a crew!', 3.6)]); // (with friends: it's back on her head)
    else this.later.push([4.5, () => { this.captainSay(this.saved.hats ? LINES.hat[1] : LINES.hat[0], 4.2); this.hud.float('Whoosh! 💨', this.captain.root.position.clone().add(V(0, 2.2, 0))); }]);
  }

  captainSay(text, dur = 3) { this.say(text, () => this.captain.root.position.clone().add(V(0, 2.1, 0)), dur); this.captain.wave = 1.2; }
  personSay(p, text, dur = 3) { this.say(text, () => p.root.position.clone().add(V(0, p === this.ollie ? 2.1 : 1.6, 0)), dur); }

  // ---------- 🐾, woofs, the scent trail ----------

  hint() {
    const held = this.actions.carry.held, c = this.captain.root.position, mp = this.pemberton.root.position, t = this.ted.root.position;
    if (held?.job === 'captain' && this.near(c, 2.4)) return { text: '🧢 Give Captain Poppy her hat! 🐾', paw: 'drop' };
    if (held?.job === 'pemberton' && this.near(mp, 2.6)) return { text: `🧳 Give Mrs Pemberton her ${held.def.name}! 🐾`, paw: 'drop' };
    if (held?.job === 'ted' && this.near(t, 2.4)) return { text: '🎾 Drop the ball for Grandad Ted! 🐾', paw: 'drop' };
    if (this.near(this.at(PLAN.bell.x, PLAN.bell.z), 1.5)) return { text: '🔔 Ring the ship’s bell! 🐾', paw: 'pull' };
    if (this.near(this.at(PLAN.horn.x, PLAN.horn.z, UP), 1.4)) return { text: '📯 Sound the ship’s horn! 🐾', paw: 'pull' };
    const c2 = this.actions.carry.hint(this.actions.nose());
    if (c2) return c2;
    const P = this.local();
    if (Math.abs(P.x) < PLAN.board.w + 0.1 && P.z > PLAN.board.z0 && P.z < PLAN.board.z1 && this.player.pos.y > UP - 0.2) return { text: '🌊 Run off the end for a cannonball!' };
    return null;
  }

  local(p = this.player.pos) { const o = this.W(0, 0); return { x: p.x - o.x, z: p.z - o.z }; }

  onDig() {
    if (this.near(this.at(PLAN.bell.x, PLAN.bell.z), 1.5)) { this.ringBell(); return true; }
    if (this.near(this.at(PLAN.horn.x, PLAN.horn.z, UP), 1.4)) { this.soundHorn(); return true; }
    this.hud.float(pick(['It’s a ship! No digging! ⚓', 'Planks. Just planks.']), this.actions.anchor());
    return true;
  }

  goal() {
    const carry = this.actions.carry, held = carry.held;
    if (held?.job === 'captain') return this.captain.root.position;
    if (held?.job === 'pemberton') return this.pemberton.root.position;
    if (held?.job === 'ted') return this.ted.root.position;
    const hat = this.item('hat');
    if (!this.hatDone && carry.items.includes(hat)) return hat.pos;
    const P = this.player.pos, lost = [...this.lostLeft].map((k) => this.item(k)).filter((it) => carry.items.includes(it)).sort((a, b) => a.pos.distanceToSquared(P) - b.pos.distanceToSquared(P));
    if (lost.length) return lost[0].pos;
    if (!this.cat.found) return this.cat.root.position;
    return null;
  }

  onBark() {
    const P = this.player.pos, cp = this.cat.root.position;
    this.sea.scareGulls();
    if (!this.cat.found && Math.hypot(cp.x - P.x, cp.z - P.z) < 4.2 && Math.abs(cp.y - P.y) < 3.2) { this.findCat(); return; }
    const pod = this.sea.leaping;
    if (pod && !this.sea.pod.waved) {
      this.sea.pod.waved = true;
      this.hud.float(pick(LINES.dolphins), this.actions.anchor().add(V(0, 0.3, 0)));
      progress.stat('dolphins');
      progress.award(5, 'Dolphins!');
      sfx.found?.();
      return;
    }
    if (this.sea.blowing && !this.sea.whale.waved) {
      this.sea.whale.waved = true;
      this.hud.float(pick(LINES.whale), this.actions.anchor().add(V(0, 0.3, 0)));
      progress.award(5, 'A whale!');
      sfx.found?.();
      return;
    }
    if (this.near(this.captain.root.position, 4, 1.5)) this.captainSay(pick(LINES.captain), 2.6);
    else if (this.near(this.ted.root.position, 4)) this.personSay(this.ted, 'Woof to you too, pup!', 2);
    else if (this.near(this.ollie.root.position, 4)) this.personSay(this.ollie, pick(LINES.ollie), 3.2);
  }

  // ---------- jobs ----------

  ringBell() {
    sfx.bell?.();
    buzz(15);
    this.hud.float('DING! 🔔', this.at(PLAN.bell.x, PLAN.bell.z, 1.9));
    if (!this.rang) { this.rang = true; progress.award(3, 'Ding ding!'); }
  }

  soundHorn() {
    if (this.time - this.honked < 2.5) return;
    this.honked = this.time;
    sfx.horn?.(1);
    buzz([30, 40, 60]);
    this.hud.float('HOOOONK! 📯', this.at(PLAN.funnel.x, PLAN.funnel.z, PLAN.funnel.top + 0.6));
    for (let i = 0; i < 3; i++) this.later.push([0.15 + i * 0.35, () => this.smoke(10)]);
    if (!this.honkedOnce) { this.honkedOnce = true; progress.award(3, 'Toot toot!'); this.later.push([1.8, () => this.captainSay('Ha! Lovely and loud!', 2.2)]); }
  }

  findCat() {
    const c = this.cat;
    c.found = true;
    c.startle = 1;
    sfx.meow?.();
    this.say(pick(LINES.cat), () => c.root.position.clone().add(V(0, 0.75, 0)), 2.6);
    this.actions.sparkle(c.root.position.clone().add(V(0, 0.3, 0)), 14);
    progress.stat('whiskers');
    progress.award(12, 'Found Admiral Whiskers!');
    this.hud.showToastRaw('🐱', `Found him ${c.hide}!`, 'Admiral Whiskers trots off to see the captain.');
    // Off he goes, to sit by the captain's feet.
    this.later.push([2.2, () => { const to = this.at(PLAN.captain.x - 0.8, PLAN.captain.z + 0.6, UP); c.hopTo(to, 0); this.catHome = true; }]);
    this.share?.set('cat', 1);
    this.objective();
  }

  /** A friend found Admiral Whiskers (by: their id), or he'd been found before she came aboard (by: -1). */
  catFoundBy(by) {
    const c = this.cat, to = this.at(PLAN.captain.x - 0.8, PLAN.captain.z + 0.6, UP);
    c.found = true;
    if (by === -1) { c.root.position.copy(to); this.catHome = true; this.objective(); return; } // (already sat by the captain)
    c.startle = 1;
    sfx.meow?.();
    this.actions.sparkle(c.root.position.clone().add(V(0, 0.3, 0)), 10);
    progress.award(4, `${this.friend(by)} found the cat!`);
    this.hud.showToastRaw('🐱', `<span class="who"></span> found Admiral Whiskers ${c.hide}!`, 'He trots off to see the captain.', { trip: true });
    this.hud.toast.querySelector('.who').textContent = this.friend(by);
    this.later.push([2.2, () => { c.hopTo(to, 0); this.catHome = true; }]);
    this.objective();
  }

  handHat(k) {
    const it = this.item(k);
    this.actions.carry.remove(it);
    it.obj.traverse((o) => o.geometry?.dispose());
    this.shareDone(k); // (with friends: back on her head for everyone)
    this.hatDone = true;
    const hats = (this.saved.hats ?? 0) + 1;
    this.ctx.town.save({ hats });
    this.saved = { ...this.saved, hats };
    const before = progress.stats.captain ?? 0;
    progress.stat('captain');
    progress.award(hats === 1 ? 25 : 12, 'The captain’s hat!');
    this.putCapOn();
    sfx.found?.();
    buzz([20, 30, 20]);
    this.actions.sparkle(this.captain.root.position.clone().add(V(0, 1.9, 0)), 18);
    this.captainSay(LINES.thanks.replace('{name}', this.name()), 3.4);
    const prize = COSMETICS.find((c) => c.friend === 'captain' && before < c.jobs && before + 1 >= c.jobs);
    if (prize) {
      this.later.push([3.6, () => this.captainSay(LINES.prize, 3.2)]);
      this.later.push([3.8, () => this.hud.showToastRaw(prize.emoji, `New: ${prize.name}!`, 'From Captain Poppy. Wear it from ☰ → My dog → Dress up.')]);
    }
    this.later.push([prize ? 7.4 : 3.6, () => this.personSay(this.pemberton, pick(LINES.pemberton).replace('{thing}', this.lostNames[0]).replace('{thing2}', this.lostNames[1]), 4)]);
    this.objective();
  }

  /** A friend gave Captain Poppy her hat back (by: their id), or it was back before she came aboard (by: -1). */
  hatReturned(by) {
    if (this.hatDone) return;
    this.hatDone = true;
    this.putCapOn();
    if (by === -1) { this.objective(); return; }
    // There when it happened: the captain's thanks (and the prize, the first time) for every dog aboard.
    const hats = (this.saved.hats ?? 0) + 1;
    this.ctx.town.save({ hats });
    this.saved = { ...this.saved, hats };
    const before = progress.stats.captain ?? 0, who = this.friend(by);
    progress.stat('captain');
    progress.award(8, `${who} found the captain’s hat!`);
    sfx.found?.();
    this.actions.sparkle(this.captain.root.position.clone().add(V(0, 1.9, 0)), 14);
    this.captainSay(`My hat! Thank you, ${who}! Thank you, all of you!`, 3.4);
    const prize = COSMETICS.find((c) => c.friend === 'captain' && before < c.jobs && before + 1 >= c.jobs);
    if (prize) {
      this.later.push([3.6, () => this.captainSay(LINES.prize, 3.2)]);
      this.later.push([3.8, () => this.hud.showToastRaw(prize.emoji, `New: ${prize.name}!`, 'From Captain Poppy. Wear it from ☰ → My dog → Dress up.', { trip: true })]);
    }
    this.later.push([prize ? 7.4 : 3.6, () => this.personSay(this.pemberton, pick(LINES.pemberton).replace('{thing}', this.lostNames[0]).replace('{thing2}', this.lostNames[1]), 4)]);
    this.objective();
  }

  putCapOn() {
    if (this.capOn) return;
    this.capOn = true;
    const h = this.captain.head;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.09, 20), paint(0xfbfaf6));
    crown.position.y = 0.12;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.03, 20, 1, true), paint(0x2f3a52));
    band.position.y = 0.09;
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 18, 1, false, -Math.PI / 2, Math.PI), paint(0x232b3d));
    peak.position.set(0, 0.075, 0.07); peak.rotation.y = Math.PI; peak.scale.z = 1.2;
    const badge = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), paint(0xe0b04a));
    badge.position.set(0, 0.11, 0.14); badge.scale.z = 0.4;
    h.add(crown, band, peak, badge);
  }

  handLost(k) {
    const it = this.item(k);
    this.actions.carry.remove(it);
    it.obj.traverse((o) => o.geometry?.dispose());
    this.shareDone(k); // (with friends: back with her for everyone)
    this.lostLeft.delete(k);
    this.lostDone++;
    progress.stat('luggage');
    sfx.found?.();
    this.actions.sparkle(this.pemberton.root.position.clone().add(V(0, 1.2, 0)), 14);
    this.pemberton.wave = 1.2;
    if (this.lostDone < 2) {
      progress.award(10, `${it.def.emoji} Mrs Pemberton’s ${it.def.name}!`);
      this.personSay(this.pemberton, pick(LINES.pThanks).replace('{thing}', it.def.name), 2.8);
    } else {
      progress.award(20, '🧳 Everything back!');
      sfx.hooray?.();
      this.personSay(this.pemberton, LINES.pAll, 4);
    }
    this.objective();
  }

  /** A friend gave Mrs Pemberton something back (by: their id), or it was back before she came aboard (by: -1). */
  lostReturned(k, by) {
    if (!this.lostLeft.delete(k)) return;
    this.lostDone++;
    if (by !== -1) {
      const who = this.friend(by);
      this.actions.sparkle(this.pemberton.root.position.clone().add(V(0, 1.2, 0)), 10);
      this.pemberton.wave = 1.2;
      progress.award(this.lostDone < 2 ? 3 : 6, `${who} found Mrs Pemberton’s ${this.lostName[k]}!`);
      this.personSay(this.pemberton, this.lostDone < 2 ? `Oh, ${who} found my ${this.lostName[k]}! Lovely dog!` : LINES.pAll, 3.2);
      if (this.lostDone >= 2) sfx.hooray?.();
    }
    this.objective();
  }

  // ---------- 🌊 cannonballs ----------

  cannonball(speed) {
    const score = Math.min(10, Math.round(speed * 10) / 10), whole = Math.floor(score);
    const P = this.player.pos;
    this.splash(P.clone().setY(PLAN.pool.surface + 0.05), Math.round(10 + score * 4), 1 + score * 0.2);
    sfx.splash?.();
    buzz(score > 8 ? [30, 30, 50] : 20);
    const best = score > this.best.cannon;
    if (best) { this.best.cannon = score; keepBest('cannonball', score); }
    progress.stat('cannonballs');
    if (whole >= 3) progress.award(whole, `Cannonball: ${score}!`);
    this.hud.float(`🌊 ${score}${best && score >= 3 ? ' · best!' : ''}`, P.clone().add(V(0, 1.4, 0)));
    const key = whole >= 10 ? 10 : whole >= 9 ? 9 : whole >= 7 ? 7 : whole >= 5 ? 5 : 1;
    this.later.push([0.5, () => { this.personSay(this.pemberton, `🪧 ${score}! ${LINES.judge[key]}`, 2.8); this.pemberton.wave = 1.5; }]);
    if (best && score >= 3) this.objective();
  }

  /** Spray and drops (at a world point): bigger for a bigger splash. */
  splash(p, n, k = 1) {
    this.actions.dirt.burst(n, () => ({
      pos: p.clone().add(V((Math.random() - 0.5) * 0.4 * k, 0.05, (Math.random() - 0.5) * 0.4 * k)),
      vel: V((Math.random() - 0.5) * 2.2 * k, (1.5 + Math.random() * 2.5) * k, (Math.random() - 0.5) * 2.2 * k),
      life: 0.7 + Math.random() * 0.5, size: 0.025 + Math.random() * 0.025, gravity: 9, floor: p.y - 0.05, color: Math.random() < 0.5 ? 0xffffff : 0xbfe4ec,
    }));
  }
  spout(p) {
    this.actions.dirt.burst(3, () => ({ pos: p.clone(), vel: V((Math.random() - 0.5) * 0.8, 4 + Math.random() * 2, (Math.random() - 0.5) * 0.8), life: 1.0, size: 0.12, gravity: 5, drag: 0.6, floor: p.y - 0.4, color: 0xf4f8fa }));
  }
  smoke(n = 3) {
    const f = PLAN.funnel, p = this.at(f.x, f.z, f.top + 0.2);
    this.actions.dirt.burst(n, () => ({ pos: p.clone().add(V((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), vel: V((Math.random() - 0.5) * 0.3, 1.4 + Math.random() * 0.6, 1.6 + Math.random() * 0.8), life: 2.2, size: 0.22 + Math.random() * 0.12, gravity: -0.2, drag: 0.4, color: Math.random() < 0.5 ? 0xd8d8dc : 0xe8e8ea }));
  }

  // ---------- 🎾 fetch with Grandad Ted ----------

  tickFetch(dt) {
    const F = this.fetch, carry = this.actions.carry, t = this.ted.root.position, P = this.player.pos;
    F.t -= dt;
    if (F.state === 'idle') {
      if (F.t <= 0 && this.near(t, 7, 1)) this.throwBall();
    } else if (F.state === 'flying') {
      F.k += dt / F.dur;
      const k = Math.min(1, F.k);
      this.ballFly.position.lerpVectors(F.from, F.to, k);
      this.ballFly.position.y += Math.sin(k * Math.PI) * 2.2;
      if (k >= 1) {
        this.ballFly.visible = false;
        F.ball = carry.add('ball', F.to.x, F.to.z, { job: 'ted' });
        F.state = 'out';
        sfx.boink?.();
      }
    } else if (F.state === 'out') {
      const b = F.ball;
      if (carry.items.includes(b) && (b.pos.x - t.x) ** 2 + (b.pos.z - t.z) ** 2 < 2.3 ** 2 && Math.abs(b.pos.y - t.y) < 1) {
        carry.remove(b);
        b.obj.traverse((o) => o.geometry?.dispose());
        F.ball = null;
        F.n++;
        progress.stat('fetch');
        progress.award(3, `Fetch! ${F.n}`);
        if (F.n > this.best.fetch) { this.best.fetch = F.n; keepBest('fetch', F.n); this.objective(); }
        this.hud.float(`🎾 ${F.n}!`, t.clone().add(V(0, 1.6, 0)));
        this.ted.wave = 1;
        F.state = 'idle';
        F.t = 1.2;
      } else if (!carry.items.includes(b) && carry.held !== b) { F.state = 'idle'; F.t = 2; F.ball = null; } // (gone: start again)
      else if ((P.x - t.x) ** 2 + (P.z - t.z) ** 2 > 20 ** 2 && carry.held !== b) { // (she's wandered off: the run's over)
        if (F.n) this.personSay(this.ted, `${F.n} in a row! Smashing!`, 2);
        F.n = 0;
      }
    }
  }

  throwBall() {
    const F = this.fetch, f = PLAN.fetch, t = this.ted.root.position;
    const x = f.x0 + Math.random() * (f.x1 - f.x0), z = f.z0 + Math.random() * (f.z1 - f.z0);
    F.from = t.clone().add(V(0.3, 1.0, 0.2));
    F.to = this.at(x, z, 0.02);
    F.k = 0;
    F.dur = 0.9 + F.from.distanceTo(F.to) * 0.08;
    F.state = 'flying';
    this.ballFly.visible = true;
    this.ballFly.position.copy(F.from);
    this.personSay(this.ted, F.n ? pick(LINES.ted.slice(1)) : LINES.ted[0], 1.6);
  }

  // ---------- every frame ----------

  tick(dt) {
    if (this.later.length) { for (const l of this.later) l[0] -= dt; for (const l of this.later.filter((q) => q[0] <= 0)) l[1](); this.later = this.later.filter((q) => q[0] > 0); }
    const P = this.player, carry = this.actions.carry;
    // Things put down by their owners: handed over.
    const close = (it, p, r = 2.3) => it && carry.items.includes(it) && !(it.friendAt !== undefined && this.time - it.friendAt < 2.5)
      && (it.pos.x - p.x) ** 2 + (it.pos.z - p.z) ** 2 < r * r && Math.abs(it.pos.y - p.y) < 1; // (just put down by a friend? Their game hands it over)
    if (!this.hatDone && close(this.item('hat'), this.captain.root.position)) this.handHat('hat');
    for (const k of this.lostLeft) if (close(this.item(k), this.pemberton.root.position, 2.6)) { this.handLost(k); break; }
    // A cannonball? (Into the pool from a height: how fast she was falling, not running.)
    if (P.enteredSpeed > 0 && P.inWater) { const fall = Math.max(-P.vy, -(this.lastVy ?? 0)); if (fall >= 3) this.cannonball(fall); }
    this.lastVy = P.vy;
    this.tickFetch(dt);
    // People: the captain turns to watch her, Ted and Mrs Pemberton just sit, Ollie mops along the port side.
    this.captain.update(dt, 0);
    this.sitting(this.pemberton, dt);
    this.sitting(this.ted, dt);
    const O = this.ollieAt, o = this.ollie, near = this.near(o.root.position, 2.6);
    O.chatT -= dt;
    if (near && O.chatT <= 0) { O.chatT = 20; O.pause = 3; this.personSay(o, pick(LINES.ollie), 3.4); }
    O.pause = Math.max(0, O.pause - dt);
    const sp = O.pause > 0 ? 0 : 0.7;
    O.z += O.dir * sp * dt;
    if (O.z < -14) O.dir = 1; else if (O.z > 6) O.dir = -1;
    o.root.position.copy(this.at(-5.75, O.z));
    o.root.rotation.y = O.dir > 0 ? 0 : Math.PI;
    o.update(dt, sp);
    // The cat: meows now and then when she's close (a clue), and follows her with his eyes.
    const c = this.cat;
    c.update(dt, P.pos);
    if (!c.found) {
      c.meowT -= dt;
      const d2 = (c.root.position.x - P.pos.x) ** 2 + (c.root.position.z - P.pos.z) ** 2;
      if (c.meowT <= 0 && d2 < 10 * 10) { c.meowT = 6 + Math.random() * 4; sfx.meow?.(); this.hud.float('meow?', c.root.position.clone().add(V(0, 0.7, 0))); }
    }
    // Smoke from the funnel now and then.
    if (Math.random() < dt * 1.2) this.smoke(1);
  }

  /** A sitting person's little movements (and a wave), staying sat down. */
  sitting(p, dt) {
    p.update(dt, 0);
    const s = p.userData ??= {};
    p.body.position.y = s.low;
    for (const l of p.legs) l.rotation.x = s.legs;
    p.arms[1].rotation.set(-0.45, 0, -0.25);
    if (p.wave <= 0) p.arms[0].rotation.set(-0.45, 0, 0.25);
  }

  /** Every frame (the world's own bits): the sea and the wake roll by, islands slide past, the flag flaps. */
  animate(t) {
    const b = this.built, dt = Math.min(0.1, t - (this.lastT ?? t));
    this.lastT = t;
    b.uniforms.uTime.value = t;
    b.wake.material.uniforms.uTime.value = t;
    b.sky.material.uniforms.uTime.value = t * 0.6;
    for (const i of b.islands) {
      i.z += dt * 3;
      if (i.z > 260) i.z -= 520;
      i.m.position.z = this.W(0, 0).z + i.z;
    }
    this.tender.position.y = SEA + Math.sin(t * 2.1) * 0.06;
    this.tender.rotation.z = Math.sin(t * 1.6) * 0.035;
    this.flag.rotation.y = Math.sin(t * 2.4) * 0.15;
    this.cloth.rotation.x = Math.sin(t * 6) * 0.05;
    b.water.position.y = PLAN.pool.surface + Math.sin(t * 1.3) * 0.008;
    this.sea.update(dt, t);
  }

  goHome() {
    this.hud.showToastRaw('🚢', 'Back to the beach!', 'The tender’s always waiting at the end of the jetty.');
  }

  dispose() {
    const it = this.actions.carry.consume(); // (anything still in her mouth stays aboard)
    it?.obj.traverse((o) => o.geometry?.dispose());
    super.dispose();
  }
}
