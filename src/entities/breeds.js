import * as THREE from 'three';
import { fbm3 } from '../core/rng.js';

/*
 * Each breed tweaks the base (whippet) skeleton and paints its own coat.
 *
 * Shape:   L leg length · T leg/neck thickness · len body length · gx/gy body width/depth
 *          tuck (1 = whippet waist, 0 = straight belly) · neck · headLen (muzzle) · headW (skull size)
 * Parts:   ears 'rose' | 'flop' | 'prick' | 'button' · tail 'long' | 'up' | 'stub' | 'otter' | 'straight'
 * Coat:    coat(kind, l, n, t, out) → out colour. kind: body | neck | head | ear | tail | upperLeg | lowerLeg | paw | extra
 *          l = point in the part's own space, n = point in "normalised whippet" body space, t = 0..1 along tails.
 * Personality: speed (walk/run multiplier), bark (pitch), stiff (0..1 old-dog gait), wiggle (sausage/corgi sway), grumpy
 */

const C = (hex) => new THREE.Color(hex);
const ss = THREE.MathUtils.smoothstep;
const n3 = (p, s, o = 0, oct = 3) => fbm3(p.x * s + o, p.y * s, p.z * s - o, oct);

// ---- shared painters -------------------------------------------------------
const WHITE = C(0xf6f1e8), WHITE_SHADE = C(0xe6dccd);
function white(p, out) { return out.copy(WHITE).lerp(WHITE_SHADE, n3(p, 25) * 0.6); }
function solid(base, light, p, out, scale = 14, amt = 0.5) { return out.copy(base).lerp(light, ss(n3(p, scale), 0.35, 0.75) * amt); }

// ---- Merry: whippet, white lower half, tan with dark-brown brindle ---------------------------
const M = { tan: C(0xc98f58), tanLight: C(0xdcac77), brown: C(0x553525), brownMid: C(0x85563a) };
function brindle(p, out) {
  const warp = fbm3(p.x * 9, p.y * 9, p.z * 9, 3);
  const s1 = Math.sin(p.z * 62 + p.y * 18 + warp * 9);
  const s2 = Math.sin(p.z * 31 - p.y * 11 + warp * 5 + 1.3);
  const stripe = ss(s1, 0.25, 0.75) * 0.8 + ss(s2, 0.55, 0.9) * 0.35;
  const mottle = fbm3(p.x * 16 + 3, p.y * 16, p.z * 16, 3);
  out.copy(M.tan).lerp(M.tanLight, ss(0.45 - mottle, 0, 0.15));
  out.lerp(M.brownMid, Math.min(1, stripe));
  out.lerp(M.brown, Math.min(1, ss(mottle, 0.58, 0.72) * 0.75 + Math.max(0, stripe - 0.7) * 0.6));
  return out;
}
function merryCoat(kind, l, n, t, out) {
  const brin = (() => {
    switch (kind) {
      case 'body': case 'upperLeg': return n.y > 0.455 + (fbm3(n.x * 14, n.y * 6, n.z * 14, 3) - 0.5) * 0.07;
      case 'neck': return l.z < -0.008 + (n3(n, 20, 0, 2) - 0.5) * 0.03;
      case 'head': {
        const k = (fbm3(l.x * 40, l.y * 40, l.z * 40, 2) - 0.5) * 0.012;
        if (l.y < -0.012 + k + Math.max(0, l.z - 0.06) * 0.2) return false;
        const blaze = 0.007 + Math.max(0, l.z + 0.01) * 0.09;
        return !(Math.abs(l.x) < blaze + k && l.y > 0 && l.z > -0.035);
      }
      case 'ear': return true;
      case 'tail': return t < 0.72;
      default: return false;
    }
  })();
  return brin ? brindle(n, out) : white(n, out);
}

