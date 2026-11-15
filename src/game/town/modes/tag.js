import * as THREE from 'three';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { esc, medal, nameOf } from './common.js';

/** 🐾 Tag: one dog is "it" (a red ring follows them); touch another dog to pass it on. Most tags wins. */
export class Tag {
  constructor(ctx, g) {
    Object.assign(this, { ctx, g });
    g.tagCD = 0;
  }

  begin() {
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 32), paint(0xd9534f, { emissive: 0x7a1a10 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.ctx.scene.add(this.ring);
  }

  update(dt, live) {
    const { player, pack, remotes, me } = this.ctx, g = this.g, P = player.pos;
    const it = g.it === me() ? player.object : remotes.dogs.get(g.it)?.dog.root;
    this.ring.visible = !!it;
    if (it) this.ring.position.set(it.position.x, it.position.y + 0.05, it.position.z);
    g.tagCD -= dt;
    if (live && g.it === me() && g.tagCD <= 0) { // we're it: touching a dog tags them
      for (const r of remotes.dogs.values()) {
        const q = r.dog.root.position;
        if (r.dog.root.visible && Math.hypot(q.x - P.x, q.z - P.z) < 0.95 && Math.abs(q.y - P.y) < 0.8) { g.tagCD = 1.6; pack.sendGame({ a: 'tag', target: r.id }); break; }
      }
    }
    return { banner: `🐾 ${g.it === me() ? 'You’re IT!' : `${nameOf(this.ctx, g, g.it)} is it`}` };
  }

  handle(m) {
    if (m.a !== 'it') return;
    const { hud, me } = this.ctx, g = this.g;
    g.it = m.it; g.tags = m.tags;
    if (m.by) g.names[m.by] = m.byName;
    g.names[m.it] = m.name;
    const mine = m.it === me();
    if (mine) { sfx.bonk?.(); buzz([40, 30, 40]); }
    hud.showToastRaw('🐾', mine ? 'You’re IT! Tag someone!' : '', '');
    if (!mine) hud.toast.querySelector('.t-head').textContent = m.byName ? `${m.byName} tagged ${m.name}! Run!` : `${m.name} is it now!`;
  }

  results(game) {
    const me = this.ctx.me(), g = this.g;
    const list = Object.entries(game.tags).sort((a, b) => b[1] - a[1]);
    const rows = list.map(([id, n], i) => `<li>${medal(i)} ${esc(nameOf(this.ctx, g, Number(id)))} · ${n} tag${n > 1 ? 's' : ''}</li>`).join('') || '<li>No tags at all! Very sneaky dogs.</li>';
    const won = !!list[0] && Number(list[0][0]) === me;
    return {
      html: `<h1>🐾 Tag: time’s up!</h1><p>${game.it === me ? 'You were it at the end!' : `${esc(nameOf(this.ctx, g, game.it))} was it at the end!`}</p><ol class="results">${rows}</ol>`,
      xp: 10 + (won ? 20 : 0), won,
    };
  }

  cleanup() { this.ring?.removeFromParent(); }
}
