// 🥐🌭🍔 Heists: cheeky food raids on the bakery street (and at BBQ parties). Shared by the game and
// the server (no three.js here). Whoever runs a HeistRoom decides when the grown-ups look round and
// who has which treat, so every dog sees the same thing: the server, for a pack; your own game, when
// you play on your own. Times go out as "for so many ms" (everyone's clock is a bit different).

/**
 * The grown-ups keeping an eye on things, and how long they spend on each step (seconds):
 * busy (back turned) → warn (about to look round: the little warning beat) → look → busy…
 * A bark at their door distracts them (door) for a while, then they're wise to it (cool).
 */
export const LOOKOUTS = {
  baker: { busy: [3.5, 6.5], warn: 1.3, look: [2, 3.2], door: 4, cool: 4 },
  butcher: { busy: [4, 7.5], warn: 1.3, look: [2, 3], door: 4, cool: 4 },
  // At a BBQ party the cook mostly watches the grill: "busy" is chatting with the guests, back turned.
  cook: { busy: [2.6, 4.2], warn: 1.1, look: [3, 4.6], door: 3.5, cool: 6, party: true },
};

/**
 * Now and then a garden holds a BBQ party (n picks which: see heist/party.js), with sausages
 * (bq0–bq2) and burgers (bq3–bq5) on the grill. The first one starts a little while after you
 * arrive; each lasts a few minutes, then there's a break before the next.
 */
export const PARTY = { sausage: 3, burger: 3, firstMs: 40000, ms: 180000, gap: [60000, 100000], summerGap: [25000, 45000] }; // (summer: BBQ weather!)
export const PARTY_IDS = Array.from({ length: PARTY.sausage + PARTY.burger }, (_, i) => `bq${i}`);

/**
 * The butcher's string of sausages: n links, which snap into two halves of `half` in a tug of war.
 * Ends: 0 dangles from the butcher's rail (the one you can reach), 1 is tied on (until it's down).
 * A tug: both ends held. Pulls (running away, or mashing 🐾) push the meter (-1…1) one way or the
 * other: the dog who gets it to their end wins the lot. Pull hard together (or for too long) and it
 * snaps: half each.
 */
export const LINKS = { n: 10, half: 5, snapSecs: 9, tidyMs: 30000, restockMs: 25000, loserWaitMs: 2500 };

/** The baker's trays: bk0–bk5 are croissants, bk6–bk11 iced buns. */
export const BAKERY = { croissant: 6, bun: 6 };
export const BAKERY_IDS = Array.from({ length: BAKERY.croissant + BAKERY.bun }, (_, i) => `bk${i}`);
const RESTOCK_MS = { bk: 20000, bq: 25000 }, TIDY_MS = 45000; // fresh batches; treats left lying about go back

/** What a loot id is ('croissant', 'bun', 'sausage', 'burger'), or null if it isn't one. */
export function lootKind(id) {
  const m = /^(bk|bq)(0|[1-9]\d?)$/.exec(String(id));
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === 'bq') return n < PARTY.sausage ? 'sausage' : n < PARTY.sausage + PARTY.burger ? 'burger' : null;
  return n < BAKERY.croissant ? 'croissant' : n < BAKERY.croissant + BAKERY.bun ? 'bun' : null;
}
/** Whose eye is on a loot id. */
export const lookoutFor = (id) => ({ bk: 'baker', bq: 'cook' })[String(id).slice(0, 2)] ?? null;

const rand = ([a, b]) => a + Math.random() * (b - a);
const coord = (v) => (Number.isFinite(v) ? Math.max(-150, Math.min(150, Math.round(v * 100) / 100)) : 0);

/**
 * One pack's heists (or your own, playing alone). Feed it messages from dogs and call tick() often;
 * each returns a list of { to: 'all' | dog id, msg } to send. Dog ids: the server's (0 when alone).
 */
