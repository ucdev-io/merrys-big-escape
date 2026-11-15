// Draws the app icon (a paw print on a watercolour wash) and writes PNGs to public/icons/.
// No dependencies: a tiny rasteriser + PNG encoder using Node's zlib.
//   node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const PAPER = hex(0xf6efe0), WASH = hex(0xe9c99a), EDGE = hex(0xcf9f6a), INK = hex(0x5a3a28);

// Deterministic value noise for a little paper grain and wash wobble.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function inEllipse(u, v, cx, cy, rx, ry, rot = 0) {
  const dx = u - cx, dy = v - cy, c = Math.cos(rot), s = Math.sin(rot);
  const x = dx * c + dy * s, y = -dx * s + dy * c;
  return (x / rx) ** 2 + (y / ry) ** 2 < 1;
}

const TOES = [[0.315, 0.455, -0.45], [0.425, 0.345, -0.15], [0.575, 0.345, 0.15], [0.685, 0.455, 0.45]];

/** Colour of the icon at unit coordinates (u, v), v going down. */
function shade(u, v) {
  let c = [...PAPER];
  const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
  const edge = 0.42 + 0.012 * Math.sin(5 * th) + 0.008 * Math.sin(11 * th + 1);
  if (r < edge) {
    c = [...WASH];
    const wet = Math.max(0, 1 - (edge - r) / 0.035); // pigment pools at the wash's edge
    c = c.map((x, i) => x + (EDGE[i] - x) * wet * 0.8);
  }
  const paw = TOES.some(([cx, cy, rot]) => inEllipse(u, v, cx, cy, 0.064, 0.08, rot))
    || inEllipse(u, v, 0.5, 0.63, 0.16, 0.125) || inEllipse(u, v, 0.5, 0.585, 0.12, 0.1);
  if (paw) c = [...INK];
  return c;
}

function render(size) {
  const ss = 4, out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const [cr, cg, cb] = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
      r += cr; g += cg; b += cb;
    }
    const grain = (hash(x, y) - 0.5) * 8; // paper texture
    const i = (y * size + x) * 4, n = ss * ss;
    out[i] = Math.max(0, Math.min(255, r / n + grain));
    out[i + 1] = Math.max(0, Math.min(255, g / n + grain));
    out[i + 2] = Math.max(0, Math.min(255, b / n + grain));
    out[i + 3] = 255;
  }
  return out;
}

// ---- minimal PNG encoder
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = size * 4 + 1, raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4); // filter byte 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, png(size, render(size)));
  console.log(`public/icons/icon-${size}.png`);
}
