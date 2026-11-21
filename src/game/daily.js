import { progress } from './progress.js';
import { RNG } from '../core/rng.js';
import { resolveSeason } from './seasonRules.js';

/*
 * 📅 Today's walk: three little goals a day (an easy one, a middling one and a hard one), from all over the
 * game: the town, the woods, the beach, the farm and the trips. Every dog gets the same three on the same day
 * (so friends can compare), and they're new each morning. A goal counts what's done today: the stats the game
 * keeps anyway (progress.onStat), so nothing else needs to know about it. Stars for each goal, a bonus for all
 * three (a "full walk": the `walks` stat, which the walk prizes in cosmetics.js go by), and a streak of days
 * in a row for fun (missing a day never takes anything away). Kept on this device.
 *
 *   stat   which stat it counts     n      how many today
 *   tier   1 easy · 2 middling · 3 hard      where  a hint: where to go
 *   season only offered in that season (by the calendar: every dog gets the same goals)
 */
const KEY = 'merry.walk.v1';
export const TIER_STARS = [0, 10, 20, 35];
export const FULL_BONUS = 25;
export const TIER_NAMES = ['', 'Easy', 'Trickier', 'Big one'];

export const GOALS = [
  // 1: easy, round town
  { id: 'pigeons', tier: 1, stat: 'pigeons', n: 15, emoji: '🐦', text: 'Scare 15 pigeons into the air', where: 'They peck about on the pavements and in the park.' },
  { id: 'smells', tier: 1, stat: 'smells', n: 6, emoji: '👃', text: 'Sniff out 6 smells', where: 'Hold sniff and follow the golden trail.' },
  { id: 'splashes', tier: 1, stat: 'splashes', n: 3, emoji: '💦', text: 'Make 3 big splashes', where: 'Zoom into the pond, a stream, the sea… or a puddle!' },
  { id: 'snacks', tier: 1, stat: 'snacks', n: 2, emoji: '🍕', text: 'Gobble 2 bin snacks', where: 'Knock a bin over and see what falls out.' },
  { id: 'dig2', tier: 1, stat: 'treasures', n: 2, emoji: '🎁', text: 'Dig up 2 treasures', where: 'Sniff on soft ground: gardens, the park, the woods, the beach.' },
  { id: 'puzzle', tier: 1, stat: 'puzzles', n: 1, emoji: '🧩', text: 'Solve one of Pickles’ puzzles', where: '☰ → Puzzles.' },
  { id: 'game', tier: 1, stat: 'games', n: 1, emoji: '🎮', text: 'Play a game', where: '☰ → Games: a race, the Zoomies Dash, Bone Rush…' },
  { id: 'cheeky', tier: 1, stat: 'mischief', n: 3, emoji: '😈', text: 'Be cheeky 3 times', where: 'Flowerbeds, bins, holes in lawns… (watch out for the dog warden!)' },
  { id: 'postman', tier: 1, stat: 'postman', n: 1, emoji: '📮', text: 'Chase the postman', where: 'He does his round on the pavements near home.' },
  { id: 'dogsmet', tier: 1, stat: 'dogsmet', n: 1, emoji: '🐕', text: 'Say hello to a dog out for a walk', where: 'Dog walkers stroll round the blocks.' },
  { id: 'leaves', tier: 1, stat: 'leaves', n: 3, emoji: '🍂', text: 'Leap into 3 leaf piles', where: 'Autumn: they’re heaped up round town.', season: 'autumn' },
  { id: 'snowman', tier: 1, stat: 'snowmen', n: 1, emoji: '⛄', text: 'Build a snowman', where: 'Winter: roll the snow in the park.', season: 'winter' },
  { id: 'eggs', tier: 1, stat: 'eggs', n: 2, emoji: '🥚', text: 'Sniff out 2 eggs', where: 'Spring: the egg hunt’s on!', season: 'spring' },

  // 2: trickier, often further afield
  { id: 'jobs2', tier: 2, stat: 'helped', n: 2, emoji: '📋', text: 'Do 2 jobs from the Lost & Found board', where: 'The board’s by your garden gate.' },
  { id: 'gus', tier: 2, stat: 'gus', n: 1, emoji: '🐶', text: 'Help Gus find something he’s lost', where: 'Gus the basset hound sits in the park.' },
  { id: 'duchess', tier: 2, stat: 'duchess', n: 1, emoji: '🦆', text: 'Help Duchess with her ducklings', where: 'Duchess lives by the pond.' },
  { id: 'squirrels', tier: 2, stat: 'squirrels', n: 1, emoji: '🐿️', text: 'Find Nut & Meg', where: 'The squirrel twins hide up the park trees: sniff, then woof!' },
  { id: 'pepper', tier: 2, stat: 'pepper', n: 1, emoji: '🦔', text: 'Walk Pepper to the flowers', where: 'Pepper the hedgehog is in the park.' },
  { id: 'badger', tier: 2, stat: 'badger', n: 1, emoji: '🦡', text: 'Help Brock the badger', where: 'In the woods, past the edge of town.' },
  { id: 'sticks', tier: 2, stat: 'den', n: 2, emoji: '🪵', text: 'Bring 2 big sticks to the den', where: 'In the woods. Go straight at gaps!' },
  { id: 'castle', tier: 2, stat: 'castles', n: 1, emoji: '🏰', text: 'Build a sandcastle', where: 'At the beach: dig with 🐾 on the sand.' },
  { id: 'sandy', tier: 2, stat: 'sandy', n: 1, emoji: '🛟', text: 'Help Sandy the lifeguard', where: 'At the beach, by her tall chair.' },
  { id: 'farmer', tier: 2, stat: 'farmer', n: 1, emoji: '👒', text: 'Help Farmer Mabel', where: 'At the farm, past the edge of town.' },
  { id: 'heist', tier: 2, stat: 'heists', n: 1, emoji: '🥐', text: 'Pull off a cheeky heist', where: 'Pinch a treat from the baker’s stall and run it home.' },
  { id: 'win', tier: 2, stat: 'wins', n: 1, emoji: '🏅', text: 'Win a game (or beat your best)', where: '☰ → Games.' },
  { id: 'dig4', tier: 2, stat: 'treasures', n: 4, emoji: '🎁', text: 'Dig up 4 treasures', where: 'Sniff on soft ground: gardens, the park, the woods, the beach.' },
  { id: 'rides2', tier: 2, stat: 'rides', n: 2, emoji: '🎡', text: 'Go on 2 rides at Wagtail Wonderland', where: 'Take a bus from the bus stop (Days out).' },
  { id: 'rubberducks', tier: 2, stat: 'ducks', n: 3, emoji: '🐤', text: 'Pop 3 rubber ducks in the sewer bucket', where: 'Down the drain in the alley.' },
  { id: 'fetch', tier: 2, stat: 'fetch', n: 3, emoji: '🎾', text: 'Play fetch with Grandad Ted 3 times', where: 'On the Sunny Dolphin: the boat leaves from the beach jetty.' },
  { id: 'cannonball', tier: 2, stat: 'cannonballs', n: 2, emoji: '🌊', text: 'Do 2 cannonballs in the ship’s pool', where: 'On the Sunny Dolphin: the boat leaves from the beach jetty.' },
  { id: 'conkers', tier: 2, stat: 'conkers', n: 4, emoji: '🌰', text: 'Find 4 conkers', where: 'Autumn: under the big trees.', season: 'autumn' },

  // 3: big ones
  { id: 'flock', tier: 3, stat: 'flock', n: 1, emoji: '🐑', text: 'Round up the sheep', where: 'At the farm: get behind them and walk them into the pen.' },
  { id: 'warden', tier: 3, stat: 'warden', n: 1, emoji: '🚐', text: 'Give Doug the dog warden the slip', where: 'Fill the naughty meter on your own, then run and hide!' },
  { id: 'escape', tier: 3, stat: 'escapes', n: 1, emoji: '🏠', text: 'Escape from Sunny Paws', where: 'Get caught by Doug (if you dare), then dig your way out.' },
  { id: 'nibbles', tier: 3, stat: 'nibbles', n: 1, emoji: '🐀', text: 'Bring Nibbles a lost thing', where: 'Down the drain in the alley.' },
  { id: 'sparks', tier: 3, stat: 'sparks', n: 3, emoji: '✨', text: 'Find 3 star-sparks on Planet Boing', where: 'Look for the crop circle at the farm…' },
  { id: 'blips', tier: 3, stat: 'blips', n: 2, emoji: '👽', text: 'Find 2 Blip kids on Planet Boing', where: 'They hide! Woof when you’re close.' },
  { id: 'rides4', tier: 3, stat: 'rides', n: 4, emoji: '🎢', text: 'Go on 4 rides at Wagtail Wonderland', where: 'Take a bus from the bus stop (Days out).' },
  { id: 'dolphins', tier: 3, stat: 'dolphins', n: 1, emoji: '🐬', text: 'Woof at the dolphins', where: 'Out at sea on the Sunny Dolphin, from the beach jetty.' },
  { id: 'luggage', tier: 3, stat: 'luggage', n: 1, emoji: '🧳', text: 'Find one of Mrs Pemberton’s lost things', where: 'On the Sunny Dolphin, from the beach jetty.' },
  { id: 'cat', tier: 3, stat: 'whiskers', n: 1, emoji: '🐱', text: 'Find Admiral Whiskers, the ship’s cat', where: 'Somewhere on the Sunny Dolphin…' },
  { id: 'heists2', tier: 3, stat: 'heists', n: 2, emoji: '🦝', text: 'Pull off 2 heists', where: 'The baker’s stall, the butcher’s sausages, a BBQ…' },
  { id: 'jobs3', tier: 3, stat: 'helped', n: 3, emoji: '📋', text: 'Do 3 jobs from the Lost & Found board', where: 'The board’s by your garden gate.' },
  { id: 'freed', tier: 3, stat: 'freed', n: 2, emoji: '🔑', text: 'Free 2 dogs from Sunny Paws', where: 'Get caught by Doug (if you dare), then find the keys.' },
];
export const GOAL = Object.fromEntries(GOALS.map((g) => [g.id, g]));

