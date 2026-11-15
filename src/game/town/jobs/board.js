import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { CARRYABLES } from '../../../entities/carryables.js';
import { Person } from '../../../entities/person.js';
import { sfx } from '../../../core/audio.js';
import { fsfx } from '../../../core/friendSounds.js';
import { LineBag, fill } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { GUS } from '../../lines/friends.js';
import { TWISTS, THANKS } from '../../lines/jobs.js';
import { JOB_TYPES, PAWS } from './types.js';
import { JobWorld } from './jobWorld.js';
import { makeOffers } from './offers.js';
import { STEPS } from './steps.js';
import { doorMarker } from '../friendModels.js';
import { season } from '../../season.js';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const SHIRTS = [0xd9534f, 0x6f9a52, 0xe39a52, 0x8e6fb0, 0xf2a0b4, 0x4aa3a0, 0xf6d06a, 0x5b86c4];
const TROUSERS = [0x4a4a52, 0x5b6f8a, 0x7a6248, 0x3f5f9a];
const SKINS = [0xf2d3b8, 0xe0b48e, 0xc68e64, 0x9a6440, 0x6e4630];
const HAIRS = [0x3b2b25, 0x6b4a32, 0xc89a5a, 0x2a2224, 0xa8a49e, 0xd8b070];
// Once it's been found, how the thing's whereabouts read (instead of where it was lost).
const FOUND = { stuck: 'Down it came!', pickles: 'Pickles dropped it!', hidden: 'There it is!', buried: 'You dug it up!' };

/** One job in progress: finding the thing (its step), then taking it home — plus any twist. */
export class JobRun {
  constructor(spec, rt) {
    Object.assign(this, { spec, rt });
    this.T = JOB_TYPES[spec.type];
    this.step = STEPS[this.T.step];
    this.giver = 'board';  // (for friends.js: whose job this is…)
    this.stat = 'helped';  // …and which friendship it counts towards
    this.icon = this.T.emoji;
    this.person = rt.jw.people[spec.who];
    this.who = this.person.name;
    this.def = CARRYABLES[spec.item] ?? null;
    this.twistOk = !!spec.twist;
    this.t = 0;
    this.item = null;
    // Glowing paw prints where it's going: on the doorstep (or, for a runaway, at the garden gate).
    const herd = this.step.carries === false, at = herd ? this.person.gate : this.person.step;
    if (at) { this.marker = doorMarker(); this.marker.position.copy(at); this.marker.visible = herd; rt.scene.add(this.marker); }
    this.step.start(this);
  }

  get holding() { return !!this.item && this.rt.carry.held === this.item; }
  dest() { return this.rt.jw.dest(this.person); }

  /** → 'done' when it's all done. */
  update(dt, P, ctx) {
    this.t += dt;
    const tw = this.spec.twist;
    if (this.twistOk && ((tw === 'timer' && this.t > this.spec.secs) || (tw === 'dry' && P.inWater))) this.lose();
    if (this.step.update?.(this, dt, P, ctx) === 'done') return 'done';
    if (this.marker?.visible) this.marker.rotation.y += dt * 0.8;
    if (this.step.carries === false || !this.item) return null;
    const holding = this.holding;
    if (holding) this.picked = true;
    if (this.marker) this.marker.visible = holding;
    return holding && flat(P.pos, this.dest()) < this.person.reach ? 'done' : null;
  }

  /** Slipped up on the twist: no bonus (but the job carries on — nobody fails). */
  lose() {
    const tw = TWISTS[this.spec.twist];
    if (!this.twistOk || !tw?.lost) return;
    this.twistOk = false;
    this.rt.hud.showToastRaw(tw.emoji, tw.lost, '');
    this.rt.onChange();
  }

  bark(P) { if (this.spec.twist === 'quiet') this.lose(); this.step.bark?.(this, P); }
  mischief() { if (this.spec.twist === 'clean') this.lose(); }

  /** For the compass and the sniff trail: { pos, emoji, label, compass? }. */
  target() {
    const timer = this.spec.twist === 'timer' && this.twistOk;
    const label = (e) => (timer ? `${e} ⏱️ ${Math.max(0, Math.ceil(this.spec.secs - this.t))}s` : e);
    const t = this.step.target?.(this)
      ?? (this.holding ? { pos: this.dest(), emoji: this.person.emoji } : this.item ? { pos: this.item.pos, emoji: this.def.emoji } : null);
    return t && { ...t, label: label(t.emoji) };
  }

  objective() {
    const s = this.spec, tw = s.twist && this.twistOk ? TWISTS[s.twist] : null;
    const o = this.step.objective?.(this) ?? this.carryObjective();
    return { icon: this.icon, title: o.title, sub: o.sub + (tw ? ` · ${tw.emoji} ${tw.label}${s.twist === 'timer' ? ` (${s.secs}s)` : ''}` : '') };
  }

