import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { TOWN } from '../world/town/generator.js';
import { car } from '../world/town/townProps.js';
import { mergeStatic } from '../world/merge.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LANE = 1.25;           // drive on the left, this far from the centre line
const CRUISE = 5.2, ACCEL = 2.6, BRAKE = 10, TURN = 2.2;
const HALF_W = 0.9, HALF_L = 1.85, ROOF = 1.25;
const COLORS = [0xd9534f, 0x5b86c4, 0xf6d06a, 0x6f9a52, 0xf1e8d8, 0x8e6fb0, 0xe39a52];
const SAY = ['Beep beep!', 'Out of the road, pup!', 'Shoo, doggy!', 'Silly dog! Off you go!', 'Morning, doggo! Now MOVE, please.', 'Honk honk!', 'Mind the car, sausage!'];
const SORRY = ['Oops! Sorry, pup!', 'Whoa! You OK, little one?', 'Careful, doggy!', 'Bonk! Sorry!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * Cars pottering round the neighbourhood's streets. They stop and honk when a dog's in the way;
 * a dog who runs into one gets a gentle bonk and loses a bit of puff — nobody ever gets hurt.
 * (Each player's game drives its own cars; they stop for friends' dogs too.)
 */
export class Traffic {
  constructor(scene, { seed, hud, count = 7, avoid = null }) {
    this.hud = hud;
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
      g.add(mergeStatic(car(0, 0, 0, COLORS[id % COLORS.length])));
      g.position.copy(pos);
      scene.add(g);
      const c = { id: id++, g, pos: g.position, heading: Math.atan2(dir.x, dir.z), speed: CRUISE * 0.6, from, to, phase: 'approach', honkCD: rng.float(0, 2), stuck: 0, bumpCD: 0, wait: 0 };
      this.aim(c);
      this.cars.push(c);
    }
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
      c.honkCD -= dt; c.bumpCD -= dt; c.wait -= dt;
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
        if (ahead > 0 && ahead < 2.6 + c.speed * 1.1 && Math.abs(side) < 1.35 && p.y < ROOF + 0.3) { target = 0; dogAhead = p; }
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

      // Bumping into the local dog: push them out of the way, gently.
      const r = V(player.pos.x - c.pos.x, 0, player.pos.z - c.pos.z), lz = r.dot(f), lx = r.dot(l), R = player.radius ?? 0.28;
      if (Math.abs(lx) < HALF_W + R && Math.abs(lz) < HALF_L + R && player.pos.y < ROOF) {
        const px = HALF_W + R - Math.abs(lx), pz = HALF_L + R - Math.abs(lz);
        const out = px < pz ? l.clone().multiplyScalar(Math.sign(lx) || 1) : f.clone().multiplyScalar(Math.sign(lz) || 1);
        player.pos.addScaledVector(out, Math.min(px, pz) + 0.01);
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

  honk(c, listener, line, beep = true) {
    const d = c.pos.distanceTo(listener);
    if (d > 30) return;
    if (beep) sfx.honk?.(Math.max(0.15, 1 - d / 30));
    const at = c.pos;
    if (d < 22) this.hud.say(`🚗 ${line}`, () => at.clone().setY(1.9), 2.2);
  }
}
