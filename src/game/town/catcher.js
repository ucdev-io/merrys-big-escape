import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Person } from '../../entities/person.js';
import { mesh } from '../../world/props.js';
import { TOWN } from '../../world/town/generator.js';
import { waterAt } from '../../world/water.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../progress.js';

/*
 * 🚐 Doug the dog warden. Get up to enough mischief (bins tipped, lawns dug, flowerbeds flattened) and somebody
 * phones him: his van pulls up at the kerb nearby and out he hops with a big butterfly net. He's quicker than a
 * walk but slower than zoomies. Get away (zoomies, over a hedge, into the pond: he won't get his boots wet, home
 * through your own gate, or down a drain) and he gives up, puffed out. Get caught and it's off to the Sunny Paws
 * rescue centre (a trip: ../../trips/pound/), and a great escape home. Nobody ever loses a star.
 *
 * Only when you're playing on your own (friends wouldn't see him), never during a job, a game or a heist, and not
 * out in the woods, the farm or the beach.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const HEAT = 4;          // this much recent mischief and he's called
const COOL_HEAT = 45;    // seconds for one bit of mischief to be forgiven
const FIRST = 90;        // never in the first minute and a half
const BREAK = 240;       // seconds between his visits
const SPEED = 3.5;       // m/s: faster than a walk (2.6), slower than zoomies (up to 6.8)
const KERB = TOWN.BLOCK / 2 + TOWN.ROAD / 2 - 1.3; // where a parked van sits, from the middle of a block

const LINES = {
  arrive: ['Now then! Somebody’s been a VERY naughty dog…', 'Reports of bins tipped all over town! Was it YOU, {name}?', 'Petunias dug up! Lawns flattened! Right, you…'],
  chase: ['Come back here!', 'Here, doggy doggy!', 'You can’t run for ever!', 'Hold still, you rascal!', 'Wait for me!'],
  puffed: ['Phew! Puffed out. I’ll get you next time!', 'Too fast for me! Off you go, then.', 'Hmph. Lost the little scamp.'],
  water: ['I am NOT getting my boots wet!', 'Out of the pond this minute! …No? Fine.'],
  garden: ['Hmph. Home safe, eh? Behave yourself!', 'Can’t follow you in there. Be good!'],
  woof: ['Eek! Good doggy… nice doggy…', 'Woof yourself!'],
  caught: ['Gotcha! Off to Sunny Paws with you!', 'Got you at last! Hop in the van, pup!'],
};

/** A white van with a green stripe and a paw on the side. Faces +z, wheels on the ground. */
function wardenVan() {
  const g = new THREE.Group();
  const RB = (w, h, d, r = 0.15) => new RoundedBoxGeometry(w, h, d, 3, r);
  mesh(RB(1.8, 1.5, 3.9, 0.22), 0xf3f1ea, g, [0, 1.08, 0]);
  mesh(RB(1.84, 0.3, 3.94, 0.12), 0x5d8c55, g, [0, 0.62, 0]);
  mesh(RB(1.5, 0.55, 0.06, 0.04), 0x9ab8cf, g, [0, 1.4, 1.95], [-0.15, 0, 0]); // windscreen
  for (const s of [-1, 1]) { // a big green paw on each side
    const paw = new THREE.Group();
    paw.position.set(s * 0.93, 1.25, -0.3);
    paw.rotation.y = s * Math.PI / 2;
    g.add(paw);
    mesh(new THREE.CircleGeometry(0.24, 16), 0x5d8c55, paw, [0, -0.06, 0]);
    for (const [x, y] of [[-0.22, 0.2], [-0.08, 0.3], [0.08, 0.3], [0.22, 0.2]]) mesh(new THREE.CircleGeometry(0.08, 12), 0x5d8c55, paw, [x, y, 0]);
  }
  for (const sx of [-0.8, 0.8]) for (const sz of [-1.25, 1.25]) mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), 0x2b2b2b, g, [sx, 0.32, sz], [0, 0, Math.PI / 2]);
  mesh(new THREE.BoxGeometry(0.5, 0.1, 0.2), 0xf2b134, g, [0, 1.9, 0.6]); // the light on the roof
  return g;
}

/** Doug: green jumper, peaked cap, and his net. */
function warden() {
  const p = new Person({ shirt: 0x5d8c55, trousers: 0x3a4a3a, cap: { color: 0x3a4a3a, band: 0xf2b134 }, skin: 0xe0b48e, hair: 0x6b4a32 });
  const net = new THREE.Group();
  net.position.set(0, -0.5, 0);
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 6), 0x9a7a58, net, [0, -0.15, 0.55], [Math.PI / 2 - 0.35, 0, 0]);
  const hoop = mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 18), 0x6b6964, net, [0, 0.12, 1.25], [Math.PI / 2 - 0.35, 0, 0]);
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.45, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xe8e2d6, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  bag.rotation.set(-Math.PI / 2, 0, 0); // (the bag hangs out of the hoop)
  bag.position.set(0, 0, -0.2);
  hoop.add(bag);
  p.arms[1].add(net); // (held in the left hand)
  p.net = net;
  return p;
}

