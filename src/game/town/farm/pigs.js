import * as THREE from 'three';
import { pigGeometry, PIG, instancedPart, rootMatrix, partMatrix } from '../../../entities/farmAnimals.js';
import { waterAt } from '../../../world/water.js';
import { fmsfx } from './sounds.js';

/*
 * 🐷 Three pigs in the muddy sty: Percy (a spotty Gloucester Old Spot, and a terrible escaper), Primrose and
 * Pudding (pink). They root about, wallow in the mud, trot over to say hello when a dog looks over the
 * wall, and if a dog rolls in the mud with them, they roll too. When Percy escapes (one of Farmer Mabel's
 * jobs) he runs off round the farm, and shies away from dogs: get behind him and shoo him back in through
 * the sty's gate. Each player's own pigs; four instanced meshes.
 */

export const PIGS = [{ name: 'Percy', spotty: true }, { name: 'Primrose' }, { name: 'Pudding' }];
const _root = new THREE.Matrix4(), _m = new THREE.Matrix4();
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Pigs {
  constructor({ scene, world, area, near }) {
    Object.assign(this, { scene, world, area, near });
    const G = pigGeometry();
    this.pink = instancedPart(G.body, 2);
    this.spotty = instancedPart(G.spotty, 1);
    this.head = instancedPart(G.head, 3, { shadow: false });
    this.legs = instancedPart(G.leg, 12, { shadow: false });
    scene.add(this.pink, this.spotty, this.head, this.legs);
    const st = area.sty, r = st.rect;
    this.rect = r;
    this.pigs = PIGS.map((p, i) => ({
      ...p, i, x: (r.x0 + r.x1) / 2 + (i - 1) * 1.1, z: (r.z0 + r.z1) / 2 + (i % 2 ? 0.8 : -0.6), h: i * 2.1, vx: 0, vz: 0, speed: 0,
      t: Math.random() * 3, phase: Math.random() * 6, lie: 0, roll: 0, walkTo: null, out: false, home: false,
    }));
    this.percy = this.pigs[0];
    this.t = 0;
    this.oinkT = 2;
    this.onSay = null;   // (pos, kind)
    this.onHome = null;  // Percy's back in the sty
  }

  inSty(x, z, pad = 0) { const r = this.rect; return x > r.x0 + pad && x < r.x1 - pad && z > r.z0 + pad && z < r.z1 - pad; }

  solid(x, z, pad = 0.28) {
    for (const c of this.near.circles) if (c.top > 0.25 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
    for (const b of this.near.boxes) if (b.top > 0.25 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    return !!waterAt(this.world.water, x, z, true);
  }

  anchor(p) { return new THREE.Vector3(p.x, 0.85, p.z); }

  /** Percy's off! Out through the gate and away round the farm. to: where he's heading first. */
  escape(to) {
    const p = this.percy;
    const st = this.area.sty;
    p.out = true; p.home = false; p.lie = 0; p.roll = 0; p.walkTo = null; p.t = 0.5;
    p.route = [{ x: st.inGate.x, z: st.inGate.z }, { x: st.gate.x, z: st.gate.z }, to]; // (through the gate, then off)
    fmsfx.squeal();
  }

  /** A dog's rolling in the mud nearby: everybody in the sty rolls too. */
  rollAll() { for (const p of this.pigs) if (!p.out) { p.roll = 1.6; p.lie = 0; } fmsfx.squeal(0.8); }

  bark(pos) {
    for (const p of this.pigs) if (flat(p, pos) < 7) { p.panic = 1.2; p.fromX = pos.x; p.fromZ = pos.z; p.lie = 0; }
    if (this.pigs.some((p) => flat(p, pos) < 7)) fmsfx.oink();
  }

  update(dt, dogs, near = true) {
    this.t += dt; this.oinkT -= dt;
    const st = this.area.sty, P = dogs[0];
    for (const p of this.pigs) {
      p.t -= dt; p.panic = Math.max(0, (p.panic ?? 0) - dt); p.roll = Math.max(0, p.roll - dt);
      let wx = 0, wz = 0, speed = 0;
      if (p.out) {
        if (p.route?.length) { // out through the gate first, then off to wherever he fancies
          const goal = p.route[0];
          wx = goal.x - p.x; wz = goal.z - p.z; speed = 2.2;
          if (Math.hypot(wx, wz) < 0.5) p.route.shift();
        } else {
          let fx = 0, fz = 0;
          for (const d of dogs) { const dx = p.x - d.x, dz = p.z - d.z, dd = Math.hypot(dx, dz); if (dd < 5 && dd > 1e-3) { const w = (5 - dd) / 5; fx += (dx / dd) * w; fz += (dz / dd) * w; } }
          if (p.panic > 0 && p.fromX !== undefined) { const dx = p.x - p.fromX, dz = p.z - p.fromZ, dd = Math.hypot(dx, dz) || 1; fx += dx / dd; fz += dz / dd; }
          if (fx || fz) {
            wx = fx; wz = fz; speed = 1.9 * Math.min(1.2, 0.6 + Math.hypot(fx, fz));
            // Shooed at the sty: he heads for the gap in the wall (not the wall).
            const gx = st.gate.x - p.x, gz = st.gate.z - p.z, gd = Math.hypot(gx, gz);
            if (gd < 3.2) { const ix = st.inGate.x - p.x, iz = st.inGate.z - p.z, il = Math.hypot(ix, iz) || 1, w = ((3.2 - gd) / 3.2) * 1.6; wx += (ix / il) * w; wz += (iz / il) * w; }
          }
          else {
            if (p.t <= 0) { p.t = 1.5 + Math.random() * 3; const a = Math.random() * 6.28; p.walkTo = Math.random() < 0.6 ? { x: p.x + Math.cos(a) * 2, z: p.z + Math.sin(a) * 2 } : null; }
            if (p.walkTo) { wx = p.walkTo.x - p.x; wz = p.walkTo.z - p.z; speed = Math.hypot(wx, wz) > 0.3 ? 0.7 : 0; }
          }
          if (this.oinkT <= 0 && P && flat(p, P) < 12) { this.oinkT = 3 + Math.random() * 3; fmsfx.oink(0.8); this.onSay?.(this.anchor(p), fx || fz ? 'percyOut' : 'oink'); }
          if (this.inSty(p.x, p.z, 0.3)) { p.out = false; p.home = true; this.onHome?.(p); }
        }
        this.move(p, wx, wz, speed, dt, true);
        continue;
      }
      if (!near) { p.phase += dt; continue; }
      // In the sty: root about, wallow, come and say hello over the wall.
      const d = P ? flat(P, { x: (this.rect.x0 + this.rect.x1) / 2, z: (this.rect.z0 + this.rect.z1) / 2 }) : 99;
      if (p.roll > 0) { speed = 0; }
      else if (d < 5 && P && p.i !== 2) { // (Pudding's having a lie-down whatever happens)
        wx = P.x - p.x; wz = P.z - p.z; speed = Math.hypot(wx, wz) > 1.2 ? 0.9 : 0; p.lie = 0;
        if (this.oinkT <= 0) { this.oinkT = 3.5 + Math.random() * 3; fmsfx.oink(0.7); this.onSay?.(this.anchor(p), 'hello'); }
      } else {
        if (p.t <= 0) {
          p.t = 2 + Math.random() * 5;
          const r = Math.random();
          if (r < 0.35) { p.lie = 1; p.walkTo = null; } else if (r < 0.75) { p.lie = 0; p.walkTo = { x: this.rect.x0 + 0.5 + Math.random() * (this.rect.x1 - this.rect.x0 - 1), z: this.rect.z0 + 0.5 + Math.random() * (this.rect.z1 - this.rect.z0 - 1) }; } else { p.lie = 0; p.walkTo = null; }
        }
        if (p.walkTo && !p.lie) { wx = p.walkTo.x - p.x; wz = p.walkTo.z - p.z; speed = Math.hypot(wx, wz) > 0.3 ? 0.55 : 0; }
      }
      for (const o of this.pigs) { if (o === p || o.out) continue; const dx = p.x - o.x, dz = p.z - o.z, dd = Math.hypot(dx, dz); if (dd < 0.9 && dd > 1e-3) { wx += (dx / dd) * 2; wz += (dz / dd) * 2; speed = Math.max(speed, 0.4); } }
      this.move(p, wx, wz, speed, dt, false);
      const r = this.rect; // (the sty's gate is open, but they never wander out on their own… except Percy, on purpose)
      p.x = Math.min(r.x1 - 0.35, Math.max(r.x0 + 0.35, p.x)); p.z = Math.min(r.z1 - 0.35, Math.max(r.z0 + 0.35, p.z));
    }
    this.draw(dt);
  }

  move(p, dx, dz, speed, dt, out) {
    const n = Math.hypot(dx, dz) || 1, k = 1 - Math.exp(-dt * 5);
    p.vx += ((dx / n) * speed - p.vx) * k; p.vz += ((dz / n) * speed - p.vz) * k;
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    if (!out || !this.solid(nx, nz)) { p.x = nx; p.z = nz; }
    else if (!this.solid(nx, p.z)) p.x = nx; else if (!this.solid(p.x, nz)) p.z = nz; else { p.vx *= -0.3; p.vz *= -0.3; p.walkTo = null; }
    if (out) { // (an escaped pig stays on the farm, out of the fields)
      const b = this.bounds;
      if (b) { p.x = Math.min(b.x1, Math.max(b.x0, p.x)); p.z = Math.min(b.z1, Math.max(b.z0, p.z)); }
    }
    p.speed = Math.hypot(p.vx, p.vz);
    if (p.speed > 0.06) { let dh = Math.atan2(p.vx, p.vz) - p.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); p.h += dh * (1 - Math.exp(-dt * 6)); }
    p.phase += dt * (3 + p.speed * 9);
  }

  draw(dt) {
    let pink = 0;
    for (const p of this.pigs) {
      p.lieK = (p.lieK ?? 0) + ((p.lie || p.roll > 0 ? 1 : 0) - (p.lieK ?? 0)) * (1 - Math.exp(-dt * 3));
      const roll = p.roll > 0 ? Math.sin(p.roll * 6) * 1.4 : 0, side = p.lieK * 1.25 + roll; // (over on her side in the mud)
      const moving = Math.min(1, p.speed / 1.2);
      rootMatrix(_root, p.x, -p.lieK * 0.12 + Math.abs(Math.sin(p.phase)) * 0.02 * moving, p.z, p.h, 1, 0, side);
      if (p.spotty) this.spotty.setMatrixAt(0, _root); else this.pink.setMatrixAt(pink++, _root);
      const snuffle = moving < 0.1 && !p.lie ? Math.sin(this.t * 9 + p.i) * 0.08 + 0.25 : 0;
      this.head.setMatrixAt(p.i, partMatrix(_m, _root, PIG.NECK, snuffle, Math.sin(this.t * 0.6 + p.i * 2) * 0.3 * (1 - moving), 0));
      PIG.HIPS.forEach((hip, j) => {
        const ph = p.phase + (j === 0 || j === 3 ? 0 : Math.PI);
        this.legs.setMatrixAt(p.i * 4 + j, partMatrix(_m, _root, hip, Math.sin(ph) * 0.6 * moving + p.lieK * (j < 2 ? -0.5 : 0.5), 0, 0));
      });
    }
    for (const m of [this.pink, this.spotty, this.head, this.legs]) m.instanceMatrix.needsUpdate = true;
  }

  dispose() { for (const m of [this.pink, this.spotty, this.head, this.legs]) m.removeFromParent(); }
}
