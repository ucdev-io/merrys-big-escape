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

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
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
  hooray() {
    const notes = [523, 587, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => tone('triangle', f, f, 0.2, 0.18, i * 0.13));
    notes.forEach((f, i) => tone('sine', f / 2, f / 2, 0.2, 0.08, i * 0.13));
  },
};
