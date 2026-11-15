import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { blobGeometry } from '../world/props.js';
import { sfx } from '../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SHOUTS = {
  flowers: ['OI! Get out of my petunias!', 'Not my PRIZE roses!', 'Is that a {breed} in my flowerbed?!', 'SHOO! Those are for the flower show!'],
  dig: ['Who’s digging up my lawn?!', 'That’s not a bone, that’s my GRASS!', 'Stop digging, you rascal!', 'I only just mowed that!'],
  bins: ['MY BINS! Not again!', 'Who knocked my bin over?!', 'Rubbish everywhere! Naughty {breed}!', 'Oh, for goodness’ sake!'],
};
// Your own family is less cross. Mostly.
const FAMILY = {
  flowers: ['{name}! Not the flowers!!', '{name}, OUT of the flowerbed!'],
  dig: ['{name}! Stop digging up the lawn!', 'Who’s been digging? {name}!!'],
  bins: ['{name}! Leave the bin alone!'],
};

/**
 * Garden mischief: trampling flowerbeds, digging holes, tipping bins — and getting yelled at.
 *
 * gardens: [{ rect:{x0,z0,x1,z1}, door: Vector3, own?: bool }]
 * beds:    [{ x0,z0,x1,z1 }]                     (walk-through flowerbeds)
 * bins:    [{ id, pivot: Object3D, x, z, collider, garden }]
 */
export class Mischief {
  constructor({ scene, hud, gardens = [], beds = [], bins = [], dirt, glow, dogName, breedName, onAct }) {
    Object.assign(this, { scene, hud, gardens, beds, bins, dirt, glow, onAct });
    this.dogName = dogName;
    this.breedName = breedName;
    this.points = 0;
    this.holes = [];
    this.digCounts = [];
    this.bedCool = new Map();
    this.yellCool = new Map();
    this.slippers = [];
    this.tipping = [];
    this.mudMat = paint(0x7a5a3e);
    this.holeMat = paint(0x4a3426);
    this.pileMat = paint(0x8a6346);
    this.onChange = null;
  }

  gardenAt(x, z) {
    return this.gardens.find((g) => x > g.rect.x0 && x < g.rect.x1 && z > g.rect.z0 && z < g.rect.z1) ?? null;
  }

  addPoint() { this.points++; this.onChange?.(this.points); }

  // ---------- shouting ----------
  yell(garden, kind) {
    if (!garden?.door) return;
    const now = performance.now();
    if ((this.yellCool.get(garden) ?? 0) > now) return;
    this.yellCool.set(garden, now + 5000);
    const fill = (s) => s.replace('{name}', esc(this.dogName())).replace('{breed}', esc(this.breedName().toLowerCase()));
    const line = fill(pick((garden.own ? FAMILY : SHOUTS)[kind]));
    const door = garden.door.clone();
    this.hud.say(`😠 ${line}`, () => door, 3.2, 'angry');
    sfx.shout?.();
    if (!garden.own && Math.random() < 0.45) setTimeout(() => this.throwSlipper(door), 700);
  }

