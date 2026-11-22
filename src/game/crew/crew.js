import * as THREE from 'three';
import { BREEDS } from '../../entities/breeds.js';
import { waterAt } from '../../world/water.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { LineBag, fill } from '../dialogue.js';
import { CREW } from '../lines/crew.js';
import { PALS, PAL, SKILLS, palBreed } from './roster.js';
import { pals, MAX_CREW } from './pals.js';
import { CrewDog } from './crewDog.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const TRAIL_STEP = 0.35;   // metres between breadcrumbs on the leader's path
const TRAIL_MAX = 160;     // breadcrumbs kept (about 55 m of path)
const LAG = [1.5, 2.6, 3.7]; // how far back along the path each follower walks
const TOO_FAR = 26;        // further behind than this (along the path): tunnel to catch up
const NEAR_HOME = 50, FAR_HOME = 70;
const SHADOWS = 24;        // pals further away than this from the leader cast no shadow // pals in your garden come out when you're this near it (and go in past FAR_HOME)

// Where each pal lives, as a hint on the crew card before you've met them.
const WHERE = {
  park: 'Somebody in the park…', pond: 'Somebody by the pond…', bakery: 'Somebody on bakery street…', alley: 'Somebody down the alley…',
  garden: 'Somebody stuck in a garden…', street: 'Somebody zooming round the streets…', farm: 'Somebody at the farm…',
  beach: 'Somebody on the beach…', woods: 'Somebody in the woods…',
};

/*
 * 🐾 Your crew: the pals who come along with you (up to three), following your path (hopping what you hopped,
 * paddling where you paddled, waiting below when you climb, tunnelling after you when they're left behind),
 * barking when you bark and joining in your tricks. The rest of your pals hang out in your garden: walk up to
 * one and woof, and they swap in. A crew dog gives you a leg-up to the team bones (the pink-ringed ones).
 *
 * Town dogs become pals in ./townDogs.js, which hands their dog over with welcome(). Who's a pal and who's
 * following is kept in ./pals.js. ☰ → 🐾 My crew shows them all.
 */
export class Crew {
  constructor({ scene, world, hud, player, actions, follow, dogName, homeGarden, bones = () => [] }) {
    Object.assign(this, { scene, world, hud, player, actions, follow, dogName, homeGarden, bones });
    this.ctx = { scene, world, groundAt: (x, z) => world.heightAt?.(x, z) ?? 0, fx: actions, time: () => this.time };
    this.time = 0;
    this.members = new Map(); // id → { id, pal, cd: CrewDog|null, mode: 'follow'|'help'|'waiting'|'leaving'|'garden', … }
    this.trail = [];
    this.started = false;
    this.last = V(0, 0, 0);
    this.stillT = 0;
    this.chatT = 20 + Math.random() * 15;
    this.queue = [];          // little things to do in a moment: [{ t, fn }] (a bark chorus, copying a trick)
    this.bags = {};
    this.boneHint = null;
    this.helping = null;      // { m, bone, spot, t, said }
    pals.onChange(() => { if (this.started) this.reconcile(); });
    hud.onCrew = () => this.showCard();
  }

  line(key, vars = {}) {
    this.bags[key] ??= new LineBag(CREW[key]);
    return fill(this.bags[key].next(), { name: this.dogName(), ...vars });
  }
  /** One of them says something (with their name, so you get to know who's who). */
  say(m, key, dur = 3) {
    if (!m.cd) return;
    const head = () => m.cd.pos.clone().add(V(0, 0.95 * m.cd.size + 0.15, 0));
    this.hud.say(`${m.pal.emoji} <b>${m.pal.name}:</b> ${this.line(key, { pal: m.pal.name })}`, head, dur);
  }

  get followers() { return pals.following().map((id) => this.members.get(id)).filter((m) => m?.cd && (m.mode === 'follow' || m.mode === 'help')); }

  // ---------- who's who ----------

