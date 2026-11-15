// 🍂❄️🌸☀️ Seasons in a pack: the server runs each pack's SeasonRoom (src/game/seasonRules.js), so every
// dog sees the same season, the same showers starting and stopping together, and the same snowmen and
// leaf piles. Whoever opens the pack picks the season (their setting, or their calendar).
import { SeasonRoom } from '../src/game/seasonRules.js';

function deliver(room, list, send, broadcast) {
  for (const { to, msg } of list) {
    if (to === 'all') broadcast(room, { t: 'season', ...msg });
    else { const q = room.players.get(to); if (q) send(q.ws, { t: 'season', ...msg }); }
  }
}

/** A pack opens: the dog opening it brings its season ({ season, festive } from its settings or calendar). */
export function seasonOpen(room, msg) { room.seasons = new SeasonRoom(Date.now(), msg?.season); }

/** The season, weather and toys, for a dog's welcome (the first dog in becomes the season picker). */
export function seasonWelcome(room, p) {
  room.seasons ??= new SeasonRoom(Date.now());
  room.seasons.join(p.id, p.name);
  return room.seasons.snapshot(Date.now());
}

/** A seasons move from a dog (pick the season or the weather, build a snowman, leap into a leaf pile). */
export function seasonMessage(room, p, msg, send, broadcast) {
  if (!room.seasons) return;
  deliver(room, room.seasons.message(p.id, msg, Date.now()), send, broadcast);
  room.heist?.setSeason?.(room.seasons.season); // (summer: more BBQ parties)
}

/** A dog went home: if they were picking the season, the dog who's been there longest does now. */
export function seasonLeave(room, p, send, broadcast) {
  if (!room.seasons) return;
  const next = room.players.values().next().value ?? null;
  deliver(room, room.seasons.leave(p.id, next && { id: next.id, name: next.name }), send, broadcast);
}

/** Called often: weather spells coming and going. */
export function seasonTick(room, send, broadcast) { if (room.seasons && room.players.size) deliver(room, room.seasons.tick(Date.now()), send, broadcast); }

/** The pack's season ('spring' | 'summer' | 'autumn' | 'winter'), or null before it's opened. */
export const seasonOf = (room) => room.seasons?.season ?? null;
