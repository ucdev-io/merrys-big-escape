import * as THREE from 'three';
import { mergeRigid } from '../../world/merge.js';
import { paint } from '../../render/watercolorMaterial.js';
import { Person } from '../../entities/person.js';
import { Dog } from '../../entities/dog.js';
import { BREEDS, BREED_KEYS } from '../../entities/breeds.js';
import { Lookout } from '../../game/town/heist/lookout.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../../game/progress.js';
import { TripChapter } from '../kit.js';
import { buildPound, Y, penX } from './build.js';

/*
 * 🏠 Sunny Paws, the rescue centre, after Doug the dog warden's net. A kind place, but home's better: a sneaky
 * great escape.
 *   • Doug's at his desk with his back to the yard (🎵), then he glances round (❗) and looks (👀). Out of your pen
 *     while he's looking and not hidden? "Back to bed, you!" and he pops you back in. No stars lost, ever.
 *   • He never latches the gates properly: nudge yours open while his back's turned.
 *   • His keys are on the stool by his desk. Sneak them away and the other dogs' pens unlock as you pass (each
 *     freed dog runs about the yard, and Doug's busy chasing them instead of you).
 *   • Sniff out the soft earth behind the bushes by the fence, dig, dig, dig… and squeeze through, home to your own
 *     garden gate. Every dog you freed comes too.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const DOUG = { busy: [4.5, 8], warn: 1.5, look: [2.2, 3.2], chase: 5.5 }; // seconds (like the baker: see heistRules.js LOOKOUTS)
const DIGS = 4;
const SEE = 22; // how far Doug can see across the yard (all of it)

const LINES = {
  hello: ['There we are, pup! A nice warm bed. We’ll find your family in the morning.', 'In you pop! Comfy? Lovely. Now, where did I put my forms…'],
  back: ['Oi! Back to bed, you!', 'Ah-ah! Out of your pen? Back you go!', 'Nice try, pup! In you go.', 'How did you get OUT? Back in!'],
  stay: ['Ah-ah! Stay!', 'I can see you, pup!'],
  chase: ['Hey! Who let YOU out?! Come here!', 'Not you too! Come back!', 'Oi! Get back in your pen!'],
  work: ['Hmm, forms, forms, forms…', 'Where’s my pen gone?', 'Ooh, a biscuit!', 'Tea break soon…'],
  tip: ['Psst! New here? Doug never latches the gates properly. Give yours a nudge when his back’s turned!', 'Psst! Wait till he’s doing his forms (🎵), then nudge your gate!'],
  keys: ['The keys! On the stool by his desk! If you get them, you could let us out too…', 'Hide when he turns round (❗)! Bushes, the tunnel, the doghouse…'],
  freed: ['Freedom! Thanks, {name}!', 'Woohoo! Zoomies time!', 'You’re a hero, {name}!', 'Out at LAST! Where’s the way home?'],
  dig: ['The soft earth by the fence! Dig, {name}, dig!', 'Behind the bushes: that’s the way out!'],
};

export function build(ctx) {
  const { scene, world, dyn, sky } = buildPound(ctx.origin);
  const { W, R } = world;
  world.spawn = () => { const p = W(penX(0) + 0.6, 5.0); return { x: p.x, z: p.z, face: Math.PI }; }; // (on your bed in pen 0)
  world.update = (t) => { sky.material.uniforms.uTime.value = t * 0.3; };
  world.dispose = () => {};
  const chapter = new PoundChapter(ctx, { scene, world, dyn });
  const d = Y.dig;
  world.exits = [{ id: 'home', rect: R(d.x - 0.6, d.z - 0.7, d.x + 0.9, d.z + 0.7), open: () => chapter.dug >= DIGS, text: '🐾 Squeeze through, and home!', paw: 'squeeze', onTake: () => chapter.escape() }];
  return { scene, world, chapter, sky, look: { fog: 0xe6e9dc, near: 28, far: 80, music: 'garden', ambient: { birds: 1 } } };
}

class PoundChapter extends TripChapter {
  constructor(ctx, { scene, world, dyn }) {
    super(ctx, { scene, world });
    Object.assign(this, { dyn, W: world.W, R: world.R });
    this.name = () => ctx.town.dogName();
    this.dug = 0;
    this.freed = 0;
    this.caughtT = 0;
    this.saved = ctx.town.state;
    // Doug at his desk.
    const doug = new Person({ shirt: 0x5d8c55, trousers: 0x3a4a3a, cap: { color: 0x3a4a3a, band: 0xf2b134 }, skin: 0xe0b48e, hair: 0x6b4a32 });
    this.scene.add(doug.root);
    const at = this.W(Y.desk.x, Y.desk.z + 0.95);
    this.doug = new Lookout({ hud: this.hud, person: doug, pos: at, faces: { busy: Math.PI, look: 0 }, zone: { x: at.x, z: at.z, r: SEE }, work: 'knead', marks: { door: '💨' }, cls: 'trip' }); // ('trip': shown while the town's own are tucked away)
    this.doug.setState('busy', 5000);
    this.dougLeft = 5;
    // The pens' gates (yours is pen 0) and the dogs in the others.
    this.pens = [];
    const others = BREED_KEYS.filter((k) => k !== ctx.player.breedKey).sort(() => Math.random() - 0.5);
    for (let i = 0; i < Y.PEN.n; i++) {
      const cx = penX(i), hinge = new THREE.Group();
      hinge.position.set(cx - Y.PEN.gate, 0, Y.PEN.z0);
      this.dyn.add(hinge);
      const panel = new THREE.Group();
      panel.position.x = Y.PEN.gate;
      hinge.add(panel);
      const mat = (c) => paint(c);
      for (const y of [0.1, 1.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 * Y.PEN.gate, 0.06, 0.06), mat(0x5c5f66)); b.position.y = y; panel.add(b); }
      for (let k = -3; k <= 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.35, 0.03), mat(0x8c8f93)); b.position.set(k * 0.22, 0.78, 0); panel.add(b); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), mat(i === 0 ? 0x8c8f93 : 0xc9a24a));
      lock.position.set(Y.PEN.gate - 0.08, 0.8, 0.06);
      panel.add(lock);
      mergeRigid(panel); // (bars, rails and lock: one mesh that swings open)
      const colBox = world.C.box(cx - Y.PEN.gate, Y.PEN.z0 - 0.08, cx + Y.PEN.gate, Y.PEN.z0 + 0.08);
      const pen = { i, cx, hinge, open: false, swing: 0, col: colBox, gate: this.W(cx, Y.PEN.z0 - 0.15) };
      if (i > 0) {
        const key = others[i - 1], dog = new Dog(key);
        const p = this.W(cx + 0.7, 5.3);
        dog.root.position.copy(p);
        dog.root.rotation.y = Math.PI;
        this.scene.add(dog.root);
        Object.assign(pen, { dog, key, dogName: BREEDS[key].dogName, state: 'pen', target: null, t: Math.random() * 5, barkT: 3 + Math.random() * 6 });
      }
      this.pens.push(pen);
    }
    this.mine = this.pens[0];
    // The keys, on the stool by the desk.
    this.putKeys();
    // The soft earth's hole (it grows as she digs).
    this.hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), paint(0x3a2a1e));
    this.hole.rotation.x = -Math.PI / 2;
    this.hole.position.copy(this.W(Y.dig.x + 0.15, Y.dig.z)).setY(0.02);
    this.hole.scale.setScalar(0.01);
    this.dyn.parent.add(this.hole);
    this.objective();
    this.hidden = null;
    this.later = []; // ([seconds, what]: something to say in a moment)
  }

  arrive() {
    this.say(pick(LINES.hello), () => this.doug.top(0.4), 3.6);
    this.later.push([3.8, () => this.neighbour(pick(LINES.tip), 4.6)]);
    if (!this.saved.visited) { this.ctx.town.save({ visited: true }); progress.stat('trips'); }
  }

  /** Something said by the dog in the next pen along (or the nearest dog still in a pen). */
  neighbour(text, dur = 3.6) {
    const p = this.pens.find((q) => q.dog && q.state === 'pen') ?? this.pens.find((q) => q.dog);
    if (p) this.say(`🐶 ${text.replace('{name}', this.name())}`, () => p.dog.root.position.clone().add(V(0, 1.0, 0)), dur);
  }

  putKeys() {
    const k = this.W(Y.keys.x, Y.keys.z);
    this.keys = this.actions.carry.add('keys', k.x, k.z, { job: 'pound' });
    this.keys.pos.y = 0.43;
  }

  objective() {
    const n = this.pens.length - 1;
    const step = !this.mine.open ? 'Nudge your gate open when Doug’s back is turned 🎵' : this.dug ? `Dig dig dig! ${Math.min(this.dug, DIGS)}/${DIGS}` : 'Find a way out… sniff about!';
    this.hud.setObjective(`Escape from Sunny Paws! ${step}`, `🔑 Doug’s keys open the other pens · 🐶 Dogs freed: <b>${this.freed}/${n}</b> · 🎵 busy · ❗ about to look · 👀 looking: hide!`, { icon: '🏠', short: `${this.freed}/${n}` });
  }

  // ---------- where she is ----------

  local(p = this.player.pos) { return { x: p.x - this.W(0, 0).x, z: p.z - this.W(0, 0).z }; }
  inPen(p, pen) { const l = this.local(p); return l.z > Y.PEN.z0 && l.z < Y.PEN.z1 && Math.abs(l.x - pen.cx) < Y.PEN.w / 2; }
  hideAt(p = this.player.pos) {
    const l = this.local(p);
    return Y.hides.find((h) => (h.kind === 'rect' ? l.x > h.x0 && l.x < h.x1 && l.z > h.z0 && l.z < h.z1 : (l.x - h.x) ** 2 + (l.z - h.z) ** 2 < h.r * h.r)) ?? null;
  }
  near(p, r) { const P = this.player.pos; return (P.x - p.x) ** 2 + (P.z - p.z) ** 2 < r * r; }

  // ---------- what 🐾 does, where the trail goes ----------

  hint() {
    if (this.caughtT > 0) return null;
    const held = this.actions.carry.held;
    if (!this.mine.open && this.near(this.mine.gate, 1.4)) return { text: '🐾 Nudge the gate open… when Doug isn’t looking!', paw: 'nudge' };
    const digAt = this.W(Y.dig.x + 0.15, Y.dig.z);
    if (this.dug < DIGS && this.near(digAt, 1.2)) return { text: `🐾 Dig under the fence! ${this.dug}/${DIGS}`, paw: 'dig' };
    if (held?.kind === 'keys' && this.unlocking) return { text: '🔑 Unlocking…', paw: 'drop' };
    const c = this.actions.carry.hint(this.actions.nose());
    if (c) return c;
    if (this.hidden) return { text: `🙈 Hidden ${this.hidden.name}!` };
    return null;
  }

  onDig() {
    if (this.caughtT > 0) return true;
    if (!this.mine.open && this.near(this.mine.gate, 1.4)) { this.nudge(); return true; }
    const digAt = this.W(Y.dig.x + 0.15, Y.dig.z);
    if (this.dug < DIGS && this.near(digAt, 1.2)) {
      this.dug++;
      this.actions.dirtBurst(digAt.clone().setY(0.05), 10);
      this.hole.scale.setScalar(0.2 + 0.8 * (this.dug / DIGS));
      if (this.dug >= DIGS) {
        sfx.found?.();
        this.hud.float('A tunnel! 🕳️', this.actions.anchor());
        this.actions.sparkle(digAt.clone().setY(0.4), 16);
      }
      this.objective();
      return true;
    }
    this.hud.float(pick(['Too hard here!', 'Not here… somewhere softer?']), this.actions.anchor());
    return true;
  }

  goal() {
    if (!this.mine.open) return this.mine.gate;
    const held = this.actions.carry.held;
    if (held?.kind === 'keys') { const locked = this.pens.find((p) => p.dog && !p.open); if (locked) return locked.gate; }
    return this.W(Y.dig.x + 0.15, Y.dig.z); // (the soft earth, behind the bushes)
  }

  onBark() {
    if (this.doug.s === 'busy' && Math.random() < 0.5) this.say(pick(['Hmm? Was that a woof?', 'Pipe down, you lot!']), () => this.doug.top(0.4), 1.8);
    for (const p of this.pens) if (p.dog && Math.random() < 0.5) { p.dog.bark(); p.barkT = 1 + Math.random(); }
  }

  /** Her own gate: a nudge opens it (it was never latched), unless Doug's watching. */
  nudge() {
    if (this.doug.watching) { this.say(pick(LINES.stay), () => this.doug.top(0.4), 1.8); this.doug.shout(); return; }
    this.openGate(this.mine);
    sfx.squeak?.();
    if (!this.saved.nudged) { this.ctx.town.save({ nudged: true }); progress.award(5, 'Out of the pen!'); }
    this.later.push([2.2, () => this.neighbour(pick(LINES.keys), 4.4)]);
    this.objective();
  }

  openGate(pen) {
    pen.open = true;
    pen.col.top = -1; // (no longer in the way)
  }
  shutGate(pen) {
    pen.open = false;
    pen.col.top = Infinity;
  }

  // ---------- every frame ----------

  tick(dt, { canAct }) {
    const P = this.player, D = this.doug;
    // Things to say a moment from now.
    if (this.later?.length) { for (const l of this.later) l[0] -= dt; for (const l of this.later.filter((q) => q[0] <= 0)) l[1](); this.later = this.later.filter((q) => q[0] > 0); }
    // Doug: busy → glances round → looks → busy… (chasing a freed dog instead, sometimes).
    this.dougLeft -= dt;
    if (this.dougLeft <= 0) this.nextDoug();
    D.update(dt, this.chasing?.dog.root.position ?? null, P.pos);
    if (D.s === 'busy' && Math.random() < dt * 0.04) this.say(pick(LINES.work), () => D.top(0.4), 2);
    // The gates swing.
    for (const p of this.pens) { p.swing += ((p.open ? 1 : 0) - p.swing) * (1 - Math.exp(-dt * 5)); p.hinge.rotation.y = p.swing * 1.9; }
    // Hidden? Seen?
    this.hidden = this.hideAt();
    if (this.caughtT > 0) {
      this.caughtT -= dt;
      const f = this.fade;
      if (f) f.style.opacity = Math.max(0, Math.min(1, this.caughtT > 0.6 ? (1.2 - this.caughtT) / 0.6 : this.caughtT / 0.6)).toFixed(2);
      if (this.caughtT <= 0.6 && !this.reset) this.backToBed();
      if (this.caughtT <= 0) { f?.remove(); this.fade = null; P.frozen = false; }
    } else if (D.watching && canAct && !this.hidden && !this.inPen(P.pos, this.mine) && D.inZone(P.pos)) this.caught();
    // Keys in her mouth unlock pens as she passes their gates.
    const held = this.actions.carry.held;
    this.unlocking = null;
    if (held?.kind === 'keys') {
      const pen = this.pens.find((p) => p.dog && !p.open && this.near(p.gate, 1.3));
      if (pen) { this.unlocking = pen; pen.unlockT = (pen.unlockT ?? 0) + dt; if (pen.unlockT > 0.6) this.free(pen); }
    }
    this.tickDogs(dt);
  }

  nextDoug() {
    const D = this.doug, s = D.s, r = (a) => a[0] + Math.random() * (a[1] - a[0]);
    this.chasing = null;
    if (s === 'busy') { D.setState('warn', DOUG.warn * 1000); this.dougLeft = DOUG.warn; return; }
    if (s === 'warn') {
      // A freed dog dashing about? He's off after that one instead.
      const out = this.pens.filter((p) => p.state === 'free' && !this.hideAt(p.dog.root.position));
      if (out.length && Math.random() < 0.7) {
        this.chasing = pick(out);
        D.setState('door', DOUG.chase * 1000);
        this.dougLeft = DOUG.chase;
        this.say(pick(LINES.chase), () => D.top(0.4), 2.4);
        return;
      }
      const t = r(DOUG.look);
      D.setState('look', t * 1000);
      this.dougLeft = t;
      return;
    }
    const t = r(DOUG.busy);
    D.setState('busy', t * 1000);
    this.dougLeft = t;
  }

  /** Spotted! Back to bed (and the keys back on the stool). */
  caught() {
    const P = this.player;
    P.frozen = true;
    P.vel.set(0, 0);
    this.doug.shout();
    this.say(pick(LINES.back), () => this.doug.top(0.4), 2.2);
    (sfx.whistle ?? sfx.boink)?.();
    buzz([20, 30, 20]);
    this.caughtT = 1.8;
    this.reset = false;
    this.fade = document.createElement('div');
    this.fade.className = 'travel-fade';
    this.hud.root.prepend(this.fade);
    this.caughtN = (this.caughtN ?? 0) + 1;
  }

  backToBed() {
    this.reset = true;
    const P = this.player, s = this.world.spawn();
    const carry = this.actions.carry;
    if (carry.held?.kind === 'keys' || (this.keys && carry.items.includes(this.keys) && !this.near(this.W(Y.keys.x, Y.keys.z), 0.01))) {
      if (carry.held === this.keys) carry.consume(); else carry.remove(this.keys);
      this.keys.obj.traverse((o) => o.geometry?.dispose());
      this.putKeys();
    }
    P.pos.set(s.x, 0, s.z);
    P.heading = s.face;
    P.object.rotation.y = s.face;
    this.ctx.follow.snap(P.pos);
    this.shutGate(this.mine); // (not latched, of course: he never does)
    this.doug.setState('busy', 4000);
    this.dougLeft = 4;
    this.objective();
    if (this.caughtN === 2) this.later.push([1.5, () => this.neighbour('Hide when he turns round! Look for the ❗ over his head.', 4)]);
  }

  /** Unlocked: out they come. */
  free(pen) {
    this.openGate(pen);
    pen.state = 'free';
    pen.t = 0;
    this.freed++;
    sfx.found?.();
    progress.stat('freed');
    progress.award(8, `${pen.dogName} is free!`);
    this.say(`🐶 ${pick(LINES.freed).replace('{name}', this.name())}`, () => pen.dog.root.position.clone().add(V(0, 1.0, 0)), 2.6);
    pen.dog.bark();
    this.objective();
    if (this.freed === this.pens.length - 1) this.later.push([2.8, () => this.neighbour(pick(LINES.dig), 3.6)]);
  }

  tickDogs(dt) {
    const yard = { x0: -9.5, x1: 9.5, z0: -7.5, z1: 1.8 };
    for (const p of this.pens) {
      if (!p.dog) continue;
      const d = p.dog, pos = d.root.position;
      p.t += dt;
      p.barkT -= dt;
      let speed = 0;
      if (p.state === 'pen') {
        // Pottering about in the pen: watching the yard, the odd woof.
        if (p.barkT <= 0) { p.barkT = 5 + Math.random() * 8; if (Math.random() < 0.5) d.bark(); }
      } else if (p.state === 'free') {
        // Out of the pen first, then dashing about the yard (now and then a sit, a roll).
        if (!p.target || pos.distanceTo(p.target) < 0.6 || p.t > 6) {
          p.t = 0;
          const l = this.local(pos);
          p.target = l.z > Y.PEN.z0 - 0.5 ? this.W(p.cx, 1.0) : this.W(yard.x0 + Math.random() * (yard.x1 - yard.x0), yard.z0 + Math.random() * (yard.z1 - yard.z0));
          if (Math.random() < 0.15) d.emote?.(pick(['roll', 'spin', 'bow']));
        }
        const dx = p.target.x - pos.x, dz = p.target.z - pos.z, l = Math.hypot(dx, dz);
        speed = this.chasing === p ? 4.2 : 2.6;
        if (l > 0.1) {
          const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - d.root.rotation.y), Math.cos(want - d.root.rotation.y));
          d.root.rotation.y += turn * (1 - Math.exp(-dt * 6));
          pos.x += Math.sin(d.root.rotation.y) * speed * dt;
          pos.z += Math.cos(d.root.rotation.y) * speed * dt;
          this.world.colliders.resolve(pos, 0.3, 0.3);
        }
      }
      d.update(dt, { speed, turnRate: 0, sniff: false, dig: false, happy: p.state === 'free' ? 1 : 0.6 });
    }
  }

  /** Through the tunnel: home! (Every dog she freed comes too.) */
  escape() {
    const first = !this.saved.escaped;
    this.ctx.town.save({ escaped: (this.saved.escaped ?? 0) + 1 });
    progress.stat('escapes');
    progress.award(first ? 40 : 15, 'The great escape!');
    if (this.freed) progress.award(5 * this.freed, `${this.freed} friend${this.freed > 1 ? 's' : ''} escaped too!`);
    this.hud.showToastRaw('🏠', this.freed ? `The great escape! ${this.freed + 1} dogs dug their way out!` : 'The great escape! Home again!', 'Back to your own garden gate.');
  }

  dispose() {
    this.fade?.remove();
    this.doug.mark.remove(); // (his sign; he goes with the rest of the scene)
    const it = this.actions.carry.consume();
    it?.obj.traverse((o) => o.geometry?.dispose());
    super.dispose();
  }
}