// ---- Pippin: a Jack Russell -------------------------------------------------------------------
// Smooth white coat with soft ginger freckles; tan-and-brown over both eyes and ears with a white
// blaze up the middle; white muzzle; grey ticked mottling down her throat and chest.
const P = { tan: C(0xc98a52), brown: C(0x7a4a2c), freckle: C(0xe8b58a), tick: C(0x7d7880) };
function pippinCoat(kind, l, n, t, out) {
  const freckles = (p, amt = 1) => {
    white(p, out);
    const f = fbm3(p.x * 55 + 3, p.y * 55, p.z * 55, 2);
    return out.lerp(P.freckle, ss(f, 0.62, 0.72) * 0.4 * amt);
  };
  const ticked = (p, amt) => out.lerp(P.tick, ss(fbm3(p.x * 70, p.y * 70 + 5, p.z * 70, 2), 0.45, 0.65) * amt);
  const tan = (p, dark = 0) => out.copy(P.tan).lerp(P.brown, Math.min(1, ss(n3(p, 40), 0.45, 0.75) * 0.5 + dark));
  switch (kind) {
    case 'ear': return tan(l, 0.25 + (l.y > 0.02 ? 0.3 : 0));
    case 'head': {
      if (l.z > 0.065 || l.y < -0.014) return freckles(l, 0.4); // white muzzle, cheeks and jaw
      const blaze = Math.abs(l.x) < 0.008 + Math.max(0, l.z + 0.02) * 0.16 && l.y > 0.0;
      if (blaze) return white(l, out);
      return tan(l, l.z < -0.03 ? 0.35 : 0); // darker brown toward the ears
    }
    case 'neck': {
      freckles(n, 0.6);
      return l.z > 0.005 ? ticked(l, 0.5) : out; // grey ticking down the throat
    }
    case 'body': {
      freckles(n);
      const chest = ss(n.z, 0.2, 0.3) * ss(0.47 - n.y, -0.02, 0.05);
      return ticked(n, chest * 0.55);
    }
    case 'upperLeg': return freckles(n, 0.6);
    case 'tail': return freckles(n, 0.5);
    default: return freckles(n, 0.35);
  }
}

// ---- Teddy: chestnut sausage dog -------------------------------------------------------------
const T = { red: C(0xb8663a), dark: C(0x7e4426), light: C(0xd08f5e) };
function teddyCoat(kind, l, n, t, out) {
  solid(T.red, T.light, n, out, 10, 0.35);
  if (kind === 'ear') return out.lerp(T.dark, 0.6);
  if (kind === 'body' || kind === 'neck' || kind === 'tail') out.lerp(T.dark, ss(n.y, 0.5, 0.6) * 0.45);
  if (kind === 'paw') out.lerp(T.dark, 0.3);
  return out;
}

// ---- Waffles: corgi — orange top, white chest/belly/legs/blaze ------------------------------
const W = { red: C(0xd98a48), light: C(0xe8a865) };
function wafflesCoat(kind, l, n, t, out) {
  const orange = () => solid(W.red, W.light, n, out, 12, 0.5);
  switch (kind) {
    case 'body': return n.y > 0.43 + (n3(n, 10) - 0.5) * 0.06 ? orange() : white(n, out);
    case 'upperLeg': return n.y > 0.47 ? orange() : white(n, out);
    case 'neck': return l.z < 0 ? orange() : white(n, out);
    case 'head': {
      if (l.y < -0.005 || l.z > 0.075) return white(l, out);
      return Math.abs(l.x) < 0.009 + Math.max(0, l.z) * 0.15 && l.z > -0.03 ? white(l, out) : orange();
    }
    case 'ear': case 'tail': return orange();
    case 'extra': return white(n, out);
    default: return white(n, out);
  }
}

// ---- Bramble: golden labrador -----------------------------------------------------------------
const B = { gold: C(0xe2b56c), light: C(0xefd09a), dark: C(0xc8954e) };
function brambleCoat(kind, l, n, t, out) {
  solid(B.gold, B.light, n, out, 9, 0.45);
  if (kind === 'ear') out.lerp(B.dark, 0.45);
  if (kind === 'body') out.lerp(B.light, ss(0.45 - n.y, 0, 0.08) * 0.6);
  return out;
}

// ---- Dotty: dalmatian ---------------------------------------------------------------------------
const D = { black: C(0x2b2626) };
function dottyCoat(kind, l, n, t, out) {
  const p = kind === 'head' || kind === 'ear' ? l.clone().multiplyScalar(3) : n;
  const spot = fbm3(p.x * 30 + 7, p.y * 30, p.z * 30, 2);
  white(n, out);
  if (kind === 'ear') return out.lerp(D.black, ss(spot, 0.4, 0.55));
  return out.lerp(D.black, ss(spot, 0.64, 0.7));
}

