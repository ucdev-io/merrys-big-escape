import { unlockAudio } from '../../core/audio.js';
import { music } from '../../core/music.js';
import { FIELD, newGame, refit, update } from './play.js';
import { draw, drawHud } from './draw.js';
import { snd } from './sound.js';
import { SIRIUS } from './sky.js';
import './dogstar.css';

/*
 * ✦ Dog Star: a secret line-art space shooter, hidden in Merry's Big Escape (see ../secret.js for how it's found).
 * It plays full screen over whatever was going on, and leaves it just as it was: the dog sits still, the game's
 * keys are its own while it's open, and the music switches to its own tune and back.
 *
 *   Fly: drag a finger anywhere (the ship moves as your finger moves) · the mouse (it flies to the pointer) ·
 *        arrows / WASD. You fire where you fly.
 *   Howl: tap 🌕 · Space · a click. Pause: ‖ · Esc · P.
 *
 * Best score and stars lit are kept on this device (merry.dogstar.v1).
 */
const KEY = 'merry.dogstar.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const keep = (d) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...d })); } catch { /* private mode */ } };

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Open Dog Star. player: the dog to hold still meanwhile (optional). onEnd({ score, wave, lit, best, newBest }):
 * after each game. onClose: when it's closed.
 */
export function playDogStar({ player = null, onEnd = null, onClose = null } = {}) {
  unlockAudio();
  const saved = load();
  if (!saved.found) keep({ found: Date.now() });
  let best = saved.best ?? 0, bestLit = saved.lit ?? 0;

  const el = document.createElement('div');
  el.className = 'dog-star';
  el.innerHTML = `<canvas></canvas>
    <button class="ds-btn ds-pause" aria-label="Pause" tabindex="-1">❚❚</button>
    <button class="ds-btn ds-howl" aria-label="Howl" tabindex="-1">🌕</button>
    <div class="ds-panel"></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), c = cv.getContext('2d');
  const panel = el.querySelector('.ds-panel'), pauseBtn = el.querySelector('.ds-pause'), howlBtn = el.querySelector('.ds-howl');
  const touch = matchMedia('(pointer: coarse)').matches;
  el.classList.toggle('ds-touch', touch);

  // Hold the dog still, and swap the music for ours.
  const froze = !!player && !player.frozen;
  if (froze) { player.frozen = true; player.vel?.set?.(0, 0); }
  const tune = music.theme, ambient = { ...music.ambient };
  if (tune) music.play('dogstar');
  music.setAmbient({ birds: 0, frogs: 0, drips: 0 });

  // ---- the screen ----
  let dpr = 1, w = 0, h = 0, scale = 1, safe = { t: 0, r: 0, b: 0, l: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  el.appendChild(probe);
  const field = () => { const k = Math.min(w, h) / FIELD; return { W: w / k, H: h / k, k }; };
  function fit() {
    w = innerWidth; h = innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const cs = getComputedStyle(probe);
    safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const F = field();
    scale = F.k * dpr;
    if (G) refit(G, F.W, F.H);
  }
  let G = null;
  fit();
  const fresh = (demo) => { const F = field(); return newGame(F.W, F.H, demo ? { demo, lit: bestLit } : {}); };
  G = fresh(true);

  // ---- what's on screen: 'title' (the show), 'play', 'paused', 'over' ----
  let mode = 'title', overShown = false;
  function show(html, buttons) {
    panel.innerHTML = `<div class="ds-card">${html}<div class="ds-btns"></div></div>`;
    const row = panel.querySelector('.ds-btns');
    for (const [label, fn, cls = ''] of buttons) {
      const b = document.createElement('button');
      b.className = `ds-big ${cls}`; b.innerHTML = label;
      b.onclick = (e) => { e.stopPropagation(); snd.blip(); fn(); };
      row.appendChild(b);
    }
    panel.classList.add('on');
    el.classList.add('menu');
    row.querySelector('button')?.focus({ preventScroll: true });
  }
  const hide = () => { panel.classList.remove('on'); el.classList.remove('menu'); panel.innerHTML = ''; document.activeElement?.blur?.(); };
  const how = touch
    ? '<p>Drag anywhere to fly. <b>You fire where you fly.</b></p><p>Loop your <b class="gold">tail</b> right round shapes to round them up whole: more in one loop, more points.</p><p>Every hit knocks a side off. Stardust fills your 🌕 howl.</p>'
    : '<p><b>Mouse</b>, <b>arrows</b> or <b>WASD</b> to fly. <b>You fire where you fly.</b></p><p>Loop your <b class="gold">tail</b> right round shapes to round them up whole: more in one loop, more points.</p><p>Every hit knocks a side off. Stardust fills your howl (<b>Space</b> or <b>click</b>). <b>Esc</b> pauses.</p>';

  function title() {
    mode = 'title';
    G = fresh(true);
    el.classList.remove('playing');
    show(`<h1 class="ds-logo">✦ DOG STAR ✦</h1>
      <p class="ds-sub">a secret from the night sky</p>
      ${how}
      <p class="ds-shapes"><span><i style="color:#ff4fa3">▲</i> darts</span> <span><i style="color:#3fe0ff">■</i> bounces</span> <span><i style="color:#ffb43f">⬟</i> spits</span> <span><i style="color:#8dff5a">⬢</i> hatches</span></p>
      <p class="ds-goal">Clear waves to light up the Big Dog, star by star. The tenth is <b>Sirius</b>.</p>
      ${best ? `<p class="ds-best">Best ${best} · ★ ${bestLit}/${SIRIUS}</p>` : ''}`,
    [['▶ Fly!', start, 'go'], ['Leave', close]]);
  }
  function start() {
    mode = 'play'; overShown = false;
    G = fresh(false);
    hide();
    el.classList.add('playing');
  }
  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    G.shake = 0;
    keys.clear();
    show(`<h1>Paused</h1><p class="ds-best">${G.score} points · wave ${G.wave} · ★ ${G.lit}/${SIRIUS}</p>`, [['▶ Carry on', resume, 'go'], ['Start again', start], ['Leave', close]]);
  }
  function resume() { if (mode !== 'paused') return; mode = 'play'; hide(); last = performance.now(); }
  function gameOver() {
    overShown = true;
    const newBest = G.score > best;
    if (newBest) best = G.score;
    bestLit = Math.max(bestLit, G.lit);
    keep({ best, lit: bestLit, plays: (load().plays ?? 0) + 1 });
    onEnd?.({ score: G.score, wave: G.wave, lit: G.lit, best, newBest });
    const cheer = G.lit >= SIRIUS ? 'You lit the Dog Star!' : G.lit ? `${G.lit} star${G.lit === 1 ? '' : 's'} of the Big Dog lit` : 'The Big Dog waits…';
    show(`<h1>${newBest && G.score ? 'A new best!' : 'Good try!'}</h1>
      <p class="ds-score">${G.score}</p>
      <p class="ds-best">wave ${G.wave} · biggest round-up ×${G.caughtMost} · best ${best}</p>
      <p class="ds-goal">★ ${esc(cheer)}</p>`,
    [['▶ Again!', start, 'go'], ['Leave', close]]);
  }

  // ---- controls ----
  const keys = new Set();
  let target = null, drag = { x: 0, y: 0 }, dragId = null, dragAt = null, howlNow = false;
  const toWorld = (e) => ({ x: (e.clientX / w) * G.W, y: (e.clientY / h) * G.H });
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Escape', 'KeyP', 'Enter'];
  // (Caught on the way down, before the game's own keys see it, so the dog doesn't walk off underneath.)
  const onKeyDown = (e) => {
    if (!el.isConnected) return;
    e.stopPropagation();
    unlockAudio();
    if (panel.contains(e.target) && (e.code === 'Space' || e.code === 'Enter')) return; // (pressing a menu button)
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (mode === 'title' && (e.code === 'Space' || e.code === 'Enter')) start();
    else if (mode === 'title' && e.code === 'Escape') close();
    else if (mode === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP') pause();
      else if (e.code === 'Space') howlNow = true;
      if (/^(Arrow|Key[WASD])/.test(e.code)) target = null;
    } else if (mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
    else if (mode === 'over' && overShown && e.code === 'Escape') close();
  };
  const onKeyUp = (e) => keys.delete(e.code); // (let it carry on to the game too, so its keys don't stick down)
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    if (mode === 'title') return; // (the show: buttons only)
    if (mode !== 'play') return;
    if (e.pointerType === 'mouse') { if (e.button === 0 || e.button === 2) howlNow = true; target = toWorld(e); return; }
    if (dragId === null) { dragId = e.pointerId; dragAt = { x: e.clientX, y: e.clientY }; cv.setPointerCapture?.(e.pointerId); }
    else howlNow = true; // (a second finger: howl)
  });
  cv.addEventListener('pointermove', (e) => {
    if (mode !== 'play') return;
    if (e.pointerType === 'mouse') { target = toWorld(e); return; }
    if (e.pointerId !== dragId) return;
    const k = 1.35 * (G.W / w); // (a finger's move, a bit further: you can cross the screen without running out of glass)
    drag.x += (e.clientX - dragAt.x) * k; drag.y += (e.clientY - dragAt.y) * k;
    dragAt = { x: e.clientX, y: e.clientY };
  });
  const lift = (e) => { if (e.pointerId === dragId) { dragId = null; dragAt = null; } };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('mouseleave', () => (target = null));
  pauseBtn.onclick = (e) => { e.stopPropagation(); pause(); };
  howlBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); howlNow = true; });

  const onResize = () => fit();
  const onHide = () => { if (document.hidden) pause(); };
  const onBlur = () => { keys.clear(); pause(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onHide);

  // ---- every frame ----
  let last = performance.now(), slow = 0, lite = false, raf = 0;
  function frame(now) {
    if (!el.isConnected) return;
    const raw = (now - last) / 1000, dt = Math.min(1 / 30, Math.max(0, raw));
    last = now;
    // A phone that's struggling (most frames slow): drop the soft glow and keep the lines.
    slow = slow * 0.97 + (raw > 0.024 ? 0.03 : 0);
    if (!lite && slow > 0.6) lite = true;
    if (mode === 'play' || mode === 'title' || mode === 'over') {
      const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const ky = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
      update(G, dt, mode === 'play' ? { kx, ky, target, drag, howl: howlNow } : { kx: 0, ky: 0, target: null, drag: null, howl: false });
      drag = { x: 0, y: 0 };
      howlNow = false;
      if (mode === 'play' && G.over) mode = 'over';
      if (mode === 'over' && !overShown) gameOver();
    }
    draw(c, G, { scale, lite });
    if (mode !== 'title') drawHud(c, G, { dpr, w, h, safe, best, touch });
    howlBtn.classList.toggle('ready', G.howl >= 1);
    howlBtn.style.setProperty('--fill', `${Math.round(G.howl * 100)}%`);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  title();
  if (import.meta.env.DEV) window.__dogStar = { get G() { return G; }, get mode() { return mode; } }; // (for poking at in the workshop)

  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onHide);
    el.remove();
    if (froze) player.frozen = false;
    if (tune) music.play(tune);
    music.setAmbient(ambient);
    onClose?.();
  }
  return { close };
}
