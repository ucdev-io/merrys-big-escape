// 🏖️ Sandcastles at the beach, built by the whole pack: the rules shared by the game and the server (no
// three.js here). Each beach has a few sandcastle spots (sc0, sc1…); a castle goes up a stage at a time
// (a heap, a keep, towers and walls, then a flag and shells: CASTLE.stages), a pat of a paw each, and anyone
// can help; zoom into one (or jump on it) and it's flat again. Whoever runs a BeachRoom settles it, so every
// dog in a pack sees the same: the server (server/beach.js, which keeps them with the town's save), or your
// own game when you play on your own.

export const CASTLE = { stages: 4, buildGapMs: 260, knockGapMs: 600, max: 12 };
const ID = /^sc(\d{1,2})$/;
const all = (msg) => ({ to: 'all', msg });

/** A castle's index from its id ('sc3' → 3), or -1 if it isn't one. */
export function castleIndex(id) {
  const m = ID.exec(String(id ?? ''));
  return m && Number(m[1]) < CASTLE.max ? Number(m[1]) : -1;
}

/** Castle stages from anywhere (a save, a message): CASTLE.max whole numbers from 0 to CASTLE.stages. */
export function cleanCastles(v) {
  const list = Array.isArray(v) ? v : [];
  return Array.from({ length: CASTLE.max }, (_, i) => Math.max(0, Math.min(CASTLE.stages, Math.floor(Number(list[i]) || 0))));
}

/**
 * One beach's sandcastles (a pack's, or your own). Feed it messages from dogs; each call returns a list of
 * { to: 'all' | dog id, msg } to send. Messages: { a: 'castle', id: 'sc3', op: 'build' | 'knock' }.
 */
export class BeachRoom {
  /** saved: the castles' stages from last time (the town's save), if any. */
  constructor(saved = null) {
    this.castles = cleanCastles(saved).map((s) => ({ s, at: -1e9, team: [] }));
    this.budget = new Map();
  }

  /** Everything, for a dog who's just arrived. */
  snapshot() { return { a: 'state', castles: this.save() }; }

  /** What's worth keeping with the town. */
  save() { return this.castles.map((c) => c.s); }

  /** A message from a dog (never trust it: check everything). */
  message(pid, m, now) {
    if (!m || m.a !== 'castle' || !this.allow(pid, now)) return [];
    const i = castleIndex(m.id);
    if (i < 0) return [];
    const c = this.castles[i], id = `sc${i}`;
    if (m.op === 'build') {
      if (c.s >= CASTLE.stages || now - c.at < CASTLE.buildGapMs) return [];
      c.s++; c.at = now;
      if (!c.team.includes(pid) && c.team.length < 8) c.team.push(pid);
      const msg = { a: 'castle', id, op: 'build', s: c.s, by: pid };
      if (c.s === CASTLE.stages) { msg.team = c.team; c.team = []; } // finished! (everyone who helped gets the credit)
      return [all(msg)];
    }
    if (m.op === 'knock') {
      if (c.s < 1 || now - c.at < CASTLE.knockGapMs) return [];
      Object.assign(c, { s: 0, at: now, team: [] });
      return [all({ a: 'castle', id, op: 'knock', s: 0, by: pid })];
    }
    return [];
  }

  allow(pid, now) { // no more than 20 messages a second from any one dog
    let b = this.budget.get(pid);
    if (!b || now - b.t > 1000) this.budget.set(pid, (b = { t: now, n: 0 }));
    return ++b.n <= 20;
  }
}