  carryObjective() {
    const p = this.person, d = this.def;
    if (this.holding) {
      const to = { gus: 'Gus in the park', duchess: 'Duchess at the pond', baker: 'the baker' }[p.kind] ?? `${p.name} at number ${p.number}`;
      return { title: `Take the ${d.emoji} ${d.name} to ${to}!`, sub: p.step ? 'Follow the compass to the glowing paw prints.' : 'Follow the compass!' };
    }
    if (this.picked) return { title: `Pick up the ${d.emoji} ${d.name} again`, sub: 'You dropped it! Grab it with 🐾' };
    return { title: `Find ${p.whose} ${d.emoji} ${d.name}`, sub: `${FOUND[this.T.step] ?? `It’s ${this.spec.whereName}.`} Grab it with 🐾` };
  }

  hint(P, ctx) { return this.step.hint?.(this, P, ctx) ?? null; }

  cleanup() {
    this.step.cleanup?.(this);
    if (this.item) this.rt.carry.remove(this.item);
    this.marker?.removeFromParent();
  }
}

/**
 * 📋 The Lost & Found board by your gate. Walk up to it and it offers a few jobs (made fresh by
 * ./offers.js: who + what + where + maybe a twist); pick one. One board job at a time; walk back up
 * to it to swap. Jobs are your own (each player's board is their own), but they're made from plain
 * data, so a pack could share one board later on.
 */
export class JobBoard {
  /**
   * @param o.live    { gus(), duchess(), postman() } → positions
   * @param o.others  () → other dogs' positions (friends in the pack)
   * @param o.busy    () → true while something else is on screen (a card, a game)
   */
  constructor({ scene, world, hud, carry, actions, player, seed, pos, friends, live, others, busy }) {
    Object.assign(this, { scene, world, hud, carry, actions, player, seed, pos, friends, others, busy });
    this.jw = new JobWorld(world, seed, { ...live, board: pos });
    this.offers = [];
    this.job = null;
    this.n = 0;
    this.near = false;
    this.cool = 0;
    this.key = '';
    this.ctx = { sniffing: false };
    const bags = new Map();
    this.rt = {
      scene, world, hud, carry, actions, player, jw: this.jw,
      anchor: () => actions.anchor(),
      onChange: () => friends.onChange?.(),
      line: (list, vars = {}) => {
        if (!bags.has(list)) bags.set(list, new LineBag(list));
        return fill(bags.get(list).next(), { name: friends.dogName(), ...vars });
      },
    };
  }

  /** A friend's dog is here to play with (so team jobs can come up). */
  get team() { return this.others().length > 0; }

  update(dt, P, ctx) {
    this.ctx = ctx;
    this.cool -= dt;
    const d = flat(P.pos, this.pos);
    if (d > 4) this.near = false;
    else if (d < 2.2 && !this.near && this.cool <= 0 && !this.busy()) { this.near = true; this.open(); }
    this.updateGreeter(dt);
    const run = this.job;
    if (!run) return;
    if (run.update(dt, P, { ...ctx, others: this.others() }) === 'done') { this.complete(run); return; }
    const o = run.objective(), key = o.title + o.sub;
    if (key !== this.key) { this.key = key; this.friends.onChange?.(); }
    // A team job, and everyone else has gone home: say so (it can be swapped at the board).
    if (run.T.team && !this.team && !run.alone) { run.alone = true; this.hud.showToastRaw('🐾🐾', 'Your friend has gone home!', 'This job needs two dogs — you can swap it at the 📋 board.'); }
    else if (this.team) run.alone = false;
  }

  /** Walked up to the board: pick a job (or, with one on the go, keep going or swap it). */
  open() {
    if (this.job) { this.showCurrent(); return; }
    this.refill();
    sfx.rustle?.();
    const helped = progress.stats.helped ?? 0;
    const rows = this.offers.map((o, i) => {
      const T = JOB_TYPES[o.type], tw = o.twist && TWISTS[o.twist];
      return `<button class="pill job-offer" data-i="${i}"><span class="je">${T.emoji}</span><span class="jt">${o.text}`
        + `<small>${PAWS[o.diff]} · +${o.stars} ⭐${tw ? ` · ${tw.emoji} +${o.bonus} ⭐ bonus` : ''}${T.team ? ' · 🤝 team job' : ''}</small></span></button>`;
    }).join('');
    this.hud.showCard(`<h1>📋 Lost &amp; Found</h1><p class="small">${helped ? `You’ve helped the neighbours ${helped} time${helped === 1 ? '' : 's'}! ` : ''}Pick a job:</p>`
      + `<div class="job-offers">${rows || '<p>No jobs right now. Come back soon!</p>'}</div>`, [['Not now', () => { this.hud.hideCard(); this.cool = 10; }]]);
    this.hud.card.querySelectorAll('.job-offer').forEach((b) => { b.onclick = () => this.accept(Number(b.dataset.i)); });
  }

