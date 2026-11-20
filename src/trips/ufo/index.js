import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { blobGeometry } from '../../world/props.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../../game/progress.js';
import { COSMETICS } from '../../game/cosmetics.js';
import { TripChapter } from '../kit.js';
import { buildPlanet, PLAN, GRAV } from './build.js';
import { Alien } from './aliens.js';

/*
 * 🛸 Planet Boing: beamed up from the crop circle over the Farm by Zib's flying saucer (they were after a sheep).
 *   ✨ The saucer's out of fizz: five star-sparks have fallen about the planet (in a crater, up a rock stack, high over
 *      a bouncy mushroom, on top of the saucer itself…). Find them all and it can fly you home. Next time it's ready
 *      whenever you are, and five new ones have fallen: how fast can you find them? (Your best time is kept.)
 *   🌙 Low gravity: every jump goes three times as high, and 🍄 the mushrooms boing you right up.
 *   👽 Three Blip kids are playing hide-and-seek. They giggle when you're close: find them and woof!
 *   🏐 Zob's moon-ball: bop it with your nose and keep it up (it floats down so slowly). Your best is kept.
 * The way home: up the saucer's ramp, and back down the beam into the crop circle.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NEED = 5;
const BEST_KEY = 'merry.trips.v1';
const bests = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; } catch { return {}; } };
const keepBest = (k, n, lower = false) => {
  try {
    const s = bests(), old = s[k];
    if (old === undefined || (lower ? n < old : n > old)) { localStorage.setItem(BEST_KEY, JSON.stringify({ ...s, [k]: n })); return true; }
  } catch { /* private mode */ }
  return false;
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const BALL_R = 0.32, BALL_G = 12 * GRAV * 0.75; // (the moon-ball floats down slower still)

const LINES = {
  first: ['Oh! You’re not a sheep!', 'We wanted a sheep. Never mind! Welcome to Planet Boing!', 'Uh-oh… the saucer’s out of fizz! Find five ✨ star-sparks and we can fly you home.'],
  back: ['You came back! Welcome back to Planet Boing!', 'Five new star-sparks fell from the sky. How fast can you find them?'],
  ready: 'The saucer’s full of fizz: hop up the ramp whenever you want to go home.',
  zib: ['Woof to you too!', 'Is “woof” Earth for “hello”? WOOF!', 'Have you seen any star-sparks? They twinkle!', 'Try the mushrooms. BOING!', 'That little blue planet up there? That’s YOUR home!'],
  three: 'Three! The saucer’s purring!',
  done: 'Fizz-tastic! The saucer’s full! Hop up the ramp when you want to go home.',
  wander: ['A sheep! An actual sheep!', 'Ooh, fluffy! Can I pat it?', 'Say “woof” again! Say it!', 'Is it true Earth has… SAUSAGES?', 'I like your tail. I wish I had a tail.', 'Do all Earth sheep go “woof”?', 'Welcome, fluffy visitor!'],
  copy: ['Wööf! 👽', 'Woof woof! Did I say it right?', 'Bork! Is that how it goes?', 'Wuff!'],
  giggle: ['hee hee!', '*giggle*', 'shhh!', 'hee!'],
  found: ['You found me! Hee hee!', 'Aww, found! You’re good at this!', 'Eek! How did you sniff me out?'],
  zob: ['Bop the moon-ball with your nose! Keep it up!', 'Moon-ball! It floats down sooo slowly.', 'Can you beat your best?'],
};

