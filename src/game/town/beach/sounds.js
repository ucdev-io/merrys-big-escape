import { getAudio, isMuted } from '../../../core/audio.js';

// Beach noises, made on the fly like the rest of the game's sounds (no audio files): waves washing up the
// sand and hissing back, seagulls, crabs going snip, sandcastles patted and squashed, the lifeguard's
// whistle and the kiosk's bell. Played through the game's own output (the ☰ sound setting).

function tone(type, f0, f1, dur, vol = 0.2, delay = 0, { filter = null, vibrato = 0, rate = 6 } = {}) {
  const a = getAudio();
  if (!a || isMuted() || vol < 0.003) return;
  const { ctx, master } = a, t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = rate; lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise with a soft swell: attack, then a long fade (a wave, a hiss). */
function swell(dur, vol, type, freq, { q = 0.7, delay = 0, attack = 0.08, freqEnd = null } = {}) {
  const a = getAudio();
  if (!a || isMuted() || vol < 0.003) return;
  const { ctx, master, noiseBuf } = a, t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const bsfx = {
  // 🌊 A wave washing up the sand (vol: how near the water you are).
  wave(vol = 1) { swell(2.6, 0.13 * vol, 'lowpass', 700, { attack: 0.55, freqEnd: 380 }); swell(1.6, 0.05 * vol, 'highpass', 2600, { attack: 0.35, delay: 0.25 }); },
  // …and hissing back down over the pebbles.
  backwash(vol = 1) { swell(1.8, 0.05 * vol, 'bandpass', 1800, { q: 0.6, attack: 0.3, freqEnd: 900 }); },
  // 🐦 A herring gull: kyow, kyow, ha-ha-ha.
  gull(vol = 1) {
    const p = 0.9 + Math.random() * 0.25;
    tone('triangle', 1250 * p, 820 * p, 0.32, 0.05 * vol, 0, { filter: { type: 'bandpass', freq: 1500, q: 1.2 } });
    tone('triangle', 1300 * p, 850 * p, 0.3, 0.045 * vol, 0.42, { filter: { type: 'bandpass', freq: 1500, q: 1.2 } });
    for (let i = 0; i < 3; i++) tone('triangle', 1100 * p, 980 * p, 0.09, 0.035 * vol, 0.85 + i * 0.13, { filter: { type: 'bandpass', freq: 1400, q: 1.5 } });
  },
  // 🐦 A cross squawk (shooed away).
  squawk(vol = 1) { tone('sawtooth', 980, 620, 0.22, 0.06 * vol, 0, { filter: { type: 'bandpass', freq: 1300, q: 2 } }); tone('sawtooth', 900, 560, 0.18, 0.05 * vol, 0.2, { filter: { type: 'bandpass', freq: 1200, q: 2 } }); },
  // 🦀 Snip snip!
  snip(vol = 1) { for (let i = 0; i < 2; i++) swell(0.04, 0.09 * vol, 'bandpass', 3800, { q: 4, attack: 0.004, delay: i * 0.13 }); },
  // 🏰 Patting a sandcastle into shape.
  pat(vol = 1) { swell(0.12, 0.16 * vol, 'lowpass', 520, { attack: 0.005 }); swell(0.1, 0.07 * vol, 'lowpass', 420, { attack: 0.005, delay: 0.14 }); },
  // 🏰 Squashed flat.
  flump(vol = 1) { swell(0.45, 0.22 * vol, 'lowpass', 600, { attack: 0.01, freqEnd: 150 }); tone('sine', 160, 70, 0.3, 0.08 * vol); },
  // 🛟 The lifeguard's whistle: phweeep!
  whistle(vol = 1) { tone('sine', 2900, 2750, 0.32, 0.06 * vol, 0, { vibrato: 90, rate: 32 }); tone('sine', 3000, 2850, 0.45, 0.06 * vol, 0.4, { vibrato: 90, rate: 32 }); },
  // 🍦 The kiosk's bell.
  ding(vol = 1) { tone('sine', 1760, 1740, 0.6, 0.07 * vol); tone('sine', 2640, 2620, 0.4, 0.03 * vol, 0.01); },
  // A splash of spray from a wave breaking over paws.
  spray(vol = 1) { swell(0.35, 0.08 * vol, 'highpass', 2200, { attack: 0.02 }); },
};
