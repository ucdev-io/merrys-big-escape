import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { BREEDS } from '../../entities/breeds.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { CHALLENGES, scoreText } from '../challenges.js';
import { GameRoom } from '../gameRules.js';
import { addResults } from '../localRecords.js';
import { Race } from './modes/race.js';
import { Tag } from './modes/tag.js';
import { Dash } from './modes/dash.js';
import { Bones } from './modes/bones.js';
import { PigeonPanic } from './modes/pigeons.js';
import { DuckRoundUp } from './modes/ducks.js';
import { esc, medal, ord } from './modes/common.js';

const MODES = { race: Race, tag: Tag, dash: Dash, bones: Bones, pigeons: PigeonPanic, ducks: DuckRoundUp };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const LOCAL = 0; // our dog's id in a GameRoom of our own (no pack server)

/**
 * Games and challenges, with friends or on your own (see ../challenges.js): a countdown, the game,
 * then everyone's results and the 🏆 records. Whoever runs the GameRoom (../gameRules.js) keeps score:
 * the pack server, or (with no server: on your own, or in the web demo) a GameRoom of our own, with its
 * records on this device. Each kind of game lives in ./modes/: begin() · update(dt, live) → { compass,
 * banner, clock } · handle(msg) · results(game) → { html, xp, won } · cleanup() (and maybe go(),
 * onScatter(n), static pick(ctx)). Modes send their moves with ctx.send().
 */
export class TownGames {
  /** ctx: { scene, world, hud, player, pack, remotes, layout, anchor(), glow(), pigeons(), teleport(x, z, face), showRecords(kind) } */
  constructor(ctx) {
    this.ctx = { ...ctx, me: () => (this.game?.local ? LOCAL : ctx.pack.net?.id ?? LOCAL), send: (msg) => this.send(msg) };
    Object.assign(this, ctx);
    this.game = null;
    this.mode = null;
    this.local = null; // our own GameRoom (made the first time we play without the pack server)
    this.inbox = [];   // its messages, read at the start of the next frame (just as the server's arrive)
    this.banner = document.createElement('div');
    this.banner.className = 'game-banner hidden';
    ctx.hud.root.appendChild(this.banner);
  }

  get active() { return !!this.game && !this.game.over; }

  /** From the 👥 card or ☰ → Games (or "Again!"). */
  start(kind) {
    if (this.active || !CHALLENGES[kind]) return;
    if (this.ctx.away?.()) { this.hud.showToastRaw('🎮', 'Games are up in town!', 'Find the way back up first.', { tip: true }); return; } // (off on a trip)
    this.send({ a: 'start', kind, ...(MODES[kind].pick?.(this.ctx) ?? {}) });
  }

  /** A move: to the pack server, or (a game of our own) to our own GameRoom. */
  send(msg) {
    const local = msg.a === 'start' ? !this.pack.net : !!this.game?.local;
    if (!local) { this.pack.sendGame(msg); return; }
    const me = this.pack.me?.() ?? {};
    this.local ??= new GameRoom({
      players: () => new Map([[LOCAL, { name: me.name ?? 'Merry', breed: me.breed ?? 'merry', profile: me.profile ?? null }]]),
      town: this.layout.seed, addResults,
    });
    this.inbox.push(...this.local.message(LOCAL, msg, performance.now()));
  }

  /** Our own GameRoom's news (and its clock running out). */
  readLocal() {
    if (!this.local) return;
    const list = [...this.inbox.splice(0), ...this.local.tick(performance.now())];
    for (const { to, msg } of list) if (to === 'all' || to === LOCAL) this.handle(msg, true);
  }

  /** A message about the current game (from the server, or our own GameRoom: local). */
  handle(m, local = false) {
    if (m.a === 'nope') { this.hud.showToastRaw('🐾', m.msg, 'Ask a friend to join your pack first.', { tip: true }); return; }
    if (m.a === 'start') return this.begin(m.game, local);
    const g = this.game;
    if (!g || g.over || (m.game?.id && m.game.id !== g.id)) return;
    if (m.a === 'end') this.finish(m.game);
    else this.mode.handle(m);
  }

  begin(game, local = false) {
    this.cleanup();
    const now = performance.now();
    this.game = { ...game, startAt: now + game.startsIn, endAt: now + game.endsIn, names: {}, local };
    for (const r of this.remotes.dogs.values()) this.game.names[r.id] = r.name;
    this.mode = new (MODES[game.kind] ?? Race)(this.ctx, this.game);
    this.mode.begin();
    sfx.pop?.();
  }

  cleanup() {
    this.mode?.cleanup();
    this.mode = null;
    this.banner.classList.add('hidden');
  }

  /** The dog just sent a flock of n pigeons flying (Pigeon Panic counts them). */
  onScatter(n) { if (this.active) this.mode.onScatter?.(n); }

