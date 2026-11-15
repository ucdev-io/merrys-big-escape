import * as THREE from 'three';
import { Particles } from '../fx/particles.js';
import { ScentTrail } from './scentTrail.js';
import { Mischief } from './mischief.js';
import { WaterFx } from './waterFx.js';
import { sfx } from '../core/audio.js';
import { Pigeons } from './pigeons.js';
import { progress } from '../game/progress.js';
import { Snacks, SNACKS } from './snacks.js';
import { Carry } from './carry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const DIRT = [0x9a7356, 0x7a5236, 0xb08a68];

/**
 * Everything the player's dog can do, shared by every chapter: sniffing (sepia vision, sound,
 * golden scent trail), digging, barking, swimming splashes, garden mischief, particles and the
 * zoomies bar. Chapters add their own reactions through the hooks passed to update().
 */
export class DogActions {
  /**
   * @param o.dogName / o.breedName  functions returning the current dog's name / breed name
   * @param o.onAct                   (action, extra) → tell other players (multiplayer), optional
   */
  constructor({ scene, hud, input, player, pipeline, world, dogName, breedName, onAct = null }) {
    Object.assign(this, { scene, hud, input, player, pipeline, world, onAct });
    this.dirt = new Particles(scene, { max: 260, shadows: true });
    this.glow = new Particles(scene, { max: 220, emissive: true });
    this.trail = new ScentTrail(scene);
    this.waterFx = new WaterFx(scene, hud);
    this.mischief = new Mischief({
      scene, hud, gardens: world.gardens, beds: world.beds, bins: world.bins, dirt: this.dirt, glow: this.glow,
      dogName, breedName, onAct: (m) => this.onAct?.(m.a, m),
    });
    this.mischief.onChange = (n) => {
      hud.setMischief(n);
      progress.stat('mischief');
      progress.award(2, 'Naughty!');
      this.onMischief?.(n);
    };
    // Carrying things in your mouth (lost toys, Gus's slipper…).
    this.carry = new Carry(scene, player, this.glow);
    this.carry.onChange = (kind) => this.onCarry?.(kind);
    // Snacks from knocked-over bins: gobble one for a power-up.
    this.snacks = new Snacks(scene, world.layout?.seed ?? 'garden', world.bounds);
    this.mischief.onSpill = (bin, dir) => this.snacks.spill(bin, dir);
    this.sparkleT = 0;
    // Pigeon flocks to scatter (if this world has any).
    this.pigeons = world.pigeonSpots?.length ? new Pigeons(scene, world.pigeonSpots, world.pigeonFlocks ?? []) : null;
    this.splashCD = 0;
    this.sniffAmt = 0;
    this.sniffSfxT = 0;
    this.sniffHeld = 0;
    this.barkCD = 0;
  }

  /** Just above the dog's head (for floating words). */
  anchor() { return this.player.pos.clone().add(V(0, 1.0, 0)); }

  nose() {
    const P = this.player;
    return P.pos.clone().add(V(Math.sin(P.heading) * 0.42, 0.3, Math.cos(P.heading) * 0.42));
  }

  /**
   * @param o.canAct   player is in control
   * @param o.goal     Vector3 for the scent trail (or null)
   * @param o.onDig    (nose) → true if the chapter handled this dig (e.g. a dig spot)
   * @param o.onBark   () → chapter reactions to a bark
   * @returns {{ sniffing: boolean, dug: boolean, barked: boolean, nose: Vector3 }}
   */
  update(dt, { canAct, goal = null, onDig = null, onBark = null }) {
    const P = this.player, input = this.input;
    const nose = this.nose();

    // Sniffing → sepia vision, a sniff sound now and then, and the golden trail to `goal`.
    const sniffing = canAct && input.sniff;
    this.sniffAmt += ((sniffing ? 1 : 0) - this.sniffAmt) * (1 - Math.exp(-dt * 6));
    this.sniffHeld = sniffing ? this.sniffHeld + dt : 0;
    this.pipeline.sniff = this.sniffAmt;
    this.sniffSfxT -= dt;
    if (sniffing && this.sniffSfxT <= 0) {
      sfx.sniff();
      this.hud.float(pick(['sniff sniff', 'snf snf', 'sniiiff']), this.anchor(), 'sniff');
      this.sniffSfxT = 1.3;
    }
    this.trail.update(dt, this.sniffAmt, nose, goal);

    // Digging: the chapter gets first go (dig spots); otherwise it's mischief in the lawn.
    // (Next to something you can pick up, or carrying something, 🐾 grabs / drops it instead.)
    let dug = false;
    if (canAct && input.dig) {
      const c = this.carry.press(nose);
      if (c !== 'grab' && c !== 'drop') {
        dug = true;
        P.digTimer = 0.35;
        sfx.dig();
        this.onAct?.('dig');
        if (c === 'dig') this.dirtBurst(nose.clone().setY(Math.max(0, P.pos.y)), 7);
        else if (!onDig?.(nose)) {
          this.dirtBurst(nose.clone().setY(Math.max(0, P.pos.y)), 4);
          this.mischief.dig(nose.clone().setY(0));
        }
      }
    }

    // Barking.
    let barked = false;
    this.barkCD -= dt;
    if (canAct && input.bark && this.barkCD <= 0) {
      barked = true;
      this.barkCD = 0.5;
      if (this.carry.held) { this.carry.drop(nose); this.hud.float('…oops!', this.anchor().add(V(0, 0.3, 0))); } // mouth full!
      P.dog.bark();
      sfx.bark(P.dog.breed.bark);
      this.hud.float('WOOF!', this.anchor());
      this.onAct?.('bark');
      this.mischief.barkAt(P.pos);
      if (this.pigeons) this.scared(this.pigeons.bark(P.pos));
      onBark?.();
    }

    if (canAct) this.mischief.update(dt, P);
    this.carry.update(dt);
    this.updateSnacks(dt, canAct);
    // Double-tap jump: a huge jump (or not, if the zoomies bar is too low).
    if (P.hugeJumped) {
      sfx.boing?.();
      this.hud.float('BOING!', this.anchor());
      this.dirtBurst(P.pos.clone().setY(Math.max(0.02, P.jumpY ?? 0)), 6, Math.max(0.02, P.jumpY ?? 0));
      this.sparkle(P.pos.clone().add(V(0, 0.2, 0)), 10);
      this.onHugeJump?.();
    }
    if (P.tooTired) { this.hud.float('Too puffed! 💤', this.anchor()); this.hud.flashStamina?.(); }
    if (this.pigeons) this.scared(this.pigeons.update(dt, canAct ? P : { pos: P.pos, speed: 0 }));
    // A star for a good splash now and then.
    this.splashCD -= dt;
    if (P.enteredSpeed && this.splashCD <= 0) { this.splashCD = 15; progress.stat('splashes'); progress.award(3, 'Splash!'); }
    this.waterFx.update(dt, P.dog, {
      pos: P.pos, heading: P.heading, speed: P.speed, inWater: P.inWater, swim: P.swim,
      surface: P.waterSurface, enteredSpeed: P.enteredSpeed, leftWater: P.leftWater,
    });
    this.dirt.update(dt);
    this.glow.update(dt);
    this.hud.setStamina(P.stamina, P.speed > 3);
    return { sniffing, dug, barked, nose };
  }

