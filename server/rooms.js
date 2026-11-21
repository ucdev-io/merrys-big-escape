// Dog Park multiplayer: rooms ("packs") relay dog positions and share one adventure.
// Trust model: home Wi-Fi play, so clients own their own dog's position; the server only
// validates shapes/sizes, relays, and keeps the shared adventure for each pack.
//
// Every pack plays a saved neighbourhood (store.js): what's been found there and whose house is
// whose are kept when everyone leaves, and it keeps the same code, so links to it keep working.
import { WebSocketServer } from 'ws';
import { BREED_IDS } from '../src/entities/breedIds.js';
import { cleanName, cleanSeed, cleanId, cleanCode, num, cleanLevel, cleanLook, list } from './clean.js';
import { worldFor, worldByCode, touchWorld, getProfile } from './store.js';
import { gameJoin, gameMessage, gameLeave } from './games.js';
import { heistJoin, heistMessage, heistLeave, heistTick } from './heists.js';
import { seasonOpen, seasonWelcome, seasonMessage, seasonLeave, seasonTick } from './seasons.js';
import { cleanDen, DEN_MAX, STICK_GAP_MS } from '../src/game/denRules.js';
import { beachWelcome, beachMessage } from './beach.js';
import { farmMessage, farmLeave } from './farm.js';

const WORDS = ['BONE', 'PAWS', 'WOOF', 'WAGS', 'YAPS', 'SNIF', 'TAIL', 'FUZZ', 'PUPS', 'BARK'];
const MAX_PLAYERS = 8, MAX_ROOMS = 50, TICK_MS = 80, HOUSES = 8, MAX_FINDS = 60;

const rooms = new Map(); // code → { code, seed, world, players }
let nextId = 1;

function makeCode() {
  for (let i = 0; i < 200; i++) {
    const code = `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${10 + Math.floor(Math.random() * 90)}`;
    if (!rooms.has(code) && !worldByCode(code)) return code;
  }
  return null;
}

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg, except) => { for (const p of room.players.values()) if (p !== except) send(p.ws, msg); };
const publicPlayer = (p) => ({ id: p.id, name: p.name, breed: p.breed, slot: p.slot, level: p.level, look: p.look, carry: p.carry ?? null });
const liveRoom = (world) => [...rooms.values()].find((r) => r.world === world);

/** Open a saved neighbourhood for play, keeping its own code if it can (old links still work). msg: the opener's (their season). */
function openRoom(world, wantCode, msg = null) {
  let code = world.code && !rooms.has(world.code) ? world.code : null;
  const theirs = wantCode && worldByCode(wantCode);
  if (!code && wantCode && !rooms.has(wantCode) && (!theirs || theirs === world)) code = wantCode; // a phone reopening its pack
  code ??= makeCode();
  if (!code) return null;
  world.code = code;
  const r = { code, seed: world.seed, world, players: new Map() };
  seasonOpen(r, msg); // 🍂❄️ whoever opens the pack picks its season
  rooms.set(code, r);
  touchWorld(world);
  return r;
}

/**
 * Each dog keeps the same house in a neighbourhood (0 = whoever made it). Visitors get the lowest
 * house nobody's using right now, preferably one that isn't someone else's.
 */
function houseFor(room, profile) {
  // (The same dog's old connection, still closing after a reload, doesn't count as using its house.)
  const used = new Set([...room.players.values()].filter((q) => !profile || q.profile !== profile).map((q) => q.slot));
  const w = room.world;
  const mine = profile ? w.houses[profile] : undefined;
  if (mine !== undefined && !used.has(mine)) return mine;
  const owned = new Set(Object.values(w.houses));
  let slot = -1;
  for (let i = 0; i < HOUSES; i++) if (!used.has(i) && !owned.has(i)) { slot = i; break; }
  if (slot < 0) { slot = 0; while (used.has(slot)) slot++; } // every house has an owner: share
  else if (profile && mine === undefined) w.houses[profile] = slot; // it's yours from now on
  return slot;
}

