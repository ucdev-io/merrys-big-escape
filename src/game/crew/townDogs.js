/*
 * 🐕 The town dogs (see ./roster.js), out and about in their own spots, each with a game to play before
 * they'll be friends. Added to the town's friends (like Pepper): `job` is the game being played, if any.
 * When you win, crew.welcome(id, at) takes the dog over (into your crew, or home to your garden).
 * (A stand-in for now.)
 */
export class TownDogs {
  constructor({ scene, world, hud, player, actions, friends, seed, dogName, crew }) {
    Object.assign(this, { scene, world, hud, player, actions, friends, seed, dogName, crew });
    this.job = null;
  }

  update() {}
}