/** Where star-sparks can turn up (the planet's own coordinates; worked out from the plan: up on things, or over the ground). */
function sparkSpots() {
  const [s0, s1, s2, s3] = PLAN.stacks, [m1, , m3] = PLAN.mushrooms, h0 = PLAN.houses[0], [cA, cB, , , cE, , cG] = PLAN.craters;
  const on = (o, top) => ({ x: o.x, z: o.z, top });
  return [
    { x: cA.x, z: cA.z, up: 0.7, easy: true, name: 'crater' },
    on(s0, s0.base + s0.h), on(s1, s1.base + s1.h), on(s2, s2.base + s2.h), on(s3, s3.base + s3.h),
    { x: 0, z: 0, top: 0.95 + 1.18 + 1.3, name: 'saucer' },
    { x: m1.x, z: m1.z, top: m1.base + m1.y + 4.2, name: 'mushroom' },
    { x: m3.x, z: m3.z, top: m3.base + m3.y + 4.0 },
    on(h0, h0.base + h0.r * 0.82),
    { x: cB.x, z: cB.z, up: 0.7, easy: true },
    { x: cE.x, z: cE.z, up: 0.7, easy: true },
    { x: cG.x, z: cG.z, up: 0.7, easy: true },
    { x: -19.2, z: -26.0, up: 0.7, easy: true },
    { x: 27.5, z: 17.0, up: 0.7, easy: true },
  ];
}
// Where the Blip kids hide (tucked behind crystals, houses and stacks, or down in a crater).
const HIDES = [[-22.4, -25.8], [-29.6, 3.6], [-15.4, 9.4], [10.4, 16.0], [29.8, 14.6], [19.9, 24.7], [22, 11.2], [-26.8, 22.2], [-6.6, 27.9], [16.6, -28.6]];
const KIDS = [{ color: 0x9fe08a, glow: 0xfff17a, voice: 1.7 }, { color: 0xf7a8c8, glow: 0x9ff0f0, voice: 1.9 }, { color: 0x9cc8f5, glow: 0xffb0d0, voice: 1.8 }];

export function build(ctx) {
  const built = buildPlanet(ctx.origin);
  const { scene, world, sky } = built;
  const { W, R } = world;
  world.spawn = () => { const p = W(0.5, PLAN.ramp.z1 + 1.4); return { x: p.x, z: p.z, face: Math.PI }; }; // (at the foot of the ramp, looking back at the saucer)
  const chapter = new UfoChapter(ctx, { scene, world, built });
  const r = PLAN.ramp;
  world.exits = [{
    id: 'farm', rect: R(-0.75, r.z0, 0.75, r.z0 + 0.65), open: () => chapter.ready, text: '🐾 Fly home!', paw: 'fly', style: 'beam',
    onTake: () => chapter.flyHome(),
  }];
  world.update = (t) => chapter.animate(t);
  world.dispose = () => {};
  return {
    scene, world, chapter, sky,
    // Pink dusk and lilac shadows, a floaty dreamy tune, no birds.
    look: { fog: 0xd8bfe4, near: 34, far: 110, background: 0x8f7ccb, light: [1.02, 0.96, 1.04], shadow: [0.9, 0.86, 1.08], skyFill: 0.14, saturation: 1.04, music: 'space', ambient: {} },
  };
}

class UfoChapter extends TripChapter {
  constructor(ctx, { scene, world, built }) {
    super(ctx, { scene, world });
    Object.assign(this, { W: world.W, dyn: built.dyn, saucer: built.saucer, dome: built.dome });
    this.name = () => ctx.town.dogName();
    this.saved = ctx.town.state;
    this.ready = !!this.saved.fixed;
    this.player.gravity = GRAV;
    this.ground = (x, z) => world.heightAt(x, z);
    this.later = [];
    this.makeMushrooms();
    this.makeSparks();
    this.makeAliens();
    this.makeBall();
    this.makeRocks();
    this.hunt = { start: 0, best: bests().sparkTime ?? null };
    this.ballBest = bests().bops ?? 0;
    this.objective();
  }

  /** (x, z) in the planet's own coordinates, at ground height (plus `up`). */
  at(x, z, up = 0) { const p = this.W(x, z); p.y = this.ground(p.x, p.z) + up; return p; }

  // ---------- making things ----------

