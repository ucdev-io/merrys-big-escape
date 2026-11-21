import * as THREE from 'three';
import { Colliders } from '../world/collision.js';
import { DogActions } from '../systems/dogActions.js';
import { BREEDS } from '../entities/breeds.js';

/*
 * 🧰 Bits every trip uses: a world built round the trip's own spot (far from town: see registry.js), and a
 * chapter with the dog's usual actions (sniff, dig, bark, splash), ways out, and a word or two on screen.
 */

const inRect = (r, p, pad = 0) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.z > r.z0 - pad && p.z < r.z1 + pad;

/**
 * The start of a trip's world, built round `origin`: draw into `group` and add colliders through `C`, both in
 * the trip's own coordinates (0, 0 is its middle); `W(x, z)` turns those into the world's.
 */
export function tripWorld(origin) {
  const ox = origin.x, oz = origin.z, col = new Colliders();
  const C = {
    circle: (x, z, r, top, stand) => col.circle(x + ox, z + oz, r, top, stand),
    box: (x0, z0, x1, z1, top, stand) => col.box(x0 + ox, z0 + oz, x1 + ox, z1 + oz, top, stand),
  };
  const group = new THREE.Group();
  group.position.set(ox, 0, oz);
  const W = (x, z, y = 0) => new THREE.Vector3(x + ox, y, z + oz);
  const R = (x0, z0, x1, z1) => ({ x0: x0 + ox, z0: z0 + oz, x1: x1 + ox, z1: z1 + oz }); // (a rectangle, into the world's coordinates)
  return { col, C, group, W, R, ox, oz };
}

/**
 * A trip's chapter: the dog's actions in the trip's own scene, its ways out, and the prompt. Trips extend it:
 *   goal()        where the scent trail leads (or null)
 *   hint()        { text, paw } for what 🐾 would do here (or null)
 *   heldHint()    the same while she's held still (on a ride, say: the trip reads 🐾 itself then)
 *   onDig(nose)   true if the trip handled a 🐾 press
 *   onBark()      a woof
 *   tick(dt, o)   everything else, every frame ({ canAct, barked })
 * world.exits: [{ id, rect, open(): bool, walk?: true (leave just by going in), text, paw, onTake?() (just before she goes),
 *                 style?: 'beam' (back down a flying saucer's beam of light, rather than popping out of a hole) }]
 */
export class TripChapter {
  constructor(ctx, { scene, world }) {
    Object.assign(this, { ctx, scene, world, hud: ctx.hud, input: ctx.input, player: ctx.player, pipeline: ctx.pipeline });
    this.time = 0;
    const dogName = () => ctx.town.dogName(), breedName = () => BREEDS[this.player.breedKey].breed;
    // (Nothing down here to knock over or dig up, and no garden to get told off in.)
    this.actions = new DogActions({ scene, hud: ctx.hud, input: ctx.input, player: ctx.player, pipeline: ctx.pipeline, world, dogName, breedName });
  }

  /** The way out the dog is standing in (and can take), or null. */
  exitAt(p) { return this.world.exits.find((e) => e.open() && inRect(e.rect, p)) ?? null; }

  update(dt) {
    this.time += dt;
    const P = this.player, canAct = !P.frozen;
    const ex = canAct ? this.exitAt(P.pos) : null;
    if (ex?.walk) { ex.onTake?.(); this.ctx.leave(ex.id, ex.style); return; }
    const h = canAct ? (ex ? { text: ex.text, paw: ex.paw ?? 'squeeze' } : this.hint?.()) : this.heldHint?.() ?? null;
    this.hud.setPawAction(h?.paw ?? (canAct ? 'dig' : 'wait')); // (held still on a ride: 🐾 does nothing, so it doesn't say Dig)
    if (canAct || h) this.hud.setPrompt(h?.text ?? '');
    const acted = this.actions.update(dt, {
      canAct, goal: this.goal?.() ?? null,
      onDig: (n) => { if (ex) { ex.onTake?.(); this.ctx.leave(ex.id, ex.style); return true; } return this.onDig?.(n) ?? true; },
      onBark: () => this.onBark?.(),
    });
    this.tick?.(dt, { canAct, barked: acted.barked });
  }

  /** Say something from somewhere (a 3D point, or a function giving one). */
  say(text, at, dur = 3.4) { this.hud.say(text, typeof at === 'function' ? at : () => at, dur); }

  dispose() { this.hud.clearBubbles(); this.hud.setPrompt(''); this.pipeline.sniff = 0; this.player.rideN = 0; }
}
