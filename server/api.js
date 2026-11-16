// The game's little web API, shared by the Vite dev server and `npm run play`.
//   GET  /api/lan       this computer's addresses (for "play on a phone" links)
//   GET  /api/packs     packs playing now + saved neighbourhoods
//   GET  /api/profiles  saved dogs (for "Who's playing?")
//   POST /api/profile   { action: 'create' | 'get' | 'sync', ... } → { profile }
//   GET  /api/records?town=SEED&profile=ID   🏆 family records → { boards, mine }
//   POST /api/log       🩺 a device's note: an error, or how far a page got loading (see index.html)
//   GET  /api/log       the last few hundred of those (also printed on this computer's console)
import { listPacks, onlineProfiles, liveCodes } from './rooms.js';
import { listProfiles, createProfile, getProfile, syncProfile, listWorlds, getRecords } from './store.js';
import { lanInfoHandler } from './lan.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// 🩺 Notes from the players' devices (kept in memory only): when a phone's page goes wrong, what it said
// and how far it got. A page that dies outright (out of memory) can't say so, but the next load can.
const LOG = [], LOG_MAX = 300, logRate = new Map();
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, n);
function clientLog(req, res) {
  const ip = String(req.socket?.remoteAddress ?? '?').replace(/^::ffff:/, ''), now = Date.now();
  const r = logRate.get(ip);
  if (r && now - r.t < 60000 && r.n >= 60) { req.resume(); return json(res, 429, { error: 'Slow down' }); }
  logRate.set(ip, r && now - r.t < 60000 ? { t: r.t, n: r.n + 1 } : { t: now, n: 1 });
  readBody(req, 4096).then((b) => {
    const e = { at: new Date(now).toISOString(), ip, kind: clip(b?.kind, 24), msg: clip(b?.msg, 500), page: clip(b?.page, 80), ms: Math.round(Number(b?.t) || 0), data: b?.data && typeof b.data === 'object' ? clip(JSON.stringify(b.data), 900) : '' };
    LOG.push(e);
    if (LOG.length > LOG_MAX) LOG.shift();
    console.log(`  🩺 ${ip} ${e.kind}: ${e.msg}${e.data ? ' ' + e.data : ''}`);
    json(res, 200, { ok: true });
  }).catch(() => json(res, 400, { error: 'Bad request' }));
}

/** Answer /api/… requests. Returns false for anything else. */
export function handleApi(req, res) {
  const [path, query = ''] = (req.url ?? '').split('?');
  if (!path.startsWith('/api/')) return false;
  if (path === '/api/log') { if (req.method === 'POST') clientLog(req, res); else json(res, 200, { log: LOG }); }
  else if (path === '/api/lan') lanInfoHandler(req, res);
  else if (path === '/api/packs') json(res, 200, { packs: listPacks(), worlds: listWorlds(liveCodes()) });
  else if (path === '/api/profiles') json(res, 200, { profiles: listProfiles(onlineProfiles()) });
  else if (path === '/api/records') { const q = new URLSearchParams(query); json(res, 200, getRecords(q.get('town'), q.get('profile'))); }
  else if (path === '/api/profile' && req.method === 'POST') {
    readBody(req).then((b) => {
      const profile = b?.action === 'create' ? createProfile(b)
        : b?.action === 'get' ? getProfile(b.id)
          : b?.action === 'sync' ? syncProfile(b.id, b) : null;
      json(res, profile ? 200 : 404, { profile });
    }).catch(() => json(res, 400, { error: 'Bad request' }));
  } else json(res, 404, { error: 'Not found' });
  return true;
}