  member(id) {
    let m = this.members.get(id);
    if (!m) {
      const pal = PAL[id];
      m = { id, pal, breed: palBreed(pal, this.player.breedKey), cd: null, mode: 'garden', g: null };
      this.members.set(id, m);
    }
    return m;
  }

  makeDog(m, at, dog = null) {
    m.cd = new CrewDog(m.pal, m.breed, this.ctx, { dog, at });
    return m.cd;
  }

  /** Match the members to who's a pal and who's following (after a change, or on the way in). */
  reconcile() {
    const fol = pals.following(), P = this.player;
    for (const [id, m] of this.members) if (!pals.isPal(id)) { m.cd?.remove(); this.members.delete(id); } // (another dog's pals)
    fol.forEach((id, i) => {
      const m = this.member(id);
      if (m.mode === 'follow' || m.mode === 'help') return;
      m.mode = 'follow';
      m.k = -1;
      if (!m.cd) { this.makeDog(m, null); m.cd.popUp(this.spotNear(i)); }
      else if (!m.cd.root.visible || flat(m.cd.pos, P.pos) > 30) { m.cd.root.visible = true; m.cd.popUp(this.spotNear(i)); }
    });
    for (const p of pals.all()) {
      if (fol.includes(p.id)) continue;
      const m = this.member(p.id);
      if (m.mode === 'follow' || m.mode === 'help') { m.mode = 'leaving'; m.leaveT = 0; this.say(m, 'home', 2.6); if (this.helping?.m === m) this.helping = null; }
    }
  }

  /**
   * A town dog just became your pal (see ./townDogs.js): their dog is at `at` ({ x, z, heading }), and from
   * now on it's the crew's. First time: a card to say hello, and whether they come along or meet you at home.
   */
  welcome(id, at, { first = true, dog = null } = {}) {
    const pal = PAL[id];
    if (!pal) return;
    const m = this.member(id);
    if (dog && !m.cd) this.makeDog(m, at, dog);
    else if (!m.cd) { this.makeDog(m, at); }
    m.mode = 'waiting';
    if (!first) { this.choose(m, pals.following().length < MAX_CREW ? 'come' : 'home'); return; }
    const skill = SKILLS[pal.skill];
    const fol = pals.following().map((f) => PAL[f]);
    const full = fol.length >= MAX_CREW;
    const buttons = full
      ? [...fol.map((f) => [`🔁 Swap with ${f.name}`, () => { this.hud.hideCard(); this.choose(m, 'swap', f.id); }]), ['🏡 Meet you at home', () => { this.hud.hideCard(); this.choose(m, 'home'); }]]
      : [['🐾 Come along!', () => { this.hud.hideCard(); this.choose(m, 'come'); }], ['🏡 Meet you at home', () => { this.hud.hideCard(); this.choose(m, 'home'); }]];
    let chosen = false;
    const wrap = (fn) => () => { chosen = true; fn(); };
    this.hud.showCard(`
      <h1>${m.pal.emoji} New pal: ${pal.name}!</h1>
      <p>${pal.blurb}</p>
      <p>Good at: <b>${skill.emoji} ${skill.name}</b></p>
      <p>${full ? `Your crew’s full (${MAX_CREW} at a time). Swap someone, or ${pal.name} can wait in your garden.` : `${pal.name} wants to join your crew!`}</p>`,
    buttons.map(([label, fn]) => [label, wrap(fn)]),
    { onClose: () => { if (!chosen && m.mode === 'waiting') this.choose(m, full ? 'home' : 'come'); } });
    sfx.hooray?.();
    buzz([20, 30, 20]);
  }

  /** come: join the crew · home: off to your garden · swap: join, and `out` goes home. */
  choose(m, how, out = null) {
    if (m.mode !== 'waiting') return;
    const fol = pals.following();
    if (how === 'come' && fol.length < MAX_CREW) { m.mode = 'follow'; m.k = -1; pals.setFollowing([...fol, m.id]); this.say(m, 'joined', 3); return; }
    if (how === 'swap' && out) { m.mode = 'follow'; m.k = -1; pals.setFollowing([...fol.filter((f) => f !== out), m.id]); this.say(m, 'joined', 3); return; }
    m.mode = 'leaving'; m.leaveT = 0;
    this.say(m, 'home', 2.8);
  }