const pad = (n) => String(n).padStart(2, '0');
/** A day as 'YYYY-MM-DD' (this device's own calendar). */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const shiftDay = (key, by) => { const d = dayDate(key); d.setDate(d.getDate() + by); return dayKey(d); };

/**
 * The three goals for a day (easy, trickier, big): the same for everyone. None of yesterday's again: each day's
 * goals follow on from the day before's, all the way from the first day of Today's walk (kept, once worked out).
 */
const EPOCH = '2026-11-01', picked = new Map();
export function goalsFor(day) {
  if (picked.has(day)) return picked.get(day);
  if (day <= EPOCH) return pickGoals(day, new Set());
  let d = EPOCH, prev = pickGoals(d, new Set());
  for (const [k, v] of picked) if (k < day && k > d) { d = k; prev = v; } // (start from the latest day already worked out)
  while (d < day) {
    d = shiftDay(d, 1);
    prev = picked.get(d) ?? pickGoals(d, new Set(prev));
    picked.set(d, prev);
  }
  return prev;
}

function pickGoals(day, avoid) {
  const rng = new RNG(`walk:${day}`), season = resolveSeason('auto', dayDate(day)).season;
  const out = [], stats = new Set();
  for (const tier of [1, 2, 3]) {
    const all = GOALS.filter((g) => g.tier === tier && (!g.season || g.season === season) && !stats.has(g.stat));
    const fresh = all.filter((g) => !avoid.has(g.id));
    const g = rng.pick(fresh.length ? fresh : all);
    out.push(g.id);
    stats.add(g.stat);
  }
  return out;
}

