import { snd } from './sound.js';
import { placeStars, makeStarfield, SIRIUS } from './sky.js';

/*
 * ✦ Dog Star: the game itself (no drawing here: see ./draw.js). Everything's in world units, on a field whose
 * shorter side is FIELD long, so it plays the same on a phone held either way or a big monitor.
 *
 *   🐕 You're a little line-art dog's head, flying about. You fire where you fly (all the time, no button).
 *   ➰ Your tail streams out behind you. Cross it to close a loop, and every shape inside is rounded up whole
 *      (more shapes in one loop: more points each). Triangles and star-bullets bite through it, though.
 *   🔷 Shapes lose a side for each hit, and turn into the shape with one side fewer, behaving like one:
 *        ▲ 3 darts at you  ■ 4 bounces about  ⬟ 5 circles and spits stars  ⬢ 6+ drifts after you, hatching triangles
 *      So shooting a hexagon makes a pentagon (which spits)… Rounding one up whole is worth far more.
 *   ✧ Broken shapes leave stardust: it fills your 🌕 howl, a shockwave that knocks a side off everything near.
 *   ★ Clear a wave and a star of Canis Major lights up behind you. The tenth is Sirius, the Dog Star.
 */
export const FIELD = 560;
const TAU = Math.PI * 2;
export const TAIL_GAP = 10, TAIL_MAX = 80, TAIL_LIFE = 2.2;
const MIN_LOOP = 900; // (smallest loop that counts, in square units: a wiggle isn't a lasso)
export const SHIP_R = 9;
const HIT_R = 6; // (what can hurt you is a little smaller than the ship looks: near misses feel great)
const FIRE_EVERY = 0.11, SHOT_SPEED = 820;
const HOWL_PER_DUST = 1 / 36;

export const COLORS = { 3: '#ff4fa3', 4: '#3fe0ff', 5: '#ffb43f', 6: '#8dff5a', 7: '#b98cff', 8: '#ff7a5a' };
export const colorOf = (sides) => COLORS[Math.min(8, sides)] ?? '#ffffff';
export const radius = (f) => 10 + f.sides * 2.6;
const NAMES = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;

/** A fresh game on a W × H field. demo: the title screen's show (the ship flies itself, rounding up squares). */
export function newGame(W, H, { demo = false, lit = 0 } = {}) {
  return {
    W, H, t: 0, demo, score: 0, lives: 3, wave: 0, lit, howl: 0, shake: 0,
    ship: { x: W / 2, y: H * 0.68, vx: 0, vy: 0, mvx: 0, mvy: -1, a: -Math.PI / 2, inv: demo ? 1e9 : 2, fireT: 0.4, side: 1, dead: false, orbit: 0 },
    tail: [], shots: [], foes: [], bullets: [], dust: [], bits: [], sparks: [], rings: [], loops: [], words: [], comets: [],
    queue: [], spawnT: 0, between: demo ? 0.5 : 1.4, over: false, overT: 0, caughtMost: 0,
    sky: makeStarfield(W, H), stars: placeStars(W, H),
    events: [], // what happened this step, for the screen around the game: { type: 'wave' | 'lit' | 'dogstar' | 'ready' | 'over' }
  };
}

/** The screen changed size (a phone turned round): everything keeps its place, stretched to the new field. */
export function refit(G, W, H) {
  const kx = W / G.W, ky = H / G.H;
  if (Math.abs(kx - 1) < 1e-3 && Math.abs(ky - 1) < 1e-3) return;
  for (const list of [[G.ship], G.tail, G.shots, G.foes, G.bullets, G.dust, G.bits, G.sparks, G.rings, G.words]) for (const o of list) { o.x *= kx; o.y *= ky; }
  for (const L of G.loops) for (const p of L.pts) { p.x *= kx; p.y *= ky; }
  G.comets.length = 0;
  Object.assign(G, { W, H, sky: makeStarfield(W, H), stars: placeStars(W, H) });
}

/**
 * One step. ctl: { kx, ky } keys (−1…1), target { x, y } (the mouse: fly towards it), drag { x, y } (a finger's move
 * since the last step: the ship moves with it), howl (pressed).
 */
