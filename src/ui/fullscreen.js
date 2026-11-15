import { getSettings } from '../core/settings.js';

// Fullscreen that copes with every browser:
//  - Android Chrome / iPad: the real Fullscreen API.
//  - iPhone Safari: web pages can't go fullscreen, but "Add to Home Screen" launches the game
//    like an app with no address bar (see index.html + manifest), so we explain that instead.

const doc = document, root = document.documentElement;

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches;
export const isIOS = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Launched from the home screen: already no browser bars. */
export const isStandalone = () =>
  matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canFullscreen = () => !!(root.requestFullscreen || root.webkitRequestFullscreen) && !!(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled);
export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

export async function enterFullscreen() {
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else root.webkitRequestFullscreen?.();
    return true;
  } catch { return false; }
}
export function exitFullscreen() { (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => {}); }
export function onFullscreenChange(fn) {
  doc.addEventListener('fullscreenchange', fn);
  doc.addEventListener('webkitfullscreenchange', fn);
}

// If someone deliberately leaves fullscreen (e.g. Android back gesture), don't keep forcing it.
let wasFull = false, userLeft = false;
onFullscreenChange(() => { if (wasFull && !isFullscreen()) userLeft = true; wasFull = isFullscreen(); });

/** Go fullscreen automatically when a phone/tablet player starts playing (must be called from a tap). */
export function autoFullscreen() {
  if (!isTouchDevice() || isStandalone() || isFullscreen() || userLeft || !canFullscreen()) return;
  if (!getSettings().autoFullscreen) return;
  enterFullscreen();
}

/** Toggle from a button; on iPhone, explain Add to Home Screen. */
export function toggleFullscreen(hud) {
  if (canFullscreen()) { if (isFullscreen()) exitFullscreen(); else enterFullscreen(); return; }
  homeScreenHelp(hud);
}

export function homeScreenHelp(hud) {
  hud.showCard(`
    <h1>Full screen on iPhone</h1>
    <p>iPhones don’t let web pages hide the address bar, but there’s a trick:</p>
    <p class="steps">1. Tap the <b>Share</b> button <span class="ios-share">⬆︎</span> at the bottom of Safari<br>
    2. Choose <b>Add to Home Screen</b><br>
    3. Open <b>Merry</b> from your home screen — no address bar! 🐾</p>`,
    [['Got it', () => hud.hideCard()]]);
}

/** Whether to show a fullscreen button at all. */
export const fullscreenButtonUseful = () => !isStandalone() && (canFullscreen() || isIOS());
