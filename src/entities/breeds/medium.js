import { C, ss, n3, white, solid, muzzleAt, wob, patches, blaze, big } from '../coat.js';

// Medium dogs. (Shape and part keys are explained in ../breeds.js; painters in ../coat.js.)

// ---- Scout: border collie — black and white, white collar and blaze --------------------------
const BC = { black: C(0x2b2628), hi: C(0x3d3639) };
const scoutMuzzle = muzzleAt(0.9);
function scoutCoat(kind, l, n, t, out) {
  const black = (p) => solid(BC.black, BC.hi, p, out, 10, 0.6);
  switch (kind) {
    case 'head': return scoutMuzzle(l) > 0.35 || l.y < -0.012 || blaze(l) ? white(l, out) : black(l);
    case 'ear': return black(l);
    case 'neck': return white(n, out); // white collar all the way round
    case 'body': {
      const w = wob(n, 9, 0.06);
      if (n.z > 0.17 + w && n.y < 0.56) return white(n, out); // chest and ruff
      return n.y < 0.4 + w ? white(n, out) : black(n);
    }
    case 'upperLeg': return n.y > 0.44 + wob(n) ? black(n) : white(n, out);
    case 'tail': return t > 0.78 ? white(n, out) : black(n);
    default: return white(n, out);
  }
}

// ---- Rusty: red kelpie — never, ever tired -----------------------------------------------------
const KP = { red: C(0x9b4f2c), hi: C(0xb4673d), tan: C(0xcc8f5c) };
function rustyCoat(kind, l, n, t, out) {
  solid(KP.red, KP.hi, n, out, 10, 0.5);
  switch (kind) {
    case 'body': return out.lerp(KP.tan, ss(0.43 - n.y, 0, 0.06) * 0.7);
    case 'head': return out.lerp(KP.tan, Math.min(1, ss(l.z, 0.07, 0.12) * 0.55 + ss(-l.y, 0.01, 0.025) * 0.5));
    case 'lowerLeg': case 'paw': return out.lerp(KP.tan, 0.6);
    case 'neck': return l.z > 0.005 ? out.lerp(KP.tan, 0.5) : out;
    default: return out;
  }
}

// ---- Ziggy: Australian shepherd — blue merle, copper cheeks, odd eyes ------------------------
const AS = { grey: C(0x9ba3ad), hi: C(0xb3bac2), black: C(0x2c2829), copper: C(0xb86b38) };
const ziggyMuzzle = muzzleAt(0.85);
function ziggyCoat(kind, l, n, t, out) {
  const merle = (p) => { solid(AS.grey, AS.hi, p, out, 10, 0.4); return out.lerp(AS.black, patches(p, 9, 0.6, 0.03, 7)); };
  switch (kind) {
    case 'head': {
      if (ziggyMuzzle(l) > 0.4 || l.y < -0.014 || blaze(l)) return white(l, out);
      if (l.y < 0.01 && l.z > 0.0 && l.z < 0.05) return out.copy(AS.copper);
      return merle(big(l));
    }
    case 'ear': return merle(big(l));
    case 'neck': return white(n, out);
    case 'body': {
      const w = wob(n, 9, 0.06);
      if (n.z > 0.18 + w && n.y < 0.55) return white(n, out);
      return n.y < 0.4 + w ? white(n, out) : merle(n);
    }
    case 'upperLeg': return n.y > 0.44 ? merle(n) : out.copy(AS.copper);
    case 'lowerLeg': return out.copy(AS.copper).lerp(AS.hi, 0.2);
    case 'paw': return white(n, out);
    default: return merle(n);
  }
}

// ---- Banjo: beagle — tan, black saddle, white socks and a white tail tip ------------------------
const BG = { tan: C(0xc7874a), hi: C(0xd9a066), black: C(0x2d2728) };
const banjoMuzzle = muzzleAt(0.9);
function banjoCoat(kind, l, n, t, out) {
  const tan = (p) => solid(BG.tan, BG.hi, p, out, 10, 0.5);
  switch (kind) {
    case 'body': {
      const w = wob(n, 8, 0.06);
      if (n.y < 0.41 + w || (n.z > 0.2 + w && n.y < 0.5)) return white(n, out);
      if (n.y > 0.49 + w && n.z < 0.14 + w && n.z > -0.36) return solid(BG.black, BG.tan, n, out, 10, 0.15);
      return tan(n);
    }
    case 'head': return banjoMuzzle(l) > 0.4 || l.y < -0.014 || blaze(l, 0.005, 0.1, -0.035) ? white(l, out) : tan(l);
    case 'ear': return out.copy(BG.tan).lerp(BG.black, 0.25);
    case 'neck': return l.z > 0.0 ? white(n, out) : tan(n);
    case 'upperLeg': return n.y > 0.45 ? tan(n) : white(n, out);
    case 'tail': return t > 0.72 ? white(n, out) : solid(BG.black, BG.tan, n, out, 10, 0.2);
    default: return white(n, out);
  }
}