export function update(G, dt, ctl) {
  G.t += dt;
  G.events.length = 0;
  G.shake = Math.max(0, G.shake - dt * 40);
  if (G.demo) ctl = pilot(G, dt);
  moveShip(G, dt, ctl);
  growTail(G);
  if (!G.demo) fire(G, dt);
  waves(G, dt);
  foes(G, dt);
  shots(G, dt);
  bullets(G, dt);
  stardust(G, dt);
  if (!G.demo) hurtCheck(G);
  if (ctl.howl && G.howl >= 1 && !G.ship.dead) howl(G);
  effects(G, dt);
  if (G.lives <= 0 && !G.over) {
    G.overT -= dt;
    if (G.overT <= 0) { G.over = true; G.events.push({ type: 'over' }); snd.over(); }
  }
}

// ---------------------------------------------------------------------------------------------
// 🐕 The ship (a dog's head) and its tail.

function moveShip(G, dt, ctl) {
  const s = G.ship;
  if (s.dead) return;
  s.inv = Math.max(0, s.inv - dt);
  const px = s.x, py = s.y, drag = ctl.drag;
  if (drag && (drag.x || drag.y)) { // a finger: move as it moves (it never covers the ship)
    s.x += drag.x; s.y += drag.y;
  } else {
    let tvx = 0, tvy = 0, grip = 6;
    if (ctl.kx || ctl.ky) { const l = Math.hypot(ctl.kx, ctl.ky); tvx = (ctl.kx / l) * 400; tvy = (ctl.ky / l) * 400; grip = 12; }
    else if (ctl.target) {
      const dx = ctl.target.x - s.x, dy = ctl.target.y - s.y, d = Math.hypot(dx, dy);
      if (d > 3) { const sp = Math.min(620, d * 9); tvx = (dx / d) * sp; tvy = (dy / d) * sp; grip = 16; }
    }
    s.vx += (tvx - s.vx) * Math.min(1, dt * grip);
    s.vy += (tvy - s.vy) * Math.min(1, dt * grip);
    s.x += s.vx * dt; s.y += s.vy * dt;
  }
  s.x = clamp(s.x, 12, G.W - 12);
  s.y = clamp(s.y, 12, G.H - 12);
  // How it actually moved (fingers, walls and all): the way it faces, and so the way it fires.
  const vx = (s.x - px) / Math.max(dt, 1e-4), vy = (s.y - py) / Math.max(dt, 1e-4);
  if (drag && (drag.x || drag.y)) { s.vx = vx; s.vy = vy; }
  s.mvx += (vx - s.mvx) * Math.min(1, dt * 14);
  s.mvy += (vy - s.mvy) * Math.min(1, dt * 14);
  if (Math.hypot(s.mvx, s.mvy) > 40) {
    const da = wrapAngle(Math.atan2(s.mvy, s.mvx) - s.a), turn = 16 * dt;
    s.a += clamp(da, -turn, turn);
  }
}

/** The title screen's pilot: circle round the nearest square until the loop closes on it. */
function pilot(G, dt) {
  const s = G.ship;
  let best = null, bd = Infinity;
  for (const f of G.foes) {
    if (f.warp > 0 || f.caught) continue;
    const d = Math.hypot(f.x - s.x, f.y - s.y);
    if (d < bd) { bd = d; best = f; }
  }
  s.orbit += dt * 3.6;
  const cx = best ? best.x + best.vx * 0.6 : G.W / 2, cy = best ? best.y + best.vy * 0.6 : G.H / 2, r = best ? 80 : Math.min(G.W, G.H) * 0.28;
  return { kx: 0, ky: 0, target: { x: cx + Math.cos(s.orbit) * r, y: cy + Math.sin(s.orbit) * r }, drag: null, howl: false };
}

