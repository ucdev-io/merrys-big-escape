import * as THREE from 'three';
import { Dog } from './dog.js';

const WALK = 2.2, TROT = 3.0, RUN = 6.2;
const RAMP_TIME = 0.9; // seconds of zoomies to go from trot to full gallop
const GRAVITY = 12, JUMP_V = 4.4;   // ≈0.8 m jump — the same for every dog, so nobody is left out
const COYOTE = 0.12, BUFFER = 0.14; // forgiving: jump just after leaving a ledge / just before landing

// Turns input into motion for Merry, relative to the camera's view.
export class Player {
  constructor(breedKey = 'merry') {
    this.dog = new Dog(breedKey);
    this.breedKey = breedKey;
    this.mult = this.dog.breed.speed;
    this.object = this.dog.root;
    this.pos = this.object.position;
    this.vel = new THREE.Vector2();
    this.heading = 0;
    this.turnRate = 0;
    this.stamina = 1;
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
  }

  /** Swap to a different dog (lobby), keeping position and facing. */
  setBreed(key) {
    const parent = this.object.parent, pos = this.pos.clone();
    parent?.remove(this.object);
    this.dog = new Dog(key);
    this.breedKey = key;
    this.mult = this.dog.breed.speed;
    this.object = this.dog.root;
    this.pos = this.object.position;
    this.pos.copy(pos);
    this.object.rotation.y = this.heading;
    parent?.add(this.object);
  }

  update(dt, input, cameraYaw, world) {
    let mv = this.frozen ? { x: 0, y: 0 } : input.move();
    const sniffing = !this.frozen && input.sniff;
    let wantRun = !this.frozen && input.sprint && this.stamina > 0.05;
    // Zoomies build up: trot first, then stretch out into a full gallop.
    this.zoom = wantRun && Math.hypot(mv.x, mv.y) > 0.1 ? Math.min(1, this.zoom + dt / RAMP_TIME) : Math.max(0, this.zoom - dt * 2.5);
    const runSpeed = (TROT + (RUN - TROT) * this.zoom * this.zoom) * this.mult;
    let max = sniffing ? WALK * 0.4 * this.mult : wantRun ? runSpeed : WALK * this.mult;

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
    const accel = amt > 0.01 ? 10 : 7;
    this.vel.lerp(target, 1 - Math.exp(-dt * accel));
    const speed = this.vel.length();
    this.speed = speed;

    if (wantRun && speed > 2) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * 0.18);

    if (speed > 0.08) {
      const want = Math.atan2(this.vel.x, this.vel.y);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = diff * (1 - Math.exp(-dt * 10));
      this.heading += step;
      this.turnRate = step / Math.max(dt, 1e-4);
    } else this.turnRate *= 0.8;
    this.object.rotation.y = this.heading;

    // Jumping. Air control is a little softer than on the ground.
    if (!this.frozen && input.jump) this.jumpBuffer = BUFFER;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumped = false;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.lockY) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.coyote = this.jumpBuffer = 0;
      this.jumped = true;
      this.dog.jump?.();
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
    if (!this.lockY) {
      const ground = world ? world.colliders.surfaceAt(this.pos.x, this.pos.z, this.pos.y, this.grounded ? 0.3 : 0.05, this.platforms) : 0;
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground && this.vy <= 0) { // only land on the way down
        if (!this.grounded && this.vy < -2) { this.landed = 0.25; this.dog.land?.(Math.min(1, -this.vy / 6)); }
        this.pos.y = ground;
        this.vy = 0;
        this.grounded = true;
      } else if (this.grounded && this.pos.y - ground < 0.3 && this.vy <= 0) {
        this.pos.y = ground; // small step down: stay glued to the surface
        this.vy = 0;
      } else this.grounded = false;
    }

    this.digTimer = Math.max(0, this.digTimer - dt);
    this.dog.update(dt, { speed: this.grounded ? speed : speed * 0.4, turnRate: this.turnRate, sniff: sniffing && this.grounded, dig: this.digTimer > 0, happy: speed > 2.8 ? 1 : this.happy ?? 0.5, air: this.grounded ? 0 : 1, vy: this.vy });
  }
}
