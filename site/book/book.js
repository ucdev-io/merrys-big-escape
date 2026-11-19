import { STOPS, SHOTS, TITLE, TAGLINE, ABOUT, IPHONE_TIP } from '../shared/content.js';
import { playButtons, prefersStill, bringMerry, dogSwatches } from '../shared/common.js';

/*
 * "The Sniff Book". A scrapbook lies closed on a desk, with a round window cut in its cover and Merry
 * looking out. Open it, and her window slides over to the left-hand page; every page turn (arrows,
 * swipes, tabs, or the ← → keys) brings a new part of the story on the right, and a new trick from her.
 */
const still = prefersStill();
const PAGES = STOPS.slice(1); // (the welcome is the cover)
const N = PAGES.length;
const TAB_COLS = ['#f2a0b4', '#f6d06a', '#b69be0', '#9cbf6a', '#8fc4d8', '#f08a6a', '#c2d98a', '#f9d98e'];
const CAPS = { garden: 'Home sweet garden', town: 'The neighbourhood', heist: 'Shh… the bakery', woods: 'Conker woods', farm: 'The farm', beach: 'The beach', snow: 'Snow day!' };
const TRICKS = { bow: 'Merry does a play bow', spin: 'Merry chases her tail', sit: 'Merry sits nicely', dance: 'Merry does a happy dance', roll: 'Merry rolls over', howl: 'Merry howls at the sky' };
const narrow = () => matchMedia('(max-width: 760px)').matches;
const $ = (s, r = document) => r.querySelector(s);

const body = document.body, book = $('.book'), spread = $('.spread');
const left = $('.page.left'), content = $('.content'), porthole = $('.porthole');
const coverWin = $('.cover-window'), pageWin = $('.page-window');
$('.cover-title').textContent = TITLE;
$('.cover-tag').textContent = TAGLINE;
let cur = -1, busy = false, stage = null;

// ---------- what goes on each page ----------
function leftParts(p, i, into) {
  into.querySelector('.page-no').textContent = `${p.icon} Page ${i + 1} of ${N}`;
  into.querySelector('.page-title').textContent = p.label === 'Play' ? 'Ready?' : p.label;
  into.querySelector('.caption').textContent = '';
}
function rightPage(p) {
  const el = document.createElement('div');
  el.innerHTML = '<p class="kicker"></p><h3></h3><p class="text"></p>';
  el.querySelector('.kicker').textContent = `${p.icon} ${p.label}`;
  el.querySelector('h3').textContent = p.title;
  el.querySelector('.text').textContent = p.text;
  if (p.shots) {
    const snaps = document.createElement('div');
    snaps.className = 'snaps';
    p.shots.forEach((k, j) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'polaroid';
      b.style.setProperty('--r', `${[-3, 2.5, -1.5][j] ?? 2}deg`);
      b.setAttribute('aria-label', `Bigger picture: ${SHOTS[k].alt}`);
      b.innerHTML = '<img alt="" decoding="async"><span class="cap"></span>';
      b.querySelector('img').src = SHOTS[k].src;
      b.querySelector('.cap').textContent = CAPS[k];
      snaps.appendChild(b);
    });
    el.appendChild(snaps);
  }
  const notes = (list) => list.map(([t, c, r]) => `<span class="note ${c}" style="--r:${r}deg">${t}</span>`).join('');
  if (p.id === 'dogs') {
    const n = document.createElement('div');
    n.className = 'note';
    n.style.setProperty('--r', '-1deg');
    el.appendChild(n);
    dogSwatches(n);
  }
  if (p.id === 'town') el.insertAdjacentHTML('beforeend', notes([['🐶 Gus', '', -2], ['🦔 Pepper', 'pink', 2], ['🐿️ Nut & Meg', 'blue', -1], ['📋 Lost & Found', 'green', 1.5]]));
  if (p.id === 'pack') el.insertAdjacentHTML('beforeend', notes([['🏁 Races', '', -2], ['🦴 Bone Rush', 'pink', 1.5], ['🐦 Pigeon Panic', 'blue', -1], ['🦆 Duck Round-Up', 'green', 2]]));
  if (p.id === 'play') {
    el.insertAdjacentHTML('beforeend', '<a class="stamp" data-play href="/play/"><span class="label">▶ Play the demo</span><small>Free · in your browser</small></a><p class="about"></p><p class="about tip"></p>');
    el.querySelector('.about').textContent = ABOUT;
    el.querySelector('.tip').textContent = IPHONE_TIP;
    playButtons(el);
  }
  return el;
}
function setRight(p) {
  content.replaceChildren(...rightPage(p).childNodes);
  content.scrollTop = 0;
}

