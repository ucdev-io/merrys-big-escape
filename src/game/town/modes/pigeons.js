import { scoreLine, scoreResults } from './common.js';

/**
 * 🐦 Pigeon Panic: scare the most pigeons into the air (run at a flock, or bark at one up on a roof).
 * The town's own flocks; they land somewhere else and can be scared again.
 */
export class PigeonPanic {
  constructor(ctx, g) { Object.assign(this, { ctx, g }); }
  get title() { return 'Pigeon Panic'; }

  begin() { this.scores = { ...(this.g.scores ?? {}) }; }

  /** The dog just sent a flock of n flying. */
  onScatter(n) {
    if (!this.live) return;
    this.ctx.pack.sendGame({ a: 'pig', n });
    this.ctx.hud.float(`+${n} 🐦`, this.ctx.anchor());
  }

  update(dt, live) {
    this.live = live;
    const P = this.ctx.player.pos;
    let near = null, nd = Infinity;
    for (const f of this.ctx.pigeons()?.flocks ?? []) { // the closest flock that's landed
      if (f.state !== 'ground') continue;
      const d = Math.hypot(f.home.x - P.x, f.home.z - P.z) + (f.home.y > 0.5 ? 6 : 0); // (roof ones need a bark)
      if (d < nd) { nd = d; near = f; }
    }
    return { compass: near ? { pos: near.home, emoji: '🐦' } : null, banner: scoreLine(this.ctx, this.g, this.scores, '🐦') };
  }

  handle(m) { if (m.a === 'score') this.scores = m.scores; }

  results(game) {
    const r = scoreResults(this.ctx, this.g, game.scores ?? {}, 'pigeons', 'Not one pigeon scared! They’re still pecking away.');
    return { html: `<h1>🐦 Pigeon Panic</h1>${r.html}`, xp: Math.min(40, Math.ceil(r.mine / 2)) + (r.won ? 20 : 0), won: r.won };
  }

  cleanup() {}
}
