import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { TOWN } from '../../../world/town/generator.js';
import { freeSpot } from '../../../world/spots.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { ord, secs, esc } from './common.js';

const H = TOWN.BLOCK / 2;

function flag() {
  const g = new THREE.Group();
  const m = (geo, c, pos, rot = [0, 0, 0]) => { const o = new THREE.Mesh(geo, paint(c)); o.position.set(...pos); o.rotation.set(...rot); o.castShadow = true; g.add(o); };
  m(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), 0xf1e8d8, [0, 1.3, 0]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) m(new THREE.BoxGeometry(0.22, 0.2, 0.02), (i + j) % 2 ? 0x2b2626 : 0xffffff, [0.14 + i * 0.22, 2.4 - j * 0.2, 0]);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 40), paint(0xf6d06a, { emissive: 0x8a6a20 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  g.userData.ring = ring;
  return g;
}

/**
 * 🏁 Race: everyone races to one of the town's places; first there wins. On your own it's a time
 * trial against your best (kept on this device: every race goes somewhere different).
 */
export class Race {
  /** Where to race to: somewhere that isn't right here. */
  static pick({ layout, player }) {
    const P = player.pos;
    const far = layout.places.filter((p) => Math.hypot(p.x - P.x, p.z - P.z) > 30);
    const list = far.length ? far : layout.places;
    return { target: list[Math.floor(Math.random() * list.length)].id };
  }

  constructor(ctx, g) { Object.assign(this, { ctx, g }); }
  get title() { return `Race to the ${this.place.name}`; }

  begin() {
    const { layout, world, scene } = this.ctx, g = this.g;
    this.place = layout.places.find((p) => p.id === g.target) ?? layout.places[0];
    const at = freeSpot(world, new RNG(`race:${g.id}:${this.place.id}`), this.place.x, this.place.z, 0, 8) ?? { x: this.place.x, z: this.place.z };
    this.flag = flag();
    this.flag.position.set(at.x, 0, at.z);
    scene.add(this.flag);
  }

  update(dt, live) {
    this.flag.userData.ring.rotation.z += dt;
    const P = this.ctx.player.pos, pl = this.place;
    if (live && !this.sent && Math.abs(P.x - pl.x) < H + 1 && Math.abs(P.z - pl.z) < H + 1) { this.sent = true; this.ctx.pack.sendGame({ a: 'done' }); }
    const t = performance.now() - this.g.startAt;
    return {
      compass: { pos: this.flag.position, emoji: '🏁' }, clock: false,
      banner: this.sent ? '🏁 Finished! Waiting for the others…' : `🏁 ${this.title}! ${t < 1000 ? 'GO!' : secs(t)}`,
    };
  }

  handle(m) {
    if (m.a !== 'finish') return;
    const { hud, me } = this.ctx;
    const mine = m.id === me();
    if (mine) { sfx.hooray?.(); buzz([30, 50, 30]); }
    hud.showToastRaw('🏁', mine ? `You came ${ord(m.place)}! (${secs(m.ms)})` : '', mine ? '' : `${ord(m.place)}: ${m.name} (${secs(m.ms)})`);
    if (!mine) hud.toast.querySelector('.t-head').textContent = `${m.name} finished ${ord(m.place)}!`;
  }

  results(game) {
    const me = this.ctx.me(), solo = this.ctx.remotes.dogs.size === 0;
    const rows = game.finishers.map((f, i) => `<li>${ord(i + 1)} · ${esc(f.id === me ? 'You' : f.name)} · ${secs(f.ms)}</li>`).join('') || '<li>Nobody made it in time!</li>';
    const mine = game.finishers.findIndex((f) => f.id === me);
    let best = '', won = mine === 0 && game.finishers.length > 1;
    if (mine >= 0 && solo) { // on your own: beat your best
      const key = `merry.race.${this.ctx.layout.seed}.${game.target}`, ms = game.finishers[mine].ms;
      let prev = null; try { prev = Number(localStorage.getItem(key)) || null; } catch { /* */ }
      if (!prev || ms < prev) {
        try { localStorage.setItem(key, String(ms)); } catch { /* */ }
        best = `<p>🎉 ${prev ? `New best! (was ${secs(prev)})` : 'Your first time here — beat it next time!'}</p>`;
        won = !!prev;
      } else best = `<p>Your best is ${secs(prev)}. So close!</p>`;
    }
    return { html: `<h1>🏁 Race to the ${esc(this.place.name)}</h1><ol class="results">${rows}</ol>${best}`, xp: mine >= 0 ? [30, 20][mine] ?? 10 : 0, won };
  }

  cleanup() { this.flag?.removeFromParent(); }
}
