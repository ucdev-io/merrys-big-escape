import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { TOWN } from '../../../world/town/generator.js';
import { blocked } from '../../../world/spots.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { CHALLENGES } from '../../challenges.js';
import { ord, secs, esc } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * This neighbourhood's dash course: hoops on the pavements round the blocks, a good hop apart, from
 * a start line by home. The same every time (so there are records to beat).
 */
export function dashCourse(world, layout, n = CHALLENGES.dash.hoops) {
  const rng = new RNG(`dash:${layout.seed}`);
  const home = layout.blocks.find((b) => b.type === 'home') ?? layout.blocks[0];
  const off = TOWN.BLOCK / 2 + 2.3; // the pavement, just outside a block
  const spots = [];
  for (const b of layout.blocks) {
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const along = rng.float(-7, 7);
      const p = { x: b.x + sx * off + (sz ? along : 0), z: b.z + sz * off + (sx ? along : 0), home: b === home };
      if (!blocked(world, p.x, p.z, 0.9)) spots.push(p);
    }
  }
  const start = spots.filter((s) => s.home).sort((a, b) => a.x - b.x || a.z - b.z)[0] ?? { x: home.x + off, z: home.z };
  const course = [], used = new Set([start]);
  let at = start;
  for (let k = 0; k < n; k++) {
    const opts = spots.filter((s) => !used.has(s) && !s.home && dist(at, s) > 16 && dist(at, s) < 44)
      .sort((a, b) => Math.abs(dist(at, a) - 28) - Math.abs(dist(at, b) - 28));
    const pick = opts[rng.int(0, Math.min(2, opts.length - 1))] ?? spots.find((s) => !used.has(s));
    if (!pick) break;
    used.add(pick);
    course.push(pick);
    at = pick;
  }
  return { start, course };
}

function hoop() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 10, 40), paint(0xf6c445, { emissive: 0x8a6a20 }));
  ring.position.y = 1.0;
  ring.castShadow = true;
  g.add(ring);
  for (const s of [-1, 1]) { // little posts
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.25, 6), paint(0xf1e8d8));
    post.position.set(s * 0.75, 0.12, 0);
    g.add(post);
  }
  g.userData.ring = ring;
  return g;
}

/** ⚡ Zoomies Dash: through every hoop, in order. Quickest wins (on your own: beat the clock). */
export class Dash {
  constructor(ctx, g) { Object.assign(this, { ctx, g }); }
  get title() { return 'Zoomies Dash'; }

  begin() {
    const { world, layout, scene, player, remotes, me } = this.ctx;
    const { start, course } = dashCourse(world, layout);
    this.next = 0;
    this.hoops = course.map((p, i) => {
      const h = hoop(), to = course[i + 1] ?? p, from = course[i - 1] ?? start;
      h.position.set(p.x, 0, p.z);
      h.rotation.y = Math.atan2((to.x - from.x) || 1e-3, (to.z - from.z) || 1e-3); // face the way through
      scene.add(h);
      return { h, p };
    });
    this.paint();
    // Everyone lines up at the start (only before it starts: latecomers just go from where they are).
    if (this.g.startAt > performance.now()) {
      const first = course[0] ?? start, ids = [me() ?? 0, ...remotes.dogs.keys()].sort((a, b) => a - b);
      const k = ids.indexOf(me() ?? 0), face = Math.atan2(first.x - start.x, first.z - start.z);
      const side = (k - (ids.length - 1) / 2) * 1.3;
      this.ctx.teleport(start.x + Math.cos(face) * side, start.z - Math.sin(face) * side, face);
      player.frozen = true;
    }
  }

  go() { this.ctx.player.frozen = false; }

  /** The next hoop shines gold; the rest wait, smaller and pale. */
  paint() {
    this.hoops.forEach(({ h }, i) => {
      h.visible = i >= this.next;
      const next = i === this.next;
      h.scale.setScalar(next ? 1 : 0.7);
      h.userData.ring.material = next ? (this.gold ??= paint(0xf6c445, { emissive: 0x8a6a20 })) : (this.pale ??= paint(0xf1e8d8));
    });
  }

  update(dt, live) {
    const { player, hud } = this.ctx, P = player.pos, N = this.hoops.length;
    const t = performance.now() - this.g.startAt;
    const nh = this.hoops[this.next];
    if (nh) nh.h.userData.ring.rotation.z += dt * 2;
    if (live && nh && Math.hypot(P.x - nh.p.x, P.z - nh.p.z) < 1.5) {
      this.next++;
      this.paint();
      sfx.pop?.(); buzz(20);
      hud.float(this.next < N ? `${this.next}/${N}!` : 'Finish! ⚡', this.ctx.anchor());
      if (this.next >= N) { this.doneMs = t; this.ctx.send({ a: 'done' }); sfx.hooray?.(); }
    }
    const aim = this.hoops[this.next];
    return {
      compass: aim ? { pos: aim.h.position, emoji: '⚡', label: `⚡ ${this.next + 1}/${N}` } : null, clock: false,
      banner: this.next >= N ? `⚡ Finished in ${secs(this.doneMs)}! Waiting for the others…` : `⚡ Hoop ${this.next + 1}/${N} · ${t < 1000 ? 'GO!' : secs(t)}`,
    };
  }

  handle(m) {
    if (m.a !== 'finish') return;
    const { hud, me } = this.ctx;
    if (m.id === me()) { hud.showToastRaw('⚡', `You came ${ord(m.place)}! (${secs(m.ms)})`, ''); buzz([30, 50, 30]); return; }
    hud.showToastRaw('⚡', '', `${ord(m.place)}: ${m.name} (${secs(m.ms)})`);
    hud.toast.querySelector('.t-head').textContent = `${m.name} finished ${ord(m.place)}!`;
  }

  results(game) {
    const me = this.ctx.me(), N = this.hoops.length;
    const rows = game.finishers.map((f, i) => `<li>${ord(i + 1)} · ${esc(f.id === me ? 'You' : f.name)} · ${secs(f.ms)}</li>`).join('') || '<li>Nobody made it round in time!</li>';
    const mine = game.finishers.findIndex((f) => f.id === me);
    const multi = game.finishers.length > 1 || this.ctx.remotes.dogs.size > 0;
    const xp = mine >= 0 ? (multi ? [30, 20][mine] ?? 10 : 25) : Math.min(20, this.next * 3);
    const note = mine < 0 ? `<p>You got through ${this.next} of ${N} hoops. Nearly!</p>` : '';
    return { html: `<h1>⚡ Zoomies Dash</h1><ol class="results">${rows}</ol>${note}`, xp, won: multi && mine === 0 };
  }

  cleanup() {
    for (const { h } of this.hoops ?? []) h.removeFromParent();
    this.ctx.player.frozen = false;
  }
}
