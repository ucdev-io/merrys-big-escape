import * as THREE from 'three';
import { Hedgehog } from '../../entities/hedgehog.js';
import { RobotMower } from '../../entities/robotMower.js';
import { SPHERE, bakedMesh } from '../../entities/shapes.js';
import { RNG } from '../../core/rng.js';
import { sfx } from '../../core/audio.js';
import { fsfx } from '../../core/friendSounds.js';
import { buzz } from '../../core/haptics.js';
import { blocked, freeSpot } from '../../world/spots.js';
import { LineBag, fill } from '../dialogue.js';
import { progress } from '../progress.js';
import { PEPPER, MOWER } from '../lines/park.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const PACE = 0.85, GAP = 1.3, LAG = 9;   // Pepper's pace (a walking dog does 2.6), how close she keeps, "wait for me!"
const SCARY = 3.0, SAFE = 4.2;           // the mower nearer than SCARY: ball! Further than SAFE for a moment: phew
const MOW_R = 0.55;                      // the mower's size (dogs bump off it)

/** Step towards (tx, tz) at `speed`, veering round anything in the way. Returns the heading, or null if stuck. */
function walk(world, p, tx, tz, speed, dt, pad = 0.15) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return null;
  const step = Math.min(d, speed * dt);
  for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
    const c = Math.cos(a), s = Math.sin(a), vx = (dx / d) * c - (dz / d) * s, vz = (dx / d) * s + (dz / d) * c;
    if (blocked(world, p.x + vx * step, p.z + vz * step, pad)) continue;
    p.x += vx * step;
    p.z += vz * step;
    return Math.atan2(vx, vz);
  }
  return null;
}

/** Pepper's front door: a little heap of autumn leaves under the hedge. */
function leafPile(x, z) {
  const cols = [0xd9893c, 0xc0632d, 0xe0b04a, 0x9a6a3a, 0xb5482a];
  return bakedMesh(Array.from({ length: 16 }, (_, i) => {
    const a = i * 2.4, r = Math.sqrt(i / 16) * 0.32;
    return [SPHERE, cols[i % cols.length], [Math.cos(a) * r, 0.08 - r * 0.15, Math.sin(a) * r], [0.35 * Math.sin(i), a, 0.3 * Math.cos(i)], [0.075, 0.014, 0.042]];
  }), null, [x, 0.02, z]);
}

/**
 * 🦔 Pepper the hedgehog lives under the park hedge and would love to visit the flowerbeds — if only
 * it weren't for Mowbot, the robot lawnmower trundling round the park (perfectly harmless; she doesn't
 * believe it). Walk up and she asks you to take her; she follows you, slowly. When Mowbot comes near
 * — and it's curious, it'll come and say hello — she pops into a ball until it's gone. Woof at Mowbot
 * to shoo it away. Get her to the flowers for stars and friendship (the `pepper` stat earns a prize).
 * Each player's Pepper (and Mowbot) is their own, like Gus and Duchess.
 */
