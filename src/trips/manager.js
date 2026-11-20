import * as THREE from 'three';
import { TRIPS, tripOrigin } from './registry.js';
import { disposeTree } from './dispose.js';
import { paintUniforms } from '../render/watercolorMaterial.js';
import { music } from '../core/music.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { writeSave } from '../core/save.js';

/*
 * 🧳 Going on a trip, and coming back. Down the drain: the dog squeezes in, the page turns to paper, the trip's
 * own little download arrives (the first time), and it's built into a scene of its own. The sun and the dog move
 * across, the camera gets the trip's limits, every shader it needs is made while the paper's still up, and out
 * she pops. The town waits meanwhile, paused (nothing in it moves; friends see "went down a drain!"), and back up
 * the drain the trip is thrown away again, every shape of it.
 *
 * A trip module's build(ctx) gives { scene, world, chapter, look }:
 *   world:   colliders, water, bounds, occluders, spawn(from) → { x, z, face }, exits, camera (limits), update(t), dispose()
 *   chapter: update(dt), dispose() (see kit.js: TripChapter)
 *   look:    { fog, near, far, background, light: [r, g, b], shadow: [r, g, b], skyFill, saturation, music, ambient }
 */

const step = (fn) => fn; // (a per-frame step: return true when it's done)

export class Trips {
  /** setActive({ scene, world, chapter, sky }): what main draws and runs (null: the town again). */
  constructor({ renderer, pipeline, camera, follow, sun, player, hud, input, town, setActive }) {
    Object.assign(this, { renderer, pipeline, camera, follow, sun, player, hud, input, town, setActive });
    this.cur = null;   // the trip she's on: { id, n, from, scene, world, chapter, look, geo0 }
    this.busy = false; // on the way in or out
    this.anim = null;  // what's happening this frame on the way in or out
  }

  get away() { return !!this.cur; }

  /** Every frame, from main (before the chapter's own update). */
  update(dt) {
    this.anim?.(dt);
    if (this.cur) this.town.awayTick(dt, this.cur.n); // (still in the pack: friends know she's away)
  }

  /** Start fetching a trip's download (near the way in, say), so going there doesn't wait for it. */
  prefetch(id) { TRIPS[id]?.load().catch(() => {}); }

  /** Run a per-frame step until it says it's done. */
  play(fn) { return new Promise((res) => { this.anim = (dt) => { if (fn(dt)) { this.anim = null; res(); } }; }); }

  /** The paper that covers the picture on the way in and out. */
  paper() {
    if (!this.fade?.isConnected) {
      this.fade = document.createElement('div');
      this.fade.className = 'travel-fade';
      this.hud.root.prepend(this.fade); // (under the HUD's buttons, over the picture)
    }
    return this.fade;
  }
  fadeTo(to, secs) {
    const f = this.paper(), from = Number(f.style.opacity || 0);
    let t = 0;
    return this.play((dt) => { t += dt; const k = Math.min(1, t / secs); f.style.opacity = (from + (to - from) * k).toFixed(3); return k >= 1; });
  }
  note(text) {
    this.clearNote();
    this.noteEl = document.createElement('div');
    this.noteEl.className = 'trip-note';
    this.noteEl.textContent = text;
    this.hud.root.appendChild(this.noteEl);
  }
  clearNote() { this.noteEl?.remove(); this.noteEl = null; }

  /** Freeze the dog for a cutscene (her height too). */
  hold() {
    const P = this.player;
    P.frozen = true; P.lockY = true; P.vel.set(0, 0); P.vy = 0;
    this.hud.setPrompt('');
  }
  /** …and give her back. */
  release(y = 0) {
    const P = this.player;
    P.dog.body.rotation.x = 0;
    P.pos.y = y; P.vy = 0; P.grounded = true; P.lockY = false; P.frozen = false;
  }

