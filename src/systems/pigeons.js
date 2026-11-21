import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { Particles } from '../fx/particles.js';
import { sfx } from '../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => t * t * (3 - 2 * t);

const C = { body: 0x9aa3b4, wing: 0x7f8798, head: 0x8a93a6, neck: 0x6fae8f, beak: 0x4a4444, tail: 0x6f7788 };
const POSE_FAR = 40; // metres: a flock on the ground further from the dog than this keeps its last pose
const POSE_HALF = 20; // …and one further than this is posed every other frame
const _tmp = V(0, 0, 0), _prev = V(0, 0, 0), _vel = V(0, 0, 0), _goal = V(0, 0, 0), _to = V(0, 0, 0);

function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}

/**
 * Flocks of pigeons pecking about. Run at them or bark and they burst into the air, flap off
 * and land somewhere else (sometimes up on a roof). Every bird in the world shares a handful
 * of instanced meshes, so a big town full of pigeons stays cheap to draw.
 *
 * spots: [Vector3] places a flock can land (y > 0 = a roof, out of reach — only a bark works).
 * flocks: [{ id, spot, size }]
 */
export class Pigeons {
  constructor(scene, spots, flocks) {
    this.spots = spots;
    const total = flocks.reduce((n, f) => n + f.size, 0);
    // A pigeon is small (its body 15 cm, its head 4): smooth 252-triangle balls for every part made
    // ~1,500 triangles a bird, all drawn every frame with their shadows. Now ~440, and only the body
    // and wings cast shadows (the head, neck, beak and tail's are a few pixels inside the body's).
    const body = new THREE.SphereGeometry(1, 10, 7), small = new THREE.SphereGeometry(1, 8, 6), flat = new THREE.SphereGeometry(1, 8, 4);
    const make = (geo, color, count = total, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, paint(color, { kind: 'inst' }), count);
      m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.parts = {
      body: make(body, C.body),
      head: make(small, C.head, total, false),
      neck: make(small, C.neck, total, false),
      beak: make(new THREE.ConeGeometry(1, 1, 6), C.beak, total, false),
      tail: make(flat, C.tail, total, false),
      wing: make(flat, C.wing, total * 2),
    };
    // A reusable "rig": pose it for one bird, then copy each part's matrix into the instances.
    this.rig = new THREE.Object3D();
    const part = (pos, scale, rot = [0, 0, 0], parent = this.rig) => {
      const o = new THREE.Object3D(); o.position.set(...pos); o.scale.set(...scale); o.rotation.set(...rot); parent.add(o); return o;
    };
    this.r = {
      body: part([0, 0.11, 0], [0.075, 0.07, 0.11], [0.15, 0, 0]),
      neckPivot: part([0, 0.15, 0.06], [1, 1, 1]),
      tail: part([0, 0.12, -0.12], [0.05, 0.015, 0.07], [-0.25, 0, 0]),
      wingLp: part([-0.06, 0.15, 0.0], [1, 1, 1]),
      wingRp: part([0.06, 0.15, 0.0], [1, 1, 1]),
    };
    this.r.neck = part([0, 0.0, 0.0], [0.045, 0.05, 0.045], [0, 0, 0], this.r.neckPivot);
    this.r.head = part([0, 0.05, 0.02], [0.042, 0.042, 0.045], [0, 0, 0], this.r.neckPivot);
    this.r.beak = part([0, 0.045, 0.07], [0.012, 0.03, 0.012], [Math.PI / 2, 0, 0], this.r.neckPivot);
    this.r.wingL = part([-0.05, 0, -0.01], [0.06, 0.012, 0.1], [0, 0, 0], this.r.wingLp);
    this.r.wingR = part([0.05, 0, -0.01], [0.06, 0.012, 0.1], [0, 0, 0], this.r.wingRp);

    this.feathers = new Particles(scene, { max: 80 });
    let index = 0;
    this.flocks = flocks.map((f) => {
      const home = spots[f.spot].clone();
      const birds = [];
      for (let i = 0; i < f.size; i++) {
        const off = V(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(home.y > 0.5 ? 0.9 : 1.3);
        birds.push({
          i: index++, pos: home.clone().add(off), heading: rand(0, 6.28), target: off.clone(),
          peck: rand(0, 3), walkT: rand(0, 3), flap: rand(0, 6), spread: V(rand(-1.5, 1.5), rand(-0.6, 0.8), rand(-1.5, 1.5)),
        });
      }
      return { ...f, home, birds, state: 'ground', t: 0, roofT: rand(18, 35), fresh: true }; // (fresh: pose it at least once, however far)
    });
    this.time = 0;
  }

  byId(id) { return this.flocks.find((f) => f.id === id); }

  center(f) { return f.state === 'ground' ? f.home : f.birds[0].pos; }

  /** Pick somewhere else to land (index into spots). */
  pickLanding(f) {
    let i;
    do { i = Math.floor(Math.random() * this.spots.length); } while (this.spots.length > 1 && this.spots[i].distanceTo(f.home) < 3);
    return i;
  }

  /**
   * Send a flock flying. `from` = whoever scared it (they fly away from it).
   * Returns the landing spot index (so other players' games can fly them to the same place).
   */
  scatter(f, from, landing = this.pickLanding(f), loud = true) {
    if (f.state !== 'ground') return null;
    const start = f.home.clone();
    const away = start.clone().sub(from).setY(0);
    if (away.lengthSq() < 0.01) away.set(rand(-1, 1), 0, rand(-1, 1));
    away.normalize();
    const land = this.spots[landing].clone();
    const up = Math.max(start.y, land.y) + rand(5, 8);
    f.path = [start, start.clone().addScaledVector(away, 4).setY(up * 0.8), land.clone().setY(up), land];
    f.state = 'flying';
    f.t = 0;
    f.dur = 4.5 + start.distanceTo(land) * 0.06;
    f.landing = landing;
    for (const b of f.birds) b.takeoff = b.pos.clone();
    if (loud) sfx.flutter?.();
    this.feathers.burst(10, () => ({
      pos: start.clone().add(V(rand(-0.6, 0.6), rand(0.1, 0.4), rand(-0.6, 0.6))),
      vel: V(rand(-0.8, 0.8), rand(0.6, 1.4), rand(-0.8, 0.8)), life: rand(1.2, 2), size: 0.025, gravity: 0.6, drag: 1.5,
      floor: start.y + 0.02, color: 0xd8dde6, squash: 0.3,
    }));
    return landing;
  }

  /**
   * Per frame. dog: { pos, speed } of the local player.
   * Returns flocks the local dog scared this frame: [{ flock, landing }].
   */
  update(dt, dog) {
    this.time += dt;
    const scared = [];
    for (const f of this.flocks) {
      if (f.state === 'ground') {
        // Running at a flock on the ground sends it flying.
        const d = Math.hypot(dog.pos.x - f.home.x, dog.pos.z - f.home.z);
        const reachable = Math.abs(dog.pos.y - f.home.y) < 1;
        if (reachable && d < 2.8 && dog.speed > 2.0) { const landing = this.scatter(f, dog.pos); scared.push({ flock: f, landing }); }
        // Pigeons on a roof get bored and come back down eventually.
        if (f.home.y > 0.5 && (f.roofT -= dt) <= 0) {
          f.roofT = rand(18, 35);
          let i; do { i = Math.floor(Math.random() * this.spots.length); } while (this.spots[i].y > 0.5);
          this.scatter(f, f.home.clone().add(V(0, 0, 1)), i, false);
        }
      } else {
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.state = 'ground';
          f.home = this.spots[f.landing].clone();
          f.roofT = rand(18, 35);
          f.fresh = true; // (landed: pose them on the ground once, even far away)
          for (const b of f.birds) {
            b.target = V(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(f.home.y > 0.5 ? 0.9 : 1.3);
            b.pos.copy(f.home).add(b.target);
          }
        }
      }
    }
    this.pose(dt, dog.pos);
    this.feathers.update(dt);
    return scared;
  }

  /** A bark scares every flock within earshot (even ones up on the roof). */
  bark(pos) {
    const out = [];
    for (const f of this.flocks) {
      if (f.state === 'ground' && Math.hypot(pos.x - f.home.x, pos.z - f.home.z) < 6.5) out.push({ flock: f, landing: this.scatter(f, pos) });
    }
    return out;
  }

  /**
   * Pose every bird into the instanced meshes. A flock pottering about on the ground far from the dog
   * (a few pixels, in the haze) keeps its last pose: re-posing all ~65 birds every frame cost the most
   * on phones with slow JavaScript. Flying flocks always move.
   */
  pose(frameDt, near) {
    const p = this.parts, r = this.r, tmp = _tmp;
    let posed = false, closest = Infinity;
    this.frame = (this.frame ?? 0) + 1;
    for (const [fi, f] of this.flocks.entries()) {
      const at = f.state === 'flying' ? f.birds[0]?.pos ?? f.home : f.home, d = near ? Math.hypot(near.x - at.x, near.z - at.z) : 0;
      closest = Math.min(closest, d);
      f.since = (f.since ?? 0) + frameDt; // (time since this flock was last posed)
      if (f.state === 'ground' && near && !f.fresh) {
        if (d > POSE_FAR) continue;
        if (d > POSE_HALF && (this.frame + fi) % 2) continue; // (a little way off: every other frame does)
      }
      const dt = Math.min(f.since, 0.1); // (all the time since it was last posed, so it keeps pace; not a leap after a long wait)
      f.since = 0;
      f.fresh = false;
      posed = true;
      for (const b of f.birds) {
        let flying = false;
        if (f.state === 'flying') {
          // Follow the flock's curve, each bird a little spread out, wobbling.
          const t = smooth(Math.min(1, f.t));
          bezier(f.path[0], f.path[1], f.path[2], f.path[3], t, tmp);
          const spread = Math.sin(Math.PI * Math.min(1, f.t));
          const prev = _prev.copy(b.pos);
          b.pos.copy(tmp).addScaledVector(b.spread, spread);
          b.pos.y += Math.sin(this.time * 5 + b.i) * 0.08 * spread;
          if (f.t < 0.08) b.pos.lerp(b.takeoff, 1 - f.t / 0.08);
          const v = _vel.subVectors(b.pos, prev);
          if (v.lengthSq() > 1e-6) b.heading = Math.atan2(v.x, v.z);
          flying = f.t < 0.97;
          b.flap += dt * (f.t > 0.35 && f.t < 0.75 && Math.sin(this.time + b.i) > 0.6 ? 4 : 22); // glide now and then
        } else {
          // Pottering about: waddle to a spot, peck, pick a new spot.
          const goal = _goal.addVectors(f.home, b.target);
          const to = _to.subVectors(goal, b.pos).setY(0), left = to.length();
          if (left > 0.05) {
            b.heading = Math.atan2(to.x, to.z);
            b.pos.addScaledVector(to.normalize(), Math.min(left, dt * 0.35)); // (a step, but never past the spot)
          } else if ((b.walkT -= dt) <= 0) {
            b.walkT = rand(1.5, 4);
            b.target = V(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(f.home.y > 0.5 ? 0.9 : 1.3);
          }
          b.pos.y = f.home.y;
          b.flap = 0;
        }
        // Pose the rig.
        const walking = !flying && b.target && _goal.addVectors(f.home, b.target).distanceTo(b.pos) > 0.05;
        this.rig.position.copy(b.pos);
        this.rig.position.y += walking ? Math.abs(Math.sin(this.time * 14 + b.i)) * 0.02 : 0;
        this.rig.rotation.set(flying ? -0.15 : 0, b.heading, 0);
        b.peck += dt;
        const peckAmt = !flying && !walking ? Math.max(0, Math.sin(b.peck * 5 + b.i)) : 0;
        r.neckPivot.rotation.x = peckAmt * 1.1 + (walking ? Math.sin(this.time * 14 + b.i) * 0.25 : 0);
        const flap = flying ? Math.sin(b.flap) * 1.1 : -0.15;
        r.wingLp.rotation.z = flying ? -0.2 - flap : 0.25;
        r.wingRp.rotation.z = flying ? 0.2 + flap : -0.25;
        r.wingLp.rotation.y = r.wingRp.rotation.y = 0;
        this.rig.updateMatrixWorld(true);
        p.body.setMatrixAt(b.i, r.body.matrixWorld);
        p.neck.setMatrixAt(b.i, r.neck.matrixWorld);
        p.head.setMatrixAt(b.i, r.head.matrixWorld);
        p.beak.setMatrixAt(b.i, r.beak.matrixWorld);
        p.tail.setMatrixAt(b.i, r.tail.matrixWorld);
        p.wing.setMatrixAt(b.i * 2, r.wingL.matrixWorld);
        p.wing.setMatrixAt(b.i * 2 + 1, r.wingR.matrixWorld);
      }
    }
    if (posed) for (const m of Object.values(p)) m.instanceMatrix.needsUpdate = true; // (nothing moved: nothing to send)
    // Their shadows only with a flock near the dog (the sun's shadow map only covers a few metres round her).
    const shadows = closest < 30;
    if (shadows !== this.shadows) { this.shadows = shadows; p.body.castShadow = p.wing.castShadow = shadows; }
  }
}