export class Catcher {
  /** busy(): something's on (a job, a game, a heist, friends here…). go(): off to the pound. */
  constructor({ scene, world, hud, player, actions, dogName, busy, go, homeGarden }) {
    Object.assign(this, { scene, world, hud, player, actions, dogName, busy, go, homeGarden });
    this.heat = 0;
    this.time = 0;
    this.next = FIRST;     // the soonest he can come
    this.s = 'off';        // off · arrive · chase · wait (water, a garden) · leave · caught
    this.t = 0;
    this.blocks = world.layout.blocks;
    const xs = this.blocks.map((b) => b.x), zs = this.blocks.map((b) => b.z);
    this.town = { x0: Math.min(...xs) - 20, x1: Math.max(...xs) + 20, z0: Math.min(...zs) - 20, z1: Math.max(...zs) + 20 };
  }

  /** The dog did something naughty. */
  onMischief() { this.heat += 1; }

  /** He's after the dog right now (no fast travel to get away: run!). */
  get chasing() { return this.s === 'arrive' || this.s === 'chase'; }

  say(text, dur = 2.6) {
    const w = this.who;
    if (w) this.hud.say(`🚐 ${text.replace('{name}', this.dogName())}`, () => w.root.position.clone().add(V(0, 2.1, 0)), dur);
  }

  update(dt, { barked = false, canAct = true } = {}) {
    this.time += dt;
    this.heat = Math.max(0, this.heat - dt / COOL_HEAT);
    if (this.s === 'off') {
      if (this.heat >= HEAT && this.time > this.next && canAct && !this.busy() && this.inTown(this.player.pos)) this.arrive();
      return;
    }
    this.t += dt;
    const P = this.player, w = this.who, pos = w.root.position;
    const dx = P.pos.x - pos.x, dz = P.pos.z - pos.z, d = Math.hypot(dx, dz);
    let speed = 0, face = w.root.rotation.y;
    if (this.s === 'arrive') { // hopping out of the van, then off he goes
      face = Math.atan2(dx, dz);
      if (this.t > 1.6) this.set('chase');
    } else if (this.s === 'chase') {
      const home = this.homeGarden?.(), wet = P.inWater || waterAt(this.world.water, P.pos.x, P.pos.z);
      if (barked && d < 6 && this.woofT <= 0) { this.woofT = 6; this.stun = 0.9; this.say(pick(LINES.woof), 1.6); }
      this.woofT = (this.woofT ?? 0) - dt;
      this.stun = Math.max(0, (this.stun ?? 0) - dt);
      if (this.busy()) return this.giveUp(null); // (a game or a job started: he's off)
      if (wet) return this.set('wait', pick(LINES.water));
      if (home && P.pos.x > home.x0 && P.pos.x < home.x1 && P.pos.z > home.z0 && P.pos.z < home.z1) return this.set('wait', pick(LINES.garden));
      // Lost her? (Too far ahead, or he's stuck behind a hedge.)
      this.lost = d > 15 || (this.best !== undefined && d > this.best - 0.5 && this.t - this.bestT > 5) ? (this.lost ?? 0) + dt : 0;
      if (d < (this.best ?? Infinity) - 0.5) { this.best = d; this.bestT = this.t; }
      if (this.lost > 3.5 || this.t > 45) return this.giveUp(pick(LINES.puffed));
      if (this.t - (this.shoutT ?? 0) > 5 && d < 14) { this.shoutT = this.t; this.say(pick(LINES.chase), 2); }
      if (d < 1.05 && P.grounded && P.pos.y < 0.6 && canAct && this.stun <= 0) return this.catch();
      face = Math.atan2(dx, dz);
      speed = this.stun > 0 ? 0 : SPEED;
    } else if (this.s === 'wait') { // at the pond's edge, or your gate, arms folded
      face = Math.atan2(dx, dz);
      if (this.t > 3.5) this.giveUp(null);
    } else if (this.s === 'leave') { // back to the van, and away
      const v = this.van.position, lx = v.x - pos.x, lz = v.z - pos.z, l = Math.hypot(lx, lz);
      if (l > 0.8) { face = Math.atan2(lx, lz); speed = 2.2; }
      else if (w.root.visible) { w.root.visible = false; this.drive = 0; }
      if (!w.root.visible) {
        this.drive += dt;
        this.van.position.addScaledVector(this.vanDir, Math.min(14, this.drive * 7) * dt);
        if (this.drive > 4 || this.van.position.distanceTo(P.pos) > 45) this.clear();
      }
    }
    if (this.s === 'off') return;
    // Walking (round walls and things: he can't jump hedges like a dog can).
    if (speed > 0) {
      pos.x += Math.sin(face) * speed * dt;
      pos.z += Math.cos(face) * speed * dt;
      this.world.colliders.resolve(pos, 0.3, 0.3);
    }
    w.root.rotation.y += wrap(face - w.root.rotation.y) * (1 - Math.exp(-dt * 8));
    w.update(dt, speed);
    w.arms[1].rotation.x = this.s === 'chase' ? -1.2 + Math.sin(this.t * 3) * 0.15 : -0.3; // (net held out in front)
  }

