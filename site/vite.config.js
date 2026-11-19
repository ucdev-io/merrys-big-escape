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
      input: {
        index: here('index.html'),
        walk: here('walk/index.html'),
        book: here('book/index.html'),
        404: here('404.html'),
      },
    },
  },
  server: { port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
});
