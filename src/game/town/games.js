import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { TOWN } from '../../world/town/generator.js';
import { freeSpot } from '../../world/spots.js';
import { paint } from '../../render/watercolorMaterial.js';
import { progress } from '../progress.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = TOWN.BLOCK / 2;
const ord = (n) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function flag() {
  const g = new THREE.Group();
  const m = (geo, c, pos, rot = [0, 0, 0]) => { const o = new THREE.Mesh(geo, paint(c)); o.position.set(...pos); o.rotation.set(...rot); o.castShadow = true; g.add(o); };
  m(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), 0xf1e8d8, [0, 1.3, 0]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) m(new THREE.BoxGeometry(0.22, 0.2, 0.02), (i + j) % 2 ? 0x2b2626 : 0xffffff, [0.14 + i * 0.22, 2.4 - j * 0.2, 0]);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 40), paint(0xf6d06a, { emissive: 0x8a6a20 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  return g;
}

function itRing() {
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 32), paint(0xd9534f, { emissive: 0x7a1a10 }));
  r.rotation.x = Math.PI / 2;
  return r;
}

/**
 * Games with friends in a pack (the server keeps score):
 *   🏁 Race — everyone races to one of the town's places; first there wins. On your own it's a
 *            time trial against your best.
 *   🐾 Tag  — one dog is "it" (a red ring follows them); touch another dog to pass it on. Most
 *            tags when the time's up wins.
 */
export class TownGames {
  constructor({ scene, world, hud, player, pack, remotes, layout }) {
    Object.assign(this, { scene, world, hud, player, pack, remotes, layout });
    this.game = null;
    this.banner = document.createElement('div');
    this.banner.className = 'game-banner hidden';
    hud.root.appendChild(this.banner);
    this.ring = itRing();
    this.ring.visible = false;
    scene.add(this.ring);
  }

  get active() { return !!this.game && !this.game.over; }

  /** From the 👥 card: start a race (to a random place that isn't right here) or a game of tag. */
  start(kind) {
    if (this.active) return;
    let target;
    if (kind === 'race') {
      const P = this.player.pos;
      const far = this.layout.places.filter((p) => Math.hypot(p.x - P.x, p.z - P.z) > 30);
      const list = far.length ? far : this.layout.places;
      target = list[Math.floor(Math.random() * list.length)].id;
    }
    this.pack.sendGame({ a: 'start', kind, target });
  }

  /** A message from the server about the current game. */
  handle(m) {
    if (m.a === 'nope') { this.hud.showToastRaw('🐾', m.msg, 'Ask a friend to join your pack first.'); return; }
    if (m.a === 'start') return this.begin(m.game);
    const g = this.game;
    if (!g || m.game?.id && m.game.id !== g.id) return;
    if (m.a === 'finish') {
      const me = m.id === this.pack.net?.id;
      if (me) { sfx.hooray?.(); buzz([30, 50, 30]); }
      this.hud.showToastRaw('🏁', me ? `You came ${ord(m.place)}! (${secs(m.ms)})` : '', me ? '' : `${ord(m.place)}: ${m.name} (${secs(m.ms)})`);
      if (!me) this.hud.toast.querySelector('.t-head').textContent = `${m.name} finished ${ord(m.place)}!`;
    } else if (m.a === 'it') {
      g.it = m.it; g.tags = m.tags;
      if (m.by) g.names[m.by] = m.byName;
      g.names[m.it] = m.name;
      const me = m.it === this.pack.net?.id;
      if (me) { sfx.bonk?.(); buzz([40, 30, 40]); }
      this.hud.showToastRaw('🐾', me ? 'You’re IT! Tag someone!' : '', '');
      if (!me) this.hud.toast.querySelector('.t-head').textContent = m.byName ? `${m.byName} tagged ${m.name}! Run!` : `${m.name} is it now!`;
    } else if (m.a === 'end') this.finish(m.game);
  }

  begin(game) {
    this.cleanup();
    const now = performance.now();
    this.game = { ...game, startAt: now + game.startsIn, endAt: now + game.endsIn, sentDone: false, tagCD: 0, names: {} };
    for (const r of this.remotes.dogs.values()) this.game.names[r.id] = r.name; // (remembered, in case they go home before the end)
    if (game.kind === 'race') {
      const place = this.layout.places.find((p) => p.id === game.target) ?? this.layout.places[0];
      const at = freeSpot(this.world, new RNG(`race:${game.id}:${place.id}`), place.x, place.z, 0, 8) ?? { x: place.x, z: place.z };
      this.game.place = place;
      this.game.flag = flag();
      this.game.flag.position.set(at.x, 0, at.z);
      this.scene.add(this.game.flag);
    }
    sfx.pop?.();
  }

  cleanup() {
    this.game?.flag?.removeFromParent();
    this.ring.visible = false;
    this.banner.classList.add('hidden');
  }

