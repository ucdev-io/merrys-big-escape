import * as THREE from 'three';
import { Dog } from '../../src/entities/dog.js';
import { WatercolorPipeline } from '../../src/render/watercolorPass.js';
import { applyStyle } from '../../src/render/stylePresets.js';
import { paint, paintUniforms } from '../../src/render/watercolorMaterial.js';
import { skyDome, tree, bush, picketFence, flowerBed, gnome } from '../../src/world/props.js';
import { PALETTE } from '../../src/render/palette.js';
import { RNG } from '../../src/core/rng.js';
import { sfx } from '../../src/core/audio.js';

/**
 * Merry, live, in the game's own watercolour: the same dog and the same paint as Merry's Big Escape.
 *
 *   scenery 'walk': a long garden strip seen from the side. setPace(m/s) walks her along it (the
 *                   garden slides past, so she stays put on screen).
 *   scenery 'nook': a little corner of a garden, Merry three-quarters on, for a framed picture.
 *
 * She looks towards the pointer (or the last touch), and onTap() fires when she's tapped.
 * It only draws while the canvas is on screen and the page is visible. `still`: no walking, and a
 * gentle frame rate (for people who'd rather not have things move).
 */
const isPhone = matchMedia('(pointer: coarse)').matches;
const TILE = 48; // the 'walk' garden repeats every TILE metres

