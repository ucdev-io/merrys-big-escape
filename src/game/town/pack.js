import { BREEDS } from '../../entities/breeds.js';
import { NetClient } from '../../net/client.js';
import { packLink, packPath, fillShareBox } from '../../net/links.js';
import { watchPacks, renderPackRows } from '../../net/packs.js';
import { townName } from '../../world/town/generator.js';
import { CHALLENGES } from '../challenges.js';
import { localSeason } from '../season.js';

const WORLD_ACTS = ['tip', 'hole', 'trample', 'scatter']; // things that change the world, not just a dog

/**
 * Your pack: the connection to friends on the same Wi-Fi. Opens your neighbourhood to others,
 * joins theirs, relays what you do, quietly reconnects after a phone sleeps, and shows the
 * 👥 badge/card. The chapter supplies hooks for what joining/events mean in the game.
 */
export class Pack {
  /**
   * @param o.me          () → { name, breed }
   * @param o.seed        () → this town's seed
   * @param o.progress    () → { discovered, bones } (shared adventure, sent when (re)opening a pack)
   * @param o.onWelcome   (welcome, { rejoin }) → merge the pack's progress, go to your house…
   * @param o.onEvent     (ev, byName|null) → apply a shared-adventure event
   * @param o.onMischief  (msg) → another dog's mess (bins, holes, trampled beds)
   */
  constructor({ hud, remotes, me, seed, progress, onWelcome, onEvent, onMischief }) {
    Object.assign(this, { hud, remotes, me, seed, progress, onWelcome, onEvent, onMischief });
    this.net = null;
    this.code = null;
    this.badge = document.createElement('button');
    this.badge.className = 'pill pack-badge hidden';
    this.badge.onclick = () => this.showCard();
    hud.root.querySelector('.top-right').prepend(this.badge);
    // Leaving the page (or the browser parking it in its back/forward cache): leave the pack
    // properly so we don't linger as a ghost in friends' lists, and rejoin if the page comes back.
    addEventListener('pagehide', () => this.park());
    addEventListener('pageshow', () => this.unpark());
  }

  get connected() { return !!this.net; }

  /** Open your own neighbourhood to friends on this Wi-Fi (quietly does nothing without a server). */
  async open() {
    if (this.net) return;
    try {
      const net = new NetClient();
      const w = await net.enter('create', { seed: this.seed(), ...this.me(), ...this.progress(), season: localSeason() }); // (whoever opens a pack picks its season)
      this.attach(net, w, { rejoin: true }); // you're already at your gate; don't teleport
      this.hud.showToastRaw('🏘️', 'Your neighbourhood is open!', 'Friends on this Wi-Fi can join you from their menu.');
    } catch { /* no server: solo play */ }
  }

  /** Join someone's pack. Resolves with { net, welcome }; call attach() if you're staying in this town. */
  async join(code) {
    const net = this.net ?? new NetClient();
    const welcome = await net.enter('join', { code, ...this.me(), season: localSeason() });
    return { net, welcome };
  }

  /** Wire up a pack from the server's welcome message. */
  attach(net, w, { rejoin = false } = {}) {
    this.net = net;
    this.code = w.code;
    history.replaceState(null, '', packPath(w.code));
    // Our own old connection may linger on the server for a few seconds after a reconnect: ignore it.
    w.players.filter((p) => !this.oldIds?.has(p.id)).forEach((p) => this.remotes.add(p));
    this.onWelcome(w, { rejoin });
    net.on('join', (m) => {
      this.remotes.add(m.p);
      this.hud.showToastRaw(BREEDS[m.p.breed]?.emoji ?? '🐕', 'A new dog joined the pack!', '');
      this.hud.toast.querySelector('.t-blurb').textContent = `Say hello to ${m.p.name}!`;
      this.updateBadge();
    });
    net.on('leave', (m) => { this.remotes.remove(m.id); this.updateBadge(); });
    net.on('ss', (m) => this.remotes.onStates(m.p, net.id));
    net.on('act', (m) => (WORLD_ACTS.includes(m.a) ? this.onMischief(m) : this.remotes.onAct(m.id, m.a, m)));
    net.on('look', (m) => this.remotes.setLook(m.id, m.look, m.level));
    net.on('carry', (m) => this.remotes.setCarry(m.id, m.item));
    net.on('game', (m) => this.onGame?.(m));
    net.on('heist', (m) => this.onHeist?.(m));
    net.on('season', (m) => this.onSeason?.(m));
    net.on('woods', (m) => this.onWoods?.(m));
    net.on('ev', (m) => { this.pending?.delete(`${m.ev.type}:${m.ev.id}`); this.onEvent(m.ev, m.by === net.id ? null : m.name); });
    net.on('close', () => this.onClosed());
    this.updateBadge();
  }

