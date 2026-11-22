import { STOPS, SHOTS, TAGLINE, ABOUT, IPHONE_TIP, SECRET } from '../shared/content.js';
import { playButtons, prefersStill, bringMerry, dogSwatches } from '../shared/common.js';
import { RELEASES, COMING, versionLine, niceDate } from '../../src/core/releases.js';
import { SOUNDS, TOOLS, soundPage } from '../../src/core/credits.js';

/*
 * "The Walk". The page scrolls as normal (so keys, screen readers and scroll bars all just work), but
 * nothing scrolls up: every screen of scrolling walks Merry one stop further along her garden, and
 * that stop's card slides in from the right as the last one slides off to the left.
 */
const still = prefersStill();
document.body.classList.toggle('still', still);
const journey = document.getElementById('journey'), trail = document.querySelector('.trail');
const tpl = document.getElementById('stop');
const N = STOPS.length;
const playHtml = (big) => `<a class="play" data-play href="/play/"><span class="label">▶ Play the demo</span>${big ? '<small>Free · in your browser</small>' : ''}</a>`;

// ---------- sheets: cards that pop up over the walk (Thanks & credits, What's new) ----------
// While one's up, swipes and the wheel scroll it instead of walking Merry along.
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let sheetOpen = null, sheetFrom = null;
function makeSheet(label, html) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.innerHTML = `<div class="panel">${html}<button type="button" class="close hand">Back to Merry</button></div>`;
  el.querySelector('.close').addEventListener('click', () => showSheet(null));
  el.addEventListener('click', (e) => { if (e.target === el) showSheet(null); }); // a tap outside the card
  document.body.appendChild(el);
  return el;
}
function showSheet(el) {
  if (sheetOpen) sheetOpen.hidden = true;
  if (el && !sheetOpen) sheetFrom = document.activeElement; // (where to go back to afterwards)
  sheetOpen = el;
  // Everything behind a sheet is out of reach while it's up: Tab stays in the sheet (and can't walk Merry off behind it).
  for (const n of document.body.children) if (!n.classList.contains('sheet')) n.inert = !!el;
  if (el) {
    el.hidden = false;
    el.querySelector('.panel').scrollTop = 0;
    el.querySelector('.close').focus({ preventScroll: true });
  } else {
    sheetFrom?.focus?.({ preventScroll: true });
    sheetFrom = null;
  }
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) showSheet(null); });

// Thanks & credits: who recorded the sounds, and the code and font it's built with.
const credits = (() => {
  const link = (url, text, title = '') => `<a href="${url}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</a>`;
  const groups = new Map();
  for (const [, what, title, id, by] of SOUNDS) {
    if (!groups.has(what)) groups.set(what, []);
    groups.get(what).push(link(soundPage(id, by), by, title));
  }
  return makeSheet('Thanks and credits', `<h2 class="hand">Thanks &amp; credits 🙏</h2>` +
    `<p>The real woofs, splashes, crunches, waves and gulls are recordings shared freely (CC0) on ${link('https://freesound.org', 'freesound.org')}. Thank you to:</p>` +
    `<ul>${[...groups].map(([what, who]) => `<li><b>${what[0].toUpperCase() + what.slice(1)}:</b> ${who.join(', ')}</li>`).join('')}</ul>` +
    `<p>Built with:</p><ul>${TOOLS.map(([name, url, lic]) => `<li>${link(url, name)} (${lic})</li>`).join('')}</ul>`);
})();

