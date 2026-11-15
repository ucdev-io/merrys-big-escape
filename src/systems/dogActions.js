import * as THREE from 'three';
import { Particles } from '../fx/particles.js';
import { ScentTrail } from './scentTrail.js';
import { Mischief } from './mischief.js';
import { WaterFx } from './waterFx.js';
import { sfx } from '../core/audio.js';

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
    this.mischief.onChange = (n) => { hud.setMischief(n); hud.float('😈 +1', this.anchor(), 'dig'); this.onMischief?.(n); };
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
    let dug = false;
    if (canAct && input.dig) {
      dug = true;
      P.digTimer = 0.35;
      sfx.dig();
      this.onAct?.('dig');
      if (!onDig?.(nose)) {
        this.dirtBurst(nose.clone().setY(Math.max(0, P.pos.y)), 4);
        this.mischief.dig(nose.clone().setY(0));
      }
    }

    // Barking.
    let barked = false;
    this.barkCD -= dt;
    if (canAct && input.bark && this.barkCD <= 0) {
      barked = true;
      this.barkCD = 0.5;
      P.dog.bark();
      sfx.bark(P.dog.breed.bark);
      this.hud.float('WOOF!', this.anchor());
      this.onAct?.('bark');
      this.mischief.barkAt(P.pos);
      onBark?.();
    }

    if (canAct) this.mischief.update(dt, P);
    this.waterFx.update(dt, P.dog, {
      pos: P.pos, heading: P.heading, speed: P.speed, inWater: P.inWater, swim: P.swim,
      surface: P.waterSurface, enteredSpeed: P.enteredSpeed, leftWater: P.leftWater,
    });
    this.dirt.update(dt);
    this.glow.update(dt);
    this.hud.setStamina(P.stamina, P.speed > 3);
    return { sniffing, dug, barked, nose };
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