  finish(game) {
    const g = this.game;
    if (!g) return;
    g.over = true;
    this.cleanup();
    const me = this.pack.net?.id;
    let html, xp = 0;
    if (game.kind === 'race') {
      const rows = game.finishers.map((f, i) => `<li>${ord(i + 1)} · ${esc(f.name)} · ${secs(f.ms)}</li>`).join('') || '<li>Nobody made it in time!</li>';
      const mine = game.finishers.findIndex((f) => f.id === me);
      if (mine >= 0) xp = [30, 20][mine] ?? 10;
      // On your own: beat your best time.
      let best = '';
      if (mine >= 0 && this.remotes.dogs.size === 0) {
        const key = `merry.race.${this.layout.seed}.${game.target}`, ms = game.finishers[mine].ms;
        let prev = null; try { prev = Number(localStorage.getItem(key)) || null; } catch { /* */ }
        if (!prev || ms < prev) { try { localStorage.setItem(key, String(ms)); } catch { /* */ } best = `<p>🎉 ${prev ? `New best! (was ${secs(prev)})` : 'Your first time here — beat it next time!'}</p>`; }
        else best = `<p>Your best is ${secs(prev)}. So close!</p>`;
      }
      html = `<h1>🏁 Race to the ${esc(g.place?.name ?? 'finish')}</h1><ol class="results">${rows}</ol>${best}`;
    } else {
      const names = new Map([...Object.entries(g.names).map(([id, n]) => [Number(id), n]), ...[...this.remotes.dogs.values()].map((r) => [r.id, r.name]), [me, 'You']]);
      const list = Object.entries(game.tags).sort((a, b) => b[1] - a[1]);
      const rows = list.map(([id, n]) => `<li>${esc(names.get(Number(id)) ?? 'A dog')} · ${n} tag${n > 1 ? 's' : ''}</li>`).join('') || '<li>No tags at all! Very sneaky dogs.</li>';
      xp = 10 + (list[0] && Number(list[0][0]) === me ? 20 : 0);
      html = `<h1>🐾 Tag: time’s up!</h1><p>${game.it === me ? 'You were it at the end!' : `${esc(names.get(game.it) ?? 'Someone')} was it at the end!`}</p><ol class="results">${rows}</ol>`;
    }
    if (xp) progress.award(xp, game.kind === 'race' ? 'Race!' : 'Tag!');
    progress.stat('games');
    sfx.hooray?.();
    this.hud.showCard(html, [['🎮 Again!', () => { this.hud.hideCard(); this.start(game.kind); }], ['OK', () => this.hud.hideCard()]]);
  }

  /** Per frame: countdown, finishing a race, tagging. Returns a compass target or null. */
  update(dt) {
    const g = this.game;
    if (!g || g.over) return null;
    const now = performance.now(), P = this.player.pos;
    const toGo = (g.startAt - now) / 1000;
    if (toGo > 0) { // 3… 2… 1…
      const n = Math.ceil(toGo);
      if (n !== g.shown) { g.shown = n; sfx.plip?.(); }
      this.banner.className = 'game-banner big';
      this.banner.textContent = n <= 3 ? `${n}` : (g.kind === 'race' ? `🏁 Race to the ${g.place?.name}!` : '🐾 Tag! Get ready…');
    } else {
      if (!g.go) { g.go = true; sfx.found?.(); buzz(30); }
      const left = Math.max(0, (g.endAt - now) / 1000);
      this.banner.className = 'game-banner';
      if (g.kind === 'race') this.banner.textContent = g.sentDone ? '🏁 Finished! Waiting for the others…' : `🏁 Race to the ${g.place?.name}! ${toGo > -1 ? 'GO!' : secs(-toGo * 1000)}`;
      else this.banner.textContent = `🐾 ${g.it === this.pack.net?.id ? 'You’re IT!' : `${this.remotes.dogs.get(g.it)?.name ?? 'Someone'} is it`} · ${Math.ceil(left)}s`;
    }
    if (g.kind === 'race') {
      g.flag.children.forEach((c) => { if (c.geometry?.type === 'TorusGeometry') c.rotation.z += dt; });
      const pl = g.place;
      if (toGo <= 0 && !g.sentDone && Math.abs(P.x - pl.x) < H + 1 && Math.abs(P.z - pl.z) < H + 1) { g.sentDone = true; this.pack.sendGame({ a: 'done' }); }
      return { pos: g.flag.position, emoji: '🏁' };
    }
    // Tag: the red ring follows whoever's it; if that's us, touching a dog tags them.
    const me = this.pack.net?.id, it = g.it === me ? this.player.object : this.remotes.dogs.get(g.it)?.dog.root;
    this.ring.visible = !!it;
    if (it) this.ring.position.set(it.position.x, it.position.y + 0.05, it.position.z);
    g.tagCD -= dt;
    if (toGo <= 0 && g.it === me && g.tagCD <= 0) {
      for (const r of this.remotes.dogs.values()) {
        const q = r.dog.root.position;
        if (r.dog.root.visible && Math.hypot(q.x - P.x, q.z - P.z) < 0.95 && Math.abs(q.y - P.y) < 0.8) { g.tagCD = 1.6; this.pack.sendGame({ a: 'tag', target: r.id }); break; }
      }
    }
    return null;
  }
}
