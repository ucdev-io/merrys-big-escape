import * as THREE from 'three';
import { TOWN } from '../world/town/generator.js';
import { car } from '../world/town/townProps.js';
import { mergeStatic } from '../world/merge.js';
import { iceCreamVan, CAR_COLORS } from '../systems/traffic.js';

/*
 * 🚗 Friends riding on cars. Every player's game drives its own cars (see systems/traffic.js), so a friend riding
 * on top of one of theirs would just float along through the air here, standing on nothing. Instead a car of
 * ours turns up under them: a friend standing (not jumping) a car's height up, with nothing here to stand on,
 * is on a car. It goes the way they go (as they're carried along), and when they hop off it drives on and is
 * gone once it's out of sight.
 */

const ROOF = 1.15;    // feet higher than this: on a car's roof (lower: its bonnet)
const VAN = 1.6;      // higher still: on the ice-cream van
const CRUISE = 5.2;   // (as traffic.js)
const LANE = 1.25;
const SEEN = 0.15;    // s standing on nothing before a car turns up
const S = TOWN.SIZE, STEP = TOWN.BLOCK + TOWN.ROAD;
const LINES = Array.from({ length: TOWN.N + 1 }, (_, k) => -S / 2 + TOWN.ROAD / 2 + k * STEP);
const nearest = (v) => LINES.reduce((b, l) => (Math.abs(v - l) < Math.abs(v - b) ? l : b), LINES[0]);
const turnTo = (a, b, max) => a + THREE.MathUtils.clamp(Math.atan2(Math.sin(b - a), Math.cos(b - a)), -max, max);

/** Which way a car here would be going: along the nearest road, on the left (as the town's cars drive). */
function laneHeading(x, z) {
  const lx = nearest(x), lz = nearest(z);
  if (Math.abs(x - lx) < Math.abs(z - lz)) return x > lx ? 0 : Math.PI; // (a road running north–south)
  return z < lz ? Math.PI / 2 : -Math.PI / 2;
}

export class RideCars {
  constructor(scene, { groundAt, onScreen }) {
    Object.assign(this, { scene, groundAt, onScreen });
    this.rides = new Map(); // friend's id → { g (the car), kind, pos, heading, vx, vz (its speed), at (where she is on it), on, t, seen }
  }

  /**
   * Every frame, for each friend's dog seen in town. pos: where it is (feet), grounded: not in the air, own: its
   * own walking speed, other: sledging or in the water (never on a car). Returns true while it's riding.
   */
  update(dt, id, pos, { grounded, own, other }) {
    let r = this.rides.get(id);
    const floating = grounded && !other && pos.y > 0.6 && this.groundAt(pos.x, pos.z, pos.y) < pos.y - 0.35;
    if (floating) {
      if (!r?.on) {
        const near = r?.g?.visible && Math.hypot(pos.x - r.pos.x, pos.z - r.pos.z) < 2.5; // (straight back on: the same car)
        if (near) r.at = null; // (wherever she landed on it)
        else r = this.start(id, r, pos, dt);
        if (!r) return false;
        r.on = true;
      }
      this.ride(r, dt, pos, own);
      return true;
    }
    if (r) { r.seen = 0; if (r.on) { r.on = false; r.t = 0; } }
    return false;
  }

  /** Cars nobody's on any more drive off (and go once they're out of sight), and friends who left lose theirs. */
  tick(dt, ids) {
    for (const [id, r] of this.rides) {
      if (!ids.has(id)) { this.drop(id); continue; }
      if (r.on || !r.g?.visible) continue;
      r.t += dt;
      if (r.t > 1.2) { // (pause a moment, then off it goes)
        const f = Math.hypot(r.vx, r.vz), v = Math.min(CRUISE, f + 2.6 * dt);
        r.vx = Math.sin(r.heading) * v; r.vz = Math.cos(r.heading) * v;
      }
      r.pos.x += r.vx * dt; r.pos.z += r.vz * dt;
      this.place(r);
      if (r.t > 9 || (r.t > 1.5 && !this.onScreen(r.pos))) r.g.visible = false;
    }
  }