export class Pepper {
  constructor({ scene, world, hud, player, actions, friends, seed, dogName }) {
    Object.assign(this, { scene, world, hud, player, actions, friends, dogName });
    const park = world.layout.places.find((p) => p.type === 'park');
    const P = (this.park = V(park?.x ?? 0, 0, park?.z ?? 0));
    const rng = new RNG(`pepper:${seed}`);
    // The park's two flowerbeds (her favourite place), and her nest by the hedge.
    this.beds = (world.beds ?? []).map((b) => V((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2)).filter((b) => flat(b, P) < 6);
    if (!this.beds.length) this.beds = [V(P.x - 2.8, 0, P.z + 2.8)];
    let nest = null;
    for (let i = 0; i < 12 && !nest; i++) {
      const a = rng.float(0, Math.PI * 2), x = P.x + Math.cos(a) * 12.2, z = P.z + Math.sin(a) * 12.2;
      if (!blocked(world, x, z, 0.4)) nest = V(x, 0, z);
    }
    nest ??= (() => { const s = freeSpot(world, rng, P.x, P.z, 10, 12.5, { pad: 0.4 }); return s ? V(s.x, 0, s.z) : V(P.x + 11, 0, P.z); })();
    this.nest = nest;
    const back = V(nest.x - P.x, 0, nest.z - P.z).normalize(); // (the heap is just behind her spot, towards the hedge)
    scene.add(leafPile(nest.x + back.x * 0.55, nest.z + back.z * 0.55));
    this.hog = new Hedgehog();
    this.pos = this.hog.root.position;
    this.pos.copy(nest).add(V((P.x - nest.x) * 0.04, 0, (P.z - nest.z) * 0.04));
    this.hog.root.rotation.y = Math.atan2(P.x - nest.x, P.z - nest.z);
    scene.add(this.hog.root);
    this.state = 'home';
    this.job = null;
    this.cool = 0;
    this.talkT = 2;
    this.awayT = 0;
    this.safeT = 0;
    this.bags = new Map();
    // Mowbot trundles round the lawn inside the path, steering clear of trees, benches and Gus.
    const route = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      for (const r of [6.6, 7.1, 6.1, 7.5, 5.8]) {
        const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (!blocked(world, x, z, 0.8)) { route.push(V(x, 0, z)); break; }
      }
    }
    const m = new RobotMower();
    scene.add(m.root);
    const start = route[rng.int(0, Math.max(0, route.length - 1))] ?? V(P.x + 6.6, 0, P.z);
    m.root.position.copy(start);
    this.mow = { m, pos: m.root.position, heading: 0, speed: 0, route, i: 0, dir: 1, mode: 'patrol', t: 0, curiousCool: 6, talkT: 6, stuckT: 0, clipT: 0 };
    this.mow.i = route.indexOf(start) >= 0 ? (route.indexOf(start) + 1) % route.length : 0;
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }
  say(text, dur = 3) { this.hud.say(`🦔 ${text}`, () => this.pos.clone().add(V(0, 0.5, 0)), dur); }
  beep(text, dur = 2.6) { this.hud.say(`🤖 ${text}`, () => this.mow.pos.clone().add(V(0, 0.95, 0)), dur); }

  get walks() { return progress.stats.pepper ?? 0; }

  // ---------- the walk ----------

  start() {
    const n = this.walks, by = this.beds.slice().sort((a, b) => flat(a, this.nest) - flat(b, this.nest));
    this.bed = n % 2 ? by.at(-1) : by[0]; // (alternate walks go to the far flowerbed)
    this.job = { giver: 'pepper', stat: 'pepper', icon: '🦔', who: 'Pepper', target: () => this.target(), objective: () => this.objective() };
    this.state = 'follow';
    this.awayT = 0;
    this.talkT = 8;
    this.friends.focus = this.job;
    this.say(this.line(PEPPER.ask), 4.5);
    fsfx.snuffle();
    this.friends.onChange?.();
  }

  arrive() {
    this.state = 'arrived';
    this.stateT = 0;
    sfx.found?.(); buzz([20, 30, 20]);
    this.actions.sparkle(this.pos.clone().add(V(0, 0.3, 0)), 22);
    this.actions.glow.burst(16, () => ({ // a puff of petals
      pos: this.bed.clone().add(V(Math.random() - 0.5, 0.35, Math.random() - 0.5)), vel: V(Math.random() * 2 - 1, 1.5 + Math.random(), Math.random() * 2 - 1),
      life: 1.3, size: 0.04, gravity: 4, color: [0xf2a0b4, 0xf6d06a, 0xffffff, 0xb69be0][Math.floor(Math.random() * 4)],
    }));
  }

  finish() {
    const job = this.job;
    this.job = null;
    this.cool = 30;
    this.state = 'munch';
    this.stateT = 0;
    this.friends.finish(job, () => this.say(this.line(PEPPER.thanks), 4), 20 + 3 * Math.min(5, this.walks));
  }

  giveUp() {
    this.say(this.line(PEPPER.giveUp), 3);
    this.job = null;
    this.cool = 6;
    this.state = 'return';
    if (this.friends.focus?.giver === 'pepper') this.friends.focus = this.friends.jobs.find((j) => !j.done) ?? null;
    this.friends.onChange?.();
  }

  // ---------- per frame ----------

