/*
 * 🤫 Where Dog Star hides (a line-art space shooter: see ./dogstar/). None of it loads until it's found, so it costs
 * the game nothing. The ways in, so far:
 *   · on the title screen: tap the three paws above the name five times, quickly (they wiggle as you tap)
 *   · anywhere, on a keyboard: type "sirius" (the Dog Star)
 * To hide it somewhere else, call openDogStar() from there: pass { player } in the game, so the dog sits still.
 * (While it's open the world isn't painted underneath: see main.js.)
 */
let open = false;

/** Is Dog Star on screen? */
export const dogStarOpen = () => open;

/** Off to the stars. opts: { player, onEnd({ score, wave, lit, best, newBest }), onClose } (see ./dogstar/index.js). */
export function openDogStar(opts = {}) {
  if (open) return;
  open = true;
  import('./dogstar/index.js').then(
    ({ playDogStar }) => playDogStar({ ...opts, onClose: () => { open = false; opts.onClose?.(); } }),
    (e) => { open = false; console.warn('Dog Star didn’t load:', e); },
  );
}

/** Typing `word` (not into a box) → fn. Returns a function to stop listening. */
export function onSecretWord(word, fn) {
  let typed = '';
  const listen = (e) => {
    if (open || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key?.length !== 1) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    typed = (typed + e.key.toLowerCase()).slice(-word.length);
    if (typed === word) { typed = ''; fn(); }
  };
  window.addEventListener('keydown', listen);
  return () => window.removeEventListener('keydown', listen);
}

/** n quick taps on el (each within `gap` ms of the one before) → fn. Each tap gives a little wiggle. */
export function onSecretTaps(el, n, fn, { gap = 650 } = {}) {
  if (!el) return () => {};
  let count = 0, last = 0;
  const tap = () => {
    const now = performance.now();
    count = now - last < gap ? count + 1 : 1;
    last = now;
    el.animate?.([{ transform: 'none' }, { transform: `scale(${1 + count * 0.04}) rotate(${count % 2 ? -4 : 4}deg)`, opacity: 0.5 + count * 0.1 }, { transform: 'none' }], { duration: 240 });
    if (count >= n) { count = 0; fn(); }
  };
  el.addEventListener('pointerdown', tap);
  return () => el.removeEventListener('pointerdown', tap);
}
