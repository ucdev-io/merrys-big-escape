import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { TOWN } from '../world/town/generator.js';
import { car } from '../world/town/townProps.js';
import { mergeStatic } from '../world/merge.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { music } from '../core/music.js';
import { mesh } from '../world/props.js';
import { ICECREAM } from '../game/lines/life.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LANE = 1.25;           // drive on the left, this far from the centre line
const CRUISE = 5.2, ACCEL = 2.6, BRAKE = 10, TURN = 2.2;
// A car's shape, for bumping into and landing on: the body (bonnet and boot height), and the cabin on top
// (the roof), from the front of the car (+) to the back. The ice-cream van's one tall box.
const CAR = [{ hw: 0.85, hl: 1.8, at: 0, top: 0.85 }, { hw: 0.75, hl: 1.0, at: -0.2, top: 1.33 }];
const VAN = [{ hw: 0.9, hl: 1.9, at: 0, top: 1.78 }];
const SCRABBLE = 0.12; // (a dog that only just makes it up scrabbles the rest of the way)
const COLORS = [0xd9534f, 0x5b86c4, 0xf6d06a, 0x6f9a52, 0xf1e8d8, 0x8e6fb0, 0xe39a52];
const SAY = ['Beep beep!', 'Out of the road, pup!', 'Shoo, doggy!', 'Silly dog! Off you go!', 'Morning, doggo! Now MOVE, please.', 'Honk honk!', 'Mind the car, sausage!'];
const SORRY = ['Oops! Sorry, pup!', 'Whoa! You OK, little one?', 'Careful, doggy!', 'Bonk! Sorry!'];
const ROOF = ['There’s a DOG on my car!', 'Hold on tight, pup!', 'Next stop: the bakery!', 'Fares, please! …No? Go on then.', 'Is that a dog on the roof?!', 'Wheee! Where to, doggy?'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** The ice-cream van: cream and pink, a serving hatch on the pavement side, a giant cone on the roof. */
function iceCreamVan() {
  const g = new THREE.Group();
  const RB = (w, h, d, r = 0.15) => new RoundedBoxGeometry(w, h, d, 3, r);
  mesh(RB(1.8, 1.45, 3.8, 0.25), 0xf6f1e8, g, [0, 1.05, 0]);
  mesh(RB(1.84, 0.4, 3.84, 0.15), 0xf2a0b4, g, [0, 0.5, 0]);
  mesh(RB(1.5, 0.55, 0.06, 0.04), 0x9ab8cf, g, [0, 1.35, 1.9], [-0.15, 0, 0]);          // windscreen
  mesh(RB(0.06, 0.6, 1.5, 0.03), 0x5a4a44, g, [0.92, 1.25, -0.3]);                       // serving hatch (left side)
  for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.4, 0.04, 0.26), i % 2 ? 0xf2a0b4 : 0xffffff, g, [1.1, 1.62, -0.95 + i * 0.26], [0, 0, -0.35]); // stripy awning
  for (const sx of [-0.8, 0.8]) for (const sz of [-1.2, 1.2]) mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), 0x2b2b2b, g, [sx, 0.32, sz], [0, 0, Math.PI / 2]);
  const cone = new THREE.Group(); cone.position.set(0, 1.85, 0.4); g.add(cone);
  mesh(new THREE.ConeGeometry(0.28, 0.75, 14), 0xd9a066, cone, [0, 0.35, 0], [Math.PI, 0, 0]);
  mesh(new THREE.SphereGeometry(0.33, 16, 12), 0xf2a0b4, cone, [0, 0.8, 0]);
  mesh(new THREE.SphereGeometry(0.07, 10, 8), 0xd9534f, cone, [0, 1.13, 0]);
  return g;
}

/**
 * Cars pottering round the neighbourhood's streets. They stop and honk when a dog's in the way;
 * a dog who runs into one gets a gentle bonk and loses a bit of puff — nobody ever gets hurt. Hop up
 * onto a bonnet (and from there the roof) and you ride along on top: the driver doesn't mind. Much.
 * (Each player's game drives its own cars; they stop for friends' dogs too.)
 */
