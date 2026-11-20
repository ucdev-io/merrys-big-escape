import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { AW, AH, openArcade } from './arcade.js';

/*
 * The three arcade games (see ./arcade.js for how they run):
 *   🦴 Catch the treats: treats rain down; slide Merry about to catch them. Not the chocolate, grapes or
 *      onions, though: they're not for dogs!
 *   🍄 Whack-a-gnome: gnomes pop up out of the flowerbeds. Boop them! (If it's Pickles, don't.)
 *   🍖 Bone stack: a bone slides to and fro; drop it on the pile. Whatever hangs over the edge falls off.
 * Kind: nothing ever takes points away.
 */
const FONT = '"Patrick Hand", "Comic Sans MS", sans-serif';
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const lerp = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));

function sky(c, top = '#cfe3ee', bottom = '#f6efe0') {
  const gr = c.createLinearGradient(0, 0, 0, AH);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  c.fillStyle = gr; c.fillRect(0, 0, AW, AH);
}
const emoji = (c, e, x, y, size) => { c.font = `${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y); };

// ---------------------------------------------------------------------------------------------
// 🦴 Catch the treats.

const TREATS = [['🦴', 1, 4], ['🍪', 1, 3], ['🥕', 1, 2], ['🧀', 2, 2], ['🌭', 2, 2], ['🌟', 5, 0.35]];
const NOT_FOR_DOGS = [['🍫', 'Chocolate’s not for dogs!'], ['🍇', 'Grapes aren’t for dogs!'], ['🧅', 'Onions aren’t for dogs!']];
const TREAT_TIME = 40;

const treats = {
  info: 'Drag (or use ← →) to move Merry. Catch the treats: leave the chocolate, grapes and onions!',
  left: (g) => TREAT_TIME - g.t,
  init(g) { Object.assign(g, { x: AW / 2, to: AW / 2, keys: 0, items: [], next: 0.6, pops: [] }); },
  down(g, x) { g.to = x; },
  move(g, x) { g.to = x; },
  key(g, code, down) {
    const d = code === 'ArrowLeft' || code === 'KeyA' ? -1 : code === 'ArrowRight' || code === 'KeyD' ? 1 : 0;
    if (d) g.keys = down ? d : g.keys === d ? 0 : g.keys;
  },
  step(g, dt) {
    if (g.keys) g.to = g.x + g.keys * 60;
    g.to = Math.min(AW - 28, Math.max(28, g.to));
    g.x += (g.to - g.x) * Math.min(1, dt * 14);
    const k = g.t / TREAT_TIME; // (busier and quicker as it goes on)
    g.next -= dt;
    if (g.next <= 0) {
      g.next = lerp(0.75, 0.33, k) * (0.7 + Math.random() * 0.6);
      const bad = Math.random() < lerp(0.12, 0.26, k);
      const total = TREATS.reduce((s, t) => s + t[2], 0);
      let r = Math.random() * total, t = TREATS[0];
      for (const q of TREATS) { r -= q[2]; if (r <= 0) { t = q; break; } }
      const b = pick(NOT_FOR_DOGS);
      g.items.push(bad ? { e: b[0], pts: 0, bad: b[1], x: 24 + Math.random() * (AW - 48), y: -20, vy: lerp(110, 190, k) }
        : { e: t[0], pts: t[1], x: 24 + Math.random() * (AW - 48), y: -20, vy: lerp(120, 210, k) * (t[1] === 5 ? 1.25 : 1) });
    }
    for (const it of g.items) {
      it.y += it.vy * dt;
      if (!it.done && it.y > AH - 70 && it.y < AH - 22 && Math.abs(it.x - g.x) < 36) {
        it.done = true;
        if (it.bad) { g.say(it.bad, 1.4); sfx.plip?.(); }
        else { g.score += it.pts; g.pops.push({ x: it.x, y: it.y, t: 0, text: `+${it.pts}` }); sfx.pop?.(); if (it.pts >= 5) { g.say('Golden treat! ✨'); buzz(20); } }
      }
    }
    g.items = g.items.filter((it) => !it.done && it.y < AH + 30);
    for (const p of g.pops) p.t += dt;
    g.pops = g.pops.filter((p) => p.t < 0.8);
    return g.t >= TREAT_TIME;
  },
  draw(g, c) {
    sky(c);
    c.fillStyle = '#9fc46a'; c.fillRect(0, AH - 30, AW, 30);
    for (const it of g.items) emoji(c, it.e, it.x, it.y, 34);
    // Merry, with her mouth open (and a bowl, for show).
    emoji(c, '🐶', g.x, AH - 52, 54);
    for (const p of g.pops) { c.globalAlpha = 1 - p.t / 0.8; c.fillStyle = '#c8851e'; c.font = `bold 22px ${FONT}`; c.fillText(p.text, p.x, p.y - p.t * 40); c.globalAlpha = 1; }
  },
};

// ---------------------------------------------------------------------------------------------
// 🍄 Whack-a-gnome.

const GNOME_TIME = 30;
const HOLES = [0, 1, 2].flatMap((r) => [0, 1, 2].map((col) => ({ x: 100 + col * 140, y: 125 + r * 85 })));
const HOLE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
const CAT_SAYS = ['Hey! Not me!', 'Oi! I’m a cat, not a gnome!', 'Rude.', 'Watch it, dog!'];

function drawGnome(c, x, y, up, bonked) {
  const h = up * 52, base = y + 6;
  c.save();
  c.beginPath(); c.rect(x - 40, base - 90, 80, 90); c.clip(); // (only what's up out of the hole shows)
  const top = base - h;
  c.fillStyle = '#5b86c4'; c.beginPath(); c.ellipse(x, top + 46, 18, 20, 0, 0, Math.PI * 2); c.fill();   // body
  c.fillStyle = '#f3d2b5'; c.beginPath(); c.arc(x, top + 22, 12, 0, Math.PI * 2); c.fill();              // face
  c.fillStyle = '#fffaf0'; c.beginPath(); c.moveTo(x - 12, top + 24); c.lineTo(x + 12, top + 24); c.lineTo(x, top + 44); c.fill(); // beard
  c.fillStyle = '#d9534f'; c.beginPath(); c.moveTo(x - 14, top + 14); c.lineTo(x + 14, top + 14); c.lineTo(x + (bonked ? 10 : 2), top - 18); c.fill(); // hat
  c.fillStyle = '#3b2b25'; c.beginPath(); c.arc(x - 4, top + 20, 1.8, 0, 7); c.arc(x + 4, top + 20, 1.8, 0, 7); c.fill();
  c.restore();
}

const gnomes = {
  info: 'Tap the gnomes as they pop up (or press 1–9). Leave Pickles alone!',
  left: (g) => GNOME_TIME - g.t,
  init(g) { Object.assign(g, { holes: HOLES.map(() => ({ who: null, up: 0, t: 0, life: 0, hit: 0 })), next: 0.5 }); },
  hit(g, k) {
    const h = g.holes[k];
    if (!h.who || h.hit > 0 || h.up < 0.4) return;
    h.hit = 0.35;
    if (h.who === 'cat') { g.say(pick(CAT_SAYS), 1.2); sfx.meow?.(); }
    else { g.score++; sfx.pop?.(); buzz(12); }
  },
  down(g, x, y) {
    const k = HOLES.findIndex((p) => Math.abs(x - p.x) < 50 && y > p.y - 70 && y < p.y + 24);
    if (k >= 0) this.hit(g, k);
  },
  key(g, code, down) { const k = HOLE_KEYS.indexOf(code); if (down && k >= 0) this.hit(g, k); },
  step(g, dt) {
    const k = g.t / GNOME_TIME;
    g.next -= dt;
    if (g.next <= 0) {
      g.next = lerp(0.65, 0.32, k);
      const empty = g.holes.filter((h) => !h.who);
      if (empty.length) { const h = pick(empty); Object.assign(h, { who: Math.random() < 0.16 ? 'cat' : 'gnome', t: 0, life: lerp(1.25, 0.75, k), hit: 0 }); }
    }
    for (const h of g.holes) {
      if (!h.who) continue;
      h.t += dt;
      if (h.hit > 0) { h.hit -= dt; h.up = Math.max(0, h.up - dt * 5); if (h.hit <= 0) h.who = null; continue; }
      h.up = h.t < 0.15 ? h.t / 0.15 : h.t > h.life ? Math.max(0, 1 - (h.t - h.life) / 0.15) : 1;
      if (h.t > h.life + 0.15) h.who = null;
    }
    return g.t >= GNOME_TIME;
  },
  draw(g, c) {
    sky(c, '#cfe3ee', '#cfe3ee');
    c.fillStyle = '#9fc46a'; c.fillRect(0, 70, AW, AH - 70);
    HOLES.forEach((p, k) => {
      c.fillStyle = '#6e4d35'; c.beginPath(); c.ellipse(p.x, p.y + 6, 44, 14, 0, 0, Math.PI * 2); c.fill();
      const h = g.holes[k];
      if (h.who === 'gnome') drawGnome(c, p.x, p.y, h.up, h.hit > 0);
      else if (h.who === 'cat') { c.save(); c.beginPath(); c.rect(p.x - 40, p.y + 6 - 90, 80, 90); c.clip(); emoji(c, '🐱', p.x, p.y + 6 - h.up * 30, 44); c.restore(); }
      c.fillStyle = '#5f402c'; c.beginPath(); c.ellipse(p.x, p.y + 10, 44, 9, 0, 0, Math.PI); c.fill(); // (the near lip of the hole)
      if (h.hit > 0 && h.who === 'gnome') { c.fillStyle = '#c8851e'; c.font = `bold 20px ${FONT}`; c.textAlign = 'center'; c.fillText('Boop!', p.x, p.y - 62); }
    });
  },
};

// ---------------------------------------------------------------------------------------------
// 🍖 Bone stack.

const BONE_H = 22, START_W = 170;

/** A cartoon bone: a shaft with two knobs at each end. (Outline first, underneath, so only its edge shows.) */
function drawBone(c, x, y, w, color = '#f4ecd8') {
  const r = BONE_H * 0.42;
  const shape = () => {
    c.beginPath();
    c.rect(x + r * 0.6, y + BONE_H * 0.22, Math.max(2, w - r * 1.2), BONE_H * 0.56);
    for (const ex of [x + r * 0.7, x + w - r * 0.7]) for (const ey of [y + r * 0.75, y + BONE_H - r * 0.75]) { c.moveTo(ex + r * 0.75, ey); c.arc(ex, ey, r * 0.75, 0, Math.PI * 2); }
  };
  c.lineWidth = 4; c.lineJoin = 'round'; c.strokeStyle = 'rgba(59,43,37,0.6)';
  shape(); c.stroke();
  c.fillStyle = color;
  shape(); c.fill('nonzero');
}

const bones = {
  info: 'Tap (or press Space) to drop the bone onto the pile. Whatever hangs over the edge falls off!',
  end: () => 'Timber!',
  init(g) {
    Object.assign(g, { pile: [{ x: AW / 2 - START_W / 2, w: START_W }], cur: { x: 20, w: START_W, dir: 1 }, falling: [], view: 0, drop: null, perfect: 0 });
  },
  down(g) { this.release(g); },
  key(g, code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'ArrowDown')) this.release(g); },
  release(g) {
    if (g.drop) return;
    g.drop = { x: g.cur.x, w: g.cur.w, y: this.topY(g) - BONE_H * 3, vy: 0 };
  },
  topY(g) { return AH - 40 - g.pile.length * BONE_H + g.view; },
  step(g, dt) {
    const speed = 150 + g.pile.length * 9;
    if (!g.drop) { // to and fro above the pile
      g.cur.x += g.cur.dir * speed * dt;
      if (g.cur.x < 10) { g.cur.x = 10; g.cur.dir = 1; }
      if (g.cur.x + g.cur.w > AW - 10) { g.cur.x = AW - 10 - g.cur.w; g.cur.dir = -1; }
    } else { // dropping
      const d = g.drop, land = this.topY(g) - BONE_H;
      d.vy += 1600 * dt; d.y += d.vy * dt;
      if (d.y >= land) {
        const below = g.pile[g.pile.length - 1], x0 = Math.max(d.x, below.x), x1 = Math.min(d.x + d.w, below.x + below.w);
        g.drop = null;
        if (x1 - x0 < 6) { g.falling.push({ x: d.x, y: land, w: d.w, vy: 0, spin: 0 }); sfx.plip?.(); return true; } // missed: that's the lot
        let nx = x0, nw = x1 - x0;
        if (Math.abs(d.x - below.x) < 5) { nx = below.x; nw = below.w; g.perfect++; g.say(g.perfect > 1 ? `Perfect! ×${g.perfect}` : 'Perfect!'); buzz(15); }
        else {
          g.perfect = 0;
          if (d.x < x0) g.falling.push({ x: d.x, y: land, w: x0 - d.x, vy: 0, spin: 0 });
          if (d.x + d.w > x1) g.falling.push({ x: x1, y: land, w: d.x + d.w - x1, vy: 0, spin: 0 });
        }
        g.pile.push({ x: nx, w: nw });
        g.score = g.pile.length - 1;
        sfx.pop?.();
        g.cur = { x: Math.random() < 0.5 ? 10 : AW - 10 - nw, w: nw, dir: Math.random() < 0.5 ? 1 : -1 };
        g.cur.dir = g.cur.x < AW / 2 ? 1 : -1;
      }
    }
    return false;
  },
  tick(g, dt) {
    // Keep the top of the pile in view, and the bits that fell off falling.
    const want = Math.max(0, g.pile.length * BONE_H - (AH - 150));
    g.view += (want - g.view) * Math.min(1, dt * 4);
    for (const f of g.falling) { f.vy += 1400 * dt; f.y += f.vy * dt; f.spin += dt * 4; }
    g.falling = g.falling.filter((f) => f.y < AH + 80);
  },
  draw(g, c) {
    sky(c, '#e8dcc4', '#f6efe0');
    c.fillStyle = '#9fc46a'; c.fillRect(0, AH - 40 + g.view, AW, 40);
    emoji(c, '🐶', AW - 40, AH - 60 + g.view, 40);
    g.pile.forEach((b, i) => drawBone(c, b.x, AH - 40 - (i + 1) * BONE_H + g.view, b.w, i === 0 ? '#e6d8b8' : '#f4ecd8'));
    for (const f of g.falling) { c.save(); c.translate(f.x + f.w / 2, f.y + BONE_H / 2); c.rotate(f.spin * (f.x < AW / 2 ? -1 : 1)); drawBone(c, -f.w / 2, -BONE_H / 2, f.w, '#ead9b8'); c.restore(); }
    if (!g.over) {
      const y = g.drop ? g.drop.y : this.topY(g) - BONE_H * 3;
      drawBone(c, g.drop ? g.drop.x : g.cur.x, y, g.drop ? g.drop.w : g.cur.w, '#fffaf0');
    }
  },
};

export const openTreats = (ctx, opts) => openArcade(ctx, 'treats', treats, opts);
export const openGnomes = (ctx, opts) => openArcade(ctx, 'gnome', gnomes, opts);
export const openBones = (ctx, opts) => openArcade(ctx, 'bones', bones, opts);
