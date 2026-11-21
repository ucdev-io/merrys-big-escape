import * as THREE from 'three';
import { Person } from '../../entities/person.js';
import { Dog } from '../../entities/dog.js';
import { BREEDS, BREED_KEYS } from '../../entities/breeds.js';
import { TOWN } from '../../world/town/generator.js';
import { RNG } from '../../core/rng.js';
import { sfx } from '../../core/audio.js';
import { LineBag } from '../dialogue.js';
import { POSTMAN, WALKERS } from '../lines/life.js';
import { progress } from '../progress.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = TOWN.BLOCK / 2 + 1; // the middle of the pavement round a block
const WALKER_FAR = 125; // (the town's fog is all the way in by 120 m)
const SHIRTS = [0xd9534f, 0x6f9a52, 0xe39a52, 0x8e6fb0, 0xf2a0b4, 0x4aa3a0, 0xf6d06a];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);

/** Walking round a block's pavement: s = distance along it → position and heading. */
function ring(b, s, dir) {
  const L = 8 * R;
  s = ((s % L) + L) % L;
  const side = Math.floor(s / (2 * R)), t = s - side * 2 * R - R;
  const pts = [[t, -R, 1, 0], [R, t, 0, 1], [-t, R, -1, 0], [-R, -t, 0, -1]][side];
  const hx = pts[2] * dir, hz = pts[3] * dir;
  return { x: b.x + pts[0], z: b.z + pts[1], heading: Math.atan2(hx, hz) };
}

/**
 * People out and about: the postman doing his round of your block (chase him — he hurries off,
 * of course) and neighbours walking their dogs, who always stop to say hello.
 */
