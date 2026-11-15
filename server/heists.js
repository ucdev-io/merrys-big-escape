// 🥐 Heists in a pack: the server runs each pack's HeistRoom (src/game/heistRules.js), so every dog
// sees the baker look round at the same moment, and it settles who got which treat.
import { HeistRoom } from '../src/game/heistRules.js';

const heistOf = (room) => (room.heist ??= new HeistRoom(Date.now(), { season: room.seasons?.season })); // (summer: more BBQ parties)

function deliver(room, list, send, broadcast) {
  for (const { to, msg } of list) {
    if (to === 'all') broadcast(room, { t: 'heist', ...msg });
    else { const q = room.players.get(to); if (q) send(q.ws, { t: 'heist', ...msg }); }
  }
}

/** A dog arrived: tell them what's going on (who's looking, which treats are where). */
export function heistJoin(room, p, send) { send(p.ws, { t: 'heist', ...heistOf(room).snapshot(Date.now()) }); }

/** A heist move from a dog (grab, drop, bank, caught, distract). */
export function heistMessage(room, p, msg, send, broadcast) { deliver(room, heistOf(room).message(p.id, msg, Date.now()), send, broadcast); }

/** A dog went home: whatever they had goes back. */
export function heistLeave(room, p, send, broadcast) { if (room.heist) deliver(room, room.heist.leave(p.id, Date.now()), send, broadcast); }

/** Called often: grown-ups looking round, fresh batches… */
export function heistTick(room, send, broadcast) { if (room.heist && room.players.size) deliver(room, room.heist.tick(Date.now()), send, broadcast); }