  /** Send my dog's state (~12×/s). */
  sendState(dt, P, sniffing) {
    if (!this.net) return;
    const flags = (sniffing ? 1 : 0) | (P.digTimer > 0 ? 2 : 0) | (P.grounded ? 0 : 4) | (P.inWater ? 8 : 0) | (P.swim > 0.5 ? 16 : 0) | (P.sledging ? 32 : 0)
      | (((P.mudLevel ?? 0) & 3) << 6); // (+ how muddy: 0–3)
    this.net.sendState(dt, P.pos, P.heading, P.speed, flags);
  }

  act(a, extra) { this.net?.act(a, extra); }

  /** A move in a pack game (start a race or tag, finish a race, tag someone). */
  sendGame(msg) { if (this.net) this.net.send({ t: 'game', ...msg }); }

  /** A heist move (grab a treat, distract the baker…): the server settles it. */
  sendHeist(msg) { if (this.net) this.net.send({ t: 'heist', ...msg }); }

  /** A seasons move (pick the season, build a snowman, leap into a leaf pile…): the server settles it. */
  sendSeason(msg) { if (this.net) this.net.send({ t: 'season', ...msg }); }

  /** Tell the pack what my dog is carrying (or null). */
  sendCarry(item) { if (this.net) this.net.send({ t: 'carry', item: item ?? null }); }

  /** Tell the pack about a new outfit or level. */
  sendLook() { if (this.net) this.net.send({ t: 'look', look: this.me().look, level: this.me().level }); }

  /**
   * Shared-adventure event. In a pack the server echoes it to everyone (us included), so the
   * caller must not apply it locally — returns true in that case.
   */
  dispatch(ev) {
    if (!this.net) return false;
    const key = `${ev.type}:${ev.id}`;
    if (!this.pending?.has(key)) {
      (this.pending ??= new Set()).add(key);
      this.net.event(ev);
    }
    return true;
  }

  /** While playing, mention when a friend starts playing somewhere else. */
  watchOthers() {
    if (this.stopWatch) return;
    let seen = null;
    this.stopWatch = watchPacks((list) => {
      if (!list) return;
      const others = list.filter((p) => p.code !== this.code);
      if (seen) {
        for (const p of others) {
          if (seen.has(p.code)) continue;
          this.hud.showToastRaw('🐾', '', '');
          this.hud.toast.querySelector('.t-head').textContent = `${p.host} is playing in ${townName(p.seed)}!`;
          this.hud.toast.querySelector('.t-blurb').textContent = 'Tap 👥 at the top to go and join them.';
        }
      }
      seen = new Set(others.map((p) => p.code));
    }, 5000);
  }

