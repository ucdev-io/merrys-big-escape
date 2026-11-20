// 🎮 Games and challenges (see challenges.js): 🏁 races, ⚡ the zoomies dash, 🦴 bone rush, 🐦 pigeon
// panic, 🦆 duck round-up and 🐾 tag. Shared by the game and the server (no three.js here). Whoever runs
// a GameRoom keeps score, so everyone sees the same results: the server, for a pack; your own game, when
// there's no server (playing on your own, or in the web demo). Times go out as "in so many ms"
// (everyone's clock is a bit different). The dog who starts a round-up runs the ducks for everyone
// (its "host").

import { CHALLENGES } from './challenges.js';

// (The same tidying as server/clean.js: whatever a dog sends, never trust shapes or sizes.)
const num = (v, lim = 1e4) => (Number.isFinite(v) && Math.abs(v) < lim ? Math.round(v * 100) / 100 : 0);
const cleanId = (s) => String(s ?? '').replace(/[^a-z0-9_\-]/gi, '').slice(0, 24);
const dogOf = (q) => ({ name: q.name, breed: q.breed, profile: q.profile });

/**
 * One pack's games (or your own). Feed it messages from dogs, tell it who comes and goes, and call
 * tick() when wakeAt() says (or every frame); each returns a list of { to, msg } to send, where to is
 * 'all', a dog id, or { not: id } (everyone but that dog). Dog ids: the server's (0 when alone).
 */
export class GameRoom {
  /**
   * @param o.players     () → Map of dog id → { name, breed, profile }: everyone here right now
   * @param o.town        this neighbourhood's seed (for its own 🏆 boards)
   * @param o.addResults  (kind, town, entries) → { board, results } | null: the 🏆 records (the server's, or this device's)
   * @param o.random      () → 0…1
   */
  constructor({ players, town, addResults, random = Math.random }) {
    Object.assign(this, { players, town, addResults, random });
    this.game = null;
    this.n = 0;
  }

  get running() { return !!this.game && !this.game.over; }

  /** When tick() next has something to do (a game's time running out), or null. */
  wakeAt() { return this.running ? this.game.endsAt : null; }

  /** Time's up? */
  tick(now) { return this.running && now >= this.game.endsAt ? this.end(now) : []; }

  /** A game as it goes out to the dogs. */
  publicGame(g, now) {
    return {
      id: g.id, kind: g.kind, by: g.by, byName: g.byName, target: g.target, seed: g.seed, host: g.host, over: g.over,
      it: g.it, tags: g.tags, scores: g.scores, got: g.got, home: g.home, finishers: g.finishers, doneMs: g.doneMs,
      startsIn: g.startAt - now, endsIn: g.endsAt - now, records: g.records ?? null,
    };
  }

  /** A dog just arrived: if there's a game on, they join in. */
  join(id, now) {
    const g = this.game, p = this.players().get(id);
    if (!g || g.over || !p) return [];
    g.dogs.set(id, dogOf(p));
    return [{ to: id, msg: { a: 'start', game: this.publicGame(g, now) } }];
  }

  /** A game move from a dog (or 'start'). */
  message(id, msg, now) {
    if (!msg || !this.players().has(id)) return [];
    return msg.a === 'start' ? this.start(id, msg, now) : this.move(id, msg, now);
  }

  start(id, msg, now) {
    if (this.running) return [];
    const players = this.players(), p = players.get(id);
    const kind = Object.hasOwn(CHALLENGES, msg.kind) ? msg.kind : 'race', C = CHALLENGES[kind];
    if (players.size < (C.min ?? 1)) return [{ to: id, msg: { a: 'nope', msg: `${C.name} needs at least ${C.min} dogs!` } }];
    const g = (this.game = {
      id: ++this.n, kind, by: id, byName: p.name, target: cleanId(msg.target), over: false,
      seed: Math.floor(this.random() * 1e9), host: id, startAt: now + 4000, endsAt: now + 4000 + C.secs * 1000,
      finishers: [], tags: {}, it: null, lastTag: 0, scores: {}, got: {}, home: [], doneMs: null,
      dogs: new Map([...players].map(([q, d]) => [q, dogOf(d)])), // everyone who played (even if they go home)
    });
    if (kind === 'tag') { const ids = [...players.keys()]; g.it = ids[Math.floor(this.random() * ids.length)]; }
    return [{ to: 'all', msg: { a: 'start', game: this.publicGame(g, now) } }];
  }

  end(now) {
    const g = this.game;
    if (!g || g.over) return [];
    g.over = true;
    g.records = this.saveRecords(g);
    return [{ to: 'all', msg: { a: 'end', game: this.publicGame(g, now) } }];
  }

