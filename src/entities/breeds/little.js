import { C, ss, n3, white, solid, muzzleAt, wob, patches, blaze, nearEyes, big } from '../coat.js';

// Little dogs. (Shape and part keys are explained in ../breeds.js; painters in ../coat.js.)

const PINK = C(0xe9b3a6);

// ---- Peanut: chihuahua — fawn, white bib, enormous ears ------------------------------------
const CH = { fawn: C(0xdcae78), light: C(0xead0a6) };
function peanutCoat(kind, l, n, t, out) {
  solid(CH.fawn, CH.light, n, out, 12, 0.45);
  switch (kind) {
    case 'body': return n.z > 0.18 + wob(n, 9, 0.06) && n.y < 0.48 ? white(n, out) : out;
    case 'neck': return l.z > 0.004 ? white(n, out) : out;
    case 'ear': return l.z > 0.002 ? out.lerp(PINK, 0.55) : out;
    case 'head': return l.y < -0.016 ? out.lerp(CH.light, 0.6) : out;
    case 'paw': return white(n, out);
    default: return out;
  }
}

// ---- Pom Pom: pomeranian — an orange fluffball -------------------------------------------------
const PM = { orange: C(0xe0923f), light: C(0xf0b46a), cream: C(0xf5d29a) };
function pompomCoat(kind, l, n, t, out) {
  solid(PM.orange, PM.light, kind === 'head' || kind === 'ear' ? big(l) : n, out, 14, 0.55);
  if (kind === 'body') return out.lerp(PM.cream, ss(0.44 - n.y, 0, 0.08) * 0.4 + ss(n.z, 0.2, 0.32) * 0.35);
  if (kind === 'tail') return out.lerp(PM.cream, 0.3);
  if (kind === 'head') return out.lerp(PM.cream, ss(l.z, 0.05, 0.08) * 0.35);
  return out;
}

// ---- Snowball: maltese — white silk and a pink bow ----------------------------------------------
const MT = { cream: C(0xf4ead8) };
function snowballCoat(kind, l, n, t, out) {
  white(kind === 'head' || kind === 'ear' ? big(l) : n, out);
  return kind === 'ear' ? out.lerp(MT.cream, 0.5) : out;
}

// ---- Mochi: pug — fawn with a black mask, black ears and a wrinkly forehead ---------------------
const PG = { fawn: C(0xd8bb8e), light: C(0xe6d0aa), black: C(0x2e2826) };
const mochiMuzzle = muzzleAt(0.28);
function mochiCoat(kind, l, n, t, out) {
  solid(PG.fawn, PG.light, n, out, 12, 0.4);
  switch (kind) {
    case 'head': {
      const mask = Math.max(ss(mochiMuzzle(l), -0.5, 0.05) * (1 - ss(l.y, 0.028, 0.042)), nearEyes(l, 0.017) ? 0.9 : 0);
      out.lerp(PG.black, mask * 0.9);
      const wrinkle = l.y > 0.024 && l.z > -0.02 && l.z < 0.05 ? ss(Math.sin(l.y * 520 + l.x * 40), 0.8, 1) * 0.4 : 0;
      return out.lerp(PG.black, wrinkle);
    }
    case 'ear': return out.copy(PG.black);
    case 'body': return out.lerp(PG.black, (1 - ss(Math.abs(n.x), 0, 0.014)) * ss(n.y, 0.55, 0.6) * 0.35); // dark trace along the back
    default: return out;
  }
}

// ---- Frankie: French bulldog — fawn with a dark mask and bat ears ----------------------------
const FB = { fawn: C(0xd7b48a), light: C(0xe6cba6), mask: C(0x3d302b) };
const frankieMuzzle = muzzleAt(0.32);
function frankieCoat(kind, l, n, t, out) {
  solid(FB.fawn, FB.light, n, out, 12, 0.45);
  if (kind === 'head') return out.lerp(FB.mask, Math.max(ss(frankieMuzzle(l), -0.4, 0.1) * (1 - ss(l.y, 0.03, 0.045)), nearEyes(l, 0.015) ? 1 : 0) * 0.85);
  if (kind === 'ear') return l.z > 0.002 ? out.lerp(PINK, 0.45) : out.lerp(FB.mask, 0.2);
  if (kind === 'body') return n.z > 0.2 + wob(n, 9, 0.05) && n.y < 0.46 ? out.lerp(FB.light, 0.6) : out;
  return out;
}