  /**
   * Go on trip `id`. from: { id (which way in, e.g. 'alley'), at: { x, z } (the hole to squeeze into, in town) }.
   * False if she can't just now (or it's already happening).
   */
  async go(id, from) {
    const T = TRIPS[id];
    if (!T || this.busy || this.cur) return false;
    this.busy = true;
    const P = this.player, town = this.town, geo0 = this.renderer.info.memory.geometries, t0 = performance.now();
    const mod = T.load(); // (already on its way if she came near the drain)
    this.hold();
    sfx.tunnel();
    buzz(30);
    // Squeeze in, nose first (or, scooped up in a net: just away she goes).
    const y0 = P.pos.y, sx = P.pos.x, sz = P.pos.z, at = from.at ?? { x: sx, z: sz };
    let t = 0;
    const f = this.paper();
    if (from.style === 'net') await this.fadeTo(1, 0.6);
    else {
      await this.play(step((dt) => {
        t += dt;
        const k = Math.min(1, t / 0.8), e = k * k * (3 - 2 * k);
        P.pos.set(sx + (at.x - sx) * e, y0 - Math.max(0, k - 0.25) / 0.75 * 0.95, sz + (at.z - sz) * e);
        P.dog.body.rotation.x = 0.9 * Math.sin(k * Math.PI * 0.5);
        f.style.opacity = Math.max(0, (k - 0.45) / 0.55).toFixed(3);
        return k >= 1;
      }));
    }
    const slow = setTimeout(() => this.note('🐾 Sniffing out the way…'), 300);
    let built;
    try {
      const m = await mod;
      town.pause({ id, n: T.n, from });
      const tb = performance.now();
      built = m.build({
        id, from: from.id, origin: tripOrigin(T.n),
        hud: this.hud.forTrip?.() ?? this.hud, input: this.input, player: P, pipeline: this.pipeline, follow: this.follow, camera: this.camera,
        town: town.tripInfo(id), leave: (exit) => this.leave(exit),
      });
      built.ms = performance.now() - tb;
    } catch (e) {
      console.warn('Trip failed:', e);
      clearTimeout(slow); this.clearNote();
      if (town.away) town.resume(from.id);
      this.release(y0);
      await this.fadeTo(0, 0.3);
      this.hud.showToastRaw('🐾', 'Hmm, can’t get through there just now.', 'Try again in a bit!', { tip: true });
      this.busy = false;
      return false;
    }
    clearTimeout(slow);
    const { scene, world, chapter, look } = built;
    // Across she goes: the sun and the dog into the trip's scene, the camera to its limits, the trip's look.
    scene.add(this.sun, this.sun.target, P.object);
    this.applyLook(look ?? {}, scene);
    this.follow.setOccluders(world.occluders ?? {});
    this.follow.setLimits(world.camera ?? null);
    const s = world.spawn(from.id);
    P.pos.set(s.x, s.y ?? 0, s.z);
    P.heading = s.face; P.object.rotation.y = s.face; P.dog.body.rotation.x = 0;
    this.follow.snap(P.pos);
    this.follow.yaw = s.face + Math.PI;
    this.follow.manualHold = 0;
    this.cur = { id, n: T.n, from, scene, world, chapter, look, geo0 };
    this.setActive({ scene, world, chapter, sky: built.sky ?? null }); // (an outdoor trip brings its own sky)
    // Every shader it needs, made now (behind the paper) rather than in a stutter on the way round.
    const ms = await this.compile(scene);
    this.clearNote();
    this.pipeline.settle?.(1500); // (a new place: not a sign of a slow phone)
    writeSave({ trip: { seed: town.layout.seed, id, from: from.id } });
    window.__report?.('trip-in', `${id} in ${Math.round(performance.now() - t0)} ms`, {
      build: Math.round(built.ms), compile: Math.round(ms), geometries: this.renderer.info.memory.geometries, programs: this.renderer.info.programs?.length,
      tris: triangles(scene),
    });
    console.info(`🧳 trip-in ${id}: build ${Math.round(built.ms)} ms, compile ${Math.round(ms)} ms, ${triangles(scene)} triangles`);
    // Out she pops.
    await this.fadeTo(0, 0.35);
    sfx.pop();
    this.release(s.y ?? 0);
    P.happy = 1;
    P.dog.shake?.();
    chapter.arrive?.(from.id);
    this.busy = false;
    return true;
  }