function growTail(G) {
  const s = G.ship, T = G.tail;
  while (T.length && G.t - T[0].t > TAIL_LIFE) T.shift();
  if (s.dead) return;
  const last = T[T.length - 1];
  if (last && Math.hypot(s.x - last.x, s.y - last.y) < TAIL_GAP) return;
  const p = { x: s.x, y: s.y, t: G.t };
  const loop = T.length >= 3 ? closedLoop(T, p) : null;
  if (loop) { lasso(G, loop); T.length = 0; }
  T.push(p);
  if (T.length > TAIL_MAX) T.shift();
}

/** Does the newest bit of tail (last point → p) cross an older bit? The newest crossing makes the smallest loop. */
function closedLoop(T, p) {
  const a = T[T.length - 1];
  for (let i = T.length - 3; i >= 0; i--) {
    const x = crossAt(a, p, T[i], T[i + 1]);
    if (!x) continue;
    const pts = [x, ...T.slice(i + 1)];
    if (Math.abs(area(pts)) >= MIN_LOOP) return pts;
  }
  return null;
}

function crossAt(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return a / 2;
}

function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function nearEdge(pts, x, y, r) {
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (distToSeg(x, y, pts[j], pts[i]) < r) return true;
  return false;
}

/** ➰ A loop closed: round up every shape inside it (and pop any star-bullets, and scoop up the stardust). */
function lasso(G, pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const caught = G.foes.filter((f) => f.warp <= 0 && !f.caught && (inside(pts, f.x, f.y) || nearEdge(pts, f.x, f.y, radius(f) * 0.6))); // (a shape the loop's line went through counts too)
  for (const b of G.bullets) if (inside(pts, b.x, b.y)) { b.life = 0; burst(G, b.x, b.y, '#ffb43f', 5, 80); }
  for (const d of G.dust) if (inside(pts, d.x, d.y)) d.pull = true;
  G.loops.push({ pts, x: cx, y: cy, life: 0.7, max: 0.7, color: caught.length ? '#ffd36b' : '#7f8cff' });
  if (!caught.length) { snd.emptyLoop(); return; }
  let base = 0;
  for (const f of caught) { base += f.sides * 20; f.caught = { t: 0, x0: f.x, y0: f.y, cx, cy }; }
  const n = caught.length, pts2 = base * n;
  if (!G.demo) G.score += pts2;
  G.caughtMost = Math.max(G.caughtMost, n);
  G.howl = Math.min(1, G.howl + 0.07 * n);
  G.shake = Math.min(16, G.shake + 3 + n * 2);
  const words = n === 1 ? `Rounded up a ${NAMES[caught[0].sides] ?? 'shape'}!` : n === 2 ? 'Double round-up!' : n === 3 ? 'Triple round-up!' : n < 6 ? `Round-up ×${n}! Good dog!` : `×${n}!! WHO’S A GOOD DOG?`;
  say(G, cx, cy - 18, words, n >= 3 ? 22 : 17, '#ffe7a3', 1.4);
  if (!G.demo) say(G, cx, cy + 10, `+${pts2}`, 20, '#ffffff', 1.1);
  snd.roundUp(n);
}

/** Something bit through the tail: everything behind the bite falls away. */
function cutTail(G, x, y, r) {
  const T = G.tail;
  for (let i = T.length - 2; i >= 0; i--) {
    const a = T[i], b = T[i + 1];
    if (distToSeg(x, y, a, b) > r) continue;
    const fallen = T.splice(0, i + 1);
    for (let j = 0; j < fallen.length; j += 2) G.sparks.push({ x: fallen[j].x, y: fallen[j].y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.5, max: 0.5, color: '#ffd36b' });
    snd.snap();
    return;
  }
}