// What's new: every update so far, newest first (the whole log is kept in src/core/releases.js).
const news = makeSheet('What’s new', `<h2 class="hand">What’s new ✨</h2><p class="news-ver">${esc(versionLine())}</p>` +
  RELEASES.map((r) => `<section class="release"><h3>${esc(r.version)} · ${esc(r.title)} <small>${esc(niceDate(r.date))}</small></h3>` +
    `<ul>${r.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('') +
  `<p class="coming">🐾 ${esc(COMING)}</p>`);

/** Put picture k (a key of SHOTS) on postcard b: the photo, its caption, and what it shows (for screen readers). */
function showShot(b, k) {
  b.dataset.want = k; // (and forget any other picture still on its way: see showShotWhenReady)
  b.querySelector('img').src = SHOTS[k].src;
  b.querySelector('.cap').textContent = SHOTS[k].cap ?? '';
  b.setAttribute('aria-label', `Bigger picture: ${SHOTS[k].alt}`);
}
/** The same, once the picture's arrived: so the photo and its caption change together (‹ › in the big view). */
function showShotWhenReady(b, k) {
  b.dataset.want = k;
  const im = new Image(), put = () => { if (b.dataset.want === k) showShot(b, k); };
  im.onload = im.onerror = put;
  im.src = SHOTS[k].src;
  if (im.complete) put();
}

// ---------- build the stops ----------

const stops = STOPS.map((s, i) => {
  const sec = tpl.content.firstElementChild.cloneNode(true);
  sec.id = s.id;
  sec.dataset.id = s.id;
  sec.setAttribute('aria-label', s.label);
  const card = sec.querySelector('.card');
  if (i === 0) {
    const h1 = document.createElement('h1');
    h1.className = 'title';
    sec.querySelector('.title').replaceWith(h1);
  }
  sec.querySelector('.title').textContent = s.title;
  sec.querySelector('.kicker').textContent = i === 0 || i === N - 1 ? '' : `${s.icon} ${s.label}`;
  sec.querySelector('.text').textContent = s.text;
  const extra = sec.querySelector('.extra');
  if (s.id === 'hello') {
    const tag = document.createElement('p');
    tag.className = 'tagline';
    tag.textContent = TAGLINE;
    sec.querySelector('.title').after(tag);
    extra.innerHTML = `${playHtml(true)}<p class="beta-line"><span class="beta"></span> <a class="news-link" href="#play">What’s new?</a></p>`;
    extra.querySelector('.beta').textContent = versionLine();
  }
  if (s.id === 'dogs') { extra.className += ' dogs'; dogSwatches(extra); }
  if (s.id === 'play') {
    // What's new: the newest update's name, and a tap for every update so far (in a pop-up, so the card never overflows).
    extra.innerHTML = `${playHtml(true)}<button type="button" class="news-btn"><span class="beta"></span> <span class="all">Every update so far ›</span></button><p class="about coming"></p><p class="about made"></p><p class="about tip"></p><p class="about secret"></p><button type="button" class="credits-link">🙏 Thanks &amp; credits</button>`;
    const r = RELEASES[0];
    extra.querySelector('.news-btn .beta').textContent = `✨ New in ${r.version}: ${r.title}`;
    extra.querySelector('.news-btn').addEventListener('click', () => showSheet(news));
    extra.querySelector('.credits-link').addEventListener('click', () => showSheet(credits));
    extra.querySelector('.coming').textContent = `🐾 ${COMING}`;
    extra.querySelector('.made').textContent = ABOUT;
    extra.querySelector('.tip').textContent = IPHONE_TIP;
    extra.querySelector('.secret').textContent = SECRET;
  }
  // Postcards: scattered a little differently on each stop. Three at most; the rest are in the big view (‹ ›).
  const pc = sec.querySelector('.cards'), all = s.shots ?? [], shown = all.slice(0, 3);
  shown.forEach((k, j) => {
    const b = document.createElement('button');
    b.className = 'postcard';
    b.type = 'button';
    const spread = shown.length > 1;
    b.style.setProperty('--l', spread ? `${4 + j * (shown.length === 2 ? 38 : 24)}%` : '14%');
    b.style.setProperty('--t', spread ? `${6 + (j % 2) * 26}%` : '12%');
    b.dataset.r = (spread ? [-6, 4, -2][j] : (i % 2 ? 3 : -3)).toString();
    b.dataset.k = (1.25 + j * 0.2).toString(); // (parallax: further postcards move faster)
    b.dataset.stop = String(i);
    b.dataset.at = String(j);
    b.innerHTML = `<img alt="" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async"><span class="cap"></span>`;
    showShot(b, k);
    pc.appendChild(b);
  });
  if (all.length > shown.length) { // "+3 more": opens the big view on the first one not pinned up
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more-shots hand';
    more.dataset.stop = String(i);
    const n = all.length - shown.length, last = pc.lastElementChild;
    more.textContent = `+${n} more 📷`;
    more.setAttribute('aria-label', n === 1 ? '1 more picture' : `${n} more pictures`);
    more.style.setProperty('--l', last.style.getPropertyValue('--l')); // (tucked under the corner of the last postcard)
    more.style.setProperty('--t', last.style.getPropertyValue('--t'));
    pc.appendChild(more);
  }
  journey.appendChild(sec);
  // A paw on the trail for each stop.
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.textContent = s.icon;
  dot.setAttribute('aria-label', s.label);
  dot.onclick = () => go(i);
  trail.appendChild(dot);
  return { s, sec, card, dot, posts: [...pc.querySelectorAll('.postcard')] };
});
playButtons();
// (The little Play button at the top is just ▶ on a narrow phone: it keeps its words for screen readers.)
const mini = document.querySelector('.mini-play'), miniSays = mini?.querySelector('.label').textContent;
mini?.setAttribute('aria-label', miniSays === 'Play' ? 'Play the demo' : miniSays);

