import { getAudio, isMuted } from './audio.js';
import { RNG } from './rng.js';

/*
 * Gentle background music and birdsong, made on the fly (no audio files): a soft pad, a plucky
 * tune, a bass line and a little shaker, in a different key and mood for the garden and the town, and
 * for each area out past the town (the woods, the farm, the beach). Notes are scheduled a moment ahead
 * on the audio clock, so they keep perfect time even when the game is busy.
 */

const THEMES = {
  garden: { bpm: 92, root: 60, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], seed: 'garden', shaker: false, vol: 1 },
  town: { bpm: 104, root: 65, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], seed: 'town', shaker: true, vol: 1 },
  title: { bpm: 80, root: 62, prog: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], seed: 'title', shaker: false, vol: 0.8 },
  // The areas (see setPlace): a folky wood in D (Dm C F G, a breathy flute), a bouncy farm in G (a twangy
  // pluck over oom-pah), a sunny beach in E (I vi IV V on a steel drum, maracas).
  woods: { bpm: 84, root: 62, prog: [[0, 3, 7], [-2, 2, 5], [3, 7, 10], [5, 9, 12]], seed: 'woods', shaker: false, vol: 0.9, scale: [0, 3, 5, 7, 10], lead: 'flute' },
  farm: { bpm: 116, root: 67, prog: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14]], seed: 'farm', shaker: true, vol: 0.95, lead: 'twang' },
  beach: { bpm: 98, root: 64, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], seed: 'beach', shaker: true, vol: 0.95, lead: 'bell' },
  // Trips (see trips/): the sewers are bouncy and a bit silly (a plinky, drippy tune in A, with a tuba-ish bass).
  sewer: { bpm: 100, root: 57, prog: [[0, 4, 7], [5, 9, 12], [-1, 2, 7], [0, 4, 7]], seed: 'sewer', shaker: false, vol: 0.85, lead: 'bloop' },
  // …and out in space it's slow and dreamy (a floaty theremin in Eb over drifting chords, Imaj7 IVmaj7 vi V).
  space: { bpm: 76, root: 63, prog: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [-5, -1, 2, 7]], seed: 'space', shaker: false, vol: 0.85, lead: 'theremin' },
  // The funfair: a bouncy steam-organ tune in C (I IV V I), a reedy calliope on top.
  fair: { bpm: 132, root: 60, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], seed: 'fair', shaker: true, vol: 0.9, lead: 'calliope' },
};
const PENTA = [0, 2, 4, 7, 9]; // major pentatonic: always sounds friendly
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

