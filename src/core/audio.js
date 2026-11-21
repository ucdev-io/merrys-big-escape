// Sound effects. Most are synthesized from oscillators and noise; the dog's own sounds, splashes, waves and gulls are
// short recordings (see "Recorded sounds" below), with a synthesized stand-in until they've loaded.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// Browsers only allow audio after a user gesture.
export function unlockAudio() {
  const c = init();
  if (c && c.state === 'suspended') c.resume();
  if (c) loadSamples();
}
['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlockAudio, { passive: true }));
// Switch apps / lock the phone → sounds pause; come back → they resume.
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
/** The shared audio context and output (for music.js) — null until the player has tapped or pressed a key. */
export function getAudio() { return ctx && master ? { ctx, master, noiseBuf } : null; }
export function isMuted() { return muted; }

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0, filter) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.01, vol, dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); Object.assign(f, { type: filter.type }); f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, freq, q = 1, delay = 0, freqEnd) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  env(g, t, 0.005, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

// Recorded sounds: real woofs, paws digging, splashes and crunches (CC0 recordings from freesound.org, listed in
// public/sfx/CREDITS.md). They load after the first tap, so the game starts no slower, and until one arrives
// (or on a connection that can't fetch it) the synthesized sound plays instead.
const SAMPLES = ['bark-big-1', 'bark-big-2', 'bark-mid', 'bark-small-1', 'bark-small-2', 'bark-tiny', 'dig-1', 'dig-2', 'scratch',
  'splash-1', 'splash-2', 'puddle-1', 'puddle-2', 'shake', 'chomp-1', 'chomp-2', 'chomp-3', 'chomp-4', 'squeak-1', 'squeak-2',
  'howl', 'wave', 'gull-1', 'gull-2'];
const buffers = new Map();
let loading = false;
// How loud each recording plays at vol 1: measured so each sits near the synthesized sound it replaces (the dog's
// own sounds a little louder, the waves and gulls in the background), and so a set's variations match each other.
const LEVEL = {
  'bark-big-1': 0.34, 'bark-big-2': 0.46, 'bark-mid': 0.45, 'bark-small-1': 0.38, 'bark-small-2': 0.46,
  'bark-tiny': 0.52, 'howl': 0.24, 'dig-1': 0.30, 'dig-2': 0.20, 'scratch': 0.38, 'shake': 0.25, 'puddle-1': 0.15,
  'puddle-2': 0.22, 'splash-1': 0.29, 'splash-2': 0.28, 'chomp-1': 0.51, 'chomp-2': 1.00, 'chomp-3': 0.60,
  'chomp-4': 0.37, 'squeak-1': 0.36, 'squeak-2': 0.33, 'wave': 0.19, 'gull-1': 0.09, 'gull-2': 0.17,
};

function loadSamples() {
  if (loading) return;
  loading = true;
  const base = `${import.meta.env?.BASE_URL ?? '/'}sfx/`;
  const decode = (data) => new Promise((ok, no) => ctx.decodeAudioData(data, ok, no)?.catch?.(no));
  let next = 0;
  const worker = async () => {
    while (next < SAMPLES.length) {
      const name = SAMPLES[next++];
      try {
        const res = await fetch(`${base}${name}.mp3`);
        if (!res.ok) continue;
        const buf = await decode(await res.arrayBuffer());
        // Where the sound really starts (past the file's quiet lead-in), for the quick paw-scrapes.
        const d = buf.getChannelData(0);
        let peak = 0, i = 0;
        for (let k = 0; k < d.length; k++) peak = Math.max(peak, Math.abs(d[k]));
        while (i < d.length && Math.abs(d[i]) < peak * 0.15) i++;
        buf.onset = Math.max(0, i / buf.sampleRate - 0.01);
        buffers.set(name, buf);
      } catch { /* that one stays synthesized */ }
    }
  };
  for (let k = 0; k < 4; k++) worker();
}

/**
 * Plays a recording (rate: faster and higher above 1). Returns false if it hasn't loaded yet, so the caller can
 * make its synthesized sound instead. (len: stop after this much of it, with a quick fade.)
 */
export function sample(name, { vol = 1, rate = 1, delay = 0, from = 0, len = 0 } = {}) {
  const buf = buffers.get(name);
  if (!buf) return false;
  if (!ctx || muted || vol < 0.003) return true;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), g = ctx.createGain();
  vol *= LEVEL[name] ?? 1;
  s.buffer = buf;
  s.playbackRate.value = rate;
  g.gain.setValueAtTime(vol, t);
  if (len) { g.gain.setValueAtTime(vol, t + len * 0.6); g.gain.linearRampToValueAtTime(0, t + len); }
  s.connect(g).connect(master);
  if (len) s.start(t, from, len + 0.02); else s.start(t, from);
  return true;
}

