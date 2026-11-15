import { resolveSeason, SEASONS, SEASON_INFO, WEATHER_INFO } from './seasonRules.js';
import { getSettings } from '../core/settings.js';

/*
 * 🍂❄️🌸☀️ The season right now, for anything in the game that cares (no three.js here):
 *   season.name      'spring' | 'summer' | 'autumn' | 'winter'
 *   season.festive   'christmas' | null
 *   season.weather   'clear' | 'showers' | 'windy' | 'snow'
 *   season.is('winter'), season.christmas, season.raining
 *   season.on((change) => …)   change: { season, festive, weather } (true for whatever changed); returns "stop listening"
 * The town's Seasons (game/seasons/seasons.js) keeps it up to date: from the pack, or the settings and
 * the calendar when you're on your own.
 */
class Season {
  constructor() {
    Object.assign(this, { name: 'autumn', festive: null, weather: 'clear' });
    this.listeners = new Set();
    const s = localSeason();
    this.name = s.season;
    this.festive = s.festive;
  }

  get info() { return SEASON_INFO[this.name]; }
  get weatherInfo() { return WEATHER_INFO[this.weather] ?? WEATHER_INFO.clear; }
  get christmas() { return this.festive === 'christmas'; }
  get raining() { return this.weather === 'showers'; }
  is(name) { return this.name === name; }

  /** Change any of { season, festive, weather }; listeners hear about what actually changed. */
  set({ season, festive, weather } = {}) {
    const change = {};
    if (SEASONS.includes(season) && season !== this.name) { this.name = season; change.season = true; }
    if (festive !== undefined && (festive ?? null) !== this.festive) { this.festive = festive ?? null; change.festive = true; }
    if (weather && weather !== this.weather) { this.weather = weather; change.weather = true; }
    if (Object.keys(change).length) for (const fn of this.listeners) fn(change);
    return change;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

/**
 * What this device would pick on its own: the season setting ('auto' follows the UK calendar).
 * (For testing, ?season=winter in the address does the same as picking it.)
 */
export function localSeason(date = new Date()) {
  let choice = getSettings().season ?? 'auto';
  try { const q = new URLSearchParams(location.search).get('season'); if (q) choice = q; } catch { /* not in a browser */ }
  return resolveSeason(choice, date);
}

export const season = new Season();
