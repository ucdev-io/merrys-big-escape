import { progress } from '../../game/progress.js';
import { COSMETICS } from '../../game/cosmetics.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';

/*
 * 🧩 Puzzles: games for the brain, not the legs (no running about needed). Each one plays in a card,
 * and the dog sits still while it's open. Which puzzles you've found, your bests and how often you've
 * played are kept on this device; solving one earns stars (a few more for a new best) and counts towards
 * the 🎓 Thinking cap.
 */
const KEY = 'merry.puzzles.v1';

/** Every puzzle: how you find it (hint), and what a solve is worth. */
export const PUZZLES = {
  pawmatch: { emoji: '🐾', name: 'Pickles’ Paw Match', blurb: 'Pickles’ memory game: find the pairs of smells.', hint: 'Pickles sits on your garden fence. Go and say hello!', stars: 15 },
  jigsaw: { emoji: '📮', name: 'Postcard jigsaw', blurb: 'Snap a postcard of the view, then put it back together.', hint: 'Find a place for your Sniff Book first.', stars: 15 },
};

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return d; } catch { /* private mode etc. */ }
  return {};
}
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* full, or private mode */ } }

/** What's kept: { found: { id: when }, best: { key: n }, plays: { id: n } }. */
export const puzzleSave = {
  found: (id) => !!load().found?.[id],
  /** Found it just now? (false if it was already found) */
  find(id) {
    const d = load();
    if (d.found?.[id]) return false;
    (d.found ??= {})[id] = Date.now();
    save(d);
    return true;
  },
  best: (key) => load().best?.[key] ?? null,
  plays: (id) => load().plays?.[id] ?? 0,
};

/**
 * Solved! Keeps the best (lower is better: goes, seconds), and gives the stars (5 more for beating your best).
 * Returns { best, prev, newBest, prize } (prize: a thing to wear that this just won, or null).
 */
export function solved(id, key, score, stars = PUZZLES[id].stars) {
  const d = load(), prev = d.best?.[key] ?? null, newBest = prev === null || score < prev;
  if (newBest) (d.best ??= {})[key] = score;
  (d.plays ??= {})[id] = (d.plays[id] ?? 0) + 1;
  save(d);
  const prizes = COSMETICS.filter((c) => c.friend === 'puzzles'), had = prizes.filter((c) => progress.isUnlocked(c.id));
  progress.stat('puzzles');
  progress.award(stars + (newBest && prev !== null ? 5 : 0), `${PUZZLES[id].name}!`);
  sfx.hooray?.();
  buzz([30, 50, 30]);
  const prize = prizes.find((c) => !had.includes(c) && progress.isUnlocked(c.id)) ?? null;
  return { best: newBest ? score : prev, prev, newBest, prize };
}

/**
 * A puzzle on screen: one or more cards in a row (the game, then how you did, then again…). The dog
 * sits still from open until the puzzle's last card goes, however it goes (Close, or some other card
 * taking its place).
 */
export class PuzzleSession {
  constructor({ hud, player }, { onEnd = null } = {}) {
    Object.assign(this, { hud, player, onEnd });
    this.over = false;
    this.froze = !player.frozen; // (only let go what we held)
    if (this.froze) { player.frozen = true; player.vel?.set(0, 0); }
  }

  /** Show a card of this puzzle (it doesn't end the puzzle). Returns the card's page. */
  show(html, buttons = []) {
    if (this.over) return null;
    this.switching = true;
    this.hud.showCard(html, buttons, { onClose: () => { if (!this.switching) this.end(); } });
    this.switching = false;
    return this.hud.card.querySelector('.page');
  }

  close() { this.hud.hideCard(); this.end(); }

  end() {
    if (this.over) return;
    this.over = true;
    if (this.froze) this.player.frozen = false;
    this.onEnd?.();
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "🎁 You won the 🎓 Thinking cap!" (or nothing). */
export const prizeLine = (prize) => (prize ? `<p class="rec-badge">🎁 You won the ${prize.emoji} ${esc(prize.name)}! Wear it from the ☰ menu.</p>` : '');

/**
 * ☰ → 🧩 Puzzles: the ones you've found (tap to play), and hints for the rest.
 * @param play  { [id]: () → open that puzzle } (missing: can't be played just now)
 */
export function showPuzzleList(hud, play, { why = null } = {}) {
  const rows = Object.entries(PUZZLES).map(([id, P]) => {
    const found = puzzleSave.found(id), n = puzzleSave.plays(id);
    return `<div class="slot puzzle-slot ${found ? 'got' : ''}"><div class="emoji">${found ? P.emoji : '❔'}</div>
      <div class="name">${found ? P.name : '???'}</div><div class="blurb">${found ? P.blurb : P.hint}</div>
      ${found ? `<button class="pill big p-play" data-p="${id}">▶ Play</button>${n ? `<div class="blurb">Solved ${n} time${n === 1 ? '' : 's'}</div>` : ''}` : ''}</div>`;
  }).join('');
  hud.showCard(`<h1>🧩 Puzzles</h1><p class="small">Games for your brain: no running about needed.</p><div class="slots puzzles">${rows}</div>`, [['Close', () => hud.hideCard()]]);
  hud.card.querySelectorAll('.p-play').forEach((b) => {
    b.onclick = () => {
      const why2 = why?.();
      if (why2) { hud.hideCard(); hud.showToastRaw('🧩', why2, '', { tip: true }); return; }
      play[b.dataset.p]?.();
    };
  });
}
