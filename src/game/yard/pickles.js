import * as THREE from 'three';
import { Cat } from '../../entities/cat.js';
import { Voice } from '../dialogue.js';
import { PICKLES_LINES, PICKLES_WORDS } from '../lines/pickles.js';
import { sfx } from '../../core/audio.js';

/** What she says that's a real hint, not a joke (and any line starting 💡). */
const HINTS = new Set(['stuck', 'sockHint', 'hint']);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);

export const CAT_SPOTS = [
  { pos: V(2.5, 1.05, 8.0), yaw: Math.PI },
  { pos: V(10.0, 1.05, 1.5), yaw: -Math.PI / 2 },
  { pos: V(-6.0, 1.05, 8.0), yaw: Math.PI },
  { pos: V(-10.0, 1.05, -3.0), yaw: Math.PI / 2 },
];

/**
 * Pickles on the fence: hops between spots, and keeps up a running commentary on whatever the
 * dog is doing — zoomies, jumping, sniffing, swimming, mischief, standing about — drawing from
 * big no-repeat line pools (see lines/pickles.js) with a cooldown per situation.
 */
export class Pickles {
  /** @param vars () => ({ name, breed, breedKey }) for filling in her lines */
  constructor(scene, hud, vars) {
    this.hud = hud;
    this.vars = vars;
    this.cat = new Cat();
    this.spot = 0;
    this.cat.root.position.copy(CAT_SPOTS[0].pos);
    this.cat.root.rotation.y = CAT_SPOTS[0].yaw;
    scene.add(this.cat.root);
    this.voice = new Voice(PICKLES_LINES, PICKLES_WORDS, { gap: 5 });
    this.anchor = () => this.cat.bubbleAnchor(new THREE.Vector3());
    this.idleT = 16;
    this.watch = { zoom: 0, still: 0, jumps: [], wasWater: false };
  }

  /** Say a line from a situation pool. Returns true if she spoke. */
  say(situation, { cooldown = 0, force = false, dur = 3.5 } = {}) {
    const line = this.voice.say(situation, this.vars(), { cooldown, force });
    if (!line) return false;
    // A real hint (💡) looks different from her jokes: a yellow bubble you can spot without reading it.
    const hint = HINTS.has(situation) || line.startsWith('💡');
    this.hud.say(hint && !line.startsWith('💡') ? `💡 ${line}` : line, this.anchor, hint ? Math.max(dur, 5) : dur, hint ? 'cat hint' : 'cat'); // ('cat': off screen, it says who's talking)
    return true;
  }

  /** Idle chatter: mostly general, sometimes about your breed in particular. */
  chatter() {
    const breedKey = this.vars().breedKey;
    if (this.voice.has(breedKey) && Math.random() < 0.35) return this.say(breedKey);
    return this.say('idle');
  }

  hopTo(i) {
    if (i === this.spot) return;
    this.spot = i;
    this.cat.hopTo(CAT_SPOTS[i].pos, CAT_SPOTS[i].yaw);
  }
  hopOn() { this.hopTo((this.spot + 1) % CAT_SPOTS.length); }

  startle() { this.cat.startle = 1; sfx.hiss(); }
  laugh(n = 1.5) { this.cat.laugh = n; }

  /** Watch what the dog gets up to and comment on it. */
  update(dt, player, { talk }) {
    this.cat.update(dt, player.pos);
    if (!talk) return;
    const w = this.watch, now = performance.now() / 1000;

    // Zoomies: proper galloping for a couple of seconds.
    w.zoom = player.speed > 4.2 ? w.zoom + dt : 0;
    if (w.zoom > 1.6 && this.say('zoomies', { cooldown: 30 })) w.zoom = -10;
    // Lots of jumping.
    if (player.jumped) w.jumps.push(now);
    w.jumps = w.jumps.filter((t) => now - t < 6);
    if (w.jumps.length >= 3 && this.say('jump', { cooldown: 30 })) w.jumps.length = 0;
    // Standing about doing nothing.
    w.still = player.speed < 0.1 && !player.frozen ? w.still + dt : 0;
    if (w.still > 14 && this.say('stuck', { cooldown: 45 })) w.still = 0;
    // Into the paddling pool.
    if (player.inWater && !w.wasWater) this.say('swim', { cooldown: 40 });
    w.wasWater = player.inWater;

    // Every so often, just being Pickles.
    this.idleT -= dt;
    if (this.idleT <= 0) { this.chatter(); this.idleT = rand(16, 26); }
  }

  /** Long sniffs get commented on too (called by the chapter with how long sniff's been held). */
  sniffing(held) { if (held > 3) this.say('sniff', { cooldown: 40 }); }
}