// ---- Bruno: Staffy — blue with a white chest, big smile, wiggly bum ---------------------------
const SB = { blue: C(0x707684), hi: C(0x868c99) };
const brunoMuzzle = muzzleAt(0.6);
function brunoCoat(kind, l, n, t, out) {
  const blue = (p) => solid(SB.blue, SB.hi, p, out, 11, 0.5);
  switch (kind) {
    case 'body': return n.z > 0.15 + wob(n, 9, 0.06) && n.y < 0.5 ? white(n, out) : blue(n);
    case 'neck': return l.z > 0.0 ? white(n, out) : blue(n);
    case 'head': return (l.y < -0.016 && brunoMuzzle(l) > 0.1) || blaze(l, 0.005, 0.1, -0.03) ? white(l, out) : blue(l);
    case 'paw': return white(n, out);
    default: return blue(n);
  }
}

// ---- Kiko: shiba inu — red with cream cheeks, chest and curly-tail underside ------------------
const SH = { red: C(0xc7743c), hi: C(0xd88f55), cream: C(0xf2e2c4) };
const kikoMuzzle = muzzleAt(0.75);
function kikoCoat(kind, l, n, t, out) {
  const red = (p) => solid(SH.red, SH.hi, p, out, 10, 0.5);
  const cream = (k = 0) => out.copy(SH.cream).lerp(SH.red, k);
  switch (kind) {
    case 'head': return kikoMuzzle(l) > 0.25 || l.y < -0.008 || (Math.abs(l.x) > 0.028 && l.y < 0.012) ? cream() : red(l);
    case 'body': return n.y < 0.43 + wob(n, 9, 0.05) || (n.z > 0.2 && n.y < 0.49) ? cream() : red(n);
    case 'neck': return l.z > 0.0 ? cream() : red(n);
    case 'tail': return t > 0.6 ? cream(0.3) : red(n);
    case 'lowerLeg': case 'paw': return cream(0.25);
    case 'ear': return red(l);
    default: return red(n);
  }
}

// ---- Luna: husky — grey and white, blue eyes, a mask like a superhero -------------------------
const HK = { grey: C(0x7b8390), hi: C(0x949ba6), dark: C(0x4e545e) };
const lunaMuzzle = muzzleAt(0.9);
function lunaCoat(kind, l, n, t, out) {
  const grey = (p) => solid(HK.grey, HK.hi, p, out, 10, 0.5).lerp(HK.dark, ss(n3(p, 22, 4), 0.55, 0.75) * 0.4);
  switch (kind) {
    case 'body': return n.y > 0.45 + wob(n, 8, 0.07) && n.z < 0.24 ? grey(n) : white(n, out);
    case 'neck': return l.z < 0.0 ? grey(n) : white(n, out);
    case 'head': {
      const cap = l.y > 0.032 - Math.max(0, -l.z) * 0.2 && l.z < 0.05;
      const bridge = Math.abs(l.x) < 0.006 && l.y > 0.01 && lunaMuzzle(l) < 0.4;
      return cap || bridge ? grey(big(l)) : white(l, out);
    }
    case 'ear': return grey(big(l));
    case 'tail': return t > 0.85 ? white(n, out) : grey(n);
    case 'upperLeg': return n.y > 0.47 ? grey(n) : white(n, out);
    default: return white(n, out);
  }
}

// ---- Winston: British bulldog — white with fawn patches, all jowls ----------------------------
const BD = { fawn: C(0xc99a68), dark: C(0x9a6f48) };
function winstonCoat(kind, l, n, t, out) {
  white(n, out);
  switch (kind) {
    case 'head': return Math.abs(l.x) > 0.012 && l.y > -0.005 && l.z < 0.05 ? solid(BD.fawn, BD.dark, big(l), out, 10, 0.3) : out;
    case 'ear': return out.copy(BD.fawn);
    case 'body': return patches(n, 6, 0.55, 0.03, 5) > 0.5 && n.y > 0.45 ? solid(BD.fawn, BD.dark, n, out, 10, 0.3) : out;
    default: return out;
  }
}

