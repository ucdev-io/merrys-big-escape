import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../../game/progress.js';
import { COSMETICS } from '../../game/cosmetics.js';
import { waterAt } from '../../world/water.js';
import { TripChapter } from '../kit.js';
import { buildSewer, S } from './build.js';

/*
 * 🕳️ The sewers: down the alley's drain (and, once the sluice is open, the beach's outfall pipe too).
 *   🐀 Nibbles the rat keeps the Lost Property: three things a visit have fallen down the drains. Sniff them out
 *      (one or two are buried in the silt) and bring them back.
 *   🦆 Rubber ducks come bobbing out of the pipe at the west end and float off down the channel: fish them out and
 *      pop them in the bucket. (Your best is kept.)
 *   🎡 The big sluice wheel at the west end: keep pressing 🐾 to turn it, and the outfall's grille lifts. From then
 *      on it's a shortcut, alley ↔ beach, both ways (saved with the town).
 *   👃 Smells. Whiffy ones.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const CURRENT = 0.75; // m/s, east along the channel
const BEST_KEY = 'merry.trips.v1';
const best = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY))?.ducks ?? 0; } catch { return 0; } };
const keepBest = (n) => { try { const s = JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; if (n > (s.ducks ?? 0)) localStorage.setItem(BEST_KEY, JSON.stringify({ ...s, ducks: n })); } catch { /* private mode */ } };

// Lost things (from what a dog can carry) and where they might be (the trip's own coordinates; b: buried in silt).
const LOST = ['sock', 'teddy', 'ball', 'frisbee', 'slipper', 'squeaky', 'newspaper'];
const SPOTS = [
  [-20, 3.1], [-12.5, -3.2], [9, 3.3], [22, -3.2], [25.5, 3.2], [-25, -3.0], [-5.6, 5.6, 1], [5.6, -5.6], [-1.1, 14.5, 1], [1.2, 18.6],
  [-1.6, -9.6, 1], [5.8, 5.4], [13, -2.6, 1], [-15.5, 2.6, 1], [27.5, -2.8],
];
const SMELLS = [
  { x: -8.5, z: -3.3, e: '🧀', n: 'An ancient cheese sandwich', line: 'A cheese sandwich… from LAST YEAR. Magnificent.' },
  { x: 19.5, z: 3.4, e: '🍌', n: 'A banana skin', line: 'Banana skin. Extra squishy. Extra slippy!' },
  { x: 0.9, z: 10, e: '🧼', n: 'Bubble bath!', line: 'Bubble bath! Somebody upstairs had a lovely bath.' },
  { x: -1.8, z: -12.5, e: '🍕', n: 'A pizza crust', line: 'A pizza crust. Is this Nibbles’ secret stash?' },
  { x: -23, z: -3.4, e: '🐸', n: 'Frog was here', line: 'A frog was here. A frog with VERY wet feet.' },
];

export function build(ctx) {
  const { scene, world, dyn } = buildSewer(ctx.origin);
  const { W, R } = world;
  world.spawn = (from) => {
    if (from === 'beach') { const p = W(S.L - 3, 2.8); return { x: p.x, z: p.z, face: -Math.PI / 2 }; }
    const p = W(0, S.NORTH - 1.6); return { x: p.x, z: p.z, face: Math.PI }; // (at the foot of the ladder)
  };
  const state = ctx.town.state;
  world.exits = [
    { id: 'alley', rect: R(-1.1, S.NORTH - 1.4, 1.1, S.NORTH), open: () => true, text: '🐾 Climb back up to the alley!', paw: 'squeeze' },
    { id: 'beach', rect: R(S.L - 2.2, -S.WALK, S.L, S.WALK), open: () => !!chapter.open, text: '🐾 Out the pipe to the beach!', paw: 'squeeze' },
  ];
  world.update = (t) => world.animate?.(t); // (glints on the water, dust in the daylight)
  world.dispose = () => {};
  const chapter = new SewerChapter(ctx, { scene, world, dyn, state });
  return {
    scene, world, chapter,
    // Teal and murky, with warm lanterns (and a drippy, bouncy tune).
    look: { fog: 0x8aa69e, near: 12, far: 44, background: 0x5d6e66, light: [0.92, 0.97, 0.96], shadow: [0.86, 0.95, 1.0], skyFill: 0.08, saturation: 0.95, music: 'sewer', ambient: { drips: 1 } },
  };
}