  update(dt, P, { canAct = true } = {}) {
    this.updateMower(dt, P, canAct);
    this.updatePepper(dt, P, canAct);
  }

  updatePepper(dt, P, canAct) {
    const hog = this.hog, pos = this.pos;
    this.cool -= dt; this.talkT -= dt;
    this.stateT = (this.stateT ?? 0) + dt;
    const dDog = flat(P.pos, pos), dMow = flat(this.mow.pos, pos);
    // Mowbot coming? Ball! (Until it's been gone a moment.)
    if (!hog.curled && dMow < SCARY && this.state !== 'burrow') {
      hog.curled = true;
      this.safeT = 0;
      fsfx.eek();
      if (dDog < 16) this.say(this.line(PEPPER.scared), 2.2);
    } else if (hog.curled) {
      this.safeT = dMow > SAFE ? this.safeT + dt : 0;
      if (this.safeT > 1.2) { hog.curled = false; if (this.state === 'follow') this.say(this.line(PEPPER.phew), 2); }
    }
    let moving = 0, snuffle = false;
    switch (this.state) {
      case 'home': { // pottering about by her nest
        snuffle = true;
        if (canAct && !hog.curled && this.cool <= 0 && dDog < 3.2) { this.start(); break; }
        if (canAct && dDog < 6 && this.talkT <= 0) { this.talkT = 16; this.say(this.line(PEPPER.idle), 2.6); fsfx.snuffle(0.6); }
        const wob = V(this.nest.x + Math.sin(this.stateT * 0.4) * 0.5, 0, this.nest.z + Math.cos(this.stateT * 0.3) * 0.5);
        if (!hog.curled) { const h = walk(this.world, pos, wob.x, wob.z, 0.15, dt); if (h !== null) { hog.root.rotation.y = h; moving = 0.3; } }
        break;
      }
      case 'follow': {
        if (flat(pos, this.bed) < 1.25) { this.arrive(); break; }
        this.awayT = dDog > 35 ? this.awayT + dt : 0;
        if (this.awayT > 15) { this.giveUp(); break; }
        if (hog.curled) break;
        // The dog's at the flowers and she can see them: off she trots, the last bit on her own. (Just
        // following, she'd stop a step behind the dog — short of the bed if the dog stopped on it.)
        if (flat(P.pos, this.bed) < 3.5 && flat(pos, this.bed) < 7) {
          const h = walk(this.world, pos, this.bed.x, this.bed.z, PACE * 1.25, dt, 0);
          if (h !== null) { hog.root.rotation.y += wrap(h - hog.root.rotation.y) * (1 - Math.exp(-dt * 8)); moving = 1; }
        } else if (dDog > LAG) { // too far ahead: she waits (and says so)
          snuffle = true;
          if (this.talkT <= 0) { this.talkT = 7; this.say(this.line(PEPPER.wait), 2.2); }
        } else if (dDog > GAP) {
          const h = walk(this.world, pos, P.pos.x, P.pos.z, PACE, dt);
          if (h !== null) { hog.root.rotation.y += wrap(h - hog.root.rotation.y) * (1 - Math.exp(-dt * 8)); moving = 1; }
          if (this.talkT <= 0 && Math.random() < dt * 0.15) { this.talkT = 12; this.say(this.line(PEPPER.walk), 2.4); }
        } else snuffle = true;
        break;
      }
      case 'arrived': { // in among the flowers she goes
        const h = walk(this.world, pos, this.bed.x, this.bed.z, 1.2, dt, 0);
        if (h !== null) { hog.root.rotation.y = h; moving = 1; }
        pos.y = Math.abs(Math.sin(this.stateT * 9)) * 0.06; // a happy little bounce
        if (this.stateT > 1.1) { pos.y = 0; this.finish(); }
        break;
      }
      case 'munch': // snuffling for slugs; once you've gone, she heads home under the leaves
        snuffle = true;
        if ((this.stateT > 20 && dDog > 10) || this.stateT > 60) { this.state = 'burrow'; this.stateT = 0; }
        break;
      case 'return': { // walking home after a walk that didn't happen
        const h = hog.curled ? null : walk(this.world, pos, this.nest.x, this.nest.z, PACE, dt);
        if (h !== null) { hog.root.rotation.y = h; moving = 1; }
        if (flat(pos, this.nest) < 0.4 || this.stateT > 40) { this.state = 'burrow'; this.stateT = 0; }
        break;
      }
      case 'burrow': { // down into the leaves… and up at her nest
        const k = this.stateT;
        hog.root.scale.setScalar(1.15 * Math.max(0.01, k < 0.6 ? 1 - k / 0.6 : Math.min(1, (k - 0.9) / 0.5)));
        if (k >= 0.6 && k < 0.9 && flat(pos, this.nest) > 0.5) { pos.copy(this.nest); hog.curled = false; }
        if (k > 1.4) { hog.root.scale.setScalar(1.15); this.state = 'home'; this.stateT = 0; }
        break;
      }
    }
    hog.update(dt, { moving, snuffle });
  }

