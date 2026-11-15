import { SEASONS, SEASON_INFO, WEATHER, WEATHER_INFO, resolveSeason } from '../game/seasonRules.js';

const BLURB = {
  spring: 'Blossom, showers and puddles, eggs to sniff out, ducklings.',
  summer: 'Paddling pools, sprinklers, ice creams and BBQs.',
  autumn: 'Leaf piles to leap into, conkers and pumpkins.',
  winter: 'Snow, snowmen, sledging, a frozen pond — and Christmas!',
};

/**
 * ☰ → 🌦️ Seasons: pick Auto (the real calendar) or a season to play in, and (if it's yours to pick)
 * some weather. In someone else's pack, they pick: yours is kept for next time.
 * @param o { season, festive, weather, choice ('auto' | a season), picker (null, or who picks in this pack), onPick(choice), onWeather(kind) }
 */
export function showSeasonCard(hud, o) {
  const now = resolveSeason('auto');
  const btn = (choice, emoji, label, sub) => `<button class="pill big season-pick${o.choice === choice ? ' on' : ''}" data-c="${choice}">${emoji} ${label}<small>${sub}</small></button>`;
  const weather = Object.keys(WEATHER[o.season] ?? {}).map((k) => `<button class="pill weather-pick${o.weather === k ? ' on' : ''}" data-w="${k}" title="${WEATHER_INFO[k].name}">${WEATHER_INFO[k].emoji}</button>`).join('');
  hud.showCard(`<h1>🌦️ Seasons</h1>
    <p class="small">It’s <b>${SEASON_INFO[now.season].emoji} ${now.season}</b> out there${now.festive ? ' (and Christmas!)' : ''}. Auto follows the calendar, or pick a season:</p>
    ${o.picker ? '<p class="season-note"></p>' : ''}
    <div class="season-picks">${btn('auto', '🗓️', 'Auto', `${SEASON_INFO[now.season].emoji} ${SEASON_INFO[now.season].name} now`)}
      ${SEASONS.map((s) => btn(s, SEASON_INFO[s].emoji, SEASON_INFO[s].name, BLURB[s])).join('')}</div>
    ${o.picker ? '' : `<p class="small weather-row">Weather: ${weather}</p>`}`, [['Done', () => hud.hideCard()]]);
  const card = hud.card;
  if (o.picker) card.querySelector('.season-note').textContent = `In this pack, ${o.picker} picks the season (it’s ${o.season} now). Your pick is saved for next time.`;
  card.querySelectorAll('.season-pick').forEach((b) => {
    b.onclick = () => {
      o.onPick(b.dataset.c);
      card.querySelectorAll('.season-pick').forEach((q) => q.classList.toggle('on', q === b));
      if (!o.picker) setTimeout(() => hud.hideCard(), 250);
    };
  });
  card.querySelectorAll('.weather-pick').forEach((b) => {
    b.onclick = () => { o.onWeather(b.dataset.w); card.querySelectorAll('.weather-pick').forEach((q) => q.classList.toggle('on', q === b)); };
  });
}
