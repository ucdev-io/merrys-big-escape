import { defineConfig } from 'vite';

export default defineConfig({
  // Listen on the local network so phones/tablets on the same Wi-Fi can play.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
