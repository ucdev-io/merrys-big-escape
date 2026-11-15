import { BREEDS, BREED_KEYS } from '../entities/breeds.js';
import { lanBase, fillShareBox } from '../net/links.js';
import { getSettings, setSetting } from '../core/settings.js';

const isPhone = () => matchMedia('(pointer: coarse)').matches;

/**
 * The landing page shown every time the game opens.
 * Resolves with 'continue' | 'garden' | 'town'.
 */
export function showTitle(save) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'title-screen';
    const where = save.chapter === 'town' ? 'the neighbourhood' : save.found?.length ? 'the garden' : null;
    const s = getSettings();
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
        <div class="extras">
          <button class="link phone-btn">📱 Play on a phone or tablet</button> ·
          <button class="link settings-btn">⚙️ Settings</button>
        </div>
        <div class="phone hidden"><p>On the same Wi-Fi, scan this with the phone's camera:</p><div class="box"></div></div>
        <div class="settings hidden">
          <label><input type="checkbox" data-s="debug" ${s.debug ? 'checked' : ''}> Show speed info (frames per second)</label>
          <label><input type="checkbox" data-s="styles" ${s.styles ? 'checked' : ''}> Show the art style picker</label>
        </div>
      </div>`;
    document.getElementById('hud').appendChild(el);
    el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { el.remove(); resolve(b.dataset.c); }));

    const phone = el.querySelector('.phone'), settings = el.querySelector('.settings');
    const showPhone = async (show) => {
      phone.classList.toggle('hidden', !show);
      if (show && !phone.dataset.ready) { phone.dataset.ready = '1'; await fillShareBox(phone.querySelector('.box'), await lanBase()); }
    };
    el.querySelector('.phone-btn').onclick = () => showPhone(phone.classList.contains('hidden'));
    el.querySelector('.settings-btn').onclick = () => settings.classList.toggle('hidden');
    el.querySelectorAll('[data-s]').forEach((c) => (c.onchange = () => setSetting(c.dataset.s, c.checked)));
    // On the computer, show the phone QR straight away — that's what you'd want to hand round.
    if (!isPhone()) showPhone(true);
  });
}
