// Dog Park multiplayer: rooms ("packs") relay dog positions and share one adventure.
// Trust model: home Wi-Fi play, so clients own their own dog's position; the server only
// validates shapes/sizes, relays, and keeps the shared adventure for each pack.
//
// Every pack plays a saved neighbourhood (store.js): what's been found there and whose house is
// whose are kept when everyone leaves, and it keeps the same code, so links to it keep working.
import { WebSocketServer } from 'ws';
import { BREED_IDS } from '../src/entities/breedIds.js';
import { cleanName, cleanSeed, cleanId, cleanCode, num, cleanLevel, cleanLook, list } from './clean.js';
import { worldFor, worldByCode, touchWorld, getProfile, addResults } from './store.js';
import { CHALLENGES } from '../src/game/challenges.js';
import { heistJoin, heistMessage, heistLeave, heistTick } from './heists.js';
import { seasonOpen, seasonWelcome, seasonMessage, seasonLeave, seasonTick } from './seasons.js';

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
    shared: { discovered: [...room.world.discovered], bones: [...room.world.bones] },
    season: seasonWelcome(room, p), // the pack's season, weather and seasonal toys
  });
  broadcast(room, { t: 'join', p: publicPlayer(p) }, p);
  heistJoin(room, p, send); // who's looking, which treats are where
  const g = room.game;
  if (g && !g.over) { g.dogs.set(p.id, dogOf(p)); send(p.ws, { t: 'game', a: 'start', game: publicGame(g) }); } // join in!
}

// ---- games and challenges (see src/game/challenges.js): 🏁 races, ⚡ the zoomies dash, 🦴 bone rush,
// 🐦 pigeon panic, 🦆 duck round-up and 🐾 tag. The server keeps score, so everyone sees the same
// results, and puts the best on the 🏆 family records. Times go out as "in so many ms" (everyone's
// clock is a bit different). The dog who starts a round-up runs the ducks for everyone (its "host").
const publicGame = (g) => ({
  id: g.id, kind: g.kind, by: g.by, byName: g.byName, target: g.target, seed: g.seed, host: g.host, over: g.over,
  it: g.it, tags: g.tags, scores: g.scores, got: g.got, home: g.home, finishers: g.finishers, doneMs: g.doneMs,
  startsIn: g.startAt - Date.now(), endsIn: g.endsAt - Date.now(), records: g.records ?? null,
});
const dogOf = (q) => ({ name: q.name, breed: q.breed, profile: q.profile });

function startGame(room, p, msg) {
  if (room.game && !room.game.over) return;
  const kind = Object.hasOwn(CHALLENGES, msg.kind) ? msg.kind : 'race', C = CHALLENGES[kind];
  if (room.players.size < (C.min ?? 1)) return send(p.ws, { t: 'game', a: 'nope', msg: `${C.name} needs at least ${C.min} dogs!` });
  const now = Date.now();
  const g = (room.game = {
    id: (room.gameN = (room.gameN ?? 0) + 1), kind, by: p.id, byName: p.name, target: cleanId(msg.target), over: false,
    seed: Math.floor(Math.random() * 1e9), host: p.id, startAt: now + 4000, endsAt: now + 4000 + C.secs * 1000,
    finishers: [], tags: {}, it: null, lastTag: 0, scores: {}, got: {}, home: [], doneMs: null,
    dogs: new Map([...room.players.values()].map((q) => [q.id, dogOf(q)])), // everyone who played (even if they go home)
  });
  if (kind === 'tag') { const ids = [...room.players.keys()]; g.it = ids[Math.floor(Math.random() * ids.length)]; }
  clearTimeout(room.gameTimer);
  room.gameTimer = setTimeout(() => endGame(room), g.endsAt - now);
  broadcast(room, { t: 'game', a: 'start', game: publicGame(g) });
}

function endGame(room) {
  const g = room.game;
  if (!g || g.over) return;
  g.over = true;
  clearTimeout(room.gameTimer);
  g.records = saveRecords(room, g);
  broadcast(room, { t: 'game', a: 'end', game: publicGame(g) });
}

/** Results onto the 🏆 family records: { board (top 5), mine: { [dog id, or 'team']: { rank, record, best } } }. */
function saveRecords(room, g) {
  const C = CHALLENGES[g.kind];
  if (!C.rank) return null;
  const who = [], entries = [];
  if (C.coop) {
    const team = [...g.dogs.values()];
    if (g.home.length) { who.push('team'); entries.push({ team: team.map((d) => d.name), profiles: team.map((d) => d.profile), breed: team[0]?.breed, score: g.home.length, ms: g.doneMs ?? C.secs * 1000 }); }
  } else if (C.rank === 'time') {
    for (const f of g.finishers) if (g.dogs.has(f.id)) { who.push(f.id); entries.push({ ...g.dogs.get(f.id), ms: f.ms }); }
  } else {
    const scores = g.kind === 'tag' ? g.tags : g.scores;
    for (const [id, d] of g.dogs) if (scores[id] > 0) { who.push(id); entries.push({ ...d, score: scores[id] }); }
  }
  const r = addResults(g.kind, room.seed, entries);
  return r && { board: r.board, mine: Object.fromEntries(who.map((id, i) => [id, r.results[i]])) };
}