  /** Results onto the 🏆 records: { board (top 5), mine: { [dog id, or 'team']: { rank, record, best } } }. */
  saveRecords(g) {
    const C = CHALLENGES[g.kind];
    if (!C.rank) return null;
    const who = [], entries = [];
    if (C.coop) {
      const team = [...g.dogs.values()];
      if (g.home.length) { who.push('team'); entries.push({ team: team.map((d) => d.name), profiles: team.map((d) => d.profile), breed: team[0]?.breed, score: g.home.length, ms: g.doneMs ?? C.secs * 1000 }); }
    } else if (C.rank === 'time') {
      for (const f of g.finishers) if (g.dogs.has(f.id)) { who.push(f.id); entries.push({ ...g.dogs.get(f.id), ms: f.ms }); }
    } else {
      const scores = g.kind === 'tag' ? g.tags : g.scores;
      for (const [id, d] of g.dogs) if (scores[id] > 0) { who.push(id); entries.push({ ...d, score: scores[id] }); }
    }
    const r = this.addResults(g.kind, this.town, entries);
    return r && { board: r.board, mine: Object.fromEntries(who.map((id, i) => [id, r.results[i]])) };
  }

  move(id, msg, now) {
    const g = this.game;
    if (!g || g.over || now < g.startAt - 200) return [];
    const C = CHALLENGES[g.kind], players = this.players(), p = players.get(id);
    if (!g.dogs.has(id)) g.dogs.set(id, dogOf(p));
    switch (msg.a) {
      case 'done': { // 🏁 ⚡ over the finish line
        if (!['race', 'dash'].includes(g.kind) || g.finishers.some((f) => f.id === id)) return [];
        g.finishers.push({ id, name: p.name, ms: now - g.startAt });
        const out = [{ to: 'all', msg: { a: 'finish', id, name: p.name, place: g.finishers.length, ms: now - g.startAt } }];
        return g.finishers.length >= players.size ? [...out, ...this.end(now)] : out;
      }
      case 'tag': { // 🐾 you're it!
        const target = Number(msg.target);
        if (g.kind !== 'tag' || g.it !== id || target === id || !players.has(target) || now - g.lastTag < 1500) return [];
        g.tags[id] = (g.tags[id] ?? 0) + 1;
        g.it = target;
        g.lastTag = now;
        return [{ to: 'all', msg: { a: 'it', it: target, by: id, byName: p.name, name: players.get(target).name, tags: g.tags } }];
      }
      case 'grab': { // 🦴 first dog there gets it
        const i = msg.i | 0;
        if (g.kind !== 'bones' || i < 0 || i >= C.count || g.got[i] !== undefined) return [];
        g.got[i] = id;
        g.scores[id] = (g.scores[id] ?? 0) + 1;
        const out = [{ to: 'all', msg: { a: 'got', i, by: id, name: p.name, scores: g.scores } }];
        return Object.keys(g.got).length >= C.count ? [...out, ...this.end(now)] : out;
      }
      case 'pig': { // 🐦 a flock sent flying
        if (g.kind !== 'pigeons') return [];
        const n = Math.max(1, Math.min(12, msg.n | 0));
        g.scores[id] = (g.scores[id] ?? 0) + n;
        return [{ to: 'all', msg: { a: 'score', by: id, name: p.name, n, scores: g.scores } }];
      }
      case 'ducks': // 🦆 where the ducks are now (from whoever's running them)
        if (g.kind !== 'ducks' || id !== g.host) return [];
        return [{ to: { not: id }, msg: { a: 'ducks', d: (Array.isArray(msg.d) ? msg.d : []).slice(0, C.count * 3).map((v) => num(v)) } }];
      case 'home': { // 🦆 one more duck safe in the pond (and which dog shooed it in)
        const i = msg.i | 0, byId = Number(msg.by), by = players.get(byId);
        if (g.kind !== 'ducks' || id !== g.host || i < 0 || i >= C.count || g.home.includes(i)) return [];
        g.home.push(i);
        const out = [{ to: 'all', msg: { a: 'home', i, home: g.home, by: by ? byId : null, name: by?.name ?? null } }];
        if (g.home.length >= C.count) { g.doneMs = now - g.startAt; return [...out, ...this.end(now)]; }
        return out;
      }
    }
    return [];
  }

  /** A dog went home (they've already gone from players()). */
  leave(id, now) {
    const g = this.game, players = this.players();
    if (!g || g.over || !players.size) return [];
    const out = [];
    if (g.kind === 'tag' && g.it === id) { // "it" went home: someone else is it now
      const ids = [...players.keys()];
      g.it = ids[Math.floor(this.random() * ids.length)];
      out.push({ to: 'all', msg: { a: 'it', it: g.it, by: null, byName: null, name: players.get(g.it).name, tags: g.tags } });
    }
    if (g.kind === 'tag' && players.size < 2) out.push(...this.end(now));
    if (['race', 'dash'].includes(g.kind) && g.finishers.length >= players.size) out.push(...this.end(now));
    if (g.kind === 'ducks' && g.host === id) { // someone else runs the ducks now
      g.host = players.keys().next().value;
      out.push({ to: 'all', msg: { a: 'host', host: g.host } });
    }
    return out;
  }
}