export class TownLife {
  constructor({ scene, world, hud, player, seed, dogName }) {
    Object.assign(this, { scene, world, hud, player, dogName });
    const rng = new RNG(`life:${seed}`);
    this.bags = {};
    const blocks = world.layout.blocks;
    const home = blocks.find((b) => b.type === 'home');

    // The postman: blue uniform, red-banded cap, a satchel of letters.
    const pm = new Person({ shirt: 0x3f5f9a, trousers: 0x2f3a52, cap: { color: 0x2f3a52, band: 0xd9534f }, bag: true });
    scene.add(pm.root);
    this.postman = { p: pm, block: home, s: rng.float(0, 8 * R), dir: 1, speed: 1.2, pause: 0, nextStop: 8, hurry: 0, talkT: 0, chaseCD: 0 };

    // Dog walkers on a couple of other blocks.
    const others = blocks.filter((b) => b.type === 'houses');
    this.walkers = [];
    for (let i = 0; i < 2 && others.length; i++) {
      const b = others.splice(rng.int(0, others.length - 1), 1)[0];
      const owner = new Person({ shirt: rng.pick(SHIRTS), trousers: rng.pick([0x4a4a52, 0x5b6f8a, 0x7a6248]) });
      const key = rng.pick(BREED_KEYS.filter((k) => k !== player.breedKey));
      const dog = new Dog(key);
      scene.add(owner.root, dog.root);
      const lead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xc94a3a }));
      lead.frustumCulled = false;
      scene.add(lead);
      this.walkers.push({ owner, dog, key, name: BREEDS[key].dogName, lead, block: b, s: rng.float(0, 8 * R), dir: rng.chance(0.5) ? 1 : -1, stop: 0, met: false, talkT: 0, sniffT: 0 });
    }
  }

  line(key, list, vars = {}) {
    this.bags[key] ??= new LineBag(list);
    return fill(this.bags[key].next(), { name: this.dogName(), ...vars });
  }

  /** @param barked the local dog woofed this frame */
  update(dt, { barked = false, canAct = true } = {}) {
    const P = this.player;
    this.updatePostman(dt, P, barked && canAct, canAct);
    for (const w of this.walkers) {
      // Out past the fog (from the other side of town): not drawn, and not walked or posed either, till she's nearer.
      const o = ring(w.block, w.s, w.dir), far = Math.hypot(P.pos.x - o.x, P.pos.z - o.z) > WALKER_FAR; // (where they are on their walk: placed or not yet)
      if (far !== w.far) { w.far = far; w.owner.root.visible = w.dog.root.visible = w.lead.visible = !far; }
      if (!far) this.updateWalker(dt, w, P, canAct);
    }
  }

  updatePostman(dt, P, barked, canAct) {
    const m = this.postman, p = m.p;
    m.talkT -= dt; m.chaseCD -= dt;
    const pos = p.root.position, d = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
    // A dog charging at him (or woofing nearby) sends him scurrying.
    if (canAct && m.hurry <= 0 && ((d < 2.6 && P.speed > 3.2) || (barked && d < 7))) {
      m.hurry = 2.8; m.pause = 0;
      if (m.talkT <= 0) { m.talkT = 4; this.hud.say(`📮 ${this.line('pm-chased', POSTMAN.chased)}`, () => pos.clone().add(V(0, 2.1, 0)), 2.4); }
      if (m.chaseCD <= 0) { m.chaseCD = 45; progress.stat('postman'); progress.award(2, 'Chased the postman!'); this.onNaughty?.(); }
    } else if (canAct && d < 3 && m.hurry <= 0 && m.talkT <= 0) {
      m.talkT = 20; p.wave = 1.6;
      this.hud.say(`📮 ${this.line('pm-hello', POSTMAN.hello)}`, () => pos.clone().add(V(0, 2.1, 0)), 2.4);
    }
    m.hurry -= dt;
    let speed = m.hurry > 0 ? 3.4 : m.pause > 0 ? 0 : m.speed;
    if (m.pause > 0) m.pause -= dt;
    m.s += speed * dt * m.dir;
    m.nextStop -= speed * dt;
    if (m.nextStop <= 0) { m.nextStop = 7 + Math.random() * 6; m.pause = 1.6; } // popping letters through a door
    const r = ring(m.block, m.s, m.dir);
    pos.set(r.x, 0, r.z);
    p.root.rotation.y = r.heading;
    p.update(dt, speed);
    this.pushDog(P, pos);
  }

  updateWalker(dt, w, P, canAct) {
    w.talkT -= dt; w.stop -= dt; w.sniffT -= dt;
    const o = w.owner.root.position, d = Math.hypot(P.pos.x - o.x, P.pos.z - o.z);
    const dd = Math.hypot(P.pos.x - w.dog.root.position.x, P.pos.z - w.dog.root.position.z);
    // Meeting another dog: stop for a sniff and a wag.
    if (canAct && Math.min(d, dd) < 3 && w.talkT <= 0) {
      w.stop = 3.5; w.talkT = 18;
      sfx.bark?.(BREEDS[w.key].bark, 0.6);
      w.dog.bark();
      this.hud.say(`🙂 ${this.line(w.met ? 'walk-again' : 'walk-hello', w.met ? WALKERS.again : WALKERS.hello, { dog: w.name })}`, () => o.clone().add(V(0, 2.1, 0)), 2.6);
      if (!w.met) { w.met = true; progress.stat('dogsmet'); progress.award(5, `New friend: ${w.name}!`); }
    }
    const speed = w.stop > 0 ? 0 : 1.0;
    w.s += speed * dt * w.dir;
    const r = ring(w.block, w.s, w.dir);
    o.set(r.x, 0, r.z);
    w.owner.root.rotation.y = r.heading;
    w.owner.update(dt, speed);
    // The dog trots a little ahead on the lead, towards the kerb (or turns to look at you).
    const ahead = ring(w.block, w.s + 1.1 * w.dir, w.dir);
    const out = V(ahead.x - w.block.x, 0, ahead.z - w.block.z).normalize().multiplyScalar(0.7);
    const dp = w.dog.root.position;
    dp.lerp(V(ahead.x + out.x, 0, ahead.z + out.z), 1 - Math.exp(-dt * 6));
    const look = w.stop > 0 && dd < 5 ? Math.atan2(P.pos.x - dp.x, P.pos.z - dp.z) : ahead.heading;
    let diff = look - w.dog.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    w.dog.root.rotation.y += diff * (1 - Math.exp(-dt * 5));
    if (w.sniffT < -4 && Math.random() < dt * 0.3) w.sniffT = 1.5;
    w.dog.update(dt, { speed, turnRate: 0, sniff: w.sniffT > 0 && w.stop <= 0, dig: false, happy: w.stop > 0 ? 1 : 0.55 });
    // The lead: from the owner's hand to the dog's collar.
    const hand = V(0, 0, 0), collar = V(0, 0, 0);
    w.owner.arms[1].localToWorld(hand.set(0, -0.56, 0));
    w.dog.neck.localToWorld(collar.set(0, 0.08, 0.02));
    const a = w.lead.geometry.attributes.position;
    a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, collar.x, collar.y, collar.z); a.needsUpdate = true;
    this.pushDog(P, o);
  }

  /** People are solid: a dog bumping into one just slides round them. */
  pushDog(P, at) {
    const dx = P.pos.x - at.x, dz = P.pos.z - at.z, dist = Math.hypot(dx, dz), r = 0.25 + (P.radius ?? 0.28);
    if (dist < r && dist > 1e-4 && P.pos.y < 1.6) { P.pos.x = at.x + (dx / dist) * r; P.pos.z = at.z + (dz / dist) * r; }
  }
}