class Music {
  constructor() {
    this.theme = null;
    this.enabled = true;
    this.timer = null;
    this.bus = null;
    this.ambient = { birds: 0, frogs: 0, drips: 0 };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.bus) this.bus.gain.value = on ? 0.32 : 0;
  }

  /** Start (or switch to) a theme: 'garden' | 'town' | 'title'. Waits quietly for the first tap if needed. */
  play(name) {
    this.theme = THEMES[name] ? name : 'town';
    this.rng = new RNG(THEMES[this.theme].seed);
    this.melody = this.makeMelody();
    this.step = 0;
    this.nextT = 0;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 90);
  }

  stop() { clearInterval(this.timer); this.timer = null; this.theme = null; this.want = null; }

  /**
   * Where the dog is now ('town', or an area: 'woods' | 'farm' | 'beach'…; anything without a theme of its
   * own plays the town's). The tune changes at the start of the next bar, so it never stumbles.
   */
  setPlace(name) {
    if (!this.theme) return;
    const next = THEMES[name] ? name : 'town';
    this.want = next === this.theme ? null : next;
  }

  /** How much birdsong (0..1) and how many frogs (0..1, near the pond) there should be. */
  setAmbient(a) { Object.assign(this.ambient, a); }

  // A 4-bar tune of eighth notes picked from the pentatonic scale, hugging each bar's chord.
  makeMelody() {
    const out = [];
    let note = 2;
    for (let i = 0; i < 32; i++) {
      if (this.rng.chance(i % 2 ? 0.45 : 0.15)) { out.push(null); continue; } // rests on the off-beats
      note = Math.max(0, Math.min(9, note + this.rng.pick([-2, -1, -1, 0, 1, 1, 2])));
      out.push(note);
    }
    return out;
  }

  ensureBus(A) {
    if (this.bus) return;
    this.bus = A.ctx.createGain();
    this.bus.gain.value = this.enabled ? 0.32 : 0;
    const lp = A.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    this.bus.connect(lp).connect(A.master);
  }

  tick() {
    const A = getAudio();
    if (!A || A.ctx.state !== 'running' || isMuted()) { this.nextT = 0; return; }
    this.ensureBus(A);
    const now = A.ctx.currentTime;
    if (this.theme && this.enabled) {
      const th = THEMES[this.theme], beat = 60 / th.bpm / 2; // eighth notes
      if (this.nextT < now) this.nextT = now + 0.05;
      while (this.nextT < now + 0.35) {
        if (this.want && this.step % 8 === 0) { this.switchTo(this.want); break; } // (on to the new place's tune, on the beat)
        this.playStep(A, th, this.step, this.nextT, beat);
        this.step = (this.step + 1) % 64;
        if (this.step === 0) this.melody = this.rng.chance(0.5) ? this.makeMelody() : this.melody; // a new tune now and then
        this.nextT += beat;
      }
    }
    // Birds and frogs (even with the music off).
    if (Math.random() < 0.09 * this.ambient.birds) this.bird(A, now + Math.random() * 0.2);
    if (Math.random() < 0.05 * this.ambient.frogs) this.frog(A, now + Math.random() * 0.2);
    if (Math.random() < 0.07 * this.ambient.drips) this.drip(A, now + Math.random() * 0.2);
  }

  /** Carry on in another theme from the next beat (keeps the beat clock going, unlike play()). */
  switchTo(name) {
    this.theme = name;
    this.want = null;
    this.rng = new RNG(THEMES[name].seed);
    this.melody = this.makeMelody();
    this.step = 0;
  }

  playStep(A, th, step, t, beat) {
    const bar = Math.floor(step / 8) % th.prog.length, chord = th.prog[bar].map((n) => th.root + n);
    if (step % 8 === 0) {
      this.pad(A, chord.map((m) => hz(m - 12)), t, beat * 8, 0.05 * th.vol);
      this.bass(A, hz(chord[0] - 24), t, beat * 3, 0.16 * th.vol);
    }
    if (step % 8 === 4) this.bass(A, hz(chord[0] - 24 + 7), t, beat * 2, 0.11 * th.vol);
    const n = this.melody[step % 32];
    if (n !== null && n !== undefined) {
      const sc = th.scale ?? PENTA, midi = th.root + 12 + sc[n % 5] + 12 * Math.floor(n / 5);
      this[th.lead ?? 'pluck'](A, hz(midi), t, beat * 1.6, 0.075 * th.vol);
    }
    if (th.shaker && step % 2 === 1) this.shaker(A, t, step % 4 === 3 ? 0.03 : 0.018);
  }

  // ---- instruments ----
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  osc(A, type, f, t, dur, vol, a = 0.01, dest = this.bus) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.value = f;
    this.env(g, t, a, vol, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
  }
  pluck(A, f, t, dur, vol) { this.osc(A, 'triangle', f, t, dur, vol, 0.008); this.osc(A, 'sine', f * 2, t, dur * 0.5, vol * 0.3, 0.005); }
  pad(A, freqs, t, dur, vol) { for (const f of freqs) for (const d of [-3, 3]) this.osc(A, 'sine', f * 2 ** (d / 1200), t, dur * 0.8, vol, dur * 0.25); }
  bass(A, f, t, dur, vol) { this.osc(A, 'sine', f, t, dur, vol, 0.02); }
  flute(A, f, t, dur, vol) { this.osc(A, 'sine', f, t, dur * 1.1, vol * 1.05, 0.045); this.osc(A, 'triangle', f * 2, t, dur * 0.7, vol * 0.12, 0.05); } // (soft and breathy)
  twang(A, f, t, dur, vol) { this.osc(A, 'sawtooth', f, t, dur * 0.45, vol * 0.42, 0.004); this.osc(A, 'triangle', f, t, dur * 0.8, vol * 0.8, 0.006); } // (a banjo-ish pluck)
  bell(A, f, t, dur, vol) { this.osc(A, 'sine', f, t, dur * 0.9, vol * 0.95, 0.004); this.osc(A, 'sine', f * 2, t, dur * 0.5, vol * 0.35, 0.003); this.osc(A, 'sine', f * 3.01, t, dur * 0.25, vol * 0.12, 0.003); } // (a steel drum)
  bloop(A, f, t, dur, vol) { // (a bubbly blip that dips a little)
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.06, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    this.env(g, t, 0.006, vol * 1.1, dur * 0.7);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + 0.1);
    this.osc(A, 'triangle', f * 2, t, dur * 0.3, vol * 0.18, 0.004);
  }
  calliope(A, f, t, dur, vol) { this.osc(A, 'square', f, t, dur * 0.6, vol * 0.32, 0.01); this.osc(A, 'triangle', f * 2, t, dur * 0.5, vol * 0.4, 0.01); this.osc(A, 'sine', f, t, dur * 0.8, vol * 0.6, 0.01); } // (a reedy steam organ)
  theremin(A, f, t, dur, vol) { // (a wobbly, swooping sine: a little slide up into each note, then vibrato)
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), lfo = A.ctx.createOscillator(), depth = A.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    lfo.frequency.value = 5.5; depth.gain.value = f * 0.012;
    lfo.connect(depth).connect(o.frequency);
    this.env(g, t, 0.06, vol * 1.05, dur * 1.2);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur * 1.3 + 0.1); lfo.start(t); lfo.stop(t + dur * 1.3 + 0.1);
  }
  shaker(A, t, vol) {
    const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = A.noiseBuf; f.type = 'highpass'; f.frequency.value = 6000;
    this.env(g, t, 0.004, vol, 0.05);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.08);
  }
  bird(A, t) { // a little tweet-tweet
    const base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain(), tt = t + i * 0.11;
      o.type = 'sine';
      o.frequency.setValueAtTime(base, tt);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), tt + 0.06);
      this.env(g, tt, 0.005, 0.018, 0.06);
      o.connect(g).connect(A.master);
      o.start(tt); o.stop(tt + 0.1);
    }
  }
  drip(A, t) { // plink… plonk (water dripping in the sewers), with a faint echo
    const f = 900 + Math.random() * 900;
    for (const [d, v] of [[0, 0.03], [0.21, 0.009]]) {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain(), tt = t + d;
      o.type = 'sine'; o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 1.9, tt + 0.05);
      this.env(g, tt, 0.003, v, 0.07);
      o.connect(g).connect(A.master);
      o.start(tt); o.stop(tt + 0.1);
    }
  }
  frog(A, t) { // ribbit
    for (let i = 0; i < 2; i++) {
      const o = A.ctx.createOscillator(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain(), tt = t + i * 0.13;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(140, tt); o.frequency.exponentialRampToValueAtTime(95, tt + 0.08);
      f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 4;
      this.env(g, tt, 0.01, 0.05, 0.08);
      o.connect(f).connect(g).connect(A.master);
      o.start(tt); o.stop(tt + 0.12);
    }
  }

  /** The ice-cream van's tune: a music-box phrase (vol: 0..1, quieter further away). */
  jingle(vol) {
    const A = getAudio();
    if (!A || A.ctx.state !== 'running' || isMuted() || vol <= 0.02) return;
    const notes = [76, 79, 81, 79, 76, 72, 74, 76, 79, 76, 74, 72];
    const t0 = A.ctx.currentTime + 0.05;
    notes.forEach((m, i) => this.osc(A, 'sine', hz(m), t0 + i * 0.18, 0.3, 0.05 * vol, 0.004, A.master));
  }
}

export const music = new Music();
