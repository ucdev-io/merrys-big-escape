import * as THREE from 'three';
import { Particles } from '../fx/particles.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const DROPS = [0xbfe0ec, 0xffffff, 0x9fd0e2];

/** Splashes, ripples and the wet-dog shake. */
export class WaterFx {
  constructor(scene, hud) {
    this.hud = hud;
    this.drops = new Particles(scene, { max: 260 });
    // Ripples: thin flat rings that spread out and fade.
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new Particles(scene, { max: 40, geometry: ringGeo });
    this.paddleT = 0;
    this.ringT = 0;
    this.plipT = 0;
    this.dripT = 0;
  }

  /** Big splash where a dog hits the water. */
  splash(at, surface, power = 1, mine = true) {
    const n = Math.round(14 + power * 22);
    this.drops.burst(n, () => {
      const a = rand(0, Math.PI * 2), s = rand(0.8, 2.2) * (0.6 + power * 0.6);
      return {
        pos: V(at.x + Math.cos(a) * 0.15, surface + 0.05, at.z + Math.sin(a) * 0.15),
        vel: V(Math.cos(a) * s, rand(2, 4.2) * (0.6 + power * 0.5), Math.sin(a) * s),
        life: rand(0.7, 1.1), size: rand(0.025, 0.05), gravity: 9.5, floor: surface, color: pick(DROPS),
      };
    });
    this.ring(at, surface, 1.6);
    this.ring(at, surface, 1.0, 0.25);
    if (mine) {
      sfx.splash();
      buzz(30);
      this.hud.float('SPLASH!', V(at.x, surface + 0.9, at.z));
    }
  }

  ring(at, surface, grow = 1, delay = 0) {
    const spawn = () => this.rings.spawn({
      pos: V(at.x, surface + 0.012, at.z), life: 1.2, size: 0.2, grow: 4 * grow, color: 0xeaf5f8, flat: true,
    });
    if (delay) setTimeout(spawn, delay * 1000); else spawn();
  }

  /** Full wet-dog shake on dry land, droplets flying everywhere. */
  shake(dog, pos, mine = true) {
    dog.shake();
    if (mine) sfx.shake();
    this.drops.burst(34, () => ({
      pos: pos.clone().add(V(rand(-0.25, 0.25), rand(0.25, 0.6), rand(-0.3, 0.3))),
      vel: V(rand(-2.6, 2.6), rand(0.4, 2), rand(-2.6, 2.6)),
      life: 0.8, size: 0.022, gravity: 8, floor: pos.y + 0.02, color: pick(DROPS),
    }));
    this.dripT = 2.5;
  }

  /**
   * Per frame for one dog.
   * state: { pos, heading, speed, inWater, swim, surface, enteredSpeed (set the frame it hits the water), leftWater }
   */
  update(dt, dog, st, mine = true) {
    if (st.enteredSpeed) this.splash(st.pos, st.surface, Math.min(1.5, st.enteredSpeed / 3), mine);
    if (st.inWater) {
      // Paddling: little kicks of water at the front, rings spreading out behind.
      this.paddleT -= dt; this.ringT -= dt; this.plipT -= dt;
      const moving = st.speed > 0.3;
      if (this.paddleT <= 0 && (moving || st.swim > 0.5)) {
        this.paddleT = moving ? 0.09 : 0.25;
        const f = 0.32 * dog.breed.size;
        const p = V(st.pos.x + Math.sin(st.heading) * f, st.surface + 0.03, st.pos.z + Math.cos(st.heading) * f);
        this.drops.burst(2, () => ({
          pos: p.clone().add(V(rand(-0.08, 0.08), 0, rand(-0.08, 0.08))),
          vel: V(rand(-0.5, 0.5), rand(0.8, 1.6), rand(-0.5, 0.5)),
          life: 0.45, size: 0.02, gravity: 9, floor: st.surface, color: pick(DROPS),
        }));
      }
      if (this.ringT <= 0) { this.ringT = moving ? 0.35 : 0.9; this.ring(st.pos, st.surface, moving ? 0.7 : 0.5); }
      // Splashing along through the shallows; plip-plip when swimming.
      if (mine && moving && this.plipT <= 0) { this.plipT = st.swim < 0.5 ? 0.38 : 0.45; if (st.swim < 0.5) sfx.puddle(0.7); else sfx.plip?.(); }
    }
    if (st.leftWater) this.shake(dog, st.pos, mine);
    // Still dripping for a bit afterwards.
    if (this.dripT > 0) {
      this.dripT -= dt;
      if (Math.random() < dt * 12) this.drops.spawn({ pos: st.pos.clone().add(V(rand(-0.15, 0.15), 0.35, rand(-0.2, 0.2))), vel: V(0, -0.5, 0), life: 0.5, size: 0.015, gravity: 6, floor: st.pos.y, color: 0xbfe0ec });
    }
    this.drops.update(dt);
    this.rings.update(dt);
  }
}
