import { getAudio, isMuted } from './audio.js';

// Little synthesized voices for the neighbourhood friends and their jobs (no audio files), played
// through the game's own sound output so the ☰ sound setting covers them too.

function tone(type, f0, f1, dur, vol = 0.2, delay = 0, filter = null) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master } = a, t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01 + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, freq, q = 1, delay = 0) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master, noiseBuf } = a, t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.005 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const fsfx = {
  // 🐿️ Squirrel chatter: quick high chirps.
  chitter(vol = 1) { for (let i = 0; i < 5; i++) tone('triangle', 1900 + Math.random() * 500, 1500, 0.035, 0.06 * vol, i * 0.055); },
  // 🐿️ A giggle: chirps that bounce up and down.
  giggle(vol = 1) { [0, 1, 2, 3, 4, 5].forEach((i) => tone('sine', i % 2 ? 1500 : 1900, i % 2 ? 1300 : 2100, 0.06, 0.07 * vol, i * 0.075)); },
  // 🦔 Snuffle snuffle.
  snuffle(vol = 1) { for (let i = 0; i < 3; i++) noise(0.06, 0.08 * vol, 'bandpass', 1400 + i * 250, 4, i * 0.09); },
  // 🦔 A tiny "eek!" as she curls up.
  eek(vol = 1) { tone('sine', 1400, 2400, 0.12, 0.07 * vol); },
  // 🤖 The mower: beep-boop (n beeps).
  beep(n = 2, vol = 1) { for (let i = 0; i < n; i++) tone('square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.07, 0.035 * vol, i * 0.13, { type: 'lowpass', freq: 2200 }); },
  // 🤖 Reversing: a long, worried boo-woop.
  reverse(vol = 1) { tone('square', 520, 260, 0.35, 0.03 * vol, 0, { type: 'lowpass', freq: 1600 }); },
  // 🐔 Bwaak!
  cluck(vol = 1) { tone('sawtooth', 700, 520, 0.08, 0.05 * vol, 0, { type: 'bandpass', freq: 1300, q: 3 }); tone('sawtooth', 900, 600, 0.16, 0.05 * vol, 0.1, { type: 'bandpass', freq: 1300, q: 3 }); },
  // ⚽ A soft boot of a football.
  kick(vol = 1) { tone('sine', 180, 70, 0.14, 0.2 * vol); noise(0.05, 0.12 * vol, 'lowpass', 800); },
  // 🐈 Pickles, offended.
  hmph(vol = 1) { tone('sawtooth', 380, 300, 0.22, 0.07 * vol, 0, { type: 'bandpass', freq: 900, q: 3 }); },
  // 📋 A new job: a little "ta-da" on paper.
  tada(vol = 1) { [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.12, 0.08 * vol, i * 0.07)); },
};
