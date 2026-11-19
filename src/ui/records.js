import { getJson } from '../net/api.js';
import { BREEDS } from '../entities/breeds.js';
import { CHALLENGES, scoreText } from '../game/challenges.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const medal = (i) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;

/**
 * 🏆 Pack records: the best in each challenge on this game computer (course ones per
 * neighbourhood), plus your own bests. `focus`: a challenge to show first.
 */
export async function showRecords(hud, { town, townName, profile, focus = null }) {
  const title = '<h1>🏆 Pack records</h1>';
  hud.showCard(`${title}<p>Opening the trophy cabinet…</p>`, [['OK', () => hud.hideCard()]]);
  let data;
  try {
    data = await getJson(`/api/records?town=${encodeURIComponent(town)}&profile=${encodeURIComponent(profile ?? '')}`);
  } catch {
    hud.showCard(`${title}<p>Couldn’t reach the game computer just now. Try again in a moment!</p>`, [['OK', () => hud.hideCard()]]);
    return;
  }
  const kinds = Object.keys(data.boards).sort((a, b) => (b === focus) - (a === focus));
  const html = kinds.map((kind) => {
    const C = CHALLENGES[kind], rows = data.boards[kind], mine = data.mine?.[kind];
    const where = C.board === 'town' ? ` <small>(${esc(townName)})</small>` : '';
    const list = rows.length
      ? rows.map((e, i) => `<li>${medal(i)} ${BREEDS[e.breed]?.emoji ?? '🐕'} ${esc(e.team ? e.team.join(' & ') : e.name)} · <b>${esc(scoreText(kind, e))}</b></li>`).join('')
      : '<li class="none">Nobody yet — be the first!</li>';
    return `<section class="rec${kind === focus ? ' focus' : ''}"><h3>${C.emoji} ${C.name}${where}</h3><ol class="records">${list}</ol>${mine ? `<p class="mine">Your best: ${esc(scoreText(kind, mine))}</p>` : ''}</section>`;
  }).join('');
  hud.showCard(`${title}<div class="rec-grid">${html}</div>`, [['OK', () => hud.hideCard()]]);
}