export const MEDIUM = {
  scout: {
    group: 'medium', dogName: 'Scout', breed: 'Border collie', emoji: '🐑', blurb: 'Too clever by half. Will herd anything, including you.',
    L: 0.9, T: 1.15, len: 1.0, gx: 1.2, gy: 1.12, tuck: 0.35, neck: 0.9, headLen: 0.9, headW: 1.1, size: 1.0,
    fluff: 0.012, ruff: 1.0, ears: 'tipped', tail: 'feather', coat: scoutCoat, swatch: ['#2b2628', '#f6f1e8', '#3d3639'],
    speed: 1.08, bark: 1.05, stiff: 0, wiggle: 0, nose: 0x1f1a1a, brow: 0x2b2628,
  },
  rusty: {
    group: 'medium', dogName: 'Rusty', breed: 'Kelpie', emoji: '🦘', blurb: 'Runs on sunshine. Never, ever tired.',
    L: 0.95, T: 1.1, len: 1.0, gx: 1.1, gy: 1.08, tuck: 0.45, neck: 0.95, headLen: 0.95, headW: 1.05, size: 0.96,
    fluff: 0.004, ears: 'prick', earSize: 1.25, tail: 'sabre', coat: rustyCoat, swatch: ['#9b4f2c', '#cc8f5c', '#b4673d'],
    speed: 1.1, bark: 1.05, stiff: 0, wiggle: 0, nose: 0x3a2a24, brow: 0x7a3c20,
  },
  ziggy: {
    group: 'medium', dogName: 'Ziggy', breed: 'Aussie shepherd', emoji: '🌀', blurb: 'Patchy coat, odd eyes, boundless bounce.',
    L: 0.9, T: 1.2, len: 1.0, gx: 1.22, gy: 1.14, tuck: 0.3, neck: 0.9, headLen: 0.85, headW: 1.12, size: 1.0,
    fluff: 0.014, ruff: 1.1, fluffyBum: true, ears: 'tipped', tail: 'stub', eyeColor: [0x6a9fd8, 0x5a3a26],
    coat: ziggyCoat, swatch: ['#9ba3ad', '#2c2829', '#b86b38'],
    speed: 1.06, bark: 1.0, stiff: 0, wiggle: 0.3, nose: 0x2b2020, brow: 0xb86b38,
  },
  banjo: {
    group: 'medium', dogName: 'Banjo', breed: 'Beagle', emoji: '🪕', blurb: 'Nose first, brain second. AROOO!',
    L: 0.72, T: 1.25, len: 0.98, gx: 1.25, gy: 1.12, tuck: 0.25, neck: 0.85, headLen: 0.9, headW: 1.15, size: 0.9,
    ears: 'long', earLen: 1.05, tail: 'up', coat: banjoCoat, swatch: ['#c7874a', '#2d2728', '#f6f1e8'],
    speed: 0.95, bark: 1.15, stiff: 0, wiggle: 0.2, nose: 0x231c1c, brow: 0x8a5a30,
  },
  bruno: {
    group: 'medium', dogName: 'Bruno', breed: 'Staffy', emoji: '💪', blurb: 'Big smile, bigger cuddles, wiggly bum.',
    L: 0.65, T: 1.55, len: 0.92, gx: 1.5, gy: 1.25, tuck: 0.3, neck: 0.7, headLen: 0.6, headW: 1.42, muzzleW: 1.45, size: 0.95,
    ears: 'rose', tail: 'straight', coat: brunoCoat, swatch: ['#707684', '#f6f1e8', '#868c99'],
    speed: 0.98, bark: 0.95, stiff: 0, wiggle: 0.45, nose: 0x2a2629, brow: 0x5a5f6b,
  },
  kiko: {
    group: 'medium', dogName: 'Kiko', breed: 'Shiba inu', emoji: '🍁', blurb: 'Proud, foxy and very, very dramatic.',
    L: 0.85, T: 1.2, len: 0.92, gx: 1.2, gy: 1.12, tuck: 0.3, neck: 0.85, headLen: 0.75, headW: 1.15, size: 0.88,
    fluff: 0.006, ears: 'prick', earSize: 1.05, tail: 'curl', coat: kikoCoat, swatch: ['#c7743c', '#f2e2c4', '#d88f55'],
    speed: 1.02, bark: 1.3, stiff: 0, wiggle: 0, nose: 0x2b2020, brow: 0xf2e2c4,
  },
  luna: {
    group: 'medium', dogName: 'Luna', breed: 'Husky', emoji: '❄️', blurb: 'Talks back. Loves snow. Hates baths.',
    L: 0.95, T: 1.3, len: 1.02, gx: 1.25, gy: 1.15, tuck: 0.3, neck: 0.9, headLen: 0.9, headW: 1.15, size: 1.04,
    fluff: 0.012, ruff: 1.0, ears: 'prick', earSize: 1.1, tail: 'plume', eyeColor: 0x7fb3e6,
    coat: lunaCoat, swatch: ['#7b8390', '#f6f1e8', '#4e545e'],
    speed: 1.08, bark: 1.1, stiff: 0, wiggle: 0, nose: 0x1f1a1a, brow: 0x5c636e,
  },
  winston: {
    group: 'medium', dogName: 'Winston', breed: 'Bulldog', emoji: '☕', blurb: 'Slow and steady. Mostly steady. Mostly napping.',
    L: 0.48, T: 1.65, len: 0.92, gx: 1.6, gy: 1.3, tuck: 0.05, neck: 0.55, headLen: 0.25, headW: 1.5, muzzleW: 1.6, size: 0.95,
    ears: 'rose', earSize: 0.8, tail: 'stub', jowls: true, coat: winstonCoat, swatch: ['#f6f1e8', '#c99a68', '#9a6f48'],
    speed: 0.84, bark: 0.8, stiff: 0.4, wiggle: 0.6, grumpy: true, nose: 0x231c1c, brow: 0x9a6f48,
  },
};