// ---------- where we are ----------
const H = () => stops[0].sec.offsetHeight || innerHeight;
const go = (i) => { i = Math.max(0, Math.min(N - 1, i)); scrollTo({ top: i * H(), behavior: still ? 'auto' : 'smooth' }); };
// "What's new?" (under the first Play button): every update so far.
document.querySelector('.news-link')?.addEventListener('click', (e) => { e.preventDefault(); showSheet(news); });
addEventListener('keydown', (e) => {
  if (sheetOpen || e.target.closest?.('input, textarea')) return;
  if (open && open.all.length > 1) { // a big postcard: the arrows go through that stop's pictures (just one? they walk on)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
    return;
  }
  if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(scrollY / H()) + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(scrollY / H()) - 1); }
});
// A mouse wheel or trackpad: one gesture, one stop (a whole gesture, inertia and all, counts once).
// Trackpads can go sideways too: two fingers to the left goes on, like turning a page.
let wheelUntil = 0;
addEventListener('wheel', (e) => {
  if (e.ctrlKey || open || sheetOpen) return;
  e.preventDefault();
  const now = performance.now(), d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (now < wheelUntil) { wheelUntil = Math.max(wheelUntil, now + 220); return; }
  if (Math.abs(d) < 3) return;
  go(Math.round(scrollY / H()) + Math.sign(d));
  wheelUntil = now + 700;
}, { passive: false });

// Touch: the walk follows your finger, whichever way you swipe. Left or up goes on, right or down
// goes back (the card moves with your finger, like a page). A swipe that's mostly sideways counts as
// sideways however much it drifts up or down, and the other way round. Let go a quarter of the way
// along, or flick, to go to the next stop; less, and it settles back. Two fingers still zoom.
const root = document.documentElement;
let drag = null, settleT = 0;
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || !e.isPrimary || open || sheetOpen) return;
  clearTimeout(settleT);
  drag = { x: e.clientX, y: e.clientY, y0: scrollY, axis: null, moved: 0, t: performance.now(), vt: performance.now(), vm: 0, v: 0 };
}, { passive: true });
addEventListener('pointermove', (e) => {
  if (!drag || !e.isPrimary) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.axis) {
    if (Math.hypot(dx, dy) < 10) return; // (not a swipe yet: maybe a tap)
    drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    root.classList.add('dragging');
  }
  // How far along, in stops: a screen's width sideways, or a screen's height up or down, is one stop.
  const moved = drag.axis === 'x' ? -dx / innerWidth : -dy / innerHeight, now = performance.now();
  drag.v = (moved - drag.vm) / Math.max(0.008, (now - drag.vt) / 1000);
  drag.vm = moved; drag.vt = now; drag.moved = moved;
  const top = Math.max(0, Math.min((N - 1) * H(), drag.y0 + moved * H()));
  scrollTo({ top, behavior: 'instant' });
}, { passive: true });
// (iPhones: stop the page scrolling under the finger. One finger only, so pinching still zooms.)
addEventListener('touchmove', (e) => { if (e.touches.length === 1 && !open && !sheetOpen) e.preventDefault(); }, { passive: false });
function endDrag(e) {
  if (!drag || !e.isPrimary) return;
  const d = drag;
  drag = null;
  if (!d.axis) return; // a tap
  const from = Math.round(d.y0 / H());
  const flick = Math.abs(d.v) > 0.8 && Math.abs(d.moved) > 0.04 && Math.sign(d.v) === Math.sign(d.moved);
  const step = Math.abs(d.moved) > 0.25 || flick ? Math.sign(d.moved) : 0;
  go(from + step);
  // (snapping stays off until she's arrived, so the page doesn't jump to the nearest stop first)
  settleT = setTimeout(() => root.classList.remove('dragging'), still ? 50 : 750);
}
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
// Tabbing into a card that isn't in front: walk there.
document.addEventListener('focusin', (e) => {
  const i = stops.findIndex((t) => t.sec.contains(e.target));
  if (i >= 0 && Math.abs(scrollY / H() - i) > 0.1) go(i);
});