  updateMower(dt, P, canAct) {
    const M = this.mow, pos = M.pos, hog = this.pos, n = M.route.length;
    M.t += dt; M.curiousCool -= dt; M.talkT -= dt;
    const walks = Math.min(5, this.walks), cruise = 0.6 + 0.06 * walks, nosy = 5.5 + 0.6 * walks;
    const walking = this.state === 'follow';
    let target = null, speed = cruise;
    switch (M.mode) {
      case 'patrol':
        target = M.route[M.i] ?? this.park;
        if (flat(pos, target) < 0.6 && n) M.i = (M.i + M.dir + n) % n;
        // A hedgehog out and about? How exciting. It goes to say hello. (She doesn't like that.)
        if (walking && M.curiousCool <= 0 && !this.hog.curled && flat(pos, hog) < nosy) {
          M.mode = 'curious';
          M.t = 0;
          fsfx.beep(3);
          if (flat(P.pos, pos) < 18) this.beep(this.line(MOWER.curious));
        } else if (canAct && M.talkT <= 0 && flat(P.pos, pos) < 5) { M.talkT = 18; fsfx.beep(2, 0.6); this.beep(this.line(MOWER.patrol)); }
        break;
      case 'curious':
        target = hog;
        speed = cruise * 1.15;
        if (flat(pos, hog) < 1.8 || M.t > 12 || !walking) { M.mode = 'stare'; M.t = 0; }
        break;
      case 'stare': // beep… beep? Then back to work, the other way round the park
        speed = 0;
        M.m.look = Math.max(-1, Math.min(1, wrap(Math.atan2(hog.x - pos.x, hog.z - pos.z) - M.heading)));
        if (M.t > 3.5) { M.mode = 'patrol'; M.curiousCool = 9; M.dir = -M.dir; M.i = this.nearestStop(); }
        break;
      case 'shoo': { // woofed at: off it goes, the other way
        const away = Math.atan2(pos.x - P.pos.x, pos.z - P.pos.z);
        target = V(pos.x + Math.sin(away) * 3, 0, pos.z + Math.cos(away) * 3);
        speed = cruise * 1.6;
        if (M.t > 2.2) { M.mode = 'patrol'; M.i = this.nearestStop(); }
        break;
      }
      case 'backup': // a little reverse, to get clear of whatever it bumped into
        speed = -0.35;
        if (M.t > 1.2) { M.mode = 'patrol'; M.i = this.nearestStop(); }
        break;
    }
    // Something right in front (a dog, or Pepper when it isn't visiting her): stop, beep, and if it
    // goes on too long, back up and go round the other way.
    const ahead = V(pos.x + Math.sin(M.heading) * 1.0, 0, pos.z + Math.cos(M.heading) * 1.0);
    const inWay = flat(ahead, P.pos) < 0.75 || (M.mode !== 'curious' && flat(ahead, hog) < 0.6);
    if (inWay && speed > 0 && M.mode !== 'shoo') {
      speed = 0;
      M.stuckT += dt;
      if (M.stuckT > 0.4 && M.talkT <= 0 && flat(ahead, P.pos) < 0.75) { M.talkT = 10; fsfx.beep(2, 0.7); this.beep(this.line(MOWER.blocked)); }
      if (M.stuckT > 2.5) { M.dir = -M.dir; M.mode = 'backup'; M.t = 0; M.stuckT = 0; }
    } else M.stuckT = 0;
    // Trundle: turn towards the target (on the spot, if it's well round), then roll.
    if (target) {
      const want = Math.atan2(target.x - pos.x, target.z - pos.z), diff = wrap(want - M.heading);
      M.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      if (Math.abs(diff) > 1.1) speed *= 0.25;
    }
    M.speed += (speed - M.speed) * (1 - Math.exp(-dt * 4));
    const nx = pos.x + Math.sin(M.heading) * M.speed * dt, nz = pos.z + Math.cos(M.heading) * M.speed * dt;
    // (If it ever ends up too close to something, it may still move: that's how it gets clear.)
    if (!blocked(this.world, nx, nz, 0.45) || blocked(this.world, pos.x, pos.z, 0.45)) { pos.x = nx; pos.z = nz; }
    else if (M.mode !== 'stare' && M.mode !== 'backup') { M.mode = 'backup'; M.t = 0; M.dir = -M.dir; M.speed = 0; }
    M.m.root.rotation.y = M.heading;
    if (M.mode !== 'stare') M.m.look += ((flat(P.pos, pos) < 6 ? Math.max(-1, Math.min(1, wrap(Math.atan2(P.pos.x - pos.x, P.pos.z - pos.z) - M.heading))) : 0) - M.m.look) * (1 - Math.exp(-dt * 3));
    M.m.update(dt, M.speed);
    // Grass clippings fly out behind.
    M.clipT -= dt;
    if (M.speed > 0.2 && M.clipT <= 0 && flat(P.pos, pos) < 30) {
      M.clipT = 0.12;
      const back = V(pos.x - Math.sin(M.heading) * 0.45, 0.08, pos.z - Math.cos(M.heading) * 0.45);
      this.actions.dirt.spawn({ pos: back, vel: V(-Math.sin(M.heading) * 0.8 + Math.random() * 0.6 - 0.3, 0.8 + Math.random() * 0.6, -Math.cos(M.heading) * 0.8 + Math.random() * 0.6 - 0.3), life: 0.9, size: 0.02, gravity: 6, floor: 0.06, color: [0x7fae64, 0x8fb565, 0x6f9a52][Math.floor(Math.random() * 3)] });
    }
    // It's solid: dogs bump gently off it.
    const dx = P.pos.x - pos.x, dz = P.pos.z - pos.z, d = Math.hypot(dx, dz), r = MOW_R + (P.radius ?? 0.28);
    if (d < r && d > 1e-4 && P.pos.y < 0.5) { P.pos.x = pos.x + (dx / d) * r; P.pos.z = pos.z + (dz / d) * r; }
  }

