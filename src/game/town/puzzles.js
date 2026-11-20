import * as THREE from 'three';
import { Cat } from '../../entities/cat.js';
import { sfx } from '../../core/audio.js';
import { puzzleSave, showPuzzleList, unlockMore, PUZZLES } from '../../ui/puzzles/puzzle.js';
import { openPawMatch } from '../../ui/puzzles/pawMatch.js';
import { openJigsaw } from '../../ui/puzzles/jigsaw.js';
import { openRiddles } from '../../ui/puzzles/riddles.js';
import { openSlider } from '../../ui/puzzles/slider.js';
import { openSpotDiff } from '../../ui/puzzles/spotDiff.js';
import { openTreats, openGnomes, openBones } from '../../ui/puzzles/arcadeGames.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const TAUNTS = [
  'Oh look, it’s the dog. Fancy losing at Paw Match? Woof if you dare.',
  'Psst. Dog. Bet you can’t match six smells.',
  'I’ve got a game for you. If you’re clever enough. Which you’re not.',
  'Bored? I’ve got cards. Give us a woof.',
];

/**
 * 🧩 Puzzles in town: Pickles sits on your garden fence (a few steps from the gate) and dares you to a
 * game of Paw Match (woof at her to take her on: just walking past doesn't); the 📮 postcard jigsaw comes
 * along with the first place in your Sniff Book. Each puzzle you finish, Pickles brings out another of her
 * games (riddles, catch the treats, the sliding postcard, whack-a-gnome, spot the difference, bone stack:
 * see PUZZLES' `after`). Woof at her for one, or play any you've found from ☰ → Puzzles (../../ui/puzzles/).
 */
export class TownPuzzles {
  /**
   * @param o.busy     () → true while something else is going on (a card, a game, digging a tunnel…)
   * @param o.why      () → why a puzzle can't start just now (a short line), or null
   * @param o.where    () → where the dog is, for postcards ("Quackers Pond", or the town)
   * @param o.found    () → how many places she's found
   * @param o.catAway  () → true while Pickles is off pinching things (a 📋 job: she can't be in two places)
   * @param o.board    () → the 📋 board's position (Pickles sits on the far side of the gate from it)
   */
  constructor({ scene, world, hud, player, pipeline, busy, why, where, found, catAway, board }) {
    Object.assign(this, { scene, world, hud, player, pipeline, busy, why, where, found, catAway, board });
    this.cat = new Cat();
    this.cat.root.visible = false;
    scene.add(this.cat.root);
    this.garden = null;
    this.cool = 0;
    this.tauntT = 3;
    this.hint = null;
    this.places = -1;
    this.caughtUp = false;
    hud.onPuzzles = () => this.showList();
  }

  ctx() { return { hud: this.hud, player: this.player }; }

