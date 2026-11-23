import * as THREE from 'three';
import { ITEMS } from '../entities/items.js';
import { setMuted, isMuted } from '../core/audio.js';
import { music } from '../core/music.js';
import { toggleFullscreen, isFullscreen, fullscreenButtonUseful, isTouchDevice } from './fullscreen.js';
import { getSettings, setSetting, TEXTURE_NAMES } from '../core/settings.js';
import { progress } from '../game/progress.js';
import { COSMETICS, SLOTS, FRIEND_NAMES } from '../game/cosmetics.js';
import { STATS, levelStats, outfitStats, boostText } from '../game/stats.js';
import { EMOTES } from '../entities/dog.js';
import { loadSave } from '../core/save.js';
import { sfx } from '../core/audio.js';
import { DEMO } from '../core/demo.js';
import { HOME } from '../net/links.js';
import { buzz } from '../core/haptics.js';
import { whatsNewHtml, markNewsSeen } from '../core/releases.js';
import { walk } from '../game/daily.js';
import { walkHtml } from './walkCard.js';
import { medalsHtml } from '../game/medals.js';
import { collection, BURIED_PLACES, BEACH_KINDS, NOTES, FRIENDS } from '../game/collection.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const _v = new THREE.Vector3(), _pin = new THREE.Vector3();
const HELD_FRESH_MS = 90000; // (town news held back while she was off on a trip: older than this when she's back, it's dropped)

/** All the HTML overlay bits: objective, prompts, speech bubbles, Sniff Book, cards. */
export class HUD {
  constructor(camera) {
    this.camera = camera;
    this.layoutGen = 0; // (bumped when the window changes size: speech bubbles measure themselves again)
    window.addEventListener('resize', () => this.layoutGen++);
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';

    // Top left: the current goal and, in the neighbourhood, the compass (beside it on a phone held
    // sideways, under it on one held upright, top middle on a big screen). News notes go under them both.
    this.topLeft = el('div', 'top-left');
    this.root.appendChild(this.topLeft);
    // Current goal: pops open when it changes, then tucks away into a small icon. Tap to see it again.
    this.objective = el('button', 'objective');
    this.objective.onclick = () => this.expandObjective(this.objective.classList.contains('open') ? 0 : 9000, true);
    this.topLeft.appendChild(this.objective);

    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);

    this.stamina = el('div', 'stamina', '<div class="fill"></div><span>Zoomies!</span>');
    this.root.appendChild(this.stamina);
    this.boosts = el('div', 'boosts'); // snack power-ups ticking down
    this.root.appendChild(this.boosts);

    // News notes: small and see-through, stacked on the left under the goal panel, out of the way. On a phone
    // only the first line shows (tap a note for the rest).
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.toast = null; // (the newest note: callers can fill in its words just after showToastRaw)
    window.addEventListener('resize', () => this.placeToasts());
    const fit = window.ResizeObserver ? new ResizeObserver(() => this.placeToasts()) : null; // (the goal popping open, the compass coming and going, a pill more top right)
    fit?.observe(this.topLeft);

    const tr = el('div', 'top-right');
    this.topRight = tr;
    fit?.observe(tr);
    this.bookBtn = el('button', 'pill book-btn');
    this.mischiefPill = el('div', 'pill mischief hidden');
    // One menu for everything that isn't playing: help, full screen, sound, vibration, title.
    this.menuBtn = el('button', 'pill menu-btn', '☰');
    this.menuBtn.title = 'Menu';
    this.menuBtn.onclick = () => this.openMenu();
    // 📅 Today's walk: a note when a goal's done (even off on a trip), and a dot on ☰ till a new day's goals are seen.
    walk.onNews = (emoji, head, blurb) => this.showToastRaw(emoji, head, blurb, { always: true });
    const dot = () => this.menuBtn.classList.toggle('dot', walk.unseen);
    walk.on(dot);
    dot();
    if (getSettings().muted) setMuted(true);
    // Level & stars: tap for "My dog" (stats, dress up).
    this.xpPill = el('button', 'pill xp-pill', '<span class="lv"></span><span class="bar"><i></i></span>');
    this.xpPill.onclick = () => this.showMyDog();
    // 😀 Emotes: play bow, spin, sit, roll over, howl, dance (also keys 1–6).
    this.emoteBtn = el('button', 'pill emote-btn', '😀');
    this.emoteBtn.title = 'Emotes (keys 1–6)';
    this.emoteBar = el('div', 'emote-bar hidden', EMOTES.map((e, i) => `<button data-e="${e.id}" title="${e.name} (${i + 1})">${e.emoji}<small>${e.name}</small></button>`).join(''));
    this.emoteBtn.onclick = () => this.emoteBar.classList.toggle('hidden');
    this.emoteBar.onclick = (ev) => { const b = ev.target.closest('[data-e]'); if (b) { this.onEmote?.(b.dataset.e); this.emoteBar.classList.add('hidden'); } };
    tr.append(this.xpPill, this.mischiefPill, this.emoteBtn, this.bookBtn, this.menuBtn);
    this.root.appendChild(this.emoteBar);
    this.pin = el('div', 'spot-pin hidden', '<span></span>'); // (see mark())
    this.root.appendChild(this.pin);
    this.levelBanner = el('div', 'levelup');
    this.root.appendChild(this.levelBanner);
    this.levelBanner.onclick = () => { this.levelBanner.classList.remove('show'); this.showWardrobe(); };
    this.updateXp();
    progress.on((e) => {
      if (e.amount) this.points(e.amount); // (a green +N: the ⭐ is for levels, up in the pill)
      if (e.levelUp) this.celebrateLevel(e.levelUp, e.unlocked);
      if (e.look) this.onLook?.(e.look);
      this.updateXp();
    });
    this.root.appendChild(tr);

