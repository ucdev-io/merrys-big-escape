// 🚜 The Farm in a pack: the server runs each pack's FarmRoom (src/game/farmRules.js), so one dog's game
// runs the sheep for everyone, and every round-up (all the sheep in the pen) is counted for the town and
// kept with it (world.farm, saved by store.js like the den): the rosettes on the barn door stay up.
import { FarmRoom, cleanPens } from '../src/game/farmRules.js';
import { touchWorld } from './store.js';

function deliver(room, p, list, send, broadcast) {
  for (const { to, msg } of list) {
    const m = { t: 'farm', ...msg };
    if (to === 'all') broadcast(room, m);
    else if (to === 'others') broadcast(room, m, p);
    else { const q = room.players.get(to); if (q) send(q.ws, m); }
  }
}

/** A farm message from a dog (say hello, the flock from its shepherd, a round-up…). */
export function farmMessage(room, p, msg, send, broadcast) {
  const F = (room.farm ??= new FarmRoom(room.world.farm));
  F.pens = Math.max(F.pens, cleanPens(room.world.farm)); // (in case the town's count went up some other way)
  const out = F.message(p.id, msg, Date.now());
  if (F.pens !== (room.world.farm ?? 0)) { room.world.farm = F.pens; touchWorld(room.world); }
  deliver(room, p, out, send, broadcast);
}

/** A dog went home: if it was running the sheep, someone else does now. */
export function farmLeave(room, p, send, broadcast) {
  if (room.farm) deliver(room, p, room.farm.leave(p.id), send, broadcast);
}
