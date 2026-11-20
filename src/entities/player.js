import * as THREE from 'three';
import { Dog } from './dog.js';
import { BREEDS } from './breeds.js';
import { buzz } from '../core/haptics.js';
import { waterAt } from '../world/water.js';
import { speedMult, zoomiesMult } from '../game/stats.js';

const known = (key) => (Object.hasOwn(BREEDS, key) ? key : 'merry');

const WALK = 2.6, TROT = 3.4, RUN = 6.8;
const RAMP_TIME = 0.9; // seconds of zoomies to go from trot to full gallop
const DRAIN = 0.13, REFILL = 0.2; // zoomies bar per second: ~7.7 s of zoomies from full (more with 💨 points)
const GRAVITY = 12;
// Jump heights (metres) — the same for every dog, so nobody is left out:
const HOP = 0.8, HUGE = 1.5;         // a jump; double-tap for a huge one (over fences and hedges)
const SUPER_HOP = 1.35, SUPER_HUGE = 2.4; // …with a 🧀 super-jump snack inside you
const HUGE_COST = 0.3;               // a huge jump uses up this much of the zoomies bar
const SNACK_SPEED = 1.45;            // 🍕 speed snack
const COYOTE = 0.12, BUFFER = 0.14; // forgiving: jump just after leaving a ledge / just before landing
const launch = (h) => Math.sqrt(2 * GRAVITY * h); // take-off speed for a jump this high

// Turns input into motion for Merry, relative to the camera's view.
export class Player {
  constructor(breedKey = 'merry') {
    this.breedKey = known(breedKey);
    this.dog = new Dog(this.breedKey);
    this.mult = this.dog.breed.speed;
    this.object = this.dog.root;
    this.pos = this.object.position;
    this.vel = new THREE.Vector2();
    this.heading = 0;
    this.turnRate = 0;
    this.stamina = 1;
    this.speedK = 1;   // from ⚡ speed points (level & clothes)
    this.zoomK = 1;    // from 💨 zoomies points
    this.boost = { speed: 0, jump: 0, zoomies: 0 }; // seconds left on snack power-ups
    this.airJump = false; // a huge jump is still available in this jump
    this.jumpY = 0;       // where this jump started
    // Boosted up by a friend: stood on another dog's back and hasn't been back down to the ground since
    // (team bones need this, however high a dog can jump on its own).
    this.onFriend = false;
    this.radius = 0.28;
    this.zoom = 0; // 0..1 how wound-up the zoomies are
    this.speed = 0;
    this.frozen = false;     // ignore player input (cutscenes)
    this.scripted = null;    // {target: Vector3, speed} walk somewhere on her own
    this.digTimer = 0;
    this.ignoreBounds = false;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.lockY = false;      // cutscenes move her up/down themselves
    this.platforms = null;   // extra things to stand on (other dogs' backs)
    this.landed = 0;         // >0 just after landing, for effects
    // Water: swim 0..1 (paddling), wading, and one-frame events for splashes and shakes.
    this.swim = 0;
    this.wading = false;
    this.inWater = false;
    this.waterSurface = 0;
    this.enteredSpeed = 0;
    this.leftWater = false;
    this.shakeIn = 0;
    this.wetTime = 0;
    this.grip = 1;           // how well paws grip (ice: hardly at all — wheee!)
    this.gravity = 1;        // how hard she's pulled down (less on other planets: big floaty jumps, same take-off)
  }

  /** Swap to a different dog (lobby), keeping position and facing. */
  setBreed(key) {
    const parent = this.object.parent, pos = this.pos.clone();
    parent?.remove(this.object);
    this.breedKey = known(key);
    this.dog = new Dog(this.breedKey);
    if (this.look) this.dog.setLook(this.look);
    this.mult = this.dog.breed.speed;
    this.object = this.dog.root;
    this.pos = this.object.position;
    this.pos.copy(pos);
    this.object.rotation.y = this.heading;
    parent?.add(this.object);
  }

  /** Wear these: { collar, neck, hat } cosmetic ids. Kept when changing breed. */
  setLook(look) { this.look = look; this.dog.setLook(look); }

  /** ⚡ speed and 💨 zoomies points (stats.js). */
  setStats(s) { this.speedK = speedMult(s); this.zoomK = zoomiesMult(s); }

  /** A snack power-up: 'speed' | 'jump' | 'zoomies' for `secs` seconds. */
  power(kind, secs) {
    this.boost[kind] = Math.max(this.boost[kind], secs);
    if (kind === 'zoomies') this.stamina = 1;
  }