export class Traffic {
  constructor(scene, { seed, hud, count = 7, avoid = null }) {
    this.hud = hud;
    this.onServe = null; // (where) → an ice cream for the dog
    this.van = { stay: 12, gap: [35, 55], cool: 40 }; // the ice-cream van: parks this long, this often, serves this often (summer: more!)
    const S = TOWN.SIZE, step = TOWN.BLOCK + TOWN.ROAD;
    this.lines = Array.from({ length: TOWN.N + 1 }, (_, k) => -S / 2 + TOWN.ROAD / 2 + k * step);
    const rng = new RNG(`traffic:${seed}`);
    this.cars = [];
    for (let id = 0, tries = 0; id < count && tries < 200; tries++) {
      // Start somewhere along a random street, heading for a random end of it.
      const i = rng.int(0, TOWN.N), j = rng.int(0, TOWN.N);
      const nb = this.neighbours(i, j);
      const to = rng.pick(nb), from = [i, j];
      const a = this.node(from), b = this.node(to), dir = b.clone().sub(a).normalize();
      const pos = a.clone().lerp(b, rng.float(0.3, 0.7)).add(this.left(dir).multiplyScalar(LANE));
      if (avoid && pos.distanceTo(avoid) < 25) continue;
      if (this.cars.some((c) => c.pos.distanceTo(pos) < 12)) continue;
      const g = new THREE.Group();
      const iceCream = id === 0; // the first one's the ice-cream van
      g.add(mergeStatic(iceCream ? iceCreamVan() : car(0, 0, 0, COLORS[id % COLORS.length])));
      g.position.copy(pos);
      scene.add(g);
      const c = { id: id++, g, pos: g.position, heading: Math.atan2(dir.x, dir.z), speed: CRUISE * 0.6, from, to, phase: 'approach', honkCD: rng.float(0, 2), stuck: 0, bumpCD: 0, wait: 0, iceCream, parkIn: 25, parked: 0, jingleT: 0, serveCD: 0, shape: iceCream ? VAN : CAR, rideCD: 0 };
      this.aim(c);
      this.cars.push(c);
    }
  }

  /** Every car's bonnet and roof, as moving platforms for the dog to land on (see Colliders.surfaceAt). */
  platforms(out = []) {
    for (const c of this.cars) for (const b of c.shape) {
      out.push({ x: c.pos.x + Math.sin(c.heading) * b.at, z: c.pos.z + Math.cos(c.heading) * b.at, hw: b.hw, hl: b.hl, rot: c.heading, top: b.top, reach: SCRABBLE, ride: c });
    }
    return out;
  }

  node([i, j]) { return V(this.lines[i], 0, this.lines[j]); }
  left(d) { return V(d.z, 0, -d.x); } // left of travelling along d
  neighbours(i, j) {
    return [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a <= TOWN.N && b <= TOWN.N);
  }

  /** Where the car is heading next: the near side of the next crossroads, then out the other side. */
  aim(c) {
    const a = this.node(c.from), b = this.node(c.to), d = b.clone().sub(a).normalize();
    if (c.phase === 'approach') c.wp = b.clone().addScaledVector(d, -5).addScaledVector(this.left(d), LANE);
    else {
      const opts = this.neighbours(...c.to).filter(([x, y]) => x !== c.from[0] || y !== c.from[1]);
      const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : c.from;
      c.from = c.to; c.to = next;
      const d2 = this.node(c.to).sub(this.node(c.from)).normalize();
      c.wp = this.node(c.from).addScaledVector(d2, 5).addScaledVector(this.left(d2), LANE);
    }
  }