export const BREEDS = {
  merry: {
    dogName: 'Merry', breed: 'Whippet', emoji: '🐕', blurb: 'Fast, skinny and always cold.',
    L: 1, T: 1, len: 1, gx: 1, gy: 1, tuck: 1, neck: 1, headLen: 1, headW: 1, size: 1,
    ears: 'rose', tail: 'long', coat: merryCoat, swatch: ['#c98f58', '#f6f1e8', '#553525'],
    speed: 1, bark: 1, stiff: 0, wiggle: 0, nose: 0x2b2020, brow: 0x553525,
  },
  pippin: {
    dogName: 'Pippin', breed: 'Jack Russell', emoji: '🦴', blurb: 'A little bit cranky, a lot of heart. Best girl.',
    L: 0.58, T: 1.15, len: 0.95, gx: 1.28, gy: 1.12, tuck: 0.22, neck: 0.72, headLen: 0.6, headW: 1.12, muzzleW: 1.35, size: 1,
    ears: 'button', tail: 'up', coat: pippinCoat, swatch: ['#f6f1e8', '#c98a52', '#7d7880'],
    speed: 0.85, bark: 1.55, stiff: 0.6, wiggle: 0, grumpy: true, nose: 0x231c1c, brow: 0x9a6a44, browSize: 1.2,
    collar: { color: 0x1f1d22, tag: 0xdfe3e8 },
  },
  teddy: {
    dogName: 'Teddy', breed: 'Sausage dog', emoji: '🌭', blurb: 'Long, low and very determined.',
    L: 0.36, T: 1.25, len: 1.5, gx: 1.05, gy: 1.05, tuck: 0.15, neck: 0.8, headLen: 1.15, headW: 1.05, size: 1,
    ears: 'flop', tail: 'straight', coat: teddyCoat, swatch: ['#b8663a', '#7e4426', '#d08f5e'],
    speed: 0.82, bark: 1.25, stiff: 0, wiggle: 1, nose: 0x2b2020, brow: 0x7e4426,
  },
  waffles: {
    dogName: 'Waffles', breed: 'Corgi', emoji: '🧇', blurb: 'Big ears, fluffy bum, zero shame.',
    L: 0.4, T: 1.35, len: 1.12, gx: 1.3, gy: 1.12, tuck: 0.1, neck: 0.75, headLen: 0.82, headW: 1.25, size: 1,
    ears: 'prick', tail: 'stub', coat: wafflesCoat, fluffyBum: true, swatch: ['#d98a48', '#f6f1e8', '#e8a865'],
    speed: 0.88, bark: 1.3, stiff: 0, wiggle: 0.7, nose: 0x2b2020, brow: 0xb06a32,
  },
  bramble: {
    dogName: 'Bramble', breed: 'Labrador', emoji: '🎾', blurb: 'Loves everyone. Loves snacks more.',
    L: 1.0, T: 1.4, len: 1.05, gx: 1.35, gy: 1.18, tuck: 0.15, neck: 0.85, headLen: 0.95, headW: 1.25, size: 1.1,
    ears: 'flop', tail: 'otter', coat: brambleCoat, swatch: ['#e2b56c', '#efd09a', '#c8954e'],
    speed: 1, bark: 0.72, stiff: 0, wiggle: 0.2, nose: 0x3a2a24, brow: 0xc8954e,
  },
  dotty: {
    dogName: 'Dotty', breed: 'Dalmatian', emoji: '⚫', blurb: 'Spotty, sporty and a bit dramatic.',
    L: 1.02, T: 1.15, len: 1.0, gx: 1.15, gy: 1.08, tuck: 0.45, neck: 0.95, headLen: 0.95, headW: 1.1, size: 1.05,
    ears: 'flop', tail: 'straight', coat: dottyCoat, swatch: ['#f6f1e8', '#2b2626', '#e6dccd'],
    speed: 1.05, bark: 0.95, stiff: 0, wiggle: 0, nose: 0x1d1a1a, brow: 0x2b2626,
  },
};

export const BREED_KEYS = Object.keys(BREEDS);