  update(dt, input, cameraYaw, world) {
    let mv = this.frozen ? { x: 0, y: 0 } : input.move();
    const sniffing = !this.frozen && input.sniff;
    for (const k in this.boost) this.boost[k] = Math.max(0, this.boost[k] - dt);
    const endless = this.boost.zoomies > 0 || this.boost.speed > 0; // snacks: zoomies that never run out
    let wantRun = !this.frozen && input.sprint && (this.stamina > 0.05 || endless);
    // Zoomies build up: trot first, then stretch out into a full gallop.
    this.zoom = wantRun && Math.hypot(mv.x, mv.y) > 0.1 ? Math.min(1, this.zoom + dt / RAMP_TIME) : Math.max(0, this.zoom - dt * 2.5);
    const k = this.mult * this.speedK * (this.boost.speed > 0 ? SNACK_SPEED : 1);
    const runSpeed = (TROT + (RUN - TROT) * this.zoom * this.zoom) * k;
    let max = sniffing ? WALK * 0.4 * k : wantRun ? runSpeed : WALK * k;
    // Doggy paddle is slow, and there are no zoomies in the pond.
    if (this.swim > 0.4) { wantRun = false; this.zoom = 0; max = WALK * 0.62 * this.mult * this.speedK; }
    else if (this.wading) max *= 0.8;

    // Camera-relative direction (camera looks toward -forward).
    const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
    const rx = -fz, rz = fx;
    let dx = rx * mv.x + fx * mv.y, dz = rz * mv.x + fz * mv.y;
    if (this.scripted) {
      const tx = this.scripted.target.x - this.pos.x, tz = this.scripted.target.z - this.pos.z, l = Math.hypot(tx, tz);
      if (l < 0.15) { this.scripted.done = true; dx = dz = 0; } else { dx = tx / l; dz = tz / l; }
      mv = { x: 0, y: l < 0.15 ? 0 : 1 };
      wantRun = !!this.scripted.run;
      max = wantRun ? RUN * 0.85 : WALK;
    }
    const amt = Math.min(1, Math.hypot(mv.x, mv.y));

    const target = new THREE.Vector2(dx, dz).multiplyScalar(max);
    const accel = (amt > 0.01 ? 10 : 7) * this.grip;
    this.vel.lerp(target, 1 - Math.exp(-dt * accel));
    const speed = this.vel.length();
    this.speed = speed;

    if (wantRun && speed > 2 && !endless) this.stamina = Math.max(0, this.stamina - (dt * DRAIN) / this.zoomK);
    else this.stamina = Math.min(1, this.stamina + dt * REFILL * (endless ? 4 : 1 + (this.zoomK - 1) * 0.5));

    if (speed > 0.08) {
      const want = Math.atan2(this.vel.x, this.vel.y);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = diff * (1 - Math.exp(-dt * 10));
      this.heading += step;
      this.turnRate = step / Math.max(dt, 1e-4);
    } else this.turnRate *= 0.8;
    this.object.rotation.y = this.heading;

    // Emotes (number keys / the 😀 menu); walking or jumping stops them.
    this.emoted = null;
    const em = !this.frozen && input.emote;
    if (em && this.grounded && this.swim < 0.4) { this.dog.emote(em); this.emoted = em; }
    else if ((this.dog.emoteT ?? 0) > 0.25 && (Math.hypot(mv.x, mv.y) > 0.2 || input.jump)) this.dog.stopEmote();

    // Jumping. Tap again in the air for a huge jump (it uses some of the zoomies bar).
    const press = !this.frozen && input.jump;
    if (press) this.jumpBuffer = BUFFER;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    if (this.grounded) { this.jumpY = this.pos.y; this.airJump = true; }
    this.jumped = this.hugeJumped = this.tooTired = false;
    const superJump = this.boost.jump > 0;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.lockY) {
      this.vy = launch(superJump ? SUPER_HOP : HOP) * (this.swim > 0.4 ? 0.9 : 1); // leap out of the water
      this.grounded = false;
      this.coyote = this.jumpBuffer = 0;
      this.jumpY = this.pos.y;
      this.airJump = true;
      this.jumped = true;
      this.dog.jump?.();
    } else if (press && !this.grounded && this.coyote <= 0 && this.airJump && !this.lockY && this.swim < 0.4) {
      this.airJump = false;
      const free = this.boost.zoomies > 0 || this.boost.speed > 0;
      if (free || this.stamina >= HUGE_COST) {
        // Up to the same height whenever you tap: from the ground, the top of the jump, or on the way down.
        const climbed = (this.pos.y - this.jumpY) * this.gravity; // (in low gravity everything's that much higher)
        this.vy = Math.max(this.vy, launch(Math.max(0.35, (superJump ? SUPER_HUGE : HUGE) - climbed)));
        if (!free) this.stamina -= HUGE_COST;
        this.jumpBuffer = 0;
        this.hugeJumped = true;
        this.dog.jump?.();
        buzz([15, 30, 25]);
      } else this.tooTired = true;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    if (world && !this.ignoreBounds) {
      world.colliders.resolve(this.pos, this.radius, this.grounded ? 0.3 : 0.06);
      const b = world.bounds;
      if (b && !this.ignoreBounds) {
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.x0, b.x1);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.z0, b.z1);
      }
    }

    // Gravity, landing on things, walking off ledges.
    this.landed = Math.max(0, this.landed - dt);
    let wtr = null, impact = 0;
    if (!this.lockY) {
      // In deep water the "ground" is wherever a floating dog's body sits at the surface;
      // the shelving beach eases you in from standing to swimming.
      wtr = world?.water ? waterAt(world.water, this.pos.x, this.pos.z) : null;
      let base = world?.heightAt?.(this.pos.x, this.pos.z) ?? 0; // (the ground can rise: a frozen pond, a snowy hill)
      if (wtr && !wtr.wade) base = (wtr.surface - (this.dog.bodyY + 0.03) * this.dog.breed.size) * wtr.depth;
      const ground = world ? world.colliders.surfaceAt(this.pos.x, this.pos.z, this.pos.y, this.grounded ? 0.3 : 0.05, this.platforms, undefined, base) : 0;
      impact = Math.max(speed, -this.vy);
      this.vy -= GRAVITY * this.gravity * dt;
      this.pos.y += this.vy * dt;
      const onDog = !!world?.colliders.onExtra, hit = world?.colliders.extraHit;
      if (this.pos.y <= ground && this.vy <= 0) { // only land on the way down
        if (!this.grounded && this.vy < -2) { this.landed = 0.25; this.dog.land?.(Math.min(1, -this.vy / 6)); if (this.vy < -5) buzz(12); }
        this.pos.y = ground;
        this.vy = 0;
        this.grounded = true;
        this.onFriend = onDog || (ground > 0.35 && this.onFriend);
      } else if (this.grounded && this.pos.y - ground < 0.3 && this.vy <= 0) {
        this.pos.y = ground; // small step down: stay glued to the surface
        this.vy = 0;
        this.onFriend = onDog || (ground > 0.35 && this.onFriend);
      } else this.grounded = false;
      this.riding = this.grounded && hit?.ride ? hit.ride : null; // (on top of a moving car: it carries her along)
    }

    // Water state + one-frame events (the chapter turns these into splashes and shakes).
    this.enteredSpeed = 0;
    this.leftWater = false;
    const was = this.inWater;
    this.inWater = !!wtr && this.pos.y < wtr.surface + 0.03;
    this.waterSurface = wtr?.surface ?? this.waterSurface;
    this.swim = this.inWater && !wtr.wade ? THREE.MathUtils.smoothstep(wtr.depth, 0.55, 0.95) : 0;
    this.wading = this.inWater && this.swim < 0.5;
    if (this.inWater) { this.wetTime += dt; this.shakeIn = 0; }
    if (this.inWater && !was) this.enteredSpeed = Math.max(0.6, impact);
    if (!this.inWater && was && this.wetTime > 0.4) this.shakeIn = 0.35; // shake once back on dry land
    if (this.shakeIn > 0 && this.grounded && !this.inWater) {
      this.shakeIn -= dt;
      if (this.shakeIn <= 0) { this.leftWater = true; this.wetTime = 0; }
    }

    this.digTimer = Math.max(0, this.digTimer - dt);
    this.dog.update(dt, { swim: this.swim, speed: this.grounded ? speed : speed * 0.4, turnRate: this.turnRate, sniff: sniffing && this.grounded, dig: this.digTimer > 0, happy: speed > 2.8 ? 1 : this.happy ?? 0.5, air: this.grounded ? 0 : 1, vy: this.vy });
  }
}
