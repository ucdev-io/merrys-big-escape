import { BREEDS, BREED_KEYS, BREED_GROUPS } from '../entities/breeds.js';
import { watchPacks, renderPackRows, renderWorldRows } from '../net/packs.js';
import { savedDogs } from '../game/progress.js';

/**
 * "Who's playing?" — pick one of your saved dogs (or make a new one: choose a breed and a name),
 * then play alone, join a friend's pack, or go back to a saved neighbourhood.
 * Purely UI: the caller decides what each choice does. A choice is { id, breed, name }
 * (id: a saved dog, or null for a new one).
 *
 * @param o.current  id of the saved dog this device last played as (if any)
 * @param o.seed     this town's seed (so it isn't offered as somewhere to "go back to")
 * @param o.onLook   preview a saved dog's outfit
 * @returns {{ el, setError(msg), setBusy(b), close() }}
 */
export function showLobby({ hud, profile, current = null, seed = null, townName = '', onBreed, onLook, onSolo, onJoin, onNewTown, onGarden, garden = false, title, subtitle }) {
  const wrap = document.createElement('div');
  wrap.className = 'lobby';
  wrap.innerHTML = `
    <div class="page">
      <h1>Who's playing?</h1>
      <p class="sub">Welcome to <b class="town"></b>!</p>
      <div class="mydogs hidden"><div class="dogrow"></div></div>
      <button class="link rebreed hidden">✏️ Change breed</button>
      <div class="picker">
        <div class="breeds">${BREED_GROUPS.map((g) => `<h4>${g.name}</h4><div class="bgrid">${BREED_KEYS.filter((k) => BREEDS[k].group === g.id).map((k) => {
          const b = BREEDS[k];
          return `<button class="breed" data-k="${k}">
            <span class="sw">${b.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
            <span class="bn">${b.dogName}</span><span class="bb">${b.breed}</span></button>`;
        }).join('')}</div>`).join('')}</div>
        <p class="blurb"></p>
        <button class="link surprise">🎲 Surprise me!</button>
      </div>
      <label class="name">Name <input maxlength="14" autocomplete="off" spellcheck="false"></label>
      <div class="btns">
        <button class="pill big solo">🏘️ Explore <span class="town2"></span></button>
      </div>
      <div class="friends hidden"><h3>👥 Or join a friend</h3><div class="list"></div></div>
      <div class="places hidden"><h3>🏘️ Or go back to</h3><div class="list"></div></div>
      <button class="link code-link">Have a pack code?</button>
      <div class="join-row hidden">
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
  const t2 = wrap.querySelector('.town2'); if (t2) t2.textContent = townName;
  if (title) wrap.querySelector('h1').textContent = title;
  if (subtitle) wrap.querySelector('.sub').innerHTML = subtitle;
  if (garden) {
    // Garden mode: just choose a dog and go — packs come after the escape.
    wrap.querySelectorAll('.join-row, .small, .friends, .places, .code-link').forEach((e) => e.remove());
    wrap.querySelector('.solo').textContent = 'Let’s go! 🐾';
  }

  let stopWatching = null;
  const nameIn = wrap.querySelector('.name input');
  const codeIn = wrap.querySelector('.code');
  const err = wrap.querySelector('.err');
  const picker = wrap.querySelector('.picker');
  const rebreed = wrap.querySelector('.rebreed');
  let breed = BREEDS[profile.breed] ? profile.breed : 'merry';
  let customName = profile.name && profile.name !== BREEDS[breed].dogName;
  nameIn.value = profile.name || BREEDS[breed].dogName;
  let dogId = null;   // the saved dog chosen (null: a new dog)
  let touched = false; // they've started choosing: don't switch dogs under their fingers

  const select = (k) => {
    breed = k;
    wrap.querySelectorAll('.breed').forEach((b) => b.classList.toggle('active', b.dataset.k === k));
    wrap.querySelector('.blurb').textContent = `${BREEDS[k].dogName} the ${BREEDS[k].breed}: ${BREEDS[k].blurb}`;
    if (!customName) nameIn.value = BREEDS[k].dogName;
    onBreed(k);
  };
  wrap.querySelectorAll('.breed').forEach((b) => (b.onclick = () => { touched = true; select(b.dataset.k); }));
  wrap.querySelector('.surprise').onclick = () => {
    touched = true;
    const others = BREED_KEYS.filter((k) => k !== breed);
    const k = others[Math.floor(Math.random() * others.length)];
    select(k);
    wrap.querySelector(`.breed[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  nameIn.oninput = () => { touched = true; customName = nameIn.value.trim() !== '' && nameIn.value !== BREEDS[breed].dogName; };
  // Typing in the boxes mustn't make the dog run about.
  for (const i of [nameIn, codeIn]) i?.addEventListener('keydown', (e) => e.stopPropagation());
  codeIn?.addEventListener('input', () => (codeIn.value = codeIn.value.toUpperCase()));
  select(breed);
  requestAnimationFrame(() => wrap.querySelector('.breed.active')?.scrollIntoView({ block: 'nearest' }));
  if (window.__packError) { err.textContent = window.__packError; window.__packError = null; }

  // ---- your saved dogs (on the game server) ----
  const row = wrap.querySelector('.dogrow');
  const chooseDog = (d) => {
    dogId = d?.id ?? null;
    row.querySelectorAll('.dogchip').forEach((c) => c.classList.toggle('active', (c.dataset.id || null) === dogId));
    if (d) {
      // A saved dog: their breed and name, with the breed picker tucked away (so nobody changes it by accident).
      customName = true;
      nameIn.value = d.name;
      if (BREEDS[d.breed]) select(d.breed);
      onLook?.(d.look);
      picker.classList.add('hidden');
      rebreed.classList.remove('hidden');
    } else {
      customName = false;
      select(breed);
      onLook?.({});
      picker.classList.remove('hidden');
      rebreed.classList.add('hidden');
    }
  };
  rebreed.onclick = () => { picker.classList.toggle('hidden'); requestAnimationFrame(() => wrap.querySelector('.breed.active')?.scrollIntoView({ block: 'nearest' })); };
  savedDogs().then((dogs) => {
    if (!dogs?.length || !wrap.isConnected) return;
    for (const d of dogs.slice(0, 12)) {
      const b = BREEDS[d.breed] ?? BREEDS.merry;
      const c = document.createElement('button');
      c.className = 'dogchip';
      c.dataset.id = d.id;
      c.innerHTML = `<span class="sw">${b.swatch.map((col) => `<i style="background:${col}"></i>`).join('')}</span><span class="dn"></span><span class="dl"></span>`;
      c.querySelector('.dn').textContent = d.name; // names are typed by players
      c.querySelector('.dl').textContent = `⭐ ${d.level}${d.online ? ' · playing' : ''}`;
      c.title = `${d.name} the ${b.breed}`;
      c.onclick = () => { touched = true; chooseDog(d); };
      row.appendChild(c);
    }
    const n = document.createElement('button');
    n.className = 'dogchip new';
    n.innerHTML = '<span class="plus">＋</span><span class="dn">New dog</span>';
    n.onclick = () => { touched = true; chooseDog(null); };
    row.appendChild(n);
    wrap.querySelector('.mydogs').classList.remove('hidden');
    const mine = dogs.find((d) => d.id === current);
    if (!touched) chooseDog(mine ?? null);
  });

  const choice = () => ({ id: dogId, breed, name: nameIn.value.trim().slice(0, 14) || BREEDS[breed].dogName });
  wrap.querySelector('.solo').onclick = () => onSolo(choice());
  if (garden) return api();
  // Friends playing now — tap to join. Saved neighbourhoods nobody's in — tap to go back.
  const friends = wrap.querySelector('.friends'), places = wrap.querySelector('.places');
  stopWatching = watchPacks((list, worlds) => {
    const n = renderPackRows(friends.querySelector('.list'), list, { onJoin: (p) => onJoin(choice(), p.code) });
    friends.classList.toggle('hidden', !n);
    const m = renderWorldRows(places.querySelector('.list'), worlds, { exclude: seed, onGo: (w) => onJoin(choice(), w.code) });
    places.classList.toggle('hidden', !m);
  });
  wrap.querySelector('.code-link').onclick = () => { wrap.querySelector('.join-row').classList.toggle('hidden'); codeIn.focus(); };
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
    close() { stopWatching?.(); wrap.remove(); },
    /** Arrived from a pack link: code ready, just pick a dog and press Join. */
    prefill(code) {
      wrap.querySelector('.join-row').classList.remove('hidden');
      codeIn.value = code;
      wrap.querySelector('.join').classList.add('big');
      wrap.querySelector('.join').textContent = `Join pack ${code} 🐾`;
      wrap.querySelector('h1').textContent = 'Pick your dog!';
      err.textContent = '';
    },
  }; }
}
