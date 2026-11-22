import { colorOf, radius, verts, TAIL_LIFE } from './play.js';
import { LINE_IDX, SIRIUS } from './sky.js';

/*
 * 🎨 Drawing Dog Star: glowing lines on the night sky. Every line is stroked two or three times (wide and faint,
 * then thin and bright) and added on top of what's there ('lighter'), so where lines cross they glow brighter,
 * like a vector screen. lite: just the thin line (for a phone that's struggling). The little bits that come in
 * crowds (sparks, sides knocked off, stardust) are drawn a whole crowd at a time instead: see lines().
 */
const TAU = Math.PI * 2;
// 🐕 The ship: a dog's head from above (nose forward, along +x), and two floppy ears that fly back as she speeds up.
const HALF = [[13, 0], [12.4, 2.5], [9.5, 3.8], [6, 4.6], [4, 6.8], [0, 8.8], [-5, 9], [-9, 6.8], [-11, 3.4], [-11.6, 0]]; // (a round head, a short snout)
const HEAD = [...HALF, ...HALF.slice(1, -1).reverse().map(([x, y]) => [x, -y])];
const EAR = [[1.2, 8.6], [1.8, 12.6], [-0.6, 17], [-4.6, 17.8], [-6.8, 14.4], [-5.6, 9]], EAR_AT = [-2, 8.8]; // (one ear, out to the side like a beagle's; the other's its mirror)
const SHIP_SCALE = 1.35;
export const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

let lite = false;

function glow(c, color, w, alpha = 1) {
  c.strokeStyle = color;
  if (!lite) {
    c.globalAlpha = 0.14 * alpha; c.lineWidth = w * 4.5; c.stroke();
    c.globalAlpha = 0.32 * alpha; c.lineWidth = w * 2.2; c.stroke();
  }
  c.globalAlpha = alpha; c.lineWidth = w; c.stroke();
  c.globalAlpha = 1;
}

function poly(c, V, close = true) {
  c.beginPath();
  c.moveTo(V[0][0], V[0][1]);
  for (let i = 1; i < V.length; i++) c.lineTo(V[i][0], V[i][1]);
  if (close) c.closePath();
}

/** An ear, swung back by `swing` (radians) about where it joins the head. side: 1 or −1 (which ear). */
function ear(swing, side) {
  const cs = Math.cos(swing), sn = Math.sin(swing), [px, py] = EAR_AT;
  return EAR.map(([x, y]) => { const dx = x - px, dy = y - py; return [px + dx * cs - dy * sn, (py + dx * sn + dy * cs) * side]; });
}

/** The dog's head, at the origin facing +x (ears open-ended, so they don't draw a line where they join on). */
function dogHead(c, swing, alpha, w, plain = false) {
  const line = plain ? () => { c.strokeStyle = '#fff4d6'; c.globalAlpha = alpha; c.lineWidth = w; c.stroke(); } : (k = 1) => glow(c, '#fff4d6', w * k, alpha);
  for (const side of [1, -1]) { poly(c, ear(swing, side), false); line(0.85); }
  poly(c, HEAD); line();
  c.fillStyle = '#fff4d6'; c.globalAlpha = alpha;
  for (const y of [-3.8, 3.8]) { c.beginPath(); c.arc(3.2, y, 1.5, 0, TAU); c.fill(); } // eyes
  c.beginPath(); c.arc(12, 0, 2.2, 0, TAU); c.fill(); // nose
  c.globalAlpha = 1;
}

/**
 * A crowd of little lines (sparks, sides knocked off): grouped by colour and (roughly: four steps) how faded they
 * are, so it's one path and one or two strokes per group, not two or three strokes each. seg(it) adds its line.
 * soft: a faint wide stroke under the thin one (skipped when lite).
 */
