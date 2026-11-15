// 🍂❄️🌸☀️ Seasons and weather: the rules shared by the game and the server (no three.js here).
// Whoever runs a SeasonRoom decides the season, the weather and the state of the shared seasonal toys
// (snowmen, leaf piles), so every dog in a pack sees the same: the server, for a pack (server/seasons.js);
// your own game, when you play on your own. Times go out as "for so many ms" (everyone's clock is a bit
// different), like the heists.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_INFO = {
  spring: { emoji: '🌸', name: 'Spring' },
  summer: { emoji: '☀️', name: 'Summer' },
  autumn: { emoji: '🍂', name: 'Autumn' },
  winter: { emoji: '❄️', name: 'Winter' },
};
export const WEATHER_INFO = {
  clear: { emoji: '🌤️', name: 'Sunny spells' },
  showers: { emoji: '🌦️', name: 'Showers' },
  windy: { emoji: '🍃', name: 'Windy' },
  snow: { emoji: '🌨️', name: 'Snowing' },
};

/** The UK season on a date: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn. */
export function seasonOn(date = new Date()) {
  const m = date.getMonth();
  return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
}

/** Christmas: all of December, up to Twelfth Night (5 January). */
export function christmasOn(date = new Date()) {
  const m = date.getMonth();
  return m === 11 || (m === 0 && date.getDate() <= 5);
}

/**
 * A season setting → { season, festive }. 'auto' follows the calendar; picking a season yourself
 * gets you that season (and picking winter brings Christmas with it: lights, the big tree, presents).
 */
export function resolveSeason(choice = 'auto', date = new Date()) {
  if (SEASONS.includes(choice)) return { season: choice, festive: choice === 'winter' ? 'christmas' : null };
  const season = seasonOn(date);
  return { season, festive: season === 'winter' && christmasOn(date) ? 'christmas' : null };
}

/** Tidy up a { season, festive } from a dog (never trust it). */
export function cleanSeason(v) {
  const season = SEASONS.includes(v?.season) ? v.season : seasonOn();
  return { season, festive: season === 'winter' && v?.festive === 'christmas' ? 'christmas' : null };
}

/**
 * What the sky does in each season (relative chances), and how long each spell lasts (seconds).
 * Every spell of weather is followed by a sunny spell; after a sunny spell, anything can happen.
 * Snow only falls in winter (and there's no rain then: it's either snowing or it isn't).
 */
export const WEATHER = {
  spring: { clear: 5, showers: 4, windy: 2 },
  summer: { clear: 9, showers: 1.5, windy: 1 },
  autumn: { clear: 4, showers: 3, windy: 3 },
  winter: { clear: 4, snow: 4, windy: 1.5 },
};
export const SPELL = { clear: [110, 240], showers: [70, 140], windy: [80, 150], snow: [100, 190] };
const FIRST = [25, 50]; // the first sunny spell after a pack opens (or the season changes)

/**
 * Seasonal toys everyone in a pack shares: snowmen (sm0…, built up in stages 1–4, knocked down to 0)
 * and leaf piles (lp0…, burst when a dog leaps in; they heap up again by themselves).
 */
export const TOYS = { snowman: 4, buildGapMs: 280, knockGapMs: 700, pileMs: 22000, pileAgainMs: 6000 };
const TOY_ID = /^(sm|lp)\d{1,2}$/;
const MAX_TOYS = 64;

const all = (msg) => ({ to: 'all', msg });

/**
 * One pack's season, weather and seasonal toys (or your own, playing alone). Feed it messages from
 * dogs and call tick() often; each returns a list of { to: 'all' | dog id, msg } to send.
 * The dog who opened the pack picks the season (if they go home, whoever's been there longest).
 */
export class SeasonRoom {
  constructor(now, first = {}, rand = Math.random) {
    this.rand = rand;
    Object.assign(this, cleanSeason(first));
    this.host = null;
    this.hostName = '';
    this.toys = new Map(); // id → { s (snowman stage, or 1 = a burst pile), at, by, team }
    this.budget = new Map();
    this.spell = { kind: 'clear', until: now + this.span(FIRST) };
  }

  span([a, b]) { return (a + this.rand() * (b - a)) * 1000; }

  /** Everything, for a dog who's just arrived. */
  snapshot(now) {
    const toys = [];
    for (const [id, t] of this.toys) {
      if (id.startsWith('sm') && t.s > 0) toys.push([id, t.s]);
      else if (id.startsWith('lp') && now - t.at < TOYS.pileMs) toys.push([id, -Math.round(now - t.at)]); // (how long ago it burst)
    }
    return { a: 'state', season: this.season, festive: this.festive, weather: this.weatherMsg(now), host: this.host, hostName: this.hostName, toys };
  }

