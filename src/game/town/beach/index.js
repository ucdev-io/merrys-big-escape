import * as THREE from 'three';
import { AreaCull } from '../../../world/areaCull.js';
import { LineBag } from '../../dialogue.js';
import { season } from '../../season.js';
import { seasonUniforms, paint } from '../../../render/watercolorMaterial.js';
import { PawPrints } from '../../../fx/pawPrints.js';
import { BeachRoom } from '../../beachRules.js';
import { KIOSK } from '../../lines/beach.js';
import { Waves } from './waves.js';
import { Castles } from './castles.js';
import { Gulls } from './gulls.js';
import { Crabs } from './crabs.js';
import { Treasure } from './treasure.js';
import { Crowd } from './crowd.js';
import { Sandy } from './lifeguard.js';
import { bsfx } from './sounds.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const LOCAL = 0; // our own id in a BeachRoom of our own (no pack server)
// The sea through the seasons (shallows, deep water), and how much a shower greys it.
const SEA = {
  spring: [0x9fd2cc, 0x5f9ec0], summer: [0x93d8cf, 0x4d95c3], autumn: [0x9cc9c4, 0x5a8fae], winter: [0xa9c4c4, 0x6a879c],
};
const GREY = new THREE.Color(0x93a3aa);
// Sea mist: { near, far, color, mix } on top of the season's fog (none on a fine summer's day, or in the wind).
const MIST = { haze: { near: 30, far: 110, mix: 0.35 }, winter: { near: 22, far: 86, mix: 0.5 }, wet: { near: 18, far: 72, mix: 0.5 } };
const MIST_COL = new THREE.Color(0xe2e8ea);

/**
 * 🏖️ The Beach, out past one edge of town (the world's built in world/areas/beachBuild.js): waves to chase
 * (and run away from), sandcastles the whole pack builds (and knocks over), rock pools with crabs, seagulls
 * after everyone's chips, treasures in the sand, an ice cream from the kiosk for a trick, Sandy the
 * lifeguard (a friend with jobs), people through the seasons, paw prints in the sand and a sea mist when
 * the weather turns. One of these per town; the chapter calls update() each frame.
 */