  /** Per frame: the countdown, then the game. Returns a compass target ({ pos, emoji, label? }) or null. */
  update(dt) {
    this.readLocal();
    const g = this.game;
    if (!g || g.over) return null;
    if (!g.local && !this.pack.net) { // lost the pack: that game's carrying on without us (rejoining brings it back)
      this.cleanup();
      this.game = null;
      return null;
    }
    for (const r of this.remotes.dogs.values()) g.names[r.id] = r.name; // (remembered, in case they go home before the end)
    const now = performance.now(), toGo = (g.startAt - now) / 1000, C = CHALLENGES[g.kind];
    const out = this.mode.update(dt, toGo <= 0) ?? {};
    if (toGo > 0) { // 3… 2… 1…
      const n = Math.ceil(toGo);
      if (n !== g.shown) { g.shown = n; sfx.plip?.(); }
      this.banner.className = 'game-banner big';
      this.banner.textContent = n <= 3 ? `${n}` : `${C.emoji} ${this.mode.title ?? C.name}!`;
    } else {
      if (!g.go) { g.go = true; sfx.found?.(); buzz(30); this.mode.go?.(); }
      this.banner.className = 'game-banner';
      this.banner.textContent = out.clock === false ? out.banner : `${out.banner} · ${clock(Math.max(0, (g.endAt - now) / 1000))}`;
    }
    return out.compass ?? null;
  }

  finish(game) {
    const g = this.game, C = CHALLENGES[game.kind];
    g.over = true;
    const { html, xp = 0, won = false } = this.mode.results(game);
    this.cleanup();
    const rec = this.records(game);
    const prizes = COSMETICS.filter((c) => c.friend === 'wins' || c.friend === 'records'), had = prizes.filter((c) => progress.isUnlocked(c.id));
    if (xp) progress.award(xp, `${C.name}!`);
    progress.stat('games');
    if (won || (rec.best && this.remotes.dogs.size === 0)) progress.stat('wins'); // (on your own, beating your best counts)
    if (rec.record) { progress.stat('records'); progress.award(25, g.local ? 'New record!' : 'Pack record!'); }
    const newPrizes = prizes.filter((c) => !had.includes(c) && progress.isUnlocked(c.id)).map((c) => `<p class="rec-badge">🎁 You won the ${c.emoji} ${esc(c.name)}! Wear it from the ☰ menu.</p>`).join('');
    sfx.hooray?.();
    this.hud.showCard(html + (rec.badge ?? '') + newPrizes + (rec.board ?? ''), [
      ['🎮 Again!', () => { this.hud.hideCard(); this.start(game.kind); }],
      ...(C.rank ? [['🏆 Records', () => this.ctx.showRecords?.(game.kind)]] : []),
      ['OK', () => this.hud.hideCard()],
    ]);
  }

  /** The 🏆 part of the results: the top of the pack board, and whether we're on it. */
  records(game) {
    const r = game.records, C = CHALLENGES[game.kind];
    if (!r?.board?.length) return {};
    const mine = r.mine?.[C.coop ? 'team' : this.ctx.me()];
    const rows = r.board.map((e, i) => {
      const who = e.team ? e.team.join(' & ') : e.name;
      return `<li class="${mine?.rank === i + 1 ? 'me' : ''}">${medal(i)} ${BREEDS[e.breed]?.emoji ?? '🐕'} ${esc(who)} · ${esc(scoreText(game.kind, e))}</li>`;
    }).join('');
    const badge = mine?.record ? `<p class="rec-badge">🎉 NEW ${this.game?.local ? '' : 'PACK '}RECORD! 🎉</p>`
      : mine?.rank ? `<p class="rec-badge small">🏆 That’s the ${ord(mine.rank)} best ever!</p>`
        : mine?.best ? '<p class="rec-badge small">⭐ Your best ever!</p>' : '';
    const where = C.board === 'town' ? ` <small>(${esc(this.layout.name)})</small>` : '';
    const title = this.game?.local ? '🏆 Your records' : '🏆 Pack records';
    return { badge, board: `<h3>${title}${where}</h3><ol class="results records">${rows}</ol>`, record: !!mine?.record, best: !!mine?.best };
  }

  /** ☰ → 🎮 Games: every challenge (with friends in the pack, or on your own), and the 🏆 records. */
  showCard() {
    const dogs = this.remotes.dogs.size + 1;
    this.hud.showCard(`<h1>🎮 Games &amp; challenges</h1><p class="small">${dogs > 1 ? 'Everyone in the pack plays together!' : 'On your own: beat your best!'}</p>
      <div class="game-btns challenges"></div><p class="rec-link"><button class="pill g-records">🏆 Records</button></p>`, [['Close', () => this.hud.hideCard()]]);
    const btns = this.hud.card.querySelector('.challenges');
    for (const [kind, C] of Object.entries(CHALLENGES)) {
      const b = document.createElement('button');
      b.className = 'pill big';
      b.innerHTML = `${C.emoji} ${C.name}<small>${dogs > 1 ? C.blurb : C.solo}</small>`;
      b.disabled = this.active || dogs < (C.min ?? 1);
      b.onclick = () => { this.hud.hideCard(); this.start(kind); };
      btns.appendChild(b);
    }
    this.hud.card.querySelector('.g-records').onclick = () => this.ctx.showRecords?.();
  }
}
