import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { PuzzleSession, puzzleSave, solved, prizeLine } from './puzzle.js';

/**
 * 📮 Postcard jigsaw: a snap of the painted view right now (whatever the camera sees: Merry, the street,
 * the sea…), cut into 9 or 16 squares and muddled up. Tap two pieces to swap them; a piece in its right
 * place stays put. Quicker is better.
 */
const SIZES = { 3: { stars: 15 }, 4: { stars: 25 } };
const MAX_W = 720; // (the postcard's size: plenty for a phone's card, and quick to copy)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A copy of the finished picture (a landscape or portrait card shape, not a sliver), as a JPEG. */
function postcard(canvas) {
  const W = canvas.width, H = canvas.height;
  const ar = Math.min(16 / 9, Math.max(3 / 4, W / H)); // (very wide or very tall screens: the middle of it)
  const sw = Math.min(W, H * ar), sh = sw / ar;
  const out = document.createElement('canvas');
  const scale = Math.min(1, MAX_W / Math.max(sw, sh));
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  out.getContext('2d').drawImage(canvas, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, out.width, out.height);
  return { url: out.toDataURL('image/jpeg', 0.85), ar };
}

/**
 * Snap the view and open the puzzle. ctx: { hud, player }; pipeline: the watercolour pipeline (its
 * snap hook copies the very next picture); where: "the Park", "Bramble End"… for the postcard.
 */
export function openJigsaw(ctx, { pipeline, where, onEnd = null }) {
  const S = new PuzzleSession(ctx, { onEnd });
  S.show('<h1>📮 Postcard jigsaw</h1><p>Say cheese! Snapping the view…</p>', [['Close', () => S.close()]]);
  let got = false;
  pipeline.snap = (canvas) => {
    got = true;
    let card = null;
    try { card = postcard(canvas); } catch { /* (a browser that won't let us read the picture) */ }
    if (S.over) return;
    if (!card) { S.show('<h1>📮 Postcard jigsaw</h1><p>The camera’s not working just now. Try again in a moment!</p>', [['OK', () => S.close()]]); return; }
    sfx.pop?.();
    choose(S, card, where);
  };
  setTimeout(() => {
    if (got || S.over) return;
    pipeline.snap = null;
    S.show('<h1>📮 Postcard jigsaw</h1><p>The camera’s not working just now. Try again in a moment!</p>', [['OK', () => S.close()]]);
  }, 4000);
  return S;
}

const picture = (card, cls = '') => `<div class="jg-card ${cls}" style="--ar:${card.ar.toFixed(3)}; background-image:url(${card.url})"></div>`;

/** The postcard, whole, and how many pieces to cut it into. */
function choose(S, card, where) {
  const best = (n) => { const b = puzzleSave.best(`jigsaw:${n}`); return b ? `<small>best ${b}s</small>` : ''; };
  S.show(`<h1>📮 Greetings from ${esc(where)}!</h1>${picture(card, 'pick')}<p class="small">How many pieces shall we cut it into?</p>`, [
    [`🧩 9 pieces${best(3)}`, () => play(S, card, where, 3)],
    [`🧩 16 pieces${best(4)}`, () => play(S, card, where, 4)],
    ['Close', () => S.close()],
  ]);
}

/** Muddled up, with at most one piece left where it belongs (and never already solved). */
function muddle(n) {
  const N = n * n;
  for (;;) {
    const a = [...Array(N).keys()];
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.filter((p, k) => p === k).length <= 1) return a;
  }
}

function play(S, card, where, n) {
  const slots = muddle(n), t0 = performance.now();
  let sel = null, swaps = 0, done = false;
  const page = S.show(`<h1>📮 ${esc(where)}</h1>
    <div class="jg-board" style="--n:${n}; --ar:${card.ar.toFixed(3)}">${slots.map((_, k) => `<button class="jg-tile" data-k="${k}" aria-label="A piece"></button>`).join('')}</div>
    <p class="small jg-info">Tap two pieces to swap them. Swaps: <b>0</b></p>`, [['Close', () => S.close()]]);
  const board = page.querySelector('.jg-board'), tiles = [...board.children];
  const paint = () => tiles.forEach((t, k) => {
    const p = slots[k], r = Math.floor(p / n), c = p % n;
    t.style.backgroundImage = `url(${card.url})`;
    t.style.backgroundPosition = `${(c / (n - 1)) * 100}% ${(r / (n - 1)) * 100}%`;
    t.classList.toggle('ok', p === k);
    t.classList.toggle('sel', k === sel);
  });
  paint();
  board.onclick = (e) => {
    const t = e.target.closest('.jg-tile');
    if (!t || done || S.over) return;
    const k = Number(t.dataset.k);
    if (slots[k] === k) return; // (in its right place: it stays put)
    if (sel === null || sel === k) { sel = sel === k ? null : k; sfx.plip?.(); paint(); return; }
    [slots[sel], slots[k]] = [slots[k], slots[sel]];
    swaps++;
    const fits = (slots[sel] === sel) + (slots[k] === k);
    sel = null;
    paint();
    page.querySelector('.jg-info b').textContent = swaps;
    if (fits) { sfx.pop?.(); buzz(15); } else sfx.plip?.();
    if (slots.every((p, i) => p === i)) {
      done = true;
      board.classList.add('solved');
      const secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
      setTimeout(() => finish(S, card, where, n, secs, swaps), 900);
    }
  };
}

function finish(S, card, where, n, secs, swaps) {
  if (S.over) return;
  const r = solved('jigsaw', `jigsaw:${n}`, secs, SIZES[n].stars);
  const how = r.newBest
    ? r.prev !== null ? `🎉 A new best! (It was ${r.prev}s.)` : 'Your first one this size: now try to beat it!'
    : `Your best is ${r.best}s.`;
  S.show(`<h1>📮 Greetings from ${esc(where)}!</h1>${picture(card, 'done')}
    <p>All ${n * n} pieces in <b>${secs}s</b> (${swaps} swaps). ${how}</p>${prizeLine(r.prize)}
    <p class="small">Go somewhere new for a different postcard!</p>`,
  [['🔁 Again!', () => play(S, card, where, n)], ['Close', () => S.close()]]);
}