export class HeistRoom {
  /** opts.season: the pack's season (summer brings more BBQ parties); setSeason() when it changes. */
  constructor(now, { season = null } = {}) {
    this.season = season;
    this.npcs = {};
    for (const id of Object.keys(LOOKOUTS)) this.npcs[id] = { s: 'busy', until: now + rand(LOOKOUTS[id].busy) * 1000, cool: 0, by: null, doorEnd: 0, wiseAt: 0 };
    this.loot = new Map(); // id → { s: 'home' | 'held' | 'ground' | 'gone', by, x, z, at, helper } (missing = home)
    this.restock = { bk: 0, bq: 0 }; // when the next fresh batch comes out
    this.budget = new Map();
    this.party = null;               // { n, until }: a BBQ party's on
    this.nextParty = now + PARTY.firstMs * (season === 'summer' ? 0.5 : 1);
    this.links = hooked();
    this.noGrab = new Map(); // dog → when they can grab the sausages again (after losing a tug)
  }

  setSeason(season) { this.season = season; }

  /** Everything, for a dog who's just arrived. */
  snapshot(now) {
    const npcs = {};
    for (const [id, n] of Object.entries(this.npcs)) npcs[id] = { s: n.s, ms: Math.max(0, n.until - now), by: n.by };
    const loot = [...this.loot].filter(([, l]) => l.s !== 'home').map(([id, l]) => [id, l.s, l.by, l.x ?? 0, l.z ?? 0]);
    const party = this.party && { n: this.party.n, ms: Math.max(0, this.party.until - now) };
    return { a: 'state', npcs, loot, links: this.linksMsg('state'), party };
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
      case 'lgrab': return this.linksGrab(pid, m.e, now);
      case 'ldrop': return this.linksLetGo(pid, m.e, now, 'drop');
      case 'lbank': return this.linksBank(pid, m.e, now);
      case 'lcaught': return this.linksHeld(pid) < 0 ? [] : this.linksReset('caught', pid);
      case 'tug': { // pulling in a tug of war (0–4 at a time)
        const T = this.links.tug, e = this.linksHeld(pid);
        if (T && e >= 0) T.pulls[e] += Math.max(0, Math.min(4, Number(m.n) || 0));
        return [];
      }
    }
    return [];
  }

  /** A dog went home: whatever they were holding goes back where it came from. */
  leave(pid, now) {
    const out = this.linksHeld(pid) >= 0 ? this.linksLetGo(pid, this.linksHeld(pid), now, 'drop') : [];
    this.noGrab.delete(pid);
    for (const [id, l] of this.loot) {
      if (l.s !== 'held' || l.by !== pid) continue;
      const s = this.homeless(id) ? 'gone' : 'home'; // (no party now: no grill to put it back on)
      Object.assign(l, { s, by: null, at: now });
      out.push(all({ a: 'loot', id, s, why: 'left' }));
    }
    this.budget.delete(pid);
    return out;
  }

  /** The grown-ups looking round, fresh batches out of the oven, tidying up. */
  tick(now) {
    const out = this.partyTick(now);
    for (const [id, n] of Object.entries(this.npcs)) {
      if (now < n.until || (LOOKOUTS[id].party && !this.party)) continue;
      const L = LOOKOUTS[id];
      if (n.s === 'busy') this.set(n, 'warn', L.warn, now);
      else if (n.s === 'warn') this.set(n, 'look', rand(L.look), now);
      else this.set(n, 'busy', rand(L.busy), now); // (after a look, or a distraction)
      out.push(all(this.npcMsg(id, now)));
    }
    for (const g of ['bk', 'bq']) {
      if (!this.restock[g] || now < this.restock[g]) continue;
      this.restock[g] = 0;
      if (g === 'bq' && !this.party) continue;
      const ids = [];
      for (const [id, l] of this.loot) if (id.startsWith(g) && l.s === 'gone') { Object.assign(l, { s: 'home', by: null, at: now }); ids.push(id); }
      if (ids.length) out.push(all({ a: 'restock', npc: lookoutFor(g), ids }));
    }
    for (const [id, l] of this.loot) {
      if (l.s === 'ground' && now - l.at > TIDY_MS) { Object.assign(l, { s: 'home', at: now }); out.push(all({ a: 'loot', id, s: 'home', why: 'tidy' })); }
    }
    out.push(...this.linksTick(now));
    return out;
  }

  // ---------- inside ----------

  allow(pid, now) { // no more than 40 messages a second from any one dog
    let b = this.budget.get(pid);
    if (!b || now - b.t > 1000) this.budget.set(pid, (b = { t: now, n: 0 }));
    return ++b.n <= 40;
  }

  get(id) { let l = this.loot.get(id); if (!l) this.loot.set(id, (l = { s: 'home', by: null, at: 0 })); return l; }
  /** A BBQ treat with no party on: there's no grill for it to go back to. */
  homeless(id) { return id.startsWith('bq') && !this.party; }

  /** First dog there gets it (anyone else is told "nope", with where it really is). */
  grab(pid, id, now) {
    if (!lootKind(id) || (id.startsWith('bq') && !this.party)) return [];
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
    if (state.s === 'home' && this.homeless(id)) state.s = 'gone';
    const msg = { a: 'loot', id, ...state, by: pid, why };
    if (to.s === 'gone') { msg.helper = l.helper; const g = id.slice(0, 2); this.restock[g] ||= now + RESTOCK_MS[g]; }
    if (to.s === 'home') msg.npc = lookoutFor(id);
    Object.assign(l, state, { by: null, at: now, helper: to.s === 'ground' ? l.helper : null });
    return [all(msg)];
  }

  /** A bark at the door: the grown-up turns to see who it is (unless they've only just been fooled). */
  distract(pid, id, now) {
    const n = Object.hasOwn(this.npcs, id) ? this.npcs[id] : null;
    if (!n || n.s === 'door' || (LOOKOUTS[id].party && !this.party)) return [];
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

  // ---------- BBQ parties ----------

  /** Start the next party when it's time (somewhere new), or wind this one up. */
  partyTick(now) {
    if (!this.party && now >= this.nextParty) {
      this.party = { n: Math.floor(Math.random() * 1e6), until: now + PARTY.ms };
      for (const id of PARTY_IDS) { const l = this.get(id); if (l.s !== 'held') Object.assign(l, { s: 'home', by: null, at: now }); }
      const cook = this.npcs.cook;
      this.set(cook, 'look', rand(LOOKOUTS.cook.look), now);
      Object.assign(cook, { by: null, cool: 0, doorEnd: 0 });
      return [all({ a: 'party', n: this.party.n, ms: PARTY.ms }), all(this.npcMsg('cook', now))];
    }
    if (this.party && now >= this.party.until) {
      this.party = null;
      this.nextParty = now + rand(this.season === 'summer' ? PARTY.summerGap : PARTY.gap);
      this.restock.bq = 0;
      for (const id of PARTY_IDS) { const l = this.get(id); if (l.s !== 'held') Object.assign(l, { s: 'gone', by: null, at: now }); } // (anything in a mouth can still go home)
      return [all({ a: 'party', n: null, ms: 0 })];
    }
    return [];
  }

  // ---------- the butcher's sausages ----------

  /** Which end this dog is holding (0 or 1), or -1. */
  linksHeld(pid) { return this.links.ends.indexOf(pid); }

  linksMsg(ev, extra = {}) {
    const L = this.links;
    return { a: 'links', at: L.at, ends: [...L.ends], cut: L.cut, banked: [...L.banked], tug: !!L.tug, ev, ...extra };
  }

  /** Grab an end (only the dangling one while it's on the rail). Both ends held: tug of war! */
  linksGrab(pid, e, now) {
    const L = this.links;
    if (e !== 0 && e !== 1) return [];
    if (L.at === 'gone' || (L.at === 'hook' && e !== 0) || L.ends[e] !== null || L.ends[1 - e] === pid || L.banked[e] || (this.noGrab.get(pid) ?? 0) > now) {
      return [{ to: pid, msg: this.linksMsg('nope', { e }) }];
    }
    const off = L.at === 'hook';
    if (off) { // (pinched while a friend had the butcher distracted? a team heist)
      const n = this.npcs.butcher;
      L.helper = n.by !== null && n.by !== pid && (n.s === 'door' || now < n.doorEnd + 1500) ? n.by : null;
    }
    L.ends[e] = pid;
    L.at = 'out';
    L.idleAt = 0;
    if (L.ends[0] !== null && L.ends[1] !== null && !L.cut) L.tug = { m: 0, strain: 0, t: 0, pulls: [0, 0], last: now, sent: now };
    return [all(this.linksMsg(off ? 'unhook' : L.tug ? 'tug' : 'grab', { by: pid, e }))];
  }

  /** Let go of an end (dropped it, woofed, went home…). In a tug, the other dog keeps the lot. */
  linksLetGo(pid, e, now, ev) {
    const L = this.links;
    if ((e !== 0 && e !== 1) || L.ends[e] !== pid) return [];
    L.ends[e] = null;
    if (L.tug) { L.tug = null; ev = 'letgo'; }
    if (L.ends[0] === null && L.ends[1] === null) L.idleAt = now;
    return [all(this.linksMsg(ev, { by: pid, e }))];
  }

  /** Got home with it: the whole string (or, once it's snapped, your half). */
  linksBank(pid, e, now) {
    const L = this.links;
    if ((e !== 0 && e !== 1) || L.ends[e] !== pid) return [];
    const n = L.cut ? LINKS.half : LINKS.n, helper = L.helper ?? null;
    if (L.cut) { L.banked[e] = true; L.ends[e] = null; } else { L.banked = [true, true]; L.ends = [null, null]; L.tug = null; }
    if (L.banked[0] && L.banked[1]) { L.at = 'gone'; L.restockAt = now + LINKS.restockMs; }
    return [all(this.linksMsg('bank', { by: pid, e, n, helper }))];
  }

  /** Back on the rail: the butcher caught someone, tidied up, or hung up a fresh string. */
  linksReset(ev, by = null) {
    this.links = hooked();
    return [all(this.linksMsg(ev, { by }))];
  }

  linksTick(now) {
    const L = this.links, T = L.tug, out = [];
    if (T) {
      const dt = (now - T.last) / 1000, pa = Math.min(T.pulls[0], 6), pb = Math.min(T.pulls[1], 6);
      T.last = now; T.pulls = [0, 0]; T.t += dt;
      T.m = Math.max(-1, Math.min(1, T.m + (pa - pb) * 0.035));
      T.strain += Math.min(pa, pb) * 0.025;
      if (Math.abs(T.m) >= 1) { // a winner: the loser's end flies out of their mouth
        const win = T.m > 0 ? 0 : 1, loser = L.ends[1 - win];
        L.ends[1 - win] = null; L.tug = null;
        this.noGrab.set(loser, now + LINKS.loserWaitMs);
        out.push(all(this.linksMsg('won', { by: L.ends[win], loser })));
      } else if (T.strain >= 1 || T.t >= LINKS.snapSecs) { // SNAP! Half each.
        L.cut = true; L.tug = null;
        out.push(all(this.linksMsg('snap')));
      } else if (now - T.sent >= 250) { T.sent = now; out.push(all({ a: 'tug', m: Math.round(T.m * 100) / 100 })); }
    }
    if (L.at === 'out' && L.ends[0] === null && L.ends[1] === null) { // left lying about: the butcher fetches it
      L.idleAt ||= now;
      if (now - L.idleAt > LINKS.tidyMs) out.push(...this.linksReset('tidy'));
    }
    if (L.at === 'gone' && now >= L.restockAt) out.push(...this.linksReset('restock'));
    return out;
  }

  set(n, s, secs, now, by = null) { n.s = s; n.until = now + secs * 1000; n.by = by ?? (s === 'busy' ? null : n.by); }
  npcMsg(id, now) { const n = this.npcs[id]; return { a: 'npc', id, s: n.s, ms: Math.max(0, n.until - now), by: n.by }; }
}

const all = (msg) => ({ to: 'all', msg });
/** The sausages, hanging on the butcher's rail. */
const hooked = () => ({ at: 'hook', ends: [null, null], cut: false, banked: [false, false], tug: null, idleAt: 0, restockAt: 0, helper: null });