    this.book = el('div', 'sniff-book hidden');
    this.root.appendChild(this.book);
    this.bookBtn.onclick = () => this.toggleBook();
    this.book.onclick = (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { // 🐾 Go: dig a tunnel there (or a note saying why not just now)
        this.toggleBook(false);
        const why = this.travelReason?.();
        if (why) this.showToastRaw('🐾', why, '', { tip: true });
        else this.onTravel?.(go.dataset.go);
        return;
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.bookTab = tab.dataset.tab; this.renderBook(); this.book.querySelector('.page').scrollTop = 0; return; }
      if (e.target === this.book || e.target.closest('.close')) this.toggleBook(false);
    };
    this.bookTab = 'places';
    collection.on(() => { if (!this.book.classList.contains('hidden')) this.renderBook(); });

    this.card = el('div', 'big-card hidden');
    this.root.appendChild(this.card);

    this.bubbles = [];
    this.floaters = [];
    this.found = [];
    this.places = null;
    this.renderBook();
  }

  /**
   * @param html   the goal, e.g. "Sniff out buried treasure!"
   * @param sub    extra detail shown when open
   * @param icon   shown when tucked away
   * @param short  tiny progress next to the icon, e.g. "2/4"
   */
  setObjective(html, sub = '', { icon = '🎯', short = '' } = {}) {
    const changed = html !== this._objHtml;
    this._objHtml = html;
    this.objective.innerHTML = `<span class="obj-icon">${icon}</span><span class="obj-short">${short}</span>`
      + `<span class="obj-body"><span class="obj-text">${html}</span>${sub ? `<span class="obj-sub">${sub}</span>` : ''}</span>`;
    if (changed) this.expandObjective(5500);
  }

  /** Pop the goal panel open for a while (full: tapped open, so the details show on a phone too). */
  expandObjective(ms, full = false) {
    clearTimeout(this._objT);
    const close = () => { this.objective.classList.remove('open', 'full'); this.placeToasts(); };
    if (!ms) { close(); return; }
    this.objective.classList.add('open');
    this.objective.classList.toggle('full', full);
    this.objective.classList.remove('pulse');
    void this.objective.offsetWidth;
    this.objective.classList.add('pulse');
    this.placeToasts();
    this._objT = setTimeout(close, ms);
  }

  updateXp() {
    this.xpPill.querySelector('.lv').textContent = `⭐ ${progress.level}`;
    this.xpPill.querySelector('.bar i').style.width = `${Math.round(progress.levelProgress * 100)}%`;
    this.xpPill.title = `Level ${progress.level} · ${progress.title}`;
  }

  celebrateLevel(level, unlocked) {
    sfx.hooray();
    buzz([40, 60, 40, 60, 80]);
    const items = unlocked.map((c) => `${c.emoji} ${c.name}`).join(' · ');
    const gain = boostText({ speed: levelStats(level).speed - levelStats(level - 1).speed, zoomies: levelStats(level).zoomies - levelStats(level - 1).zoomies });
    this.levelBanner.innerHTML = `<div class="big">⭐ Level ${level}! ⭐</div><div class="ttl">${progress.title}${gain ? ` · ${gain}` : ''}</div>`
      + (items ? `<div class="new">New: ${items}<br><small>Tap to dress up!</small></div>` : '');
    this.levelBanner.classList.remove('show'); void this.levelBanner.offsetWidth; this.levelBanner.classList.add('show');
    clearTimeout(this._lvT);
    this._lvT = setTimeout(() => this.levelBanner.classList.remove('show'), 9000); // (long enough for a slow reader to tap it)
    this.onLevelUp?.(level);
  }

  showMyDog() {
    const s = progress.stats, name = loadSave().profile?.name ?? 'Your dog';
    const stat = (emoji, label, key) => `<div class="stat"><b>${emoji} ${s[key] ?? 0}</b><span>${label}</span></div>`;
    this.showCard(`<h1 class="dogname"></h1>
      <p class="lvl">Level ${progress.level} · <b>${progress.title}</b></p>
      <div class="xpbar"><i style="width:${Math.round(progress.levelProgress * 100)}%"></i></div>
      <p class="small">${progress.toNext} ⭐ to level ${progress.level + 1} · ${progress.xp} ⭐ altogether</p>
      <div class="powers">${Object.entries(STATS).map(([k, st]) => {
        const lv = levelStats(progress.level)[k], wear = outfitStats(progress.look)[k];
        return `<div class="power"><b>${st.emoji} ${st.name} +${lv + wear}</b><span>level +${lv} · clothes +${wear}</span></div>`;
      }).join('')}</div>
      <div class="stats">${stat('🐦', 'pigeons scattered', 'pigeons')}${stat('🗺️', 'places found', 'places')}${stat('🦴', 'golden bones', 'bones')}
        ${stat('🎁', 'treasures dug up', 'treasures')}${stat('💦', 'splashes', 'splashes')}${stat('😈', 'naughty things', 'mischief')}
        ${stat('🍕', 'bin snacks', 'snacks')}${stat('👃', 'smells sniffed', 'smells')}${stat('🎮', 'games played', 'games')}
        ${stat('🏅', 'games won', 'wins')}${stat('🏆', 'pack records', 'records')}${stat('🥐', 'cheeky heists', 'heists')}
        ${stat('⛄', 'snowmen built', 'snowmen')}${stat('🍂', 'leaf piles', 'leaves')}${stat('🌰', 'conkers', 'conkers')}${stat('🥚', 'eggs found', 'eggs')}
        ${stat('🪵', 'sticks for the den', 'den')}${stat('🏰', 'sandcastles built', 'castles')}${stat('🧩', 'puzzles solved', 'puzzles')}${stat('✨', 'star-sparks', 'sparks')}
        ${stat('📅', 'full walks', 'walks')}${stat('🥇', 'gold medals', 'golds')}</div>`,
      [['👕 Dress up', () => this.showWardrobe()], ['🥇 Medals', () => this.showMedals()], ['Close', () => this.hideCard()]]);
    this.card.querySelector('.dogname').textContent = `🐶 ${name}`;
  }

  showWardrobe() {
    this.showCard('<h1>👕 Dress up</h1><div class="wardrobe"></div>', [['Back', () => this.showMyDog()], ['Done', () => this.hideCard()]]);
    const w = this.card.querySelector('.wardrobe');
    const render = () => {
      w.innerHTML = '';
      for (const [slot, label] of Object.entries(SLOTS)) {
        const row = el('div', 'wrow', `<h3>${label}</h3>`);
        const items = el('div', 'witems');
        const opt = (text, id, ok, lockLevel, boost) => {
          const b = el('button', `witem${progress.look[slot] === id ? ' on' : ''}`);
          b.innerHTML = ok ? text : `🔒<small>${lockLevel}</small><small class="wb">${boostText(boost)}</small>`;
          b.disabled = !ok;
          b.onclick = () => { progress.equip(slot, id); render(); };
          items.appendChild(b);
        };
        opt('🚫<small>None</small>', null, true);
        for (const c of COSMETICS.filter((q) => q.slot === slot)) {
          const lock = c.hint ?? (c.friend ? `Help ${FRIEND_NAMES[c.friend]} ×${c.jobs}` : `Lv ${c.level}`);
          opt(`${c.emoji}<small>${c.name}</small><small class="wb">${boostText(c.boost)}</small>`, c.id, progress.isUnlocked(c.id), lock, c.boost);
        }
        row.appendChild(items);
        w.appendChild(row);
      }
    };
    render();
  }

  openMenu() {
    this.showCard('<h1>Menu</h1><div class="menu-list"></div>', [['Close', () => this.hideCard()]]);
    const list = this.card.querySelector('.menu-list');
    const item = (label, fn) => { const b = el('button', 'pill big menu-item'); b.textContent = label; b.onclick = fn; list.appendChild(b); return b; };
    item('🐶 My dog', () => this.showMyDog());
    if (this.onCrew) item('🐾 My crew', () => this.onCrew());
    const w = item(`📅 Today’s walk · ${walk.doneCount}/3`, () => this.showWalk());
    if (walk.unseen) w.classList.add('dot');
    item('❓ How to play', () => this.showHelp());
    item('✨ What’s new', () => { markNewsSeen(); this.showCard(whatsNewHtml(), [['Back', () => this.openMenu()], ['Close', () => this.hideCard()]]); });
    if (this.onGames) item('🎮 Games', () => this.onGames());
    if (this.onPuzzles) item('🧩 Puzzles', () => this.onPuzzles());
    if (this.onSeasons) item('🌦️ Seasons', () => this.onSeasons());
    if (fullscreenButtonUseful()) item(isFullscreen() ? '⛶ Leave full screen' : '⛶ Full screen', () => { this.hideCard(); toggleFullscreen(this); });
    const sound = item(isMuted() ? '🔇 Sound: off' : '🔊 Sound: on', () => {
      setMuted(!isMuted());
      setSetting('muted', isMuted());
      sound.textContent = isMuted() ? '🔇 Sound: off' : '🔊 Sound: on';
    });
    const mus = item(getSettings().music ? '🎵 Music: on' : '🎵 Music: off', () => {
      setSetting('music', !getSettings().music);
      music.setEnabled(getSettings().music);
      mus.textContent = getSettings().music ? '🎵 Music: on' : '🎵 Music: off';
    });
    if (navigator.vibrate) {
      const vib = item(getSettings().haptics ? '📳 Vibration: on' : '📴 Vibration: off', () => {
        setSetting('haptics', !getSettings().haptics);
        vib.textContent = getSettings().haptics ? '📳 Vibration: on' : '📴 Vibration: off';
      });
    }
    const levels = Object.keys(TEXTURE_NAMES);
    const tex = item(`🎨 Paint texture: ${TEXTURE_NAMES[getSettings().texture] ?? 'Light'}`, () => {
      const next = levels[(levels.indexOf(getSettings().texture) + 1) % levels.length];
      setSetting('texture', next);
      tex.textContent = `🎨 Paint texture: ${TEXTURE_NAMES[next]}`;
      this.onTexture?.(next);
    });
    const picName = (m) => (m === 'sharp' ? '🔍 Picture: always sharp' : '🔍 Picture: auto');
    const pic = item(picName(getSettings().picture), () => {
      const next = getSettings().picture === 'sharp' ? 'auto' : 'sharp';
      setSetting('picture', next);
      pic.textContent = picName(next);
      this.onPicture?.(next);
    });
    item('🏠 Back to the title', () => { location.href = HOME; });
  }

  /** 📅 Today's walk: the day's three goals. */
  showWalk({ back = () => this.openMenu() } = {}) {
    walk.markSeen();
    this.showCard(walkHtml(), [['Back', back], ['Close', () => this.hideCard()]]);
  }

  /** 🥇 Medals: every game's best medal and targets (the Zoomies Dash's times are this town's: dashLength()). */
  showMedals({ back = () => this.showMyDog() } = {}) {
    this.showCard(medalsHtml(this.dashLength?.() ?? null), [['Back', back], ['Close', () => this.hideCard()]]);
  }

  showHelp() {
    const keys = `<h3>⌨️ Keyboard</h3><p class="help-keys"><b>WASD</b> or arrows: walk · <b>Shift</b>: zoomies · <b>Space</b>: jump<br>
      hold <b>F</b>: sniff · <b>E</b>: dig / grab / drop · <b>Q</b>: woof · <b>1–6</b>: emotes · drag the mouse to look · scroll to zoom</p>`;
    const touch = `<h3>📱 Touch</h3><p class="help-keys">Drag on the <b>left</b> to walk (push far for zoomies) · drag on the <b>right</b> to look · pinch to zoom<br>
      🦘 Jump · hold 👃 Sniff · 🐾 Dig · 🗣️ Woof · hold 💨 Zoom</p>`;
    this.showCard(`<h1>How to play</h1>${isTouchDevice() ? touch + keys : keys + touch}
      <h3>🐾 Tips</h3><ul class="help-tips">
        <li>Friends need a hand! <b>Gus</b> (an old basset hound in the park) keeps losing things, and <b>Duchess</b> at the pond keeps losing her ducklings. The compass points the way.</li>
        <li><b>Nut &amp; Meg</b>, the squirrel twins in the park, love hide-and-seek. They hide up the trees: sniff out the right one, then woof at it!</li>
        <li><b>🐾 Your crew!</b> Ten dogs live around town (and out in the woods, at the farm and on the beach), and each has a game to play. Make friends and they join your crew: up to three follow you everywhere, woof when you woof and copy your tricks. The rest hang out in your garden: walk up to one and woof to swap them in (or ☰ → My crew). Near a pink-ringed team bone, a crew dog gives you a leg-up!</li>
        <li><b>Pepper</b> the hedgehog would love a walk to the park's flowerbeds. She follows you slowly — and if Mowbot the robot mower comes near, woof to shoo it away!</li>
        <li>Walk up to the <b>📋 Lost &amp; Found board</b> by your gate to pick a job: lost things, deliveries, kites stuck up high, runaway hens, things Pickles has pinched… Trickier jobs (🐾🐾🐾) earn more stars, and a twist (🤫 no barking, ⏱️ be quick…) earns a bonus. Walk back to the board to swap a job.</li>
        <li>Pick things up with <b>🐾</b> (or E) and carry them in your mouth. Woofing drops them!</li>
        <li><b>😀 Emotes</b>: play bow, chase your tail, sit, roll over, howl, happy dance. Friends see them!</li>
        <li><b>🎮 Games &amp; challenges</b> (☰ → Games${DEMO ? '' : ', or tap 👥 at the top'}): races, the ⚡ Zoomies Dash, 🦴 Bone Rush, 🐦 Pigeon Panic, a 🦆 Duck Round-Up${DEMO ? '' : ' to do together, and tag'}. ${DEMO ? 'Beat your best: your 🏆 records are kept on this device.' : 'They all work on your own too (except tag), and the best go on the 🏆 pack records.'}</li>
        <li><b>📅 Today’s walk</b> (☰ → Today’s walk): three new goals every day, from all over town and beyond. Finish all three for bonus stars, and full walks win prizes!</li>
        <li><b>🥇 Medals</b>: games and Pickles’ arcade games give bronze, silver and gold medals for good scores (🐶 My dog → Medals). Five golds win a medal to wear!</li>
        <li><b>🎒 Treasures</b>: everything you dig up goes in your 📖 Sniff Book, and on the treasure shelf by your front door. Can you fill it?</li>
        <li><b>🧩 Puzzles</b> (☰ → Puzzles): Pickles sits on your garden fence and dares you to a <b>Paw Match</b>, and a <b>📮 postcard jigsaw</b> turns the view into a puzzle. No running about needed!</li>
        <li><b>Sniff</b> to see what's around: smells puff up wisps, and a golden trail leads to the closest. Get your nose right up to it!</li>
        <li>Too high? Find a crate, bench or car to climb. Pink-ringed bones are <b>team bones</b>: stand on a friend's back (or a crew dog's) to grab one.</li>
        <li>Cars honk if you're in the road. Bump into one and you'll lose a bit of puff — so look both ways!</li>
        <li><b>Double-tap jump</b> for a huge jump over fences and hedges. It uses some of your zoomies.</li>
        <li>Knock a <b>bin</b> over and gobble what falls out: 🍕 super speed · 🧀 super jumps · 🍩 endless zoomies · 🌭 everything!</li>
        <li>Every level (and every piece of clothing) makes you a bit faster ⚡ with longer zoomies 💨.</li>
        <li>Flowerbeds, holes and bins are great fun\u2026 but the neighbours will shout.</li>
        <li><b>🥐 Heists!</b> The baker on the bakery street keeps glancing round: grab a treat off her stall while her back's turned (watch for 👀 over her head) and run it home to your garden. Caught? "Oi! Shoo!" Woof at her door to distract her while a friend sneaks in!</li>
        <li><b>🌭 The butcher's sausages:</b> grab the dangling end and run! A friend can grab the other end for a <b>tug of war</b>: run away or mash 🐾 to pull. Pull too hard and SNAP: half each.</li>
        <li><b>🍔 BBQ parties!</b> Now and then someone has a barbecue in their garden (follow the smoke). The cook keeps turning round to chat… that's your chance.</li>
        <li>Water is for paddling. Expect a wet-dog shake.</li>
        <li><b>🌲 The Woods!</b> Follow the lane out past the edge of town. Woof to wake the owl, help Brock the badger, and carry BIG sticks to the den (go straight at gaps!): the whole pack builds it. Mud is glorious; a paddle in the stream washes it off.</li>
        <li><b>🏖️ The Beach!</b> Over the dunes past another edge of town. Run from the waves (or chase them), build sandcastles with 🐾 (the whole pack can help; zoom into one to flatten it), dig up shells, woof the seagulls off the picnics' chips, help Sandy the lifeguard, and do a trick at the kiosk. A paddle in the sea washes the mud off.</li>
        <li><b>🚜 The Farm!</b> Out past another edge of town. Help <b>Farmer Mabel</b>, round the sheep into their pen (get behind them; friends can help), shoo Percy the pig home, climb the hay, and roll in the mud with the pigs. A paddle in the duck pond washes it off.</li>
        <li><b>🌦️ Seasons!</b> The town follows the real calendar (or pick one in ☰ → Seasons): snowmen, sledging and a frozen pond in winter, leaf piles and conkers in autumn, an egg hunt in spring, paddling pools in summer.</li>
        ${DEMO ? '' : '<li>Friends on the same Wi-Fi show up in <b>Friends playing now</b> \u2014 tap to join.</li>'}
      </ul>`, [['Back', () => this.openMenu()], ['Close', () => this.hideCard()]]);
  }

  /** Mischief done: the 😈 pill counts it (or, in town on your own, shows the naughty meter: see setWanted). */
  setMischief(n) {
    this.mischiefN = n;
    this.renderMischief(true);
  }

  /**
   * The naughty meter, in town: { level (0…max, fractional as it calms down), max, state: 'calm' | 'called' |
   * 'chase' } (null: back to the plain count). Dots fill yellow → red; full, the dog warden's on his way (🚐).
   */
  setWanted(w) {
    const key = w ? `${w.state}|${Math.round(w.level * 24)}` : 'off';
    if (key === this.wantedKey) return;
    this.wantedKey = key;
    this.wanted = w;
    this.renderMischief(false);
  }

  renderMischief(pulse) {
    const p = this.mischiefPill, w = this.wanted, n = this.mischiefN ?? 0;
    if (!w) {
      p.className = `pill mischief${n ? '' : ' hidden'}`;
      p.textContent = `😈 ${n}`;
    } else {
      const lv = Math.ceil(w.level - 1e-3);
      p.className = `pill mischief wanted lv${Math.min(w.max, lv)} ${w.state}${w.level <= 0.01 && w.state === 'calm' ? ' hidden' : ''}`;
      const dots = Array.from({ length: w.max }, (_, i) => `<i style="--f:${Math.max(0, Math.min(1, w.level - i)).toFixed(2)}"></i>`).join('');
      p.innerHTML = `${w.state === 'calm' ? '😈' : '🚐'}<span class="dots">${dots}</span>`;
      p.title = w.state === 'calm' ? 'The naughty meter: fill it and the dog warden comes!' : w.state === 'search' ? 'He’s lost sight of you… stay hidden!' : 'The dog warden’s coming!';
    }
    if (pulse) { p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse'); }
  }

  setPrompt(text) {
    if (this.prompt.textContent === (text || '')) return;
    this.prompt.textContent = text || '';
    this.prompt.classList.toggle('show', !!text);
  }

  /** Snack power-ups ticking down: { speed, jump, zoomies } seconds left. */
  setBoosts(b) {
    const key = Object.entries(b).map(([k, v]) => `${k}${Math.ceil(v)}`).join();
    if (key === this._boostKey) return;
    this._boostKey = key;
    const icon = { speed: '⚡', jump: '🦘', zoomies: '💨' };
    this.boosts.innerHTML = Object.entries(b).filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="boost${v < 3.5 ? ' ending' : ''}">${icon[k]} ${Math.ceil(v)}</span>`).join('');
  }

  /** The 🐾 touch button says what it'll do: 'dig' | 'grab' | 'drop' | 'pull' (a tug of war). */
  setPawAction(act = 'dig') {
    if (act === this._pawAct) return;
    this._pawAct = act;
    const b = document.querySelector('.touch [data-b="dig!"]');
    if (b) b.innerHTML = `<span>🐾</span>${{ dig: 'Dig', grab: 'Grab', drop: 'Drop', pull: 'Pull!', build: 'Build', ride: 'Ride!', tow: 'Tow', squeeze: 'In!', turn: 'Turn!', nudge: 'Nudge!', bus: 'Bus!', beam: 'Beam!', fly: 'Fly!', out: 'Out!', aboard: 'Aboard!', wait: '…', show: 'Show!', play: 'Play!', seek: 'Seek!' }[act] ?? 'Dig'}`;
  }

  /** Not enough zoomies for a huge jump. */
  flashStamina() {
    this.stamina.classList.add('show', 'flash');
    this._stShow = undefined; // (setStamina decides again next frame)
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => this.stamina.classList.remove('flash'), 700);
  }

  setStamina(v, active) {
    const show = active || v < 0.98, w = `${Math.round(v * 100)}%`;
    if (show !== this._stShow) { this._stShow = show; this.stamina.classList.toggle('show', show); } // (every frame: only touch the page when it changes)
    if (w !== this._stW) { this._stW = w; this.stamina.firstChild.style.width = w; }
  }

  showToast(key) {
    const it = ITEMS[key];
    this.showToastRaw(it.emoji, `You found: <b>${it.name}</b>!`, it.blurb);
  }

  /**
   * A news note (newest on top, up to three). On a phone just its first line shows: tap it for the rest,
   * unless it's a `tip` that's needed right now. Callers may fill in hud.toast's .t-head / .t-blurb just
   * after (as text: names are untrusted). Off on a trip, the town's notes wait till she's back (see setAway):
   * `trip` (a trip's own: see forTrip()), `tip` and `always` notes show anyway.
   */
  showToastRaw(emoji, head, blurb = '', { tip = false, trip = false, always = false } = {}) {
    const key = `${emoji}|${head}`;
    if (this.away && !trip && !tip && !always) { this.holdNote(emoji, head, blurb, key); return; }
    const top = this.toasts.firstElementChild;
    if (head && top?.dataset.key === key) { // (the same news again: freshen that note up)
      top.querySelector('.t-blurb').innerHTML = blurb;
      this.toast = top;
      queueMicrotask(() => this.holdToast(top));
      return;
    }
    this.showNote(this.makeNote(emoji, head, blurb, key, tip));
  }

  makeNote(emoji, head, blurb, key, tip = false) {
    const t = el('div', `toast${tip ? ' tip' : ''}`, `<span class="emoji">${emoji}</span><span class="t-text"><span class="t-head">${head}</span><span class="t-blurb">${blurb}</span></span>`);
    t.dataset.key = key;
    t.onclick = () => { t.classList.toggle('open'); this.holdToast(t, 7000); };
    return t;
  }

  showNote(t) {
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild.remove();
    this.toast = t;
    this.placeToasts();
    void t.offsetWidth;
    t.classList.add('show');
    queueMicrotask(() => this.holdToast(t)); // (once the caller has filled in its words)
  }

  /**
   * A note from the town while she's off on a trip: made now (so the caller can still fill in its words through
   * hud.toast), kept until she's back. The same news twice is kept once (with the newer words).
   */
  holdNote(emoji, head, blurb, key) {
    const held = (this.held ??= []);
    let n = head ? held.find((h) => h.key === key) : null;
    if (n) { held.splice(held.indexOf(n), 1); n.t.querySelector('.t-blurb').innerHTML = blurb; }
    else n = { key, t: this.makeNote(emoji, head, blurb, key) };
    n.at = performance.now();
    held.push(n);
    if (held.length > 8) held.shift();
    this.toast = n.t;
  }

  /** Back from a trip: the town's news that's still fresh (the newest few), as if it had just come in. */
  showHeld() {
    const now = performance.now(), fresh = (this.held ?? []).filter((n) => now - n.at < HELD_FRESH_MS);
    this.held = [];
    for (const n of fresh.slice(-3)) this.showNote(n.t); // (oldest first, so the newest ends up on top)
  }

  /** Keep a note up for a while (longer for more words), then let it fade away. */
  holdToast(t, ms = null) {
    clearTimeout(t._hideT);
    if (ms === null) {
      const b = t.querySelector('.t-blurb');
      const words = t.querySelector('.t-head').textContent.length + (getComputedStyle(b).display === 'none' ? 0 : b.textContent.length);
      ms = Math.max(3200, Math.min(6500, 2600 + words * 45));
    }
    t._hideT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, ms);
  }

  /**
   * The goal and compass (top left) keep clear of the pills top right, however wide those are on this
   * phone; the notes sit just under them (and move when the goal pops open).
   */
  placeToasts() {
    if (this.topRight) {
      const room = `${Math.max(150, Math.floor(this.topRight.getBoundingClientRect().left - this.topLeft.getBoundingClientRect().left - 10))}px`;
      if (room !== this._room) { this._room = room; this.topLeft.style.setProperty('--room', room); }
    }
    const r = this.topLeft.getBoundingClientRect();
    const top = `${Math.round(r.height ? r.bottom + 6 : 64)}px`;
    if (this.toasts.style.top !== top) this.toasts.style.top = top;
  }

  setFound(list, total) {
    this.found = list;
    this.total = total;
    this.bookBtn.innerHTML = `📖 <span class="lbl">Sniff Book</span> <b>${list.filter((k) => k !== 'tunnel').length}/${total}</b>`;
    this.renderBook();
  }

  setPlaces(list) {
    this.places = list;
    const n = list.filter((p) => p.found).length;
    this.bookBtn.innerHTML = `📖 <span class="lbl">Sniff Book</span> <b>${n}/${list.length}</b>`;
    this.renderBook();
  }

  renderBook() {
    if (this.places) {
      const travel = !!this.onTravel; // (in town: 🐾 Go digs a tunnel straight to a place you've found)
      const go = (id) => (travel ? `<button class="pill go" data-go="${id}">🐾 Go</button>` : '');
      const home = travel ? `<div class="slot got home"><div class="emoji">🏡</div><div class="name">Home</div><div class="blurb">Back to my own garden gate.</div>${go('home')}</div>` : '';
      const bus = travel && this.busStop ? `<div class="slot got home"><div class="emoji">🚌</div><div class="name">Bus stop</div><div class="blurb">Buses to other towns!</div>${go('bus')}</div>` : '';
      const t = collection.totals(), met = FRIENDS.filter((f) => f.any.some((k) => (progress.stats[k] ?? 0) > 0)).length;
      const tabs = `<div class="book-tabs">${[['places', '🗺️ Places'], ['treasures', `🎒 Treasures <b>${t.got}/${t.all}</b>`], ['friends', `🐾 Friends <b>${met}/${FRIENDS.length}</b>`]]
        .map(([k, label]) => `<button class="pill ${this.bookTab === k ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>`;
      const body = this.bookTab === 'treasures' ? this.treasuresPage() : this.bookTab === 'friends' ? this.friendsPage()
        : `<p class="intro">Places my amazing nose has discovered.${travel ? ' Tap 🐾 Go to dig a tunnel there!' : ''}</p>
        <div class="slots">${home}${bus}${this.places.map((p) => `<div class="slot ${p.found ? 'got' : ''}"><div class="emoji">${p.found ? p.emoji : '❔'}</div><div class="name">${p.found ? p.name : '???'}</div><div class="blurb">${p.found ? p.blurb : 'Somewhere out there… sniff for it!'}</div>${p.found ? go(p.id) : ''}</div>`).join('')}</div>`;
      this.book.innerHTML = `<div class="page"><button class="close pill">✕</button><h2>Merry's Sniff Book</h2>${tabs}${body}</div>`;
      return;
    }
    const keys = ['duck', 'sock', 'biscuit', 'tunnel'];
    this.book.innerHTML = `<div class="page"><button class="close pill">✕</button><h2>Merry's Sniff Book</h2>
      <p class="intro">Everything my amazing nose has discovered.</p>
      <div class="slots">${keys.map((k) => {
        const got = this.found.includes(k), it = ITEMS[k];
        return `<div class="slot ${got ? 'got' : ''}"><div class="emoji">${got ? it.emoji : '❔'}</div><div class="name">${got ? it.name : '???'}</div><div class="blurb">${got ? it.blurb : 'Still hidden… keep sniffing!'}</div></div>`;
      }).join('')}</div></div>`;
  }

  /** 🎒 Treasures: every kind of thing dug up (round town, the woods, the farm, the beach), and the notes read. */
  treasuresPage() {
    const tile = (got, t) => `<div class="slot mini ${got ? 'got' : ''}"><div class="emoji">${got ? t.emoji : '❔'}</div><div class="name">${got ? t.name : '???'}</div></div>`;
    const PLACE = { town: '🏘️ Round town', woods: '🌲 In the woods', farm: '🚜 On the farm' };
    const groups = BURIED_PLACES.map(({ place, kinds }) => {
      const n = kinds.filter((k) => collection.has('buried', k.id)).length;
      return `<h3>${PLACE[place] ?? place} <small>${n}/${kinds.length}</small></h3><div class="slots minis">${kinds.map((k) => tile(collection.has('buried', k.id), k)).join('')}</div>`;
    }).join('');
    const nb = BEACH_KINDS.filter((k) => collection.has('beach', k.id)).length;
    const beach = `<h3>🏖️ At the beach <small>${nb}/${BEACH_KINDS.length}</small></h3><div class="slots minis">${BEACH_KINDS.map((k) => tile(collection.has('beach', k.id), k)).join('')}</div>`;
    const nn = NOTES.filter((q) => collection.has('notes', q.id)).length;
    const left = NOTES.length - nn;
    const notes = `<h3>📜 Notes <small>${nn}/${NOTES.length}</small></h3><div class="notes">${NOTES.filter((q) => collection.has('notes', q.id)).map((q) => `<p class="note got"><b>${q.emoji} ${q.from}</b>${q.text}</p>`).join('')}${left ? `<p class="note">${left} more to find, in ⏳ time capsules (buried round town) and 🍾 bottles (on the beach).</p>` : ''}</div>`;
    return `<p class="intro">Everything my nose has dug up. It’s all on the treasure shelf in my garden, too!</p>${groups}${beach}${notes}`;
  }

  /** 🐾 Friends: everybody met so far (by what you've done together), and hints for the rest. */
  friendsPage() {
    const s = progress.stats;
    return `<p class="intro">Everybody I’ve met on my adventures.</p><div class="slots">${FRIENDS.map((f) => {
      const met = f.any.some((k) => (s[k] ?? 0) > 0), n = s[f.count ?? f.any[0]] ?? 0;
      const times = f.times.endsWith(':') ? `${f.times} ${n}` : `${f.times} ${n} time${n === 1 ? '' : 's'}`;
      return `<div class="slot ${met ? 'got' : ''}"><div class="emoji">${met ? f.emoji : '❔'}</div><div class="name">${met ? f.name : '???'}</div>
        <div class="blurb">${met ? f.blurb : f.hint}</div>${met && n ? `<div class="blurb times">${times}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }

  toggleBook(force) {
    const show = force ?? this.book.classList.contains('hidden');
    if (show) this.renderBook();
    this.book.classList.toggle('hidden', !show);
  }

  /** Speech bubble that follows a 3D point. */
  say(text, anchor, dur = 3.5, cls = '') {
    for (const b of this.bubbles) if (b.anchor === anchor) b.t = Math.min(b.t, 0.3);
    const e = el('div', `bubble ${cls}`, text);
    this.root.appendChild(e);
    this.bubbles.push({ e, anchor, t: dur });
  }

  /** Take down every speech bubble (off on a trip: the town's chatter stays in town). */
  clearBubbles() {
    for (const b of this.bubbles) b.e.remove();
    this.bubbles = [];
  }

  /**
   * Off on a trip (true) or back in town: the town's own bits of HUD (friends' name tags, its game banner…) hide
   * meanwhile, and its news notes (a BBQ party, a friend's sandcastle…) wait till she's back. Then the ones still
   * fresh pop up, once the paper's gone.
   */
  setAway(on) {
    this.root.classList.toggle('away', !!on);
    this.away = !!on;
    clearTimeout(this._heldT);
    if (!on && this.held?.length) this._heldT = setTimeout(() => this.showHeld(), 1100);
  }

  /** The HUD as a trip sees it (trips/manager.js hands it over): just the same, except its notes show while she's away. */
  forTrip() {
    if (this._tripHud) return this._tripHud;
    const bound = new Map(), show = (emoji, head, blurb, o = {}) => this.showToastRaw(emoji, head, blurb, { ...o, trip: true });
    return (this._tripHud = new Proxy(this, {
      get: (t, k) => {
        if (k === 'showToastRaw') return show;
        const v = t[k];
        if (typeof v !== 'function') return v;
        let f = bound.get(k);
        if (f?.of !== v) { f = v.bind(t); f.of = v; bound.set(k, f); } // (its methods run on the HUD itself)
        return f;
      },
    }));
  }

  /**
   * A big bouncing pin over something to fetch (a pal's ball, a treat, a stick), so a small thing in a big town can't be
   * missed on a phone: pos (kept, it follows the thing) and its emoji, or null to take it down. Only while it's on screen.
   */
  mark(pos, emoji = '') {
    this.pinAt = pos;
    if (pos && emoji !== this.pinEmoji) { this.pinEmoji = emoji; this.pin.firstChild.textContent = emoji; }
  }

  /**
   * Little word that pops up and floats away (WOOF!, sniff sniff…). One message in one spot: a new word near one that's
   * still showing takes its place (three conkers in a row are one message, not three), and the points for it ride
   * along on it as a green +N (see points()).
   */
  float(text, pos, cls = '') {
    let f = this.floaters.find((q) => q.t < 0.9 && !q.ptsOnly && q.pos.distanceToSquared(pos) < 2.25);
    if (f) { f.t = 0; f.pos.copy(pos); } else f = this.addFloater(pos);
    f.e.className = `floater ${cls}`;
    f.w.innerHTML = text;
    // (Points that popped up a moment ago on their own, for this same thing: they join this word.)
    const p = this.ptsF;
    if (p && p !== f && p.ptsOnly && p.t < 0.3 && p.pos.distanceToSquared(pos) < 4) { this.addPoints(f, p.n); p.t = 99; }
  }

  /** Points earned: a green +N on the word that's showing (or on its own over the dog), adding up while it's there. */
  points(n) {
    let f = this.ptsF;
    if (!(f && f.t < 1 && this.floaters.includes(f))) {
      const at = this.dogAnchor?.() ?? new THREE.Vector3();
      f = this.floaters.find((q) => q.t < 0.35 && !q.ptsOnly && q.pos.distanceToSquared(at) < 4);
      if (!f) { f = this.addFloater(at); f.ptsOnly = true; f.e.className = 'floater pts-only'; }
    }
    this.addPoints(f, n);
    f.t = Math.min(f.t, 0.25); // (still adding up: it stays a moment longer)
  }

  addPoints(f, n) {
    f.n = (f.n ?? 0) + n;
    f.pts.textContent = `+${f.n}`;
    this.ptsF = f;
  }

  addFloater(pos) {
    const e = el('div', 'floater', '<span class="w"></span><span class="pts"></span>');
    this.root.appendChild(e);
    const f = { e, w: e.firstChild, pts: e.lastChild, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30, n: 0 };
    this.floaters.push(f);
    return f;
  }

  /** opts.onClose: called once when this card goes (hidden, or another card takes its place). */
  showCard(html, buttons = [], { onClose = null } = {}) {
    this.closed();
    this.card.innerHTML = `<div class="page">${html}<div class="btns"></div></div>`;
    const row = this.card.querySelector('.btns');
    for (const [label, fn] of buttons) { const b = el('button', 'pill big', label); b.onclick = fn; row.appendChild(b); }
    this.card.classList.remove('hidden');
    this._onClose = onClose;
  }
  hideCard() { this.card.classList.add('hidden'); this.closed(); }
  closed() { const f = this._onClose; this._onClose = null; f?.(); }

  project(p) {
    _v.copy(p).project(this.camera);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
  }

  update(dt) {
    this.bubbles = this.bubbles.filter((b) => {
      b.t -= dt;
      if (b.t <= 0) { b.e.remove(); return false; }
      // Keep bubbles on screen even when the speaker isn't, so the joke is never missed.
      const s = this.project(b.anchor());
      if (s.behind) { s.x = window.innerWidth - s.x; s.y = window.innerHeight * 0.3; }
      // (Its size, measured only when it might have changed: reading it every frame, right after moving it, made the
      // browser lay the page out again each time. Again after it's clamped to the edge (it gains an emoji) or the
      // window changes size.)
      if (b.gen !== this.layoutGen) { b.gen = this.layoutGen; b.w = b.e.offsetWidth / 2 + 8; b.h = b.e.offsetHeight + 20; }
      const w = b.w, h = b.h;
      const x = Math.min(window.innerWidth - w, Math.max(w, s.x));
      const y = Math.min(window.innerHeight - 10, Math.max(h + 70, s.y));
      const off = x !== s.x || y !== s.y;
      if (off !== b.off) { b.off = off; b.e.classList.toggle('offscreen', off); b.gen = -1; }
      b.e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      b.e.style.opacity = Math.min(1, b.t * 3);
      return true;
    });
    let pinned = false;
    if (this.pinAt) {
      const s = this.project(_pin.copy(this.pinAt).setY(this.pinAt.y + 0.3));
      pinned = !s.behind && s.x > 0 && s.x < window.innerWidth && s.y > 125 && s.y < window.innerHeight; // (not up among the top row of buttons: far off, the compass has it)
      if (pinned) this.pin.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    if (pinned === this.pin.classList.contains('hidden')) this.pin.classList.toggle('hidden', !pinned);
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t > 1.2) { f.e.remove(); if (this.ptsF === f) this.ptsF = null; return false; }
      const s = this.project(f.pos);
      // (Kept on screen, below the top row of buttons: with the camera down low by a tree, the dog's head can be off the top.)
      const x = Math.min(window.innerWidth - 60, Math.max(60, s.x + f.dx * f.t)), y = Math.min(window.innerHeight - 40, Math.max(110, s.y - f.t * 60));
      f.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${0.8 + Math.min(f.t * 4, 0.4)})`;
      f.e.style.opacity = s.behind ? 0 : 1 - Math.max(0, (f.t - 0.7) / 0.5);
      return true;
    });
  }
}