function enter(p, room, msg) {
  if (room.players.size >= MAX_PLAYERS) return send(p.ws, { t: 'error', msg: 'That pack is full (8 dogs max).' });
  const profile = msg.profile && getProfile(msg.profile) ? cleanId(msg.profile) : null;
  Object.assign(p, {
    name: cleanName(msg.name), breed: BREED_IDS.includes(msg.breed) ? msg.breed : 'merry', room, profile,
    slot: houseFor(room, profile), level: cleanLevel(msg.level), look: cleanLook(msg.look),
  });
  room.players.set(p.id, p);
  touchWorld(room.world);
  send(p.ws, {
    t: 'welcome', id: p.id, slot: p.slot, code: room.code, seed: room.seed,
    players: [...room.players.values()].filter((q) => q !== p).map(publicPlayer),
    shared: { discovered: [...room.world.discovered], bones: [...room.world.bones], den: room.world.den ?? 0 },
    season: seasonWelcome(room, p), // the pack's season, weather and seasonal toys
    beach: beachWelcome(room),      // 🏖️ the sandcastles, as the pack left them
  });
  broadcast(room, { t: 'join', p: publicPlayer(p) }, p);
  heistJoin(room, p, send); // who's looking, which treats are where
  gameJoin(room, p, send, broadcast); // a game on? join in!
}

function leave(p) {
  const room = p.room;
  if (!room) return;
  room.players.delete(p.id);
  broadcast(room, { t: 'leave', id: p.id });
  heistLeave(room, p, send, broadcast);
  seasonLeave(room, p, send, broadcast);
  farmLeave(room, p, send, broadcast);
  gameLeave(room, p, send, broadcast);
  touchWorld(room.world);
  if (room.players.size === 0) rooms.delete(room.code);
  p.room = null;
}

/** Finds made elsewhere (playing alone, or before neighbourhoods were saved) count here too. */
function mergeFinds(world, msg) {
  for (const [key, n] of [['discovered', 20], ['bones', 50]]) {
    for (const id of list(msg[key], n)) if (!world[key].includes(id) && world[key].length < MAX_FINDS) world[key].push(id);
  }
  if (msg.den !== undefined) world.den = Math.max(world.den ?? 0, cleanDen(msg.den)); // (a den built alone counts too)
}