  /** Top the board back up to three jobs (team ones only while a friend's here). */
  refill() {
    const busy = new Set([this.friends.gus?.job && 'gus', this.friends.duchess?.job && 'duchess'].filter(Boolean));
    const when = { season: season.name, weather: season.weather, festive: season.festive }; // (presents at Christmas, umbrellas in the rain…)
    this.offers = makeOffers(this.jw, new RNG(`jobs:${this.seed}:${Date.now()}:${this.n++}`), { n: 3, team: this.team, keep: this.offers, busy, when });
  }

  accept(i) {
    const spec = this.offers[i];
    if (!spec) return;
    this.offers.splice(i, 1);
    this.hud.hideCard();
    this.cool = 8;
    this.job = new JobRun(spec, this.rt);
    this.key = '';
    this.friends.focus = this.job;
    fsfx.tada();
    this.friends.onChange?.();
  }

  showCurrent() {
    const run = this.job;
    this.hud.showCard(`<h1>📋 Your job</h1><p class="job-now">${run.T.emoji} ${run.spec.text}</p>`, [
      ['🐾 Keep going', () => { this.hud.hideCard(); this.cool = 10; }],
      ['🔄 Swap it', () => { this.cancel(); this.open(); }],
    ]);
  }

  cancel() {
    const run = this.job;
    if (!run) return;
    run.cleanup();
    this.job = null;
    if (this.friends.focus === run) this.friends.focus = this.friends.jobs.find((j) => !j.done) ?? null;
    this.friends.onChange?.();
  }

  complete(run) {
    this.job = null;
    this.cool = 6;
    if (run.spec.twist === 'friend') run.twistOk = this.others().some((o) => flat(o, this.player.pos) < 8);
    this.friends.finish(run, () => this.thank(run), run.spec.stars);
    if (run.twistOk && run.spec.bonus) progress.award(run.spec.bonus, `${TWISTS[run.spec.twist].emoji} Bonus!`);
    run.cleanup();
  }

  /** Whoever it was for says thank you (and comes out of the front door to wave). */
  thank(run) {
    const p = run.person, T = run.T;
    let list = p.kind === 'kid' ? THANKS.kid : THANKS.grown;
    if (T.step === 'pickup') list = run.spec.item === 'cake' ? THANKS.cake : run.spec.item === 'present' ? THANKS.present : THANKS.delivery;
    if (T.critter === 'hen') list = THANKS.hen;
    else if (T.critter === 'ball') list = THANKS.football;
    else if (T.critter === 'umbrella') list = THANKS.umbrella;
    if (p.kind === 'baker') list = THANKS.baker;
    if (p.kind === 'gus') list = GUS.thanks;
    this.hud.say(`${p.emoji} ${this.rt.line(list, { item: run.def?.name ?? '', Hen: run.spec.hen ?? '' })}`, this.jw.anchor(p), 3.8);
    if (p.garden && flat(this.player.pos, p.garden.door) < 30) this.greet(p);
  }

  greet(p) {
    this.greeter?.p.root.removeFromParent();
    const q = new RNG(`look:${this.seed}:${p.id}`);
    const person = new Person({ shirt: q.pick(SHIRTS), trousers: q.pick(TROUSERS), skin: q.pick(SKINS), hair: q.pick(HAIRS) });
    const f = p.garden.front, door = p.garden.door;
    person.root.position.set(door.x + f.x * 0.35, 0.14, door.z + f.z * 0.35); // on the doorstep
    person.root.rotation.y = Math.atan2(f.x, f.z);
    person.wave = 2.6;
    this.scene.add(person.root);
    this.greeter = { p: person, t: 4.5, s: p.kid ? 0.68 : 1 };
  }

  updateGreeter(dt) {
    const g = this.greeter;
    if (!g) return;
    g.t -= dt;
    g.p.update(dt, 0);
    g.p.root.scale.setScalar(g.s * Math.max(0.01, Math.min(1, (4.5 - g.t) * 4, g.t * 3)));
    if (g.t <= 0) { g.p.root.removeFromParent(); this.greeter = null; }
  }

  target() { return this.job?.target() ?? null; }
  objective() { return this.job?.objective() ?? null; }
  get hint() { return this.job?.hint(this.player, this.ctx) ?? null; }
  onBark() { this.job?.bark(this.player); }
  onMischief() { this.job?.mischief(); }
}
