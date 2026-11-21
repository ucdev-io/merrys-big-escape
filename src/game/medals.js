import { progress } from './progress.js';

/*
 * 🥇 Medals: bronze, silver and gold targets for the games (your own score, on your own or in a pack) and
 * Pickles' arcade games, so there's always something to aim for besides "beat your best". The best medal
 * each game has given you is kept on this device; a gold for the first time counts towards the `golds`
 * stat (5 golds: the 🥇 Gold medal to wear, see cosmetics.js).
 *
 * A game's result: { score } (more is better), { ms, length } for the Zoomies Dash (each town's course is
 * its own length, so its targets go by that), { score, ms } for the Duck Round-Up (score: ducks safe).
 */
const KEY = 'merry.medals.v1';
export const MEDALS = ['', '🥉', '🥈', '🥇'];
export const MEDAL_NAMES = ['', 'Bronze', 'Silver', 'Gold'];

const secs = (ms) => { const s = ms / 1000; return s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s)}s`; };
const DASH_SPEEDS = [0, 3.0, 4.0]; // m/s round the course for silver and gold (bronze: just finish)
const DUCKS_GOLD_MS = 100000;

/** Every game with medals. targets: [bronze, silver, gold] for most-is-best games. */
export const MEDAL_GAMES = {
  bones: { emoji: '🦴', name: 'Bone Rush', where: 'game', unit: 'bones', targets: [8, 14, 20] },
  pigeons: { emoji: '🐦', name: 'Pigeon Panic', where: 'game', unit: 'pigeons', targets: [20, 45, 75] },
  dash: { emoji: '⚡', name: 'Zoomies Dash', where: 'game' },
  ducks: { emoji: '🦆', name: 'Duck Round-Up', where: 'game' },
  'arcade:treats': { emoji: '🦴', name: 'Catch the treats', where: 'arcade', unit: 'points', targets: [20, 40, 60] },
  'arcade:gnome': { emoji: '🍄', name: 'Whack-a-gnome', where: 'arcade', unit: 'points', targets: [15, 28, 40] },
  'arcade:bones': { emoji: '🍖', name: 'Bone stack', where: 'arcade', unit: 'bones high', targets: [6, 12, 18] },
};
export const MEDAL_KEYS = Object.keys(MEDAL_GAMES);

/** Which medal (0 none … 3 gold) a result earns. */
export function medalFor(key, r) {
  const G = MEDAL_GAMES[key];
  if (!G || !r) return 0;
  if (key === 'dash') {
    if (!(r.ms > 0)) return 0;
    let m = 1;
    for (let i = 1; i <= 2; i++) if (r.length && r.ms <= (r.length / DASH_SPEEDS[i]) * 1000) m = i + 1;
    return m;
  }
  if (key === 'ducks') {
    const all = r.score >= 6;
    return all && r.ms && r.ms <= DUCKS_GOLD_MS ? 3 : all ? 2 : r.score >= 3 ? 1 : 0;
  }
  let m = 0;
  G.targets.forEach((t, i) => { if ((r.score ?? 0) >= t) m = i + 1; });
  return m;
}

/** The three targets in words: ['8 bones', '14 bones', '20 bones'] (the Dash needs its course length). */
export function targetWords(key, length = null) {
  const G = MEDAL_GAMES[key];
  if (key === 'dash') return ['finish the course', ...DASH_SPEEDS.slice(1).map((v) => (length ? `under ${secs((length / v) * 1000)}` : v === 3 ? 'a quick time' : 'a super-quick time'))];
  if (key === 'ducks') return ['3 ducks in the pond', 'all 6 ducks', `all 6 in under ${secs(DUCKS_GOLD_MS)}`];
  return G.targets.map((t) => `${t} ${G.unit}`);
}

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return d; } catch { /* private mode etc. */ }
  return {};
}

/** The best medal this game has given you (0 … 3). */
export const bestMedal = (key) => load()[key] ?? 0;

/** How many of each: [_, bronze, silver, gold] (each game counts once, at its best). */
export function medalCounts() {
  const d = load(), n = [0, 0, 0, 0];
  for (const k of MEDAL_KEYS) if (d[k]) n[d[k]]++;
  return n;
}

/**
 * A game's over: which medal did it earn, and is it a better one than before? Gives a few stars for a
 * better medal, and a first gold counts for the `golds` stat. Returns { medal, prev, better }.
 */
export function awardMedal(key, result) {
  const medal = medalFor(key, result), d = load(), prev = d[key] ?? 0;
  const better = medal > prev;
  let won = [];
  if (better) {
    d[key] = medal;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* full, or private mode */ }
    progress.award([0, 5, 10, 20][medal] - [0, 5, 10, 20][prev], `${MEDAL_NAMES[medal]} medal!`);
    if (medal === 3) won = progress.statWon('golds');
  }
  return { medal, prev, better, won };
}

/** The medal part of a results card: "🥈 Silver medal! Next: 🥇 20 bones" (or a nudge towards bronze). */
export function medalLine(key, { medal, prev, better, won = [] }, length = null) {
  const words = targetWords(key, length), next = Math.max(medal, prev) + 1;
  const goal = next <= 3 ? `<br><small>Next: ${MEDALS[next]} ${words[next - 1]}</small>` : '<br><small>That’s the best medal there is!</small>';
  const prize = won.map((c) => `<p class="rec-badge">🎁 You won the ${c.emoji} ${c.name}! Wear it from the ☰ menu.</p>`).join('');
  if (medal && better) return `<p class="medal-line">${MEDALS[medal]} <b>${MEDAL_NAMES[medal]} medal${prev ? ' (a new best!)' : ''}!</b>${goal}</p>${prize}`;
  if (medal) return `<p class="medal-line small">${MEDALS[medal]} ${MEDAL_NAMES[medal]} again!${goal}</p>`;
  return `<p class="medal-line small">${MEDALS[1]} Bronze: ${words[0]}. You can do it!</p>`;
}

/** 🥇 Medals card body: every game, its best medal and its targets. */
export function medalsHtml(dashLength = null) {
  const d = load(), n = medalCounts();
  const rows = MEDAL_KEYS.map((k) => {
    const G = MEDAL_GAMES[k], m = d[k] ?? 0, w = targetWords(k, dashLength);
    return `<div class="medal-row ${m ? 'got' : ''}"><span class="m-best">${m ? MEDALS[m] : '⚪'}</span><span class="m-name">${G.emoji} ${G.name}<small>${G.where === 'arcade' ? 'Pickles’ arcade (☰ → Puzzles)' : '☰ → Games'}</small></span>
      <span class="m-targets">${[1, 2, 3].map((i) => `<i class="${m >= i ? 'on' : ''}">${MEDALS[i]} ${w[i - 1]}</i>`).join('')}</span></div>`;
  }).join('');
  return `<h1>🥇 Medals</h1><p class="small">🥇 ${n[3]} · 🥈 ${n[2]} · 🥉 ${n[1]} &nbsp;·&nbsp; Win 5 golds for a medal to wear!</p><div class="medal-rows">${rows}</div>`;
}