  /** Back to town, out at `exit` (a way out: 'alley', 'beach'…). */
  async leave(exit) {
    const x = this.cur;
    if (!x || this.busy) return false;
    this.busy = true;
    const P = this.player, town = this.town;
    this.hold();
    sfx.tunnel();
    buzz(20);
    await this.fadeTo(1, 0.4);
    // Back across: the sun and the dog to the town, the camera free again, and the trip thrown away.
    town.scene.add(this.sun, this.sun.target, P.object);
    this.setActive(null);
    this.follow.setOccluders(town.world.occluders ?? {});
    this.follow.setLimits(null);
    x.chapter.dispose?.();
    x.world.dispose?.();
    disposeTree(x.scene, town.scene); // (never anything the town's still using)
    this.cur = null;
    this.restoreLook();
    town.resume(exit);
    writeSave({ trip: null });
    this.pipeline.settle?.(1500);
    const leaked = this.renderer.info.memory.geometries - x.geo0;
    window.__report?.('trip-out', `${x.id} → ${exit}`, { leaked, geometries: this.renderer.info.memory.geometries });
    console.info(`🧳 trip-out ${x.id} → ${exit}: ${leaked} shapes more than before`);
    await this.fadeTo(0, 0.35);
    sfx.pop();
    this.release(P.pos.y);
    P.dog.shake?.();
    this.busy = false;
    return true;
  }

  /** Make every shader a scene needs (for the scene's own picture, which the paint pass reads). */
  async compile(scene) {
    const r = this.renderer, t0 = performance.now();
    try {
      r.setRenderTarget(this.pipeline.params.enabled ? this.pipeline.sceneRT : null);
      const p = r.compileAsync(scene, this.camera);
      r.setRenderTarget(null);
      await Promise.race([p, new Promise((res) => setTimeout(res, 4000))]);
    } catch { r.setRenderTarget(null); }
    return performance.now() - t0;
  }

  /** The trip's light and air (and tune). The town's season look puts its own back on the way home. */
  applyLook(L, scene) {
    this.saved = {
      light: paintUniforms.uLightTint.value.clone(), shadow: paintUniforms.uShadowTint.value.clone(),
      skyFill: paintUniforms.uSkyFill.value, sat: this.pipeline.params.saturation,
    };
    const fog = L.fog ?? 0xe4e6dc;
    scene.fog = new THREE.Fog(fog, L.near ?? 20, L.far ?? 70); // (always a fog: the same shaders as the town's, so they're shared)
    scene.background = new THREE.Color(L.background ?? fog);
    if (L.light) paintUniforms.uLightTint.value.multiply(new THREE.Color().setRGB(...L.light));
    if (L.shadow) paintUniforms.uShadowTint.value.multiply(new THREE.Color().setRGB(...L.shadow));
    if (L.skyFill !== undefined) paintUniforms.uSkyFill.value = L.skyFill;
    if (L.saturation !== undefined) this.pipeline.params.saturation = this.saved.sat * L.saturation;
    music.setPlace(L.music ?? 'town');
    music.setAmbient({ birds: 0, frogs: 0, drips: 0, ...(L.ambient ?? {}) });
  }
  restoreLook() {
    const s = this.saved;
    if (s) {
      paintUniforms.uLightTint.value.copy(s.light);
      paintUniforms.uShadowTint.value.copy(s.shadow);
      paintUniforms.uSkyFill.value = s.skyFill;
      this.pipeline.params.saturation = s.sat;
    }
    music.setAmbient({ birds: 1, drips: 0 });
  }
}

/** How many triangles a scene draws (for the trip's report). */
function triangles(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, c = g.index ? g.index.count : g.attributes.position?.count ?? 0;
    n += (c / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(n);
}
