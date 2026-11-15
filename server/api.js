// The game's little web API, shared by the Vite dev server and `npm run play`.
//   GET  /api/lan       this computer's addresses (for "play on a phone" links)
//   GET  /api/packs     packs playing now + saved neighbourhoods
//   GET  /api/profiles  saved dogs (for "Who's playing?")
//   POST /api/profile   { action: 'create' | 'get' | 'sync', ... } → { profile }
import { listPacks, onlineProfiles, liveCodes } from './rooms.js';
import { listProfiles, createProfile, getProfile, syncProfile, listWorlds } from './store.js';
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

/** Answer /api/… requests. Returns false for anything else. */
export function handleApi(req, res) {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith('/api/')) return false;
  if (path === '/api/lan') lanInfoHandler(req, res);
  else if (path === '/api/packs') json(res, 200, { packs: listPacks(), worlds: listWorlds(liveCodes()) });
  else if (path === '/api/profiles') json(res, 200, { profiles: listProfiles(onlineProfiles()) });
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