export class Beach {
  /**
   * @param o.area   the beach's world data (world.areas, from world/areas/beachBuild.js)
   * @param o.look   the seasons' look (render/seasonLook.js), which owns the fog: the beach's mist goes on top
   */
  constructor({ scene, world, area, hud, player, input, actions, friends, pack, remotes, dogName, look = null, camera = null }) {
    Object.assign(this, { scene, world, area, hud, player, input, actions, friends, pack, remotes, dogName, look, camera });
    this.t = 0;
    this.room = new BeachRoom();
    this.online = false;
    // The sea paints with the scene's own fog colour and the sky's horizon (the same objects, so they keep up).
    const U = (this.U = area.sea.uniforms);
    if (scene.fog) U.uFogCol.value = scene.fog.color;
    const sky = scene.getObjectByName('sky');
    if (sky?.material?.uniforms?.uHorizon) U.uHorizon.value = sky.material.uniforms.uHorizon.value;
    this.shallow = new THREE.Color(); this.deep = new THREE.Color(); this._c = new THREE.Color();
    this.seaTint(true);

    this.waves = new Waves({ area, player, hud, actions });
    this.castles = new Castles(this);
    this.gulls = new Gulls(this);
    this.crabs = new Crabs(this);
    this.treasure = new Treasure(this);
    this.crowd = new Crowd(this);
    // 🛟 Sandy, by her tower.
    this.sandy = friends.add(new Sandy({ scene, world, area, hud, player, actions, friends, dogName }));
    // 🐾 Paw prints in the sand (in the snow, the seasons' own prints take over).
    this.prints = new PawPrints(scene, { max: 220, life: 32, opacity: 0.4 });
    // The gulls, crabs and castles: drawn when the beach is in view, their shadows only near it (world/areaCull.js).
    this.areaCull = new AreaCull([this.gulls.bodyMesh, this.gulls.wingMeshR, this.gulls.wingMeshL, this.gulls.trayMesh, this.gulls.chipsMesh, this.crabs.bodyMesh, this.crabs.clawR, this.crabs.clawL, ...Object.values(this.castles.meshes)], area.strip);
    this.printCol = 0xb89c6a;
    this.sandMound = paint(0xd9c28e); // (things buried in the sand are under sandy heaps, not earth)
    // Up and over the dunes, along the boardwalk.
    const prev = world.heightAt;
    world.heightAt = (x, z) => Math.max(prev?.(x, z) ?? 0, area.heightAt(x, z));
    // Friends' woofs scare gulls and crabs too (a hook other areas use as well, so chained).
    const bark = remotes.onBark;
    remotes.onBark = (pos) => { bark?.(pos); this.onBark(pos, false); };
    // The beach's own baked meshes (out in the strip): skipped when they're beyond the fog anyway.
    const a = area.plan;
    this.far = (world.group?.children ?? []).filter((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.name === 'sea' || o.name === 'swash' || !o.geometry?.attributes.position) return false;
      o.geometry.computeBoundingSphere();
      const c = o.geometry.boundingSphere.center;
      return a.dir[0] * c.x + a.dir[1] * c.z > a.v0 - 3;
    });
    this.mist = { k: 0, near: 30, far: 110, color: MIST_COL, mix: 0.35 };
    this.kioskT = 0;
    this.kioskTalkT = 0;
    this.bags = {};
  }

  line(list) { return (this.bags[list[0]] ??= new LineBag(list)).next(); }
  me() { return this.pack?.net && this.online ? this.pack.net.id : LOCAL; }

  // ---------- sandcastles: the pack's BeachRoom (on the server), or our own ----------

  send(msg) {
    if (this.pack?.net && this.online) this.pack.net.send({ t: 'beach', ...msg });
    else this.deliver(this.room.message(LOCAL, msg, performance.now()));
  }

  deliver(list) { for (const { to, msg } of list) if (to === 'all' || to === LOCAL) this.handle(msg); }

  /** A message about the beach from the pack (or our own room): { a: 'state' | 'castle', … }. */
  handle(m) {
    if (m?.a === 'state') return this.adopt(m);
    if (m?.a === 'castle') this.castles.handle(m, m.by === this.me());
    return undefined;
  }

  /** The pack's castles (from its welcome): from now on the server settles them. */
  adopt(s) {
    if (!s) return;
    if (this.pack?.net) this.online = true;
    this.castles.adopt(s.castles ?? []);
  }

  /** Remove a collider (a sandcastle knocked flat). */
  uncollide(c) { const C = this.world.colliders; C.circles = C.circles.filter((q) => q !== c); }

  // ---------- per frame ----------

  update(dt, { canAct = true } = {}) {
    if (!this.pack?.net && this.online) { this.online = false; this.room = new BeachRoom(this.castles.list.map((c) => c.s)); } // lost the pack: carry on with our own
    this.t += dt;
    const P = this.player, U = this.U;
    U.uTime.value = this.t;
    const fog = this.scene.fog;
    if (fog) { U.uFogNear.value = fog.near; U.uFogFar.value = fog.far; }
    if (this.camera) U.uFar.value = this.camera.far;
    this.seaTint(false, dt);

    this.waves.update(dt, { canAct });
    this.castles.update(dt, P);
    this.gulls.update(dt, P, { canAct, busy: this.sandy.job?.kind === 'gulls' });
    this.crabs.update(dt, P, { canAct });
    this.treasure.update(dt);
    this.crowd.update(dt);
    this.kiosk(dt, P, canAct);
    this.sandPrints(dt);
    for (const it of this.actions.carry.items) if (it.mound && !it.sandy && this.area.onSand(it.pos.x, it.pos.z)) { it.mound.material = this.sandMound; it.sandy = true; }
    this.fog(this.area.depth(P.pos.x, P.pos.z));
    this.cull(this.camera);
  }

  /** The sea's colours for the season and the weather (eased), how choppy it is, and the sun on it. */
  seaTint(snap = false, dt = 0) {
    const U = this.U, [sh, dp] = SEA[season.name] ?? SEA.spring, w = season.weather;
    const grey = w === 'showers' ? 0.45 : w === 'snow' ? 0.35 : w === 'windy' ? 0.15 : 0;
    const k = snap ? 1 : 1 - Math.exp(-dt * 0.6);
    U.uShallow.value.lerp(this._c.set(sh).lerp(GREY, grey), k);
    U.uDeep.value.lerp(this._c.set(dp).lerp(GREY, grey * 0.8), k);
    const chop = w === 'windy' ? 1 : w === 'showers' ? 0.6 : w === 'snow' ? 0.5 : season.is('winter') ? 0.4 : season.is('summer') ? 0.08 : 0.2;
    const glint = w === 'clear' ? (season.is('winter') ? 0.6 : 1) : w === 'windy' ? 0.7 : 0.12;
    U.uChop.value += (chop - U.uChop.value) * k;
    U.uGlint.value += (glint - U.uGlint.value) * k;
    U.uSand.value.set(seasonUniforms.uSnow.value > 0.4 ? 0xb9ae96 : 0xc4ab7c);
  }

  /** A sea mist over the beach when the weather turns (the seasons' look owns the fog: this goes on top). */
  fog(k) {
    if (!this.look) return;
    const w = season.weather, M = w === 'showers' || w === 'snow' ? MIST.wet : season.is('winter') ? MIST.winter : season.is('summer') || w === 'windy' ? null : MIST.haze;
    if (!M) { this.look.setLocal('beach', null); return; }
    Object.assign(this.mist, M, { k });
    this.look.setLocal('beach', this.mist);
  }

  /**
   * Hide the beach's meshes that are wholly past the fog (like the woods), and its moving things (gulls, crabs,
   * castles, Sandy…) when the whole beach is.
   */
  cull(camera) {
    const fog = this.scene.fog;
    if (!fog || !camera) return;
    this.areaCull.update(camera);
    const far = fog.far * 1.25 + 2, c = camera.position;
    for (const o of this.far) {
      const s = o.geometry.boundingSphere;
      o.visible = c.distanceTo(s.center) - s.radius < far;
    }
    const r = this.area.strip, dx = Math.max(r.x0 - c.x, 0, c.x - r.x1), dz = Math.max(r.z0 - c.z, 0, c.z - r.z1), seen = Math.hypot(dx, dz) < far;
    if (seen === this.seen) return;
    this.seen = seen;
    for (const o of this.movers()) o.visible = seen;
    this.castles.hidden = !seen;
    if (this.castles.list.length) this.castles.draw(this.castles.list[0]); // (shows or hides the castles' parts as they should be)
  }

  /** Everything at the beach that moves about (to hide when the beach is lost in the fog). */
  movers() {
    const G = this.gulls, C = this.crabs;
    return [G.bodyMesh, G.wingMeshR, G.wingMeshL, G.trayMesh, G.chipsMesh, C.bodyMesh, C.clawR, C.clawL, this.treasure.tips, this.prints.mesh, this.sandy.p.root];
  }

  /** 🐾 Prints in the sand behind every dog on it (not in the water, and not in the snow: the seasons do those). */
  sandPrints(dt) {
    const A = this.area, snowy = seasonUniforms.uSnow.value > 0.45, surf = (x, z) => A.surfaceY(x, z) + 0.012, P = this.player;
    this.prints.follow('me', P.pos, P.heading, P.dog.breed.size, !snowy && P.grounded && !P.inWater && A.onSand(P.pos.x, P.pos.z), surf, this.printCol);
    for (const r of this.remotes?.dogs.values() ?? []) {
      const last = r.buf?.[r.buf.length - 1], p = r.dog.root.position;
      this.prints.follow(r.id, p, r.dog.root.rotation.y, r.dog.breed.size, !snowy && r.dog.root.visible && !!last && !(last.f & (4 | 8)) && A.onSand(p.x, p.z), surf, this.printCol);
    }
    this.prints.update(dt);
  }

  /** 🍦 The kiosk: do a trick at the counter for a doggy ice cream (spring to autumn; it's shut in winter). */
  kiosk(dt, P, canAct) {
    this.kioskT -= dt; this.kioskTalkT -= dt;
    const k = this.area.kiosk, d = flat(P.pos, k.counter);
    this.kioskHint = null;
    if (d > 4.5 || !canAct) return;
    if (season.is('winter')) { this.kioskHint = KIOSK.closed; return; }
    if (!P.emoted) { if (this.kioskT <= 0) this.kioskHint = KIOSK.hint; return; }
    const head = () => k.keeper.clone().add(V(0, 1.95, 0));
    if (this.kioskT > 0) { if (this.kioskTalkT <= 0) { this.kioskTalkT = 4; this.hud.say(`🍦 ${this.line(KIOSK.wait)}`, head, 2.5); } return; }
    this.kioskT = 75;
    bsfx.ding();
    this.hud.say(`🍦 ${this.line(KIOSK.trick)}`, head, 3);
    const s = Math.sin(k.face), c = Math.cos(k.face);
    setTimeout(() => this.actions.snacks.drop('icecream', k.counter.x + s * 0.6, k.counter.z + c * 0.6), 500);
  }

  // ---------- the chapter's hooks ----------

  /** A woof (mine, or a friend's): gulls and crabs scatter; saving a picnic's chips counts for Sandy. */
  onBark(pos, mine = true) {
    const g = this.gulls.onBark(pos, mine);
    if (mine && g.foiled) this.sandy.onGull();
    this.crabs.onBark(pos, mine);
  }

  /** 🐾: patting a sandcastle, or digging up something buried in the sand. (true if it was ours) */
  onDig(nose) { return this.castles.onDig(nose) || this.treasure.onDig(nose); }

  get hint() { return this.castles.prompt ?? this.treasure.hint ?? this.sandy.hint ?? this.kioskHint ?? null; }
  get pawAct() { return this.castles.pawAct; }

  /**
   * For a story (to come): who's who and what's where at the beach, in world coordinates. Characters:
   * Sandy the lifeguard, Gulliver the boss seagull, Nipper the crab. Places: the beach huts (numbered),
   * the kiosk, the lifeguard's tower, the upturned boat (room to hide something under it), the rock pools,
   * the groynes, the dunes' boardwalk, the lighthouse out on the headland, and the treasure spots.
   */
  get story() {
    const A = this.area;
    return {
      name: A.name,
      characters: { sandy: this.sandy.pos, gulliver: this.gulls.gulliver, nipper: this.crabs.nipper },
      huts: A.huts, kiosk: A.kiosk, tower: A.tower, boat: A.boat, pools: A.pools, groynes: A.groynes,
      boardwalk: A.gate, lighthouse: A.lighthouse, treasureSpots: A.treasureSpots, castles: A.castles,
    };
  }
}
