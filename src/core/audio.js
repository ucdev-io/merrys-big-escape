// Tiny synthesized sound effects — no audio files. Everything is built from oscillators and noise.
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

export const sfx = {
  bark(pitch = 1, vol = 1) {
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
    noise(0.12, 0.35, 'lowpass', 700, 1, 0, 200);
    noise(0.05, 0.12, 'bandpass', 2400, 2, 0.04);
  },
  squeak() {
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
  splash() { noise(0.6, 0.25, 'bandpass', 1800, 0.8, 0, 500); },
  shake() { for (let i = 0; i < 6; i++) noise(0.05, 0.1, 'bandpass', 3000, 2, i * 0.07); },
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
  chomp() { for (let i = 0; i < 3; i++) noise(0.06, 0.22, 'bandpass', 700 + i * 150, 2, i * 0.11); tone('sine', 300, 600, 0.15, 0.15, 0.36); },
  // A huge jump: a big springy boing.
  boing() { tone('sine', 180, 720, 0.28, 0.28); tone('triangle', 360, 1440, 0.2, 0.08, 0.02); },
  // A car horn: a friendly two-tone beep-beep (quieter when it's further away).
  honk(vol = 1) { for (const [d, f] of [[0, 415], [0.22, 415]]) { tone('square', f, f * 0.98, 0.16, 0.07 * vol, d, { type: 'lowpass', freq: 1500 }); tone('square', f * 1.26, f * 1.25, 0.16, 0.05 * vol, d, { type: 'lowpass', freq: 1500 }); } },
  // Duchess: a posh little quack. Ducklings: peep!
  quack() { tone('sawtooth', 620, 380, 0.14, 0.06, 0, { type: 'bandpass', freq: 900, q: 3 }); tone('sawtooth', 560, 360, 0.12, 0.05, 0.16, { type: 'bandpass', freq: 900, q: 3 }); },
  peep() { tone('sine', 2300, 2900, 0.07, 0.06); },
  // A happy howl: up, hold, and down again (pitch: the breed's voice).
  howl(pitch = 1, vol = 1) { const o = 330 * pitch; tone('sine', o, o * 1.5, 0.6, 0.12 * vol); tone('sine', o * 1.5, o * 1.42, 0.9, 0.1 * vol, 0.55); tone('sine', o * 1.42, o * 0.9, 0.6, 0.08 * vol, 1.4); },
  // Power-up running out.
  fizzle() { tone('sine', 600, 200, 0.3, 0.12); },
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
  hooray() {
    const notes = [523, 587, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => tone('triangle', f, f, 0.2, 0.18, i * 0.13));
    notes.forEach((f, i) => tone('sine', f / 2, f / 2, 0.2, 0.08, i * 0.13));
  },
};