  start(id, r, pos, dt) {
    if (!r) r = { pos: new THREE.Vector3(), seen: 0 };
    r.seen = (r.seen ?? 0) + dt;
    if (r.seen < SEEN) { this.rides.set(id, r); return null; } // (not just a blip)
    const kind = pos.y > VAN ? 'van' : 'car';
    if (r.kind !== kind) {
      if (r.g) this.dispose(r.g);
      r.g = new THREE.Group();
      r.g.add(mergeStatic(kind === 'van' ? iceCreamVan() : car(0, 0, 0, CAR_COLORS[Math.abs(hash(id)) % CAR_COLORS.length])));
      this.scene.add(r.g);
      r.kind = kind;
    }
    // Under her: the roof's middle is a bit behind the car's; on the bonnet, she's near the front.
    r.heading = laneHeading(pos.x, pos.z);
    const back = kind === 'van' ? 0 : pos.y > ROOF ? -0.2 : 1.2;
    r.pos.set(pos.x - Math.sin(r.heading) * back, 0, pos.z - Math.cos(r.heading) * back);
    r.vx = 0; r.vz = 0; r.t = 0; r.at = { side: 0, along: back };
    r.g.visible = true;
    this.rides.set(id, r);
    this.place(r);
    return r;
  }

  /**
   * Carried along: standing still on top, she stays put on the car, so the car goes wherever she goes. Walking
   * about up there, the car carries on as it was (and she's kept on its top: past an edge, it's caught up).
   */
  ride(r, dt, pos, own) {
    const was = { x: r.pos.x, z: r.pos.z }, v = Math.hypot(r.vx, r.vz);
    if (v > 0.8) r.heading = turnTo(r.heading, Math.atan2(r.vx, r.vz), dt * 2.5 * Math.min(1, v / 2)); // (round a corner: it turns under her)
    const s = Math.sin(r.heading), c = Math.cos(r.heading);
    if (own < 0.5 && r.at) { r.pos.x = pos.x - (r.at.side * c + r.at.along * s); r.pos.z = pos.z - (-r.at.side * s + r.at.along * c); }
    else { r.pos.x += r.vx * dt; r.pos.z += r.vz * dt; }
    if (own < 0.5 && dt > 0) { // (how fast the car's going: which way it faces, and how it drives off when she hops down)
      const k = 1 - Math.exp(-dt * 5);
      r.vx += ((r.pos.x - was.x) / dt - r.vx) * k; r.vz += ((r.pos.z - was.z) / dt - r.vz) * k;
    }
    // Where she is on it (it's 1.7 by 3.6 m), kept on its top.
    const dx = pos.x - r.pos.x, dz = pos.z - r.pos.z;
    const hw = r.kind === 'van' ? 0.6 : 0.55, hl = r.kind === 'van' ? 1.5 : 1.45;
    const side = THREE.MathUtils.clamp(dx * c - dz * s, -hw, hw), along = THREE.MathUtils.clamp(dx * s + dz * c, -hl, hl);
    r.pos.x = pos.x - (side * c + along * s);
    r.pos.z = pos.z - (-side * s + along * c);
    r.at = { side, along };
    this.place(r);
  }

  place(r) {
    r.g.position.set(r.pos.x, 0, r.pos.z);
    r.g.rotation.y = r.heading;
  }

  drop(id) {
    const r = this.rides.get(id);
    if (r?.g) this.dispose(r.g);
    this.rides.delete(id);
  }

  dispose(g) {
    g.removeFromParent();
    g.traverse((o) => o.geometry?.dispose()); // (the paint is shared: it stays)
  }

  clear() { for (const id of [...this.rides.keys()]) this.drop(id); }
}

/** A friend's id, as a steady number (which colour of car they get). */
function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}
