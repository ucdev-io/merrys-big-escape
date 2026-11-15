import { BREEDS, BREED_KEYS } from '../entities/breeds.js';

/**
 * The landing page shown every time the game opens.
 * Resolves with 'continue' | 'garden' | 'town'.
 */
export function showTitle(save) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'title-screen';
    const where = save.chapter === 'town' ? 'the neighbourhood' : save.found?.length ? 'the garden' : null;
    el.innerHTML = `
      <div class="page">
        <div class="paws">🐾 🐾 🐾</div>
        <h1>Merry's Big Escape</h1>
        <p class="tag">A muddy-pawed adventure for dogs who follow their noses.</p>
        <div class="pack">${BREED_KEYS.map((k) => `<span title="${BREEDS[k].breed}">${BREEDS[k].swatch.map((c) => `<i style="background:${c}"></i>`).join('')}<b>${BREEDS[k].dogName}</b></span>`).join('')}</div>
        <div class="choices">
          ${where ? `<button class="pill big" data-c="continue">▶ Continue in ${where}</button>` : ''}
          <button class="pill big" data-c="garden">🏡 The Garden <small>Merry's escape story</small></button>
          <button class="pill big" data-c="town">🏘️ The Neighbourhood <small>pick any dog · play with friends</small></button>
        </div>
      </div>`;
    document.getElementById('hud').appendChild(el);
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => { el.remove(); resolve(b.dataset.c); }));
  });
}