/** One of a set of recordings, at random (never the same one twice running); null until any have loaded. */
const lastOf = new Map();
export function oneOf(names) {
  const ok = names.filter((n) => buffers.has(n));
  if (!ok.length) return null;
  let n = ok[Math.floor(Math.random() * ok.length)];
  if (ok.length > 1 && n === lastOf.get(names)) n = ok[(ok.indexOf(n) + 1) % ok.length];
  lastOf.set(names, n);
  return n;
}
const jitter = (k = 0.04) => 1 - k + Math.random() * 2 * k;

// Each breed's voice (breed.bark: 0.6 for the biggest dogs … 2 for the tiniest) gets the nearest recording, nudged
// up or down to its own pitch, so big dogs, little dogs and the ones in between all sound different.
const BARKS = [['bark-big-1', 0.62], ['bark-big-2', 0.8], ['bark-mid', 1.05], ['bark-small-1', 1.3], ['bark-small-2', 1.55], ['bark-tiny', 1.85]];
// Digging: quick paw-scrapes, left-right-left (a short bit of wet sand, again and again, each a little different).
const DIGS = [
  { name: 'dig-1', n: 4, gap: 0.13, len: 0.25, rates: [1.3, 1.1] },
  { name: 'dig-2', n: 5, gap: 0.11, len: 0.2, rates: [1.35, 1.15] },
];
const SPLASHES = ['splash-1', 'splash-2'], PUDDLES = ['puddle-1', 'puddle-2'], SQUEAKS = ['squeak-1', 'squeak-2'];
const CRUNCHES = ['chomp-2', 'chomp-3', 'chomp-4'];

function scrapes({ name, n, gap, len, rates }, vol) {
  const buf = buffers.get(name);
  for (let i = 0; i < n; i++) {
    sample(name, { vol: vol * (i % 2 ? 0.8 : 1), rate: rates[i % rates.length] * jitter(), delay: 0.02 + i * gap + Math.random() * 0.02, from: buf.onset, len });
  }
}