function lines(c, list, w, seg, soft = false) {
  const groups = new Map();
  for (const it of list) {
    const a = Math.ceil(Math.min(1, it.life / it.max) * 4) / 4;
    if (a <= 0) continue;
    const key = it.color + a;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { color: it.color, a, items: [] }));
    g.items.push(it);
  }
  for (const g of groups.values()) {
    c.beginPath();
    for (const it of g.items) seg(it);
    c.strokeStyle = g.color;
    if (soft && !lite) { c.globalAlpha = 0.3 * g.a; c.lineWidth = w * 2.6; c.stroke(); }
    c.globalAlpha = g.a; c.lineWidth = w; c.stroke();
  }
  c.globalAlpha = 1;
}

/** A twinkle: a little four-pointed glint. */
function glint(c, x, y, size, color, alpha) {
  c.beginPath();
  c.moveTo(x - size, y); c.lineTo(x + size, y);
  c.moveTo(x, y - size); c.lineTo(x, y + size);
  glow(c, color, Math.max(0.8, size * 0.18), alpha);
  c.fillStyle = color; c.globalAlpha = alpha;
  c.fillRect(x - size * 0.22, y - size * 0.22, size * 0.44, size * 0.44);
  c.globalAlpha = 1;
}

/**
 * The whole picture. view: { scale (world units → canvas pixels), lite }.
 */
export function draw(c, G, view) {
  lite = !!view.lite;
  const cv = c.canvas, s = view.scale;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  const bg = c.createRadialGradient(cv.width * 0.5, cv.height * 0.45, 0, cv.width * 0.5, cv.height * 0.45, Math.max(cv.width, cv.height) * 0.75);
  bg.addColorStop(0, '#0b1030'); bg.addColorStop(1, '#03040b');
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  c.setTransform(s, 0, 0, s, sx * s, sy * s);
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round'; c.lineCap = 'round';

  starfield(c, G);
  planet(c, G);
  constellation(c, G);
  for (const C of G.comets) { // a shooting star, off to light its star
    c.beginPath(); c.moveTo(C.x, C.y); c.lineTo(C.x - (C.x - C.x0) * 0.15, C.y - (C.y - C.y0) * 0.15 + 8);
    glow(c, '#cfe0ff', 2, 1);
    glint(c, C.x, C.y, 6, '#ffffff', 1);
  }
  for (const L of G.loops) { // a closed loop, flashing as it rounds them up
    const k = L.life / L.max;
    c.beginPath(); c.moveTo(L.pts[0].x, L.pts[0].y);
    for (const p of L.pts) c.lineTo(p.x, p.y);
    c.closePath();
    c.fillStyle = L.color; c.globalAlpha = 0.16 * k; c.fill(); c.globalAlpha = 1;
    glow(c, L.color, 2, k);
  }
  tail(c, G);
  // Stardust: little twinkling diamonds, a crowd at a time (grouped by how bright each is just now).
  const dust = [[], [], [], []];
  for (const d of G.dust) {
    const a = Math.min(1, d.life / 1.5) * (0.6 + 0.4 * Math.sin(G.t * 9 + d.phase));
    dust[Math.min(3, Math.floor(a * 4))].push(d);
  }
  dust.forEach((list, i) => {
    if (!list.length) return;
    const r = 2.2;
    c.beginPath();
    for (const d of list) { c.moveTo(d.x, d.y - r); c.lineTo(d.x + r, d.y); c.lineTo(d.x, d.y + r); c.lineTo(d.x - r, d.y); c.closePath(); }
    glow(c, '#bff6ff', 1, (i + 1) / 4);
  });
  for (const f of G.foes) shape(c, G, f);
  for (const b of G.bullets) { // a pentagon's star-bullet: a little spinning four-pointed star
    const r = 6;
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = b.rot + (i / 8) * TAU, rr = i % 2 ? r * 0.4 : r; c[i ? 'lineTo' : 'moveTo'](b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); }
    c.closePath();
    glow(c, '#ffc865', 1.4, 1);
  }
  c.beginPath();
  for (const b of G.shots) { c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); }
  glow(c, '#fff1c4', 1.8, 1);
  lines(c, G.bits, 1.8, (b) => { // the sides knocked off, spinning away
    const hx = Math.cos(b.a) * b.len * 0.5, hy = Math.sin(b.a) * b.len * 0.5;
    c.moveTo(b.x - hx, b.y - hy); c.lineTo(b.x + hx, b.y + hy);
  }, true);
  lines(c, G.sparks, 1.2, (p) => { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); });
  for (const R of G.rings) {
    const k = R.life / R.max;
    c.beginPath(); c.arc(R.x, R.y, R.r, 0, TAU);
    glow(c, R.color, R.width * (R.howl ? 0.6 + k : 1), k);
  }
  ship(c, G);
  c.globalCompositeOperation = 'source-over';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const w of G.words) {
    const k = Math.min(1, w.life / Math.min(0.4, w.max));
    c.font = `bold ${w.size}px ${FONT}`;
    c.globalAlpha = k * 0.35; c.strokeStyle = w.color; c.lineWidth = 4; c.strokeText(w.text, w.x, w.y);
    c.globalAlpha = k; c.fillStyle = w.color; c.fillText(w.text, w.x, w.y);
  }
  c.globalAlpha = 1;
}