  /** Who's here, other neighbourhoods to hop over to, and (tucked away) a link for new phones. */
  showCard() {
    const code = this.code ?? '';
    const names = [...this.remotes.dogs.values()].map((r) => `${BREEDS[r.breed]?.emoji ?? '🐕'} ${r.name}`);
    this.hud.showCard(`
      <h1>👥 Your pack</h1>
      <p class="pack-list"></p>
      <h3>🎮 Games &amp; challenges</h3>
      <div class="game-btns challenges"></div>
      <p class="rec-link"><button class="pill g-records">🏆 Family records</button></p>
      <h3>Other neighbourhoods</h3>
      <div class="list others"><p class="none">No one else is playing right now.</p></div>
      <details class="newphone"><summary>📱 Get the game on another phone or tablet</summary>
        <p>Friends on this Wi-Fi just open the game and tap you in <b>Friends playing now</b>. New phones can scan this:</p>
        <div class="invite"></div></details>`, [['OK', () => this.hud.hideCard()]]);
    const card = this.hud.card;
    card.querySelector('.pack-list').textContent = ['You', ...names].join(' · ') + (code ? `  (pack ${code})` : '');
    const dogs = this.remotes.dogs.size + 1, btns = card.querySelector('.challenges');
    for (const [kind, C] of Object.entries(CHALLENGES)) {
      const b = document.createElement('button');
      b.className = 'pill big';
      b.innerHTML = `${C.emoji} ${C.name}<small>${dogs > 1 ? C.blurb : C.solo}</small>`;
      b.disabled = !this.net || dogs < (C.min ?? 1);
      b.onclick = () => { this.hud.hideCard(); this.onStartGame?.(kind); };
      btns.appendChild(b);
    }
    card.querySelector('.g-records').onclick = () => this.onRecords?.();
    const others = card.querySelector('.others');
    const stop = watchPacks((list) => {
      if (card.classList.contains('hidden') || !card.contains(others)) { stop(); return; }
      const n = renderPackRows(others, list, { exclude: code, onJoin: (p) => { location.href = packPath(p.code); } });
      if (!n) others.innerHTML = '<p class="none">No one else is playing right now.</p>';
    });
    card.querySelector('details').addEventListener('toggle', async (e) => {
      if (e.target.open && !e.target.dataset.ready) {
        e.target.dataset.ready = '1';
        await fillShareBox(card.querySelector('.invite'), code ? await packLink(code) : location.origin, { text: 'Come and play Merry’s Big Escape!' });
      }
    });
  }

  park() {
    if (!this.net) return;
    (this.oldIds ??= new Set()).add(this.net.id);
    this.net.close();
    this.net = null;
    this.parked = true;
    this.remotes.clear();
    this.updateBadge();
  }

  unpark() {
    if (!this.parked) return;
    this.parked = false;
    if (this.code && !this.net && !this.reconnecting) { this.reconnecting = true; this.tryRejoin(0); }
  }

  /** Phone slept or Wi-Fi blipped: keep playing, and quietly get back into the pack. */
  onClosed() {
    if (this.reconnecting || !this.code) return;
    (this.oldIds ??= new Set()).add(this.net?.id);
    this.remotes.clear();
    this.net = null;
    this.updateBadge();
    this.reconnecting = true;
    this.hud.showToastRaw('📡', 'Reconnecting to the pack…', 'Hang on a sec!');
    this.tryRejoin(0);
  }

  async tryRejoin(attempt) {
    if (document.hidden) { // wait until they're looking at the game again
      document.addEventListener('visibilitychange', () => this.tryRejoin(attempt), { once: true });
      return;
    }
    try {
      const net = new NetClient();
      let w;
      try { w = await net.enter('join', { code: this.code, ...this.me(), season: localSeason() }); }
      catch (e) {
        if (!/No pack/.test(e.message)) throw e;
        // Everyone's phone slept and the pack closed: open it again with the same code and progress.
        w = await net.enter('create', { code: this.code, seed: this.seed(), ...this.me(), ...this.progress(), season: localSeason() });
      }
      this.reconnecting = false;
      this.attach(net, w, { rejoin: true });
      this.hud.showToastRaw('🐾', 'Back with the pack!', '');
    } catch {
      if (attempt >= 5) {
        this.reconnecting = false;
        this.hud.showToastRaw('📡', 'Lost the pack!', 'Couldn’t reconnect — you can keep playing on your own.');
        return;
      }
      setTimeout(() => this.tryRejoin(attempt + 1), 1000 * 2 ** attempt);
    }
  }

  updateBadge() {
    if (!this.net) { this.badge.classList.add('hidden'); return; }
    this.badge.classList.remove('hidden');
    const n = this.remotes.dogs.size + 1;
    this.badge.textContent = n === 1 ? '👥 Just you' : `👥 ${n} dogs`;
    this.badge.title = `Pack ${this.code}`;
  }
}
