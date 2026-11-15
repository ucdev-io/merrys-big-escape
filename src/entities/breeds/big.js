import { C, ss, white, solid, muzzleAt, wob, blaze, nearEyes, big } from '../coat.js';

// Big dogs. (Shape and part keys are explained in ../breeds.js; painters in ../coat.js.)

// ---- Sunny: golden retriever — gold, with paler feathering --------------------------------------
const GR = { gold: C(0xd49a52), light: C(0xe8bf80), cream: C(0xf0d6a8), dark: C(0xb87f3e) };
function sunnyCoat(kind, l, n, t, out) {
  solid(GR.gold, GR.light, n, out, 9, 0.5);
  switch (kind) {
    case 'ear': return out.lerp(GR.dark, 0.35);
    case 'body': return out.lerp(GR.cream, Math.min(1, ss(0.44 - n.y, 0, 0.1) * 0.5 + ss(n.z, 0.18, 0.3) * 0.25));
    case 'tail': return out.lerp(GR.cream, ss(t, 0.3, 1) * 0.35);
    case 'head': return out.lerp(GR.light, ss(l.z, 0.06, 0.12) * 0.3);
    default: return out;
  }
}

// ---- Rex: German shepherd — tan with a black saddle and a dark muzzle ---------------------------
const GS = { tan: C(0xc98b4a), light: C(0xdba86a), black: C(0x2b2526), hi: C(0x45393a) };
const rexMuzzle = muzzleAt(1.05);
function rexCoat(kind, l, n, t, out) {
  const tan = (p) => solid(GS.tan, GS.light, p, out, 10, 0.5);
  const black = (p) => solid(GS.black, GS.hi, p, out, 10, 0.5);
  switch (kind) {
    case 'body': {
      const w = wob(n, 8, 0.07);
      return n.y > 0.47 + w && n.z < 0.2 + w && n.z > -0.37 ? black(n) : tan(n);
    }
    case 'neck': return l.z < -0.005 + wob(l, 30, 0.02) ? out.copy(GS.black).lerp(GS.tan, 0.35) : tan(n);
    case 'head': {
      if (rexMuzzle(l) > 0.3) return black(l);
      if (l.y > 0.03 && l.z < 0.02) return out.copy(GS.tan).lerp(GS.black, 0.55);
      return tan(l);
    }
    case 'ear': case 'tail': return black(n);
    default: return tan(n);
  }
}

// ---- Bear: Rottweiler — black with rust eyebrows, muzzle, chest spots and socks -----------------
const RW = { black: C(0x272223), hi: C(0x3b3335), rust: C(0xa95f2f) };
const bearMuzzle = muzzleAt(0.8);
function bearCoat(kind, l, n, t, out) {
  solid(RW.black, RW.hi, n, out, 10, 0.5);
  switch (kind) {
    case 'head': {
      const u = bearMuzzle(l);
      const cheek = Math.abs(l.x) > 0.028 && l.y < 0.0 && l.z > 0.0 && l.z < 0.045;
      return u > 0.35 || (l.y < -0.016 && u > -0.2) || cheek ? out.copy(RW.rust) : out;
    }
    case 'body': return Math.hypot(Math.abs(n.x) - 0.035, n.y - 0.42) < 0.03 && n.z > 0.22 ? out.copy(RW.rust) : out;
    case 'lowerLeg': case 'paw': return out.copy(RW.rust);
    default: return out;
  }
}

// ---- Duke: Great Dane — fawn with a black mask. Thinks he's a lap dog -------------------------
const GD = { fawn: C(0xd2a065), light: C(0xe2bb86), mask: C(0x2f2828) };
const dukeMuzzle = muzzleAt(1.15);
function dukeCoat(kind, l, n, t, out) {
  solid(GD.fawn, GD.light, n, out, 9, 0.45);
  if (kind === 'head') return out.lerp(GD.mask, Math.max(ss(dukeMuzzle(l), 0.05, 0.4), nearEyes(l, 0.013) ? 0.7 : 0) * 0.85);
  if (kind === 'ear') return out.lerp(GD.mask, 0.6);
  if (kind === 'tail') return out.lerp(GD.mask, ss(t, 0.7, 1) * 0.6);
  return out;
}

// ---- Cloud: Samoyed — a smiling white cloud ---------------------------------------------------
const SM = { cream: C(0xf3e9d6) };
function cloudCoat(kind, l, n, t, out) {
  white(kind === 'head' || kind === 'ear' ? big(l) : n, out);
  return out.lerp(SM.cream, 0.3);
}

