import { colorOf, radius, verts, TAIL_LIFE } from './play.js';
import { LINE_IDX, SIRIUS } from './sky.js';

/*
 * 🎨 Drawing Dog Star: glowing lines on the night sky. Every line is stroked two or three times (wide and faint,
 * then thin and bright) and added on top of what's there ('lighter'), so where lines cross they glow brighter,
 * like a vector screen. lite: just the thin line (for a phone that's struggling).
 */
const TAU = Math.PI * 2;
const SHIP = [[16, 0], [12, 2.8], [5, 5.5], [1, 8], [-3, 13.5], [-7, 5.5], [-9, 2.5], [-9, -2.5], [-7, -5.5], [-3, -13.5], [1, -8], [5, -5.5], [12, -2.8]]; // a whippet's head from above: long nose, ears back
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
  for (const d of G.dust) { // stardust
    const tw = 0.6 + 0.4 * Math.sin(G.t * 9 + d.phase), a = Math.min(1, d.life / 1.5) * tw, r = 2.2;
    c.beginPath(); c.moveTo(d.x, d.y - r); c.lineTo(d.x + r, d.y); c.lineTo(d.x, d.y + r); c.lineTo(d.x - r, d.y); c.closePath();
    glow(c, '#bff6ff', 1, a);
  }
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
  for (const b of G.bits) { // the sides knocked off, spinning away
    const k = b.life / b.max, hx = Math.cos(b.a) * b.len * 0.5, hy = Math.sin(b.a) * b.len * 0.5;
    c.beginPath(); c.moveTo(b.x - hx, b.y - hy); c.lineTo(b.x + hx, b.y + hy);
    glow(c, b.color, 1.8, k);
  }
  for (const p of G.sparks) {
    const k = p.life / p.max;
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
    glow(c, p.color, 1.2, k);
  }
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
  const pts = [...T, { x: s.x, y: s.y, t: G.t }];
  for (let i = 0; i < pts.length - 1; i += 5) { // in short runs, older ones fainter and thinner
    const j = Math.min(pts.length - 1, i + 5), age = (G.t - pts[i].t) / TAIL_LIFE, along = j / pts.length;
    c.beginPath(); c.moveTo(pts[i].x, pts[i].y);
    for (let k = i + 1; k <= j; k++) c.lineTo(pts[k].x, pts[k].y);
    glow(c, '#ffd36b', 0.8 + along * 1.2, Math.max(0, 1 - age) * (0.25 + 0.75 * along));
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
  c.save();
  c.translate(s.x, s.y); c.rotate(s.a); c.scale(1.25, 1.25);
  poly(c, SHIP);
  glow(c, '#fff4d6', 1.8, blink ? 0.35 : 1);
  c.fillStyle = '#fff4d6'; c.globalAlpha = blink ? 0.35 : 1;
  c.fillRect(5, -4, 2, 2); c.fillRect(5, 2, 2, 2); // eyes
  c.fillRect(14.5, -1.2, 2.4, 2.4); // nose
  c.restore();
}

/**
 * The scores and things over the top, in screen pixels: points (and your best), the wave and stars lit, paws
 * left, and the howl filling up. safe: the phone's notch and corners { t, r, b, l }.
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
  // 🐾 paws left: little dog heads (left of the pause button)
  for (let i = 0; i < G.lives; i++) {
    c.save();
    c.translate(R - 62 - i * 24, T + 12); c.rotate(-Math.PI / 2); c.scale(0.7, 0.7);
    poly(c, SHIP); c.strokeStyle = '#fff4d6'; c.lineWidth = 2; c.stroke();
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
}
