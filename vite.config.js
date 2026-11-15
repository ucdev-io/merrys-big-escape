import { defineConfig } from 'vite';
import { attachDogPark } from './server/rooms.js';

// Runs the Dog Park multiplayer server inside the Vite dev server (same port, path /ws).
const dogPark = () => ({
  name: 'dog-park',
  configureServer(server) { if (server.httpServer) attachDogPark(server.httpServer); },
});

export default defineConfig({
  plugins: [dogPark()],
  // Listen on the local network so phones/tablets on the same Wi-Fi can play.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