class Walk {
  constructor() {
    this.listeners = new Set();
    this.onNews = null; // (emoji, head, blurb): a goal's done (the HUD shows a note)
    this.load();
    this.roll();
    progress.onStat((key, n) => this.count(key, n));
  }

  load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* private mode etc. */ }
    this.day = d.day ?? null;
    this.goals = Array.isArray(d.goals) ? d.goals.filter((id) => GOAL[id]) : [];
    this.got = d.got ?? {};       // { goalId: how many today }
    this.done = d.done ?? {};     // { goalId: true }
    this.full = !!d.full;         // all three done today
    this.streak = d.streak ?? 0;  // full walks on days in a row, up to lastFull
    this.lastFull = d.lastFull ?? null;
    this.seen = d.seen ?? null;   // the last day whose goals were looked at (☰ shows a dot till then)
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: this.day, goals: this.goals, got: this.got, done: this.done, full: this.full, streak: this.streak, lastFull: this.lastFull, seen: this.seen }));
    } catch { /* full, or private mode */ }
  }

  /** A new day? New goals. (Called before anything reads or counts.) */
  roll() {
    const day = dayKey();
    if (day === this.day && this.goals.length === 3) return false;
    this.day = day;
    this.goals = goalsFor(day);
    this.got = {};
    this.done = {};
    this.full = false;
    this.save();
    return true;
  }

  /** Something was done (a stat earned on this device). */
  count(key, n) {
    if (this.roll()) this.tell();
    let changed = false;
    for (const id of this.goals) {
      const g = GOAL[id];
      if (g.stat !== key || this.done[id]) continue;
      this.got[id] = Math.min(g.n, (this.got[id] ?? 0) + n);
      changed = true;
      if (this.got[id] >= g.n) this.finish(g);
    }
    if (changed) { this.save(); this.tell(); }
  }

  finish(g) {
    this.done[g.id] = true;
    const left = this.goals.filter((id) => !this.done[id]).length;
    progress.award(TIER_STARS[g.tier], 'Today’s walk!');
    if (!left) {
      this.full = true;
      this.streak = this.lastFull === shiftDay(this.day, -1) ? this.streak + 1 : 1;
      this.lastFull = this.day;
      const won = progress.statWon('walks');
      progress.award(FULL_BONUS, 'A full walk!');
      const streak = this.streak > 1 ? ` That’s ${this.streak} days in a row!` : '';
      setTimeout(() => this.onNews?.('📅', 'Today’s walk: all done!', `${g.emoji} ${g.text}: done! +${FULL_BONUS} ⭐ bonus.${streak} New goals tomorrow.`), 400);
      for (const c of won) setTimeout(() => this.onNews?.('🎁', `You won the ${c.emoji} ${c.name}!`, 'For your walks. Wear it from 🐶 My dog → Dress up.'), 1400);
    } else {
      this.onNews?.('📅', `Today’s walk: ${g.text}!`, `${g.emoji} Done! ${left} more to go (☰ → Today’s walk).`);
    }
  }

  /** Today's goals for the card: [{ ...goal, got, done }]. */
  list() {
    this.roll();
    return this.goals.map((id) => ({ ...GOAL[id], got: this.got[id] ?? 0, done: !!this.done[id] }));
  }

  /** Today's goals haven't been looked at yet. */
  get unseen() { this.roll(); return this.seen !== this.day; }
  markSeen() { if (this.unseen) { this.seen = this.day; this.save(); this.tell(); } }

  get doneCount() { this.roll(); return this.goals.filter((id) => this.done[id]).length; }

  /** Days in a row with a full walk (0 if the last one was before yesterday). */
  get currentStreak() {
    this.roll();
    return this.lastFull === this.day || this.lastFull === shiftDay(this.day, -1) ? this.streak : 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  tell() { for (const fn of this.listeners) fn(); }
}

export const walk = new Walk();
