import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeRigid } from '../../world/merge.js';
import { Person } from '../../entities/person.js';
import { Dog } from '../../entities/dog.js';
import { BREED_KEYS } from '../../entities/breeds.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../../game/progress.js';
import { COSMETICS } from '../../game/cosmetics.js';
import { TripChapter } from '../kit.js';
import { disposeTree } from '../dispose.js';
import { buildFair, PLAN } from './build.js';
import { Carousel, BigWheel, Helter, Coaster, dodgemModel, sitStill, seatAt, coasterCar } from './rides.js';

/*
 * 🎡 Wagtail Wonderland: a day out on the bus (from any town's bus stop: see game/town/busStop.js). Five rides,
 * each a 🐾 at its gate: the 🎠 carousel (round and round on a horse), the 🎡 big wheel (all the way round, and what a
 * view), the 🌀 helter-skelter (up inside, whoosh down), the 🎢 Wiggly Woof (click-click-click up the lift hill… and
 * WHEEE), and the 🚗 dodgems (drive with the stick; bump the other dogs!). Go on 5 rides for the 🎈 funfair balloon.
 * The bus home is by the gate.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const BEST_KEY = 'merry.trips.v1';
const bests = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; } catch { return {}; } };
const keepBest = (k, n) => { try { const s = bests(); if (n > (s[k] ?? 0)) { localStorage.setItem(BEST_KEY, JSON.stringify({ ...s, [k]: n })); return true; } } catch { /* private mode */ } return false; };
const RIDES = {
  carousel: { emoji: '🎠', name: 'the carousel', hop: '🐾 Hop on the carousel!' },
  wheel: { emoji: '🎡', name: 'the big wheel', hop: '🐾 Ride the big wheel!' },
  helter: { emoji: '🌀', name: 'the helter-skelter', hop: '🐾 Up the helter-skelter!' },
  coaster: { emoji: '🎢', name: 'the Wiggly Woof', hop: '🐾 Ride the Wiggly Woof!' },
  dodgems: { emoji: '🚗', name: 'the dodgems', hop: '🐾 Hop in a dodgem!' },
};
const DODGE_SECS = 40;
const RIDE_N = { carousel: 1, wheel: 2, helter: 3, coaster: 4, dodgems: 5 }; // (which ride she's on, as friends are told: 4 bits)
const LINES = {
  carousel: ['Round and round!', 'Giddy-up!', 'Wheee, round we go!'],
  wheel: ['What a view! 🎡', 'Look how tiny everything is!', 'Up, up, up…'],
  helter: ['Wheeeeee!', 'Round and round and DOWN!'],
  coaster: ['WHEEEEE!', 'AAAAAH! (Happy aaah.)', 'Again! Again!'],
  operator: ['Hop in the front car!', 'Paws inside the car at all times!', 'The Wiggly Woof! Only for the bravest dogs!'],
  seller: ['Candy floss! Lovely and fluffy!', 'Ice creams! Ice creams!', 'Popcorn! Get your popcorn!'],
  dodge: ['BONK!', 'Bump!', 'Boing!', 'Crash!'],
};

export function build(ctx) {
  const { scene, world, dyn, sky } = buildFair(ctx.origin);
  const { W, R } = world;
  world.spawn = () => { const p = W(PLAN.spawn.x, PLAN.spawn.z); return { x: p.x, z: p.z, face: Math.PI }; }; // (just in through the gate, looking up the avenue)
  const s = PLAN.stop;
  world.exits = [{ id: 'bus', rect: R(s.x - 1.3, s.z - 1.1, s.x + 1.3, s.z + 1.6), open: () => !chapter.riding, text: '🚌 The bus home!', paw: 'bus', style: 'bus', onTake: () => chapter.goHome() }];
  world.update = (t) => { sky.material.uniforms.uTime.value = t * 0.3; };
  world.dispose = () => {};
  const chapter = new FairChapter(ctx, { scene, world, dyn });
  return { scene, world, chapter, sky, look: { fog: 0xece6d8, near: 32, far: 95, music: 'fair', ambient: { birds: 1 } } };
}

