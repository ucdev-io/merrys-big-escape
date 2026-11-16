import path from 'node:path';
import { defineConfig } from 'vite';
import { attachDogPark } from './server/rooms.js';
import { handleApi } from './server/api.js';
import { dataDir } from './server/store.js';

// Runs the Dog Park multiplayer server inside the Vite dev server (same port, path /ws).
// The dev server is the workshop: it keeps its saves in data-dev/, apart from the home
// game (`npm run play` / play.cmd on port 8080, saving in data/).
const dogPark = () => ({
  name: 'dog-park',
  configureServer(server) {
    process.env.MERRY_DATA ??= path.join(process.cwd(), 'data-dev');
    if (server.httpServer) attachDogPark(server.httpServer);
    server.middlewares.use((req, res, next) => { if (!handleApi(req, res)) next(); });
    server.httpServer?.once('listening', () => console.log(`  🐾 Workshop saves (dev server): ${dataDir()}`));
  },
});

export default defineConfig({
  plugins: [dogPark()],
  // Listen on the local network so phones/tablets on the same Wi-Fi can play.
  // Saved dogs/neighbourhoods (data/) change while you play: that's not a reason to reload the page.
  // Nor is a test build (dist-test) or a helper's copy of the project (.claude/worktrees).
  server: { host: true, port: 5173, watch: { ignored: ['**/data/**', '**/data-dev/**', '**/dist-test/**', '**/dist/**', '**/.claude/**'] } },
  preview: { host: true, port: 4173 },
});
