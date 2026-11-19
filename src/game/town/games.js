import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { BREEDS } from '../../entities/breeds.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { CHALLENGES, scoreText } from '../challenges.js';
import { Race } from './modes/race.js';
import { Tag } from './modes/tag.js';
import { Dash } from './modes/dash.js';
import { Bones } from './modes/bones.js';
import { PigeonPanic } from './modes/pigeons.js';
import { DuckRoundUp } from './modes/ducks.js';
import { esc, medal, ord } from './modes/common.js';

const MODES = { race: Race, tag: Tag, dash: Dash, bones: Bones, pigeons: PigeonPanic, ducks: DuckRoundUp };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Games and challenges, with friends or on your own (see ../challenges.js): a countdown, the game,
 * then everyone's results and the 🏆 pack records. The server keeps score. Each kind of game lives
 * in ./modes/: begin() · update(dt, live) → { compass, banner, clock } · handle(msg) ·
 * results(game) → { html, xp, won } · cleanup() (and maybe go(), onScatter(n), static pick(ctx)).
 */
export class TownGames {
  /** ctx: { scene, world, hud, player, pack, remotes, layout, anchor(), glow(), pigeons(), teleport(x, z, face), showRecords(kind) } */
  constructor(ctx) {
    this.ctx = { ...ctx, me: () => ctx.pack.net?.id };
    Object.assign(this, ctx);
    this.game = null;
    this.mode = null;
    this.banner = document.createElement('div');
    this.banner.className = 'game-banner hidden';
    ctx.hud.root.appendChild(this.banner);
  }

  get active() { return !!this.game && !this.game.over; }

  /** From the 👥 card (or "Again!"). */
  start(kind) {
    if (this.active || !CHALLENGES[kind]) return;
    this.pack.sendGame({ a: 'start', kind, ...(MODES[kind].pick?.(this.ctx) ?? {}) });
  }

  /** A message from the server about the current game. */
  handle(m) {
    if (m.a === 'nope') { this.hud.showToastRaw('🐾', m.msg, 'Ask a friend to join your pack first.', { tip: true }); return; }
    if (m.a === 'start') return this.begin(m.game);
    const g = this.game;
    if (!g || g.over || (m.game?.id && m.game.id !== g.id)) return;
    if (m.a === 'end') this.finish(m.game);
    else this.mode.handle(m);
  }

  begin(game) {
    this.cleanup();
    const now = performance.now();
    this.game = { ...game, startAt: now + game.startsIn, endAt: now + game.endsIn, names: {} };
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
    const g = this.game;
    if (!g || g.over) return null;
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
    if (rec.record) { progress.stat('records'); progress.award(25, 'Pack record!'); }
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
    const badge = mine?.record ? '<p class="rec-badge">🎉 NEW PACK RECORD! 🎉</p>'
      : mine?.rank ? `<p class="rec-badge small">🏆 That’s the ${ord(mine.rank)} best ever!</p>`
        : mine?.best ? '<p class="rec-badge small">⭐ Your best ever!</p>' : '';
    const where = C.board === 'town' ? ` <small>(${esc(this.layout.name)})</small>` : '';
    return { badge, board: `<h3>🏆 Pack records${where}</h3><ol class="results records">${rows}</ol>`, record: !!mine?.record, best: !!mine?.best };
  }
}
