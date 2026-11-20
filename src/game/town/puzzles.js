import * as THREE from 'three';
import { Cat } from '../../entities/cat.js';
import { sfx } from '../../core/audio.js';
import { puzzleSave, showPuzzleList } from '../../ui/puzzles/puzzle.js';
import { openPawMatch } from '../../ui/puzzles/pawMatch.js';
import { openJigsaw } from '../../ui/puzzles/jigsaw.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const TAUNTS = [
  'Oh look, it’s the dog. Fancy losing at Paw Match?',
  'Psst. Dog. Bet you can’t match six smells.',
  'I’ve got a game for you. If you’re clever enough. Which you’re not.',
  'Bored? I’ve got cards. Come here.',
];

/**
 * 🧩 Puzzles in town: Pickles sits on your garden fence (a few steps from the gate) and dares you to a
 * game of Paw Match; the 📮 postcard jigsaw comes along with the first place in your Sniff Book. Both
 * then live in ☰ → Puzzles (see ../../ui/puzzles/).
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
    this.near = false;
    this.cool = 0;
    this.tauntT = 3;
    this.hint = null;
    this.places = -1;
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
    const at = b ? spots.sort((p, q) => flat(q, b) - flat(p, b))[0] : spots[0];
    at.y = this.fenceTop(at.x, at.z);
    this.cat.root.position.copy(at);
    this.cat.root.rotation.y = h.face; // looking out at the street
    this.cat.root.visible = true;
  }

  /** How high the fence is here (a hedge or a wooden fence is a bit taller than a white picket one). */
  fenceTop(x, z) {
    let top = 0;
    for (const c of this.world.colliders?.boxes ?? []) if (c.top < 2 && x > c.x0 - 0.15 && x < c.x1 + 0.15 && z > c.z0 - 0.15 && z < c.z1 + 0.15) top = Math.max(top, c.top);
    return top > 0.5 ? top + 0.02 : 1.05;
  }

  /** Per frame (canAct: the dog's free to do things). */
  update(dt, canAct) {
    this.placeCat();
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
    if (d > 4) this.near = false;
    if (!canAct || this.busy()) return;
    if (d < 9 && this.tauntT <= 0) {
      this.tauntT = 14 + Math.random() * 8;
      cat.laugh = 1;
      this.hud.say(`🐈 ${pick(TAUNTS)}`, () => cat.bubbleAnchor(V()), 3.2);
    }
    if (d < 5) this.hint = '🐈 Go up to Pickles for a game of Paw Match';
    if (d < 1.9 && !this.near && this.cool <= 0) { this.near = true; this.offer(); }
  }

  /** Pickles dares you to a game. */
  offer() {
    sfx.meow?.();
    if (puzzleSave.find('pawmatch')) this.hud.showToastRaw('🧩', 'New puzzle: Pickles’ Paw Match!', 'Play it any time from ☰ → Puzzles.');
    this.hud.showCard(`<h1>🐈 Pickles</h1><p class="pm-offer">“Oh. It’s you. Fancy a game of <b>Paw Match</b>? Twelve cards, face down: six smells, two of each. Find all the pairs. I bet you can’t.”</p>`, [
      ['🐾 You’re on!', () => this.playPawMatch()],
      ['Not now', () => { this.hud.hideCard(); this.cool = 12; }],
    ]);
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
    showPuzzleList(this.hud, { pawmatch: () => this.playPawMatch(), jigsaw: () => this.playJigsaw() }, { why: this.why });
  }
}