  weatherMsg(now) { return { kind: this.spell.kind, ms: Math.max(0, Math.round(this.spell.until - now)) }; }

  /** A dog arrived (the first one picks the season from now on). */
  join(pid, name = '') {
    if (this.host === null) { this.host = pid; this.hostName = name; }
    return [];
  }

  /** A dog went home. If it was the one picking the season, `next` (the longest-staying dog) does now. */
  leave(pid, next = null) {
    if (pid !== this.host) return [];
    this.host = next?.id ?? null;
    this.hostName = next?.name ?? '';
    return next ? [all({ a: 'host', host: this.host, hostName: this.hostName })] : [];
  }

  /** A message from a dog (never trust it: check everything). */
  message(pid, m, now) {
    if (!m || typeof m.a !== 'string' || !this.allow(pid, now)) return [];
    switch (m.a) {
      case 'set': return this.set(pid, m, now);
      case 'weather': return this.force(pid, String(m.kind ?? ''), now);
      case 'toy': return this.toy(pid, m, now);
    }
    return [];
  }

  /** The season picker changed the season (only they can). */
  set(pid, m, now) {
    if (pid !== this.host) return [{ to: pid, msg: { a: 'nope', hostName: this.hostName } }];
    const next = cleanSeason({ season: m.season ?? this.season, festive: m.festive });
    if (next.season === this.season && next.festive === this.festive) return [];
    if (next.season !== this.season) { this.toys.clear(); this.spell = { kind: 'clear', until: now + this.span(FIRST) }; }
    Object.assign(this, next);
    return [all({ ...this.snapshot(now), why: 'set' })];
  }

  /** The season picker asked for some weather (it has to suit the season). */
  force(pid, kind, now) {
    if (pid !== this.host || !(kind in WEATHER[this.season])) return [];
    this.spell = { kind, until: now + this.span(SPELL[kind]) };
    return [all({ a: 'weather', ...this.weatherMsg(now), why: 'set' })];
  }

  /** Building or knocking down a snowman; leaping into a leaf pile. */
  toy(pid, m, now) {
    const id = String(m.id ?? '');
    if (!TOY_ID.test(id) || (!this.toys.has(id) && this.toys.size >= MAX_TOYS)) return [];
    if (id.startsWith('sm')) {
      if (this.season !== 'winter') return [];
      const t = this.toys.get(id) ?? { s: 0, at: 0, team: [] };
      this.toys.set(id, t);
      if (m.op === 'build') {
        if (t.s >= TOYS.snowman || now - t.at < TOYS.buildGapMs) return [];
        t.s++; t.at = now;
        if (!t.team.includes(pid) && t.team.length < 8) t.team.push(pid);
        const msg = { a: 'toy', id, op: 'build', s: t.s, by: pid };
        if (t.s === TOYS.snowman) { msg.team = t.team; t.team = []; } // finished! (everyone who helped gets a share)
        return [all(msg)];
      }
      if (m.op === 'knock') {
        if (t.s < 1 || now - t.at < TOYS.knockGapMs) return [];
        Object.assign(t, { s: 0, at: now, team: [] });
        return [all({ a: 'toy', id, op: 'knock', s: 0, by: pid })];
      }
      return [];
    }
    if (m.op !== 'burst' || this.season !== 'autumn') return [];
    const t = this.toys.get(id);
    if (t && now - t.at < TOYS.pileAgainMs) return []; // (still flat: heap it up a bit first)
    this.toys.set(id, { s: 1, at: now, by: pid });
    return [all({ a: 'toy', id, op: 'burst', by: pid })];
  }

  /** Weather spells coming and going. */
  tick(now) {
    if (now < this.spell.until) return [];
    const kind = this.roll();
    this.spell = { kind, until: now + this.span(SPELL[kind]) };
    return [all({ a: 'weather', ...this.weatherMsg(now) })];
  }

  /** What comes next: a sunny spell after any weather; after a sunny spell, a roll of the dice. */
  roll() {
    if (this.spell.kind !== 'clear') return 'clear';
    const table = Object.entries(WEATHER[this.season]);
    let r = this.rand() * table.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
    return 'clear';
  }

  allow(pid, now) { // no more than 20 messages a second from any one dog
    let b = this.budget.get(pid);
    if (!b || now - b.t > 1000) this.budget.set(pid, (b = { t: now, n: 0 }));
    return ++b.n <= 20;
  }
}
