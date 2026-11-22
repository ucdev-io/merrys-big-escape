import { PAL } from './roster.js';
import { pals } from './pals.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/*
 * 🐾 Your crew: the pals following you about (up to three), and the rest hanging out in your garden.
 * (A stand-in for now: the town dogs call welcome() when you make friends.)
 */
export class Crew {
  constructor({ scene, world, hud, player, actions, follow, dogName, homeGarden }) {
    Object.assign(this, { scene, world, hud, player, actions, follow, dogName, homeGarden });
  }

  /**
   * A town dog just became your pal (or played with you again): at = { x, z, heading } where their dog is
   * standing, so the crew can carry on from there (it takes the dog over from the town dogs).
   */
  welcome(id, at, { first = true } = {}) {
    const p = PAL[id];
    if (!p) return;
    this.hud.showToastRaw('🐾', `<b>${esc(p.name)}</b> is your pal now!`, pals.following().length < 3 ? 'They’ll join your crew.' : 'They’ll meet you at home.');
  }

  update() {}
}
