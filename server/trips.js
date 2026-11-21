// 🧳 Trips with friends: the server runs each pack's TripRoom (src/game/tripRules.js), so every dog on the same
// trip sees the same layout and the same things found, carried and handed over. Nothing's kept: a trip
// starts fresh whenever a dog from the pack arrives and nobody else is there.
import { TripRoom } from '../src/game/tripRules.js';

const tripsOf = (room) => (room.trips ??= new TripRoom());
const where = (room) => (pid) => { const s = room.players.get(pid)?.state; return s ? { x: s[1], z: s[2], y: s[6] ?? 0 } : null; };

function deliver(room, list, send, broadcast) {
  for (const { to, msg } of list) {
    if (to === 'all') broadcast(room, msg);
    else { const q = room.players.get(to); if (q) send(q.ws, msg); }
  }
}

/** A trip message from a dog (arrived, left, found something, picked something up…). */
export function tripMessage(room, p, msg, send, broadcast) {
  deliver(room, tripsOf(room).message(p.id, msg.id, msg, where(room)), send, broadcast);
}

/** A dog leaves the pack: off any trip she was on (dropping what she held). */
export function tripLeave(room, p, send, broadcast) {
  if (room.trips) deliver(room, room.trips.leaveAll(p.id, () => (p.state ? { x: p.state[1], z: p.state[2], y: p.state[6] ?? 0 } : null)), send, broadcast);
}
