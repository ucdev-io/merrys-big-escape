import * as THREE from 'three';
import { paint } from '../../../render/watercolorMaterial.js';
import { buzz } from '../../../core/haptics.js';
import { LineBag } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { season } from '../../season.js';
import { GULLS } from '../../lines/beach.js';
import { gullBodyGeometry, gullWingGeometry, chipTrayGeometry, chipsGeometry } from '../../../entities/beachItems.js';
import { bsfx } from './sounds.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const N = 7;          // gulls at the beach (the first is Gulliver: bigger, and the ringleader)
const REFILL = 40;    // seconds before a picnic has more chips
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}

/**
 * 🐦 Seagulls: circling over the beach, standing about on hut roofs, groynes and rocks — and every so often
 * one swoops down on a picnic and pinches the chips (Gulliver, the biggest, loves to shout about it). Woof
 * at a swooping gull to save the chips; woof (or run) at standing ones to send them flapping off. Each
 * device has its own gulls (friends' woofs scare them too). All of them are two instanced meshes.
 */
export class Gulls {
  constructor(B) {
    this.B = B;
    const area = B.area, scene = B.scene;
    const mk = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, paint(0xffffff, { vertexColors: true, kind: 'inst' }), count);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.bodyMesh = mk(gullBodyGeometry(), N);
    this.wingMeshR = mk(gullWingGeometry(1), N);
    this.wingMeshL = mk(gullWingGeometry(-1), N);
    // Chips on the picnic blankets.
    this.picnics = area.picnics.map((p) => ({ ...p, full: true, refill: 0, cool: 0 }));
    this.trayMesh = mk(chipTrayGeometry(), this.picnics.length);
    this.chipsMesh = mk(chipsGeometry(), this.picnics.length);
    this.trayMesh.castShadow = this.chipsMesh.castShadow = false;
    this.perches = area.perches;
    const taken = new Set();
    this.gulls = Array.from({ length: N }, (_, i) => {
      let k = Math.floor(Math.random() * this.perches.length);
      for (let t = 0; t < 10 && taken.has(k); t++) k = Math.floor(Math.random() * this.perches.length);
      taken.add(k);
      const g = { i, big: i === 0, s: i === 0 ? 1.32 : rand(0.92, 1.06), pos: this.perches[k].clone(), heading: rand(0, 6.28), perch: k, state: 'perch', t: rand(8, 30), flap: rand(0, 6), look: 0, lookT: rand(1, 3), path: null };
      if (i % 2) this.circle(g, true);
      return g;
    });
    // A rig to pose one gull at a time (its parts' matrices go into the instances).
    this.rig = new THREE.Object3D();
    this.wingR = new THREE.Object3D(); this.wingL = new THREE.Object3D();
    this.wingR.position.set(0.075, 0.25, 0.02); this.wingL.position.set(-0.075, 0.25, 0.02);
    this.rig.add(this.wingR, this.wingL);
    this.swoopT = rand(9, 16);
    this.callT = rand(3, 7);
    this.awardT = 0;
    this.bags = {};
    this.time = 0;
    this.placeChips();
  }

  line(key) { return (this.bags[key] ??= new LineBag(GULLS[key])).next(); }

  /** Which picnics have anyone at them (in winter just the one hardy pair, with a flask and chips). */
  active(i) { return !season.is('winter') || i === 0; }

  placeChips() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.picnics.forEach((p, i) => {
      q.setFromEuler(e.set(0, p.face + 0.4, 0));
      m.compose(p.chips, q, V(1, 1, 1));
      const on = this.active(i);
      this.trayMesh.setMatrixAt(i, on ? m : ZERO);
      this.chipsMesh.setMatrixAt(i, on && p.full ? m : ZERO);
    });
    this.trayMesh.instanceMatrix.needsUpdate = this.chipsMesh.instanceMatrix.needsUpdate = true;
  }

  /** Up into the sky, round and round over the beach. */
  circle(g, now = false) {
    const c = this.B.area.at(this.B.area.layout.gateU + rand(-30, 30), this.B.area.shore - rand(6, 16));
    g.circ = { cx: c.x, cz: c.z, r: rand(6, 11), h: rand(6.5, 10), ang: rand(0, 6.28), dir: Math.random() < 0.5 ? 1 : -1 };
    if (now) { g.state = 'circle'; g.pos.copy(this.circlePos(g, 0)); }
    else this.fly(g, this.circlePos(g, 1.5), 'circle', rand(1.6, 2.4), 4);
    g.t = rand(14, 34);
  }

  circlePos(g, ahead = 0) {
    const c = g.circ, a = c.ang + ahead * c.dir * (5 / c.r);
    return V(c.cx + Math.cos(a) * c.r, c.h + Math.sin(this.time * 0.7 + g.i) * 0.4, c.cz + Math.sin(a) * c.r);
  }

  /** Fly along a curve to `to`, then be in `state`. lift: how high the curve goes. */
  fly(g, to, state, dur, lift = 3) {
    const from = g.pos.clone(), d = to.clone().sub(from).setY(0), l = d.length() || 1;
    d.divideScalar(l);
    g.path = { p: [from, from.clone().addScaledVector(d, l * 0.3).setY(Math.max(from.y, to.y) + lift), to.clone().addScaledVector(d, -l * 0.25).setY(to.y + lift * 0.6), to.clone()], t: 0, dur };
    g.state = 'fly';
    g.then = state;
  }

  /** A swoop on a picnic's chips. */
  swoop(g, p) {
    p.cool = 14;
    g.target = p;
    this.fly(g, p.chips.clone().setY(0.04), 'grab', 2.6, 2.5);
    g.swooping = true;
  }

  /** Something gave this gull a fright: off it goes, squawking. foiled: it was after the chips. */
  scare(g, from) {
    if (g.state === 'circle' || (g.state === 'fly' && g.then === 'circle' && !g.swooping)) return false;
    const away = g.pos.clone().sub(from).setY(0);
    if (away.lengthSq() < 0.01) away.set(rand(-1, 1), 0, rand(-1, 1));
    away.normalize();
    const foiled = !!g.swooping || g.state === 'grab';
    g.swooping = false;
    g.target = null;
    this.circle(g);
    g.path.p[1].copy(g.pos).addScaledVector(away, 2.5).setY(g.pos.y + 2.5); // (straight up and away first)
    g.path.dur = 1.6;
    this.B.actions.dirt.burst(5, () => ({ pos: g.pos.clone().add(V(rand(-0.2, 0.2), 0.25, rand(-0.2, 0.2))), vel: V(rand(-0.8, 0.8), rand(0.6, 1.4), rand(-0.8, 0.8)), life: rand(1.2, 2), size: 0.022, gravity: 0.6, drag: 1.5, floor: 0.03, color: 0xf2f2ee }));
    return { foiled };
  }

  /** A woof at pos (mine, or a friend's). Returns { n, foiled } (how many it scared, and whether chips were saved). */
  onBark(pos, mine = true) {
    let n = 0, foiled = 0;
    for (const g of this.gulls) {
      if (Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z) > 7.5 || g.pos.y > 4.5) continue;
      const r = this.scare(g, pos);
      if (!r) continue;
      n++;
      if (r.foiled) foiled++;
    }
    if (n) { bsfx.squawk(mine ? 1 : 0.6); if (n > 1) setTimeout(() => bsfx.squawk(0.7), 180); }
    if (mine && n) {
      const B = this.B;
      if (foiled) { B.hud.float(`🍟 ${this.line('saved')}`, B.actions.anchor(), 'xp'); progress.award(3, 'Picnic saved!'); buzz(15); }
      else if (this.awardT <= 0) { this.awardT = 8; progress.award(1 + n, n > 1 ? `${n} seagulls!` : 'Shoo, seagull!'); }
      const g = this.gulls.find((q) => q.state === 'fly' && q.path.t < 0.1);
      if (g) B.hud.say(`🐦 ${this.line('shoo')}`, () => g.pos.clone().add(V(0, 0.5, 0)), 1.8);
    }
    return { n, foiled };
  }

  update(dt, P, { canAct = true, busy = false } = {}) {
    this.time += dt;
    this.awardT -= dt;
    const B = this.B;
    // Picnics get more chips after a while.
    let chipsChanged = false;
    for (const p of this.picnics) {
      p.cool -= dt;
      if (!p.full && (p.refill -= dt) <= 0) { p.full = true; chipsChanged = true; if (flat(P.pos, p.pos) < 16) B.hud.float(GULLS.bought, p.pos.clone().setY(1.0), 'sniff'); }
    }
    if (chipsChanged || this.season !== season.name) { this.season = season.name; this.placeChips(); }
    // Every so often, a swoop on somebody's chips (more often while Sandy wants them shooed).
    this.swoopT -= dt;
    if (this.swoopT <= 0) {
      this.swoopT = busy ? rand(6, 10) : rand(14, 26) * (season.is('summer') ? 0.8 : 1);
      const pics = this.picnics.filter((p, i) => this.active(i) && p.full && p.cool <= 0 && flat(P.pos, p.pos) < 45);
      const free = this.gulls.filter((g) => g.state === 'circle' || g.state === 'perch');
      if (pics.length && free.length) {
        const p = busy ? pics.reduce((a, c) => (flat(a.pos, P.pos) < flat(c.pos, P.pos) ? a : c)) : pics[Math.floor(Math.random() * pics.length)]; // (for Sandy's job: the one you're guarding)
        const g = this.gulls[0].state === 'circle' || this.gulls[0].state === 'perch' ? (Math.random() < 0.5 ? this.gulls[0] : free[Math.floor(Math.random() * free.length)]) : free[Math.floor(Math.random() * free.length)];
        this.swoop(g, p);
      }
    }
    for (const g of this.gulls) this.step(g, dt, P, canAct);
    // Gulls calling now and then (louder when they're near).
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = rand(4, 10);
      const g = this.gulls[Math.floor(Math.random() * N)], d = g.pos.distanceTo(P.pos);
      if (d < 40) bsfx.gull(Math.max(0.15, 1 - d / 40) * (season.weather === 'showers' ? 0.5 : 1));
    }
    this.pose(dt);
  }

  step(g, dt, P, canAct) {
    g.t -= dt;
    if (g.state === 'fly') {
      const p = g.path;
      p.t = Math.min(1, p.t + dt / p.dur);
      const prev = g.pos.clone();
      bezier(p.p[0], p.p[1], p.p[2], p.p[3], p.t * p.t * (3 - 2 * p.t), g.pos);
      const v = g.pos.clone().sub(prev);
      if (v.x * v.x + v.z * v.z > 1e-7) g.heading = Math.atan2(v.x, v.z);
      g.flap += dt * (p.t > 0.3 && p.t < 0.7 ? 6 : 16);
      if (p.t >= 1) {
        g.state = g.then;
        if (g.state === 'grab') g.t = 0.9;
        if (g.state === 'perch') g.t = rand(12, 35);
      }
      return;
    }
    if (g.state === 'circle') {
      const c = g.circ;
      c.ang += dt * c.dir * (5 / c.r);
      const prev = g.pos.clone();
      g.pos.copy(this.circlePos(g));
      g.heading = Math.atan2(g.pos.x - prev.x, g.pos.z - prev.z);
      g.flap += dt * (Math.sin(this.time * 0.5 + g.i) > 0.3 ? 9 : 1.5); // flap a bit, glide a bit
      if (g.t <= 0) { // come down for a rest somewhere
        const k = Math.floor(Math.random() * this.perches.length);
        if (!this.gulls.some((q) => q !== g && q.perch === k && q.state === 'perch')) { g.perch = k; this.fly(g, this.perches[k], 'perch', rand(2.4, 3.4), 2); }
        else g.t = 3;
      }
      return;
    }
    if (g.state === 'grab') { // on the blanket, beak in the chips
      g.flap = 0;
      if (g.t <= 0) {
        const p = g.target;
        g.swooping = false;
        if (p?.full) {
          p.full = false; p.refill = REFILL;
          this.placeChips();
          const B = this.B, near = flat(P.pos, p.pos) < 22;
          if (near) {
            B.hud.say(`🐦 ${this.line('mine')}`, () => g.pos.clone().add(V(0, 0.55 * g.s, 0)), 2.2);
            if (B.crowd?.peopleAt(p)) setTimeout(() => B.hud.say(`😮 ${this.line('oi')}`, () => p.pos.clone().add(V(0, 1.25, 0)), 2.4), 700);
            bsfx.gull(0.9);
          }
        }
        g.target = null;
        this.circle(g);
      }
      return;
    }
    // Standing about: looking round; running at it sends it off.
    g.flap = 0;
    g.lookT -= dt;
    if (g.lookT <= 0) { g.lookT = rand(1.2, 3.5); g.look = rand(-1.2, 1.2); }
    g.heading += (g.look * 0.5) * dt;
    if (canAct && Math.abs(P.pos.y - g.pos.y) < 1.2 && P.speed > 2.2 && flat(P.pos, g.pos) < 2.6) {
      this.scare(g, P.pos);
      bsfx.squawk(0.8);
      if (this.awardT <= 0) { this.awardT = 8; progress.award(2, 'Shoo, seagull!'); }
      return;
    }
    if (g.t <= 0) this.circle(g);
  }

  pose() {
    const r = this.rig, R = this.wingR, L = this.wingL;
    for (const g of this.gulls) {
      const flying = g.state === 'fly' || g.state === 'circle';
      r.position.copy(g.pos);
      if (g.state === 'grab') r.position.y += Math.abs(Math.sin(this.time * 10)) * 0.02;
      r.rotation.set(flying ? -0.12 : g.state === 'grab' ? 0.35 : 0, g.heading, 0);
      r.scale.setScalar(g.s);
      if (flying) { // (each wing is the other's mirror image, so the left one turns the other way)
        const f = Math.sin(g.flap) * 0.75;
        R.rotation.set(0, 0, 0.15 + f); L.rotation.set(0, 0, -(0.15 + f));
      } else { // folded along its sides
        R.rotation.set(0.1, Math.PI / 2 - 0.05, -0.3); L.rotation.set(0.1, -(Math.PI / 2 - 0.05), 0.3);
      }
      r.updateMatrixWorld(true);
      this.bodyMesh.setMatrixAt(g.i, r.matrixWorld);
      this.wingMeshR.setMatrixAt(g.i, R.matrixWorld);
      this.wingMeshL.setMatrixAt(g.i, L.matrixWorld);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = this.wingMeshR.instanceMatrix.needsUpdate = this.wingMeshL.instanceMatrix.needsUpdate = true;
  }

  /** Gulliver (for a story to find): where he is. */
  get gulliver() { return this.gulls[0].pos; }
}
