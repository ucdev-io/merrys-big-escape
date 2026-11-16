import * as THREE from 'three';
import { henGeometry, HEN, instancedPart, rootMatrix, partMatrix } from '../../../entities/farmAnimals.js';
import { waterAt } from '../../../world/water.js';
import { fmsfx } from './sounds.js';
import { fsfx } from '../../../core/friendSounds.js';

/*
 * 🐔 The farm's hens, pecking about round their hen house: they scatter in a flap if a dog comes running
 * (or woofs), then settle down again. And 🐓 Rory the rooster, who keeps watch from the hen house roof and
 * crows at anybody who woofs at him. Each player's own hens (like Brock, they're yours); four instanced
 * meshes for the lot.
 */

const N = 6, RORY = N;           // six hens, and Rory
const HOME_R = 7.5;              // they don't stray further than this from the hen house
const TINTS = [[0.84, 0.52, 0.32], [1, 1, 1], [0.7, 0.68, 0.65], [0.78, 0.44, 0.27], [1, 1, 1], [0.84, 0.52, 0.32]].map(([r, g, b]) => new THREE.Color(r, g, b));
const RORY_TINT = new THREE.Color(1.0, 0.6, 0.3);
const _root = new THREE.Matrix4(), _m = new THREE.Matrix4();