  /**
   * @param player  the local dog (can be bonked)
   * @param others  positions of friends' dogs (cars stop for them too)
   * @returns { bonked } when this car gently bumps the local dog
   */
  update(dt, player, others = []) {
    let bonked = null;
    const dogs = [player.pos, ...others];
    for (const c of this.cars) {
      c.honkCD -= dt; c.bumpCD -= dt; c.wait -= dt; c.rideCD -= dt;
      const riding = player.riding === c, was = { x: c.pos.x, z: c.pos.z, h: c.heading };
      if (riding && !c.rider && c.rideCD <= 0) { c.rideCD = 20; this.honk(c, player.pos, pick(ROOF), false); }
      c.rider = riding;
      const f = V(Math.sin(c.heading), 0, Math.cos(c.heading)), l = V(f.z, 0, -f.x);
      // Steer for the next waypoint; slow down for corners.
      const to = c.wp.clone().sub(c.pos).setY(0), dist = to.length();
      if (dist < 1.4 || (dist < 4 && to.dot(f) < 0)) {
        c.phase = c.phase === 'approach' ? 'exit' : 'approach';
        this.aim(c);
      }
      let turn = Math.atan2(to.x, to.z) - c.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      let target = CRUISE * (1 - 0.55 * THREE.MathUtils.smoothstep(Math.abs(turn), 0.25, 1.2));

      // Dogs in the road: brake (and honk if they don't move).
      let dogAhead = null;
      for (const p of dogs) {
        const r = V(p.x - c.pos.x, 0, p.z - c.pos.z), ahead = r.dot(f), side = r.dot(l);
        if (ahead > 0 && ahead < 2.6 + c.speed * 1.1 && Math.abs(side) < 1.35 && p.y < 0.6) { target = 0; dogAhead = p; } // (not one riding on top!)
      }
      // Queue behind other cars; at crossroads the lower-numbered car goes first.
      for (const o of this.cars) {
        if (o === c) continue;
        const r = o.pos.clone().sub(c.pos), ahead = r.dot(f), side = r.dot(l), cos = Math.cos(o.heading - c.heading);
        if (cos > 0.7) { if (ahead > 0 && ahead < 7.5 && Math.abs(side) < 1.6) target = Math.min(target, Math.max(0, (ahead - 4.6) * 1.3)); }
        else if (cos > -0.7 && o.id < c.id && ahead > 0 && ahead < 6 && Math.abs(side) < 3) target = 0; // crossing paths
        // (oncoming cars are in the other lane: nothing to do)
      }
      if (c.wait > 0) target = 0;
      if (c.iceCream) target = Math.min(target, this.iceCream(c, dt, player, f, l, dist)) ;
      c.speed += THREE.MathUtils.clamp(target - c.speed, -BRAKE * dt, ACCEL * dt);
      c.stuck = dogAhead && c.speed < 0.6 ? c.stuck + dt : 0;
      if (dogAhead && c.honkCD <= 0 && (c.stuck > 0.5 || c.pos.distanceTo(dogAhead) < 3.2)) {
        c.honkCD = 2.8;
        this.honk(c, player.pos, pick(SAY));
      }
      c.heading += THREE.MathUtils.clamp(turn, -TURN * dt, TURN * dt) * Math.min(1, c.speed / 1.5);
      c.pos.addScaledVector(V(Math.sin(c.heading), 0, Math.cos(c.heading)), c.speed * dt);
      c.g.rotation.y = c.heading;
      c.g.position.y = Math.sin(performance.now() / 90 + c.id) * 0.008 * Math.min(1, c.speed / 2); // a little rumble

      // A dog riding on top comes along for the ride (and turns with the car).
      if (riding) {
        const dh = c.heading - was.h, ox = player.pos.x - was.x, oz = player.pos.z - was.z, s = Math.sin(dh), k = Math.cos(dh);
        player.pos.x = c.pos.x + ox * k + oz * s;
        player.pos.z = c.pos.z + oz * k - ox * s;
        player.heading += dh;
        player.object.rotation.y = player.heading;
      }

      // Bumping into the local dog: push them out of the way, gently. (The body's a wall to a dog on the road;
      // the cabin's a wall to one on the bonnet. Above the top, it's something to stand on.)
      const r = V(player.pos.x - c.pos.x, 0, player.pos.z - c.pos.z), lz0 = r.dot(f), lx = r.dot(l), R = player.radius ?? 0.28;
      for (const b of c.shape) {
        const lz = lz0 - b.at;
        if (!(Math.abs(lx) < b.hw + R && Math.abs(lz) < b.hl + R && player.pos.y < b.top - SCRABBLE)) continue;
        const px = b.hw + R - Math.abs(lx), pz = b.hl + R - Math.abs(lz);
        const out = px < pz ? l.clone().multiplyScalar(Math.sign(lx) || 1) : f.clone().multiplyScalar(Math.sign(lz) || 1);
        player.pos.addScaledVector(out, Math.min(px, pz) + 0.01);
        if (b !== c.shape[0] || player.pos.y > 0.4) continue; // (only a dog on the road gets bonked)
        if (c.speed > 0.8 && c.bumpCD <= 0) {
          c.bumpCD = 2; c.wait = 1.6; // the driver stops to check you're OK
          player.vel.x += out.x * 2.6 + f.x * Math.min(c.speed, 4) * 0.4;
          player.vel.y += out.z * 2.6 + f.z * Math.min(c.speed, 4) * 0.4;
          player.vy = Math.max(player.vy, 3.2);
          player.grounded = false;
          player.stamina = Math.max(0, player.stamina - 0.25);
          c.speed = 0;
          this.honk(c, player.pos, pick(SORRY), false);
          sfx.bonk?.();
          buzz([30, 40, 30]);
          bonked = c;
        }
      }
    }
    return { bonked };
  }

  /** The ice-cream van's day: potter about playing its tune, park now and then, hand dogs a cone. Returns a speed limit. */
  iceCream(c, dt, player, f, l, toWaypoint) {
    c.jingleT -= dt; c.serveCD -= dt; c.parkIn -= dt;
    const d = c.pos.distanceTo(player.pos);
    if (c.jingleT <= 0 && d < 30) { c.jingleT = 4.6; music.jingle(1 - d / 30); }
    const van = this.van;
    if (c.parked <= 0 && c.parkIn <= 0 && c.phase === 'approach' && toWaypoint > 9) { c.parked = van.stay; c.parkIn = van.gap[0] + Math.random() * (van.gap[1] - van.gap[0]); }
    if (c.parked > 0) {
      c.parked -= dt;
      // A dog at the hatch (the pavement side) gets an ice cream.
      const hatch = c.pos.clone().addScaledVector(l, 1.5);
      if (c.speed < 0.3 && c.serveCD <= 0 && player.pos.distanceTo(hatch) < 1.8) {
        c.serveCD = van.cool;
        this.hud.say(`🍦 ${pick(ICECREAM.serve)}`, () => c.pos.clone().setY(2.6), 2.6);
        this.onServe?.(c.pos.clone().addScaledVector(l, 1.6));
      }
      return 0;
    }
    return CRUISE * 0.7;
  }

  honk(c, listener, line, beep = true) {
    const d = c.pos.distanceTo(listener);
    if (d > 30) return;
    if (beep) sfx.honk?.(Math.max(0.15, 1 - d / 30));
    const at = c.pos;
    if (d < 22) this.hud.say(`🚗 ${line}`, () => at.clone().setY(1.9), 2.2);
  }
}
