import * as THREE from 'three';
import { ITEMS } from '../entities/items.js';
import { setMuted, isMuted } from '../core/audio.js';
import { toggleFullscreen, isFullscreen, onFullscreenChange, fullscreenButtonUseful } from './fullscreen.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const _v = new THREE.Vector3();

/** All the HTML overlay bits: objective, prompts, speech bubbles, Sniff Book, cards. */
export class HUD {
  constructor(camera) {
    this.camera = camera;
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';

    this.objective = el('div', 'objective');
    this.root.appendChild(this.objective);

    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);

    this.stamina = el('div', 'stamina', '<div class="fill"></div><span>Zoomies!</span>');
    this.root.appendChild(this.stamina);

    this.toast = el('div', 'toast');
    this.root.appendChild(this.toast);

    const tr = el('div', 'top-right');
    this.bookBtn = el('button', 'pill book-btn');
    this.muteBtn = el('button', 'pill', isMuted() ? '🔇' : '🔊');
    this.muteBtn.title = 'Sound on/off';
    this.muteBtn.onclick = () => { setMuted(!isMuted()); this.muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
    this.mischiefPill = el('div', 'pill mischief hidden');
    this.fsBtn = el('button', 'pill fs-btn', '⛶');
    this.fsBtn.title = 'Full screen';
    this.fsBtn.onclick = () => toggleFullscreen(this);
    this.fsBtn.classList.toggle('hidden', !fullscreenButtonUseful());
    onFullscreenChange(() => { this.fsBtn.classList.toggle('active', isFullscreen()); this.fsBtn.title = isFullscreen() ? 'Leave full screen' : 'Full screen'; });
    tr.append(this.mischiefPill, this.bookBtn, this.fsBtn, this.muteBtn);
    this.root.appendChild(tr);

    this.book = el('div', 'sniff-book hidden');
    this.root.appendChild(this.book);
    this.bookBtn.onclick = () => this.toggleBook();
    this.book.onclick = (e) => { if (e.target === this.book || e.target.closest('.close')) this.toggleBook(false); };

    this.card = el('div', 'big-card hidden');
    this.root.appendChild(this.card);

    this.bubbles = [];
    this.floaters = [];
    this.found = [];
    this.places = null;
    this.renderBook();
  }

  setObjective(html, sub = '') {
    this.objective.innerHTML = `<div class="obj-title">Merry's Big Escape</div><div class="obj-text">${html}</div>${sub ? `<div class="obj-sub">${sub}</div>` : ''}`;
    this.objective.classList.remove('pulse');
    void this.objective.offsetWidth;
    this.objective.classList.add('pulse');
  }

  setMischief(n) {
    this.mischiefPill.classList.toggle('hidden', !n);
    this.mischiefPill.textContent = `😈 ${n}`;
    this.mischiefPill.classList.remove('pulse'); void this.mischiefPill.offsetWidth; this.mischiefPill.classList.add('pulse');
  }

  setPrompt(text) {
    if (this.prompt.textContent === (text || '')) return;
    this.prompt.textContent = text || '';
    this.prompt.classList.toggle('show', !!text);
  }

  setStamina(v, active) {
    this.stamina.classList.toggle('show', active || v < 0.98);
    this.stamina.firstChild.style.width = `${Math.round(v * 100)}%`;
  }

  showToast(key) {
    const it = ITEMS[key];
    this.showToastRaw(it.emoji, `You found: <b>${it.name}</b>!`, it.blurb);
  }