function distToSeg(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

// ---------------------------------------------------------------------------------------------
// 💥 Firing, getting hit, howling.

function fire(G, dt) {
  const s = G.ship;
  if (s.dead) return;
  s.fireT -= dt;
  while (s.fireT <= 0) {
    s.fireT += FIRE_EVERY;
    s.side = -s.side;
    const ca = Math.cos(s.a), sa = Math.sin(s.a), off = 4 * s.side;
    G.shots.push({ x: s.x + ca * 14 - sa * off, y: s.y + sa * 14 + ca * off, vx: ca * SHOT_SPEED + s.vx * 0.3, vy: sa * SHOT_SPEED + s.vy * 0.3, life: 0.8 });
    snd.pew();
  }
}

function shots(G, dt) {
  for (const b of G.shots) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.x < -20 || b.y < -20 || b.x > G.W + 20 || b.y > G.H + 20) { b.life = 0; continue; }
    for (const f of G.foes) {
      if (f.warp > 0 || f.caught) continue;
      const r = radius(f);
      if ((b.x - f.x) ** 2 + (b.y - f.y) ** 2 < r * r) { b.life = 0; knock(G, f, b.x, b.y, b.vx, b.vy); break; }
    }
    if (b.life <= 0) continue;
    for (const e of G.bullets) if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < 81) { b.life = 0; e.life = 0; burst(G, e.x, e.y, '#ffb43f', 6, 90); break; }
  }
  G.shots = G.shots.filter((b) => b.life > 0);
}

/** A hit: the side nearest the hit flies off, and the shape becomes the one with a side fewer (a triangle breaks). */
function knock(G, f, hx, hy, vx, vy, push = 40) {
  const l = Math.hypot(vx, vy) || 1;
  f.vx += (vx / l) * push; f.vy += (vy / l) * push;
  f.flash = 0.07; f.pop = 1;
  const V = verts(f);
  let best = 0, bd = Infinity;
  for (let i = 0; i < V.length; i++) {
    const a = V[i], b = V[(i + 1) % V.length], d = (hx - (a[0] + b[0]) / 2) ** 2 + (hy - (a[1] + b[1]) / 2) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  flyEdge(G, f, V, best);
  if (f.sides <= 3) { shatter(G, f); return; }
  f.sides--;
  if (!G.demo) G.score += 10;
  if (f.sides === 4 && Math.hypot(f.vx, f.vy) < 60) { const a = Math.random() * TAU; f.vx = Math.cos(a) * 90; f.vy = Math.sin(a) * 90; }
  if (f.sides === 5) f.fireT = Math.max(f.fireT, 1.2);
  if (f.sides === 3) f.dashT = 1 + Math.random();
  snd.clink(f.sides);
}

function shatter(G, f, quiet = false) {
  f.gone = true;
  const V = verts(f);
  for (let i = 0; i < V.length; i++) flyEdge(G, f, V, i, 1.6);
  burst(G, f.x, f.y, colorOf(f.sides), 10, 180);
  G.rings.push({ x: f.x, y: f.y, r: radius(f) * 0.6, vr: 220, life: 0.35, max: 0.35, color: colorOf(f.sides), width: 1.5 });
  for (let i = 0; i < f.sides; i++) {
    const a = Math.random() * TAU, sp = 40 + Math.random() * 90;
    G.dust.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp + f.vx * 0.3, vy: Math.sin(a) * sp + f.vy * 0.3, life: 9, phase: Math.random() * TAU, pull: false });
  }
  if (!G.demo && !f.caught) { G.score += 30; say(G, f.x, f.y - 10, '+30', 14, colorOf(f.sides), 0.7); }
  if (!quiet) snd.shatter(f.sides);
  G.shake = Math.min(16, G.shake + 2);
}

function flyEdge(G, f, V, i, kick = 1) {
  const a = V[i], b = V[(i + 1) % V.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = mx - f.x, ny = my - f.y, nl = Math.hypot(nx, ny) || 1, sp = (90 + Math.random() * 80) * kick;
  G.bits.push({
    x: mx, y: my, len: Math.hypot(b[0] - a[0], b[1] - a[1]), a: Math.atan2(b[1] - a[1], b[0] - a[0]),
    vx: (nx / nl) * sp + f.vx * 0.5, vy: (ny / nl) * sp + f.vy * 0.5, va: (Math.random() - 0.5) * 12, life: 0.9, max: 0.9, color: colorOf(f.sides),
  });
}

function burst(G, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = speed * (0.3 + Math.random() * 0.7);
    G.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, max: 0.8, color });
  }
}

