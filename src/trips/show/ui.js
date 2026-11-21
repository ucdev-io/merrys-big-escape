import { EMOTES } from '../../entities/dog.js';

/*
 * 🏆 The dog show's own bits of screen: the big trick buttons in the show ring (the 😀 menu is too slow for a
 * round), and the rosette that pops up when one's won. Their styles come with the trip (and go with it).
 */

const CSS = `
.show-tricks { position: absolute; left: 50%; bottom: calc(12px + var(--sa-b, 0px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; z-index: 6; }
.show-tricks .call { font-size: 30px; background: var(--wash); border: 2px solid rgba(59, 43, 37, 0.3); border-radius: var(--wobbly); padding: 2px 18px 4px; min-width: 150px; text-align: center; transition: transform 0.15s; }
.show-tricks .call.pop { transform: scale(1.18); }
.show-tricks .call.quiet { opacity: 0.6; font-size: 22px; }
.show-tricks .row { display: flex; gap: 8px; pointer-events: auto; }
.show-tricks button { width: 66px; height: 76px; border-radius: var(--wobbly); background: var(--wash); border: 2.5px solid rgba(59, 43, 37, 0.3); font-size: 30px; line-height: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; touch-action: none; padding: 0; position: relative; }
.show-tricks button small { font-size: 13px; margin-top: 4px; }
.show-tricks button kbd { position: absolute; top: 3px; left: 6px; font-family: inherit; font-size: 12px; opacity: 0.55; }
body.touch-mode .show-tricks button kbd { display: none; }
.show-tricks button.down { background: var(--accent); transform: scale(0.94); }
.show-tricks button.good { background: #cfe8b8; }
.show-tricks button.oops { background: #f4d8cf; }
body.show-round .touch .buttons, body.show-round .emote-bar { display: none; }
body.show-round .prompt, body.show-round .stick:not(.active) { display: none; }
.show-tricks .top { display: flex; align-items: center; gap: 8px; }
.show-tricks .score { font-size: 17px; background: var(--wash); border-radius: 12px; padding: 2px 10px; opacity: 0.9; white-space: nowrap; }
@media (max-width: 430px) { .show-tricks button { width: 54px; height: 68px; font-size: 26px; } .show-tricks .row { gap: 5px; } .show-tricks button small { font-size: 11px; } }
@media (max-height: 430px) { .show-tricks button { height: 64px; } .show-tricks .call { font-size: 24px; } }
.rosette-award { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%) scale(0.5) rotate(-12deg); opacity: 0; transition: transform 0.45s cubic-bezier(.3,1.6,.5,1), opacity 0.3s; text-align: center; pointer-events: auto; z-index: 7; cursor: pointer; }
.rosette-award.show { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
.rosette-award.gone { opacity: 0; transform: translate(-50%, -60%) scale(0.8); }
.rosette-award .ros { width: 140px; height: 140px; margin: 0 auto; position: relative; }
.rosette-award .petals { position: absolute; inset: 0; border-radius: 50%; background: repeating-conic-gradient(var(--c) 0deg 9deg, var(--c2) 9deg 18deg); box-shadow: 0 3px 0 rgba(59, 43, 37, 0.25); }
.rosette-award .ring { position: absolute; inset: 15%; border-radius: 50%; background: repeating-conic-gradient(var(--c2) 0deg 12deg, var(--c) 12deg 24deg); }
.rosette-award .mid { position: absolute; inset: 29%; border-radius: 50%; background: #fbf7ee; border: 4px solid #e0b04a; display: flex; align-items: center; justify-content: center; font-size: 25px; font-weight: bold; color: var(--ink); }
.rosette-award .tail { position: absolute; top: 72%; width: 32px; height: 84px; background: var(--c); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%); z-index: -1; }
.rosette-award .tail.l { left: 30%; transform: rotate(16deg); }
.rosette-award .tail.r { right: 30%; transform: rotate(-16deg); }
.rosette-award .words { margin-top: 64px; font-size: 26px; background: var(--wash); border-radius: var(--wobbly); padding: 4px 18px 6px; box-shadow: 0 2px 0 rgba(59, 43, 37, 0.15); }
.rosette-award .words small { display: block; font-size: 18px; opacity: 0.8; }
`;