  /** Pickles' spot on the front fence of your garden (it moves if you get a different house in a pack). */
  placeCat() {
    const g = this.world.gardens?.find((q) => q.own) ?? null;
    if (g === this.garden) return;
    this.garden = g;
    const h = this.world.homes?.find((q) => q.garden === g) ?? this.world.homes?.[0];
    if (!h) return;
    const f = V(Math.sin(h.face), 0, Math.cos(h.face)), side = V(f.z, 0, -f.x);
    const gate = h.pos.clone().addScaledVector(f, -1.7); // (the gate's in the fence, just behind where you stand at it)
    const b = this.board?.();
    const spots = [2.6, -2.6].map((d) => gate.clone().addScaledVector(side, d));
    // (not by a bin: a woof at her mustn't tip one over. Then the far side of the gate from the board.)
    const binNear = (p) => (this.world.bins ?? []).some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3);
    const score = (p) => (binNear(p) ? -100 : 0) + (b ? flat(p, b) : 0);
    const at = spots.sort((p, q) => score(q) - score(p))[0];
    const seat = this.onFence(at);
    if (seat) at.set(seat.x, seat.y, seat.z); else at.y = this.fenceTop(at.x, at.z);
    this.cat.root.position.copy(at);
    this.cat.root.rotation.y = h.face; // looking out at the street
    this.cat.root.visible = true;
  }

  /** The nearest bit of fence or hedge to p, and a spot to sit on it: { x, y, z } (or null if there's none near). */
  onFence(p) {
    let best = null, bd = 1.6;
    for (const c of this.world.colliders?.boxes ?? []) {
      if (c.top >= 2 || c.top < 0.5 || Math.min(c.x1 - c.x0, c.z1 - c.z0) > 1) continue; // (fences and hedges: long and thin)
      const cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1)), d = Math.hypot(p.x - cx, p.z - cz);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    const alongZ = best.x1 - best.x0 < best.z1 - best.z0, thin = Math.min(best.x1 - best.x0, best.z1 - best.z0) < 0.4;
    const clampTo = (v, a, b) => Math.max(a + 0.3, Math.min(v, b - 0.3));
    return {
      x: alongZ ? (best.x0 + best.x1) / 2 : clampTo(p.x, best.x0, best.x1),
      z: alongZ ? clampTo(p.z, best.z0, best.z1) : (best.z0 + best.z1) / 2,
      y: best.top - (thin ? 0.1 : 0.05), // (a picket fence's points stick up round her a bit; a hedge is a cushion)
    };
  }

  /** How high the fence is here (a hedge or a wooden fence is a bit taller than a white picket one). */
  fenceTop(x, z) {
    let top = 0;
    for (const c of this.world.colliders?.boxes ?? []) if (c.top < 2 && x > c.x0 - 0.15 && x < c.x1 + 0.15 && z > c.z0 - 0.15 && z < c.z1 + 0.15) top = Math.max(top, c.top);
    return top > 0.5 ? top + 0.02 : 1.05;
  }

  /** Per frame (canAct: the dog's free to do things; barked: she woofed just now). */
  update(dt, canAct, barked = false) {
    this.placeCat();
    if (!this.caughtUp) { // (puzzles finished before Pickles had more games: she brings them out now)
      this.caughtUp = true;
      const got = unlockMore();
      if (got.length) this.hud.showToastRaw('🐈', 'Pickles has new games for you!', `${got.map((id) => `${PUZZLES[id].emoji} ${PUZZLES[id].name}`).join(', ')}: woof at her, or ☰ → Puzzles.`);
    }
    const n = this.found();
    if (n !== this.places) { // the first place found brings the postcard jigsaw
      this.places = n;
      if (n > 0 && puzzleSave.find('jigsaw')) this.hud.showToastRaw('📮', 'New puzzle: the Postcard jigsaw!', 'Snap the view and piece it back together: ☰ → Puzzles.');
    }
    const cat = this.cat, P = this.player.pos;
    const away = !!this.catAway?.();
    cat.root.visible = !!this.garden && !away;
    this.hint = null;
    if (!cat.root.visible) return;
    cat.update(dt, P);
    this.cool -= dt;
    this.tauntT -= dt;
    const d = flat(P, cat.root.position);
    if (!canAct || this.busy()) return;
    if (d < 9 && this.tauntT <= 0) {
      this.tauntT = 14 + Math.random() * 8;
      cat.laugh = 1;
      this.hud.say(`🐈 ${pick(TAUNTS)}`, () => cat.bubbleAnchor(V()), 3.2);
    }
    if (d < 5) this.hint = this.hers().length > 1 ? '🐈 Woof at Pickles for a game' : '🐈 Woof at Pickles for a game of Paw Match';
    if (barked && d < 4.5 && this.cool <= 0) this.offer();
  }

  /** Pickles' own games you've found (Paw Match, and the ones she's brought out since). */
  hers() { return Object.keys(PUZZLES).filter((id) => id !== 'jigsaw' && (id === 'pawmatch' || puzzleSave.found(id))); }

  /** Pickles dares you to a game (once she's more than Paw Match: the newest, the one you've not tried…). */
  offer() {
    sfx.meow?.();
    if (puzzleSave.find('pawmatch')) this.hud.showToastRaw('🧩', 'New puzzle: Pickles’ Paw Match!', 'Play it any time from ☰ → Puzzles.');
    const hers = this.hers(), play = this.plays();
    const no = ['Not now', () => { this.hud.hideCard(); this.cool = 3; }];
    if (hers.length <= 1) {
      this.hud.showCard(`<h1>🐈 Pickles</h1><p class="pm-offer">“Oh. It’s you. Fancy a game of <b>Paw Match</b>? Twelve cards, face down: six smells, two of each. Find all the pairs. I bet you can’t.”</p>`, [
        ['🐾 You’re on!', () => this.playPawMatch()], no,
      ]);
      return;
    }
    // Her newest games first (any you've never tried before the rest), then Paw Match.
    const fresh = hers.filter((id) => id !== 'pawmatch').sort((a, b) => (puzzleSave.plays(a) > 0) - (puzzleSave.plays(b) > 0) || PUZZLES[b].after - PUZZLES[a].after);
    const top = [...fresh.slice(0, 2), 'pawmatch'];
    const newOne = fresh.find((id) => puzzleSave.plays(id) === 0);
    const line = newOne ? `Oh. It’s you. I’ve got a new one: <b>${PUZZLES[newOne].name}</b>. Bet you can’t.` : pick(['Back again? What’ll it be, dog?', 'Oh, it’s you. Go on then, pick a game.', 'Bored? Me too. Pick one.']);
    this.hud.showCard(`<h1>🐈 Pickles</h1><p class="pm-offer">“${line}”</p>`, [
      ...top.map((id) => [`${PUZZLES[id].emoji} ${PUZZLES[id].name.replace('Pickles’ ', '')}`, () => play[id]()]),
      ['🧩 All her games…', () => this.showList()], no,
    ]);
  }

  /** How to open each puzzle (ids as in PUZZLES). */
  plays() {
    const ctx = this.ctx(), end = { onEnd: () => { this.cool = 10; } };
    return {
      pawmatch: () => this.playPawMatch(),
      jigsaw: () => this.playJigsaw(),
      riddles: () => { this.cat.laugh = 1; openRiddles(ctx, end); },
      slider: () => openSlider(ctx, { pipeline: this.pipeline, where: this.where(), ...end }),
      spotdiff: () => openSpotDiff(ctx, { pipeline: this.pipeline, scene: this.scene, camera: this.hud.camera, world: this.world, where: this.where(), ...end }),
      treats: () => openTreats(ctx, end),
      gnome: () => openGnomes(ctx, end),
      bones: () => openBones(ctx, end),
    };
  }

  playPawMatch() {
    this.cat.laugh = 1;
    openPawMatch(this.ctx(), { onEnd: () => { this.cool = 10; } });
  }

  playJigsaw() {
    openJigsaw(this.ctx(), { pipeline: this.pipeline, where: this.where() });
  }

  /** ☰ → 🧩 Puzzles. */
  showList() {
    showPuzzleList(this.hud, this.plays(), { why: this.why });
  }
}