function hurtCheck(G) {
  const s = G.ship;
  if (s.inv > 0 || s.dead) return;
  for (const f of G.foes) {
    if (f.warp > 0 || f.caught) continue;
    const r = radius(f) * 0.72 + HIT_R;
    if ((f.x - s.x) ** 2 + (f.y - s.y) ** 2 < r * r) return hurt(G);
  }
  for (const b of G.bullets) if ((b.x - s.x) ** 2 + (b.y - s.y) ** 2 < (HIT_R + 3) ** 2) { b.life = 0; return hurt(G); }
}

function hurt(G) {
  const s = G.ship;
  G.lives--;
  s.inv = 2.4;
  G.shake = 16;
  G.tail.length = 0;
  snd.hurt();
  burst(G, s.x, s.y, '#fff4d6', 24, 260);
  G.rings.push({ x: s.x, y: s.y, r: 10, vr: 500, life: 0.5, max: 0.5, color: '#ff7a8a', width: 2.5 });
  // A moment's peace: star-bullets nearby fizzle out, shapes are pushed back.
  for (const b of G.bullets) if (Math.hypot(b.x - s.x, b.y - s.y) < 220) b.life = 0;
  for (const f of G.foes) {
    const dx = f.x - s.x, dy = f.y - s.y, d = Math.hypot(dx, dy) || 1;
    if (d < 200) { f.vx += (dx / d) * 260; f.vy += (dy / d) * 260; if (f.sides === 3) { f.dash = 0.3; f.wind = 0; } }
  }
  if (G.lives > 0) { say(G, s.x, s.y - 24, G.lives === 1 ? 'Last paw!' : 'Ouch!', 18, '#ff9aa8', 1.1); return; }
  s.dead = true;
  G.overT = 1.8;
  for (let i = 0; i < 8; i++) G.bits.push({ x: s.x, y: s.y, len: 8 + Math.random() * 6, a: Math.random() * TAU, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, va: (Math.random() - 0.5) * 14, life: 1.4, max: 1.4, color: '#fff4d6' });
}

/** 🌕 AWOOO: a ring of sound that knocks a side off every shape it passes, and blows away the star-bullets. */
function howl(G) {
  const s = G.ship;
  G.howl = 0;
  G.rings.push({ x: s.x, y: s.y, r: 12, vr: 820, life: 0.9, max: 0.9, color: '#dfe8ff', width: 3, howl: new Set() });
  G.shake = 12;
  say(G, s.x, s.y - 30, 'AWOOOOO!', 24, '#dfe8ff', 1.2);
  snd.howl();
}

// ---------------------------------------------------------------------------------------------
// 🔷 Shapes, waves and the stars they leave.

export function verts(f, scale = 1) {
  const n = f.sides, r = radius(f) * scale, out = [];
  for (let i = 0; i < n; i++) {
    const a = f.rot + (i / n) * TAU, k = n === 3 && i === 0 ? 1.35 : 1; // (a triangle's nose is longer: a dart)
    out.push([f.x + Math.cos(a) * r * k, f.y + Math.sin(a) * r * k]);
  }
  return out;
}

const speedScale = (G) => Math.min(1.7, 1 + (G.wave - 1) * 0.05);
const maxAlive = (G) => (G.demo ? 3 : Math.min(16, 5 + G.wave));

function spawn(G, sides, at = null) {
  const s = G.ship;
  let x = at?.x, y = at?.y;
  for (let tries = 0; !at && tries < 30; tries++) {
    x = 50 + Math.random() * (G.W - 100); y = 50 + Math.random() * (G.H - 100);
    if (Math.hypot(x - s.x, y - s.y) > 240) break;
  }
  const a = Math.random() * TAU, sp = G.demo ? 35 : 80 + Math.random() * 40;
  const f = {
    sides, x, y, vx: sides === 4 ? Math.cos(a) * sp : 0, vy: sides === 4 ? Math.sin(a) * sp : 0, rot: Math.random() * TAU,
    spin: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random()), warp: at ? 0.35 : 0.9, warpMax: at ? 0.35 : 0.9,
    flash: 0, pop: 0, fireT: 1.6 + Math.random() * 1.6, hatchT: 3 + Math.random() * 2, dashT: 1.5 + Math.random() * 2, dash: 0, wind: 0, ax: 1, ay: 0,
  };
  G.foes.push(f);
  if (!G.demo && !at) snd.warp();
  return f;
}

