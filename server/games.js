// 🎮 Games and challenges in a pack: the server runs each pack's GameRoom (src/game/gameRules.js), so
// every dog sees the same scores and results, and the best go on the 🏆 pack records (store.js).
import { GameRoom } from '../src/game/gameRules.js';
import { addResults } from './store.js';

const gamesOf = (room) => (room.games ??= new GameRoom({ players: () => room.players, town: room.seed, addResults }));

function deliver(room, list, send, broadcast) {
  for (const { to, msg } of list) {
    const m = { t: 'game', ...msg };
    if (to === 'all') broadcast(room, m);
    else if (typeof to === 'object') broadcast(room, m, room.players.get(to.not)); // (everyone but that dog)
    else { const q = room.players.get(to); if (q) send(q.ws, m); }
  }
  // The end of a game, right on time (and nothing left waiting once everyone's gone home).
  const at = room.players.size ? room.games.wakeAt() : null;
  if (at === (room.gameAt ?? null)) return;
  clearTimeout(room.gameTimer);
  room.gameAt = at;
  if (at !== null) room.gameTimer = setTimeout(() => { room.gameAt = null; deliver(room, room.games.tick(Math.max(Date.now(), at)), send, broadcast); }, at - Date.now());
}

/** A dog arrived: if there's a game on, they join in. */
export function gameJoin(room, p, send, broadcast) { if (room.games) deliver(room, room.games.join(p.id, Date.now()), send, broadcast); }

/** A game move from a dog (start a game, finish a race, grab a bone, tag someone…). */
export function gameMessage(room, p, msg, send, broadcast) { deliver(room, gamesOf(room).message(p.id, msg, Date.now()), send, broadcast); }

/** A dog went home: someone else is "it", or runs the ducks; a race everyone's finished ends. */
export function gameLeave(room, p, send, broadcast) { if (room.games) deliver(room, room.games.leave(p.id, Date.now()), send, broadcast); }