export class Hens {
  constructor({ scene, world, area, near }) {
    Object.assign(this, { scene, world, area, near });
    const G = henGeometry();
    this.body = instancedPart(G.body, N + 1);
    this.head = instancedPart(G.head, N + 1, { shadow: false });
    this.wings = instancedPart(G.wing, (N + 1) * 2, { shadow: false });
    this.legs = instancedPart(G.leg, (N + 1) * 2, { shadow: false });
    scene.add(this.body, this.head, this.wings, this.legs);
    const c = area.coop.pos;
    this.home = c;
    this.hens = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.4, r = 1.6 + (i % 3) * 1.1;
      const h = { i, rory: i === RORY, x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, h: a, vx: 0, vz: 0, speed: 0, t: Math.random() * 3, phase: Math.random() * 6, flap: 0, hop: 0, panic: 0, peck: 0, walkTo: null, y: 0 };
      if (h.rory) { h.x = c.x; h.z = c.z; h.y = 1.71; h.h = area.coop.face; }
      this.hens.push(h);
      const tint = h.rory ? RORY_TINT : TINTS[i % TINTS.length];
      this.body.setColorAt(i, tint); this.head.setColorAt(i, tint);
      this.wings.setColorAt(i * 2, tint); this.wings.setColorAt(i * 2 + 1, tint);
    }
    for (const m of [this.body, this.head, this.wings]) m.instanceColor.needsUpdate = true;
    this.t = 0;
    this.roryT = 0;
    this.cluckT = 4;
    this.onSay = null; // (pos, kind) → a "Bwak!" or Rory's crow
  }

  solid(x, z, pad = 0.15) {
    for (const c of this.near.circles) if (c.top > 0.25 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
    for (const b of this.near.boxes) if (b.top > 0.25 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    return !!waterAt(this.world.water, x, z, true);
  }

  /** A woof (anyone's): hens nearby panic, and Rory crows about it. */
  bark(pos) {
    let any = false;
    for (const h of this.hens) {
      const d = Math.hypot(h.x - pos.x, h.z - pos.z);
      if (h.rory) { if (d < 9 && this.roryT <= 0) { this.roryT = 6; h.flap = 1.2; setTimeout(() => fmsfx.crow(Math.max(0.35, 1 - d / 14)), 250); this.onSay?.(this.anchor(h), 'rory'); } continue; }
      if (d < 7) { h.panic = 1.6; h.flap = 0.8; h.hop = 0.3; h.fromX = pos.x; h.fromZ = pos.z; any = true; }
    }
    if (any) { fsfx.cluck(); fmsfx.flap(0.8); this.onSay?.(this.anchor(this.hens[0]), 'bwak'); }
  }

  anchor(h) { return new THREE.Vector3(h.x, h.y + 0.55 * (h.rory ? 1.3 : 1), h.z); }

  update(dt, dogs, near = true) {
    this.t += dt; this.roryT -= dt; this.cluckT -= dt;
    const c = this.home;
    for (const h of this.hens) {
      h.flap = Math.max(0, h.flap - dt); h.hop = Math.max(0, h.hop - dt); h.panic = Math.max(0, h.panic - dt); h.t -= dt;
      if (h.rory) { h.phase += dt * 3; continue; }
      if (!near) continue; // (nobody about: they just stand there pecking)
      // A dog running about nearby: scatter! (a walking dog only makes them step aside)
      let fx = 0, fz = 0;
      for (const d of dogs) {
        const dx = h.x - d.x, dz = h.z - d.z, dd = Math.hypot(dx, dz), r = (d.v ?? 0) > 3 ? 3.4 : 1.8;
        if (dd < r && dd > 1e-3) { fx += (dx / dd) * (r - dd); fz += (dz / dd) * (r - dd); if ((d.v ?? 0) > 3 && h.panic <= 0) { h.panic = 1.1; h.flap = 0.6; if (this.cluckT <= 0) { this.cluckT = 1.5; fsfx.cluck(0.7); this.onSay?.(this.anchor(h), 'bwak'); } } }
      }
      if (h.panic > 0 && h.fromX !== undefined) { const dx = h.x - h.fromX, dz = h.z - h.fromZ, dd = Math.hypot(dx, dz) || 1; fx += dx / dd; fz += dz / dd; }
      let wx = 0, wz = 0, speed = 0;
      if (fx || fz) { wx = fx; wz = fz; speed = h.panic > 0 ? 2.6 : 1.6; h.peck = 0; }
      else {
        if (h.t <= 0) {
          h.t = 1 + Math.random() * 3;
          if (Math.random() < 0.5) { const a = Math.random() * 6.28, r = Math.random() * 1.8; h.walkTo = { x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r }; h.peck = 0; }
          else { h.walkTo = null; h.peck = 1; }
        }
        if (h.walkTo) { wx = h.walkTo.x - h.x; wz = h.walkTo.z - h.z; speed = Math.hypot(wx, wz) > 0.15 ? 0.55 : 0; if (!speed) h.walkTo = null; }
      }
      // Home's this way.
      const hx = c.x - h.x, hz = c.z - h.z, hd = Math.hypot(hx, hz);
      if (hd > HOME_R) { wx += (hx / hd) * (hd - HOME_R); wz += (hz / hd) * (hd - HOME_R); speed = Math.max(speed, 0.8); }
      const n = Math.hypot(wx, wz) || 1, k = 1 - Math.exp(-dt * 7);
      h.vx += ((wx / n) * speed - h.vx) * k; h.vz += ((wz / n) * speed - h.vz) * k;
      const nx = h.x + h.vx * dt, nz = h.z + h.vz * dt;
      if (!this.solid(nx, nz)) { h.x = nx; h.z = nz; } else if (!this.solid(nx, h.z)) h.x = nx; else if (!this.solid(h.x, nz)) h.z = nz; else { h.vx *= -0.5; h.vz *= -0.5; h.walkTo = null; }
      h.speed = Math.hypot(h.vx, h.vz);
      if (h.speed > 0.05) { let dh = Math.atan2(h.vx, h.vz) - h.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); h.h += dh * (1 - Math.exp(-dt * 8)); }
      h.phase += dt * (6 + h.speed * 9);
    }
    this.draw();
  }

  draw() {
    const t = this.t;
    for (const h of this.hens) {
      const s = h.rory ? 1.3 : 1, moving = Math.min(1, h.speed / 1.4);
      const hopY = h.hop > 0 ? Math.sin((h.hop / 0.3) * Math.PI) * 0.12 : 0;
      rootMatrix(_root, h.x, h.y + hopY + Math.abs(Math.sin(h.phase)) * 0.015 * moving, h.z, h.h, s, 0, Math.sin(h.phase) * 0.08 * moving);
      this.body.setMatrixAt(h.i, _root);
      // Chickens keep their heads still and then jerk them forward: a bob when walking, pecks when not.
      const peck = h.peck && moving < 0.1 && Math.sin(t * 0.9 + h.i) > 0.6 ? Math.sin(t * 18 + h.i) * 0.5 + 0.5 : 0;
      const crowing = h.rory && h.flap > 0 ? -0.6 : 0;
      this.head.setMatrixAt(h.i, partMatrix(_m, _root, [0, HEN.NECK[1] - peck * 0.08, HEN.NECK[2] + (moving > 0.1 ? Math.max(0, Math.sin(h.phase)) * 0.03 : 0) + peck * 0.04], peck * 0.9 + crowing, h.rory || moving < 0.1 ? Math.sin(t * 0.7 + h.i) * 0.5 : 0, 0));
      const flap = h.flap > 0 ? (Math.sin(t * 38 + h.i) * 0.5 + 0.5) * 1.1 : 0;
      HEN.WINGS.forEach((w, j) => this.wings.setMatrixAt(h.i * 2 + j, partMatrix(_m, _root, w, 0, 0, (j ? -1 : 1) * flap)));
      HEN.HIPS.forEach((p, j) => this.legs.setMatrixAt(h.i * 2 + j, partMatrix(_m, _root, p, (j ? -1 : 1) * Math.sin(h.phase) * 0.6 * moving, 0, 0)));
    }
    for (const m of [this.body, this.head, this.wings, this.legs]) m.instanceMatrix.needsUpdate = true;
  }

  dispose() { for (const m of [this.body, this.head, this.wings, this.legs]) m.removeFromParent(); }
}