/** What each wave sends: the first few teach one shape at a time; after that, a mix that grows. */
function waveList(n) {
  const fixed = { 1: [4, 4, 4, 4, 4], 2: [4, 3, 4, 3, 3, 4, 3], 3: [4, 3, 5, 3, 4, 5, 3, 3], 4: [6, 3, 4, 3, 5, 3, 4, 3] };
  if (fixed[n]) return [...fixed[n]];
  const out = [], count = Math.round(7 + n * 1.3);
  let hives = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let s = r < 0.36 ? 3 : r < 0.62 ? 4 : r < 0.84 ? 5 : 6;
    if (n >= 7 && Math.random() < 0.06) s = 7;
    if (n >= 9 && Math.random() < 0.04) s = 8;
    if (s >= 6 && ++hives > 1 + n / 4) s = 5;
    out.push(s);
  }
  return out;
}

function waves(G, dt) {
  if (G.lives <= 0) return;
  if (G.between > 0) {
    G.between -= dt;
    if (G.between <= 0) {
      G.wave++;
      G.queue = G.demo ? Array(999).fill(4) : waveList(G.wave);
      G.spawnT = 0.3;
      if (!G.demo) G.events.push({ type: 'wave', wave: G.wave });
    }
    return;
  }
  G.spawnT -= dt;
  const alive = G.foes.filter((f) => !f.caught).length;
  if (G.queue.length && G.spawnT <= 0 && alive < maxAlive(G)) {
    spawn(G, G.queue.shift());
    G.spawnT = (G.demo ? 1.4 : Math.max(0.45, 1.1 - G.wave * 0.04)) * (0.7 + Math.random() * 0.6);
  }
  if (!G.queue.length && alive === 0) clearWave(G);
}

function clearWave(G) {
  const s = G.ship;
  G.between = 3.4;
  G.score += 100 * G.wave;
  say(G, G.W / 2, G.H * 0.3, `Wave ${G.wave} clear! +${100 * G.wave}`, 22, '#ffffff', 2.2);
  if (G.wave % 3 === 0 && G.lives < 5) { G.lives++; say(G, s.x, s.y - 26, 'A paw back! 🐾', 16, '#ffe7a3', 1.6); }
  if (G.lit >= SIRIUS) { snd.star(); say(G, G.W / 2, G.H * 0.3 + 28, 'Sirius shines on…', 16, '#9fb8ff', 2.2); return; }
  const star = G.stars[G.lit];
  G.comets.push({ x: s.x, y: s.y, x0: s.x, y0: s.y, i: G.lit, t: 0, dur: 1.1 });
  G.lit++;
  if (G.lit === SIRIUS) {
    G.score += 5000;
    G.between = 6.5;
    G.events.push({ type: 'dogstar' });
    say(G, G.W / 2, G.H * 0.3 + 30, '★ SIRIUS, THE DOG STAR! +5000 ★', 22, '#ffe7a3', 5);
    say(G, G.W / 2, G.H * 0.3 + 58, 'The Big Dog is whole.', 17, '#9fb8ff', 5);
    snd.dogStar();
  } else {
    G.events.push({ type: 'lit', star: star.name });
    say(G, G.W / 2, G.H * 0.3 + 28, `★ ${star.name} lit (${G.lit} of ${SIRIUS})`, 17, '#9fb8ff', 2.2);
    snd.star();
  }
}

