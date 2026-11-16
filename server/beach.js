// 🏖️ The beach in a pack: the server runs each pack's BeachRoom (src/game/beachRules.js), so every dog sees
// the same sandcastles going up and getting knocked flat — and they're kept with the town (worlds.json), so
// a castle the pack built is still standing next time (unless somebody zooms into it).
import { BeachRoom } from '../src/game/beachRules.js';
import { touchWorld } from './store.js';

const beachOf = (room) => (room.beach ??= new BeachRoom(room.world.castles));

function deliver(room, list, send, broadcast) {
  for (const { to, msg } of list) {
    if (to === 'all') broadcast(room, { t: 'beach', ...msg });
    else { const q = room.players.get(to); if (q) send(q.ws, { t: 'beach', ...msg }); }
  }
}

/** The castles as they are, for a dog's welcome. */
export function beachWelcome(room) { return beachOf(room).snapshot(); }

/** A sandcastle move from a dog (build a bit, knock one down): settled here, saved with the town. */
export function beachMessage(room, p, msg, send, broadcast) {
  const B = beachOf(room), out = B.message(p.id, msg, Date.now());
  if (!out.length) return;
  room.world.castles = B.save();
  touchWorld(room.world);
  deliver(room, out, send, broadcast);
}
