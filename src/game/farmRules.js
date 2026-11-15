// 🚜 The Farm: the rules shared by the game and the server (no three.js here).
//
// The sheep are shared: in a pack one dog's game runs the flock (the "shepherd": whoever said hello to the
// farm first, or whoever's still running it) and sends where every sheep is to everyone else, about eight
// times a second, so all the dogs see the same flock — and every dog's position (and woofs) push it about.
// Get every sheep into the pen and that's a round-up: the town keeps count (server/store.js, with the
// town), and a rosette goes up on the barn door. Playing alone, your own game runs a FarmRoom of its own.

export const FLOCK = 8;              // sheep in the flock (one of them is the black sheep)
export const LAMBS = 3;              // …and in spring, their lambs
export const MAX_SHEEP = 12;
export const SHEEP_GAP_MS = 60;      // the flock's whereabouts, at most this often (from the shepherd)
export const STALE_MS = 2500;        // no word from the shepherd for this long: someone else takes over
export const PEN_GAP_MS = 15000;     // a round-up at most this often
export const PENS_MAX = 999;
export const ROSETTE_STAGES = [1, 3, 5, 10, 20]; // something new on the barn at each of these round-ups

/** A round-up count from anywhere (a save, a message): a whole number from 0 to PENS_MAX. */
export const cleanPens = (n) => Math.max(0, Math.min(PENS_MAX, Math.floor(Number(n) || 0)));
/** How many sheep there are (adults first, then lambs in spring). */
export const flockSize = (season) => FLOCK + (season === 'spring' ? LAMBS : 0);

const num = (v) => (Number.isFinite(v) && Math.abs(v) < 1e4 ? Math.round(v * 100) / 100 : 0);
const small = (v) => Math.max(0, Math.min(9, v | 0));

/**
 * One pack's farm (or your own). Feed it messages from dogs; each call returns a list of
 * { to: 'all' | 'others' (everyone but the sender) | dog id, msg } to send.
 *   hello { pens }      a dog arrives at the farm (and brings any round-ups it did on its own)
 *   sheep { d, s, p, g } the shepherd: the flock ([x, z, heading] per sheep), what each is doing, which are
 *                       in the pen (a bit each), the pen gate (1 shut)
 *   pen { by }          the shepherd: every sheep's in the pen! (by: the dogs who helped)
 *   nudge               "the sheep haven't moved for ages": if the shepherd's gone quiet, the sender takes over
 */
export class FarmRoom {
  constructor(pens = 0) {
    this.pens = cleanPens(pens);
    this.host = null;
    this.dogs = [];     // in the order they said hello
    this.sheepAt = 0;   // when the shepherd last sent the flock
    this.penAt = -Infinity;
    this.last = null;   // the flock, as last sent (for dogs arriving)
  }

  state(to) { return { to, msg: { a: 'state', host: this.host, pens: this.pens, sheep: this.last } }; }

  hello(pid, m, now) {
    if (!this.dogs.includes(pid)) this.dogs.push(pid);
    const pens = cleanPens(m?.pens);
    const out = [];
    if (pens > this.pens) { this.pens = pens; out.push({ to: 'all', msg: { a: 'pens', n: this.pens } }); } // (round-ups done alone count too)
    if (this.host === null || !this.dogs.includes(this.host)) { this.host = pid; this.sheepAt = now; out.push({ to: 'all', msg: { a: 'host', host: pid } }); }
    out.push(this.state(pid));
    return out;
  }

  /** A dog went home: if it was the shepherd, the dog who's been here longest takes over. */
  leave(pid) {
    this.dogs = this.dogs.filter((d) => d !== pid);
    if (pid !== this.host) return [];
    this.host = this.dogs[0] ?? null;
    return this.host === null ? [] : [{ to: 'all', msg: { a: 'host', host: this.host } }];
  }

  /** A message from a dog (never trust it: check everything). */
  message(pid, m, now) {
    if (!m || typeof m.a !== 'string') return [];
    if (m.a === 'hello') return this.hello(pid, m, now);
    if (!this.dogs.includes(pid)) return [];
    switch (m.a) {
      case 'sheep': return this.sheep(pid, m, now);
      case 'pen': return this.pen(pid, m, now);
      case 'nudge': return this.nudge(pid, now);
    }
    return [];
  }

  sheep(pid, m, now) {
    if (pid !== this.host || now - this.sheepAt < SHEEP_GAP_MS) return [];
    this.sheepAt = now;
    const d = (Array.isArray(m.d) ? m.d : []).slice(0, MAX_SHEEP * 3).map(num);
    d.length -= d.length % 3;
    const s = (Array.isArray(m.s) ? m.s : []).slice(0, d.length / 3).map(small);
    this.last = { a: 'sheep', d, s, p: Math.max(0, Math.min(2 ** MAX_SHEEP - 1, m.p | 0)), g: m.g ? 1 : 0 };
    return [{ to: 'others', msg: this.last }];
  }

  pen(pid, m, now) {
    if (pid !== this.host || now - this.penAt < PEN_GAP_MS) return [];
    this.penAt = now;
    this.pens = cleanPens(this.pens + 1);
    const by = [...new Set((Array.isArray(m.by) ? m.by : []).filter((id) => this.dogs.includes(id)))].slice(0, 8);
    return [{ to: 'all', msg: { a: 'penned', n: this.pens, by } }];
  }

  nudge(pid, now) {
    if (pid === this.host || now - this.sheepAt < STALE_MS) return [];
    this.host = pid;
    this.sheepAt = now;
    return [{ to: 'all', msg: { a: 'host', host: pid } }];
  }
}
