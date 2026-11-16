import * as THREE from 'three';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { fsfx } from '../../../core/friendSounds.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { COSMETICS } from '../../cosmetics.js';
import { season } from '../../season.js';
import { FarmRoom, cleanPens, flockSize } from '../../farmRules.js';
import { FARMER, SHEEP, HENS, PIGS, CROW, HAY } from '../../lines/farm.js';
import { worldRect, inRect } from '../../../world/areas/areas.js';
import { sheepGeometry, SHEEP as RIG, crowGeometry, instancedPart, rootMatrix, partMatrix } from '../../../entities/farmAnimals.js';
import { bake, bakedMat } from '../../../entities/shapes.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { Flock } from './flock.js';
import { Hens } from './hens.js';
import { Pigs } from './pigs.js';
import { Farmer } from './farmer.js';
import { Crops } from './crops.js';
import { fmsfx } from './sounds.js';

const LOCAL = 0;           // our own id in a FarmRoom of our own (no pack)
const HOLD = 32;           // seconds the sheep stay penned before Farmer Mabel lets them out
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const _root = new THREE.Matrix4(), _m = new THREE.Matrix4();
const ROSETTE_COLS = [0x4f7fc4, 0xd9534f, 0xf2c14e, 0x6f9a52, 0x8e6fb0, 0xf08a6a];

/**
 * 🚜 The Farm, out past another edge of town (the world's built in world/areas/farm*.js): Farmer Mabel (a
 * friend with jobs), the flock of sheep in their field (shared by the whole pack: round them into the pen
 * together), the hens and Rory the rooster, three pigs in a muddy sty (Percy escapes), the crow on the
 * scarecrow's hat, what's growing this season, rosettes on the barn door for every round-up, and hay to
 * climb. The mud's the town's (see TownChapter). One of these per town; the chapter calls update().
 */
