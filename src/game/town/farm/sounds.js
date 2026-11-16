import { getAudio, isMuted } from '../../../core/audio.js';

// Farmyard noises, made on the fly like the rest of the game's sounds (no audio files): sheep and lambs,
// pigs, the rooster, the crow, flapping hens, the pen gate, an egg going in the basket. Played through
// the game's own output (the ☰ sound setting).

function tone(type, f0, f1, dur, vol = 0.2, delay = 0, { filter = null, wobble = 0, rate = 6 } = {}) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master } = a, t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (wobble) { // a wobble in the voice (a bleat is a fast one)
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = rate; lg.gain.value = wobble;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3));
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

const BLEAT = { type: 'bandpass', freq: 1150, q: 1.6 };

export const fmsfx = {
  // 🐑 Baa (a sheep: a wobbly "meh-eh-eh"; a lamb: higher and shorter).
  baa(vol = 1, lamb = false) {
    const f = (lamb ? 640 : 410) * (0.92 + Math.random() * 0.16);
    tone('sawtooth', f, f * 0.88, lamb ? 0.38 : 0.55, 0.05 * vol, 0, { filter: BLEAT, wobble: f * 0.07, rate: lamb ? 11 : 8 });
  },
  // 🐷 Oink (two snorty grunts).
  oink(vol = 1) {
    for (const d of [0, 0.17]) { tone('square', 150 + Math.random() * 30, 95, 0.12, 0.05 * vol, d, { filter: { type: 'lowpass', freq: 700 } }); noise(0.1, 0.06 * vol, 'bandpass', 500, 2, d); }
  },
  // 🐷 A happy squeal.
  squeal(vol = 1) { tone('sine', 900, 1500, 0.16, 0.05 * vol); tone('sine', 1500, 800, 0.22, 0.04 * vol, 0.15); },
  // 🐓 Cock-a-doodle-doo!
  crow(vol = 1) {
    const F = { type: 'bandpass', freq: 1300, q: 2 };
    [[620, 660, 0.12, 0], [820, 860, 0.11, 0.15], [900, 960, 0.14, 0.29], [880, 560, 0.6, 0.46]].forEach(([a, b, d, t]) => tone('sawtooth', a, b, d, 0.05 * vol, t, { filter: F, wobble: 12, rate: 14 }));
  },
  // A crow on the scarecrow: caw!
  caw(vol = 1) { tone('sawtooth', 420, 330, 0.2, 0.05 * vol, 0, { filter: { type: 'bandpass', freq: 900, q: 2.5 } }); noise(0.15, 0.04 * vol, 'bandpass', 1100, 2); },
  // Wings flapping (hens, the crow).
  flap(vol = 1) { for (let i = 0; i < 6; i++) noise(0.05, 0.07 * vol, 'bandpass', 1000 + Math.random() * 900, 1.2, i * 0.06); },
  // The pen gate swinging shut (a creak and a clunk), or open.
  gate(vol = 1) { tone('sawtooth', 170, 240, 0.45, 0.025 * vol, 0, { filter: { type: 'bandpass', freq: 600, q: 4 } }); tone('triangle', 200, 120, 0.12, 0.12 * vol, 0.45); noise(0.06, 0.08 * vol, 'lowpass', 900, 1, 0.45); },
  // An egg going into the basket (very gently).
  plop(vol = 1) { tone('sine', 700, 420, 0.09, 0.08 * vol); noise(0.05, 0.04 * vol, 'bandpass', 2400, 3, 0.02); },
  // A pumpkin (or an armful of hay) landing in the cart, the rack, the trough.
  thud(vol = 1) { tone('sine', 160, 70, 0.18, 0.15 * vol); noise(0.08, 0.06 * vol, 'lowpass', 600); },
  // Running through tall wheat: swish.
  swish(vol = 1) { noise(0.25, 0.05 * vol, 'highpass', 2600, 0.7, 0, 1500); },
};