// ---------- tabs and pager ----------
const tabs = $('.tabs');
const tabBtns = PAGES.map((p, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = p.icon;
  b.setAttribute('aria-label', p.label);
  b.style.setProperty('--c', TAB_COLS[i % TAB_COLS.length]);
  b.onclick = () => goTo(i);
  tabs.appendChild(b);
  return b;
});
$('.prev').onclick = () => goTo(cur - 1);
$('.next').onclick = () => goTo(cur + 1);
function chrome() {
  tabBtns.forEach((b, i) => (i === cur ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('.prev').disabled = cur <= 0;
  $('.next').disabled = cur >= N - 1;
  $('.count').textContent = `${cur + 1} / ${N}`;
}

// ---------- Merry's window ----------
function place(win, { moving = false, dx = 0 } = {}) {
  const r = win.getBoundingClientRect();
  porthole.classList.toggle('moving', moving && !still);
  porthole.classList.toggle('arch', win === pageWin);
  porthole.style.setProperty('--px', `${r.left + dx}px`);
  porthole.style.setProperty('--py', `${r.top}px`);
  if (moving) setTimeout(() => porthole.classList.remove('moving'), 1100);
}
const placeNow = () => place(cur < 0 ? coverWin : pageWin);
addEventListener('resize', placeNow);
book.addEventListener('transitionend', (e) => { if (e.target === book) placeNow(); }); // (the book slides to the middle as it opens)
placeNow();
document.fonts?.ready.then(placeNow);

function trick(p) {
  const cap = left.querySelector('.caption');
  cap.textContent = '';
  setTimeout(() => {
    stage?.trick(p.trick);
    cap.textContent = TRICKS[p.trick] ?? '';
  }, still ? 0 : 250);
}

// ---------- opening the book, turning pages ----------
function openBook(at = 0, instant = false) {
  if (cur >= 0) return;
  // Where her window will be once the book has slid to the middle (it's shifted while closed).
  const dx = narrow() ? 0 : book.offsetWidth * 0.25;
  cur = at;
  if (instant) { body.classList.add('instant'); setTimeout(() => body.classList.remove('instant'), 50); }
  leftParts(PAGES[at], at, left);
  setRight(PAGES[at]);
  chrome();
  body.classList.remove('closed');
  body.classList.add('open');
  spread.removeAttribute('aria-hidden');
  $('.cover').setAttribute('aria-hidden', 'true');
  place(pageWin, { moving: !instant, dx });
  setTimeout(() => { body.classList.add('opened'); placeNow(); }, instant || still ? 0 : 1150);
  trick(PAGES[at]);
  history.replaceState(null, '', `#${PAGES[at].id}`);
  $('.next').focus({ preventScroll: true });
}
$('.open-book').onclick = () => openBook(0);

function goTo(i) {
  if (cur < 0 || busy || i < 0 || i >= N || i === cur) return;
  const from = cur, p = PAGES[i];
  cur = i;
  chrome();
  history.replaceState(null, '', `#${p.id}`);
  if (still) { leftParts(p, i, left); setRight(p); trick(p); return; }
  busy = true;
  if (narrow()) { // phones: the page flips over and back
    spread.classList.remove('page-swap');
    void spread.offsetWidth;
    spread.classList.add('page-swap');
    setTimeout(() => { leftParts(p, i, left); setRight(p); }, 200);
    setTimeout(() => { spread.classList.remove('page-swap'); busy = false; trick(p); }, 460);
    return;
  }
  // Computers: a real page turns over (a leaf with the old page on one side and the new on the other).
  const leaf = document.createElement('div');
  leaf.className = 'leaf';
  leaf.innerHTML = '<div class="front"><div class="content"></div></div><div class="back"><div class="window"></div><p class="page-no hand"></p><h2 class="page-title"></h2><p class="caption hand"></p></div>';
  const forward = i > from;
  // Forward: the right page (as it was) lifts and lands on the left, showing the new left page.
  // Back: the left page lifts (as it was) and lands on the right, showing the new right page.
  leftParts(forward ? p : PAGES[from], forward ? i : from, leaf.querySelector('.back'));
  leaf.querySelector('.front .content').replaceChildren(...rightPage(forward ? PAGES[from] : p).childNodes);
  if (forward) setRight(p); else leftParts(p, i, left);
  spread.appendChild(leaf);
  const turn = leaf.animate(
    forward ? [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }] : [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }],
    { duration: 850, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
  );
  turn.onfinish = () => {
    if (forward) leftParts(p, i, left); else setRight(p);
    leaf.remove();
    busy = false;
    trick(p);
  };
}

// Keys and swipes.
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && big) return closeBig();
  if (cur < 0 && (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target === body))) { e.preventDefault(); openBook(0); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cur - 1); }
});
let sx = null, sy = 0;
book.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
book.addEventListener('pointerup', (e) => {
  if (sx === null) return;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  sx = null;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
  if (cur < 0) { if (dx < 0) openBook(0); return; }
  goTo(cur + (dx < 0 ? 1 : -1));
});

