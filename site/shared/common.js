import { levelForXp } from '../../src/game/levels.js';
import { PLAY_URL } from './content.js';

/** Someone who's played the demo in this browser: { name, breed, level, where } — or null. Read only. */
export function returning() {
  try {
    const save = JSON.parse(localStorage.getItem('merry.save.v1') || 'null');
    const prog = JSON.parse(localStorage.getItem('merry.progress.v1') || 'null');
    if (!save?.profile?.name && !prog?.xp) return null;
    return {
      name: save?.profile?.name ?? 'Merry',
      level: levelForXp(prog?.xp ?? 0),
      where: save?.chapter === 'town' ? 'the neighbourhood' : 'the garden',
    };
  } catch { return null; }
}

/** Fill every [data-play] button: "Play the demo", or "Carry on with Merry · ⭐ 3" for a returning player. */
export function playButtons(root = document) {
  const me = returning();
  for (const a of root.querySelectorAll('[data-play]')) {
    a.href = PLAY_URL;
    if (!me) continue;
    a.querySelector('.label').textContent = `Carry on with ${me.name}`;
    const small = a.querySelector('small');
    if (small) small.textContent = `⭐ Level ${me.level} · back to ${me.where}`;
  }
}

/** People who'd rather not have things move (or ?still in the address, for testing). */
export const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');

/** All the dogs as little paint swatches (for "31 dogs to be"). Loaded when wanted: the breeds bring three.js. */
export async function dogSwatches(el) {
  const { BREEDS, BREED_KEYS } = await import('../../src/entities/breeds.js');
  el.innerHTML = BREED_KEYS.map((k) => {
    const b = BREEDS[k];
    return `<span class="swatch" title="${b.dogName} the ${b.breed}">${b.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
  }).join('');
}

/**
 * Bring Merry in once the page has painted: a dynamic import, so the words and pictures arrive
 * first. Resolves with the Stage, or null (no WebGL: the still picture stays).
 */
export async function bringMerry(canvas, opts) {
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    const { Stage, canPaint } = await import('./stage.js');
    if (!canPaint()) return null;
    const stage = new Stage(canvas, opts).start();
    canvas.addEventListener('painted', () => canvas.classList.add('awake'), { once: true });
    return stage;
  } catch (e) {
    console.warn('Merry could not be painted:', e);
    return null;
  }
}
