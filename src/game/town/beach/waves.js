import * as THREE from 'three';
import { LineBag } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { season } from '../../season.js';
import { WAVES } from '../../lines/beach.js';
import { bsfx } from './sounds.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeOut = (t) => 1 - (1 - t) ** 3;
const smooth = (t) => t * t * (3 - 2 * t);
const UP = 0.34, BACK = 0.84; // a wave runs up the sand for this much of its time, slides back till here, then rests

/**
 * 🌊 The waves: one after another they run up the sand and slide back, and every so often there's a big
 * one. The sea's water zone moves with them (so a wave over your paws is a paddle: a splash, and mud
 * washes off), and the sheet of water on the sand (world/areas/sea.js) is drawn to match. Dogs being dogs:
 * run away from a wave as it comes in and stay dry (a star or two), or chase it back out to sea.
 * Each device has its own waves (they're just for fun; nothing about them is shared).
 */
export class Waves {
  constructor({ area, player, hud, actions }) {
    Object.assign(this, { area, player, hud, actions });
    this.zone = area.sea.zone;
    this.U = area.sea.uniforms;
    this.shore = area.shore;
    this.dir = area.dir; this.across = area.across;
    this.t = 0;
    this.n = Math.floor(Math.random() * 5);
    this.bags = {};
    this.cool = { caught: 0, missed: 0, chase: 0, big: 0 };
    this.next(0);
    this.edge = this.shore + 0.5;
    this.going = 0;
    this.wasWet = false;
    this.dodge = false;
    this.sprayT = 0;
    this.sheenK = 0;
    this.lastR = 3;
  }

  line(key) { return (this.bags[key] ??= new LineBag(WAVES[key])).next(); }

  /** A new wave: how far up the sand it runs (R, metres) and how long it all takes (T, seconds). */
  next(t) {
    const rough = season.weather === 'windy' ? 1.25 : season.weather === 'showers' || season.weather === 'snow' || season.is('winter') ? 1.12 : season.is('summer') ? 0.88 : 1;
    this.n++;
    const big = this.n % 7 === 0;
    this.wave = { start: t, T: big ? 10 : (6.4 + Math.random() * 2.8) / Math.sqrt(rough), R: big ? 7.1 : Math.min(6.2, (2.1 + Math.random() * 3.1) * rough), big };
    this.sounded = false;
    this.turned = false;
  }

  /** Where the water's edge is (v, in the beach's frame) right now, and which way it's going (-1 up the sand, +1 back). */
  edgeNow() {
    const w = this.wave, p = (this.t - w.start) / w.T, top = this.shore + 0.5, reach = w.R + 0.5;
    if (p < UP) return [top - reach * easeOut(p / UP), -1];
    if (p < BACK) return [top - reach * (1 - smooth((p - UP) / (BACK - UP))), 1];
    return [top, 0];
  }

  /** Near the beach at all? (how loud the sea is: 0 … 1) */
  nearness(P) {
    const v = this.dir[0] * P.pos.x + this.dir[1] * P.pos.z, u = this.across[0] * P.pos.x + this.across[1] * P.pos.z, a = this.area.plan;
    const side = Math.max(0, a.u0 - u, u - a.u1);
    return Math.max(0, 1 - (Math.abs(v - this.shore) + side * 1.5) / 55);
  }

  update(dt, { canAct = true } = {}) {
    this.t += dt;
    for (const k in this.cool) this.cool[k] -= dt;
    const w = this.wave;
    if (this.t - w.start >= w.T) this.next(this.t);
    const [edge, going] = this.edgeNow();
    this.edge = edge;
    this.going = going;
    this.zone.edge = edge; // (the water zone: physics, splashes and washing off mud follow it)
    const U = this.U;
    U.uEdge.value = edge - this.shore;
    // Wet, shiny sand where the last wave reached, drying off.
    if (going > 0 && !this.turned) { this.turned = true; this.lastR = this.wave.R; this.sheenK = 1; }
    this.sheenK = Math.max(0, this.sheenK - dt / 7);
    U.uSheen.value = -this.lastR;
    U.uSheenK.value = this.sheenK;

    const P = this.player, near = this.nearness(P);
    // The sound of it.
    if (!this.sounded) { this.sounded = true; if (near > 0.02) bsfx.wave(near * (w.big ? 1.3 : 0.9)); }
    if (going > 0 && !this.backed) { this.backed = true; if (near > 0.05) bsfx.backwash(near * 0.8); }
    if (going <= 0) this.backed = false;

    // Dogs and waves.
    const pv = this.dir[0] * P.pos.x + this.dir[1] * P.pos.z, pu = this.across[0] * P.pos.x + this.across[1] * P.pos.z, a = this.area.plan;
    const onBeach = pu > a.u0 && pu < a.u1 && pv > this.shore - 12 && pv < this.shore + 3 && P.pos.y < 0.15;
    const wet = onBeach && pv > edge;
    const landward = -(P.vel.x * this.dir[0] + P.vel.y * this.dir[1]); // (speed up the beach, away from the sea)
    if (w.big && going < 0 && onBeach && this.cool.big <= 0 && this.t - w.start < 0.4) { this.cool.big = 20; this.hud.float(WAVES.big, this.actions.anchor()); }
    if (canAct && onBeach) {
      if (going < 0) {
        // Running away from a wave as it comes in.
        if (!wet && edge - pv < 2.8 && landward > 1.4) this.dodge = true;
        if (wet && !this.wasWet && this.cool.caught <= 0) {
          this.cool.caught = 6;
          this.dodge = false;
          this.hud.float(`🌊 ${this.line('caught')}`, this.actions.anchor());
          bsfx.spray(0.8);
        }
      } else if (this.dodge && !wet && this.turned) {
        // It turned back, and you're still dry!
        this.dodge = false;
        if (this.cool.missed <= 0) { this.cool.missed = 9; this.hud.float(`🐾 ${this.line('missed')}`, this.actions.anchor(), 'xp'); progress.award(2, 'Dodged a wave!'); }
      }
      // Chasing it back out to sea.
      if (going > 0 && pv > edge - 2 && pv < edge + 1.2 && landward < -2.2 && this.cool.chase <= 0) { this.cool.chase = 14; this.hud.float(`🌊 ${this.line('chase')}`, this.actions.anchor()); }
    }
    if (going >= 0 && !onBeach) this.dodge = false;
    this.wasWet = wet;

    // A little spray along the front as it runs up, near the dog.
    this.sprayT -= dt;
    if (going < 0 && this.sprayT <= 0 && Math.abs(pv - edge) < 14 && onBeach) {
      this.sprayT = 0.1;
      const u = pu + (Math.random() - 0.5) * 10, v = edge + 0.15, x = this.across[0] * u + this.dir[0] * v, z = this.across[1] * u + this.dir[1] * v;
      this.actions.waterFx.drops.burst(2, () => ({
        pos: V(x, 0.05, z), vel: V(this.dir[0] * -0.8 + (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.9, this.dir[1] * -0.8 + (Math.random() - 0.5) * 0.6),
        life: 0.6, size: 0.03, gravity: 6, floor: 0.0, color: 0xf2f7f6,
      }));
    }
  }
}