// ---------- polaroids: tap for a big one ----------
let big = null;
document.addEventListener('click', (e) => {
  if (big) { closeBig(); return; }
  const b = e.target.closest('.polaroid');
  if (!b || b.closest('.leaf')) return;
  const r = b.getBoundingClientRect(), dim = document.createElement('div');
  dim.className = 'dim';
  body.appendChild(dim);
  const ph = document.createElement('div'); // (keeps its place in the page while it's out)
  ph.style.cssText = `width:${r.width}px;height:${r.height}px;flex:none`;
  b.before(ph);
  body.appendChild(b);
  b.classList.add('big');
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  big = { b, r, ph, dim };
  requestAnimationFrame(() => {
    const w = Math.min(innerWidth * 0.94, 1100), h = w * (652 / 1280) + 46;
    b.style.transition = still ? 'none' : 'left 0.35s ease, top 0.35s ease, width 0.35s ease, transform 0.35s ease';
    Object.assign(b.style, { left: `${(innerWidth - w) / 2}px`, top: `${Math.max(10, (innerHeight - h) / 2)}px`, width: `${w}px`, transform: 'rotate(0deg)' });
    dim.classList.add('on');
  });
});
function closeBig() {
  const { b, r, ph, dim } = big;
  big = null;
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, transform: '' });
  dim.classList.remove('on');
  setTimeout(() => { b.classList.remove('big'); b.removeAttribute('style'); b.style.setProperty('--r', '-2deg'); ph.replaceWith(b); dim.remove(); }, still ? 0 : 360);
}

// ---------- Merry ----------
playButtons();
const canvas = $('#merry'), woof = $('.woof');
bringMerry(canvas, { scenery: 'nook', still, view: { at: [0, 0.38, 0], from: [0.32, 0.32, 1.9] } }).then((s) => {
  stage = s;
  if (!s) return;
  window.__stage = s; // (for trying things in the console)
  canvas.addEventListener('painted', () => $('.still', porthole).remove(), { once: true });
  s.onTap(() => {
    woof.hidden = false;
    clearTimeout(woof.t);
    woof.t = setTimeout(() => (woof.hidden = true), 900);
    s.trick(['spin', 'bow', 'dance', 'roll'][Math.floor(Math.random() * 4)]);
  });
});

// Arriving at a page's address (#town…): open straight to it.
const start = PAGES.findIndex((p) => `#${p.id}` === location.hash);
if (start >= 0) openBook(start, true);
