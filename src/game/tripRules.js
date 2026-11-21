// 🧳 Trips with friends: what a pack shares on a trip (no three.js here). Whoever runs a TripRoom settles it, so
// every dog on the same trip sees the same: the server (server/trips.js), for a pack.
//
// Each trip a pack is on has:
//   seed     where things are this visit (every dog's game lays the trip out from it: the same sparks, the same
//            hiding places). A new one when a dog arrives and nobody else from the pack is there.
//   v        what's been done, by key: a flag (a star-spark found: 's3' = 1), or a thing to carry, one dog at a
//            time ([0, x, z, y] lying there (y: how high: a ship has decks), [1, dogId] in that dog's mouth, [2] handed over).
//   present  which dogs are there.
// Messages (from a dog): { a: 'enter' } · { a: 'leave' } · { a: 'set', k, v } · { a: 'take', k } ·
//                        { a: 'drop', k, x, z } · { a: 'done', k }
// To send back: { a: 'state', seed, v } (to the dog that arrived) · { a: 'set', k, v, by } (to every dog).

export const TRIP_KEYS_MAX = 64;
const KEY = /^[a-z0-9_]{1,16}$/;
const ID = /^[a-z]{1,12}$/;
const n = (x, lim = 1e4) => (Number.isFinite(x) && Math.abs(x) < lim ? Math.round(x * 100) / 100 : 0);

/** A value as a trip may keep it: a number, or a short list of numbers. Anything else: null. */
export function cleanTripValue(v) {
  if (Number.isFinite(v)) return n(v, 1e6);
  if (Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every(Number.isFinite)) return v.map((x) => n(x));
  return null;
}

export const tripKeyOk = (k) => typeof k === 'string' && KEY.test(k);
export const tripIdOk = (id) => typeof id === 'string' && ID.test(id);

/** One pack's trips. Feed it messages; each call returns [{ to: 'all' | dogId, msg }] to send. */
export class TripRoom {
  constructor(rand = Math.random) {
    this.trips = new Map(); // id → { seed, v, present: Set }
    this.rand = rand;
  }

  fresh() { return { seed: Math.floor(this.rand() * 2 ** 31), v: {}, present: new Set() }; }

  /**
   * A message from dog `pid` about trip `id`. where(): that dog's last known place { x, z } (for dropping what
   * they're carrying when they leave).
   */
  message(pid, id, msg, where = () => ({ x: 0, z: 0 })) {
    if (!tripIdOk(id) || !msg) return [];
    const set = (T, k, v, by) => { T.v[k] = v; return { to: 'all', msg: { t: 'trip', id, a: 'set', k, v, by } }; };
    let T = this.trips.get(id);
    if (msg.a === 'enter') {
      for (const [oid, other] of this.trips) if (oid !== id && other.present.has(pid)) this.message(pid, oid, { a: 'leave' }, where); // (one trip at a time)
      if (!T || T.present.size === 0) { T = this.fresh(); this.trips.set(id, T); } // (nobody here: a fresh visit)
      T.present.add(pid);
      return [{ to: pid, msg: { t: 'trip', id, a: 'state', seed: T.seed, v: T.v } }];
    }
    if (!T || !T.present.has(pid)) return [];
    if (msg.a === 'leave') return this.leave(pid, id, where);
    if (!tripKeyOk(msg.k)) return [];
    const k = msg.k, cur = T.v[k];
    if (!(k in T.v) && Object.keys(T.v).length >= TRIP_KEYS_MAX) return [];
    const held = Array.isArray(cur) && cur[0] === 1, gone = Array.isArray(cur) && cur[0] === 2;
    switch (msg.a) {
      case 'set': {
        const v = cleanTripValue(msg.v);
        if (v === null || Array.isArray(v)) return []; // (flags are numbers: things to carry go through take/drop/done)
        return [set(T, k, v, pid)];
      }
      case 'take': // somebody else has it (or it's been handed over): tell her how it really is
        if (held && cur[1] !== pid) return [{ to: pid, msg: { t: 'trip', id, a: 'set', k, v: cur, by: cur[1] } }];
        if (gone) return [{ to: pid, msg: { t: 'trip', id, a: 'set', k, v: cur, by: 0 } }];
        return held ? [] : [set(T, k, [1, pid], pid)];
      case 'drop':
        if (!held || cur[1] !== pid) return [];
        return [set(T, k, [0, n(msg.x), n(msg.z), n(msg.y, 100)], pid)];
      case 'done':
        if (gone || (held && cur[1] !== pid)) return [];
        return [set(T, k, [2], pid)];
      default:
        return [];
    }
  }

  /** A dog leaves a trip (or the pack): whatever's in her mouth is dropped where she was. */
  leave(pid, id, where) {
    const T = this.trips.get(id), out = [];
    if (!T || !T.present.delete(pid)) return out;
    const at = where(pid) ?? { x: 0, z: 0 };
    for (const [k, v] of Object.entries(T.v)) {
      if (Array.isArray(v) && v[0] === 1 && v[1] === pid) { T.v[k] = [0, n(at.x), n(at.z), n(at.y ?? 0, 100)]; out.push({ to: 'all', msg: { t: 'trip', id, a: 'set', k, v: T.v[k], by: pid } }); }
    }
    return out;
  }

  /** A dog leaves the pack: off every trip. */
  leaveAll(pid, where) { return [...this.trips.keys()].flatMap((id) => this.leave(pid, id, where)); }
}