// ---- Bernie: Bernese mountain dog — black, white and rust ---------------------------------------
const BM = { black: C(0x272223), hi: C(0x3b3335), rust: C(0xb0602f) };
const bernieMuzzle = muzzleAt(0.85);
function bernieCoat(kind, l, n, t, out) {
  const black = (p) => solid(BM.black, BM.hi, p, out, 10, 0.5);
  switch (kind) {
    case 'head': {
      if (bernieMuzzle(l) > 0.3 || blaze(l, 0.006, 0.13, -0.045)) return white(l, out);
      if (l.y < 0.012 && l.z > 0.0) return out.copy(BM.rust);
      return black(l);
    }
    case 'ear': return black(l);
    case 'neck': return l.z > 0.004 ? white(n, out) : black(n);
    case 'body': {
      const w = wob(n, 9, 0.05);
      if (n.z > 0.2 + w && n.y < 0.54 && Math.abs(n.x) < 0.045 + w) return white(n, out); // white cross on the chest
      if (n.z > 0.15 && n.y < 0.5) return out.copy(BM.rust);
      return black(n);
    }
    case 'upperLeg': return n.y < 0.42 ? out.copy(BM.rust) : black(n);
    case 'lowerLeg': return out.copy(BM.rust);
    case 'paw': return white(n, out);
    case 'tail': return t > 0.85 ? white(n, out) : black(n);
    default: return black(n);
  }
}

// ---- Rocky: boxer — fawn, white chest, black mask, endless bounce ---------------------------
const BX = { fawn: C(0xc98a4e), light: C(0xd9a46c), mask: C(0x2d2626) };
const rockyMuzzle = muzzleAt(0.45);
function rockyCoat(kind, l, n, t, out) {
  solid(BX.fawn, BX.light, n, out, 10, 0.45);
  switch (kind) {
    case 'head': {
      const u = rockyMuzzle(l);
      if (blaze(l, 0.004, 0.08, -0.02) && l.y > 0.01 && u < 0.2) return white(l, out);
      return out.lerp(BX.mask, ss(u, -0.2, 0.2) * 0.9);
    }
    case 'body': return n.z > 0.17 + wob(n, 9, 0.06) && n.y < 0.5 ? white(n, out) : out;
    case 'neck': return l.z > 0.004 ? white(n, out) : out;
    case 'paw': return white(n, out);
    case 'ear': return out.lerp(BX.mask, 0.3);
    default: return out;
  }
}

// ---- Flash: greyhound — blue-grey, the fastest dog in town (then naps for a week) ---------------
const GH = { blue: C(0x6b7685), hi: C(0x8590a0) };
function flashCoat(kind, l, n, t, out) {
  solid(GH.blue, GH.hi, n, out, 10, 0.5);
  if (kind === 'body' && n.z > 0.15 + wob(n, 9, 0.06) && n.y < 0.45) return white(n, out);
  if (kind === 'neck' && l.z > 0.006) return white(n, out);
  if (kind === 'paw') return white(n, out);
  return out;
}