// ---- Rosie: Cavalier King Charles — Blenheim chestnut and white, long silky ears -----------
const CK = { chestnut: C(0xb5612f), hi: C(0xc97c45) };
const rosieMuzzle = muzzleAt(0.55);
function rosieCoat(kind, l, n, t, out) {
  const ch = (p) => solid(CK.chestnut, CK.hi, p, out, 12, 0.5);
  switch (kind) {
    case 'head': {
      if (rosieMuzzle(l) > 0.2 || l.y < -0.01) return white(l, out);
      const spot = Math.hypot(l.x, l.z + 0.02) < 0.007 && l.y > 0.04; // the "Blenheim spot" on her crown
      return blaze(l, 0.007, 0.14, -0.045) && !spot ? white(l, out) : ch(l);
    }
    case 'ear': return ch(big(l));
    case 'body': return patches(n, 7, 0.55, 0.03, 3) > 0.5 && n.y > 0.42 ? ch(n) : white(n, out);
    case 'tail': return t < 0.5 ? ch(n) : white(n, out);
    default: return white(n, out);
  }
}

// ---- Honey: cavoodle — apricot curls ---------------------------------------------------------
const CV = { apricot: C(0xd9a066), light: C(0xeac08e), dark: C(0xbf8150) };
function honeyCoat(kind, l, n, t, out) {
  solid(CV.apricot, CV.light, kind === 'head' || kind === 'ear' ? big(l, 2.5) : n, out, 18, 0.6);
  if (kind === 'ear') return out.lerp(CV.dark, 0.3);
  if (kind === 'paw' || kind === 'lowerLeg') return out.lerp(CV.light, 0.2);
  return out;
}

// ---- Hamish: westie — white and scruffy ---------------------------------------------------------
function hamishCoat(kind, l, n, t, out) {
  white(kind === 'head' || kind === 'ear' ? big(l) : n, out);
  return kind === 'ear' && l.z > 0.002 ? out.lerp(PINK, 0.35) : out;
}

// ---- Bertie: miniature schnauzer — salt-and-pepper, magnificent beard and eyebrows -------------
const SZ = { grey: C(0x7e8186), pepper: C(0x4e5156), salt: C(0xd6d4cf) };
const bertieMuzzle = muzzleAt(0.95);
function bertieCoat(kind, l, n, t, out) {
  const sp = (p) => out.copy(SZ.grey).lerp(SZ.pepper, ss(n3(p, 60, 1, 2), 0.5, 0.7) * 0.6).lerp(SZ.salt, ss(n3(p, 60, 9, 2), 0.55, 0.75) * 0.5);
  const salt = () => out.copy(SZ.salt).lerp(SZ.grey, 0.22);
  switch (kind) {
    case 'extra': return salt(); // beard
    case 'head': return bertieMuzzle(l) > 0.3 || l.y < -0.012 ? salt() : sp(big(l));
    case 'body': return n.y < 0.42 + wob(n) ? salt() : sp(n);
    case 'lowerLeg': case 'paw': return salt();
    case 'ear': return sp(big(l));
    default: return sp(n);
  }
}