// ---------- Merry ----------
const canvas = document.getElementById('merry'), woof = document.querySelector('.woof');
let stage = null;
const portrait = () => innerWidth / innerHeight < 0.9;
function frameMerry() {
  if (!stage) return;
  // Merry low on the screen, under the cards; on a tall phone, lower still and a little further off.
  if (portrait()) stage.frame({ at: [-0.02, 1.2, 0], from: [0, 0.45, 4.9], fit: false });
  else if (innerHeight < 520) stage.frame({ at: [-0.85, 0.85, 0], from: [0, 0.4, 4.3], fit: false }); // (phones sideways: Merry on the right, words on the left)
  else stage.frame({ at: [0.45, 0.98, 0], from: [0, 0.75, 4.3] });
}
bringMerry(canvas, { scenery: 'walk', still }).then((s) => {
  stage = s;
  if (!s) return;
  window.__stage = s; // (for trying things in the console)
  frameMerry();
  addEventListener('resize', frameMerry);
  s.onTap(() => {
    const p = s.headScreen();
    woof.style.left = `${p.x}px`;
    woof.style.top = `${p.y}px`;
    woof.hidden = false;
    clearTimeout(woof.t);
    woof.t = setTimeout(() => (woof.hidden = true), 900);
    if (s.speed < 0.3) s.trick(['spin', 'bow', 'dance', 'roll'][Math.floor(Math.random() * 4)]);
  });
});

