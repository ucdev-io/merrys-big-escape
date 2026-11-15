import { C, white, solid, muzzleAt, wob, blaze } from '../coat.js';

// Dogs you meet rather than play (not in the picker). Same shape/part keys as ../breeds.js.

// ---- Gus: a very old basset hound — tricolour, enormous ears, sleepy eyes ------------------------
const GB = { tan: C(0xb06a3a), hi: C(0xc78550), black: C(0x2b2526) };
const gusMuzzle = muzzleAt(1.1);
function gusCoat(kind, l, n, t, out) {
  const tan = (p) => solid(GB.tan, GB.hi, p, out, 10, 0.5);
  switch (kind) {
    case 'body': {
      const w = wob(n, 8, 0.06);
      if (n.y < 0.42 + w || (n.z > 0.2 + w && n.y < 0.52)) return white(n, out);
      if (n.y > 0.49 + w && n.z < 0.12 + w && n.z > -0.34) return solid(GB.black, GB.tan, n, out, 10, 0.12);
      return tan(n);
    }
    case 'head': {
      if (gusMuzzle(l) > 0.35 || l.y < -0.016 || blaze(l, 0.006, 0.12, -0.04)) return white(l, out);
      return tan(l).lerp(C(0x8a8580), l.y > 0.035 && gusMuzzle(l) < 0 ? 0.25 : 0); // a grey old-dog crown
    }
    case 'ear': return tan(l).lerp(GB.black, 0.15);
    case 'neck': return l.z > 0 ? white(n, out) : tan(n);
    case 'upperLeg': return n.y > 0.46 ? tan(n) : white(n, out);
    case 'tail': return t > 0.7 ? white(n, out) : solid(GB.black, GB.tan, n, out, 10, 0.2);
    default: return white(n, out);
  }
}

export const NPCS = {
  gus: {
    group: 'npc', dogName: 'Gus', breed: 'Basset hound', emoji: '👴', blurb: 'Very old. Very sleepy. Very big ears.',
    L: 0.38, T: 1.55, len: 1.35, gx: 1.4, gy: 1.25, tuck: 0.05, neck: 0.75, headLen: 1.1, headW: 1.35, muzzleW: 1.2, size: 1.05,
    ears: 'long', earLen: 2.0, tail: 'up', jowls: true, coat: gusCoat, swatch: ['#b06a3a', '#f6f1e8', '#2b2526'],
    speed: 0.6, bark: 0.55, stiff: 0.9, wiggle: 0.3, grumpy: true, nose: 0x231c1c, brow: 0x8a5a30, browSize: 1.3,
  },
};
