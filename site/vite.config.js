import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Merry's own page (merry.ucdev.io). Built into dist-site/, next to the web demo in dist-site/play/
// (`npm run site` builds both). It borrows the game's own dog and watercolour paint from ../src.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  appType: 'mpa', // (like the real host: an unknown address is a 404, not the front page)
  build: {
    outDir: here('../dist-site'),
    emptyOutDir: true,
    rollupOptions: {
      // What's published: the page ("The Walk") and the 404. Designs kept for later live in lab/
      // (e.g. lab/book/, "The Sniff Book"): the dev server shows them, the build leaves them out.
      input: {
        index: here('index.html'),
        404: here('404.html'),
      },
    },
  },
  server: { port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
});
