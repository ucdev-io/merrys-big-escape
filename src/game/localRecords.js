// 🏆 Records kept on this device, for games played without the game server (on your own, or in the web
// demo). The same rules as the pack records (server/store.js addResults): each dog (or team line-up)
// keeps just its best on a board, best first, plus its own personal bests.
import { CHALLENGES, CHALLENGE_IDS, boardKey, better } from './challenges.js';

const KEY = 'merry.records.v1', BOARD_MAX = 10;
const name = (s) => String(s ?? '').slice(0, 14) || 'Doggo';

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') return { boards: d.boards ?? {}, bests: d.bests ?? {} };
  } catch { /* private mode etc. */ }
  return { boards: {}, bests: {} };
}
function save(R) { try { localStorage.setItem(KEY, JSON.stringify(R)); } catch { /* full, or private mode */ } }

const publicEntry = ({ who, ...e }) => e;

/**
 * Put a game's results on this device's board. entries: [{ name, breed, profile, score?, ms? }] or, for a
 * team, [{ team: [names], profiles: [ids], score, ms }]. Returns { key, board (top 5), results: per entry
 * { rank (1 = the record; null = not in the top ten), record, best } } (or null: no board for this game).
 */
export function addResults(kind, town, entries) {
  if (!CHALLENGES[kind]?.rank) return null;
  const R = load(), key = boardKey(kind, String(town ?? '')), board = (R.boards[key] ??= []);
  const tidy = entries.map((e) => {
    const entry = { name: name(e.name ?? e.team?.[0]), breed: e.breed ?? 'merry', at: Date.now() };
    if (e.team) entry.team = e.team.slice(0, 8).map(name);
    if (e.score !== undefined) entry.score = Math.max(0, Math.floor(Number(e.score) || 0));
    if (e.ms !== undefined) entry.ms = Math.max(0, Math.floor(Number(e.ms) || 0));
    // (A dog here is its saved id, or just its name: in the demo nobody has a saved dog.)
    const dogs = entry.team ? (e.profiles ?? []).map((id, i) => id || `name:${entry.team[i]}`) : [e.profile || `name:${entry.name}`];
    entry.who = entry.team ? `team:${[...entry.team].sort().join(',')}` : dogs[0];
    return { entry, dogs };
  });
  const order = tidy.map((t, i) => i).sort((a, b) => (better(kind, tidy[a].entry, tidy[b].entry) ? -1 : better(kind, tidy[b].entry, tidy[a].entry) ? 1 : 0));
  const results = [];
  for (const i of order) {
    const { entry, dogs } = tidy[i];
    let best = false;
    for (const id of dogs) {
      const mine = (R.bests[id] ??= {});
      if (better(kind, entry, mine[key])) { mine[key] = { score: entry.score, ms: entry.ms }; best = true; }
    }
    const old = board.findIndex((b) => b.who === entry.who);
    let rank = null;
    if (old < 0 || better(kind, entry, board[old])) {
      if (old >= 0) board.splice(old, 1);
      let at = board.findIndex((b) => better(kind, entry, b));
      if (at < 0) at = board.length;
      if (at < BOARD_MAX) { board.splice(at, 0, entry); rank = at + 1; }
      board.length = Math.min(board.length, BOARD_MAX);
    }
    results[i] = { rank, record: rank === 1, best };
  }
  save(R);
  return { key, results, board: board.slice(0, 5).map(publicEntry) };
}

/** Every challenge's board on this device (this neighbourhood's own, for course ones), top 5, and a dog's own bests. */
export function getRecords(town, profile, dogName) {
  const R = load(), boards = {}, mine = {}, id = profile || (dogName ? `name:${name(dogName)}` : null);
  for (const kind of CHALLENGE_IDS) {
    if (!CHALLENGES[kind].rank) continue;
    const key = boardKey(kind, String(town ?? ''));
    boards[kind] = (R.boards[key] ?? []).slice(0, 5).map(publicEntry);
    if (id && R.bests[id]?.[key]) mine[kind] = R.bests[id][key];
  }
  return { boards, mine };
}