function foes(G, dt) {
  const s = G.ship, ss = speedScale(G);
  let darts = 0;
  for (const f of G.foes) if (f.sides === 3 && !f.caught) darts++;
  for (const f of G.foes) {
    f.flash = Math.max(0, f.flash - dt);
    f.pop = Math.max(0, f.pop - dt * 5);
    if (f.caught) { // being rounded up: pulled into the loop's middle, shrinking, then pop
      const C = f.caught, k = (C.t += dt) / 0.35;
      f.x = C.x0 + (C.cx - C.x0) * ease(k); f.y = C.y0 + (C.cy - C.y0) * ease(k);
      f.rot += dt * 10;
      if (k >= 1) shatter(G, f, true);
      continue;
    }
    if (f.warp > 0) { f.warp = Math.max(0, f.warp - dt); continue; }
    f.rot += f.spin * dt;
    const dx = s.x - f.x, dy = s.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (f.sides === 3) { // ▲ chases you, and every so often stops, takes aim (a moment to get out of the way)… and dashes
      if (f.wind > 0) {
        f.wind -= dt;
        f.vx *= Math.exp(-dt * 8); f.vy *= Math.exp(-dt * 8);
        if (f.wind <= 0) { f.dash = 0.42; f.vx = f.ax * 400 * ss; f.vy = f.ay * 400 * ss; }
      } else if (f.dash > 0) f.dash -= dt;
      else {
        const sp = 120 * ss;
        f.vx += ((dx / d) * sp - f.vx) * Math.min(1, dt * 1.6);
        f.vy += ((dy / d) * sp - f.vy) * Math.min(1, dt * 1.6);
        f.dashT -= dt;
        if (f.dashT <= 0 && d < 320 && !s.dead) { f.wind = 0.5; f.ax = dx / d; f.ay = dy / d; f.dashT = 2.6 + Math.random() * 2; }
      }
      f.rot = f.wind > 0 ? Math.atan2(f.ay, f.ax) : Math.atan2(f.vy, f.vx);
    } else if (f.sides === 4) { // ■ keeps going, bouncing off the edges
      const sp = Math.hypot(f.vx, f.vy), want = (G.demo ? 35 : 95) * ss;
      if (sp > 1) { f.vx += ((f.vx / sp) * want - f.vx) * Math.min(1, dt); f.vy += ((f.vy / sp) * want - f.vy) * Math.min(1, dt); }
    } else if (f.sides === 5) { // ⬟ keeps its distance, circling, and spits stars
      const radial = (d - 250) * 1.2, tang = 70 * Math.sign(f.spin);
      let tvx = (dx / d) * radial - (dy / d) * tang, tvy = (dy / d) * radial + (dx / d) * tang;
      const tl = Math.hypot(tvx, tvy), cap = 150 * ss;
      if (tl > cap) { tvx *= cap / tl; tvy *= cap / tl; }
      f.vx += (tvx - f.vx) * Math.min(1, dt * 2);
      f.vy += (tvy - f.vy) * Math.min(1, dt * 2);
      f.fireT -= dt;
      if (f.fireT <= 0 && !s.dead) {
        f.fireT = Math.max(1.4, 2.7 - G.wave * 0.06) * (0.8 + Math.random() * 0.4);
        const sp = 170 * ss;
        G.bullets.push({ x: f.x, y: f.y, vx: (dx / d) * sp, vy: (dy / d) * sp, life: 7, rot: 0 });
        snd.spit();
      }
    } else { // ⬢ drifts after you, hatching triangles
      const sp = 32 * ss;
      f.vx += ((dx / d) * sp - f.vx) * Math.min(1, dt);
      f.vy += ((dy / d) * sp - f.vy) * Math.min(1, dt);
      f.hatchT -= dt;
      if (f.hatchT <= 0) {
        f.hatchT = Math.max(2.5, 5.5 - (f.sides - 6) * 0.9);
        if (darts < 8 && !G.demo) { const t = spawn(G, 3, { x: f.x, y: f.y }); t.dashT = 1.2; darts++; snd.hatch(); }
      }
    }
    f.x += f.vx * dt; f.y += f.vy * dt;
    const r = radius(f);
    if (f.x < r) { f.x = r; f.vx = Math.abs(f.vx); } else if (f.x > G.W - r) { f.x = G.W - r; f.vx = -Math.abs(f.vx); }
    if (f.y < r) { f.y = r; f.vy = Math.abs(f.vy); } else if (f.y > G.H - r) { f.y = G.H - r; f.vy = -Math.abs(f.vy); }
    if (f.sides === 3) cutTail(G, f.x, f.y, r * 0.75); // (triangles bite through your tail)
  }
  G.foes = G.foes.filter((f) => !f.gone);
}