function starfield(c, G) {
  const ox = G.ship.x - G.W / 2, oy = G.ship.y - G.H / 2;
  for (const st of G.sky) {
    const par = (st.depth + 1) * 0.014;
    const x = (((st.x - ox * par) % G.W) + G.W) % G.W, y = (((st.y - oy * par) % G.H) + G.H) % G.H;
    const tw = 0.5 + 0.5 * Math.sin(G.t * st.speed + st.phase);
    c.globalAlpha = (0.2 + 0.45 * tw) * (0.55 + st.depth * 0.22);
    c.fillStyle = '#cfe0ff';
    c.fillRect(x - st.size / 2, y - st.size / 2, st.size, st.size);
  }
  c.globalAlpha = 1;
}

/** Far off in a corner: a ringed planet (Planet Boing, perhaps?) and a little blue one (home). */
function planet(c, G) {
  const x = G.W * 0.13, y = G.H * 0.2, r = 46;
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  glow(c, '#8a72ff', 1.2, 0.22);
  c.beginPath(); c.ellipse(x, y, r * 1.75, r * 0.42, -0.35, 0.15 * Math.PI, 0.95 * Math.PI + Math.PI);
  glow(c, '#8a72ff', 1.2, 0.18);
  c.beginPath(); c.arc(G.W * 0.88, G.H * 0.84, 9, 0, TAU);
  glow(c, '#58b7ff', 1, 0.28);
}

/** Canis Major: the stars lit so far (bright, joined up), and the rest (faint, waiting). */
function constellation(c, G) {
  const P = G.stars, lit = G.lit, whole = lit >= SIRIUS;
  for (const [a, b] of LINE_IDX) {
    const on = a < lit && b < lit;
    c.beginPath(); c.moveTo(P[a].px, P[a].py); c.lineTo(P[b].px, P[b].py);
    if (on) glow(c, '#9fb8ff', 1, whole ? 0.45 + 0.15 * Math.sin(G.t * 2) : 0.35);
    else { c.setLineDash([2, 7]); glow(c, '#9fb8ff', 0.8, 0.07); c.setLineDash([]); }
  }
  for (let i = 0; i < P.length; i++) {
    const st = P[i], on = i < lit, big = Math.max(1.2, 4 - st.mag * 0.8);
    if (!on) { c.globalAlpha = 0.18; c.fillStyle = '#9fb8ff'; c.fillRect(st.px - 1, st.py - 1, 2, 2); c.globalAlpha = 1; continue; }
    const tw = 0.75 + 0.25 * Math.sin(G.t * 3 + i * 1.7);
    if (i === SIRIUS - 1) { // the Dog Star: big, bright and shining
      glint(c, st.px, st.py, (big + 6) * tw, '#ffffff', 0.95);
      c.beginPath(); c.arc(st.px, st.py, 14 + 3 * Math.sin(G.t * 2.4), 0, TAU);
      glow(c, '#cfe0ff', 1, 0.3);
    } else glint(c, st.px, st.py, big * 1.6 * tw, '#dfe8ff', 0.85);
  }
}

