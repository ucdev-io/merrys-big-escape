// Standalone game server for LAN play: serves the built game (dist/) and the Dog Park on one port.
//   npm run play   → builds, then runs this on http://<this-pc>:8080
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { attachDogPark, packsHandler } from './rooms.js';
import { lanAddresses, lanInfoHandler } from './lan.js';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = resolve(process.cwd(), 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/lan') return lanInfoHandler(req, res);
    if (url.pathname === '/api/packs') return packsHandler(req, res);
    let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; } // no escaping dist/
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    let body = await readFile(file).catch(() => null);
    // Links like /pack/BONE-42 are app pages: serve the game and let it read the path.
    if (!body && !extname(file)) { file = join(ROOT, 'index.html'); body = await readFile(file).catch(() => null); }
    if (!body) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
});

attachDogPark(server);
server.listen(PORT, () => {
  console.log(`\n  🐾 Merry's Big Escape is running!\n`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  On your network:   http://${a.address}:${PORT}   (${a.name})`);
  console.log('');
});