  /** Snacks bob about with a twinkle; walk over one to eat it. */
  updateSnacks(dt, canAct) {
    const P = this.player;
    const ate = this.snacks.update(dt, P, canAct);
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.35;
      this.snacks.forEachSparkle((p) => this.glow.burst(1, () => ({
        pos: p.clone().add(V(rand(-0.15, 0.15), 0.12, rand(-0.15, 0.15))), vel: V(0, rand(0.3, 0.6), 0),
        life: rand(0.6, 1), size: 0.035, gravity: -0.2, drag: 1, color: pick([0xfff2a8, 0xffffff, 0xffd27a]),
      })));
    }
    if (ate) {
      const s = SNACKS[ate.kind];
      for (const p of s.power) P.power(p, s.secs);
      sfx.chomp?.();
      this.sparkle(ate.at, 18);
      this.hud.float(`${s.emoji} ${s.power.length > 1 ? 'SUPER DOG!' : { speed: 'Super speed!', jump: 'Super jumps!', zoomies: 'Endless zoomies!' }[s.power[0]]}`, this.anchor(), 'xp');
      this.hud.showToastRaw(s.emoji, `Yum! ${s.name}!`, s.blurb);
      progress.stat('snacks');
      progress.award(2, 'Yum!');
      this.onSnack?.(ate.kind);
    }
    // Power-ups ticking down (and a little fizzle when one runs out).
    const left = P.boost;
    if (this.lastBoost) for (const k in left) if (this.lastBoost[k] > 0 && left[k] === 0) sfx.fizzle?.();
    this.lastBoost = { ...left };
    this.hud.setBoosts?.(left);
  }

  /** Pigeons the dog just sent flying: stars, stats, and tell the pack (so they see them fly too). */
  scared(list) {
    for (const { flock, landing } of list) {
      if (landing === null || landing === undefined) continue;
      const n = flock.birds.length;
      progress.stat('pigeons', n);
      progress.award(3 + n, `${n} pigeons!`);
      this.onAct?.('scatter', { id: flock.id, x: landing, z: 0 });
      this.onScatter?.(flock, n);
    }
  }

  /** Another player's dog scared a flock: fly it to the same place. */
  remoteScatter(id, landing) {
    const f = this.pigeons?.byId(id);
    if (!f || f.state !== 'ground' || !this.pigeons.spots[landing]) return;
    const near = f.home.distanceTo(this.player.pos) < 18;
    this.pigeons.scatter(f, f.home.clone().add(V(rand(-1, 1), 0, rand(-1, 1))), landing, near);
  }

  /** Clods of earth flying out behind the dog. */
  dirtBurst(at, n, floor = 0.02) {
    const P = this.player;
    const back = V(-Math.sin(P.heading), 0, -Math.cos(P.heading));
    this.dirt.burst(n, () => ({
      pos: at.clone().add(V(rand(-0.1, 0.1), 0.05, rand(-0.1, 0.1))),
      vel: back.clone().multiplyScalar(rand(1, 2.5)).add(V(rand(-0.8, 0.8), rand(1.8, 3.2), rand(-0.8, 0.8))),
      life: rand(0.8, 1.3), size: rand(0.025, 0.05), gravity: 9, floor: Math.max(floor, at.y), color: pick(DIRT),
    }));
  }

  /** A little rising cloud of smell. */
  smellPuff(at, color) {
    this.glow.spawn({
      pos: at.clone().add(V(rand(-0.15, 0.15), 0.1, rand(-0.15, 0.15))),
      vel: V(rand(-0.1, 0.1), rand(0.35, 0.6), rand(-0.1, 0.1)),
      life: 1.6, size: 0.05, grow: 1.2, color, drag: 0.5,
    });
  }

  /** Burst of coloured sparkles (finds, discoveries). */
  sparkle(at, n = 20) {
    this.glow.burst(n, () => ({
      pos: at.clone(),
      vel: V(rand(-1.8, 1.8), rand(1.2, 3.2), rand(-1.8, 1.8)),
      life: 1.25, size: 0.045, gravity: 3, color: pick([0xf6d06a, 0xf2a0b4, 0xb69be0, 0x8fc4d8]),
    }));
  }
}
