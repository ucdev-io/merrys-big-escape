import { walk, TIER_STARS, TIER_NAMES, FULL_BONUS } from '../game/daily.js';
import { progress } from '../game/progress.js';
import { COSMETICS } from '../game/cosmetics.js';

/** 📅 Today's walk, as a card: today's three goals (how far along), the streak, and the walk prizes. */
export function walkHtml() {
  const goals = walk.list(), done = goals.filter((g) => g.done).length, streak = walk.currentStreak;
  const rows = goals.map((g) => `<div class="walk-goal ${g.done ? 'done' : ''}">
      <span class="g-emoji">${g.done ? '✅' : g.emoji}</span>
      <span class="g-text"><b>${g.text}</b><small>${g.where}</small>
        <span class="g-bar"><i style="width:${Math.round((Math.min(g.got, g.n) / g.n) * 100)}%"></i></span></span>
      <span class="g-side"><small>${TIER_NAMES[g.tier]}</small>${g.n > 1 ? `<b>${Math.min(g.got, g.n)}/${g.n}</b>` : ''}<span>⭐ ${TIER_STARS[g.tier]}</span></span>
    </div>`).join('');
  const walks = progress.stats.walks ?? 0;
  const prizes = COSMETICS.filter((c) => c.friend === 'walks').sort((a, b) => a.jobs - b.jobs);
  const next = prizes.find((c) => walks < c.jobs);
  const prizeLine = next
    ? `🎁 ${next.jobs - walks} more full walk${next.jobs - walks === 1 ? '' : 's'} for the ${next.emoji} <b>${next.name}</b>!`
    : `🎁 You’ve won ${prizes.map((c) => `the ${c.emoji} ${c.name}`).join(' and ')}!`;
  const head = done === 3 ? '🎉 All done for today! New goals tomorrow.'
    : `Three things to do today (${done} done). Finish all three for a bonus ${FULL_BONUS} ⭐!`;
  return `<h1>📅 Today’s walk</h1><p class="small">${head}</p><div class="walk-goals">${rows}</div>
    <p class="walk-streak">${streak > 1 ? `🔥 <b>${streak} days in a row!</b> · ` : ''}🐾 ${walks} full walk${walks === 1 ? '' : 's'} altogether</p>
    <p class="small">${prizeLine}</p>`;
}
