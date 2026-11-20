import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { PuzzleSession, puzzleSave, solved, prizeLine, howLine } from './puzzle.js';
import { postcard } from './jigsaw.js';

/**
 * 🔲 Sliding postcard: a snap of the painted view, cut into squares with the last one taken out, then slid
 * about. Tap a square next to the gap (or anywhere in line with it) to slide it along; arrow keys work too.
 * Quicker is better. Muddled by sliding, so it can always be solved.
 */
const SIZES = { 3: { stars: 15 }, 4: { stars: 25 } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Snap the view and open the puzzle. ctx: { hud, player }; pipeline: its snap hook copies the next picture. */
export function openSlider(ctx, { pipeline, where, onEnd = null }) {
  const S = new PuzzleSession(ctx, { onEnd });
  S.show('<h1>🔲 Sliding postcard</h1><p>Say cheese! Snapping the view…</p>', [['Close', () => S.close()]]);
  let got = false;
  const fail = () => S.show('<h1>🔲 Sliding postcard</h1><p>The camera’s not working just now. Try again in a moment!</p>', [['OK', () => S.close()]]);
  pipeline.snap = (canvas) => {
    got = true;
    let card = null;
    try { card = postcard(canvas); } catch { /* (a browser that won't let us read the picture) */ }
    if (S.over) return;
    if (!card) return fail();
    sfx.pop?.();
    choose(S, card, where);
  };
  setTimeout(() => { if (got || S.over) return; pipeline.snap = null; fail(); }, 4000);
  return S;
}

function choose(S, card, where) {
  const best = (n) => { const b = puzzleSave.best(`slider:${n}`); return b ? `<small>best ${b}s</small>` : ''; };
  S.show(`<h1>🔲 ${esc(where)}</h1><div class="jg-card pick" style="--ar:${card.ar.toFixed(3)}; background-image:url(${card.url})"></div>
    <p class="small">How many squares? (One goes missing, to make room for sliding.)</p>`, [
    [`3 × 3${best(3)}`, () => play(S, card, where, 3)],
    [`4 × 4 (tricky!)${best(4)}`, () => play(S, card, where, 4)],
    ['Close', () => S.close()],
  ]);
}

/** Solved, then muddled by lots of random slides (so it's always solvable), and never left solved. */
function muddle(n) {
  const N = n * n, a = [...Array(N).keys()]; // a[slot] = piece; piece N-1 is the gap
  let gap = N - 1, last = -1;
  for (let k = 0; k < n * n * 30 || a.every((p, i) => p === i); k++) {
    const r = Math.floor(gap / n), c = gap % n;
    const moves = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < n && x < n).map(([y, x]) => y * n + x).filter((s) => s !== last);
    const s = moves[Math.floor(Math.random() * moves.length)];
    [a[gap], a[s]] = [a[s], a[gap]];
    last = gap; gap = s;
  }
  return a;
}

function play(S, card, where, n) {
  const N = n * n, slots = muddle(n), t0 = performance.now();
  let moves = 0, done = false;
  const page = S.show(`<h1>🔲 ${esc(where)}</h1>
    <div class="jg-board sl-board" style="--n:${n}; --ar:${card.ar.toFixed(3)}">${slots.map((_, k) => `<button class="jg-tile" data-k="${k}" aria-label="A square"></button>`).join('')}</div>
    <p class="small jg-info">Tap a square next to the gap to slide it. Moves: <b>0</b></p>`, [['Close', () => S.close()]]);
  const board = page.querySelector('.jg-board'), tiles = [...board.children];
  const paint = () => tiles.forEach((t, k) => {
    const p = slots[k], r = Math.floor(p / n), c = p % n, gap = p === N - 1 && !done;
    t.style.backgroundImage = gap ? 'none' : `url(${card.url})`;
    t.style.backgroundPosition = `${(c / (n - 1)) * 100}% ${(r / (n - 1)) * 100}%`;
    t.classList.toggle('gap', gap);
    t.classList.toggle('ok', p === k && !gap);
  });
  paint();
  /** Slide the squares between `k` and the gap (same row or column) one step towards the gap. */
  const slide = (k) => {
    if (done || S.over) return;
    const g = slots.indexOf(N - 1), gr = Math.floor(g / n), gc = g % n, r = Math.floor(k / n), c = k % n;
    if (k === g || (r !== gr && c !== gc)) return;
    const step = r === gr ? (c < gc ? -1 : 1) : (r < gr ? -n : n);
    for (let s = g; s !== k; s += step) [slots[s], slots[s + step]] = [slots[s + step], slots[s]];
    moves++;
    page.querySelector('.jg-info b').textContent = moves;
    sfx.plip?.();
    if (slots.every((p, i) => p === i)) {
      done = true;
      board.classList.add('solved');
      paint();
      sfx.pop?.(); buzz([15, 25, 15]);
      const secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
      window.removeEventListener('keydown', onKey);
      setTimeout(() => finish(S, card, where, n, secs, moves), 900);
      return;
    }
    paint();
  };
  board.onclick = (e) => { const t = e.target.closest('.jg-tile'); if (t) slide(Number(t.dataset.k)); };
  // Arrow keys: the square on that side of the gap slides into it.
  const onKey = (e) => {
    if (S.over) { window.removeEventListener('keydown', onKey); return; }
    const g = slots.indexOf(N - 1), gr = Math.floor(g / n), gc = g % n;
    const to = { ArrowLeft: [gr, gc + 1], ArrowRight: [gr, gc - 1], ArrowUp: [gr + 1, gc], ArrowDown: [gr - 1, gc] }[e.code];
    if (!to || to[0] < 0 || to[1] < 0 || to[0] >= n || to[1] >= n) return;
    e.preventDefault();
    slide(to[0] * n + to[1]);
  };
  window.addEventListener('keydown', onKey);
}

function finish(S, card, where, n, secs, moves) {
  if (S.over) return;
  const r = solved('slider', `slider:${n}`, secs, SIZES[n].stars);
  S.show(`<h1>🔲 Greetings from ${esc(where)}!</h1><div class="jg-card done" style="--ar:${card.ar.toFixed(3)}; background-image:url(${card.url})"></div>
    <p>Back together in <b>${secs}s</b> (${moves} slides). ${howLine(r, 's')}</p>${prizeLine(r.prize, r.unlocked)}`,
  [['🔁 Again!', () => play(S, card, where, n)], ['Close', () => S.close()]]);
}
