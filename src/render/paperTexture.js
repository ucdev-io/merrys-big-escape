import * as THREE from 'three';

// Tileable procedural watercolor paper: multi-octave periodic value noise + faint fibers.
function makePeriodicNoise(period, rand) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[((y % period + period) % period) * period + ((x % period + period) % period)];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = s(x - xi), yf = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export function createPaperTexture(size = 512, seed = 7) {
  let st = seed >>> 0;
  const rand = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);

  const octaves = [
    { period: 8, amp: 0.35 },
    { period: 32, amp: 0.3 },
    { period: 128, amp: 0.22 },
    { period: 256, amp: 0.13 },
  ].map((o) => ({ ...o, fn: makePeriodicNoise(o.period, rand) }));

  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octaves) v += o.fn((x / size) * o.period, (y / size) * o.period) * o.amp;
      data[y * size + x] = v;
    }
  }

  // Fibers: short faint strokes, wrapped around edges so the tile stays seamless.
  for (let f = 0; f < 900; f++) {
    let x = rand() * size, y = rand() * size;
    const ang = rand() * Math.PI * 2, len = 6 + rand() * 22, k = (rand() - 0.5) * 0.12;
    for (let i = 0; i < len; i++) {
      const xi = ((Math.floor(x) % size) + size) % size, yi = ((Math.floor(y) % size) + size) % size;
      data[yi * size + xi] += k;
      x += Math.cos(ang); y += Math.sin(ang);
    }
  }

  // G: large soft blobs (wash density), B: medium wobble noise. Both tile seamlessly.
  const layer = (defs) => {
    const fns = defs.map((o) => ({ ...o, fn: makePeriodicNoise(o.period, rand) }));
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of fns) v += o.fn((x / size) * o.period, (y / size) * o.period) * o.amp;
      out[y * size + x] = v;
    }
    return out;
  };
  const big = layer([{ period: 4, amp: 0.5 }, { period: 8, amp: 0.3 }, { period: 16, amp: 0.2 }]);
  const mid = layer([{ period: 16, amp: 0.5 }, { period: 32, amp: 0.3 }, { period: 64, amp: 0.2 }]);

  const norm = (arr) => {
    let min = Infinity, max = -Infinity;
    for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
    return (v) => Math.round(((v - min) / (max - min)) * 255);
  };
  const nP = norm(data), nG = norm(big), nB = norm(mid);
  const img = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) {
    img[i * 4] = nP(data[i]);
    img[i * 4 + 1] = nG(big[i]);
    img[i * 4 + 2] = nB(mid[i]);
    img[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(img, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