class SewerChapter extends TripChapter {
  constructor(ctx, { scene, world, dyn, state }) {
    super(ctx, { scene, world });
    Object.assign(this, { dyn, W: world.W });
    this.open = !!state.open;
    this.nibbles = { done: 0, total: 3, met: false, saved: state.nibbles ?? 0 };
    this.ducks = { list: [], spawnT: 1.5, saved: 0, best: best() };
    this.smells = SMELLS.map((s) => ({ ...s, found: false, held: 0 }));
    this.wheel = { turn: this.open ? 1 : 0 };
    this.rat = this.makeNibbles();
    this.makeWheel();
    this.makeOutfall();
    this.makeBucket();
    // Three lost things this visit (somewhere different each time).
    const spots = SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, 3), kinds = LOST.slice().sort(() => Math.random() - 0.5);
    this.lost = spots.map(([x, z, b], i) => { const p = this.W(x, z); return this.actions.carry.add(kinds[i], p.x, p.z, { buried: b ? 2 : 0, job: 'nibbles' }); });
    // 🔦 Nibbles' lantern, if she's wearing it: turned up down here, with a warm pool of light round her.
    this.glow = new THREE.Group(); // (two soft rings of it, brighter in the middle)
    for (const [r, o] of [[1.15, 0.1], [0.6, 0.12]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), paint(0xffe3a0, { transparent: true, opacity: o }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = r < 1 ? 0.002 : 0;
      this.glow.add(m);
    }
    this.glow.visible = false;
    this.scene.add(this.glow);
    this.objective();
  }

  /** Nibbles' lantern: on when she's wearing it (she might dress up down here, too). */
  tickLantern() {
    const P = this.player, lit = progress.look.neck === 'neck-lantern';
    if (lit !== this.lit) { this.lit = lit; P.dog.brightenLantern?.(lit); this.glow.visible = lit; }
    if (!lit) return;
    this.glow.position.set(P.pos.x, Math.max(P.pos.y, 0.08) + 0.012, P.pos.z);
    this.glow.scale.setScalar(1 + Math.sin(this.time * 7.3) * 0.025 + Math.sin(this.time * 3.1) * 0.02); // (a little flicker)
  }

  arrive(from) {
    if (!this.ctx.town.state.visited) {
      this.ctx.town.save({ visited: true });
      progress.stat('trips');
      progress.award(20, 'The sewers!');
      this.hud.showToastRaw('🕳️', 'The sewers! It’s a bit whiffy down here…', 'Wonderful. Somebody’s calling from the tunnel to the south…');
    } else if (from === 'beach') this.hud.showToastRaw('🕳️', 'Back in the sewers!', 'The pipe goes all the way to the alley.');
  }

  objective() {
    const n = this.nibbles, d = this.ducks;
    const lost = n.done < n.total ? `🐀 Nibbles’ lost things: <b>${n.done}/${n.total}</b>` : '🐀 Nibbles has everything back!';
    this.hud.setObjective(`The sewers! ${lost}`, `🦆 Rubber ducks rescued: <b>${d.saved}</b>${d.best ? ` (best ${d.best})` : ''} · ${this.open ? '🏖️ The pipe to the beach is open' : '🎡 A big wheel at the west end…'}`, { icon: '🕳️', short: `${n.done}/${n.total}` });
  }

  // ---------- the things in it ----------

