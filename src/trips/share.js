/*
 * 🧳 A trip with friends: this dog's line to her pack's TripRoom on the server (src/game/tripRules.js), for the trip
 * she's on. On the way in she asks for the trip as it is ({ seed, v }): the seed lays the trip out the same for
 * every dog there, and v says what's been done (a flag: 's3' = 1; a thing to carry: [0, x, z] lying there,
 * [1, dogId] in that dog's mouth, [2] handed over). Changes come back to every dog: on((k, v, by) => …).
 * With no pack (or a server that doesn't know about trips), there's no TripShare and the trip is her own.
 */

export class TripShare {
  constructor(pack, id) {
    Object.assign(this, { pack, id });
    this.seed = 0;
    this.v = {};
    this.listeners = [];
  }

  /** Into trip `id` with the pack: resolves with a TripShare once the trip's state arrives (or null: on her own). */
  static enter(pack, id, timeout = 1500) {
    if (!pack?.net) return Promise.resolve(null);
    const s = new TripShare(pack, id);
    pack.tripShare = s;
    return new Promise((res) => {
      s.ready = res;
      s.timer = setTimeout(() => { if (pack.tripShare === s) pack.tripShare = null; s.ready = null; res(null); }, timeout);
      pack.net.send({ t: 'trip', id, a: 'enter' });
    });
  }

  /** This dog's id in the pack. */
  get me() { return this.pack.net?.id ?? -1; }

  /** A trip message from the server (pack.js passes them on). */
  receive(m) {
    if (m.id !== this.id) return;
    if (m.a === 'state') {
      this.seed = m.seed | 0;
      this.v = { ...(m.v ?? {}) };
      clearTimeout(this.timer);
      this.ready?.(this);
      this.ready = null;
    } else if (m.a === 'set') {
      this.v[m.k] = m.v;
      for (const f of this.listeners) f(m.k, m.v, m.by);
    }
  }

  on(f) { this.listeners.push(f); }
  send(msg) { this.pack.net?.send({ t: 'trip', id: this.id, ...msg }); }

  /** A flag for everyone (a spark found, a cat found): a number. */
  set(k, v = 1) { this.v[k] = v; this.send({ a: 'set', k, v }); }
  /** Something to carry: picked up, put down, handed over. (The server decides who really has it.) */
  take(k) { this.send({ a: 'take', k }); }
  drop(k, x, z) { this.send({ a: 'drop', k, x, z }); }
  done(k) { this.send({ a: 'done', k }); }
  /** What's in her mouth (friends draw it). */
  carry(kind) { this.pack.sendCarry?.(kind); }

  leave() {
    this.send({ a: 'leave' });
    if (this.pack.tripShare === this) this.pack.tripShare = null;
    this.listeners = [];
  }
}
