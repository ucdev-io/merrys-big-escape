import { progress } from '../progress.js';
import { PALS, PAL } from './roster.js';

/*
 * 🐾 Who your pals are, and which of them are in your crew (following you about).
 *
 * A pal is a stat: `pal<id>` (palbiscuit…), 1 the day you make friends and +1 every time you play their game
 * again (how good friends you are). Stats are saved with your dog (and on the game server, when there is one),
 * so your pals follow your dog to any device. Who's following you is a choice, not a count, so it's kept
 * on this device, per dog: up to MAX_CREW of your pals, in the order they joined.
 */
export const MAX_CREW = 3;
const KEY = 'merry.crew.v1';
export const palStat = (id) => `pal${id}`;

const dogKey = () => progress.id ?? 'local';
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function store(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ } }

const listeners = new Set();
const tell = () => { for (const fn of listeners) fn(); };

export const pals = {
  /** Friends with this town dog? */
  isPal: (id) => (progress.stats[palStat(id)] ?? 0) > 0,
  /** How good friends (0: not yet). */
  bond: (id) => progress.stats[palStat(id)] ?? 0,
  /** Every pal, in roster order. */
  all: () => PALS.filter((p) => pals.isPal(p.id)),

  /** Who's following you (ids: pals only, at most MAX_CREW). */
  following() {
    const all = load(), ids = all[dogKey()] ?? all.local; // (a dog just saved on the game server keeps the crew it had on this device)
    return (Array.isArray(ids) ? ids : []).filter((id) => PAL[id] && pals.isPal(id)).slice(0, MAX_CREW);
  },
  setFollowing(ids) {
    const all = load();
    all[dogKey()] = [...new Set(ids)].filter((id) => PAL[id] && pals.isPal(id)).slice(0, MAX_CREW);
    store(all);
    tell();
  },
  isFollowing: (id) => pals.following().includes(id),

  /**
   * Made friends with a town dog (or played their game again). Returns { first, room }: first time
   * friends? Room in the crew for them? (Whether they come along is up to the player: see Crew.welcome.)
   */
  befriend(id) {
    if (!PAL[id]) return { first: false, room: false };
    const first = !pals.isPal(id);
    progress.stat(palStat(id));
    tell();
    return { first, room: pals.following().length < MAX_CREW };
  },

  /** Hear about any change (new pal, crew changed): fn(). Returns "stop listening". */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// (Another saved dog chosen in the lobby, or stats caught up from another device: a different crew.)
progress.on((e) => { if (e.synced) tell(); });
