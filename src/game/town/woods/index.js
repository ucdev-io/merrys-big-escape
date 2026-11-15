import * as THREE from 'three';
import { Owl } from '../../../entities/owl.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { COSMETICS } from '../../cosmetics.js';
import { DEN_DONE, DEN_FULL, DEN_STAGES, cleanDen } from '../../denRules.js';
import { OWL, DEN } from '../../lines/woods.js';
import { Brock } from './badger.js';
import { BigSticks } from './sticks.js';
import { DenModel } from './den.js';
import { Mud } from './mud.js';
import { wsfx } from './sounds.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const WOODS_FOG = new THREE.Color(0xd5ddcc);
const DEN_REACH = 2.7;  // bring a big stick this close to the den and it goes on

/**
 * 🌲 The Woods, out past the edge of town (the world's built in world/areas/): the owl who doesn't like
 * being woken, Brock the badger (a friend with jobs), BIG sticks and the den everyone builds with them,
 * glorious mud, and a cosy fog under the trees. One of these per town; the chapter calls update() each frame.
 */
export class Woods {
  /**
   * @param o.area   the woods' world data (world.areas, from world/areas/woodsBuild.js)
   * @param o.den    how many sticks the den has (from this device's save, until the pack says)
   * @param o.onDen  (n) → remember the den's new size (the chapter saves it)
   */
  constructor({ scene, world, area, hud, player, input, actions, friends, pack, remotes, dogName, den = 0, onDen = null }) {
    Object.assign(this, { scene, world, area, hud, player, input, actions, friends, pack, remotes, dogName, onDen });
    this.carry = actions.carry;
    this.bags = new Map();
    this.t = 0;

    // 🦉 The owl, asleep on her branch by the path.
    this.owl = new Owl();
    this.owl.root.position.copy(area.owl.perch);
    this.owl.root.rotation.y = area.owl.face;
    scene.add(this.owl.root);
    this.owlT = 0; this.owlTalkT = 0; this.behindT = 0; this.dozeT = 4;

    // 🦡 Brock, in his sett.
    this.brock = friends.add(new Brock({ scene, world, area, hud, player, actions, friends, dogName }));
    // 🪵 Big sticks, and 🏕️ the den.
    this.sticks = new BigSticks({ hud, player, actions, world, area, input });
    this.denPos = area.den.pos;
    this.model = new DenModel(scene, world, area.den.pos, area.den.face);
    this.den = cleanDen(den);
    this.model.set(this.den);
    this.flying = [];
    // 🟤 Mud.
    this.mud = new Mud({ scene, hud, player, actions, zones: area.mud });
    remotes.onMud = (dog, level) => this.mud.setRemote(dog, level);
    remotes.onBark = (pos) => this.onBark(pos, false);

    this.fogK = 0;
    this.fogBase = null;
    this.ambT = 8;
    this.moteT = 0;
    // The wood's own baked meshes (out in the strip): skipped when they're beyond the fog anyway (from town).
    const a = area.plan;
    this.far = (world.group?.children ?? []).filter((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes.position) return false;
      o.geometry.computeBoundingSphere();
      const c = o.geometry.boundingSphere.center;
      return a.dir[0] * c.x + a.dir[1] * c.z > a.v0 - 3;
    });
    this.camera = null;
  }

  /**
   * Hide the wood's meshes that are wholly past the fog (they'd be drawn, but you couldn't see them). Fog
   * goes by depth, not distance, so off to the side of the view things fog a bit later: hence the margin.
   */
  cull(camera) {
    const fog = this.scene.fog;
    if (!fog || !camera) return;
    for (const o of this.far) {
      const s = o.geometry.boundingSphere;
      o.visible = camera.position.distanceTo(s.center) - s.radius < fog.far * 1.25 + 2;
    }
  }

  line(list, vars = {}) {
    if (!this.bags.has(list)) this.bags.set(list, new LineBag(list));
    return fill(this.bags.get(list).next(), { name: this.dogName(), ...vars });
  }

  // ---------- the den ----------

  /** The den's count from the pack (welcome or a stick going on), or our own when there's no server. */
  setDen(n, { mine = false, name = null, quiet = false } = {}) {
    n = cleanDen(n);
    const before = this.den;
    if (n === before) return;
    this.den = n;
    this.model.set(n);
    this.onDen?.(n);
    if (quiet || n < before) return;
    const near = flat(this.player.pos, this.denPos) < 40;
    if (!mine && name && near) this.hud.float(`🪵 ${fill(DEN.friend, { who: name })}`, this.denPos.clone().add(V(0, 2.6, 0)), 'xp');
    for (const s of DEN_STAGES) {
      if (before >= s || n < s) continue;
      this.hud.showToastRaw(s === DEN_DONE ? '🏕️' : '🪵', DEN.stages[s], s === DEN_DONE ? 'Built by the whole pack. It’ll be here next time too!' : '');
      if (s === DEN_DONE) {
        sfx.hooray?.(); buzz([25, 40, 25, 40]);
        progress.award(mine ? 20 : 10, mine ? 'The den is finished!' : 'Team bonus!');
        if (near) this.actions.sparkle(this.denPos.clone().add(V(0, 1.5, 0)), 40);
      }
    }
  }

  /** A message about the woods from the pack: { a: 'den', n, by, name }. */
  handle(m) {
    if (m.a === 'den') this.setDen(m.n, { mine: m.by === this.pack.net?.id, name: m.name });
  }

  /** Carrying a big stick right up to the den: on it goes. */
  deliver(P) {
    const it = this.carry.consume();
    if (!it) return;
    const size = P.dog.breed.size, from = P.pos.clone().add(V(Math.sin(P.heading) * 0.4 * size, 0.35 * size, Math.cos(P.heading) * 0.4 * size));
    it.obj.position.copy(from);
    it.obj.rotation.set(0, P.heading + Math.PI / 2, 0);
    it.obj.scale.setScalar(1);
    this.scene.add(it.obj);
    this.flying.push({ obj: it.obj, from, to: this.model.top(), t: 0, spin: Math.random() < 0.5 ? -1 : 1 });
    const before = progress.stats.den ?? 0;
    progress.stat('den');
    progress.award(4, 'For the den!');
    for (const c of COSMETICS) if (c.friend === 'den' && before < c.jobs && before + 1 >= c.jobs) this.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'For all your den building. Wear it from ☰ → My dog → Dress up.');
    this.hud.float(`🪵 ${this.line(this.den >= DEN_FULL ? DEN.woodpile : DEN.added)}`, this.actions.anchor(), 'xp');
    if (!this.pack.connected) this.setDen(this.den + 1, { mine: true });
    else this.pack.net.send({ t: 'woods', a: 'stick' }); // (the server counts it for the whole town, and tells everyone)
  }

  // ---------- the owl ----------

  /** A woof (yours, or a friend's) near the owl wakes her up. */
  onBark(pos, mine = true) {
    const perch = this.area.owl.perch;
    if (Math.hypot(pos.x - perch.x, pos.z - perch.z) > 10) return;
    const again = this.owlT > 4;
    this.owl.startle();
    this.owlT = 9;
    wsfx.ruffle();
    setTimeout(() => wsfx.hoot(mine ? 1 : 0.7), 260);
    if (this.owlTalkT <= 0 || mine) {
      this.owlTalkT = 2.5;
      this.hud.say(`🦉 ${this.line(again ? OWL.again : OWL.woken)}`, () => perch.clone().add(V(0, 0.75, 0)), 3.2);
    }
    // A feather or two drifts down.
    this.actions.dirt.burst(4, () => ({ pos: perch.clone().add(V(Math.random() * 0.3 - 0.15, 0.2, Math.random() * 0.3 - 0.15)), vel: V(Math.random() - 0.5, 0.6, Math.random() - 0.5), life: 2.2, size: 0.03, gravity: 0.6, drag: 1.5, floor: 0.04, color: 0xc9a77c }));
    if (mine && !this.wokeOwl) { this.wokeOwl = true; progress.award(3, 'Woke the owl!'); }
  }

  updateOwl(dt, P) {
    const perch = this.area.owl.perch, face = this.area.owl.face, d = flat(P.pos, perch);
    this.owlT -= dt; this.owlTalkT -= dt; this.behindT -= dt; this.dozeT -= dt;
    if (this.owlT <= 0) this.owl.wantAwake = false;
    // Awake, she watches you go by — all the way round, if you go behind her.
    const ang = wrap(Math.atan2(P.pos.x - perch.x, P.pos.z - perch.z) - face);
    this.owl.lookTo = d < 14 ? Math.max(-2.7, Math.min(2.7, ang)) : 0;
    if (this.owl.awake > 0.8 && Math.abs(ang) > 2.1 && d < 8 && this.behindT <= 0) {
      this.behindT = 25;
      this.hud.say(`🦉 ${this.line(OWL.behind)}`, () => perch.clone().add(V(0, 0.75, 0)), 3);
    }
    if (this.owl.awake < 0.2 && d < 9 && this.dozeT <= 0) { this.dozeT = 9; this.hud.float(`💤 ${this.line(OWL.dozing)}`, perch.clone().add(V(0, 0.55, 0)), 'sniff'); }
    this.owl.update(dt);
  }

  // ---------- per frame ----------

  update(dt, { canAct = true } = {}) {
    this.t += dt;
    const P = this.player;
    this.updateOwl(dt, P);
    this.sticks.update(dt, canAct);
    if (canAct && this.sticks.holding && flat(P.pos, this.denPos) < DEN_REACH) this.deliver(P);
    // Sticks flying onto the den.
    for (const f of this.flying) {
      f.t = Math.min(1, f.t + dt / 0.7);
      f.obj.position.lerpVectors(f.from, f.to, f.t).add(V(0, Math.sin(f.t * Math.PI) * 1.2, 0));
      f.obj.rotation.y += dt * 6 * f.spin;
      f.obj.rotation.z = f.t * 1.2;
      if (f.t >= 1) { f.obj.removeFromParent(); wsfx.clonk(); this.actions.sparkle(f.to, 8); }
    }
    this.flying = this.flying.filter((f) => f.t < 1);
    this.model.update(dt, this.t);
    this.mud.update(dt, canAct);
    this.cull(this.camera);

    // Under the trees: a softer, closer, greener fog, birdsong and the odd woodpecker, a few motes in the air.
    const k = this.area.depth(P.pos.x, P.pos.z);
    this.fog(k);
    this.ambT -= dt;
    if (k > 0.4 && this.ambT <= 0) { this.ambT = 14 + Math.random() * 22; if (Math.random() < 0.6) wsfx.peck(0.5 * k); else if (this.owl.awake < 0.2) wsfx.hoo(0.35 * k); }
    this.moteT -= dt;
    if (k > 0.5 && this.moteT <= 0) {
      this.moteT = 0.35;
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
      this.actions.glow.spawn({ pos: P.pos.clone().add(V(Math.cos(a) * r, 0.4 + Math.random() * 1.6, Math.sin(a) * r)), vel: V(Math.random() * 0.2 - 0.1, 0.08, Math.random() * 0.2 - 0.1), life: 3.5, size: 0.018, drag: 0.3, color: 0xf6efb0 });
    }
  }

  /** Thicker fog in the wood (k: how far in). Whatever the fog is outside (weather…) is what it goes back to. */
  fog(k) {
    const fog = this.scene.fog;
    if (!fog) return;
    if (k <= 0.001) {
      if (this.fogK > 0.001 && this.fogBase) { fog.near = this.fogBase.near; fog.far = this.fogBase.far; fog.color.copy(this.fogBase.color); }
      this.fogK = 0;
      this.fogBase = { near: fog.near, far: fog.far, color: fog.color.clone() };
      return;
    }
    if (Math.abs(k - this.fogK) < 0.003 || !this.fogBase) return;
    this.fogK = k;
    const b = this.fogBase, e = k * k * (3 - 2 * k);
    fog.near = b.near + (13 - b.near) * e;
    fog.far = b.far + (68 - b.far) * e;
    fog.color.copy(b.color).lerp(WOODS_FOG, e * 0.7);
  }

  /** Carrying a big stick: the compass points to the den. */
  target() { return this.sticks.holding && flat(this.player.pos, this.denPos) > DEN_REACH ? { pos: this.denPos, label: '🏕️' } : null; }

  get hint() {
    if (this.sticks.hint) return this.sticks.hint;
    if (this.sticks.holding && flat(this.player.pos, this.denPos) < 25) return DEN.hint;
    return null;
  }
}