export const BIG = {
  sunny: {
    group: 'big', dogName: 'Sunny', breed: 'Golden retriever', emoji: '☀️', blurb: 'Has never had a bad day. Brings you socks as presents.',
    L: 1.0, T: 1.35, len: 1.05, gx: 1.3, gy: 1.15, tuck: 0.2, neck: 0.9, headLen: 0.95, headW: 1.2, size: 1.1,
    fluff: 0.014, ruff: 0.9, ears: 'long', earLen: 0.8, tail: 'feather', coat: sunnyCoat, swatch: ['#d49a52', '#e8bf80', '#f0d6a8'],
    speed: 1.0, bark: 0.8, stiff: 0, wiggle: 0.25, nose: 0x3a2a24, brow: 0xb87f3e,
  },
  rex: {
    group: 'big', dogName: 'Rex', breed: 'German shepherd', emoji: '🛡️', blurb: 'Brave, loyal and a bit of a show-off.',
    L: 1.0, T: 1.3, len: 1.1, gx: 1.25, gy: 1.2, tuck: 0.35, neck: 1.0, headLen: 1.05, headW: 1.15, size: 1.15,
    fluff: 0.006, ears: 'prick', earSize: 1.45, tail: 'sabre', coat: rexCoat, swatch: ['#c98b4a', '#2b2526', '#dba86a'],
    speed: 1.05, bark: 0.75, stiff: 0, wiggle: 0, nose: 0x1f1a1a, brow: 0x5a3a26,
  },
  bear: {
    group: 'big', dogName: 'Bear', breed: 'Rottweiler', emoji: '🐻', blurb: 'Looks tough. Is actually a big soft marshmallow.',
    L: 0.95, T: 1.5, len: 1.0, gx: 1.45, gy: 1.25, tuck: 0.2, neck: 0.85, headLen: 0.8, headW: 1.35, muzzleW: 1.3, size: 1.15,
    ears: 'flop', earLen: 0.65, tail: 'straight', jowls: true, coat: bearCoat, swatch: ['#272223', '#a95f2f', '#3b3335'],
    speed: 0.95, bark: 0.65, stiff: 0, wiggle: 0.2, nose: 0x1a1616, brow: 0xa95f2f, browSize: 1.3,
  },
  duke: {
    group: 'big', dogName: 'Duke', breed: 'Great Dane', emoji: '👑', blurb: 'Thinks he’s a lap dog. He is not a lap dog.',
    L: 1.25, T: 1.35, len: 1.05, gx: 1.25, gy: 1.25, tuck: 0.4, neck: 1.15, headLen: 1.15, headW: 1.25, size: 1.35,
    ears: 'flop', earLen: 0.9, tail: 'long', jowls: true, coat: dukeCoat, swatch: ['#d2a065', '#2f2828', '#e2bb86'],
    speed: 1.02, bark: 0.6, stiff: 0, wiggle: 0, nose: 0x1a1616, brow: 0x5a4030,
  },
  cloud: {
    group: 'big', dogName: 'Cloud', breed: 'Samoyed', emoji: '☁️', blurb: 'A smiling cloud that leaves fluff everywhere.',
    L: 0.9, T: 1.35, len: 1.0, gx: 1.3, gy: 1.2, tuck: 0.15, neck: 0.85, headLen: 0.8, headW: 1.2, size: 1.05,
    fluff: 0.03, headFluff: 0.5, ruff: 1.3, ears: 'prick', earSize: 0.9, tail: 'plume', coat: cloudCoat, swatch: ['#f6f1e8', '#f3e9d6', '#e6dccd'],
    speed: 1.0, bark: 1.15, stiff: 0, wiggle: 0.2, nose: 0x1f1a1a, brow: 0xe0d6c4,
  },
  bernie: {
    group: 'big', dogName: 'Bernie', breed: 'Bernese mountain dog', emoji: '🏔️', blurb: 'A gentle giant who loves cuddles and naps.',
    L: 0.95, T: 1.5, len: 1.05, gx: 1.4, gy: 1.25, tuck: 0.15, neck: 0.85, headLen: 0.85, headW: 1.3, size: 1.25,
    fluff: 0.016, ruff: 1.0, ears: 'flop', earLen: 0.8, tail: 'feather', coat: bernieCoat, swatch: ['#272223', '#f6f1e8', '#b0602f'],
    speed: 0.92, bark: 0.7, stiff: 0.1, wiggle: 0.2, nose: 0x1a1616, brow: 0xb0602f,
  },
  rocky: {
    group: 'big', dogName: 'Rocky', breed: 'Boxer', emoji: '🥊', blurb: 'Bouncy, boingy and always up for a game.',
    L: 1.0, T: 1.35, len: 0.98, gx: 1.3, gy: 1.2, tuck: 0.45, neck: 0.95, headLen: 0.45, headW: 1.3, muzzleW: 1.4, size: 1.08,
    ears: 'flop', earLen: 0.7, tail: 'straight', jowls: true, coat: rockyCoat, swatch: ['#c98a4e', '#f6f1e8', '#2d2626'],
    speed: 1.05, bark: 0.85, stiff: 0, wiggle: 0.35, nose: 0x1a1616, brow: 0x6a4428,
  },
  flash: {
    group: 'big', dogName: 'Flash', breed: 'Greyhound', emoji: '⚡', blurb: 'Fastest dog in town. Then naps for a week.',
    L: 1.15, T: 1.05, len: 1.1, gx: 1.0, gy: 1.05, tuck: 1, neck: 1.1, headLen: 1.15, headW: 1.0, size: 1.25,
    ears: 'rose', tail: 'long', coat: flashCoat, swatch: ['#6b7685', '#f6f1e8', '#8590a0'],
    speed: 1.12, bark: 0.85, stiff: 0, wiggle: 0, shivers: true, nose: 0x1f1a1a, brow: 0x4e5866,
  },
};