function tail(c, G) {
  const T = G.tail, s = G.ship;
  if (!T.length || s.dead) return;
  const pts = [...T, { x: s.x, y: s.y, t: G.t }], near = G.nearly?.k ?? 0;
  for (let i = 0; i < pts.length - 1; i += 5) { // in short runs, older ones fainter and thinner
    const j = Math.min(pts.length - 1, i + 5), age = (G.t - pts[i].t) / TAIL_LIFE, along = j / pts.length;
    c.beginPath(); c.moveTo(pts[i].x, pts[i].y);
    for (let k = i + 1; k <= j; k++) c.lineTo(pts[k].x, pts[k].y);
    glow(c, '#ffd36b', (0.8 + along * 1.2) * (1 + near * 0.6), Math.min(1, Math.max(0, 1 - age) * (0.25 + 0.75 * along) * (1 + near)));
  }
  // ➰ Nearly a loop: a twinkle where it'll close ("join up here!"), brighter the closer you are.
  if (G.nearly) {
    const n = G.nearly, beat = 0.7 + 0.3 * Math.sin(G.t * 20);
    glint(c, n.x, n.y, (4 + 6 * n.k) * beat, '#ffe7a3', 0.45 + 0.55 * n.k);
  }
}

function shape(c, G, f) {
  const col = f.flash > 0 ? '#ffffff' : colorOf(f.sides);
  if (f.warp > 0) { // arriving: a dashed ring closing in, and the shape fading up inside it
    const k = 1 - f.warp / f.warpMax;
    c.setLineDash([3, 6]);
    c.beginPath(); c.arc(f.x, f.y, radius(f) * (2.6 - 1.6 * k), 0, TAU);
    glow(c, col, 1, 0.25 + 0.5 * k);
    c.setLineDash([]);
    poly(c, verts(f, k));
    glow(c, col, 1.2, k * 0.6);
    return;
  }
  if (f.wind > 0 && !f.caught) { // a triangle taking aim: where it's about to dash
    c.setLineDash([5, 7]);
    c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + f.ax * 170, f.y + f.ay * 170);
    glow(c, col, 1, 0.55);
    c.setLineDash([]);
  }
  const k = f.caught ? 1 - Math.min(1, f.caught.t / 0.35) : 1 + f.pop * 0.22 + (f.wind > 0 ? 0.12 * Math.sin(f.wind * 40) : 0);
  const V = verts(f, k);
  poly(c, V);
  glow(c, col, 2, 1);
  // A little something inside each, so you can tell them apart at a glance.
  const n = f.sides;
  if (n === 4) { // ■ a diamond
    const r = radius(f) * k * 0.42;
    c.beginPath();
    for (let i = 0; i < 4; i++) { const a = f.rot + Math.PI / 4 + (i / 4) * TAU; c[i ? 'lineTo' : 'moveTo'](f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); }
    c.closePath(); glow(c, col, 1, 0.5);
  } else if (n === 5) { // ⬟ a star (it spits them)
    c.beginPath();
    for (let i = 0; i <= 5; i++) { const v = V[(i * 2) % 5]; c[i ? 'lineTo' : 'moveTo'](f.x + (v[0] - f.x) * 0.62, f.y + (v[1] - f.y) * 0.62); }
    glow(c, col, 1, 0.5);
  } else if (n >= 6) { // ⬢ the hive: an egg inside, swelling till it hatches
    const grow = 0.25 + 0.3 * (1 - Math.min(1, f.hatchT / 3));
    poly(c, verts({ ...f, rot: -f.rot }, k * grow));
    glow(c, col, 1, 0.55);
  } else { // ▲ an eye
    c.fillStyle = col; c.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
  }
}