  makeNibbles() {
    const g = new THREE.Group(), n = S.nibbles, p = this.W(n.x, n.z);
    g.position.set(n.x + 0.25, 0.6, n.z);
    g.scale.setScalar(1.45);
    const fur = 0x9a9188, pink = 0xe8a0a0;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), paint(fur));
    body.scale.set(1, 1.15, 0.9); body.position.y = 0.15; body.castShadow = true;
    const vest = new THREE.Mesh(new THREE.SphereGeometry(0.142, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), paint(0x5b86c4, { side: THREE.DoubleSide }));
    vest.scale.copy(body.scale); vest.position.copy(body.position);
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0.03);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), paint(fur));
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 10), paint(fur));
    snout.rotation.x = Math.PI / 2; snout.position.z = 0.1;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), paint(pink));
    nose.position.z = 0.175;
    head.add(skull, snout, nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), paint(pink, { side: THREE.DoubleSide }));
      ear.position.set(s * 0.07, 0.08, -0.01); ear.rotation.y = s * 0.3;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), paint(0x2b2522));
      eye.position.set(s * 0.04, 0.03, 0.075);
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 5, 12), paint(0x4a4038));
      lens.position.set(s * 0.04, 0.03, 0.085); // (little round specs)
      head.add(ear, eye, lens);
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 5, 14, Math.PI * 1.2), paint(pink));
    tail.position.set(0, 0.08, -0.14); tail.rotation.set(Math.PI / 2, 0, 0.6);
    g.add(body, vest, head, tail);
    this.dyn.add(g);
    return { g, head, at: () => V(p.x + 0.25, 1.4, p.z), pos: p };
  }

  makeWheel() {
    const g = new THREE.Group(), w = S.wheel;
    g.position.set(w.x, 0.85, w.z - 0.05);
    const red = paint(0xc8463c);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 22), red));
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.05, 0.05), red); s.rotation.z = (k * Math.PI) / 3; g.add(s); }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), paint(0x8a3029)));
    g.children.forEach((m) => { m.castShadow = true; });
    this.dyn.add(g);
    this.wheel.g = g;
    this.wheel.pos = this.W(w.x, w.z - 1.1);
  }

  makeOutfall() {
    const L = S.L;
    this.daylight = new THREE.Mesh(new THREE.CircleGeometry(1.15, 22), paint(0x2b2a28));
    this.daylight.position.set(L - 0.08, 0.9, 0);
    this.daylight.rotation.y = -Math.PI / 2;
    this.dyn.add(this.daylight);
    const grille = new THREE.Group();
    for (let k = -4; k <= 4; k++) {
      const h = 2 * Math.sqrt(Math.max(0.02, 1.25 ** 2 - (k * 0.27) ** 2));
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), paint(0x5c5f66));
      bar.position.set(0, 0, k * 0.27);
      grille.add(bar);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 2.5), paint(0x4a4d54));
    grille.add(cross);
    grille.position.set(L - 0.2, 0.9, 0);
    this.dyn.add(grille);
    this.grille = grille;
    this.setOpen(this.open, true);
  }

  makeBucket() {
    const b = S.bucket, g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.27, 0.42, 16, 1, true), paint(0x5b86c4, { side: THREE.DoubleSide }));
    pail.position.y = 0.21; pail.castShadow = true;
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), paint(0x4a6fa5));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.02;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 5, 18, Math.PI), paint(0x6b6964));
    handle.position.y = 0.42; handle.rotation.y = 0.4;
    g.add(pail, base, handle);
    this.dyn.add(g);
    this.bucket = this.W(b.x, b.z);
    this.inBucket = []; // (the ducks you've rescued, bobbing in it)
  }

  setOpen(on, quiet = false) {
    this.open = on;
    this.daylight.material = paint(on ? 0xd9ecf0 : 0x2b2a28, on ? { emissive: 0x4a5a5c } : undefined);
    if (quiet) this.grille.position.y = on ? 2.6 : 0.9;
  }

  // ---------- what 🐾 does, where the trail goes ----------

  near(p, r) { const P = this.player.pos; return (P.x - p.x) ** 2 + (P.z - p.z) ** 2 < r * r; }

  hint() {
    if (this.near(this.wheel.pos, 1.5) && !this.open) return { text: '🎡 Turn the big wheel! Keep pressing 🐾!', paw: 'turn' };
    if (!this.open && this.near(this.W(S.L - 1.5, 0), 3.2)) return { text: '🔒 The grille’s down. Something in here must lift it…' };
    const held = this.actions.carry.held;
    if (held?.kind === 'rubberduck' && this.near(this.bucket, 1.6)) return { text: '🦆 Drop the duck in the bucket! 🐾', paw: 'drop' };
    if (held?.job === 'nibbles' && this.near(this.rat.pos, 2.2)) return { text: `🐀 Give Nibbles the ${held.def.name}! 🐾`, paw: 'drop' };
    return this.actions.carry.hint(this.actions.nose());
  }

  onDig() {
    if (this.near(this.wheel.pos, 1.5) && !this.open) { this.turnWheel(); return true; }
    this.hud.float('Too hard to dig! 🧱', this.actions.anchor());
    return true;
  }

  goal() {
    const P = this.player.pos;
    let best = null, bd = Infinity;
    for (const it of this.lost) {
      if (!it || this.actions.carry.held === it || !this.actions.carry.items.includes(it)) continue;
      const d = (it.pos.x - P.x) ** 2 + (it.pos.z - P.z) ** 2;
      if (d < bd) { bd = d; best = it.pos; }
    }
    if (this.actions.carry.held?.job === 'nibbles') return this.rat.pos;
    if (best) return best;
    for (const s of this.smells) {
      if (s.found) continue;
      const p = this.W(s.x, s.z), d = (p.x - P.x) ** 2 + (p.z - P.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  onBark() {
    if (this.near(this.rat.pos, 4)) this.say(pick(['Eek! Indoor voice, please!', 'Bless you!', 'Woof to you too, dear.']), this.rat.at);
    else if (Math.random() < 0.5) this.hud.float('…woof …oof …f', this.actions.anchor().add(V(0, 0.4, 0))); // (echoey!)
  }

  turnWheel() {
    const w = this.wheel;
    w.turn = Math.min(1, w.turn + 0.085);
    sfx.squeak?.();
    buzz(10);
    if (w.turn >= 1) {
      this.setOpen(true);
      this.grilleRise = 0;
      this.ctx.town.save({ open: true });
      sfx.clang?.();
      sfx.hooray?.();
      buzz([30, 40, 30]);
      progress.stat('sluice');
      progress.award(30, 'Sluice open!');
      this.hud.showToastRaw('🎡', 'Clank! The grille at the end is up!', 'The pipe goes all the way to the beach now: a shortcut, both ways!');
      this.actions.sparkle(this.player.pos.clone().add(V(0, 0.8, 0)), 24);
      this.objective();
    } else if (w.turn > 0.5 && w.turn - 0.085 <= 0.5) this.hud.float('Creeeak… nearly!', this.actions.anchor());
  }

  // ---------- every frame ----------

  tick(dt, { canAct }) {
    const P = this.player, t = this.time;
    // The current carries a paddling dog gently east.
    if (P.inWater && P.swim > 0.3 && !P.frozen) P.pos.x += CURRENT * dt;
    // Nibbles: a twitchy nose and a little bob, turning to face the dog.
    const r = this.rat;
    r.g.position.y = 0.6 + Math.abs(Math.sin(t * 2.2)) * 0.02;
    r.head.rotation.x = Math.sin(t * 11) * 0.04;
    const face = Math.atan2(P.pos.x - r.pos.x, P.pos.z - r.pos.z), turn = Math.atan2(Math.sin(face - r.g.rotation.y), Math.cos(face - r.g.rotation.y));
    r.g.rotation.y += turn * (1 - Math.exp(-dt * 3));
    if (canAct && !this.nibbles.met && this.near(r.pos, 5)) this.meet();
    // A lost thing put down by Nibbles' counter: he takes it.
    const carry = this.actions.carry;
    for (const it of this.lost) if (carry.items.includes(it) && !it.buried && (it.pos.x - r.pos.x) ** 2 + (it.pos.z - r.pos.z) ** 2 < 2.3 ** 2) { this.handOver(it); break; }
    // The sluice wheel slowly creeps back if you stop turning.
    const w = this.wheel;
    if (!this.open) w.turn = Math.max(0, w.turn - dt * 0.035);
    w.g.rotation.z += (-w.turn * Math.PI * 6 - w.g.rotation.z) * (1 - Math.exp(-dt * 8));
    if (this.grilleRise !== undefined && this.grilleRise < 1) {
      this.grilleRise = Math.min(1, this.grilleRise + dt / 2.2);
      this.grille.position.y = 0.9 + this.grilleRise * 1.7;
    }
    this.tickDucks(dt);
    this.tickSmells(dt, canAct);
    this.tickLantern();
  }

  meet() {
    this.nibbles.met = true;
    const name = this.ctx.town.dogName();
    const lines = this.nibbles.saved
      ? [`${name}! Back again! More things fell down the drains, of course.`, 'Three of them. Have a sniff about, dear!']
      : [`Ooh, a visitor! I’m Nibbles. I keep the Lost Property.`, `Everything that falls down a drain ends up down here. Today: three things! Could you sniff them out, ${name}?`];
    this.say(lines[0], this.rat.at, 3.4);
    setTimeout(() => { if (this.rat) this.say(lines[1], this.rat.at, 4.2); }, 3200);
  }

  handOver(it) {
    this.actions.carry.remove(it);
    this.lost = this.lost.filter((q) => q !== it);
    const n = this.nibbles;
    n.done++;
    n.saved++;
    this.ctx.town.save({ nibbles: n.saved });
    const before = progress.stats.nibbles ?? 0;
    progress.stat('nibbles');
    const prize = COSMETICS.find((c) => c.friend === 'nibbles' && before < c.jobs && before + 1 >= c.jobs); // (🔦 his spare lantern)
    sfx.found?.();
    buzz([20, 30, 20]);
    this.actions.sparkle(this.rat.at().add(V(0, -0.4, 0)), 18);
    if (n.done < n.total) {
      progress.award(10, `${it.def.emoji} Lost and found!`);
      this.say(pick([`A ${it.def.name}! Lovely. I’ll put it on the shelf.`, `My, my, a ${it.def.name}! Somebody will be pleased.`, `Ooh, the ${it.def.name}! Into the drawer it goes.`]), this.rat.at);
    } else {
      progress.award(25, '🐀 Everything back!');
      sfx.hooray?.();
      this.say(`That’s all three! You’re a marvel. Come again: things are ALWAYS falling down the drains.`, this.rat.at, 4.5);
    }
    if (prize) {
      this.hud.showToastRaw(prize.emoji, `New: ${prize.name}!`, 'A thank-you from Nibbles. It glows, and down here it lights the way! Wear it from ☰ → My dog → Dress up.');
      setTimeout(() => { if (this.rat) this.say('Oh, and take my spare lantern, dear. Ever so handy in a dark tunnel!', this.rat.at, 4.2); }, n.done < n.total ? 2600 : 4600);
    }
    it.obj.traverse((o) => o.geometry?.dispose()); // (handed over: gone)
    this.objective();
  }

  tickDucks(dt) {
    const D = this.ducks, carry = this.actions.carry, water = this.world.water;
    D.spawnT -= dt;
    const floating = D.list.filter((d) => d.state === 'float').length;
    if (D.spawnT <= 0 && floating < 3 && D.list.length < 6) {
      D.spawnT = 5 + Math.random() * 4;
      const p = this.W(-S.L + 0.8, (Math.random() - 0.5) * 1.2);
      const it = carry.add('rubberduck', p.x, p.z);
      it.pos.y = 0.06;
      D.list.push({ it, state: 'float', bob: Math.random() * 6 });
      sfx.plip?.();
    }
    for (const d of D.list) {
      const it = d.it;
      if (carry.held === it) { d.state = 'held'; continue; }
      if (!carry.items.includes(it)) continue;
      const wet = waterAt(water, it.pos.x, it.pos.z);
      if (wet) {
        d.state = 'float';
        d.bob += dt * 2.5;
        it.pos.x += CURRENT * dt;
        it.pos.y = 0.055 + Math.sin(d.bob) * 0.012;
        it.obj.rotation.z = Math.sin(d.bob * 0.7) * 0.15;
        const lz = it.pos.z - this.W(0, 0).z;
        if (Math.abs(lz) > S.CW - 0.25) it.pos.z -= Math.sign(lz) * dt * 0.4; // (bumping along the side)
        if (it.pos.x > this.W(S.L - 0.6, 0).x) { const p = this.W(-S.L + 0.8, (Math.random() - 0.5) * 1.2); it.pos.x = p.x; it.pos.z = p.z; } // (round again)
      } else {
        d.state = 'ground';
        if ((it.pos.x - this.bucket.x) ** 2 + (it.pos.z - this.bucket.z) ** 2 < 0.9 ** 2) this.rescue(d);
      }
    }
    // Rescued ducks bob in the bucket.
    for (const [i, obj] of this.inBucket.entries()) obj.position.y = 0.3 + Math.sin(this.time * 2 + i) * 0.015;
  }

  rescue(d) {
    const D = this.ducks, carry = this.actions.carry;
    carry.remove(d.it);
    D.list = D.list.filter((q) => q !== d);
    D.saved++;
    // Into the bucket it goes (just the first few show: it's only a small bucket).
    if (this.inBucket.length < 5) {
      const obj = d.it.obj, k = this.inBucket.length;
      obj.position.set(this.bucket.x + Math.cos(k * 2.4) * 0.14, 0.3, this.bucket.z + Math.sin(k * 2.4) * 0.14);
      obj.rotation.set(0, k * 1.3, 0);
      this.scene.add(obj);
      this.inBucket.push(obj);
    }
    progress.stat('ducks');
    progress.award(4, '🦆 Rescued!');
    sfx.quack?.();
    this.actions.sparkle(this.bucket.clone().setY(0.6), 10);
    if (D.saved > D.best) {
      if (D.best > 0 && D.saved === D.best + 1) this.hud.showToastRaw('🦆', `A new best: ${D.saved} rubber ducks!`, 'Quack quack hooray!');
      D.best = D.saved;
      keepBest(D.saved);
    }
    this.objective();
  }

  tickSmells(dt, canAct) {
    const sniffing = canAct && this.input.sniff, nose = this.actions.nose();
    for (const s of this.smells) {
      if (s.found) continue;
      const p = this.W(s.x, s.z), d2 = (p.x - nose.x) ** 2 + (p.z - nose.z) ** 2;
      if (Math.random() < dt * 0.8 && d2 < 64) this.actions.smellPuff(p, 0xc8d890);
      s.held = sniffing && d2 < 1.5 ** 2 ? s.held + dt : 0;
      if (s.held > 0.6) {
        s.found = true;
        progress.stat('smells');
        progress.award(5, s.n);
        sfx.sniff();
        sfx.pop?.();
        this.actions.sparkle(p.clone().setY(0.3), 10);
        this.hud.say(`${s.e} ${s.line}`, () => this.actions.anchor().add(V(0, 0.3, 0)), 3.2);
      }
    }
  }

  dispose() {
    // Anything still in her mouth stays down here.
    const it = this.actions.carry.consume();
    it?.obj.traverse((o) => o.geometry?.dispose());
    this.rat = null;
    this.player.dog.brightenLantern?.(false);
    super.dispose();
  }
}
