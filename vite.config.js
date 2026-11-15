import { defineConfig } from 'vite';
import { attachDogPark } from './server/rooms.js';
import { handleApi } from './server/api.js';
import { dataDir } from './server/store.js';

// Runs the Dog Park multiplayer server inside the Vite dev server (same port, path /ws).
const dogPark = () => ({
  name: 'dog-park',
  configureServer(server) {
    if (server.httpServer) attachDogPark(server.httpServer);
    server.middlewares.use((req, res, next) => { if (!handleApi(req, res)) next(); });
    server.httpServer?.once('listening', () => console.log(`  🐾 Dogs and neighbourhoods are saved in ${dataDir}`));
  },
});

export default defineConfig({
  plugins: [dogPark()],
  // Listen on the local network so phones/tablets on the same Wi-Fi can play.
  // Saved dogs/neighbourhoods (data/) change while you play: that's not a reason to reload the page.
  server: { host: true, port: 5173, watch: { ignored: ['**/data/**'] } },
  preview: { host: true, port: 4173 },
});
