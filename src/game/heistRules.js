// 🥐 Heists: cheeky food raids on the bakery street. Shared by the game and the server (no three.js
// here). Whoever runs a HeistRoom decides when the grown-ups look round and who has which treat, so
// every dog sees the same thing: the server, for a pack; your own game, when you play on your own.
// Times go out as "for so many ms" (everyone's clock is a bit different).

/**
 * The grown-ups keeping an eye on things, and how long they spend on each step (seconds):
 * busy (back turned) → warn (about to look round: the little warning beat) → look → busy…
 * A bark at their door distracts them (door) for a while, then they're wise to it (cool).
 */
export const LOOKOUTS = {
  baker: { busy: [3.5, 6.5], warn: 1.3, look: [2, 3.2], door: 4, cool: 4 },
};

/** The baker's trays: bk0–bk5 are croissants, bk6–bk11 iced buns. */
export const BAKERY = { croissant: 6, bun: 6 };
export const BAKERY_IDS = Array.from({ length: BAKERY.croissant + BAKERY.bun }, (_, i) => `bk${i}`);
const RESTOCK_MS = 20000, TIDY_MS = 45000; // fresh batches; treats left lying about go back

/** What a loot id is ('croissant', 'bun'…), or null if it isn't one. */
export function lootKind(id) {
  const m = /^bk(\d{1,2})$/.exec(String(id));
  if (!m) return null;
  const n = Number(m[1]);
  return n < BAKERY.croissant ? 'croissant' : n < BAKERY.croissant + BAKERY.bun ? 'bun' : null;
}
/** Whose eye is on a loot id. */
export const lookoutFor = (id) => (String(id).startsWith('bk') ? 'baker' : null);

const rand = ([a, b]) => a + Math.random() * (b - a);
const coord = (v) => (Number.isFinite(v) ? Math.max(-150, Math.min(150, Math.round(v * 100) / 100)) : 0);

/**
 * One pack's heists (or your own, playing alone). Feed it messages from dogs and call tick() often;
 * each returns a list of { to: 'all' | dog id, msg } to send. Dog ids: the server's (0 when alone).
 */
export class HeistRoom {
  constructor(now) {
    this.npcs = {};
    for (const id of Object.keys(LOOKOUTS)) this.npcs[id] = { s: 'busy', until: now + rand(LOOKOUTS[id].busy) * 1000, cool: 0, by: null, doorEnd: 0, wiseAt: 0 };
    this.loot = new Map(); // id → { s: 'home' | 'held' | 'ground' | 'gone', by, x, z, at, helper } (missing = home)
    this.restockAt = 0;
    this.budget = new Map();
  }

  /** Everything, for a dog who's just arrived. */
  snapshot(now) {
    const npcs = {};
    for (const [id, n] of Object.entries(this.npcs)) npcs[id] = { s: n.s, ms: Math.max(0, n.until - now), by: n.by };
    const loot = [...this.loot].filter(([, l]) => l.s !== 'home').map(([id, l]) => [id, l.s, l.by, l.x ?? 0, l.z ?? 0]);
    return { a: 'state', npcs, loot };
  }

  /** A message from a dog (never trust it: check everything). */
  message(pid, m, now) {
    if (!m || typeof m.a !== 'string' || !this.allow(pid, now)) return [];
    const id = String(m.id ?? '');
    switch (m.a) {
      case 'grab': return this.grab(pid, id, now);
      case 'drop': return this.update(pid, id, 'held', { s: 'ground', x: coord(m.x), z: coord(m.z) }, now);
      case 'bank': return this.update(pid, id, 'held', { s: 'gone', why: 'bank' }, now);
      case 'caught': return this.update(pid, id, 'held', { s: 'home', why: 'caught' }, now);
      case 'distract': return this.distract(pid, String(m.npc ?? ''), now);
    }
    return [];
  }

  /** A dog went home: whatever they were holding goes back where it came from. */
  leave(pid, now) {
    const out = [];
    for (const [id, l] of this.loot) if (l.s === 'held' && l.by === pid) { Object.assign(l, { s: 'home', by: null, at: now }); out.push(all({ a: 'loot', id, s: 'home', why: 'left' })); }
    this.budget.delete(pid);
    return out;
  }