function onMessage(p, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  const room = p.room;
  switch (msg.t) {
    case 'create': { // open my neighbourhood (or join it, if someone's already there)
      if (room) return;
      const seed = cleanSeed(msg.seed);
      if (!seed) return send(p.ws, { t: 'error', msg: 'Could not start a pack.' });
      const profile = msg.profile && getProfile(msg.profile) ? cleanId(msg.profile) : null;
      const world = worldFor(seed, profile);
      mergeFinds(world, msg);
      const live = liveRoom(world);
      if (live) return enter(p, live, msg);
      if (rooms.size >= MAX_ROOMS) return send(p.ws, { t: 'error', msg: 'Too many packs right now — try again later.' });
      const r = openRoom(world, cleanCode(msg.code), msg);
      if (!r) return send(p.ws, { t: 'error', msg: 'Could not start a pack.' });
      return enter(p, r, msg);
    }
    case 'join': {
      if (room) return;
      const code = cleanCode(msg.code);
      let r = code && rooms.get(code);
      if (!r) {
        // Nobody's there right now, but it's a saved neighbourhood: open it up again.
        const world = code && worldByCode(code);
        if (!world) return send(p.ws, { t: 'error', msg: 'No pack with that code. Check the code and try again!' });
        if (rooms.size >= MAX_ROOMS) return send(p.ws, { t: 'error', msg: 'Too many packs right now — try again later.' });
        r = openRoom(world, code, msg);
        if (!r) return send(p.ws, { t: 'error', msg: 'Could not open that pack.' });
      }
      return enter(p, r, msg);
    }
    case 's': // my dog's state
      if (!room) return;
      p.state = [p.id, num(msg.x), num(msg.z), num(msg.h, 100), num(msg.v, 50), (msg.f | 0) & 0xffff, num(msg.y, 50)]; // (f: sniffing, digging…; 32: on a sledge; 64 + 128: how muddy; 256–2048: away on a trip; 4096–32768: on which of the trip's rides)
      p.dirty = true;
      return;
    case 'act': // bark / dig — instant, relay to the others
      if (!room || !['bark', 'dig', 'shake', 'tip', 'hole', 'trample', 'scatter', 'emote'].includes(msg.a)) return;
      if (msg.a === 'emote') return broadcast(room, { t: 'act', id: p.id, a: 'emote', e: cleanId(msg.id) }, p);
      // World changes carry what/where (a bin or flock id, a spot); barks etc. just say who.
      if (['tip', 'hole', 'trample', 'scatter'].includes(msg.a)) return broadcast(room, { t: 'act', by: p.id, a: msg.a, id: cleanId(msg.id), x: num(msg.x), z: num(msg.z) }, p);
      return broadcast(room, { t: 'act', id: p.id, a: msg.a }, p);
    case 'game': // 🎮 games and challenges (see games.js)
      if (room) gameMessage(room, p, msg, send, broadcast);
      return;
    case 'heist': // 🥐 cheeky food raids (see heists.js)
      if (room) heistMessage(room, p, msg, send, broadcast);
      return;
    case 'season': // 🍂❄️ the season, the weather, snowmen and leaf piles (see seasons.js)
      if (room) seasonMessage(room, p, msg, send, broadcast);
      return;
    case 'woods': // 🌲 a big stick for the den: the den belongs to the whole town, and is saved with it
      if (!room || msg.a !== 'stick' || Date.now() - (p.stickAt ?? 0) < STICK_GAP_MS) return;
      p.stickAt = Date.now();
      room.world.den = Math.min(DEN_MAX, (room.world.den ?? 0) + 1);
      touchWorld(room.world);
      return broadcast(room, { t: 'woods', a: 'den', n: room.world.den, by: p.id, name: p.name });
    case 'beach': // 🏖️ sandcastles: built by the whole pack, and kept with the town (see beach.js)
      if (room) beachMessage(room, p, msg, send, broadcast);
      return;
    case 'farm': // 🚜 the sheep (run by one dog's game for everyone) and round-ups, kept with the town (see farm.js)
      if (room) farmMessage(room, p, msg, send, broadcast);
      return;
    case 'carry': // what's in my mouth (a lost teddy, Gus's slipper…), or nothing
      if (!room) return;
      p.carry = msg.item ? cleanId(msg.item) : null;
      return broadcast(room, { t: 'carry', id: p.id, item: p.carry }, p);
    case 'look': // new outfit or level
      if (!room) return;
      p.level = cleanLevel(msg.level);
      p.look = cleanLook(msg.look);
      return broadcast(room, { t: 'look', id: p.id, level: p.level, look: p.look }, p);
    case 'ev': { // shared adventure progress
      const kinds = { discover: 'discovered', bone: 'bones' };
      if (!room || !msg.ev || !kinds[msg.ev.type]) return;
      const id = cleanId(msg.ev.id), found = room.world[kinds[msg.ev.type]];
      if (!id) return;
      const ev = { type: msg.ev.type, id };
      // Already found (perhaps before this dog arrived): just tell them, so they get their sticker too.
      if (found.includes(id)) return send(p.ws, { t: 'ev', by: p.id, name: p.name, ev });
      if (found.length >= MAX_FINDS) return;
      found.push(id);
      touchWorld(room.world);
      return broadcast(room, { t: 'ev', by: p.id, name: p.name, ev });
    }
  }
}

/** Every open neighbourhood on this server, for the "Friends playing now" lists. */
export function listPacks() {
  return [...rooms.values()].map((r) => {
    const dogs = [...r.players.values()];
    const host = dogs.find((q) => q.slot === 0) ?? dogs[0];
    return {
      code: r.code, seed: r.seed, host: host?.name ?? 'A dog',
      dogs: dogs.map((q) => ({ name: q.name, breed: q.breed })),
      full: dogs.length >= MAX_PLAYERS,
    };
  });
}

/** Saved dogs that are in a pack right now. */
export function onlineProfiles() {
  const out = new Set();
  for (const r of rooms.values()) for (const q of r.players.values()) if (q.profile) out.add(q.profile);
  return out;
}

/** Codes of the packs playing right now. */
export const liveCodes = () => new Set(rooms.keys());

/** Attach the Dog Park to an HTTP server, answering WebSocket upgrades on /ws. */
export function attachDogPark(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) return; // leave other upgrades (e.g. Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const p = { id: nextId++, ws, room: null, name: 'Doggo', breed: 'merry', state: null };
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      onMessage(p, msg);
    });
    ws.on('close', () => leave(p));
    ws.on('error', () => leave(p));
  });

  // Position snapshots to every pack ~12 times a second.
  setInterval(() => {
    for (const room of rooms.values()) {
      const states = [];
      for (const p of room.players.values()) if (p.state) states.push(p.state);
      if (states.length) broadcast(room, { t: 'ss', p: states });
      heistTick(room, send, broadcast);
      seasonTick(room, send, broadcast);
    }
  }, TICK_MS);

  // Drop dogs whose connection silently died (phone went to sleep, Wi-Fi dropped…).
  setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 10000);

  return wss;
}