class FairChapter extends TripChapter {
  constructor(ctx, { scene, world, dyn }) {
    super(ctx, { scene, world });
    Object.assign(this, { dyn, W: world.W });
    this.saved = ctx.town.state;
    this.done = new Set(this.saved.rides ?? []);
    const O = { x: world.W(0, 0).x, z: world.W(0, 0).z };
    this.O = O;
    this.rides = {
      carousel: new Carousel(dyn, PLAN.carousel, O),
      wheel: new BigWheel(dyn, PLAN.wheel, O),
      helter: new Helter(dyn, PLAN.helter, O),
      coaster: new Coaster(dyn, PLAN, O),
    };
    // Solid bits of the rides (walk round them; the coaster's station platform is a step up).
    const C = world.C, c = PLAN.carousel, w = PLAN.wheel, h = PLAN.helter, st = PLAN.station;
    C.circle(c.x, c.z, c.r + 0.3, 0.3);
    C.circle(c.x, c.z, 0.55);
    for (const s of [-1, 1]) for (const lx of [-1, 1]) C.circle(w.x + lx * 3.4, w.z + s * 1.6, 0.3);
    C.box(w.x - 1.2, w.z + 1.0, w.x + 1.2, w.z + 2.0, 0.28); // (the boarding step)
    C.circle(h.x, h.z, h.r * 1.08);
    C.box(st.x - st.len / 2, st.z + 0.5, st.x + st.len / 2, st.z + 2.7, 0.28);
    this.makeDodgems();
    this.makePeople();
    this.riding = null;
    this.dodge = null;
    this.props = new Map(); // friends on rides: what they're sat in (by friend id)
    this.later = [];
    this.dodgeBest = bests().bumps ?? 0;
    this.objective();
  }

  local(p = this.player.pos) { return { x: p.x - this.O.x, z: p.z - this.O.z }; }

  // ---------- the dodgems ----------

