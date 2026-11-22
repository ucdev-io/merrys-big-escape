import hide from './hide.js';
import treat from './treat.js';
import swim from './swim.js';
import dig from './dig.js';
import chase from './chase.js';
import race from './race.js';
import fetch from './fetch.js';
import { CopyGame, HowlGame } from './copy.js';

/**
 * The town dogs' games, by `want` (see ../roster.js). Each: { Game, idle?, setup?, askR?, canAsk? }.
 *   Game          the game itself (see ./base.js)
 *   idle(td, e, dt, P, d)   their own way to spend the day (true: moved and posed the dog itself)
 *   setup(td, pal, home)    things in the world while they're not a pal yet (Tank's gate)
 *   askR          how close you walk up before they ask (Tank's behind a gate)
 */
export const WANTS = { hide, treat, swim, dig, copy: CopyGame, chase, race, howl: HowlGame, fetch };
