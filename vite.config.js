import { defineConfig } from 'vite';
import { attachDogPark, packsHandler } from './server/rooms.js';
import { lanInfoHandler } from './server/lan.js';

// Runs the Dog Park multiplayer server inside the Vite dev server (same port, path /ws).
const dogPark = () => ({
  name: 'dog-park',
  configureServer(server) {
    if (server.httpServer) attachDogPark(server.httpServer);
    server.middlewares.use('/api/lan', lanInfoHandler);
    server.middlewares.use('/api/packs', packsHandler);
  },
});

export default defineConfig({
  plugins: [dogPark()],
  // Listen on the local network so phones/tablets on the same Wi-Fi can play.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