let style = null;
/** The trip's styles on (true) or off. */
export function showStyles(on) {
  if (on && !style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
  if (!on && style) { style.remove(); style = null; }
}

/** The show ring's tricks (the six emotes): the button's word, and what the judge calls out. */
export const TRICKS = Object.fromEntries(EMOTES.map((e) => [e.id, {
  emoji: e.emoji, short: { bow: 'Bow', spin: 'Spin', sit: 'Sit', roll: 'Roll over', howl: 'Howl', dance: 'Dance' }[e.id],
  call: { bow: 'Take a bow!', spin: 'Spin round!', sit: 'Sit!', roll: 'Roll over!', howl: 'Howl!', dance: 'Dance!' }[e.id],
}]));

export const PLACES = {
  1: { name: '1st', word: 'First place!', c: '#d9534f', c2: '#e8736f' },
  2: { name: '2nd', word: 'Second place!', c: '#5b86c4', c2: '#7aa0d6' },
  3: { name: '3rd', word: 'Third place!', c: '#f2c94c', c2: '#f6da7a' },
  4: { name: '★', word: 'Highly commended!', c: '#6f9a52', c2: '#8db86e' },
};

/** The big trick buttons, and the judge's call over them. onTrick(id) when one's pressed. */
export class TrickBar {
  constructor(root, onTrick) {
    this.el = document.createElement('div');
    this.el.className = 'show-tricks';
    this.el.innerHTML = `<div class="top"><div class="call quiet">Ready?</div><div class="score"></div></div><div class="row">${EMOTES.map((e, i) => `<button data-t="${e.id}"><kbd>${i + 1}</kbd>${e.emoji}<small>${TRICKS[e.id].short}</small></button>`).join('')}</div>`;
    this.call = this.el.querySelector('.call');
    this.scoreEl = this.el.querySelector('.score');
    this.el.addEventListener('pointerdown', (ev) => {
      const b = ev.target.closest('[data-t]');
      if (!b) return;
      ev.preventDefault();
      b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 160);
      onTrick(b.dataset.t);
    });
    root.appendChild(this.el);
    document.body.classList.add('show-round');
  }

  /** The judge calls a trick (html), or a quiet word between ("Ready?"). */
  say(html, quiet = false) {
    this.call.innerHTML = html;
    this.call.classList.toggle('quiet', quiet);
    if (!quiet) { this.call.classList.remove('pop'); void this.call.offsetWidth; this.call.classList.add('pop'); setTimeout(() => this.call.classList.remove('pop'), 180); }
  }

  /** How it's going (e.g. "3/8 · ⭐ 5"). */
  score(text) { if (this.scoreEl.textContent !== text) this.scoreEl.textContent = text; }

  /** A button lights up green (the right trick) or pink (a different one). */
  flash(id, good) {
    const b = this.el.querySelector(`[data-t="${id}"]`);
    if (!b) return;
    b.classList.remove('good', 'oops');
    b.classList.add(good ? 'good' : 'oops');
    setTimeout(() => b.classList.remove('good', 'oops'), 450);
  }

  remove() { this.el.remove(); document.body.classList.remove('show-round'); }
}

/** A rosette pops up: place 1–4 (4: highly commended), words under it. Tap it (or wait) and it goes. */
export function rosetteAward(root, place, head, sub = '') {
  const p = PLACES[place] ?? PLACES[4], el = document.createElement('div');
  el.className = 'rosette-award';
  el.style.setProperty('--c', p.c);
  el.style.setProperty('--c2', p.c2);
  el.innerHTML = `<div class="ros"><div class="tail l"></div><div class="tail r"></div><div class="petals"></div><div class="ring"></div><div class="mid">${p.name}</div></div><div class="words"></div>`;
  const words = el.querySelector('.words');
  words.textContent = head;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; words.appendChild(s); }
  root.querySelector('.rosette-award')?.remove();
  root.appendChild(el);
  void el.offsetWidth;
  el.classList.add('show');
  const go = () => { el.classList.add('gone'); setTimeout(() => el.remove(), 350); };
  const t = setTimeout(go, 3400);
  el.onclick = () => { clearTimeout(t); go(); };
  return el;
}