export class Stage {
  constructor(canvas, { scenery = 'walk', still = false, view = {} } = {}) {
    this.canvas = canvas;
    this.scenery = scenery;
    this.still = still;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false }));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.bestRatio = Math.min(devicePixelRatio, isPhone ? 2 : 1.5);
    this.ratio = this.bestRatio;
    const pipeline = (this.pipeline = new WatercolorPipeline(renderer, { quality: isPhone ? 'low' : 'high' }));
    applyStyle(pipeline, 'storybook');
    if (isPhone) Object.assign(pipeline.params, { paper: 0.4, vignette: 0.25, granulation: 0.4 });
    pipeline.onTooSlow = () => { if (this.ratio <= 1) return false; this.ratio = Math.max(1, this.ratio - 0.25); this.resize(); return true; };
    pipeline.onFast = () => { if (this.ratio >= this.bestRatio) return false; this.ratio = Math.min(this.bestRatio, this.ratio + 0.25); this.resize(); return true; };

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0xe4e6dc, 14, 55);
    this.sky = skyDome(70);
    scene.add(this.sky);

    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 1.0));
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 40 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    sun.position.set(8, 14, 6);
    scene.add(sun, sun.target);
    paintUniforms.uSunIntensity.value = sun.intensity;

    this.camera = new THREE.PerspectiveCamera(view.fov ?? 32, 1, 0.1, 120);
    this.dog = new Dog('merry');
    scene.add(this.dog.root);
    this.ground();
    if (scenery === 'walk') this.walkScenery();
    else this.nookScenery();
    this.frame(view);

    // Walking and looking.
    this.pace = 0; this.speed = 0; this.travel = 0; this.idle = 0; this.dir = 1;
    this.gaze = { yaw: 0, pitch: 0, wantYaw: 0, wantPitch: 0, active: 0 };
    this.taps = new Set();
    this.last = performance.now();
    this.visible = true; this.onScreen = true; this.running = false; this.drawn = 0;

    this.resize();
    addEventListener('resize', () => { this.resize(); pipeline.settle(1200); });
    document.addEventListener('visibilitychange', () => this.wake());
    new IntersectionObserver(([e]) => { this.onScreen = e.isIntersecting; this.wake(); }).observe(canvas);
    addEventListener('pointermove', (e) => this.lookAtScreen(e.clientX, e.clientY), { passive: true });
    addEventListener('pointerdown', (e) => this.lookAtScreen(e.clientX, e.clientY), { passive: true });
    canvas.addEventListener('click', (e) => { if (this.hitsDog(e.clientX, e.clientY)) this.tapped(); });
  }

  // ---------- the set ----------

  ground() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), paint(PALETTE.grass));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.scene.add(g);
  }

  /** A long garden: fence, trees and flowerbeds behind, a few flowers in front; two copies, end to end. */
  walkScenery() {
    this.world = new THREE.Group();
    this.scene.add(this.world);
    for (let copy = 0; copy < 2; copy++) {
      const rng = new RNG(7), part = new THREE.Group();
      part.position.x = copy * TILE;
      part.add(picketFence(-TILE / 2, -3.4, TILE / 2, -3.4, null, { height: 0.85 }));
      const path = new THREE.Mesh(new THREE.PlaneGeometry(TILE, 1.5), paint(PALETTE.path));
      path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, 0); path.receiveShadow = true;
      part.add(path);
      for (let x = -TILE / 2 + 2; x < TILE / 2; x += rng.float(5, 8)) {
        part.add(tree(x, rng.float(-9, -5), rng.float(0.9, 1.3), rng, null));
        if (rng.chance(0.7)) part.add(bush(x + rng.float(2, 3), rng.float(-4.8, -4.2), rng.float(0.6, 0.9), rng, null, rng.pick([PALETTE.leaf, PALETTE.leafDark])));
        if (rng.chance(0.6)) part.add(flowerBed(x + rng.float(-1, 1), -2.6, rng.float(1.6, 2.6), 0.6, rng, null));
        if (rng.chance(0.35)) part.add(flowerBed(x + rng.float(-1, 1), 2.1, rng.float(1, 1.8), 0.5, rng, null));
      }
      part.add(gnome(6, -2.2, 0.4));
      part.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      this.world.add(part);
    }
    this.dog.root.rotation.y = Math.PI / 2; // facing along +x: the way the garden goes past
  }

  /** A garden corner: a bush, flowers and a gnome round Merry. */
  nookScenery() {
    const rng = new RNG(11);
    const add = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; }); this.scene.add(o); return o; };
    add(bush(-1.9, -1.6, 1.0, rng, null, PALETTE.leaf));
    add(bush(2.1, -2.2, 1.2, rng, null, PALETTE.leafDark));
    add(tree(0.6, -6, 1.2, rng, null));
    add(tree(-4.5, -8, 1.0, rng, null));
    add(flowerBed(-1.6, -0.6, 1.4, 0.5, rng, null));
    add(flowerBed(1.7, -0.9, 1.2, 0.5, rng, null));
    add(gnome(1.3, 0.4, -0.5));
    add(picketFence(-7, -3.6, 7, -3.6, null));
    this.dog.root.rotation.y = 0.45;
  }

  /** Where the camera looks from (view.at: the point to look at, view.from: an offset from it). */
  frame(view) {
    const walk = this.scenery === 'walk';
    this.look = new THREE.Vector3(...(view.at ?? (walk ? [0.6, 0.45, 0] : [0, 0.42, 0])));
    this.from = new THREE.Vector3(...(view.from ?? (walk ? [0, 0.7, 6.2] : [0.3, 0.55, 3.1])));
    this.shift = view.shift ?? 0; // (slides the picture sideways, to leave room for words beside her)
    this.autoFit = view.fit ?? true; // (step back on narrow screens so all of her fits)
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(Math.floor(w * this.ratio), Math.floor(h * this.ratio));
    this.camera.aspect = w / h;
    // Narrow screens: step back so all of her fits.
    this.fit = Math.max(1, 1.05 / Math.min(1.05, this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  // ---------- what the page asks for ----------

  /** Walking speed in metres a second (0 = stand; ~1.5 a trot; 5+ a gallop). Negative: she turns round and goes back. */
  setPace(v) {
    if (this.still) v = 0;
    if (Math.abs(v) > 0.3) this.dir = Math.sign(v);
    this.pace = Math.min(8, Math.abs(v));
  }
  /** Where her head is on the page (CSS pixels), e.g. for a speech bubble. */
  headScreen() {
    const p = this.dog.head.getWorldPosition(new THREE.Vector3()).project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  /** A trick: 'bow' | 'spin' | 'sit' | 'roll' | 'howl' | 'dance'. */
  trick(kind) { if (this.speed < 0.3) this.dog.emote(kind); }
  bark() { this.dog.bark(); sfx.bark(1.05, 0.7); }
  onTap(fn) { this.taps.add(fn); }
  tapped() { this.bark(); for (const fn of this.taps) fn(); }
  /** Move the picture sideways (0 = Merry in the middle; ±1 = a screen's width). */
  setShift(s) { this.shift = s; }

  lookAtScreen(x, y) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    // Where the pointer is, about a metre in front of her towards us.
    const head = this.dog.head.getWorldPosition(new THREE.Vector3());
    const toCam = this.camera.position.clone().sub(head).setY(0).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCam, head.clone().addScaledVector(toCam, 1.4));
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    const local = this.dog.root.worldToLocal(p.clone()), h = this.dog.root.worldToLocal(head.clone());
    const d = local.sub(h);
    this.gaze.wantYaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.1, 1.1);
    this.gaze.wantPitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.6);
    this.gaze.active = 3; // seconds before she goes back to her own looking about
  }

  hitsDog(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    if (ray.intersectObject(this.dog.root, true).length) return true;
    // (a little forgiving: near her counts too)
    const c = this.dog.body.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return Math.hypot((c.x - ((x - r.left) / r.width) * 2 + 1) * this.camera.aspect, c.y + ((y - r.top) / r.height) * 2 - 1) < 0.22;
  }

  // ---------- drawing ----------

  start() { this.running = true; this.wake(); return this; }
  stop() { this.running = false; }
  wake() {
    if (this.raf || !this.running || document.hidden || !this.onScreen) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  tick(now) {
    this.raf = 0;
    if (!this.running || document.hidden || !this.onScreen) return;
    const raw = Math.max(0, (now - this.last) / 1000), dt = Math.min(raw, 1 / 20);
    this.last = now;
    this.update(dt);
    this.pipeline.adapt(raw);
    this.pipeline.render(this.scene, this.camera);
    if (++this.drawn === 2) this.canvas.dispatchEvent(new Event('painted'));
    if (this.still) setTimeout(() => this.wake(), 60); // (a calm ~15 fps: breathing and blinking)
    else this.wake();
  }

  update(dt) {
    const dog = this.dog;
    // Speed eases towards the pace; standing still a while, she sits down.
    this.speed += (this.pace - this.speed) * (1 - Math.exp(-dt * 3));
    if (this.speed < 0.05) this.speed = 0;
    if (this.world) {
      // Turning round takes a moment (and she slows for it).
      const face = this.dir < 0 ? -Math.PI / 2 : Math.PI / 2, r = dog.root.rotation;
      r.y += (face - r.y) * (1 - Math.exp(-dt * 7));
      const along = Math.sin(r.y); // 1 facing the way we're going, −1 the other way
      this.travel += this.speed * along * dt;
      this.world.position.x = -(((this.travel % TILE) + TILE) % TILE);
    }
    this.idle = this.speed > 0.2 ? 0 : this.idle + dt;
    if (this.idle > 2.5 && !this.sat && !this.still) { this.sat = true; dog.emote('sit'); }
    if (this.speed > 0.2) { this.sat = false; dog.stopEmote(); }
    dog.update(dt, { speed: this.speed, turnRate: 0, sniff: false, dig: false, happy: this.speed > 3 ? 1 : 0.7 });

    // Looking at the pointer, on top of her own poses (not mid-trick).
    const g = this.gaze, tricking = (dog.emoteT ?? 0) > 0;
    g.active = Math.max(0, g.active - dt);
    const k = 1 - Math.exp(-dt * 5), on = g.active > 0 && !tricking && this.speed < 2 ? 1 : 0;
    g.yaw += (g.wantYaw * on - g.yaw) * k;
    g.pitch += (g.wantPitch * on - g.pitch) * k;
    dog.neck.rotation.y += g.yaw * 0.55;
    dog.head.rotation.y += g.yaw * 0.45;
    dog.head.rotation.x -= g.pitch * 0.7;

    // Camera: on her, a little bob when she gallops.
    const at = this.look, f = this.from, bob = Math.sin(performance.now() / 160) * 0.015 * Math.min(1, this.speed / 5);
    const fit = this.autoFit ? this.fit : 1;
    this.camera.position.set(at.x + f.x * fit, at.y + f.y * fit + bob, at.z + f.z * fit);
    this.camera.lookAt(at);
    if (this.shift) { // slide the picture, not the dog (a view offset keeps her perspective)
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      this.camera.setViewOffset(w, h, -this.shift * w, 0, w, h);
    } else if (this.camera.view) this.camera.clearViewOffset();
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.uTime.value = performance.now() / 1000;
    this.sun.target.position.set(0, 0, 0);
  }
}

/** True if this browser can paint Merry at all. */
export function canPaint() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