export const sfx = {
  bark(pitch = 1, vol = 1) {
    let [name, at] = BARKS[0];
    for (const [n, a] of BARKS) if (Math.abs(Math.log(pitch / a)) < Math.abs(Math.log(pitch / at))) [name, at] = [n, a];
    if (sample(name, { vol, rate: Math.min(1.25, Math.max(0.8, (pitch / at) ** 0.7)) * jitter() })) return;
    const p = (0.9 + Math.random() * 0.2) * pitch;
    for (const [d, f] of [[0, 520], [0.16, 470]]) {
      tone('sawtooth', f * p, 170 * p, 0.12 / Math.sqrt(pitch), 0.28 * vol, d, { type: 'lowpass', freq: 1400 * pitch, q: 4 });
      noise(0.07, 0.18 * vol, 'bandpass', 900 * pitch, 2, d);
    }
  },
  sniff() {
    for (let i = 0; i < 3; i++) noise(0.07, 0.12, 'bandpass', 2600 + i * 300, 3, i * 0.11);
  },
  dig() {
    const ways = [...DIGS.filter((d) => buffers.has(d.name)), ...(buffers.has('scratch') ? ['scratch'] : [])];
    if (ways.length) {
      const w = ways[Math.floor(Math.random() * ways.length)];
      if (w === 'scratch') sample('scratch', { rate: jitter(0.06) }); else scrapes(w, 1);
      return;
    }
    noise(0.12, 0.35, 'lowpass', 700, 1, 0, 200);
    noise(0.05, 0.12, 'bandpass', 2400, 2, 0.04);
  },
  squeak() {
    const n = oneOf(SQUEAKS);
    if (n && sample(n, { rate: jitter(0.08) })) return;
    tone('sine', 1100, 1900, 0.09, 0.25);
    tone('sine', 1900, 1000, 0.12, 0.22, 0.09);
  },
  found() {
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.2, i * 0.09));
  },
  meow() {
    tone('sawtooth', 480, 820, 0.18, 0.16, 0, { type: 'bandpass', freq: 1200, q: 3 });
    tone('sawtooth', 820, 420, 0.3, 0.16, 0.18, { type: 'bandpass', freq: 1000, q: 3 });
  },
  hiss() { noise(0.5, 0.2, 'highpass', 3000, 0.7); },
  // Landing in water (power: how hard, 0..1.5): a gentle step in is a puddle splash, a run and a leap a big one.
  splash(power = 1) {
    if (power < 0.45 && oneOf(PUDDLES)) { this.puddle(1.2); return; }
    const n = oneOf(SPLASHES);
    if (n && sample(n, { vol: Math.min(1.2, 0.55 + 0.45 * power), rate: jitter(0.06) })) return;
    noise(0.6, 0.25, 'bandpass', 1800, 0.8, 0, 500);
  },
  // Splashing through a puddle or the shallows (one step).
  puddle(vol = 1) { const n = oneOf(PUDDLES); if (n && sample(n, { vol, rate: jitter(0.1) })) return; this.plip(); },
  shake() {
    if (sample('shake', { rate: jitter(0.05) })) return; for (let i = 0; i < 6; i++) noise(0.05, 0.1, 'bandpass', 3000, 2, i * 0.07); },
  bonk() { tone('sine', 300, 90, 0.25, 0.35); noise(0.08, 0.2, 'lowpass', 900); },
  tunnel() { noise(1.2, 0.3, 'lowpass', 400, 1, 0, 120); },
  pop() { tone('sine', 400, 1200, 0.08, 0.25); },
  // A cross grown-up shouting "HEY!" from a doorway (formant-ish saw, nothing scary).
  shout() {
    tone('sawtooth', 210, 260, 0.16, 0.16, 0, { type: 'bandpass', freq: 900, q: 5 });
    tone('sawtooth', 260, 180, 0.22, 0.16, 0.16, { type: 'bandpass', freq: 750, q: 5 });
  },
  clang() { tone('square', 180, 90, 0.35, 0.12); noise(0.3, 0.25, 'bandpass', 1800, 4); tone('triangle', 900, 860, 0.5, 0.06, 0.02); },
  rustle() { for (let i = 0; i < 4; i++) noise(0.08, 0.1, 'highpass', 2500, 0.8, i * 0.05); },
  boink() { tone('sine', 700, 200, 0.18, 0.25); },
  // Pigeons taking off: a clatter of wings and an indignant coo.
  flutter() { for (let i = 0; i < 9; i++) noise(0.05, 0.13, 'bandpass', 1200 + Math.random() * 900, 1.4, i * 0.035); tone('sine', 520, 380, 0.2, 0.06, 0.05); },
  plip() { tone('sine', 950 + Math.random() * 300, 450, 0.07, 0.07); }, // paddling
  // Gobbling a snack from the bin: three quick chomps and a happy gulp.
  chomp() {
    // The grab, then two crunches.
    if (sample('chomp-1', { rate: jitter(0.06) })) {
      for (const delay of [0.16, 0.32]) { const n = oneOf(CRUNCHES); if (n) sample(n, { rate: jitter(0.08), delay }); }
      return;
    }
    for (let i = 0; i < 3; i++) noise(0.06, 0.22, 'bandpass', 700 + i * 150, 2, i * 0.11); tone('sine', 300, 600, 0.15, 0.15, 0.36); },
  // A huge jump: a big springy boing.
  boing() { tone('sine', 180, 720, 0.28, 0.28); tone('triangle', 360, 1440, 0.2, 0.08, 0.02); },
  // A car horn: a friendly two-tone beep-beep (quieter when it's further away).
  honk(vol = 1) { for (const [d, f] of [[0, 415], [0.22, 415]]) { tone('square', f, f * 0.98, 0.16, 0.07 * vol, d, { type: 'lowpass', freq: 1500 }); tone('square', f * 1.26, f * 1.25, 0.16, 0.05 * vol, d, { type: 'lowpass', freq: 1500 }); } },
  // Duchess: a posh little quack. Ducklings: peep!
  quack() { tone('sawtooth', 620, 380, 0.14, 0.06, 0, { type: 'bandpass', freq: 900, q: 3 }); tone('sawtooth', 560, 360, 0.12, 0.05, 0.16, { type: 'bandpass', freq: 900, q: 3 }); },
  peep() { tone('sine', 2300, 2900, 0.07, 0.06); },
  // A happy howl: up, hold, and down again (pitch: the breed's voice).
  howl(pitch = 1, vol = 1) {
    if (sample('howl', { vol, rate: Math.min(1.25, Math.max(0.8, pitch ** 0.5)) * jitter(0.03) })) return;
    const o = 330 * pitch; tone('sine', o, o * 1.5, 0.6, 0.12 * vol); tone('sine', o * 1.5, o * 1.42, 0.9, 0.1 * vol, 0.55); tone('sine', o * 1.42, o * 0.9, 0.6, 0.08 * vol, 1.4); },
  // Power-up running out.
  fizzle() { tone('sine', 600, 200, 0.3, 0.12); },
  // 🚢 A ship's horn: a deep, two-note HOOO-ONK (vol: quieter when it's far off).
  horn(vol = 1) {
    for (const [f, d, len] of [[110, 0, 0.75], [92, 0.82, 1.1]]) {
      tone('sawtooth', f, f * 0.99, len, 0.09 * vol, d, { type: 'lowpass', freq: 520, q: 1.5 });
      tone('sawtooth', f * 1.5, f * 1.49, len, 0.05 * vol, d, { type: 'lowpass', freq: 700 });
      tone('sine', f / 2, f / 2, len, 0.12 * vol, d);
    }
  },
  // 🔔 The ship's bell: ding (and a long, shimmering ring).
  bell() { tone('sine', 1320, 1316, 1.4, 0.12); tone('sine', 2640, 2630, 0.7, 0.05); tone('sine', 3520, 3500, 0.35, 0.03); },
  // 🛸 A flying saucer's beam of light: a rising, shimmering whooo-eee (and a sparkle on top).
  beam() {
    tone('sine', 220, 880, 1.6, 0.12); tone('sine', 223, 886, 1.6, 0.08, 0.02);
    for (let i = 0; i < 8; i++) tone('triangle', 1200 + i * 160, 1500 + i * 160, 0.12, 0.035, 0.2 + i * 0.16);
  },
  // 🎢 The rollercoaster's chain on the lift hill: click.
  clack() { noise(0.03, 0.14, 'bandpass', 2600, 3); tone('square', 900, 700, 0.02, 0.03); },
  // ✨ A star-spark picked up: a quick bright arpeggio.
  spark() { [880, 1109, 1319, 1760].forEach((f, i) => tone('triangle', f, f, 0.14, 0.09, i * 0.05)); },
  // 👽 An alien's voice: a wobbly little warble (pitch: higher for the little ones).
  blip(pitch = 1) { const f = 520 * pitch; tone('sine', f, f * 1.6, 0.09, 0.08); tone('sine', f * 1.5, f * 0.9, 0.12, 0.07, 0.09); },
  // 🏆 At the dog show: the judge's whistle (a trill), a frisbee whooshing off, and how warm the hidden toy is when
  // sniffing for it (k 0..1: higher and brighter the closer she gets).
  whistle() { for (let i = 0; i < 2; i++) tone('sine', 2500, 2650, 0.16, 0.05, i * 0.2, { type: 'bandpass', freq: 2600, q: 4 }); noise(0.4, 0.05, 'bandpass', 2600, 6); },
  whoosh() { noise(0.45, 0.14, 'bandpass', 600, 1.4, 0, 2400); },
  warm(k = 0) { const f = 330 + 660 * k; tone('sine', f, f * 1.12, 0.16, 0.05 + 0.05 * k); if (k > 0.75) tone('triangle', f * 2, f * 2.2, 0.1, 0.03, 0.08); },
  hooray() {
    const notes = [523, 587, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => tone('triangle', f, f, 0.2, 0.18, i * 0.13));
    notes.forEach((f, i) => tone('sine', f / 2, f / 2, 0.2, 0.08, i * 0.13));
  },
};