// ---------- the frame loop: cards slide, Merry walks ----------
let lastY = scrollY, lastT = performance.now(), vel = 0, calm = 0, arrived = -1, here = -1;
function tick(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000) || 0.016;
  lastT = now;
  const h = H(), p = scrollY / h;
  const v = (scrollY - lastY) / h / dt; // stops a second
  lastY = scrollY;
  vel += (v - vel) * (1 - Math.exp(-dt * 10));
  const W = innerWidth;
  for (let i = 0; i < N; i++) {
    const { card, posts } = stops[i], d = i - p, ad = Math.abs(d);
    if (ad >= 1.05) { card.style.setProperty('--v', 'hidden'); card.style.setProperty('--o', '0'); continue; }
    card.style.setProperty('--v', 'visible');
    if (still) {
      card.style.setProperty('--x', '0px');
      card.style.setProperty('--o', ad < 0.5 ? '1' : '0');
    } else {
      card.style.setProperty('--x', `${(d * W * 0.85).toFixed(1)}px`);
      card.style.setProperty('--o', Math.max(0, 1 - Math.max(0, ad - 0.15) * 1.6).toFixed(3));
      for (const b of posts) {
        if (b.classList.contains('big')) continue;
        const k = Number(b.dataset.k), swing = Math.max(-9, Math.min(9, -vel * 6));
        b.style.setProperty('--px', `${(d * W * (k - 1) * 0.85).toFixed(1)}px`);
        b.style.setProperty('--r', `${(Number(b.dataset.r) + swing).toFixed(2)}deg`);
      }
    }
    card.classList.toggle('here', ad < 0.5);
  }
  const k = Math.round(p);
  if (k !== here) {
    here = k;
    stops.forEach((t, i) => (i === k ? t.dot.setAttribute('aria-current', 'step') : t.dot.removeAttribute('aria-current')));
  }
  document.body.classList.toggle('walked', p > 0.08);
  // Merry: a screen of scrolling is about 9 metres of garden.
  stage?.setPace(vel * 9);
  // Settled at a stop: she does that stop's trick (once per visit).
  calm = Math.abs(vel) < 0.04 && Math.abs(p - k) < 0.02 ? calm + dt : 0;
  if (calm > 0.5 && arrived !== k) { arrived = k; if (stage && k > 0) setTimeout(() => stage.trick(STOPS[k].trick), 150); }
  if (Math.abs(p - k) > 0.3) arrived = arrived === k ? arrived : -1;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- postcards: tap for a big one (‹ › go through all that stop's pictures) ----------
let open = null, landing = null; // landing: a postcard on its way back down to its place, { b, t }
const nav = document.createElement('div');
nav.className = 'shot-nav';
nav.hidden = true;
nav.innerHTML = '<button type="button" class="prev" aria-label="Previous picture">‹</button><span class="count" aria-live="polite"></span><button type="button" class="next" aria-label="Next picture">›</button>';
document.body.appendChild(nav);
nav.querySelector('.prev').addEventListener('click', () => step(-1));
nav.querySelector('.next').addEventListener('click', () => step(1));
const count = () => { nav.querySelector('.count').textContent = `${open.at + 1} / ${open.all.length}`; };
function step(d) {
  if (!open || open.all.length < 2) return;
  open.at = (open.at + d + open.all.length) % open.all.length;
  showShotWhenReady(open.b, open.all[open.at]);
  count();
}
/** Put a postcard that's still flying home straight back in its place (a quick second tap mustn't catch it mid-air). */
function land() {
  if (!landing) return;
  const { b, t } = landing;
  landing = null;
  clearTimeout(t);
  b.classList.remove('big'); b.style.transition = ''; b.style.left = b.style.top = b.style.width = '';
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.shot-nav')) return;
  if (open) { close(); return; }
  const more = e.target.closest('.more-shots');
  const b = more ? stops[Number(more.dataset.stop)].posts.at(-1) : e.target.closest('.postcard');
  if (!b) return;
  land();
  const all = stops[Number(b.dataset.stop)].s.shots, at = more ? stops[Number(more.dataset.stop)].posts.length : Number(b.dataset.at);
  if (more) showShot(b, all[at]);
  for (const k of all) new Image().src = SHOTS[k].src; // (the rest of this stop's pictures, on their way for ‹ ›)
  // As big as fits: the screen's width, or its height less the ‹ › bar (when there is one), whichever's smaller.
  const navH = all.length > 1 ? 68 : 0, room = innerHeight - 24 - navH;
  const w = Math.min(innerWidth * 0.92, 1100, (room - 48) * (1280 / 652)), h = w * (652 / 1280) + 48;
  const r = b.getBoundingClientRect();
  b.classList.add('big');
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  b.style.setProperty('--px', '0px');
  open = { b, r, all, at };
  if (all.length > 1) { nav.hidden = false; count(); nav.querySelector('.next').focus({ preventScroll: true }); }
  requestAnimationFrame(() => {
    b.style.transition = still ? 'none' : 'left 0.35s ease, top 0.35s ease, width 0.35s ease, transform 0.35s ease';
    Object.assign(b.style, { left: `${(innerWidth - w) / 2}px`, top: `${Math.max(12, 12 + (room - h) / 2)}px`, width: `${w}px` });
    b.style.setProperty('--r', '0deg');
  });
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
addEventListener('scroll', () => open && close({ refocus: false }), { passive: true }); // (walked off: don't pull focus back here)
/** Back down to its place, showing its own picture again (the arrows' focus goes back to it, for keyboards). */
function close({ refocus = true } = {}) {
  const { b, r, all } = open;
  open = null;
  const keys = nav.contains(document.activeElement);
  nav.hidden = true;
  showShot(b, all[Number(b.dataset.at)]);
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  landing = { b, t: setTimeout(land, still ? 0 : 360) };
  if (refocus && keys) b.focus({ preventScroll: true });
}
