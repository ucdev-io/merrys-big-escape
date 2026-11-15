import { getAudio, isMuted } from '../../../core/audio.js';

// Woodland noises, made on the fly like the rest of the game's sounds (no audio files): the owl, mud,
// sticks going clonk, a woodpecker somewhere. Played through the game's own output (the ☰ sound setting).

function tone(type, f0, f1, dur, vol = 0.2, delay = 0, { filter = null, vibrato = 0 } = {}) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master } = a, t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (vibrato) { // a little wobble in the voice
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 6; lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, freq, q = 1, delay = 0, freqEnd = null) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master, noiseBuf } = a, t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const wsfx = {
  // 🦉 Twit-twoo (a tawny owl: a sharp "twit", then a long wobbly "twoo-oo").
  hoot(vol = 1) {
    tone('sine', 1150, 980, 0.16, 0.07 * vol, 0, { filter: { type: 'lowpass', freq: 2200 } });
    tone('sine', 520, 470, 0.5, 0.11 * vol, 0.32, { vibrato: 9 });
    tone('sine', 500, 430, 0.75, 0.09 * vol, 0.9, { vibrato: 12 });
  },
  // 🦉 Hoo hoo (softer, for a sleepy owl or far away).
  hoo(vol = 1) { tone('sine', 470, 420, 0.4, 0.06 * vol, 0, { vibrato: 8 }); tone('sine', 440, 400, 0.5, 0.05 * vol, 0.5, { vibrato: 8 }); },
  // 🦉 Feathers fluffing up.
  ruffle(vol = 1) { for (let i = 0; i < 7; i++) noise(0.06, 0.08 * vol, 'bandpass', 1400 + Math.random() * 1200, 1.2, i * 0.045); },
  // 🟤 Squelch!
  squelch(vol = 1) { noise(0.18, 0.18 * vol, 'lowpass', 900, 3, 0, 220); tone('sine', 220, 90, 0.16, 0.08 * vol); },
  // 🟤 A big splodge into the mud.
  splat(vol = 1) { noise(0.32, 0.26 * vol, 'lowpass', 1300, 2, 0, 160); tone('sine', 160, 60, 0.25, 0.12 * vol); },
  // 🪵 A stick going on the den.
  clonk(vol = 1) { tone('triangle', 420, 380, 0.09, 0.13 * vol); tone('triangle', 610, 560, 0.07, 0.07 * vol, 0.02); noise(0.05, 0.08 * vol, 'bandpass', 1800, 3); },
  // 🪵 A big stick bonking a gatepost.
  thunk(vol = 1) { tone('triangle', 240, 150, 0.14, 0.16 * vol); noise(0.06, 0.12 * vol, 'bandpass', 1200, 2); },
  // A woodpecker, somewhere in the trees.
  peck(vol = 1) { const n = 9 + Math.floor(Math.random() * 6); for (let i = 0; i < n; i++) noise(0.025, 0.06 * vol * (1 - i / (n * 1.4)), 'bandpass', 2300, 6, i * 0.055); },
  // 🦡 Brock's snuffly snort.
  snort(vol = 1) { noise(0.16, 0.1 * vol, 'bandpass', 700, 2); noise(0.12, 0.08 * vol, 'bandpass', 900, 2, 0.2); },
  // Leaves flying out of a sett door.
  leaves(vol = 1) { for (let i = 0; i < 5; i++) noise(0.07, 0.09 * vol, 'highpass', 2600, 0.8, i * 0.05); },
};