export class Farm {
  /**
   * @param o.area   the farm's world data (world.areas, from world/areas/farmBuild.js)
   * @param o.pens   round-ups at this farm so far (from this device's save, until the pack says)
   * @param o.onPens (n) → remember the new count (the chapter saves it)
   */
  constructor({ scene, world, area, hud, player, input, actions, friends, pack, remotes, dogName, pens = 0, onPens = null }) {
    Object.assign(this, { scene, world, area, hud, player, input, actions, friends, pack, remotes, dogName, onPens });
    this.carry = actions.carry;
    this.bags = new Map();
    this.t = 0;
    this.pens = cleanPens(pens);
    this.near = this.nearColliders();
    const seed = world.layout?.seed ?? 'farm';

    // 🐑 The flock (the pack's), 🐔 the hens, 🐷 the pigs (each player's own), 👩‍🌾 the farmer.
    this.flock = new Flock({ scene, world, area, near: this.near, send: (m) => this.send(m), seed });
    this.flock.size(flockSize(season.name));
    this.flock.onBaa = (s, kind) => { if (kind === 'penned' && flat(s, player.pos) < 18) { fmsfx.baa(0.8, s.lamb); this.hud.float(`🐑 ${this.line(SHEEP.penned)}`, V(s.x, 1.1, s.z), 'xp'); } };
    this.flock.onLetOut = () => { if (flat(this.farmer.pos, player.pos) < 25) this.farmer.say(this.line(FARMER.letOut), 3); };
    this.hens = new Hens({ scene, world, area, near: this.near });
    this.hens.onSay = (pos, kind) => this.hud.float(kind === 'rory' ? `🐓 ${this.line(HENS.rory)}` : `🐔 ${this.line(HENS.bwak)}`, pos, kind === 'rory' ? 'xp' : 'sniff');
    this.pigs = new Pigs({ scene, world, area, near: this.near });
    this.pigs.bounds = this.yardRect();
    this.pigs.onSay = (pos, kind) => this.hud.float(`🐷 ${this.line(PIGS[kind] ?? PIGS.oink)}`, pos, 'sniff');
    this.pigs.onHome = (p) => { fmsfx.oink(); this.hud.float(`🐷 ${this.line(PIGS.percyHome)}`, V(p.x, 0.9, p.z), 'xp'); this.farmer.onPercyHome(); };
    this.farmer = friends.add(new Farmer({ scene, world, area, hud, player, actions, friends, dogName, farm: this }));
    // 🌾 What's growing (and the lambs: spring brings them), changing with the seasons.
    this.crops = new Crops({ scene, area });
    this.crops.set(season.name);
    this.stopSeason = season.on((c) => {
      if (!c.season) return;
      this.crops.set(season.name);
      if (this.flock.host) this.flock.size(flockSize(season.name));
    });
    // 🏅 Rosettes on the barn door, 🐦‍⬛ the crow on the scarecrow's hat.
    this.buildRosettes();
    this.showRosettes();
    this.buildCrow();
    this.lamb = null;
    // (A friend's woof: the sheep scatter, the hens flap, the crow takes off. Chained: other places hear it too.)
    const bark = remotes.onBark;
    remotes.onBark = (pos) => { bark?.(pos); this.onBark(pos, false); };
    // The farm's own baked meshes (out in the strip): skipped when they're beyond the fog anyway (from town).
    const a = area.plan;
    this.far = (world.group?.children ?? []).filter((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes.position) return false;
      o.geometry.computeBoundingSphere();
      const c = o.geometry.boundingSphere.center;
      return a.dir[0] * c.x + a.dir[1] * c.z > a.v0 - 3;
    });
    this.camera = null;
    this.treats = new Set(); // (little rewards had this time: the top of the hay, the loft, the tractor)
    this.ambT = 5; this.swishT = 0; this.nudgeT = 0; this.rollT = 0;
    this.net = undefined;
    this.syncPack(performance.now());
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }

  /** Colliders on (or by) the farm: the only ones its animals can bump into (much quicker than all the town's). */
  nearColliders() {
    const s = this.area.strip, pad = 3, col = this.world.colliders;
    const inS = (x, z) => x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad;
    return {
      circles: col.circles.filter((c) => inS(c.x, c.z)),
      boxes: col.boxes.filter((b) => b.x1 > s.x0 - pad && b.x0 < s.x1 + pad && b.z1 > s.z0 - pad && b.z0 < s.z1 + pad),
    };
  }

  solid(x, z, pad = 0.3) {
    for (const c of this.near.circles) if (c.top > 0.25 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
    for (const b of this.near.boxes) if (b.top > 0.25 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    return false;
  }

  /** The farmyard and the orchard: between the two fields' fences, in past the hedge (world rect). */
  yardRect() {
    const d = this.area.layout, f0 = d.sheepField.fenceU, f1 = d.cropField.fenceU;
    return worldRect(d.a, Math.min(f0, f1) + 0.6, d.vF + 1.2, Math.max(f0, f1) - 0.6, d.vB - 1.2);
  }

  inField(p) { return inRect(this.area.sheepField.rect, p.x, p.z); }
  flockMid() {
    const out = this.flock.sheep.filter((s) => !s.penned), n = out.length || 1;
    return out.length ? V(out.reduce((a, s) => a + s.x, 0) / n, 0, out.reduce((a, s) => a + s.z, 0) / n) : this.area.pen.mid.clone();
  }

  // ---------- the pack (or our own farm room) ----------

  me() { return this.room ? LOCAL : this.pack.net?.id ?? LOCAL; }

  /** A pack connection came (or went): say hello to the pack's farm, or run our own. */
  syncPack(now) {
    const net = this.pack.net ?? null;
    if (net === this.net) return;
    this.net = net;
    if (net) { this.room = null; this.waitT = 6; this.flock.setHost(false); this.flock.heard = this.flock.time; net.send({ t: 'farm', a: 'hello', pens: this.pens }); }
    else { this.room = new FarmRoom(this.pens); this.deliver(this.room.message(LOCAL, { a: 'hello' }, now)); }
  }

  send(msg) {
    if (this.room) this.deliver(this.room.message(LOCAL, msg, performance.now()));
    else this.pack.net?.send({ t: 'farm', ...msg });
  }

  deliver(list) { for (const { to, msg } of list) if (to === 'all' || to === LOCAL) this.handle(msg); }

  /** A message about the farm, from the pack's FarmRoom (or ours). */
  handle(m) {
    if (!m) return;
    switch (m.a) {
      case 'state':
        this.waitT = 0;
        this.flock.setHost(m.host === this.me());
        this.setPens(Math.max(this.pens, cleanPens(m.pens)));
        if (m.sheep) this.flock.follow(m.sheep);
        return;
      case 'host': return this.flock.setHost(m.host === this.me());
      case 'sheep': return this.flock.follow(m);
      case 'pens': return this.setPens(m.n);
      case 'penned': return this.penned(m);
    }
  }

  /** Every sheep's in the pen! The gate swings shut, and whoever helped gets the credit. */
  penned(m) {
    const by = Array.isArray(m.by) ? m.by : [], mine = by.includes(this.me()), P = this.player.pos;
    this.flock.gateShut = true;
    if (this.flock.host) this.flock.holdT = HOLD;
    this.setPens(m.n);
    this.farmer.onPenned(mine);
    const near = flat(P, this.area.pen.gate) < 45;
    if (mine) {
      sfx.hooray?.(); buzz([25, 40, 25, 40]);
      const before = progress.stats.flock ?? 0;
      progress.stat('flock');
      progress.award(20 + 5 * Math.min(4, by.length - 1), by.length > 1 ? 'Team round-up!' : 'Round-up!');
      this.hud.showToastRaw('🐑', 'All the sheep are in the pen!', fill(FARMER.rosette, { n: String(m.n) }));
      for (const c of COSMETICS) if (c.friend === 'flock' && before < c.jobs && before + 1 >= c.jobs) this.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'For all your rounding up. Wear it from ☰ → My dog → Dress up.');
      this.actions.sparkle(this.area.pen.mid.clone().add(V(0, 1, 0)), 30);
    } else if (near) {
      const names = by.map((id) => this.remotes.get(id)?.name).filter(Boolean);
      this.hud.showToastRaw('🐑', '', '');
      this.hud.toast.querySelector('.t-head').textContent = names.length ? `${names.join(' & ')} rounded up the sheep!` : 'The sheep are all in the pen!';
    }
  }

  /** How many round-ups this farm's had (the rosettes on the barn door). */
  setPens(n) {
    n = cleanPens(n);
    if (n === this.pens) return;
    this.pens = n;
    this.showRosettes();
    this.onPens?.(n);
  }

  // ---------- 🏅 rosettes, 🐦‍⬛ the crow, 🐑 the lost lamb ----------

  buildRosettes() {
    const B = this.area.barn, g = new THREE.Group();
    g.position.copy(B.rosettes).add(V(Math.sin(B.face) * 0.08, 1.75, Math.cos(B.face) * 0.08));
    g.rotation.y = B.face;
    const board = new THREE.Mesh(bake([[new THREE.BoxGeometry(1.3, 0.92, 0.05), 0xf3ead6], [new THREE.BoxGeometry(1.4, 0.07, 0.08), 0x9b7452, [0, 0.48, 0.01]]]), bakedMat());
    board.castShadow = true;
    g.add(board);
    const ros = bake([
      [new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14), 0xffffff, [0, 0, 0], [Math.PI / 2, 0, 0]],
      [new THREE.CylinderGeometry(0.055, 0.055, 0.025, 12), 0xfff3c0, [0, 0, 0.006], [Math.PI / 2, 0, 0]],
      [new THREE.BoxGeometry(0.045, 0.13, 0.01), 0xffffff, [-0.03, -0.11, -0.005], [0, 0, 0.25]],
      [new THREE.BoxGeometry(0.045, 0.13, 0.01), 0xffffff, [0.03, -0.11, -0.005], [0, 0, -0.25]],
    ]);
    this.rosettes = instancedPart(ros, 12, { shadow: false });
    g.add(this.rosettes);
    this.scene.add(g);
    this.rosetteBoard = g;
  }

  showRosettes() {
    const n = Math.min(12, this.pens), R = this.rosettes, c = new THREE.Color();
    for (let i = 0; i < 12; i++) {
      R.setMatrixAt(i, i < n ? _m.makeTranslation(-0.45 + (i % 4) * 0.3, 0.26 - Math.floor(i / 4) * 0.3, 0.04) : _m.makeScale(0, 0, 0));
      R.setColorAt(i, c.set(ROSETTE_COLS[i % ROSETTE_COLS.length]));
    }
    R.count = 12;
    R.instanceMatrix.needsUpdate = true;
    R.instanceColor.needsUpdate = true;
    this.rosetteBoard.visible = this.pens > 0 && this.shown !== false;
  }

  buildCrow() {
    const G = crowGeometry(), g = new THREE.Group(), mat = bakedMat();
    g.add(new THREE.Mesh(G.body, mat));
    this.crowWings = [1, -1].map((s) => { const w = new THREE.Mesh(G.wing, mat); w.position.set(s * 0.04, 0.12, 0); w.scale.x = s; g.add(w); return w; });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.crowHome = this.area.scarecrow.hat.clone();
    g.position.copy(this.crowHome);
    this.scene.add(g);
    this.crow = { g, fly: 0, a: 0, flapT: 0, cawT: 3 };
  }

  updateCrow(dt) {
    const C = this.crow, P = this.player.pos, home = this.crowHome;
    C.cawT -= dt;
    if (C.fly > 0) {
      C.fly -= dt;
      C.a += dt * 1.3;
      const r = 2.6, k = Math.min(1, C.fly / 1.2), up = 2.6 * Math.min(1, (C.up += dt) / 0.8);
      const x = home.x + Math.cos(C.a) * r * k, z = home.z + Math.sin(C.a) * r * k, y = home.y + up * k + Math.sin(C.a * 2) * 0.3 * k;
      C.g.rotation.y = Math.atan2(-Math.sin(C.a), Math.cos(C.a)) * (k > 0.05 ? 1 : 0);
      C.g.position.set(x, y, z);
      const f = Math.sin(this.t * (k > 0.2 ? 22 : 9)) * 0.9;
      this.crowWings[0].rotation.z = f; this.crowWings[1].rotation.z = -f;
      if (C.fly <= 0) { C.g.position.copy(home); this.crowWings.forEach((w) => (w.rotation.z = 0)); }
    } else {
      C.g.rotation.y += Math.sin(this.t * 0.5) * dt * 0.4;
      C.g.position.y = home.y + Math.abs(Math.sin(this.t * 1.7)) * 0.01;
      const d = flat(P, home);
      if (d < 2.4 && this.player.speed > 0.5) this.scareCrow(); // (too close: off she goes)
      else if (d < 12 && C.cawT <= 0) { C.cawT = 9 + Math.random() * 8; fmsfx.caw(0.6); this.hud.float(`🐦‍⬛ ${this.line(CROW.caw)}`, home.clone().add(V(0, 0.4, 0)), 'sniff'); }
    }
  }

  scareCrow() {
    const C = this.crow;
    if (C.fly > 0) return;
    C.fly = 6 + Math.random() * 3; C.up = 0; C.a = Math.random() * 6.28;
    fmsfx.caw(0.9); fmsfx.flap(0.8);
    if (!this.treats.has('crow')) { this.treats.add('crow'); this.hud.say(`🐦‍⬛ ${this.line(CROW.scarecrow)}`, () => this.crowHome.clone().add(V(0, 0.6, 0)), 3); }
  }

  /** Spring: a lamb's wandered off for Farmer Mabel's job. Somewhere away from the sheep field. */
  loseLamb(rng) {
    const spots = this.area.hides.filter((h) => ['orchard', 'house', 'scarecrow', 'pond', 'stack', 'well'].includes(h.id) && h.pos.y < 0.5);
    const h = spots[rng.int(0, spots.length - 1)];
    if (!h) return false;
    this.lamb?.meshes.forEach((m) => m.removeFromParent());
    const G = sheepGeometry(), meshes = [instancedPart(G.body, 1), instancedPart(G.head, 1, { shadow: false }), instancedPart(G.leg, 4, { shadow: false })];
    this.scene.add(...meshes);
    this.lamb = { pos: V(h.pos.x + rng.float(-0.5, 0.5), 0, h.pos.z + rng.float(-0.5, 0.5)), h: 0, following: false, phase: 0, hop: 0, hopT: 2, fade: 1, home: false, bleatT: 1, meshes };
    return true;
  }

  updateLamb(dt) {
    const L = this.lamb, P = this.player;
    if (!L) return;
    L.bleatT -= dt; L.hopT -= dt; L.hop = Math.max(0, L.hop - dt);
    const d = flat(P.pos, L.pos);
    let speed = 0;
    if (L.home) { // snuggling into the flock: shrink away into the wool
      L.fade -= dt * 0.8;
      if (L.fade <= 0) { L.meshes.forEach((m) => m.removeFromParent()); this.lamb = null; return; }
    } else if (!L.following) {
      if (L.bleatT <= 0 && d < 16) { L.bleatT = 2.5 + Math.random() * 2; fmsfx.baa(Math.max(0.3, 1 - d / 16), true); this.hud.float(`🐑 ${this.line(SHEEP.lamb)}`, L.pos.clone().add(V(0, 0.75, 0)), 'sniff'); }
      if (d < 1.6) { L.following = true; buzz(15); fmsfx.baa(1, true); this.hud.float(`🐑 ${this.line(HAY.lamb)}`, L.pos.clone().add(V(0, 0.8, 0)), 'xp'); this.friends.onChange?.(); }
    } else {
      // Close behind you (a lamb can squeeze under any fence), then off to Mum once she's in the field.
      const inField = this.inField(L.pos), mum = inField ? this.flock.nearest(L.pos) : null;
      const to = mum ? V(mum.x, 0, mum.z) : P.pos.clone().add(V(-Math.sin(P.heading) * 0.9, 0, -Math.cos(P.heading) * 0.9));
      const dx = to.x - L.pos.x, dz = to.z - L.pos.z, l = Math.hypot(dx, dz), gap = mum ? 0.8 : 0.3;
      if (l > gap) { speed = Math.min(mum ? 2.2 : 4.5, l * 2.4); L.pos.x += (dx / l) * speed * dt; L.pos.z += (dz / l) * speed * dt; L.h = Math.atan2(dx, dz); }
      if (mum && l < 1.2) { L.home = true; fmsfx.baa(1, true); this.actions.sparkle(L.pos.clone().add(V(0, 0.5, 0)), 16); this.farmer.onLambHome(); }
    }
    if (L.hopT <= 0) { L.hopT = 1.5 + Math.random() * 3; L.hop = 0.4; }
    L.phase += dt * (3 + speed * 7);
    const k = 0.6 * Math.max(0.01, L.fade), hopY = L.hop > 0 ? Math.sin((L.hop / 0.4) * Math.PI) * 0.3 : 0, sw = Math.min(1, speed / 1.2) * 0.55;
    rootMatrix(_root, L.pos.x, hopY, L.pos.z, L.h, k);
    L.meshes[0].setMatrixAt(0, _root);
    L.meshes[1].setMatrixAt(0, partMatrix(_m, _root, RIG.NECK, speed > 0.2 ? -0.1 : 0.6 + Math.sin(this.t * 2) * 0.1, 0, 0, 1.22));
    RIG.HIPS.forEach((hip, j) => L.meshes[2].setMatrixAt(j, partMatrix(_m, _root, hip, Math.sin(L.phase + (j === 0 || j === 3 ? 0 : Math.PI)) * sw, 0, 0)));
    L.meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }

  // ---------- bits Farmer Mabel's jobs need ----------

  /** Somewhere for Percy to run off to (in the yard or the orchard, a good way from the sty). */
  awayFromSty(rng) {
    const r = this.pigs.bounds, st = this.area.sty.pos;
    for (let i = 0; i < 60; i++) {
      const x = rng.float(r.x0 + 1, r.x1 - 1), z = rng.float(r.z0 + 1, r.z1 - 1), d = Math.hypot(x - st.x, z - st.z);
      if (d > 8 && d < 16 && !this.solid(x, z, 0.6) && !this.pigs.inSty(x, z, -1)) return V(x, 0, z);
    }
    return st.clone().add(V(4, 0, 4));
  }

  /** Where the armfuls of hay are waiting in the barn (on the floor, by the big pile). */
  haySpots() {
    const d = this.area.layout, b = d.barn, s = d.side;
    return [[-2.6, 1.0], [-3.6, -0.9], [-1.0, -2.3]].map(([du, dv]) => { const [x, z] = d.W(b.u + s * du, b.v + dv); return { x, z }; });
  }

  /** Something for a job got where it's going: leave it there (pumpkins in the cart, hay in the rack…). */
  delivered(kind, item) {
    const A = this.area, o = item.obj, n = (this.dropped = (this.dropped ?? 0) + 1);
    if (kind === 'eggs') o.position.copy(A.basket).add(V(Math.cos(n * 2.1) * 0.06, 0.1, Math.sin(n * 2.1) * 0.06));
    else if (kind === 'pumpkins') o.position.copy(A.cart.bed).add(V(Math.cos(n * 2.4) * 0.35, 0.0, Math.sin(n * 2.4) * 0.45));
    else if (kind === 'hay') o.position.copy(A.rack).add(V(Math.cos(n * 2.4) * 0.35, 0.65, 0));
    else if (kind === 'apples') { o.position.copy(A.sty.trough).add(V(Math.cos(n * 2.4) * 0.3, 0.27, 0)); for (const p of this.pigs.pigs) if (!p.out) { p.walkTo = { x: A.sty.trough.x, z: A.sty.trough.z }; p.lie = 0; p.t = 4; } fmsfx.oink(); }
    o.rotation.set(0, n * 1.3, 0);
    o.scale.setScalar(1);
    this.scene.add(o);
  }

  // ---------- 🐾 woofs ----------

  onBark(pos, mine = true) {
    this.flock.bark(pos);
    this.hens.bark(pos);
    this.pigs.bark(pos);
    if (flat(pos, this.crowHome) < 10) this.scareCrow();
    if (mine && this.inField(pos) && this.flock.sheep.some((s) => !s.penned && flat(s, pos) < 9)) { fmsfx.baa(0.9); this.hud.float(`🐑 ${this.line(SHEEP.scared)}`, this.actions.anchor().add(V(0, 0.4, 0)), 'sniff'); }
  }

  // ---------- per frame ----------

  /** The dogs that move the sheep: ours and our friends'. */
  dogs() {
    const P = this.player, out = [{ id: this.me(), x: P.pos.x, z: P.pos.z, v: P.speed }];
    for (const r of this.remotes.dogs.values()) {
      if (!r.dog.root.visible) continue;
      const p = r.dog.root.position;
      out.push({ id: r.id, x: p.x, z: p.z, v: r.buf?.[r.buf.length - 1]?.v ?? 0 });
    }
    return out;
  }

  update(dt, { canAct = true, barked = false } = {}) {
    this.t += dt;
    const P = this.player, now = performance.now();
    this.syncPack(now);
    if (barked) this.onBark(P.pos);
    const dogs = canAct ? this.dogs() : this.dogs().slice(1);
    const near = flat(P.pos, this.area.yard.pos) < 60;
    // (A pack whose server never answers the farm's hello, an old one say: run a flock of our own, as if alone.)
    if (this.waitT > 0 && (this.waitT -= dt) <= 0 && this.pack.net && !this.room) { this.room = new FarmRoom(this.pens); this.deliver(this.room.message(LOCAL, { a: 'hello' }, now)); }
    this.flock.update(dt, dogs, { live: !!this.pack.net && !this.room });
    // No word from the pack's shepherd for a while (their phone's asleep?): offer to run the sheep ourselves.
    this.nudgeT -= dt;
    if (this.pack.net && !this.room && !this.flock.host && near && this.flock.time - (this.flock.heard ?? 0) > 3 && this.nudgeT <= 0) { this.nudgeT = 3; this.send({ a: 'nudge' }); }
    this.hens.update(dt, dogs, near);
    this.pigs.update(dt, dogs, near || this.pigs.percy.out);
    this.crops.update(P.pos);
    this.updateCrow(dt);
    this.updateLamb(dt);
    this.cull(this.camera);
    if (!canAct || !near) return;

    // A roll in the mud by the pigs: they roll too! (mud buddies)
    this.rollT -= dt;
    if (P.emoted === 'roll' && this.rollT <= 0 && this.pigs.inSty(P.pos.x, P.pos.z, -2)) {
      this.rollT = 20;
      this.pigs.rollAll();
      this.hud.float(`🐷 ${this.line(PIGS.roll)}`, this.actions.anchor().add(V(0, 0.4, 0)), 'xp');
      progress.award(3, 'Mud buddies!');
    }
    // Up on top of things: the hay castle, the hayloft, the tractor's roof.
    const A = this.area, top = (key, at, y, list, xp) => {
      if (this.treats.has(key) || P.pos.y < y || flat(P.pos, at) > 1.9 || !P.grounded) return;
      this.treats.add(key);
      progress.award(xp, list === HAY.castle ? 'Top of the hay!' : list === HAY.loft ? 'Up in the hayloft!' : 'Top of the tractor!');
      this.hud.float(`🌾 ${this.line(list)}`, this.actions.anchor(), 'xp');
      fsfx.tada?.(0.7);
    };
    top('castle', A.stack.top, 1.25, HAY.castle, 3);
    top('loft', A.barn.loft, 1.25, HAY.loft, 3);
    top('tractor', A.tractor.seat, 1.9, HAY.tractor, 4);
    // Swish through the summer wheat.
    this.swishT -= dt;
    if (this.crops.inWheat(P.pos.x, P.pos.z) && P.speed > 1.4 && P.grounded && this.swishT <= 0) {
      this.swishT = 0.45;
      fmsfx.swish(0.8);
      this.actions.dirt.burst(3, () => ({ pos: P.pos.clone().add(V(Math.random() * 0.6 - 0.3, 0.6, Math.random() * 0.6 - 0.3)), vel: V(Math.random() - 0.5, 0.8, Math.random() - 0.5), life: 1.2, size: 0.02, gravity: 1.2, drag: 1.8, floor: 0.03, color: 0xe8cd8a }));
    }
    // The odd baa, oink and cluck when you're about.
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 5 + Math.random() * 7;
      const s = this.flock.nearest(P.pos) ?? this.flock.nearest(P.pos, true);
      if (s && flat(s, P.pos) < 16) { fmsfx.baa(Math.max(0.3, 1 - flat(s, P.pos) / 16), s.lamb); if (Math.random() < 0.6) this.hud.float(`🐑 ${this.line(s.i === this.flock.sheep.length - 1 ? SHEEP.baa : SHEEP.baa)}`, V(s.x, s.lamb ? 0.8 : 1.15, s.z), 'sniff'); }
      else if (flat(P.pos, A.coop.pos) < 12) fsfx.cluck(0.5);
      else if (flat(P.pos, A.sty.pos) < 12) fmsfx.oink(0.5);
    }
  }

  /**
   * Hide the farm's meshes that are wholly past the fog (they'd be drawn, but you couldn't see them). Fog goes
   * by depth, not distance, so off to the side of the view things fog a bit later: hence the margin.
   */
  cull(camera) {
    const fog = this.scene.fog;
    if (!fog || !camera) return;
    for (const o of this.far) {
      const s = o.geometry.boundingSphere;
      o.visible = camera.position.distanceTo(s.center) - s.radius < fog.far * 1.25 + 2;
    }
    // The animals, the farmer and the rest move about, so they're not in the town's baked meshes: hide them
    // all together when the whole farm's lost in the fog (from the far side of town, say).
    const r = this.area.strip, c = camera.position;
    const away = Math.hypot(Math.max(r.x0 - c.x, 0, c.x - r.x1), Math.max(r.z0 - c.z, 0, c.z - r.z1));
    const show = away < fog.far * 1.25 + 2;
    if (show === this.shown) return;
    this.shown = show;
    const things = [this.flock.body, this.flock.head, this.flock.legs, this.flock.gate, this.hens.body, this.hens.head, this.hens.wings, this.hens.legs,
      this.pigs.pink, this.pigs.spotty, this.pigs.head, this.pigs.legs, this.farmer.p.root, this.crow.g, this.rosetteBoard, ...(this.lamb?.meshes ?? [])];
    for (const o of things) o.visible = show && (o !== this.rosetteBoard || this.pens > 0);
  }

  dispose() {
    this.stopSeason?.();
    for (const x of [this.flock, this.hens, this.pigs, this.crops, this.farmer]) x.dispose?.();
  }
}
