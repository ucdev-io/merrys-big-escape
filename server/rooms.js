// Dog Park multiplayer: rooms ("packs") relay dog positions and share one adventure.
// Trust model: home Wi-Fi play, so clients own their own dog's position; the server only
// validates shapes/sizes, relays, and keeps the shared quest state for each pack.
import { WebSocketServer } from 'ws';

const BREEDS = ['merry', 'pippin', 'teddy', 'waffles', 'bramble', 'dotty'];
const WORDS = ['BONE', 'PAWS', 'WOOF', 'WAGS', 'YAPS', 'SNIF', 'TAIL', 'FUZZ', 'PUPS', 'BARK'];
const MAX_PLAYERS = 8, MAX_ROOMS = 50, TICK_MS = 80;

const rooms = new Map();
let nextId = 1;

const cleanName = (s) => String(s ?? '').replace(/[^A-Za-z0-9 '\-]/g, '').trim().slice(0, 14) || 'Doggo';
const cleanSeed = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 32);
const cleanId = (s) => String(s ?? '').replace(/[^a-z0-9_\-]/gi, '').slice(0, 24);
const num = (v, lim = 1e4) => (Number.isFinite(v) && Math.abs(v) < lim ? Math.round(v * 100) / 100 : 0);

function makeCode() {
  for (let i = 0; i < 100; i++) {
    const code = `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${10 + Math.floor(Math.random() * 90)}`;
    if (!rooms.has(code)) return code;
  }
  return null;
}

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg, except) => { for (const p of room.players.values()) if (p !== except) send(p.ws, msg); };
const publicPlayer = (p) => ({ id: p.id, name: p.name, breed: p.breed, slot: p.slot });
// Each dog gets the lowest free house number (0 = the host's garden).
const freeSlot = (room) => { const used = new Set([...room.players.values()].map((q) => q.slot)); let i = 0; while (used.has(i)) i++; return i; };

function welcome(room, p) {
  send(p.ws, {
    t: 'welcome', id: p.id, slot: p.slot, code: room.code, seed: room.seed,
    players: [...room.players.values()].filter((q) => q !== p).map(publicPlayer),
    shared: { discovered: [...room.discovered], bones: [...room.bones] },
  });
  broadcast(room, { t: 'join', p: publicPlayer(p) }, p);
}

function leave(p) {
  const room = p.room;
  if (!room) return;
  room.players.delete(p.id);
  broadcast(room, { t: 'leave', id: p.id });
  if (room.players.size === 0) rooms.delete(room.code);
  p.room = null;
}

function onMessage(p, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  const room = p.room;
  switch (msg.t) {
    case 'create': {
      if (room) return;
      if (rooms.size >= MAX_ROOMS) return send(p.ws, { t: 'error', msg: 'Too many packs right now — try again later.' });
      // Reopening a pack after everyone's phone slept keeps its old code, if it's free.
      const want = String(msg.code ?? '').toUpperCase();
      const code = /^[A-Z]{4}-\d{2}$/.test(want) && !rooms.has(want) ? want : makeCode();
      const seed = cleanSeed(msg.seed);
      if (!code || !seed) return send(p.ws, { t: 'error', msg: 'Could not start a pack.' });
      const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n).map(cleanId);
      const r = { code, seed, players: new Map(), discovered: new Set(list(msg.discovered, 20)), bones: new Set(list(msg.bones, 50)) };
      rooms.set(code, r);
      Object.assign(p, { name: cleanName(msg.name), breed: BREEDS.includes(msg.breed) ? msg.breed : 'merry', room: r, slot: 0 });
      r.players.set(p.id, p);
      return welcome(r, p);
    }
    case 'join': {
      if (room) return;
      const r = rooms.get(String(msg.code ?? '').toUpperCase().trim());
      if (!r) return send(p.ws, { t: 'error', msg: 'No pack with that code. Check the code and try again!' });
      if (r.players.size >= MAX_PLAYERS) return send(p.ws, { t: 'error', msg: 'That pack is full (8 dogs max).' });
      Object.assign(p, { name: cleanName(msg.name), breed: BREEDS.includes(msg.breed) ? msg.breed : 'merry', room: r, slot: freeSlot(r) });
      r.players.set(p.id, p);
      return welcome(r, p);
    }
    case 's': // my dog's state
      if (!room) return;
      p.state = [p.id, num(msg.x), num(msg.z), num(msg.h, 100), num(msg.v, 50), (msg.f | 0) & 15, num(msg.y, 50)];
      p.dirty = true;
      return;
    case 'act': // bark / dig — instant, relay to the others
      if (!room || !['bark', 'dig', 'shake', 'tip', 'hole', 'trample'].includes(msg.a)) return;
      // Mischief carries what/where (a bin id, or a spot); barks etc. just say who.
      if (['tip', 'hole', 'trample'].includes(msg.a)) return broadcast(room, { t: 'act', by: p.id, a: msg.a, id: cleanId(msg.id), x: num(msg.x), z: num(msg.z) }, p);
      return broadcast(room, { t: 'act', id: p.id, a: msg.a }, p);
    case 'ev': { // shared adventure progress
      const kinds = { discover: 'discovered', bone: 'bones' };
      if (!room || !msg.ev || !kinds[msg.ev.type]) return;
      const id = cleanId(msg.ev.id), set = room[kinds[msg.ev.type]];
      if (!id || set.has(id) || set.size > 60) return;
      set.add(id);
      return broadcast(room, { t: 'ev', by: p.id, name: p.name, ev: { type: msg.ev.type, id } });
    }
  }
}

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
