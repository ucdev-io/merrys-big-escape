import { STOPS, SHOTS, TAGLINE, ABOUT, IPHONE_TIP } from '../shared/content.js';
import { playButtons, prefersStill, bringMerry, dogSwatches } from '../shared/common.js';

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
    extra.innerHTML = playHtml(true);
  }
  if (s.id === 'dogs') { extra.className += ' dogs'; dogSwatches(extra); }
  if (s.id === 'play') {
    extra.innerHTML = `${playHtml(true)}<p class="about"></p><p class="about tip"></p>`;
    extra.querySelector('.about').textContent = ABOUT;
    extra.querySelector('.tip').textContent = IPHONE_TIP;
  }
  // Postcards: scattered a little differently on each stop.
  const pc = sec.querySelector('.cards');
  (s.shots ?? []).forEach((k, j, all) => {
    const b = document.createElement('button');
    b.className = 'postcard';
    b.type = 'button';
    b.setAttribute('aria-label', `Bigger picture: ${SHOTS[k].alt}`);
    const spread = all.length > 1;
    b.style.setProperty('--l', spread ? `${4 + j * 24}%` : '14%');
    b.style.setProperty('--t', spread ? `${6 + (j % 2) * 26}%` : '12%');
    b.dataset.r = (spread ? [-6, 4, -2][j] : (i % 2 ? 3 : -3)).toString();
    b.dataset.k = (1.25 + j * 0.2).toString(); // (parallax: further postcards move faster)
    b.innerHTML = `<img alt="" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async"><span class="cap"></span>`;
    b.querySelector('img').src = SHOTS[k].src;
    b.querySelector('.cap').textContent = { garden: 'Home sweet garden', town: 'The neighbourhood', heist: 'Shh… the bakery', woods: 'Conker woods', farm: 'The farm', beach: 'The beach', snow: 'Snow day!' }[k] ?? '';
    pc.appendChild(b);
  });
  journey.appendChild(sec);
  // A paw on the trail for each stop.
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.textContent = s.icon;
  dot.setAttribute('aria-label', s.label);
  dot.onclick = () => go(i);
  trail.appendChild(dot);
  return { s, sec, card, dot, posts: [...pc.children] };
});
playButtons();

// ---------- where we are ----------
const H = () => stops[0].sec.offsetHeight || innerHeight;
const go = (i) => { i = Math.max(0, Math.min(N - 1, i)); scrollTo({ top: i * H(), behavior: still ? 'auto' : 'smooth' }); };
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(scrollY / H()) + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(scrollY / H()) - 1); }
});
// A mouse wheel or trackpad: one gesture, one stop (a whole gesture, inertia and all, counts once).
let wheelUntil = 0;
addEventListener('wheel', (e) => {
  if (e.ctrlKey || open || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  e.preventDefault();
  const now = performance.now();
  if (now < wheelUntil) { wheelUntil = Math.max(wheelUntil, now + 220); return; }
  if (Math.abs(e.deltaY) < 3) return;
  go(Math.round(scrollY / H()) + Math.sign(e.deltaY));
  wheelUntil = now + 700;
}, { passive: false });
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
  if (portrait()) stage.frame({ at: [0.25, 1.2, 0], from: [0, 0.45, 4.9], fit: false });
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

// ---------- postcards: tap for a big one ----------
let open = null;
document.addEventListener('click', (e) => {
  const b = e.target.closest('.postcard');
  if (open) { close(); return; }
  if (!b) return;
  const r = b.getBoundingClientRect();
  const w = Math.min(innerWidth * 0.92, 1100), h = w * (652 / 1280) + 48;
  b.classList.add('big');
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  b.style.setProperty('--px', '0px');
  open = { b, r };
  requestAnimationFrame(() => {
    b.style.transition = still ? 'none' : 'left 0.35s ease, top 0.35s ease, width 0.35s ease, transform 0.35s ease';
    Object.assign(b.style, { left: `${(innerWidth - w) / 2}px`, top: `${Math.max(12, (innerHeight - h) / 2)}px`, width: `${w}px` });
    b.style.setProperty('--r', '0deg');
  });
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
addEventListener('scroll', () => open && close(), { passive: true });
function close() {
  const { b, r } = open;
  open = null;
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  setTimeout(() => { b.classList.remove('big'); b.style.transition = ''; b.style.left = b.style.top = b.style.width = ''; }, still ? 0 : 360);
}