  makeMushrooms() {
    const dot = new THREE.SphereGeometry(1, 12, 8);
    this.mush = PLAN.mushrooms.map((m) => {
      const p = this.W(m.x, m.z), base = this.ground(p.x, p.z);
      m.base = base;
      const g = new THREE.Group();
      g.position.set(m.x, base, m.z);
      this.dyn.add(g);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, m.y + 0.3, 14), paint(0xf3ead8));
      stalk.position.y = (m.y - 0.3) / 2;
      stalk.castShadow = true;
      g.add(stalk);
      const cap = new THREE.Group();
      cap.position.y = m.y - 0.02;
      g.add(cap);
      const top = new THREE.Mesh(new THREE.SphereGeometry(m.r, 30, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint(m.c));
      top.scale.y = 0.5;
      top.castShadow = true;
      const under = new THREE.Mesh(new THREE.CircleGeometry(m.r, 30), paint(0xf6e6cc));
      under.rotation.x = Math.PI / 2;
      cap.add(top, under);
      for (let k = 0; k < 7; k++) {
        const a = k * 2.3 + m.x, phi = 0.35 + (k % 3) * 0.32;
        const s = new THREE.Mesh(dot, paint(0xfffaf0));
        s.position.set(Math.sin(phi) * Math.cos(a) * m.r * 0.98, Math.cos(phi) * m.r * 0.5, Math.sin(phi) * Math.sin(a) * m.r * 0.98);
        s.scale.set(m.r * 0.15, m.r * 0.06, m.r * 0.15);
        s.lookAt(s.position.clone().multiply(V(1, 2.5, 1)).add(V(0, 0.01, 0)));
        s.rotateX(Math.PI / 2);
        cap.add(s);
      }
      this.world.C.circle(m.x, m.z, m.r, base + m.y + m.r * 0.5);
      return { ...m, top: base + m.y + m.r * 0.5, cap, pos: p, squash: 0 };
    });
  }

  makeSparks() {
    const spots = sparkSpots();
    let pickd;
    if (!this.saved.fixed) pickd = [spots[0], spots.find((s) => s.name === 'saucer'), spots.find((s) => s.name === 'mushroom'), spots[1], spots[9]]; // (a gentle first lot)
    else {
      const easy = spots.filter((s) => s.easy).sort(() => Math.random() - 0.5), hard = spots.filter((s) => !s.easy).sort(() => Math.random() - 0.5);
      pickd = [...easy.slice(0, 2), ...hard.slice(0, 3)];
    }
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.12 : 0.28, x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 });
    geo.center();
    const mat = paint(0xffd75e, { emissive: 0x8a6a18 });
    this.sparks = pickd.map((s, i) => {
      const m = new THREE.Mesh(geo, mat);
      const p = this.W(s.x, s.z);
      p.y = s.top !== undefined ? s.top + 0.65 : this.ground(p.x, p.z) + (s.up ?? 0.7);
      m.position.copy(p);
      m.castShadow = true;
      this.scene.add(m);
      return { mesh: m, pos: p, got: false, t: i * 1.3, glowT: Math.random() * 0.2 };
    });
    this.got = 0;
  }

  makeAliens() {
    const A = (o, x, z) => { const a = new Alien(o); a.pos.copy(this.at(x, z)); this.scene.add(a.root); return a; };
    this.zib = A({ color: 0xb59ae0, belly: 0xe6dcf6, size: 1.15, eyes: 1, cap: 0x4aa3a0, glow: 0xffb0d0, voice: 1 }, PLAN.zib.x, PLAN.zib.z);
    this.zib.heading = -2.3;
    this.zob = A({ color: 0xf6a85a, belly: 0xfde2c0, size: 1.0, eyes: 2, glow: 0x9ff0f0, voice: 0.85 }, PLAN.zob.x, PLAN.zob.z);
    this.zob.heading = Math.atan2(PLAN.arena.x - PLAN.zob.x, PLAN.arena.z - PLAN.zob.z);
    // Some Blips about the place, hopping from here to there.
    this.wanderers = [[0x8fe0c8, 2, 0xfff17a], [0xf4dc7a, 1, 0xffb0d0], [0xc8b0f0, 2, 0x9ff0f0]].map(([color, eyes, glow], i) => {
      const a = A({ color, eyes, glow, size: 0.85, voice: 1.2 + i * 0.12 }, -6 + i * 6, 12 - i * 3);
      a.wait = 1 + Math.random() * 3;
      a.chatT = 0;
      return a;
    });
    // The Blip kids, hiding (somewhere different each time).
    const spots = HIDES.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    this.kids = KIDS.map((k, i) => {
      const [x, z] = spots[i], a = A({ ...k, size: 0.6, eyes: i === 1 ? 2 : 1 }, x, z);
      a.heading = Math.atan2(x, z) + Math.PI; // (peeking back towards the saucer)
      a.state = 'hiding';
      a.gigT = 2 + Math.random() * 4;
      a.home = this.at(PLAN.zib.x + [1.4, 2.4, -0.6][i], PLAN.zib.z + [1.6, 0.4, 2.0][i]);
      return a;
    });
    this.found = 0;
  }

  makeBall() {
    const g = new THREE.SphereGeometry(BALL_R, 28, 18), p = g.attributes.position, col = [], c = new THREE.Color();
    const cols = [0xffb0d0, 0x9ff0f0, 0xfff1a0, 0xfffaf0, 0xc6b0ff, 0x9ff0f0];
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 6;
      c.set(Math.abs(p.getY(i)) > BALL_R * 0.92 ? 0xfffaf0 : cols[seg]).toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, paint(0xffffff, { vertexColors: true, emissive: 0x201830 }));
    m.castShadow = true;
    this.scene.add(m);
    const rest = this.at(PLAN.arena.x, PLAN.arena.z, 0.34 + BALL_R);
    this.ball = { mesh: m, pos: rest.clone(), vel: V(0, 0, 0), state: 'rest', rest, n: 0, cool: 0, t: 0, center: this.at(PLAN.arena.x, PLAN.arena.z) };
    m.position.copy(rest);
  }

  /** Rocks floating in the sky (it's that sort of planet). */
  makeRocks() {
    this.rocks = [[-18, 16, -30, 1.6], [26, 19, -12, 1.2], [-30, 22, 14, 2.0], [14, 15, 30, 1.4], [3, 24, -36, 1.8]].map(([x, y, z, s], i) => {
      const m = new THREE.Mesh(blobGeometry(i + 7, 0.35, 1), paint(i % 2 ? 0xa893c6 : 0x9d86bd));
      m.scale.set(s * 1.3, s * 0.8, s);
      m.position.set(x, y, z);
      this.dyn.add(m);
      return { m, y, t: i * 1.7 };
    });
  }

  // ---------- the goal, what's said ----------

  objective() {
    const n = Math.min(this.got, NEED), k = this.found, b = this.ballBest;
    const head = this.ready && this.saved.fixed && n >= NEED ? 'Planet Boing! All five star-sparks found!' : `Planet Boing! ✨ Star-sparks: <b>${n}/${NEED}</b>`;
    const fizz = this.ready ? '🛸 The saucer’s ready: up the ramp to fly home' : '🛸 The saucer needs fizz to fly you home';
    const best = this.saved.fixed && this.hunt.best ? ` · ⏱️ best ${mmss(this.hunt.best)}` : '';
    this.hud.setObjective(head, `${fizz}${best} · 👽 Blip kids found: <b>${k}/3</b> (woof when you find one) · 🏐 Moon-ball best: <b>${b}</b> · 🍄 Mushrooms are bouncy!`, { icon: '🛸', short: `${n}/${NEED}` });
  }

  arrive() {
    const first = !this.saved.visited;
    if (first) {
      this.ctx.town.save({ visited: true });
      progress.stat('trips');
      progress.award(20, 'Planet Boing!');
    }
    this.hud.showToastRaw('🌙', 'Planet Boing! Everything’s floaty here…', 'Jumps go up and up (tap jump again in the air for a huge one). 🍄 Mushrooms are bouncy!', { tip: true });
    const lines = this.saved.fixed ? LINES.back : LINES.first;
    lines.forEach((l, i) => this.later.push([0.8 + i * 3.4, () => this.zibSay(l, 3.3)]));
    if (this.saved.fixed) this.later.push([0.8 + lines.length * 3.4, () => this.zibSay(LINES.ready, 3.4)]);
    this.hunt.start = this.time;
  }

  zibSay(text, dur = 3) { this.say(text, () => this.zib.top(), dur); sfx.blip(this.zib.voice); this.zib.waveT = 1.2; }

  // ---------- 🐾 and woofs ----------

  onRamp() { const r = PLAN.ramp, l = this.local(); return Math.abs(l.x) < 0.8 && l.z > r.z0 && l.z < r.z0 + 0.7; }
  local(p = this.player.pos) { const o = this.W(0, 0); return { x: p.x - o.x, z: p.z - o.z }; }

  hint() {
    if (!this.ready && this.onRamp()) return { text: `⛽ No fizz yet! Find the ✨ star-sparks first (${this.got}/${NEED}).`, paw: 'dig' };
    const b = this.ball, P = this.player.pos;
    if (b.state === 'rest' && Math.hypot(P.x - b.pos.x, P.z - b.pos.z) < 2) return { text: '🏐 Bop the moon-ball with your nose to start!' };
    return null;
  }

  onDig() {
    // Puffs of lilac moon dust (they drift down so slowly).
    const P = this.player, n = this.actions.nose(), y = this.ground(n.x, n.z);
    this.actions.dirt.burst(6, () => ({ pos: V(n.x, y + 0.05, n.z), vel: V(Math.random() - 0.5, 0.6 + Math.random() * 0.8, Math.random() - 0.5), life: 1.6, size: 0.035, gravity: 1.2, drag: 1.2, floor: y + 0.02, color: [0xdccbee, 0xc4aee0, 0xe8dcf6][Math.floor(Math.random() * 3)] }));
    if (Math.random() < 0.3) this.hud.float(pick(['Moon dust! ✨', 'Soft and sparkly!', 'Nothing here but dust…']), this.actions.anchor());
    P.digTimer = Math.max(P.digTimer, 0.3);
    return true;
  }

  goal() {
    const P = this.player.pos, near = (list) => list.reduce((b, p) => (!b || p.distanceToSquared(P) < b.distanceToSquared(P) ? p : b), null);
    const s = near(this.sparks.filter((q) => !q.got).map((q) => q.pos));
    if (s) return s;
    const k = near(this.kids.filter((q) => q.state === 'hiding').map((q) => q.pos));
    if (k) return k;
    return this.ready && !this.saved.fixed ? this.W(0, PLAN.ramp.z0 + 0.4) : null;
  }

  onBark() {
    const P = this.player.pos, d = (a) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
    // A hiding Blip kid close by? Found!
    const kid = this.kids.find((k) => k.state === 'hiding' && d(k) < 4.2);
    if (kid) { this.findKid(kid); return; }
    if (d(this.zib) < 5) { this.zibSay(pick(LINES.zib), 2.6); return; }
    if (d(this.zob) < 5) { this.say(pick(LINES.zob), () => this.zob.top(), 2.4); sfx.blip(this.zob.voice); return; }
    // A Blip close by copies the woof.
    const w = this.wanderers.concat(this.kids.filter((k) => k.state === 'home')).filter((a) => d(a) < 6).sort((a, b) => d(a) - d(b))[0];
    if (w) { this.later.push([0.35, () => { this.say(pick(LINES.copy), () => w.top(), 1.8); sfx.blip(w.voice); w.cheer(0.8); }]); }
  }

  findKid(kid) {
    kid.state = 'home';
    kid.cheer(1.4);
    kid.goTo(kid.home);
    kid.hopLen = 1.6;
    this.found++;
    sfx.found?.();
    sfx.blip(kid.voice);
    this.say(pick(LINES.found), () => kid.top(), 2.6);
    this.actions.sparkle(kid.pos.clone().add(V(0, 0.4, 0)), 12);
    progress.stat('blips');
    progress.award(6, 'Found a Blip kid!');
    if (this.found === 3) {
      progress.award(15, 'Hide-and-seek champion!');
      this.later.push([2.6, () => this.zibSay('You found all three! You’re the best seeker on Planet Boing!', 3.2)]);
    }
    this.objective();
  }

  // ---------- every frame ----------

  tick(dt, { canAct }) {
    if (this.later.length) { for (const l of this.later) l[0] -= dt; for (const l of this.later.filter((q) => q[0] <= 0)) l[1](); this.later = this.later.filter((q) => q[0] > 0); }
    const P = this.player;
    this.tickMushrooms(dt, canAct);
    this.tickSparks(dt, canAct);
    this.tickAliens(dt);
    this.tickBall(dt, canAct);
    // The saucer: its lights chase round (faster once it's full of fizz), the glow underneath pulses.
    this.saucer.lights.rotation.y += dt * (this.ready ? 2.4 : 0.5);
    const g = this.ready ? 1 + Math.sin(this.time * 4) * 0.12 : 0.85;
    this.saucer.glow.scale.setScalar(g);
    if (P.pos.y < this.ground(P.pos.x, P.pos.z) - 2) { P.pos.y = this.ground(P.pos.x, P.pos.z) + 0.5; P.vy = 0; } // (never through the floor)
  }

  tickMushrooms(dt, canAct) {
    const P = this.player;
    for (const m of this.mush) {
      m.squash *= Math.exp(-dt * 6);
      m.cap.scale.set(1 + m.squash * 0.25, 1 - m.squash * 0.45, 1 + m.squash * 0.25);
      if (!canAct || !P.grounded || Math.abs(P.pos.y - m.top) > 0.06) continue;
      if ((P.pos.x - m.pos.x) ** 2 + (P.pos.z - m.pos.z) ** 2 > (m.r + 0.08) ** 2) continue;
      // Boing!
      P.vy = m.v;
      P.grounded = false;
      P.coyote = 0;
      P.airJump = true;
      P.jumpY = P.pos.y;
      P.dog.jump?.();
      m.squash = 1;
      sfx.boing?.();
      buzz(18);
      this.hud.float(pick(['BOING!', 'Boinnng!', 'Wheee!']), this.actions.anchor());
      this.actions.sparkle(P.pos.clone().add(V(0, 0.1, 0)), 8);
    }
  }

  tickSparks(dt, canAct) {
    const P = this.player, me = P.pos.clone().add(V(0, 0.4 * (P.dog.breed.size ?? 1), 0));
    for (const s of this.sparks) {
      if (s.got) continue;
      s.t += dt;
      s.mesh.rotation.y = s.t * 1.8;
      s.mesh.position.y = s.pos.y + Math.sin(s.t * 2.2) * 0.12;
      s.glowT -= dt;
      if (s.glowT <= 0) {
        s.glowT = 0.14;
        this.actions.glow.spawn({ pos: s.mesh.position.clone().add(V(Math.random() * 0.3 - 0.15, Math.random() * 0.3 - 0.15, Math.random() * 0.3 - 0.15)), vel: V(0, 0.35, 0), life: 0.9, size: 0.045, gravity: -0.1, drag: 1, color: Math.random() < 0.5 ? 0xfff2a8 : 0xffffff });
      }
      if (canAct && me.distanceTo(s.mesh.position) < 0.95) this.collect(s);
    }
  }

  collect(s) {
    s.got = true;
    s.mesh.visible = false;
    this.got++;
    sfx.spark?.();
    buzz(15);
    this.actions.sparkle(s.mesh.position.clone(), 18);
    this.hud.float(`✨ ${this.got}/${NEED}`, this.actions.anchor());
    progress.stat('sparks');
    progress.award(this.saved.fixed ? 3 : 4, 'A star-spark!');
    if (this.got === 3 && !this.ready) this.zibSay(LINES.three, 2.6);
    if (this.got >= NEED) this.allFound();
    this.objective();
  }

  allFound() {
    const first = !this.saved.fixed;
    this.ready = true;
    if (first) {
      this.ctx.town.save({ fixed: true, hunts: (this.saved.hunts ?? 0) + 1 });
      this.saved = { ...this.saved, fixed: true };
      const before = progress.stats?.saucer ?? 0;
      progress.stat('saucer');
      progress.award(30, 'The saucer’s full of fizz!');
      this.zibSay(LINES.done, 4);
      for (const k of COSMETICS) if (k.friend === 'saucer' && before < k.jobs && before + 1 >= k.jobs) this.later.push([1.2, () => this.hud.showToastRaw(k.emoji, `New: ${k.name}!`, 'A present from Zib. Wear it from ☰ → My dog → Dress up.')]);
    } else {
      const secs = this.time - this.hunt.start, best = keepBest('sparkTime', Math.round(secs), true);
      this.ctx.town.save({ hunts: (this.saved.hunts ?? 0) + 1 });
      progress.stat('saucer');
      progress.award(10, 'All five star-sparks!');
      if (best) this.hunt.best = Math.round(secs);
      this.hud.showToastRaw('✨', `All five in ${mmss(secs)}!${best ? ' A new best!' : ''}`, best ? 'Zib’s jumping for joy.' : `Your best: ${mmss(this.hunt.best)}.`);
      this.zibSay(best ? 'Whoa! That was SUPER fast!' : 'All five! Brilliant!', 2.8);
    }
    this.zib.cheer(2.5);
    sfx.hooray?.();
  }

  tickAliens(dt) {
    const P = this.player.pos, gr = this.ground, d = (a) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
    this.zib.update(dt, gr, P);
    this.zob.update(dt, gr, this.ball.state === 'play' ? this.ball.pos : P);
    for (const w of this.wanderers) {
      w.wait -= dt;
      w.chatT -= dt;
      if (!w.target && !w.hop && w.wait <= 0) { w.goTo(this.freeSpot()); w.wait = 3 + Math.random() * 5; }
      if (w.target && Math.hypot(w.target.x - w.pos.x, w.target.z - w.pos.z) < 0.3) w.target = null;
      const close = d(w) < 3;
      if (close && w.chatT <= 0) { w.chatT = 18 + Math.random() * 10; w.target = null; this.say(pick(LINES.wander), () => w.top(), 2.6); sfx.blip(w.voice); w.waveT = 1; }
      w.update(dt, gr, close ? P : null);
    }
    for (const k of this.kids) {
      if (k.state === 'hiding') {
        k.gigT -= dt;
        if (k.gigT <= 0 && d(k) < 9) { k.gigT = 4 + Math.random() * 4; this.say(pick(LINES.giggle), () => k.top(0.1), 1.3); sfx.blip(k.voice * 1.2); }
        k.update(dt, gr, null);
        k.body.scale.y *= 0.88; // (crouched down, peeking)
      } else {
        if (k.target && Math.hypot(k.target.x - k.pos.x, k.target.z - k.pos.z) < 0.3) { k.target = null; k.hopLen = 1.1; }
        if (!k.target && Math.random() < dt * 0.25) k.cheer(0.6); // (bouncing about by Zib)
        k.update(dt, gr, P);
      }
    }
  }

  /** Somewhere for a Blip to hop over to: not in anything, not too far out. */
  freeSpot() {
    const col = this.world.colliders, o = this.W(0, 0);
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 18, x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
      if (col.circles.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.8) ** 2) || col.boxes.some((b) => x > b.x0 - 0.8 && x < b.x1 + 0.8 && z > b.z0 - 0.8 && z < b.z1 + 0.8)) continue;
      return V(x, 0, z);
    }
    return null;
  }

  tickBall(dt, canAct) {
    const b = this.ball, P = this.player, size = P.dog.breed.size ?? 1;
    const head = P.pos.clone().add(V(Math.sin(P.heading) * 0.2 * size, 0.5 * size, Math.cos(P.heading) * 0.2 * size));
    b.cool -= dt;
    const touching = canAct && head.distanceTo(b.pos) < BALL_R + 0.42 * size;
    if (b.state === 'rest') {
      b.pos.copy(b.rest);
      b.pos.y += Math.sin(this.time * 2) * 0.04;
      if (touching) { b.state = 'play'; b.n = 0; this.bop(head); this.say('Go go go!', () => this.zob.top(), 1.4); }
    } else if (b.state === 'play') {
      b.vel.y -= BALL_G * dt;
      b.pos.addScaledVector(b.vel, dt);
      // Inside the ring: back it comes off the edge.
      const dx = b.pos.x - b.center.x, dz = b.pos.z - b.center.z, l = Math.hypot(dx, dz), R = PLAN.arena.r - 0.4;
      if (l > R) { b.pos.x = b.center.x + (dx / l) * R; b.pos.z = b.center.z + (dz / l) * R; const dot = (b.vel.x * dx + b.vel.z * dz) / l; if (dot > 0) { b.vel.x -= 2 * dot * dx / l; b.vel.z -= 2 * dot * dz / l; } }
      if (touching && b.cool <= 0 && b.vel.y < 2.2) this.bop(head);
      const floor = this.ground(b.pos.x, b.pos.z) + BALL_R;
      if (b.pos.y <= floor) { b.pos.y = floor; this.ballDown(); }
    } else if (b.state === 'down') {
      b.t += dt;
      b.vel.y -= BALL_G * dt;
      b.vel.x *= Math.exp(-dt * 1.5); b.vel.z *= Math.exp(-dt * 1.5);
      b.pos.addScaledVector(b.vel, dt);
      const floor = this.ground(b.pos.x, b.pos.z) + BALL_R;
      if (b.pos.y <= floor) { b.pos.y = floor; b.vel.y = Math.abs(b.vel.y) > 0.6 ? -b.vel.y * 0.4 : 0; }
      if (b.t > 2.2) { b.state = 'back'; b.t = 0; b.from = b.pos.clone(); }
    } else if (b.state === 'back') {
      // Floats back up onto the plinth.
      b.t += dt;
      const k = Math.min(1, b.t / 1.0), e = k * k * (3 - 2 * k);
      b.pos.lerpVectors(b.from, b.rest, e);
      b.pos.y += Math.sin(k * Math.PI) * 1.2;
      if (k >= 1) { b.state = 'rest'; this.actions.sparkle(b.rest.clone(), 8); }
    }
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.x += b.vel.z * dt * 3;
    b.mesh.rotation.z -= b.vel.x * dt * 3;
  }

  /** Nosed up into the air again: one more! */
  bop(head) {
    const b = this.ball;
    b.n++;
    b.cool = 0.35;
    const a = Math.random() * Math.PI * 2, sp = Math.min(1.7, 0.55 + b.n * 0.06);
    // (A little towards the middle when it's near the edge.)
    const dx = b.center.x - b.pos.x, dz = b.center.z - b.pos.z, l = Math.hypot(dx, dz), pull = Math.min(1, l / PLAN.arena.r);
    b.vel.set(Math.cos(a) * sp * (1 - pull) + (l > 0.01 ? (dx / l) * sp * pull : 0), 4.3 + Math.random() * 0.6, Math.sin(a) * sp * (1 - pull) + (l > 0.01 ? (dz / l) * sp * pull : 0));
    b.pos.y = Math.max(b.pos.y, head.y + BALL_R * 0.5);
    sfx.boink?.();
    this.hud.float(`${b.n}!`, b.pos.clone().add(V(0, 0.5, 0)));
    if (b.n % 5 === 0) { this.say(pick(['Woohoo!', `${b.n}! Amazing!`, 'Keep it up!', 'Wow!']), () => this.zob.top(), 1.4); this.zob.cheer(1); }
  }

  ballDown() {
    const b = this.ball, n = b.n;
    b.state = 'down';
    b.t = 0;
    b.vel.y = 1.4;
    sfx.bonk?.();
    const best = n > this.ballBest;
    if (best) { this.ballBest = n; keepBest('bops', n); }
    if (n >= 3) progress.award(Math.min(30, n * 2), `Moon-ball: ${n} bops!`);
    if (best && n >= 3) {
      this.hud.showToastRaw('🏐', `Moon-ball: ${n} in a row! A new best!`, 'Zob’s doing a happy dance.');
      this.zob.cheer(2.5);
      progress.stat('bops');
    }
    this.say(n >= 3 ? (best ? `${n}! A new record!` : `${n}! Nice one!`) : pick(['Oops! Again?', 'Aww! Have another go!']), () => this.zob.top(), 2);
    this.objective();
  }

  /** Every frame (the world's own bits): stars twinkle, rocks drift. */
  animate(t) {
    this.dome.material.uniforms.uTime.value = t;
    for (const r of this.rocks) r.m.position.y = r.y + Math.sin(t * 0.4 + r.t) * 0.6;
  }

  flyHome() {
    this.hud.showToastRaw('🛸', 'Home again!', 'Zib waves goodbye. (The saucer’s always over the Farm’s field.)');
  }

  dispose() {
    this.player.gravity = 1;
    super.dispose();
  }
}