function bullets(G, dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.rot += dt * 6;
    if (b.x < -10 || b.y < -10 || b.x > G.W + 10 || b.y > G.H + 10) b.life = 0;
    else cutTail(G, b.x, b.y, 6);
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

/** ✧ Stardust drifts, slows, and is drawn in when you fly near (or scooped up by a loop). It fills the howl. */
function stardust(G, dt) {
  const s = G.ship, fr = Math.exp(-dt * 1.6);
  for (const d of G.dust) {
    d.life -= dt;
    const dx = s.x - d.x, dy = s.y - d.y, l = Math.hypot(dx, dy) || 1;
    if (!s.dead && (d.pull || l < 150)) { const k = d.pull ? 900 : 2400 / Math.max(30, l) * 6; d.vx += (dx / l) * k * dt; d.vy += (dy / l) * k * dt; d.vx *= 0.95; d.vy *= 0.95; }
    else { d.vx *= fr; d.vy *= fr; }
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (!s.dead && l < SHIP_R + 6) {
      d.life = 0;
      if (G.demo) continue;
      G.score += 5;
      const was = G.howl;
      G.howl = Math.min(1, G.howl + HOWL_PER_DUST);
      if (was < 1 && G.howl >= 1) { G.events.push({ type: 'ready' }); snd.ready(); say(G, s.x, s.y - 26, 'Howl ready! 🌕', 15, '#dfe8ff', 1.4); }
      else snd.dust();
    }
  }
  G.dust = G.dust.filter((d) => d.life > 0);
}

function effects(G, dt) {
  const fr = Math.exp(-dt * 1.4);
  for (const b of G.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; b.vx *= fr; b.vy *= fr; b.life -= dt; }
  for (const p of G.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= fr; p.vy *= fr; p.life -= dt; }
  for (const w of G.words) { w.y -= 16 * dt; w.life -= dt; }
  for (const L of G.loops) L.life -= dt;
  for (const R of G.rings) {
    R.r += R.vr * dt; R.life -= dt;
    if (!R.howl) continue;
    for (const f of G.foes) {
      if (f.warp > 0 || f.caught || f.gone || R.howl.has(f)) continue;
      const dx = f.x - R.x, dy = f.y - R.y, d = Math.hypot(dx, dy) || 1;
      if (d < R.r) { R.howl.add(f); knock(G, f, f.x - dx / d * radius(f), f.y - dy / d * radius(f), dx, dy, 280); }
    }
    for (const b of G.bullets) if (Math.hypot(b.x - R.x, b.y - R.y) < R.r) { b.life = 0; burst(G, b.x, b.y, '#dfe8ff', 4, 60); }
  }
  for (const C of G.comets) {
    const st = G.stars[C.i], k = ease((C.t += dt) / C.dur);
    C.x = C.x0 + (st.px - C.x0) * k; C.y = C.y0 + (st.py - C.y0) * k - Math.sin(k * Math.PI) * 60;
    if (C.t >= C.dur && !C.done) { C.done = true; G.rings.push({ x: st.px, y: st.py, r: 4, vr: 120, life: 0.8, max: 0.8, color: '#cfe0ff', width: 1.5 }); }
  }
  G.foes = G.foes.filter((f) => !f.gone);
  G.bits = G.bits.filter((b) => b.life > 0).slice(-300);
  G.sparks = G.sparks.filter((p) => p.life > 0).slice(-400);
  G.words = G.words.filter((w) => w.life > 0).slice(-12);
  G.loops = G.loops.filter((L) => L.life > 0);
  G.rings = G.rings.filter((R) => R.life > 0);
  G.comets = G.comets.filter((C) => C.t < C.dur + 0.1);
}

function say(G, x, y, text, size, color, life) { G.words.push({ x, y, text, size, color, life, max: life }); }