  makeDodgems() {
    const d = PLAN.dodgems, C = this.world.C, x0 = d.x - d.w / 2, x1 = d.x + d.w / 2, z0 = d.z - d.d / 2, z1 = d.z + d.d / 2;
    this.arena = { x0, x1, z0, z1, door: V(d.x, 0, z1 + 1.3) };
    const g = new THREE.Group();
    this.dyn.add(g);
    const RB = (w, h, dd, r = 0.08) => new RoundedBoxGeometry(w, h, dd, 3, r);
    const m = (geo, col, pos, opts) => { const o = new THREE.Mesh(geo, paint(col, opts)); o.position.set(...pos); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    m(new THREE.BoxGeometry(d.w, 0.1, d.d), 0x5a6a8a, [d.x, 0.05, d.z]).castShadow = false;
    for (const [cx, cz, w, dd] of [[d.x, z0, d.w + 0.4, 0.3], [d.x, z1, d.w + 0.4, 0.3], [x0, d.z, 0.3, d.d], [x1, d.z, 0.3, d.d]]) {
      m(RB(w, 0.5, dd, 0.1), 0xf2c94c, [cx, 0.25, cz]);
      m(RB(w + 0.02, 0.12, dd + 0.02, 0.05), 0xd9534f, [cx, 0.42, cz]).castShadow = false;
      C.box(cx - w / 2, cz - dd / 2, cx + w / 2, cz + dd / 2, 0.55, false);
    }
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      m(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 10), 0xf7f3ea, [cx, 1.6, cz]);
      m(new THREE.SphereGeometry(0.2, 12, 8), 0xfff1a0, [cx, 3.3, cz], { emissive: 0x8a7a40 }).castShadow = false;
    }
    // The sign: on the far side, looking back at the way in (not between the camera and a dog in a car).
    m(RB(3.4, 0.7, 0.12, 0.06), 0xd9534f, [d.x, 2.6, z0 - 0.05]);
    for (const [cx] of [[d.x - 1.5], [d.x + 1.5]]) m(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8), 0xf7f3ea, [cx, 1.15, z0 - 0.05]);
    mergeRigid(g); // (the arena, its lights and sign: a few meshes, not dozens)
    // The other cars, each with a dog driving (and the player's, parked at the side till she hops in).
    const keys = BREED_KEYS.filter((k) => k !== this.player.breedKey).sort(() => Math.random() - 0.5);
    this.cars = [0x5b86c4, 0x6f9a52, 0xf2a0c8].map((c, i) => {
      const car = dodgemModel(c), dog = new Dog(keys[i]);
      dog.root.position.set(0, 0.3, 0.05);
      car.add(dog.root);
      this.dyn.add(car);
      const p = V(x0 + 2 + i * 3.5, 0, d.z - 1 + (i % 2) * 2);
      return { car, dog, p, vel: new THREE.Vector2(), heading: Math.random() * 6, target: null, cool: 0, speed: 1.6 + Math.random() * 0.6 };
    });
    this.myCar = dodgemModel(0xd9534f);
    this.myCar.position.set(x1 - 1.2, 0, z1 - 1.0);
    this.myCar.rotation.y = Math.PI;
    this.dyn.add(this.myCar);
  }

  startDodgems() {
    const P = this.player, A = this.arena;
    // She's held still in the car (sitting up nicely): the stick drives the car, not her (see tickDodgems).
    Object.assign(P, { frozen: true, lockY: true, rideN: RIDE_N.dodgems });
    P.vel.set(0, 0);
    this.dodge = { t: DODGE_SECS, bumps: 0, p: V((A.x0 + A.x1) / 2, 0, A.z1 - 1.6), vel: new THREE.Vector2(), heading: Math.PI };
    this.placeMe();
    this.ctx.follow.snap(P.pos);
    this.ctx.follow.yaw = 0;
    this.ctx.follow.pitch = Math.max(this.ctx.follow.pitch, 0.7); // (looking down into the arena)
    sfx.honk?.(0.5);
    this.say('Ding ding! Off you go!', () => this.dyn.localToWorld(A.door.clone().add(V(0, 2.4, -1))), 2);
  }

  /** Her car where the dodgem is, and her sat in it. */
  placeMe() {
    const D = this.dodge, P = this.player, o = this.O;
    this.myCar.position.set(D.p.x, 0, D.p.z);
    this.myCar.rotation.y = D.heading;
    seatAt(P, V(D.p.x + o.x - Math.sin(D.heading) * 0.05, 0.47, D.p.z + o.z - Math.cos(D.heading) * 0.05), D.heading); // (sat up high enough to see over the seat back)
    P.speed = D.vel.length(); // (the camera drifts round behind her as she goes)
  }

  endDodgems() {
    const P = this.player, D = this.dodge, A = this.arena, o = this.O;
    this.dodge = null;
    Object.assign(P, { frozen: false, lockY: false, rideN: 0 });
    P.dog.stopEmote();
    P.pos.set(A.door.x + o.x, 0, A.door.z + 0.4 + o.z);
    P.vy = 0; P.grounded = true;
    P.heading = 0;
    P.object.rotation.y = 0;
    this.myCar.position.set(A.x1 - 1.2, 0, A.z1 - 1.0);
    this.myCar.rotation.y = Math.PI;
    const best = D.bumps > this.dodgeBest;
    if (best) { this.dodgeBest = D.bumps; keepBest('bumps', D.bumps); }
    if (D.bumps) progress.award(Math.min(25, D.bumps * 2), `Dodgems: ${D.bumps} bumps!`);
    this.hud.showToastRaw('🚗', `Dodgems: ${D.bumps} bump${D.bumps === 1 ? '' : 's'}!${best && D.bumps ? ' A new best!' : ''}`, best ? '' : `Your best: ${this.dodgeBest}.`);
    this.rode('dodgems');
  }

  /** In the arena: keep a car inside the rails (bounced back off them). */
  rails(p, vel) {
    const A = this.arena, m = 0.85;
    if (p.x < A.x0 + m) { p.x = A.x0 + m; vel.x = Math.abs(vel.x) * 0.6; }
    if (p.x > A.x1 - m) { p.x = A.x1 - m; vel.x = -Math.abs(vel.x) * 0.6; }
    if (p.z < A.z0 + m) { p.z = A.z0 + m; vel.y = Math.abs(vel.y) * 0.6; }
    if (p.z > A.z1 - m) { p.z = A.z1 - m; vel.y = -Math.abs(vel.y) * 0.6; }
  }

  tickDodgems(dt) {
    const A = this.arena, D = this.dodge;
    if (D) {
      D.t -= dt;
      if (D.t <= 0 || this.input.dig) { this.endDodgems(); return; } // (time's up, or 🐾: hop out)
      // Drive: the stick pushes the car that way (relative to the camera), and it slides about like a dodgem.
      const mv = this.input.move(), yaw = this.ctx.follow.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      const amt = Math.min(1, Math.hypot(mv.x, mv.y)), tx = (rx * mv.x + fx * mv.y) * 4.4, tz = (rz * mv.x + fz * mv.y) * 4.4;
      const k = 1 - Math.exp(-dt * (amt > 0.05 ? 2.6 : 1.2));
      D.vel.x += ((amt > 0.05 ? tx : 0) - D.vel.x) * k;
      D.vel.y += ((amt > 0.05 ? tz : 0) - D.vel.y) * k;
      const sp = D.vel.length();
      if (sp > 0.4) { const want = Math.atan2(D.vel.x, D.vel.y), d = Math.atan2(Math.sin(want - D.heading), Math.cos(want - D.heading)); D.heading += d * (1 - Math.exp(-dt * 5)); }
      D.p.x += D.vel.x * dt; D.p.z += D.vel.y * dt;
      this.rails(D.p, D.vel);
    }
    const me = D ? D.p : null;
    for (const c of this.cars) {
      c.cool -= dt;
      // Off to somewhere (or, when she's driving, sometimes after her!).
      if (!c.target || c.p.distanceTo(c.target) < 1 || Math.random() < dt * 0.15) {
        c.target = me && Math.random() < 0.45 ? me.clone() : V(A.x0 + 1 + Math.random() * (A.x1 - A.x0 - 2), 0, A.z0 + 1 + Math.random() * (A.z1 - A.z0 - 2));
      }
      const want = Math.atan2(c.target.x - c.p.x, c.target.z - c.p.z), turn = Math.atan2(Math.sin(want - c.heading), Math.cos(want - c.heading));
      c.heading += THREE.MathUtils.clamp(turn, -2.4 * dt, 2.4 * dt);
      const sp = D ? c.speed * 1.35 : c.speed;
      c.vel.x += (Math.sin(c.heading) * sp - c.vel.x) * (1 - Math.exp(-dt * 2));
      c.vel.y += (Math.cos(c.heading) * sp - c.vel.y) * (1 - Math.exp(-dt * 2));
      c.p.x += c.vel.x * dt; c.p.z += c.vel.y * dt;
      this.rails(c.p, c.vel);
    }
    // Bumps: car into car (and into her).
    const all = this.cars.map((c) => ({ c, p: c.p, vel: c.vel }));
    if (D) all.push({ me: true, p: D.p, vel: D.vel });
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, l = Math.hypot(dx, dz);
      if (l > 1.42 || l < 1e-4) continue;
      const nx = dx / l, nz = dz / l, push = (1.42 - l) / 2;
      for (const [q, s] of [[a, 1], [b, -1]]) { q.p.x -= nx * push * s; q.p.z -= nz * push * s; q.vel.x -= nx * 3.0 * s; q.vel.y -= nz * 3.0 * s; }
      const other = a.me ? b.c : b.me ? a.c : null;
      if (other && other.cool <= 0) {
        other.cool = 0.6;
        D.bumps++;
        sfx.bonk?.();
        buzz(20);
        this.hud.float(pick(LINES.dodge), this.actions.anchor());
        other.dog.bark();
      }
    }
    // Friends in dodgems too: bump into them (they're where their game says; only you bounce off here).
    if (D) for (const pr of this.props.values()) {
      if (pr.kind !== 'dodgem') continue;
      const fx = pr.obj.position.x - this.O.x, fz = pr.obj.position.z - this.O.z, dx = fx - D.p.x, dz = fz - D.p.z, l = Math.hypot(dx, dz);
      if (l > 1.42 || l < 1e-4) continue;
      const nx = dx / l, nz = dz / l;
      D.p.x -= nx * (1.42 - l); D.p.z -= nz * (1.42 - l);
      D.vel.x -= nx * 3.4; D.vel.y -= nz * 3.4;
      if ((pr.cool ?? 0) < this.time) { pr.cool = this.time + 0.6; D.bumps++; sfx.bonk?.(); buzz(20); this.hud.float(pick(LINES.dodge), this.actions.anchor()); }
    }
    if (D) this.placeMe();
    const far = Math.hypot(this.player.pos.x - this.O.x - (A.x0 + A.x1) / 2, this.player.pos.z - this.O.z - (A.z0 + A.z1) / 2) > 28; // (the dogs at the wheel are only drawn from close by: a dog's a lot of shape)
    for (const c of this.cars) {
      c.car.position.set(c.p.x, 0, c.p.z);
      c.car.rotation.y = c.heading;
      c.dog.root.visible = !far;
      if (far) continue;
      sitStill(c.dog);
      c.dog.update(dt, { speed: 0, turnRate: 0, sniff: false, dig: false, happy: 1 });
    }
  }

  /**
   * A friend on one of the rides (see net/remoteDogs.js): on the carousel and the big wheel they're already sat on
   * ours (both turn by the clock); on the coaster and the dodgems we draw them a car of their own, under them.
   */
  remoteRide(r, ride) {
    const want = ride === RIDE_N.coaster ? 'coaster' : ride === RIDE_N.dodgems ? 'dodgem' : null, have = this.props.get(r.id);
    if (have && have.kind !== want) { have.obj.removeFromParent(); disposeTree(have.obj); this.props.delete(r.id); } // (its shapes too: a friend can hop on and off all day)
    if (!want) return;
    let p = this.props.get(r.id);
    if (!p) {
      p = { kind: want, obj: want === 'coaster' ? coasterCar(0x6f9a52) : dodgemModel(0xf2c94c) };
      this.scene.add(p.obj);
      this.props.set(r.id, p);
    }
    const root = r.dog.root;
    p.obj.position.copy(root.position);
    p.obj.position.y = want === 'coaster' ? root.position.y - 0.42 : 0;
    p.obj.rotation.y = root.rotation.y;
  }

  // ---------- people ----------

  makePeople() {
    const people = [];
    const add = (o, x, z, face, y = 0) => { const p = new Person(o); p.root.position.copy(this.W(x, z)).setY(y); p.root.rotation.y = face; this.scene.add(p.root); people.push(p); return p; };
    // The sellers, behind their stalls.
    this.sellers = PLAN.stalls.map((s, i) => add({ shirt: [0xf2a0c8, 0x8fd0e0, 0xf2c94c][i], trousers: 0x4a4a52, cap: { color: 0xffffff, band: s.c } }, s.x - Math.sin(s.face) * 0.45, s.z - Math.cos(s.face) * 0.45, s.face));
    // The Wiggly Woof's operator, on the station platform.
    const st = PLAN.station;
    this.operator = add({ shirt: 0xd9534f, trousers: 0x2f3a52, cap: { color: 0x2f3a52, band: 0xf2c94c } }, st.x + 3.4, st.z + 2.2, 0, 0.28);
    // Visitors strolling round the plaza.
    this.walkers = [0, 1, 2].map((i) => ({ p: add({ shirt: [0x6f9a52, 0xb69be0, 0xe8743c][i], trousers: [0x4a4a52, 0x5b86c4, 0x6b4a32][i], bag: i === 1 }, 0, 0, 0), a: (i / 3) * Math.PI * 2, sp: 0.9 + i * 0.12 }));
    this.people = people;
    this.chatT = 4;
  }

  tickPeople(dt) {
    const P = this.player.pos, f = PLAN.plaza;
    for (const w of this.walkers) {
      w.a += (w.sp / 4.6) * dt;
      const x = f.x + Math.cos(w.a) * 4.6, z = f.z + Math.sin(w.a) * 4.6;
      w.p.root.position.copy(this.W(x, z));
      w.p.root.rotation.y = Math.atan2(-Math.sin(w.a), Math.cos(w.a));
      w.p.update(dt, w.sp);
    }
    for (const s of [...this.sellers, this.operator]) s.update(dt, 0);
    // Sellers and the operator call out when she's near.
    this.chatT -= dt;
    if (this.chatT <= 0) {
      this.chatT = 6;
      const near = [...this.sellers.map((p, i) => [p, LINES.seller[i]]), [this.operator, pick(LINES.operator)]].find(([p]) => p.root.position.distanceTo(P) < 6);
      if (near) this.say(near[1], () => near[0].root.position.clone().add(V(0, 2.1, 0)), 2.6);
    }
  }

  // ---------- the goal, what's said ----------

  objective() {
    const n = this.done.size;
    this.hud.setObjective(`Wagtail Wonderland! 🎢 Rides tried: <b>${n}/5</b>`, `🎈 Go on 5 rides for a prize · 🚗 Dodgems best: <b>${this.dodgeBest}</b> bumps · 🚌 The bus home’s by the gate`, { icon: '🎡', short: `${n}/5` });
  }

  arrive() {
    if (!this.saved.visited) {
      this.ctx.town.save({ visited: true });
      progress.stat('trips');
      progress.award(20, 'Wagtail Wonderland!');
    }
    this.hud.showToastRaw('🎡', 'Wagtail Wonderland!', 'Five rides to try: 🐾 at each one to hop on. The bus home is by the gate.', { tip: true });
  }

  goHome() { this.hud.showToastRaw('🚌', 'All aboard for home!', 'What a day out.'); }

  /** Which ride's gate she's at (its key), or null. */
  rideAt() {
    const l = this.local();
    for (const [k, r] of Object.entries(this.rides)) if (r.near(l)) return k;
    const d = this.arena.door;
    return Math.hypot(l.x - d.x, l.z - d.z) < 1.8 ? 'dodgems' : null;
  }

  heldHint() { return this.dodge ? { text: `🚗 Bumps: ${this.dodge.bumps} · ⏱️ ${Math.ceil(this.dodge.t)} · 🐾 to hop out`, paw: 'out' } : null; }

  hint() {
    if (this.riding || this.dodge) return null;
    const k = this.rideAt();
    return k ? { text: RIDES[k].hop, paw: 'ride' } : null;
  }

  onDig() {
    if (this.riding) return true;
    const k = this.rideAt();
    if (!k) return false;
    if (k === 'dodgems') { this.startDodgems(); return true; }
    this.board(k);
    return true;
  }

  onBark() {
    const P = this.player.pos;
    const s = [...this.sellers, this.operator].find((p) => p.root.position.distanceTo(P) < 4);
    if (s) this.say(pick(['Woof to you too!', 'Who’s a good dog? You are!', 'Having a nice day out?']), () => s.root.position.clone().add(V(0, 2.1, 0)), 2);
  }

  goal() {
    // The nearest ride she hasn't been on yet.
    const P = this.player.pos, o = this.O, list = Object.entries(this.rides).filter(([k]) => !this.done.has(k)).map(([, r]) => r.door.clone().add(V(o.x, 0, o.z)));
    if (!this.done.has('dodgems')) list.push(this.arena.door.clone().add(V(o.x, 0, o.z)));
    return list.reduce((b, p) => (!b || p.distanceToSquared(P) < b.distanceToSquared(P) ? p : b), null);
  }

  // ---------- riding ----------

  board(k) {
    const P = this.player, r = this.rides[k];
    P.frozen = true;
    P.lockY = true;
    P.vel.set(0, 0);
    P.vy = 0;
    this.hud.setPrompt('');
    r.board(P);
    P.rideN = RIDE_N[k];
    this.riding = { k, r, t: 0, said: 0, dist: this.ctx.follow.distance };
    if (k === 'wheel') { this.ctx.follow.distance = 11; this.ctx.follow.yaw = Math.PI; this.ctx.follow.pitch = 0.28; } // (looking out over the park)
    sfx.boing?.();
    buzz(15);
    if (k === 'coaster') this.say(pick(LINES.operator), () => this.operator.root.position.clone().add(V(0, 2.1, 0)), 2.2);
  }

  tickRide(dt) {
    const R = this.riding, P = this.player;
    R.t += dt;
    const over = R.r.carry(dt, P, { clack: () => sfx.clack?.() });
    // The camera: behind her on the coaster (it swings round as she goes), outside the helter-skelter looking in.
    if (R.k === 'coaster') P.speed = R.r.riding?.speed ?? 0;
    if (R.k === 'helter' && R.r.riding?.phase === 'slide') {
      const l = this.local(), h = PLAN.helter, want = Math.atan2(l.x - h.x, l.z - h.z), f = this.ctx.follow;
      f.yaw += Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw)) * (1 - Math.exp(-dt * 4));
    }
    // A word now and then (on the coaster: on the way down the big drops).
    R.said -= dt;
    if (R.said <= 0) {
      if (R.k === 'coaster' && (R.r.riding?.speed ?? 0) > 7) { R.said = 3; this.hud.float(pick(LINES.coaster), this.actions.anchor()); }
      else if (R.k === 'wheel' && P.pos.y > PLAN.wheel.hub + PLAN.wheel.R - 1.5) { R.said = 8; this.hud.float(pick(LINES.wheel), this.actions.anchor()); }
      else if (R.k === 'carousel' && R.t > 2) { R.said = 7; this.hud.float(pick(LINES.carousel), this.actions.anchor()); }
      else if (R.k === 'helter' && R.r.riding?.phase === 'slide') { R.said = 6; this.hud.float(pick(LINES.helter), this.actions.anchor()); }
    }
    if (over) this.getOff();
  }

  getOff() {
    const R = this.riding, P = this.player, off = R.r.offFrom(P.pos);
    this.riding = null;
    P.rideN = 0;
    P.frozen = false;
    P.lockY = false;
    P.object.visible = true;
    P.dog.body.rotation.x = 0;
    P.dog.stopEmote();
    P.pos.set(off.x, 0, off.z);
    P.vy = 0;
    P.grounded = true;
    P.heading = off.face;
    P.object.rotation.y = off.face;
    this.ctx.follow.distance = R.dist;
    P.happy = 1;
    sfx.pop?.();
    this.rode(R.k);
  }

  /** Off a ride: a star or two, and the first time on each, the count towards the balloon. */
  rode(k) {
    const first = !this.done.has(k), before = progress.stats?.rides ?? 0;
    progress.stat('rides');
    progress.award(first ? 10 : 4, `${RIDES[k].emoji} ${first ? 'First go on' : 'Another go on'} ${RIDES[k].name}!`);
    if (first) {
      this.done.add(k);
      this.ctx.town.save({ rides: [...this.done] });
      this.actions.sparkle(this.player.pos.clone().add(V(0, 0.6, 0)), 14);
    }
    for (const c of COSMETICS) if (c.friend === 'rides' && before < c.jobs && before + 1 >= c.jobs) this.later.push([0.8, () => this.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'For all those rides. Wear it from ☰ → My dog → Dress up.')]);
    if (this.done.size === 5 && first) this.later.push([1.6, () => this.hud.showToastRaw('🎢', 'Every ride at Wagtail Wonderland!', 'You’re a real thrill-seeker.')]);
    this.objective();
  }

  // ---------- every frame ----------

  tick(dt) {
    if (this.later.length) { for (const l of this.later) l[0] -= dt; for (const l of this.later.filter((q) => q[0] <= 0)) l[1](); this.later = this.later.filter((q) => q[0] > 0); }
    for (const r of Object.values(this.rides)) r.update(dt);
    if (this.riding) this.tickRide(dt);
    this.tickDodgems(dt);
    this.tickPeople(dt);
  }

  dispose() {
    const P = this.player;
    this.dodge = null;
    Object.assign(P, { frozen: false, lockY: false });
    P.object.visible = true;
    P.dog.body.rotation.x = 0;
    super.dispose();
  }
}