  /** A slipper sails out of the door and lands near the dog. Never hits — it's a cartoon. */
  throwSlipper(from) {
    const target = this.lastPos?.clone() ?? from.clone();
    target.x += rand(-1.2, 1.2); target.z += rand(-1.2, 1.2); target.y = 0.05;
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), paint(pick([0x8e6fb0, 0xd9534f, 0x5b86c4])));
    m.rotation.x = Math.PI / 2; m.scale.set(1.2, 1, 0.5);
    g.add(m);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), paint(0xfff2f2));
    pom.position.set(0, 0.03, 0.08);
    g.add(pom);
    g.position.copy(from);
    this.scene.add(g);
    this.slippers.push({ g, from: from.clone(), to: target, t: 0, life: 7 });
  }

  // ---------- digging ----------
  /** Called on every dig press. Three digs on the same spot leave a real hole. */
  dig(at, mine = true) {
    let c = this.digCounts.find((d) => Math.hypot(d.x - at.x, d.z - at.z) < 0.5);
    if (!c) { c = { x: at.x, z: at.z, n: 0 }; this.digCounts.push(c); if (this.digCounts.length > 20) this.digCounts.shift(); }
    c.n++;
    if (c.n === 3) {
      this.makeHole(c.x, c.z);
      if (mine) {
        this.onAct?.({ a: 'hole', x: c.x, z: c.z });
        this.addPoint();
        this.yell(this.gardenAt(c.x, c.z), 'dig');
      }
    }
  }

  makeHole(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.065, z);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), this.holeMat);
    hole.rotation.x = -Math.PI / 2;
    const pile = new THREE.Mesh(blobGeometry(9, 0.3, 1), this.pileMat);
    pile.position.set(0.3, 0, 0.05); pile.scale.set(0.2, 0.09, 0.16);
    g.add(hole, pile);
    this.scene.add(g);
    this.holes.push(g);
    if (this.holes.length > 40) this.scene.remove(this.holes.shift());
  }

  // ---------- flowerbeds ----------
  trample(x, z, mine = true) {
    const now = performance.now();
    const bed = this.beds.find((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    if (!bed) return;
    if ((this.bedCool.get(bed) ?? 0) > now) return;
    this.bedCool.set(bed, now + 1500);
    sfx.rustle?.();
    this.glow?.burst(14, () => ({
      pos: V(x, 0.35, z), vel: V(rand(-1.5, 1.5), rand(1, 2.5), rand(-1.5, 1.5)),
      life: 1.4, size: rand(0.03, 0.05), gravity: 4, floor: 0.08, squash: 0.3,
      color: pick([0xf2a0b4, 0xf6d06a, 0xb69be0, 0xffffff, 0xf08a6a]),
    }));
    const mud = new THREE.Mesh(blobGeometry(3, 0.3, 1), this.mudMat);
    mud.position.set(x, 0.1, z); mud.scale.set(0.35, 0.03, 0.3); mud.rotation.y = rand(0, 6);
    this.scene.add(mud);
    this.holes.push(mud);
    if (mine) {
      this.onAct?.({ a: 'trample', x, z });
      this.addPoint();
      this.yell(this.gardenAt(x, z), 'flowers');
    }
  }

  // ---------- bins ----------
  tip(bin, mine = true, fromX = bin.x, fromZ = bin.z + 1) {
    if (bin.tipped) return;
    bin.tipped = true;
    // Fall away from whoever knocked it.
    const ang = Math.atan2(bin.x - fromX, bin.z - fromZ);
    bin.pivot.rotation.y = ang;
    this.tipping.push({ bin, t: 0 });
    if (bin.collider) { bin.collider.top = 0.62; bin.collider.r = 0.45; } // now it's something to stand on!
    sfx.clang?.();
    // Rubbish everywhere.
    const dir = V(Math.sin(ang), 0, Math.cos(ang));
    for (let i = 0; i < 6; i++) {
      const piece = new THREE.Mesh(i % 3 === 0 ? new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8) : new THREE.IcosahedronGeometry(0.06, 0),
        paint(pick([0xf1e8d8, 0xd9534f, 0xf6d06a, 0x9ab8cf, 0x8a9a6e])));
      const d = rand(0.8, 1.8);
      piece.position.set(bin.x + dir.x * d + rand(-0.4, 0.4), 0.08, bin.z + dir.z * d + rand(-0.4, 0.4));
      piece.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      this.scene.add(piece);
      this.holes.push(piece);
    }
    if (mine) {
      this.onAct?.({ a: 'tip', id: bin.id, x: fromX, z: fromZ });
      this.addPoint();
      this.yell(bin.garden, 'bins');
    }
  }

  barkAt(pos) {
    for (const b of this.bins) if (!b.tipped && Math.hypot(b.x - pos.x, b.z - pos.z) < 1.4) this.tip(b, true, pos.x, pos.z);
  }

  /** Remote dog's mischief (multiplayer). */
  remote(msg) {
    if (msg.a === 'hole') this.makeHole(msg.x, msg.z);
    else if (msg.a === 'trample') this.trample(msg.x, msg.z, false);
    else if (msg.a === 'tip') { const b = this.bins.find((q) => q.id === msg.id); if (b) this.tip(b, false, msg.x, msg.z); }
  }

  // ---------- per frame ----------
  update(dt, player) {
    const p = player.pos;
    this.lastPos = p.clone();
    if (player.speed > 0.3 && p.y < 0.3) this.trample(p.x, p.z);
    // Zoomies into a bin knocks it flying.
    if (player.speed > 2.6 && p.y < 0.5) {
      for (const b of this.bins) if (!b.tipped && Math.hypot(b.x - p.x, b.z - p.z) < 0.85) this.tip(b, true, p.x, p.z);
    }
    this.tipping = this.tipping.filter((tp) => {
      tp.t += dt * 3.2;
      const k = Math.min(1, tp.t);
      const e = k * k * (3 - 2 * k);
      tp.bin.pivot.children[0].rotation.x = e * Math.PI / 2 * 0.97 + Math.sin(k * Math.PI) * 0.1;
      return k < 1;
    });
    this.slippers = this.slippers.filter((s) => {
      s.t += dt;
      const k = Math.min(1, s.t / 0.9);
      s.g.position.lerpVectors(s.from, s.to, k);
      s.g.position.y = s.from.y * (1 - k) + s.to.y * k + Math.sin(k * Math.PI) * 1.6;
      if (k < 1) s.g.rotation.x += dt * 12;
      else if (!s.landed) { s.landed = true; s.g.rotation.set(0, rand(0, 6), 0); sfx.boink?.(); this.hud.float('boink!', s.to.clone().add(V(0, 0.4, 0))); }
      if (s.t > s.life) { this.scene.remove(s.g); return false; }
      return true;
    });
  }
}
