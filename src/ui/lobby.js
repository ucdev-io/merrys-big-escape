import { BREEDS, BREED_KEYS } from '../entities/breeds.js';

/**
 * "Who's playing?" — pick a dog, name it, then play alone, start a pack or join one.
 * Purely UI: the caller decides what each choice does.
 *
 * @returns {{ el, setError(msg), setBusy(b), close() }}
 */
export function showLobby({ hud, profile, townName = '', onBreed, onSolo, onHost, onJoin, onNewTown, onGarden, garden = false, title, subtitle }) {
  const wrap = document.createElement('div');
  wrap.className = 'lobby';
  wrap.innerHTML = `
    <div class="page">
      <h1>Who's playing?</h1>
      <p class="sub">Welcome to <b class="town"></b>!</p>
      <div class="breeds">${BREED_KEYS.map((k) => {
        const b = BREEDS[k];
        return `<button class="breed" data-k="${k}">
          <span class="sw">${b.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <span class="bn">${b.dogName}</span><span class="bb">${b.breed}</span></button>`;
      }).join('')}</div>
      <p class="blurb"></p>
      <label class="name">Name <input maxlength="14" autocomplete="off" spellcheck="false"></label>
      <div class="btns">
        <button class="pill big solo">🐾 Play on my own</button>
        <button class="pill big host">🏠 Start a pack</button>
      </div>
      <div class="join-row">
        <input class="code" maxlength="8" placeholder="Pack code e.g. BONE-42" autocomplete="off" spellcheck="false">
        <button class="pill join">Join a pack</button>
      </div>
      <p class="err"></p>
      <div class="small">
        <button class="link newtown">🎲 New town</button> · <button class="link garden">Back to the garden</button>
      </div>
    </div>`;
  hud.root.appendChild(wrap);
  wrap.querySelector('.town').textContent = townName;
  if (title) wrap.querySelector('h1').textContent = title;
  if (subtitle) wrap.querySelector('.sub').innerHTML = subtitle;
  if (garden) {
    // Garden mode: just choose a dog and go — packs come after the escape.
    wrap.querySelectorAll('.host, .join-row, .small').forEach((e) => e.remove());
    wrap.querySelector('.solo').textContent = 'Let\u2019s go! 🐾';
  }

  const nameIn = wrap.querySelector('.name input');
  const codeIn = wrap.querySelector('.code');
  const err = wrap.querySelector('.err');
  let breed = BREEDS[profile.breed] ? profile.breed : 'merry';
  let customName = profile.name && profile.name !== BREEDS[breed].dogName;
  nameIn.value = profile.name || BREEDS[breed].dogName;

  const select = (k) => {
    breed = k;
    wrap.querySelectorAll('.breed').forEach((b) => b.classList.toggle('active', b.dataset.k === k));
    wrap.querySelector('.blurb').textContent = `${BREEDS[k].dogName} the ${BREEDS[k].breed}: ${BREEDS[k].blurb}`;
    if (!customName) nameIn.value = BREEDS[k].dogName;
    onBreed(k);
  };
  wrap.querySelectorAll('.breed').forEach((b) => (b.onclick = () => select(b.dataset.k)));
  nameIn.oninput = () => (customName = nameIn.value.trim() !== '' && nameIn.value !== BREEDS[breed].dogName);
  // Typing in the boxes mustn't make the dog run about.
  for (const i of [nameIn, codeIn]) i?.addEventListener('keydown', (e) => e.stopPropagation());
  codeIn?.addEventListener('input', () => (codeIn.value = codeIn.value.toUpperCase()));
  select(breed);
  if (window.__packError) { err.textContent = window.__packError; window.__packError = null; }

  const choice = () => ({ breed, name: nameIn.value.trim().slice(0, 14) || BREEDS[breed].dogName });
  wrap.querySelector('.solo').onclick = () => onSolo(choice());
  if (garden) return api();
  wrap.querySelector('.host').onclick = () => onHost(choice());
  wrap.querySelector('.join').onclick = () => {
    const code = codeIn.value.trim().toUpperCase();
    if (!/^[A-Z]{4}-?\d{2}$/.test(code)) { err.textContent = 'Pack codes look like BONE-42.'; return; }
    onJoin(choice(), code.includes('-') ? code : `${code.slice(0, 4)}-${code.slice(4)}`);
  };
  wrap.querySelector('.newtown').onclick = onNewTown;
  wrap.querySelector('.garden').onclick = onGarden;
  return api();

  function api() { return {
    el: wrap,
    setError(msg) { err.textContent = msg || ''; },
    setBusy(b) { wrap.querySelectorAll('button').forEach((x) => (x.disabled = b)); wrap.classList.toggle('busy', b); },
    close() { wrap.remove(); },
    /** Arrived from a pack link: code ready, just pick a dog and press Join. */
    prefill(code) {
      codeIn.value = code;
      wrap.querySelector('.join').classList.add('big');
      wrap.querySelector('.join').textContent = `Join pack ${code} 🐾`;
      wrap.querySelector('h1').textContent = 'Pick your dog!';
      err.textContent = '';
    },
  }; }
}
