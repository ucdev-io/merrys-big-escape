import { getAudio, isMuted } from '../../../core/audio.js';

// Little synthesized sounds for heists (no audio files), on the game's shared audio output.
function tone(type, f0, f1, dur, vol = 0.2, delay = 0, q = null) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master } = a, t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (q) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = q; f.Q.value = 3; o.connect(f); node = f; }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, freq, delay = 0) {
  const a = getAudio();
  if (!a || isMuted()) return;
  const { ctx, master, noiseBuf } = a, t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const heistSfx = {
  /** "Hmm?" — a grown-up is about to look round. */
  hmm(vol = 1) { tone('triangle', 330, 360, 0.16, 0.09 * vol); tone('triangle', 360, 520, 0.22, 0.09 * vol, 0.16); },
  /** Tiptoe plinks: you nicked something and nobody saw. */
  sneak() { [784, 659, 880].forEach((f, i) => tone('sine', f, f * 0.98, 0.09, 0.12, i * 0.09)); },
  /** A sad little trombone for getting caught (and the treat going back). */
  wahwah() { [[392, 370], [370, 349], [349, 262]].forEach(([a, b], i) => tone('sawtooth', a, b, i === 2 ? 0.5 : 0.22, 0.06, i * 0.24, 900)); },
  /** Got away with it! A sneaky little fanfare. */
  getaway() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.14, 0.16, i * 0.08)); },
  /** A tray of fresh treats comes out. */
  ding() { tone('sine', 1320, 1300, 0.6, 0.1); tone('sine', 1980, 1960, 0.4, 0.05, 0.01); },
  /** The butcher's sausage machine going round. */
  crank() { noise(0.08, 0.06, 'bandpass', 600); tone('square', 140, 110, 0.06, 0.03, 0.02); },
  /** A string of sausages snapping in two. */
  snap() { noise(0.12, 0.3, 'highpass', 2200); tone('sine', 900, 200, 0.18, 0.15, 0.01); },
  /** Sizzle on the barbecue. */
  sizzle(vol = 1) { noise(0.5, 0.05 * vol, 'highpass', 4000); },
};