  showToastRaw(emoji, head, blurb) {
    this.toast.innerHTML = `<div class="emoji">${emoji}</div><div><div class="t-head">${head}</div><div class="t-blurb">${blurb}</div></div>`;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove('show'), 4200);
  }

  setFound(list, total) {
    this.found = list;
    this.total = total;
    this.bookBtn.innerHTML = `📖 <span class="lbl">Sniff Book</span> <b>${list.filter((k) => k !== 'tunnel').length}/${total}</b>`;
    this.renderBook();
  }

  setPlaces(list) {
    this.places = list;
    const n = list.filter((p) => p.found).length;
    this.bookBtn.innerHTML = `📖 <span class="lbl">Sniff Book</span> <b>${n}/${list.length}</b>`;
    this.renderBook();
  }

  renderBook() {
    if (this.places) {
      this.book.innerHTML = `<div class="page"><button class="close pill">✕</button><h2>Merry's Sniff Book</h2>
        <p class="intro">Places my amazing nose has discovered.</p>
        <div class="slots">${this.places.map((p) => `<div class="slot ${p.found ? 'got' : ''}"><div class="emoji">${p.found ? p.emoji : '❔'}</div><div class="name">${p.found ? p.name : '???'}</div><div class="blurb">${p.found ? p.blurb : 'Somewhere out there… sniff for it!'}</div></div>`).join('')}</div></div>`;
      return;
    }
    const keys = ['duck', 'sock', 'biscuit', 'tunnel'];
    this.book.innerHTML = `<div class="page"><button class="close pill">✕</button><h2>Merry's Sniff Book</h2>
      <p class="intro">Everything my amazing nose has discovered.</p>
      <div class="slots">${keys.map((k) => {
        const got = this.found.includes(k), it = ITEMS[k];
        return `<div class="slot ${got ? 'got' : ''}"><div class="emoji">${got ? it.emoji : '❔'}</div><div class="name">${got ? it.name : '???'}</div><div class="blurb">${got ? it.blurb : 'Still hidden… keep sniffing!'}</div></div>`;
      }).join('')}</div></div>`;
  }

  toggleBook(force) {
    const show = force ?? this.book.classList.contains('hidden');
    this.book.classList.toggle('hidden', !show);
  }

  /** Speech bubble that follows a 3D point. */
  say(text, anchor, dur = 3.5, cls = '') {
    for (const b of this.bubbles) if (b.anchor === anchor) b.t = Math.min(b.t, 0.3);
    const e = el('div', `bubble ${cls}`, text);
    this.root.appendChild(e);
    this.bubbles.push({ e, anchor, t: dur });
  }

  /** Little word that pops up and floats away (WOOF!, sniff sniff…). */
  float(text, pos, cls = '') {
    const e = el('div', `floater ${cls}`, text);
    this.root.appendChild(e);
    this.floaters.push({ e, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  }

  showCard(html, buttons = []) {
    this.card.innerHTML = `<div class="page">${html}<div class="btns"></div></div>`;
    const row = this.card.querySelector('.btns');
    for (const [label, fn] of buttons) { const b = el('button', 'pill big', label); b.onclick = fn; row.appendChild(b); }
    this.card.classList.remove('hidden');
  }
  hideCard() { this.card.classList.add('hidden'); }

  project(p) {
    _v.copy(p).project(this.camera);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
  }

  update(dt) {
    this.bubbles = this.bubbles.filter((b) => {
      b.t -= dt;
      if (b.t <= 0) { b.e.remove(); return false; }
      // Keep bubbles on screen even when the speaker isn't, so the joke is never missed.
      const s = this.project(b.anchor());
      if (s.behind) { s.x = window.innerWidth - s.x; s.y = window.innerHeight * 0.3; }
      const w = b.e.offsetWidth / 2 + 8, h = b.e.offsetHeight + 20;
      const x = Math.min(window.innerWidth - w, Math.max(w, s.x));
      const y = Math.min(window.innerHeight - 10, Math.max(h + 70, s.y));
      b.e.classList.toggle('offscreen', x !== s.x || y !== s.y);
      b.e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      b.e.style.opacity = Math.min(1, b.t * 3);
      return true;
    });
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t > 1.2) { f.e.remove(); return false; }
      const s = this.project(f.pos);
      f.e.style.transform = `translate(${s.x + f.dx * f.t}px, ${s.y - f.t * 60}px) translate(-50%, -100%) scale(${0.8 + Math.min(f.t * 4, 0.4)})`;
      f.e.style.opacity = s.behind ? 0 : 1 - Math.max(0, (f.t - 0.7) / 0.5);
      return true;
    });
  }
}