  /** The grown-ups looking round, fresh batches out of the oven, tidying up. */
  tick(now) {
    const out = [];
    for (const [id, n] of Object.entries(this.npcs)) {
      if (now < n.until) continue;
      const L = LOOKOUTS[id];
      if (n.s === 'busy') this.set(n, 'warn', L.warn, now);
      else if (n.s === 'warn') this.set(n, 'look', rand(L.look), now);
      else this.set(n, 'busy', rand(L.busy), now); // (after a look, or a distraction)
      out.push(all(this.npcMsg(id, now)));
    }
    if (this.restockAt && now >= this.restockAt) {
      this.restockAt = 0;
      const ids = [];
      for (const [id, l] of this.loot) if (l.s === 'gone') { Object.assign(l, { s: 'home', by: null, at: now }); ids.push(id); }
      if (ids.length) out.push(all({ a: 'restock', npc: 'baker', ids }));
    }
    for (const [id, l] of this.loot) {
      if (l.s === 'ground' && now - l.at > TIDY_MS) { Object.assign(l, { s: 'home', at: now }); out.push(all({ a: 'loot', id, s: 'home', why: 'tidy' })); }
    }
    return out;
  }

  // ---------- inside ----------

  allow(pid, now) { // no more than 40 messages a second from any one dog
    let b = this.budget.get(pid);
    if (!b || now - b.t > 1000) this.budget.set(pid, (b = { t: now, n: 0 }));
    return ++b.n <= 40;
  }

  get(id) { let l = this.loot.get(id); if (!l) this.loot.set(id, (l = { s: 'home', by: null, at: 0 })); return l; }

  /** First dog there gets it (anyone else is told "nope", with where it really is). */
  grab(pid, id, now) {
    if (!lootKind(id)) return [];
    const l = this.get(id);
    if (l.s !== 'home' && l.s !== 'ground') return [{ to: pid, msg: { a: 'nope', id, s: l.s, by: l.by, x: l.x ?? 0, z: l.z ?? 0 } }];
    // Snatched while a friend had the grown-up distracted? That's a team heist.
    const n = this.npcs[lookoutFor(id)];
    const helper = n && n.by !== null && n.by !== pid && (n.s === 'door' || now < n.doorEnd + 1500) ? n.by : null;
    Object.assign(l, { s: 'held', by: pid, at: now, helper });
    return [all({ a: 'loot', id, s: 'held', by: pid })];
  }

  /** Something happens to a treat this dog is holding: dropped, got home, or caught red-pawed. */
  update(pid, id, from, to, now) {
    const l = lootKind(id) && this.loot.get(id);
    if (!l || l.s !== from || l.by !== pid) return [];
    const { why, ...state } = to;
    const msg = { a: 'loot', id, ...state, by: pid, why };
    if (to.s === 'gone') { msg.helper = l.helper; this.restockAt ||= now + RESTOCK_MS; }
    if (to.s === 'home') msg.npc = lookoutFor(id);
    Object.assign(l, state, { by: null, at: now, helper: to.s === 'ground' ? l.helper : null });
    return [all(msg)];
  }

  /** A bark at the door: the grown-up turns to see who it is (unless they've only just been fooled). */
  distract(pid, id, now) {
    const n = this.npcs[id];
    if (!n || n.s === 'door') return [];
    if (now < n.cool) {
      if (now < n.wiseAt) return [];
      n.wiseAt = now + 3000;
      return [all({ a: 'wise', npc: id, by: pid })];
    }
    const L = LOOKOUTS[id];
    this.set(n, 'door', L.door, now, pid);
    n.doorEnd = n.until;
    n.cool = n.until + L.cool * 1000;
    return [all(this.npcMsg(id, now))];
  }

  set(n, s, secs, now, by = null) { n.s = s; n.until = now + secs * 1000; n.by = by ?? (s === 'busy' ? null : n.by); }
  npcMsg(id, now) { const n = this.npcs[id]; return { a: 'npc', id, s: n.s, ms: Math.max(0, n.until - now), by: n.by }; }
}

const all = (msg) => ({ to: 'all', msg });