function gameMove(room, p, msg) {
  const g = room.game;
  if (!g || g.over || Date.now() < g.startAt - 200) return;
  const C = CHALLENGES[g.kind];
  if (!g.dogs.has(p.id)) g.dogs.set(p.id, dogOf(p));
  switch (msg.a) {
    case 'done': // 🏁 ⚡ over the finish line
      if (!['race', 'dash'].includes(g.kind) || g.finishers.some((f) => f.id === p.id)) return;
      g.finishers.push({ id: p.id, name: p.name, ms: Date.now() - g.startAt });
      broadcast(room, { t: 'game', a: 'finish', id: p.id, name: p.name, place: g.finishers.length, ms: Date.now() - g.startAt });
      if (g.finishers.length >= room.players.size) endGame(room);
      return;
    case 'tag': { // 🐾 you're it!
      const target = Number(msg.target);
      if (g.kind !== 'tag' || g.it !== p.id || target === p.id || !room.players.has(target) || Date.now() - g.lastTag < 1500) return;
      g.tags[p.id] = (g.tags[p.id] ?? 0) + 1;
      g.it = target;
      g.lastTag = Date.now();
      return broadcast(room, { t: 'game', a: 'it', it: target, by: p.id, byName: p.name, name: room.players.get(target).name, tags: g.tags });
    }
    case 'grab': { // 🦴 first dog there gets it
      const i = msg.i | 0;
      if (g.kind !== 'bones' || i < 0 || i >= C.count || g.got[i] !== undefined) return;
      g.got[i] = p.id;
      g.scores[p.id] = (g.scores[p.id] ?? 0) + 1;
      broadcast(room, { t: 'game', a: 'got', i, by: p.id, name: p.name, scores: g.scores });
      if (Object.keys(g.got).length >= C.count) endGame(room);
      return;
    }
    case 'pig': { // 🐦 a flock sent flying
      if (g.kind !== 'pigeons') return;
      const n = Math.max(1, Math.min(12, msg.n | 0));
      g.scores[p.id] = (g.scores[p.id] ?? 0) + n;
      return broadcast(room, { t: 'game', a: 'score', by: p.id, name: p.name, n, scores: g.scores });
    }
    case 'ducks': // 🦆 where the ducks are now (from whoever's running them)
      if (g.kind !== 'ducks' || p.id !== g.host) return;
      return broadcast(room, { t: 'game', a: 'ducks', d: (Array.isArray(msg.d) ? msg.d : []).slice(0, C.count * 3).map((v) => num(v)) }, p);
    case 'home': { // 🦆 one more duck safe in the pond (and which dog shooed it in)
      const i = msg.i | 0, by = room.players.get(Number(msg.by));
      if (g.kind !== 'ducks' || p.id !== g.host || i < 0 || i >= C.count || g.home.includes(i)) return;
      g.home.push(i);
      broadcast(room, { t: 'game', a: 'home', i, home: g.home, by: by?.id ?? null, name: by?.name ?? null });
      if (g.home.length >= C.count) { g.doneMs = Date.now() - g.startAt; endGame(room); }
    }
  }
}

function leave(p) {
  const room = p.room;
  if (!room) return;
  room.players.delete(p.id);
  broadcast(room, { t: 'leave', id: p.id });
  heistLeave(room, p, send, broadcast);
  seasonLeave(room, p, send, broadcast);
  const g = room.game;
  if (g && !g.over && room.players.size) {
    if (g.kind === 'tag' && g.it === p.id) { // "it" went home: someone else is it now
      const ids = [...room.players.keys()];
      g.it = ids[Math.floor(Math.random() * ids.length)];
      broadcast(room, { t: 'game', a: 'it', it: g.it, by: null, byName: null, name: room.players.get(g.it).name, tags: g.tags });
    }
    if (g.kind === 'tag' && room.players.size < 2) endGame(room);
    if (['race', 'dash'].includes(g.kind) && g.finishers.length >= room.players.size) endGame(room);
    if (g.kind === 'ducks' && g.host === p.id) { // someone else runs the ducks now
      g.host = room.players.keys().next().value;
      broadcast(room, { t: 'game', a: 'host', host: g.host });
    }
  }
  if (!room.players.size) clearTimeout(room.gameTimer);
  touchWorld(room.world);
  if (room.players.size === 0) rooms.delete(room.code);
  p.room = null;
}

/** Finds made elsewhere (playing alone, or before neighbourhoods were saved) count here too. */
function mergeFinds(world, msg) {
  for (const [key, n] of [['discovered', 20], ['bones', 50]]) {
    for (const id of list(msg[key], n)) if (!world[key].includes(id) && world[key].length < MAX_FINDS) world[key].push(id);
  }
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
      p.state = [p.id, num(msg.x), num(msg.z), num(msg.h, 100), num(msg.v, 50), (msg.f | 0) & 63, num(msg.y, 50)]; // (32: on a sledge)
      p.dirty = true;
      return;
    case 'act': // bark / dig — instant, relay to the others
      if (!room || !['bark', 'dig', 'shake', 'tip', 'hole', 'trample', 'scatter', 'emote'].includes(msg.a)) return;
      if (msg.a === 'emote') return broadcast(room, { t: 'act', id: p.id, a: 'emote', e: cleanId(msg.id) }, p);
      // World changes carry what/where (a bin or flock id, a spot); barks etc. just say who.
      if (['tip', 'hole', 'trample', 'scatter'].includes(msg.a)) return broadcast(room, { t: 'act', by: p.id, a: msg.a, id: cleanId(msg.id), x: num(msg.x), z: num(msg.z) }, p);
      return broadcast(room, { t: 'act', id: p.id, a: msg.a }, p);
    case 'game': // games and challenges
      if (!room) return;
      if (msg.a === 'start') return startGame(room, p, msg);
      return gameMove(room, p, msg);
    case 'heist': // 🥐 cheeky food raids (see heists.js)
      if (room) heistMessage(room, p, msg, send, broadcast);
      return;
    case 'season': // 🍂❄️ the season, the weather, snowmen and leaf piles (see seasons.js)
      if (room) seasonMessage(room, p, msg, send, broadcast);
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