  nearestStop() {
    let best = 0, bd = Infinity;
    this.mow.route.forEach((p, i) => { const d = flat(p, this.mow.pos); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Woof! At Mowbot? Off it goes. */
  onBark(pos) {
    const M = this.mow;
    if (flat(pos, M.pos) > 5.5 || M.mode === 'shoo') return;
    M.mode = 'shoo';
    M.t = 0;
    M.curiousCool = 12;
    M.dir = -M.dir;
    M.m.worried = 2;
    fsfx.reverse();
    this.beep(this.line(MOWER.shooed));
  }

  /** The compass: back to Pepper if she's been left behind, otherwise on to the flowers. */
  target() {
    const far = flat(this.player.pos, this.pos) > 7;
    return far ? { pos: this.pos, emoji: '🦔' } : { pos: this.bed, emoji: '🌼' };
  }

  objective() {
    return { icon: '🦔', title: 'Walk Pepper to the flowerbeds 🌼', sub: 'She follows you, slowly. If Mowbot comes near she curls up — woof to shoo it away! 🗣️' };
  }

  get hint() {
    if (this.state !== 'follow') return null;
    const d = flat(this.player.pos, this.pos);
    if (this.hog.curled && d < 10) return 'Pepper’s curled up! Woof at Mowbot to shoo it 🗣️';
    if (d > LAG) return 'Pepper can’t keep up — wait for her! 🦔';
    return null;
  }
}