  set(s, line = null) {
    this.s = s;
    this.t = 0;
    if (line) this.say(line);
  }

  inTown(p) { const r = this.town; return p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1; }

  /** The van pulls up at the kerb nearest the dog (a little way along), and out he hops. */
  arrive() {
    const P = this.player.pos;
    let b = null, bd = Infinity;
    for (const q of this.blocks) { const d = Math.hypot(q.x - P.x, q.z - P.z); if (d < bd) { bd = d; b = q; } }
    if (!b) return;
    // The side of that block nearest the dog, a few metres along from her.
    const ox = P.x - b.x, oz = P.z - b.z, alongX = Math.abs(ox) < Math.abs(oz);
    const n = alongX ? [0, Math.sign(oz) || 1] : [Math.sign(ox) || 1, 0];
    const along = THREE.MathUtils.clamp((alongX ? ox : oz) + (Math.random() < 0.5 ? -9 : 9), -12, 12);
    const vx = b.x + n[0] * KERB + (alongX ? along : 0), vz = b.z + n[1] * KERB + (alongX ? 0 : along);
    this.vanDir = alongX ? V(1, 0, 0) : V(0, 0, 1);
    if (along < 0) this.vanDir.multiplyScalar(-1); // (facing on along the road, the way it'll drive off)
    this.van = wardenVan();
    this.van.position.set(vx, 0, vz);
    this.van.rotation.y = Math.atan2(this.vanDir.x, this.vanDir.z);
    this.scene.add(this.van);
    this.who = warden();
    this.who.root.position.set(vx - n[0] * 1.4, 0, vz - n[1] * 1.4); // (on the pavement side)
    this.who.root.rotation.y = Math.atan2(P.x - vx, P.z - vz);
    this.scene.add(this.who.root);
    this.best = undefined;
    this.lost = 0;
    this.heat = 0;
    this.set('arrive', pick(LINES.arrive));
    sfx.honk?.(0.8);
    buzz([20, 30, 20]);
    this.hud.showToastRaw('🚐', 'Uh-oh! The dog warden!', 'Somebody’s reported a very naughty dog… Run for it! (Or don’t.)');
  }

  giveUp(line) {
    if (line) this.say(line, 2.8);
    if (this.s === 'chase' && line) { progress.stat('warden'); progress.award(10, 'Got away!'); }
    this.set('leave');
  }

  /** She got clean away (down a drain, say): gone, and a star or few. */
  escaped() {
    progress.stat('warden');
    progress.award(10, 'Got away!');
    this.clear();
  }

  /** Caught! The net comes down, and off to the pound. */
  catch() {
    this.set('caught', pick(LINES.caught));
    const P = this.player, w = this.who;
    w.arms[1].rotation.x = -2.2;
    P.frozen = true;
    P.vel.set(0, 0);
    sfx.boink?.();
    buzz([30, 40, 60]);
    // The net over the dog.
    const net = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshLambertMaterial({ color: 0xe8e2d6, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    net.position.copy(P.pos).add(V(0, 0.75, 0));
    net.rotation.x = Math.PI;
    net.scale.set(1.2, 1.4, 1.6);
    this.scene.add(net);
    this.netMesh = net;
    setTimeout(async () => {
      const ok = await this.go({ id: 'van', style: 'net' });
      if (!ok) P.frozen = false; // (couldn't go just now: off she trots)
      this.clear(); // (the van and the net, once she's away)
    }, 1400);
  }

  /** Gone (back to his office), until there's more mischief. */
  clear() {
    for (const o of [this.van, this.who?.root, this.netMesh]) {
      if (!o) continue;
      o.removeFromParent();
      o.traverse((m) => { m.geometry?.dispose(); if (m.material && !m.material.userData?.paint) m.material.dispose(); }); // (all his own: made for this visit)
    }
    this.van = this.who = this.netMesh = null;
    this.s = 'off';
    this.next = this.time + BREAK;
    this.heat = 0;
  }
}