function ship(c, G) {
  const s = G.ship;
  if (s.dead) return;
  const blink = s.inv > 0 && s.inv < 100 && Math.floor(G.t * 14) % 2 === 0;
  // The ears fly back the faster she goes (and flap a little).
  const sp = Math.min(1, Math.hypot(s.mvx, s.mvy) / 650), swing = 0.12 + 0.5 * sp + Math.sin(G.t * 17) * 0.09 * sp;
  c.save();
  c.translate(s.x, s.y); c.rotate(s.a); c.scale(SHIP_SCALE, SHIP_SCALE);
  dogHead(c, swing, blink ? 0.35 : 1, 1.5);
  c.restore();
}

/**
 * The scores and things over the top, in screen pixels: points (and your best) with the paws left under them, the
 * wave and stars lit, the howl filling up, and a tip (G.tip) above it. safe: the phone's notch and corners { t, r, b, l }.
 */
export function drawHud(c, G, { dpr, w, h, safe, best, touch }) {
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.textBaseline = 'top';
  const L = 14 + safe.l, T = 12 + safe.t, R = w - 14 - safe.r;
  c.fillStyle = '#ffffff'; c.textAlign = 'left';
  c.font = `bold 22px ${FONT}`;
  c.fillText(String(G.score).padStart(6, '0'), L, T);
  c.font = `12px ${FONT}`; c.fillStyle = 'rgba(207, 224, 255, 0.7)';
  c.fillText(`BEST ${String(Math.max(best, G.score)).padStart(6, '0')}`, L, T + 26);
  c.textAlign = 'center';
  c.font = `bold 14px ${FONT}`; c.fillStyle = 'rgba(255, 255, 255, 0.85)';
  c.fillText(G.wave ? `WAVE ${G.wave}` : '', w / 2, T + 2);
  c.font = `12px ${FONT}`; c.fillStyle = 'rgba(159, 184, 255, 0.85)';
  c.fillText(`★ ${G.lit}/${SIRIUS}`, w / 2, T + 20);
  // 🐾 paws left: little dog heads, under the score (out of the way of the middle, however many there are)
  for (let i = 0; i < G.lives; i++) {
    c.save();
    c.translate(L + 11 + i * 25, T + 58); c.rotate(-Math.PI / 2); c.scale(0.55, 0.55);
    dogHead(c, 0.2, 1, 2.2, true);
    c.restore();
  }
  // 🌕 the howl: a bar along the bottom (on a touch screen, the button fills up too)
  const bw = Math.min(260, w * 0.5), bx = w / 2 - bw / 2, by = h - 22 - safe.b;
  c.strokeStyle = 'rgba(223, 232, 255, 0.45)'; c.lineWidth = 1.5;
  c.strokeRect(bx, by, bw, 8);
  c.fillStyle = G.howl >= 1 ? `rgba(223, 232, 255, ${0.75 + 0.25 * Math.sin(G.t * 8)})` : 'rgba(223, 232, 255, 0.6)';
  c.fillRect(bx + 2, by + 2, (bw - 4) * G.howl, 4);
  c.textAlign = 'center'; c.textBaseline = 'bottom'; c.font = `11px ${FONT}`; c.fillStyle = 'rgba(223, 232, 255, 0.7)';
  c.fillText(G.howl >= 1 ? (touch ? 'HOWL READY: TAP 🌕' : 'HOWL READY: SPACE / CLICK') : 'HOWL', w / 2, by - 3);
  if (G.tip && G.wave) { // ➰ help, until it's done once
    c.font = `bold 14px ${FONT}`; c.fillStyle = '#ffe7a3'; c.globalAlpha = 0.7 + 0.3 * Math.sin(G.t * 4);
    c.fillText(G.tip, w / 2, by - 24);
    c.globalAlpha = 1;
  }
}
