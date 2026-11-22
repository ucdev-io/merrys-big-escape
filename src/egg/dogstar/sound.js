import { getAudio, isMuted, sfx } from '../../core/audio.js';

/*
 * 🔊 Dog Star's sounds: bleepy and spacey, made on the fly through the game's own audio (so its mute and the
 * phone going to sleep work the same). The dog's own howl and bark are the real recordings (sfx.howl, sfx.bark).
 */
let bus = null;
function out() {
  const A = getAudio();
  if (!A || isMuted() || A.ctx.state !== 'running') return null;
  if (!bus || bus.context !== A.ctx) { bus = A.ctx.createGain(); bus.gain.value = 0.55; bus.connect(A.master); }
  return A;
}

function tone(type, f0, f1, dur, vol, delay = 0, q = 0) {
  const A = out();
  if (!A) return;
  const t = A.ctx.currentTime + delay, o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (q) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = q; o.connect(f); node = f; }
  node.connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

function hiss(dur, vol, freq, freqEnd = freq, delay = 0, type = 'bandpass') {
  const A = out();
  if (!A) return;
  const t = A.ctx.currentTime + delay, s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
  s.buffer = A.noiseBuf;
  f.type = type; f.Q.value = 0.9;
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// A pentatonic ladder (A minor): the round-up chime climbs it, one rung for each shape you catch.
const LADDER = [440, 523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
let lastPew = 0;

export const snd = {
  /** A soft tick for each shot (they come fast, so it's quiet and never more than ~12 a second). */
  pew() {
    const A = out(), now = A?.ctx.currentTime ?? 0;
    if (!A || now - lastPew < 0.08) return;
    lastPew = now;
    tone('square', 1500 + Math.random() * 200, 700, 0.045, 0.012, 0, 3000);
  },
  /** A side knocked off a shape: a little glassy clink, higher for the smaller shapes. */
  clink(sides) { const f = 1800 - sides * 160; tone('triangle', f, f * 0.7, 0.09, 0.05); hiss(0.05, 0.03, 4000); },
  /** A shape broken right up. */
  shatter(sides = 3) { hiss(0.32, 0.09, 2600, 400); tone('sawtooth', 300 + sides * 30, 60, 0.25, 0.04, 0, 1400); },
  /** Round-up! A rising chime, one note per shape caught (and a woof for a really good one). */
  roundUp(n) {
    const k = Math.min(n, 6);
    for (let i = 0; i <= k + 1; i++) tone('triangle', LADDER[Math.min(i + 1, LADDER.length - 1)], LADDER[Math.min(i + 1, LADDER.length - 1)], 0.18, 0.07, i * 0.055);
    tone('sine', 220, 880, 0.35, 0.05);
    if (n >= 3) setTimeout(() => sfx.bark?.(1.1, 0.7), 260);
  },
  /** The loop closed round nothing. */
  emptyLoop() { tone('sine', 660, 520, 0.12, 0.03); },
  /** The tail snapped (a triangle or a star-bullet went through it). */
  snap() { tone('square', 900, 200, 0.12, 0.025, 0, 2200); hiss(0.1, 0.04, 1500, 600); },
  /** A shape warping in. */
  warp() { tone('sine', 140, 520, 0.5, 0.025); },
  /** A pentagon spitting a star at you. */
  spit() { tone('sine', 520, 980, 0.1, 0.025); },
  /** A hive hatching a triangle. */
  hatch() { tone('triangle', 300, 900, 0.14, 0.03); },
  /** A twinkle: stardust collected. */
  dust() { tone('sine', 2000 + Math.random() * 600, 2600, 0.05, 0.012); },
  /** Ow! (lost a paw) */
  hurt() { tone('sawtooth', 220, 50, 0.6, 0.12, 0, 900); hiss(0.6, 0.15, 1200, 100, 0, 'lowpass'); },
  /** AWOOOO: the real howl, with a big whoosh. */
  howl(pitch = 1) { sfx.howl?.(pitch, 0.9); hiss(0.9, 0.08, 300, 3000); tone('sine', 110, 55, 1.2, 0.12); },
  /** The howl's charged up. */
  ready() { [880, 1319, 1760].forEach((f, i) => tone('sine', f, f, 0.16, 0.04, i * 0.07)); },
  /** A wave cleared and a star lit. */
  star() { [659, 784, 988, 1319, 1568].forEach((f, i) => tone('triangle', f, f * 1.002, 0.5, 0.06, i * 0.09)); },
  /** Sirius! The whole Big Dog. */
  dogStar() { this.star(); [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone('sine', f, f, 0.9, 0.05, 0.5 + i * 0.12)); setTimeout(() => sfx.howl?.(1, 1), 900); },
  /** Game over: down the ladder. */
  over() { [784, 659, 523, 440, 330].forEach((f, i) => tone('triangle', f, f * 0.98, 0.35, 0.06, i * 0.16)); },
  /** A menu button. */
  blip() { tone('sine', 880, 1320, 0.07, 0.04); },
};