  // ---------- where to stand ----------

  /** Somewhere a pal can stand at (x, z): nothing in the way, and not in water unless the leader is. */
  okSpot(x, z, wet = false) {
    if (!wet && waterAt(this.world.water, x, z)) return false;
    const b = this.world.bounds;
    if (b && (x < b.x0 + 1 || x > b.x1 - 1 || z < b.z0 + 1 || z > b.z1 - 1)) return false;
    const C = this.world.colliders, r = 0.4, y = this.ctx.groundAt(x, z) + 0.3;
    for (const c of C.circles) if (c.top > y && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return false;
    for (const q of C.boxes) if (q.top > y && x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r) return false;
    return true;
  }

  /** A spot just behind the leader for follower `i` (fanning out), or near enough. */
  spotNear(i) {
    const P = this.player, wet = !!waterAt(this.world.water, P.pos.x, P.pos.z);
    const size = this.followers[i]?.cd.size ?? 1;
    const base = P.heading + Math.PI, fan = [0, 0.85, -0.85][i] ?? 0, r0 = 0.9 + 0.8 * size + 0.35 * i;
    for (const [da, dr] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.8], [1.1, 0], [-1.1, 0], [1.7, 0.3], [-1.7, 0.3], [Math.PI, 0]]) {
      const a = base + fan + da, r = r0 + dr, x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
      if (this.okSpot(x, z, wet)) return { x, z, heading: a + Math.PI };
    }
    return { x: P.pos.x, z: P.pos.z, heading: P.heading };
  }

  gardenSpot(rect) {
    for (let i = 0; i < 30; i++) {
      const x = rect.x0 + 1 + Math.random() * Math.max(0.1, rect.x1 - rect.x0 - 2), z = rect.z0 + 1 + Math.random() * Math.max(0.1, rect.z1 - rect.z0 - 2);
      if (this.okSpot(x, z)) return { x, z, heading: Math.random() * Math.PI * 2 };
    }
    return null;
  }

  // ---------- the leader's path ----------

  /** Breadcrumbs along where the leader's been (on the ground or paddling: not up on top of things). */
  updateTrail() {
    const P = this.player, t = this.trail, last = t[t.length - 1];
    const high = P.pos.y - this.ctx.groundAt(P.pos.x, P.pos.z) > 0.55 && !P.inWater;
    if (!last) { t.push({ x: P.pos.x, z: P.pos.z, high, s: 0 }); return; }
    const d = Math.hypot(P.pos.x - last.x, P.pos.z - last.z);
    if (d < TRAIL_STEP) { if (!high && last.high) last.high = false; return; }
    t.push({ x: P.pos.x, z: P.pos.z, high, s: last.s + d });
    if (t.length > TRAIL_MAX) {
      const cut = 40;
      t.splice(0, cut);
      for (const m of this.members.values()) if (m.k !== undefined) m.k -= cut;
    }
  }

  /** Index of the breadcrumb `lag` metres back from the leader (the newest one, at least). */
  lagIndex(lag) {
    const t = this.trail, head = t[t.length - 1];
    let i = t.length - 1;
    while (i > 0 && head.s - t[i].s < lag) i--;
    return i;
  }

  /** Nearest breadcrumb to (x, z) among the newest ones. */
  nearestCrumb(p, back = 40) {
    const t = this.trail;
    let best = t.length - 1, bd = Infinity;
    for (let i = Math.max(0, t.length - back); i < t.length; i++) { const d = Math.hypot(t[i].x - p.x, t[i].z - p.z); if (d < bd) { bd = d; best = i; } }
    return { i: best, d: bd };
  }

  /** Everyone back with the leader at once (a tunnel trip, a teleport to a start line, back from a day out). */
  regroup() {
    const P = this.player;
    this.trail = [{ x: P.pos.x, z: P.pos.z, high: false, s: 0 }];
    this.followers.forEach((m, i) => { m.k = 0; const far = !m.cd.root.visible || flat(m.cd.pos, P.pos) > 12; m.cd.root.visible = true; if (far) m.cd.popUp(this.spotNear(i)); else m.cd.tunnel(this.spotNear(i)); m.stuckT = 0; });
    if (this.helping) this.helping = null;
    this.stillT = 0;
  }

  // ---------- per frame ----------

  update(dt, { barked = false, canAct = true } = {}) {
    const P = this.player;
    this.time += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q.t -= dt; if (q.t <= 0) { this.queue.splice(i, 1); q.fn(); } }
    if (!this.started) {
      if (P.frozen) return;
      this.started = true;
      this.last.copy(P.pos);
      this.trail = [{ x: P.pos.x, z: P.pos.z, high: false, s: 0 }];
      this.reconcile();
    }
    // Off somewhere she can't be followed (on the bus…): out of sight, and back with her when she's back.
    const hidden = !P.object.visible;
    if (hidden !== !!this.hidden) {
      this.hidden = hidden;
      for (const m of this.followers) m.cd.root.visible = !hidden;
      if (!hidden) this.regroup();
    }
    if (hidden) return;
    if (flat(P.pos, this.last) > 6) this.regroup(); // (popped somewhere: a tunnel, a start line)
    this.last.copy(P.pos);
    this.updateTrail();
    const moving = P.speed > 0.5 || !P.grounded;
    this.stillT = moving ? 0 : this.stillT + dt;

    this.updateLegUp(dt);
    const fol = this.followers;
    fol.forEach((m, i) => (m.mode === 'help' ? this.updateHelper(dt, m) : this.updateFollower(dt, m, i)));
    for (const m of this.members.values()) {
      if (m.mode === 'waiting') this.updateWaiting(dt, m);
      else if (m.mode === 'leaving') this.updateLeaving(dt, m);
    }
    this.separate(fol);
    this.updateGarden(dt, barked, canAct);
    // Shadows only close by (as everything else out in town).
    for (const m of this.members.values()) if (m.cd?.root.visible) m.cd.shadow(flat(m.cd.pos, P.pos) < SHADOWS);

    // Join in: a woof and they woof too; a trick and they do it too.
    if (barked) fol.forEach((m) => this.queue.push({ t: 0.15 + Math.random() * 0.45, fn: () => this.woof(m) }));
    const trick = P.emoted;
    if (trick) fol.forEach((m) => this.queue.push({ t: 0.25 + Math.random() * 0.5, fn: () => this.copy(m, trick) }));
    // And a little chatter now and then.
    this.chatT -= dt;
    if (this.chatT <= 0 && fol.length) {
      this.chatT = 28 + Math.random() * 30;
      const m = fol[Math.floor(Math.random() * fol.length)];
      if (flat(m.cd.pos, P.pos) < 10) this.say(m, this.stillT > 3 ? 'rest' : 'chatter', 2.8);
    }
  }

  woof(m) {
    if (!m.cd) return;
    m.cd.dog.bark();
    const d = flat(m.cd.pos, this.player.pos);
    if (d < 35) sfx.bark(m.cd.dog.breed.bark, Math.max(0.12, 0.55 - d / 70));
  }

  copy(m, kind) {
    if (!m.cd || m.cd.speed > 0.6 || m.cd.swim > 0.3) return;
    m.cd.trick(kind);
    if (kind === 'howl') sfx.howl?.(m.cd.dog.breed.bark, 0.35);
  }

  /** Following the leader's path, at its own distance back; resting round the leader when the leader stops. */
  updateFollower(dt, m, i) {
    const P = this.player, cd = m.cd, t = this.trail;
    if (cd.pop) { cd.update(dt); return; }
    if (m.k === undefined || m.k < 0 || m.k >= t.length) m.k = this.nearestCrumb(cd.pos).i;
    const lag = LAG[i] * (0.8 + 0.25 * cd.size);
    let goal = this.lagIndex(lag);
    // The leader's up on top of something: wait at the bottom. (Back down again, over a hedge say: on they come,
    // hopping it too.)
    let waiting = false;
    if (t[t.length - 1].high) while (goal > 0 && t[goal].high) { goal--; waiting = true; }
    if (waiting && Math.random() < dt * 0.08 && flat(cd.pos, P.pos) < 12) this.say(m, 'wait', 2.4);
    // Resting: the leader's stopped. Find a spot round them and sit (once it's caught up along the path).
    const behind = t[goal].s - t[Math.min(m.k, goal)].s;
    if (this.stillT > 0.6 && !waiting && P.grounded && (m.rest || behind < 3)) {
      if (!m.rest || this.stillT < 0.7) m.rest = this.spotNear(i);
      const left = cd.update(dt, { tx: m.rest.x, tz: m.rest.z, want: 3.6, face: Math.atan2(P.pos.x - cd.pos.x, P.pos.z - cd.pos.z), sniff: Math.random() < 0.2 });
      if (left < 0.15 && this.stillT > 2.2) cd.sitting = true;
      m.k = this.nearestCrumb(cd.pos, 30).i;
      return;
    }
    m.rest = null;
    // Walk the path: on to the next breadcrumb, until it's at its own place along it.
    if (m.k > goal) m.k = goal;
    while (m.k < goal && Math.hypot(t[m.k].x - cd.pos.x, t[m.k].z - cd.pos.z) < 0.55) m.k++;
    const c = t[m.k];
    const along = Math.hypot(c.x - cd.pos.x, c.z - cd.pos.z) + (t[goal].s - c.s);
    const want = Math.min(Math.max(3.4, P.speed * 1.2 + 0.6), along * 3.5 + 0.3);
    const before = along;
    cd.update(dt, { tx: c.x, tz: c.z, want: along < 0.3 ? 0 : want, left: along, happy: P.speed > 3 ? 1 : 0.7 });
    // Too far behind, or stuck on something: tunnel after the leader.
    m.stuckT = want > 1 && m.lastAlong !== undefined && m.lastAlong - before < 0.6 * dt ? (m.stuckT ?? 0) + dt : 0;
    m.lastAlong = before;
    if (along > TOO_FAR || m.stuckT > 2.5) { m.stuckT = 0; m.k = goal; const s = t[goal]; cd.tunnel({ x: s.x, z: s.z, heading: P.heading }); this.queue.push({ t: 0.8, fn: () => this.say(m, 'popped', 2.2) }); }
  }

  /** Just made friends: wagging, looking at you, waiting to hear whether they're coming. */
  updateWaiting(dt, m) {
    const P = this.player;
    m.cd.update(dt, { face: Math.atan2(P.pos.x - m.cd.pos.x, P.pos.z - m.cd.pos.z), happy: 1 });
  }

  /** Off home: trotting away, then (out of sight, or after a bit) into the garden. */
  updateLeaving(dt, m) {
    const cd = m.cd, P = this.player;
    if (!cd) { m.mode = 'garden'; return; }
    m.leaveT += dt;
    if (cd.pop) { cd.update(dt); if (!cd.pop && m.leaveT > 1) this.toGarden(m); return; }
    const rect = this.homeGarden();
    const home = rect ? { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 } : null;
    const away = home && flat(home, cd.pos) > 2 ? Math.atan2(home.x - cd.pos.x, home.z - cd.pos.z) : Math.atan2(cd.pos.x - P.pos.x, cd.pos.z - P.pos.z);
    cd.update(dt, { tx: cd.pos.x + Math.sin(away) * 3, tz: cd.pos.z + Math.cos(away) * 3, want: 3 });
    if (m.leaveT > 2.6) {
      if (rect && flat(P.pos, home) < NEAR_HOME) { const s = this.gardenSpot(rect); if (s) { cd.tunnel(s); return; } }
      cd.puff(cd.pos, 12);
      this.toGarden(m);
    }
  }

  toGarden(m) {
    m.mode = 'garden';
    m.g = null;
    const rect = this.homeGarden();
    if (!rect || flat(this.player.pos, { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 }) > NEAR_HOME) m.cd.root.visible = false;
  }

  /** Followers keep a little apart (not all in a heap), and off the leader's toes. */
  separate(list) {
    const P = this.player;
    for (const m of list) if (m.mode !== 'help') this.keepOff(m.cd, P.pos, (P.radius ?? 0.28) + 0.12); // (not one giving a leg-up: hop on!)
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = list[a].cd, B = list[b].cd;
      if (A.pop || B.pop) continue;
      const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz), want = A.r + B.r + 0.15;
      if (d < want && d > 1e-4) { const k = (want - d) / 2 / d; A.pos.x -= dx * k; A.pos.z -= dz * k; B.pos.x += dx * k; B.pos.z += dz * k; }
    }
  }

  /** Nudge a pal out of the way of something at `p` (radius `r`): the leader, mostly. */
  keepOff(cd, p, r) {
    if (!cd || cd.pop || Math.abs(cd.pos.y - p.y) > 0.6) return;
    const dx = cd.pos.x - p.x, dz = cd.pos.z - p.z, d = Math.hypot(dx, dz), want = r + cd.r;
    if (d < want && d > 1e-4) { cd.pos.x = p.x + (dx / d) * want; cd.pos.z = p.z + (dz / d) * want; }
  }

  // ---------- a leg-up to the team bones ----------

  updateLegUp(dt) {
    const P = this.player, H = this.helping;
    this.boneHint = null;
    if (H) {
      H.t += dt;
      const gone = H.bone.got, far = flat(P.pos, H.bone) > 10;
      if (gone || far || H.t > 60 || !this.followers.includes(H.m)) {
        if (gone && H.m.cd) this.queue.push({ t: 0.6, fn: () => this.say(H.m, 'legupDone', 2.4) });
        if (H.m.mode === 'help') { H.m.mode = 'follow'; H.m.k = -1; }
        this.helping = null;
      } else if (H.ready) this.boneHint = `Hop on ${H.m.pal.name}’s back, then jump! 🐾`;
      return;
    }
    const fol = this.followers;
    if (!fol.length || P.onFriend) return;
    const bone = this.bones().find((b) => b.friend && !b.got && flat(b, P.pos) < 7 && P.pos.y < b.need);
    if (!bone) return;
    const m = fol.reduce((a, b) => (b.cd.size > a.cd.size ? b : a));
    // Somewhere on the ground right beside whatever the bone's up on, on the leader's side.
    let spot = null, best = Infinity;
    for (let r = 0.7; r <= 2.1 && !spot; r += 0.35) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, x = bone.x + Math.sin(a) * r, z = bone.z + Math.cos(a) * r;
        if (!this.okSpot(x, z)) continue;
        const d = Math.hypot(x - P.pos.x, z - P.pos.z);
        if (d < best) { best = d; spot = { x, z, face: a + Math.PI / 2 }; } // (side on to it: a long back to land on)
      }
    }
    if (!spot) return;
    m.mode = 'help';
    this.helping = { m, bone, spot, t: 0, ready: false };
  }

  updateHelper(dt, m) {
    const H = this.helping, cd = m.cd;
    if (!H || H.m !== m) { m.mode = 'follow'; return; }
    if (cd.pop) { cd.update(dt); return; }
    cd.sitting = false;
    const left = cd.update(dt, { tx: H.spot.x, tz: H.spot.z, want: 4.2, face: H.spot.face, happy: 1 });
    if (left < 0.12 && cd.speed < 0.3) {
      if (!H.ready) { H.ready = true; this.say(m, 'legup', 3.2); this.woof(m); }
    } else if (left > 0.5) H.ready = false;
    if (H.t > 6 && !H.ready && left > 3) { cd.tunnel({ x: H.spot.x, z: H.spot.z, heading: H.spot.face }); H.t = 0; }
  }

  /** Crew backs the player can stand on: the one giving a leg-up (out: a list to add to). */
  platforms(out = []) {
    const H = this.helping;
    if (H?.ready && H.m.cd && !H.m.cd.pop) out.push(H.m.cd.back());
    return out;
  }

  /** Where the crew are (for the cars, which stop for dogs). out: a list to add to. */
  positions(out = []) {
    for (const m of this.followers) if (m.cd.root.visible) out.push(m.cd.pos);
    return out;
  }

  // ---------- your garden ----------

  updateGarden(dt, barked, canAct) {
    const rect = this.homeGarden(), P = this.player;
    const garden = [...this.members.values()].filter((m) => m.mode === 'garden');
    if (!rect || !garden.length) return;
    const mid = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 }, d = flat(P.pos, mid);
    const show = d < (this.gardenShown ? FAR_HOME : NEAR_HOME);
    const inside = P.pos.x > rect.x0 && P.pos.x < rect.x1 && P.pos.z > rect.z0 && P.pos.z < rect.z1;
    if (!show) {
      if (this.gardenShown) for (const m of garden) if (m.cd) m.cd.root.visible = false;
      this.gardenShown = false;
      this.wasInside = false;
      return;
    }
    const arriving = !this.gardenShown;
    this.gardenShown = true;
    for (const m of garden) {
      if (m.cd?.root.visible && !arriving) continue; // (out already: just new pals, or ones just home, to bring out)
      const s = this.gardenSpot(rect);
      if (!s) continue;
      if (!m.cd) this.makeDog(m, s); else { m.cd.root.visible = true; m.cd.place(s.x, s.z, s.heading); }
      m.g = null;
    }
    // Coming home: they all come running to say hello.
    if (inside && !this.wasInside && canAct) {
      garden.forEach((m, i) => { if (m.cd) m.g = { kind: 'greet', t: 0 }; if (i === 0) this.queue.push({ t: 0.5, fn: () => this.say(m, 'greet', 2.8) }); });
    }
    this.wasInside = inside;
    let nearest = null, nd = Infinity;
    for (const m of garden) {
      const cd = m.cd;
      if (!cd || !cd.root.visible) continue;
      if (cd.pop) { cd.update(dt); continue; }
      const dp = flat(cd.pos, P.pos);
      if (dp < nd) { nd = dp; nearest = m; }
      this.keepOff(cd, P.pos, (P.radius ?? 0.28) + 0.12);
      m.g ??= { kind: 'sit', t: 2 + Math.random() * 5 };
      const g = m.g;
      g.t -= dt;
      if (g.kind === 'greet') {
        const a = Math.atan2(cd.pos.x - P.pos.x, cd.pos.z - P.pos.z), r = 1.3 + 0.3 * cd.size;
        cd.update(dt, { tx: P.pos.x + Math.sin(a) * r, tz: P.pos.z + Math.cos(a) * r, want: 3.6, face: a + Math.PI, happy: 1 });
        if (g.t < -0.6 && !g.woofed) { g.woofed = true; this.woof(m); }
        if (g.t < -4) m.g = { kind: 'sit', t: 1 + Math.random() * 3 };
      } else if (g.kind === 'walk') {
        const left = cd.update(dt, { tx: g.to.x, tz: g.to.z, want: 1.1, sniff: g.sniff });
        if (left < 0.2 || g.t < 0) m.g = { kind: 'sit', t: 4 + Math.random() * 8 };
      } else {
        cd.sitting = g.t < 6;
        cd.update(dt, { face: dp < 6 ? Math.atan2(P.pos.x - cd.pos.x, P.pos.z - cd.pos.z) : null, happy: dp < 4 ? 1 : 0.4 });
        if (g.t <= 0) {
          const to = this.gardenSpot(rect);
          m.g = to ? { kind: 'walk', to, sniff: Math.random() < 0.6, t: 12 } : { kind: 'sit', t: 5 };
          if (Math.random() < 0.15 && dp < 14) this.say(m, 'garden', 2.6);
        }
      }
    }
    // Walk up to one and they ask to come; woof and they swap in.
    if (!nearest || !canAct) return;
    if (nd < 1.9 && P.speed < 0.5) {
      if (this.asked !== nearest.id) { this.asked = nearest.id; this.say(nearest, 'ask', 3); }
    } else if (nd > 3.5 && this.asked === nearest.id) this.asked = null;
    if (barked && nd < 2.6) {
      const asked = this.members.get(this.asked); // (the one who asked, if they're still close)
      this.swapIn(asked?.mode === 'garden' && asked.cd && flat(asked.cd.pos, P.pos) < 3 ? asked : nearest);
    }
  }

  /** A pal from the garden comes along (and if the crew's full, whoever's been out longest has a rest). */
  swapIn(m) {
    const fol = pals.following();
    const out = fol.length >= MAX_CREW ? fol[0] : null;
    m.mode = 'follow'; m.k = -1; m.g = null;
    if (out) {
      const o = this.members.get(out);
      if (o?.cd) { o.mode = 'garden'; o.g = { kind: 'walk', to: this.gardenSpot(this.homeGarden()) ?? { x: o.cd.pos.x, z: o.cd.pos.z }, t: 8 }; this.say(o, 'swapOut', 2.6); }
      if (this.helping?.m === o) this.helping = null;
    }
    pals.setFollowing([...fol.filter((f) => f !== out), m.id]);
    this.say(m, 'swapIn', 2.6);
    this.woof(m);
    buzz(15);
    this.asked = null;
  }

  // ---------- ☰ → 🐾 My crew ----------

  showCard() {
    const render = () => {
      const fol = pals.following(), met = pals.all().length;
      const tiles = PALS.map((p) => {
        if (!pals.isPal(p.id)) return `<button class="witem" disabled>❔<small>${WHERE[p.home] ?? 'Somebody somewhere…'}</small></button>`;
        const b = palBreed(p, this.player.breedKey), on = fol.includes(p.id), sk = SKILLS[p.skill];
        return `<button class="witem${on ? ' on' : ''}" data-pal="${p.id}">${p.emoji}<small><b>${p.name}</b></small><small class="wb">${sk.emoji} ${sk.name}</small><small class="wb">${on ? '🐾 With you' : '🏡 At home'}</small></button>`;
      }).join('');
      this.hud.showCard(`
        <h1>🐾 My crew</h1>
        <p>${met ? `Up to ${MAX_CREW} pals come along with you; the rest hang out in your garden. Tap to choose. <b>${fol.length}/${MAX_CREW}</b> with you.` : 'Make friends with the dogs around town and they’ll join your crew!'}</p>
        <div class="witems crew-pals">${tiles}</div>
        <p><small>Pals met: <b>${met}/${PALS.length}</b>. In your garden, walk up to a pal and woof to swap them in.</small></p>`,
      [['Done', () => this.hud.hideCard()]]);
      for (const b of this.hud.card.querySelectorAll('[data-pal]')) {
        b.onclick = () => {
          const id = b.dataset.pal, cur = pals.following();
          if (cur.includes(id)) pals.setFollowing(cur.filter((f) => f !== id));
          else if (cur.length < MAX_CREW) pals.setFollowing([...cur, id]);
          else { this.hud.showToastRaw('🐾', `${MAX_CREW} at a time!`, 'Tap someone who’s with you to send them home first.', { tip: true }); return; }
          render();
        };
      }
    };
    render();
  }
}