export const LITTLE = {
  peanut: {
    group: 'little', dogName: 'Peanut', breed: 'Chihuahua', emoji: '🥜', blurb: 'Tiny dog, giant ears, enormous attitude.',
    L: 0.62, T: 0.9, len: 0.82, gx: 1.1, gy: 1.08, tuck: 0.45, neck: 0.8, headLen: 0.42, headW: 1.55, size: 0.56,
    ears: 'prick', earSize: 1.9, tail: 'up', eyeSize: 1.45, coat: peanutCoat, swatch: ['#dcae78', '#f6f1e8', '#ead0a6'],
    speed: 0.9, bark: 2.0, stiff: 0, wiggle: 0.2, shivers: true, nose: 0x2b2020, brow: 0xb88a58,
  },
  pompom: {
    group: 'little', dogName: 'Pom Pom', breed: 'Pomeranian', emoji: '🧶', blurb: 'A fluffball with legs. Mostly fluff.',
    L: 0.45, T: 1.1, len: 0.78, gx: 1.35, gy: 1.25, tuck: 0.05, neck: 0.6, headLen: 0.4, headW: 1.3, size: 0.6,
    fluff: 0.03, headFluff: 0.6, ruff: 1.3, ears: 'prick', earSize: 0.75, tail: 'plume', eyeSize: 1.25,
    coat: pompomCoat, swatch: ['#e0923f', '#f0b46a', '#f5d29a'],
    speed: 0.88, bark: 1.9, stiff: 0, wiggle: 0.3, nose: 0x2b2020, brow: 0xc0782e,
  },
  snowball: {
    group: 'little', dogName: 'Snowball', breed: 'Maltese', emoji: '🎀', blurb: 'Fluffy, fancy and never without her bow.',
    L: 0.5, T: 1.2, len: 0.92, gx: 1.3, gy: 1.18, tuck: 0.1, neck: 0.7, headLen: 0.5, headW: 1.25, size: 0.62,
    fluff: 0.024, headFluff: 0.5, ears: 'long', earLen: 1.15, tail: 'plume', topknot: 0xf29bb5, eyeSize: 1.2,
    coat: snowballCoat, swatch: ['#f6f1e8', '#f29bb5', '#e6dccd'],
    speed: 0.88, bark: 1.8, stiff: 0, wiggle: 0.2, nose: 0x231c1c, brow: 0xd8cfc0,
  },
  mochi: {
    group: 'little', dogName: 'Mochi', breed: 'Pug', emoji: '🍡', blurb: 'Snorts, snores and squishy wrinkles.',
    L: 0.5, T: 1.35, len: 0.8, gx: 1.45, gy: 1.25, tuck: 0.1, neck: 0.6, headLen: 0.28, headW: 1.45, muzzleW: 1.45, size: 0.8,
    ears: 'button', earSize: 1.1, tail: 'curl', eyeSize: 1.35, jowls: true, coat: mochiCoat, swatch: ['#d8bb8e', '#2e2826', '#e6d0aa'],
    speed: 0.84, bark: 1.35, stiff: 0, wiggle: 0.6, nose: 0x1f1a1a, brow: 0x2e2826,
  },
  frankie: {
    group: 'little', dogName: 'Frankie', breed: 'French bulldog', emoji: '🥐', blurb: 'Bat ears, snorty nose, big opinions.',
    L: 0.5, T: 1.45, len: 0.82, gx: 1.45, gy: 1.2, tuck: 0.2, neck: 0.6, headLen: 0.32, headW: 1.38, muzzleW: 1.5, size: 0.82,
    ears: 'bat', earSize: 1.15, tail: 'stub', eyeSize: 1.2, jowls: true, coat: frankieCoat, swatch: ['#d7b48a', '#3d302b', '#e6cba6'],
    speed: 0.84, bark: 1.2, stiff: 0, wiggle: 0.5, nose: 0x1f1a1a, brow: 0x3d302b,
  },
  rosie: {
    group: 'little', dogName: 'Rosie', breed: 'Cavalier King Charles', emoji: '🌹', blurb: 'Silky ears, and the saddest eyes when you eat.',
    L: 0.66, T: 1.12, len: 0.92, gx: 1.2, gy: 1.12, tuck: 0.25, neck: 0.82, headLen: 0.55, headW: 1.2, size: 0.84,
    fluff: 0.008, ears: 'long', earLen: 1.35, tail: 'feather', eyeSize: 1.25, coat: rosieCoat, swatch: ['#b5612f', '#f6f1e8', '#c97c45'],
    speed: 0.92, bark: 1.35, stiff: 0, wiggle: 0.2, nose: 0x2b2020, brow: 0xa0552a,
  },
  honey: {
    group: 'little', dogName: 'Honey', breed: 'Cavoodle', emoji: '🧸', blurb: 'A walking teddy bear. Fluff level: maximum.',
    L: 0.64, T: 1.2, len: 0.9, gx: 1.25, gy: 1.15, tuck: 0.15, neck: 0.75, headLen: 0.62, headW: 1.22, size: 0.82,
    fluff: 0.02, curl: 1, headFluff: 0.6, ears: 'long', earLen: 1.1, tail: 'plume', coat: honeyCoat, swatch: ['#d9a066', '#eac08e', '#bf8150'],
    speed: 0.92, bark: 1.45, stiff: 0, wiggle: 0.3, nose: 0x2b2020, brow: 0xbf8150,
  },
  hamish: {
    group: 'little', dogName: 'Hamish', breed: 'Westie', emoji: '🏰', blurb: 'Small, white and a wee bit cheeky.',
    L: 0.5, T: 1.25, len: 0.88, gx: 1.3, gy: 1.15, tuck: 0.1, neck: 0.7, headLen: 0.6, headW: 1.3, size: 0.7,
    fluff: 0.016, headFluff: 0.7, ears: 'prick', earSize: 0.85, tail: 'up', coat: hamishCoat, swatch: ['#f6f1e8', '#e6dccd', '#2b2020'],
    speed: 0.9, bark: 1.6, stiff: 0, wiggle: 0.2, nose: 0x231c1c, brow: 0xd8cfc0,
  },
  bertie: {
    group: 'little', dogName: 'Bertie', breed: 'Schnauzer', emoji: '🎩', blurb: 'Magnificent eyebrows. Very distinguished beard.',
    L: 0.75, T: 1.2, len: 0.92, gx: 1.15, gy: 1.12, tuck: 0.25, neck: 0.88, headLen: 0.95, headW: 1.1, muzzleW: 1.2, size: 0.84,
    fluff: 0.006, beard: true, ears: 'button', earSize: 1.2, tail: 'up', coat: bertieCoat, swatch: ['#7e8186', '#d6d4cf', '#4e5156'],
    speed: 0.95, bark: 1.4, stiff: 0, wiggle: 0, nose: 0x1f1a1a, brow: 0xd6d4cf, browSize: 2.4,
  },
};
