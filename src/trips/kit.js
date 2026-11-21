import * as THREE from 'three';
import { Colliders } from '../world/collision.js';
import { DogActions } from '../systems/dogActions.js';
import { BREEDS } from '../entities/breeds.js';
import { RNG } from '../core/rng.js';

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
    // With friends (ctx.share: see share.js): the trip's dice are the pack's (everyone's laid out the same), what's in
    // her mouth is drawn on friends' screens, and some things to carry are shared (shareItem).
    this.share = ctx.share ?? null;
    this.rng = this.share ? new RNG(`${ctx.id}:${this.share.seed}`) : null;
    this.shared = new Map(); // key → { item, kind, job, done }
    if (this.share) {
      const carry = this.actions.carry;
      this.actions.onCarry = (kind) => this.share.carry(kind);
      carry.onGrab = (it) => { if (it.shareKey) this.share.take(it.shareKey); };
      carry.onDrop = (it) => { if (it.shareKey) this.share.drop(it.shareKey, it.pos.x, it.pos.z, it.pos.y); };
      this.share.on((k, v, by) => (this.shared.has(k) ? this.sharedItem(k, v, by) : this.onShared?.(k, v, by)));
    }
  }

  /** A roll of the trip's dice (0..1): the pack's own when with friends, so everyone gets the same. */
  random() { return this.rng ? this.rng.next() : Math.random(); }
  /** A list in the trip's own shuffled order. */
  shuffled(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** A friend's name (by pack id). */
  friend(id) { return this.ctx.town.friendName?.(id) ?? 'A friend'; }

  /**
   * A thing to carry that's shared with friends on this trip, as key `k` (a carry item, already put down). Then it's
   * one dog's at a time: picked up, it's gone from everyone else's world (and in her mouth on their screens); put
   * down, it's there for everyone; handed over (shareDone), it's done for the pack. Already somebody's? As it is.
   */
  shareItem(k, item) {
    if (!this.share) return;
    item.shareKey = k;
    this.shared.set(k, { item, kind: item.kind, job: item.job, done: false });
    if (k in this.share.v) this.sharedItem(k, this.share.v[k], -1);
  }

  /** Handed over (to Nibbles, Mrs Pemberton…): done, for the pack. */
  shareDone(k) { const e = this.shared.get(k); if (e) e.done = true; this.share?.done(k); }

  sharedItem(k, v, by) {
    const e = this.shared.get(k), carry = this.actions.carry, me = this.share.me;
    if (!e || !Array.isArray(v)) return;
    const inWorld = carry.items.includes(e.item), mine = carry.held === e.item;
    if (v[0] === 1 && v[1] !== me) { // in a friend's mouth
      if (mine) this.hud.float(`${this.friend(v[1])} got it first!`, this.actions.anchor());
      if (mine || inWorld) carry.remove(e.item);
    } else if (v[0] === 0 && !mine && by !== me) { // put down somewhere
      if (!inWorld) { e.item = carry.add(e.kind, v[1], v[2], { job: e.job }); e.item.shareKey = k; }
      e.item.pos.set(v[1], Number.isFinite(v[3]) ? v[3] : e.item.pos.y, v[2]); // (how high too: a ship has decks)
      e.item.friendAt = this.time; // (just put down by a friend: their game hands it over, not this one)
    } else if (v[0] === 2 && !e.done) { // handed over (by somebody else)
      e.done = true;
      if (mine || inWorld) carry.remove(e.item);
      this.onSharedDone?.(k, by);
    }
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
