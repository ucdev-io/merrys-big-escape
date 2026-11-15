import * as THREE from 'three';
import { ITEMS } from '../entities/items.js';
import { setMuted, isMuted } from '../core/audio.js';
import { toggleFullscreen, isFullscreen, fullscreenButtonUseful, isTouchDevice } from './fullscreen.js';
import { getSettings, setSetting, TEXTURE_NAMES } from '../core/settings.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const _v = new THREE.Vector3();

/** All the HTML overlay bits: objective, prompts, speech bubbles, Sniff Book, cards. */
export class HUD {
  constructor(camera) {
    this.camera = camera;
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';

    // Current goal: pops open when it changes, then tucks away into a small icon. Tap to see it again.
    this.objective = el('button', 'objective');
    this.objective.onclick = () => this.expandObjective(this.objective.classList.contains('open') ? 0 : 9000);
    this.root.appendChild(this.objective);

    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);

    this.stamina = el('div', 'stamina', '<div class="fill"></div><span>Zoomies!</span>');
    this.root.appendChild(this.stamina);

    this.toast = el('div', 'toast');
    this.root.appendChild(this.toast);

    const tr = el('div', 'top-right');
    this.bookBtn = el('button', 'pill book-btn');
    this.mischiefPill = el('div', 'pill mischief hidden');
    // One menu for everything that isn't playing: help, full screen, sound, vibration, title.
    this.menuBtn = el('button', 'pill menu-btn', '☰');
    this.menuBtn.title = 'Menu';
    this.menuBtn.onclick = () => this.openMenu();
    if (getSettings().muted) setMuted(true);
    tr.append(this.mischiefPill, this.bookBtn, this.menuBtn);
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

  /**
   * @param html   the goal, e.g. "Sniff out buried treasure!"
   * @param sub    extra detail shown when open
   * @param icon   shown when tucked away
   * @param short  tiny progress next to the icon, e.g. "2/4"
   */
  setObjective(html, sub = '', { icon = '🎯', short = '' } = {}) {
    const changed = html !== this._objHtml;
    this._objHtml = html;
    this.objective.innerHTML = `<span class="obj-icon">${icon}</span><span class="obj-short">${short}</span>`
      + `<span class="obj-body"><span class="obj-text">${html}</span>${sub ? `<span class="obj-sub">${sub}</span>` : ''}</span>`;
    if (changed) this.expandObjective(5500);
  }

  expandObjective(ms) {
    clearTimeout(this._objT);
    if (!ms) { this.objective.classList.remove('open'); return; }
    this.objective.classList.add('open');
    this.objective.classList.remove('pulse');
    void this.objective.offsetWidth;
    this.objective.classList.add('pulse');
    this._objT = setTimeout(() => this.objective.classList.remove('open'), ms);
  }

  openMenu() {
    this.showCard('<h1>Menu</h1><div class="menu-list"></div>', [['Close', () => this.hideCard()]]);
    const list = this.card.querySelector('.menu-list');
    const item = (label, fn) => { const b = el('button', 'pill big menu-item'); b.textContent = label; b.onclick = fn; list.appendChild(b); return b; };
    item('❓ How to play', () => this.showHelp());
    if (fullscreenButtonUseful()) item(isFullscreen() ? '⛶ Leave full screen' : '⛶ Full screen', () => { this.hideCard(); toggleFullscreen(this); });
    const sound = item(isMuted() ? '🔇 Sound: off' : '🔊 Sound: on', () => {
      setMuted(!isMuted());
      setSetting('muted', isMuted());
      sound.textContent = isMuted() ? '🔇 Sound: off' : '🔊 Sound: on';
    });
    if (navigator.vibrate) {
      const vib = item(getSettings().haptics ? '📳 Vibration: on' : '📴 Vibration: off', () => {
        setSetting('haptics', !getSettings().haptics);
        vib.textContent = getSettings().haptics ? '📳 Vibration: on' : '📴 Vibration: off';
      });
    }
    const levels = Object.keys(TEXTURE_NAMES);
    const tex = item(`🎨 Paint texture: ${TEXTURE_NAMES[getSettings().texture] ?? 'Light'}`, () => {
      const next = levels[(levels.indexOf(getSettings().texture) + 1) % levels.length];
      setSetting('texture', next);
      tex.textContent = `🎨 Paint texture: ${TEXTURE_NAMES[next]}`;
      this.onTexture?.(next);
    });
    item('🏠 Back to the title', () => { location.href = '/'; });
  }

  showHelp() {
    const keys = `<h3>⌨️ Keyboard</h3><p class="help-keys"><b>WASD</b> or arrows: walk · <b>Shift</b>: zoomies · <b>Space</b>: jump<br>
      hold <b>F</b>: sniff · <b>E</b>: dig · <b>Q</b>: woof · drag the mouse to look · scroll to zoom</p>`;
    const touch = `<h3>📱 Touch</h3><p class="help-keys">Drag on the <b>left</b> to walk (push far for zoomies) · drag on the <b>right</b> to look · pinch to zoom<br>
      🦘 Jump · hold 👃 Sniff · 🐾 Dig · 🗣️ Woof · hold 💨 Zoom</p>`;
    this.showCard(`<h1>How to play</h1>${isTouchDevice() ? touch + keys : keys + touch}
      <h3>🐾 Tips</h3><ul class="help-tips">
        <li><b>Sniff</b> to see a golden trail to where you're going.</li>
        <li>Too high? Find a crate, bench or car to climb. Pink-ringed bones need a <b>friend's back</b>!</li>
        <li>Flowerbeds, holes and bins are great fun\u2026 but the neighbours will shout.</li>
        <li>Water is for paddling. Expect a wet-dog shake.</li>
        <li>Friends on the same Wi-Fi show up in <b>Friends playing now</b> \u2014 tap to join.</li>
      </ul>`, [['Back', () => this.openMenu()], ['Close', () => this.hideCard()]]);
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
