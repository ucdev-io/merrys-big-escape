import * as THREE from 'three';
import { WatercolorPipeline } from './render/watercolorPass.js';
import { paintUniforms } from './render/watercolorMaterial.js';
import { Input } from './core/input.js';
import { FollowCamera } from './core/camera.js';
import { Player } from './entities/player.js';
import { buildYard } from './world/yard.js';
import { createStylePicker } from './ui/stylePicker.js';
import { applyStyle } from './render/stylePresets.js';
import { HUD } from './ui/hud.js';
import { createTouchControls } from './ui/touchControls.js';
import { YardChapter } from './game/yardChapter.js';
import { TownChapter } from './game/townChapter.js';
import { generateTown, randomSeed } from './world/town/generator.js';
import { buildTown } from './world/town/builders.js';
import { loadSave, writeSave } from './core/save.js';
import { NetClient } from './net/client.js';
import { showTitle } from './ui/title.js';
import { packCodeFromUrl, packPath } from './net/links.js';
import { getSettings, TEXTURE_LEVELS } from './core/settings.js';
import { progress } from './game/progress.js';
import { statsFor } from './game/stats.js';
import { music } from './core/music.js';
import { autoFullscreen } from './ui/fullscreen.js';
import { localSeason } from './game/season.js';

// Phones/tablets go fullscreen when you press a play-ish button (it has to come from a tap).
window.addEventListener('click', (e) => { if (e.target.closest?.('.pill.big, .lobby .solo, .lobby .host, .lobby .join')) autoFullscreen(); }, true);

const canvas = document.getElementById('game');
const isMobile = matchMedia('(pointer: coarse)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// 🩺 If the phone runs out of graphics memory the picture stops: say so (index.html's notes), and start
// again once it's back (the world's shapes have gone to the graphics chip and aren't kept here to resend).
let leaving = false; // (set on the way out: see 'pagehide' below)
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  if (leaving) return; // (we let it go ourselves, on the way out)
  window.__report?.('gl-lost', 'The picture stopped');
  window.__note?.('The picture stopped (the phone may be short of memory). It should come back in a moment.');
});
canvas.addEventListener('webglcontextrestored', () => location.reload());
// (How far a load gets: a load that never finishes is reported by the next one.)
const loading = (what) => { try { if (what) sessionStorage.setItem('doggoLoading', what); else sessionStorage.removeItem('doggoLoading'); } catch { /* private mode */ } };
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Phones have ~3x screens; 2x keeps them crisp. Auto quality may step this down (a little, and only
// as a last resort) if the device struggles, and gives it back when things are quick again.
const bestRatio = Math.min(window.devicePixelRatio, isMobile ? 2 : 1.5), ratioFloor = Math.min(bestRatio, isMobile ? 1.5 : 1.25);
let pixelRatio = bestRatio;

const pipeline = new WatercolorPipeline(renderer, { quality: isMobile ? 'low' : 'high' });

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe4e6dc, 22, 85);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const follow = new FollowCamera(camera, canvas);

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
paintUniforms.uSunIntensity.value = sun.intensity;

// Catch up with anything our saved dog earned on other devices (and send anything not sent yet).
progress.refresh();

// Which chapter? ?town or ?seed=CODE in the URL jumps straight to the neighbourhood.
const params = new URLSearchParams(location.search);
const save = loadSave();
// A pack link (/pack/BONE-42) goes straight into that pack.
let packCode = packCodeFromUrl();
const yardDone = save.yardDone || save.escaped;

// Landing page, unless a link already says where to go.
if (!packCode && !params.has('town') && !params.has('seed')) {
  music.setEnabled(getSettings().music);
  music.play('title'); // starts with the first tap or key press
  const choice = await showTitle(save);
  if (choice?.pack) {
    // Tapped a friend in "Friends playing now": join them (no page reload, so fullscreen stays).
    packCode = choice.pack;
    history.replaceState(null, '', packPath(packCode));
  } else if (choice === 'garden') writeSave({ chapter: 'yard', found: [], escaped: false, pendingPack: null });
  else if (choice === 'town') writeSave({ chapter: 'town' });
  Object.assign(save, loadSave());
}
// Joining on a device that hasn't escaped a garden yet: escape first, then join automatically.
if (packCode && !yardDone) writeSave({ chapter: 'yard', found: [], escaped: false, pendingPack: packCode });
Object.assign(save, loadSave());
const inTown = params.has('town') || params.has('seed') || (!!packCode && yardDone) || save.chapter === 'town';

// A note while the world is built and first painted (a few seconds for a big town on a phone), so the
// screen isn't just blank. It goes up before joining a pack: from the pack's welcome to the town
// listening for its news (heists, the season…) nothing may wait on the browser, or that news is missed.
const loadNote = document.createElement('div');
loadNote.className = 'loading-note';
loadNote.textContent = inTown ? '🐾 Building the neighbourhood…' : '🐾 Opening the garden…';
document.body.appendChild(loadNote);
await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 120); }); // (on screen before the build)

// Arriving with ?room=CODE: join that pack first, because the pack decides which town we're in.
let net = null, welcome = null;
// First time on this device? Pick a dog first (code pre-filled), then join.
const prefillCode = inTown && packCode && !save.profile ? packCode : null;
if (inTown && packCode && save.profile) {
  const profile = save.profile;
  try {
    net = new NetClient();
    welcome = await net.enter('join', { code: packCode, name: profile.name, breed: profile.breed, level: progress.level, look: progress.look, profile: progress.id, season: localSeason() });
    writeSave({ chapter: 'town', town: { seed: welcome.seed, discovered: welcome.shared.discovered } });
  } catch (e) {
    net = null;
    history.replaceState(null, '', '/');
    console.warn('Could not join pack:', e.message);
    window.__packError = `Couldn\u2019t join pack ${packCode}: ${e.message}`;
  }
}

let world;
{
  let gpu = '?';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); } catch { /* not told */ }
  window.__report?.('start', inTown ? 'town' : 'garden', { gpu, maxTex: renderer.capabilities.maxTextureSize });
}
const buildT0 = performance.now();
window.__mark?.('start');
loading(inTown ? 'building the town' : 'building the garden');
if (inTown) {
  const seed = (welcome?.seed || params.get('seed') || loadSave().town?.seed || randomSeed()).toUpperCase();
  if (loadSave().town?.seed !== seed) writeSave({ chapter: 'town', town: { seed, discovered: [] } });
  const plan = generateTown(seed);
  window.__mark?.('build: plan');
  world = buildTown(plan);
  scene.fog.near = 30;
  scene.fog.far = 120;
} else {
  world = buildYard();
}
const builtAt = performance.now();
window.__report?.('built', `${inTown ? 'town' : 'garden'} in ${Math.round(builtAt - buildT0)} ms`);
loading('setting up and drawing the first picture');
scene.add(world.group);
world.attach?.(scene);

const input = new Input();
const player = new Player(save.profile?.breed ?? 'merry');
player.pos.copy(world.spawn);
if (world.spawnFace !== undefined) { player.heading = world.spawnFace; follow.yaw = world.spawnFace + Math.PI; }
scene.add(player.object);
follow.snap(player.pos);
follow.setOccluders(world.occluders);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  pipeline.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { resize(); pipeline.settle(1500); }); // (turning a phone round changes the cost)
resize();
pipeline.onTooSlow = () => {
  if (pixelRatio - 0.25 < ratioFloor - 1e-6) return false;
  pixelRatio -= 0.25; resize(); return true;
};
pipeline.onFast = () => {
  if (pixelRatio >= bestRatio) return false;
  pixelRatio = Math.min(bestRatio, pixelRatio + 0.25); resize(); return true;
};
// Storybook is the chosen look; add ?styles to the URL to compare the others.
if (location.search.includes('styles') || getSettings().styles) createStylePicker(pipeline, () => window.__gui?.controllersRecursive().forEach((c) => c.updateDisplay()));
else applyStyle(pipeline, 'storybook');
// Small screens: the paper texture and border read heavier, so go lighter.
if (isMobile) Object.assign(pipeline.params, { paper: 0.4, vignette: 0.25, granulation: 0.4 });

// ?debug shows the live quality settings.
if (location.search.includes('debug') || getSettings().debug) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:8px;bottom:8px;font:12px monospace;background:#fff8;padding:2px 6px;z-index:9;pointer-events:none';
  document.body.appendChild(d);
  let frames = 0, last = performance.now();
  setInterval(() => {
    const now = performance.now(), fps = (frames * 1000) / (now - last); frames = 0; last = now;
    const p = pipeline.params;
    d.textContent = `fps ${fps.toFixed(0)} · dpr ${pixelRatio} · paint ${pipeline.effScale.toFixed(2)} · blobs ${pipeline.effRadius} · step ${pipeline.level}${p.autoQuality ? '' : ' (sharp)'}`;
  }, 1000);
  (function count() { frames++; requestAnimationFrame(count); })();
}

pipeline.texture = TEXTURE_LEVELS[getSettings().texture] ?? TEXTURE_LEVELS.light;
const hud = new HUD(camera);
hud.onTexture = (level) => (pipeline.texture = TEXTURE_LEVELS[level]);
// ☰ → Picture: "auto" eases off on a struggling device; "sharp" never does (and goes back to the best now).
const setPicture = (mode) => {
  pipeline.setSharp(mode === 'sharp');
  if (mode === 'sharp' && pixelRatio !== bestRatio) { pixelRatio = bestRatio; resize(); }
};
setPicture(getSettings().picture);
hud.onPicture = setPicture;
// Stars float up from your dog; outfits you pick go straight on.
hud.dogAnchor = () => player.pos.clone().add(new THREE.Vector3(0, 1.15, 0));
hud.onLook = (look) => player.setLook(look);
hud.onEmote = (id) => input.touchButtons.add(`emote:${id}!`); // the 😀 menu
player.setLook(progress.look);
// ⚡ speed and 💨 zoomies grow with your level and what you're wearing.
const applyStats = () => player.setStats(statsFor(progress.level, progress.look));
applyStats();
progress.on((e) => { if (e.look || e.levelUp || e.synced || e.amount) applyStats(); });
createTouchControls(input, follow);
const chapter = inTown
  ? new TownChapter({ scene, world, player, hud, input, follow, pipeline, net, welcome, prefillCode })
  : new YardChapter({ scene, world, player, hud, input, follow, pipeline });
const setupAt = performance.now();
// Leaving (into the neighbourhood, say): give the graphics memory back now rather than whenever the old
// page is finally thrown away, so the next page has all of it (a big town needs it on a phone). Back to
// a page kept in the browser's cache: start it again (its picture's gone).
// (Just the context, and no more frames: renderer.dispose() would take away three's own context-lost
// listener, and a last frame would then try to resend shapes that are no longer kept.)
window.addEventListener('pagehide', () => { leaving = true; try { renderer.forceContextLoss(); } catch { /* going anyway */ } });
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
// Music for this chapter, and birds singing.
music.setEnabled(getSettings().music);
music.play(inTown ? 'town' : 'garden');
music.setAmbient({ birds: 1 });

// Style tuning panel: add ?tune to the URL.
if (location.search.includes('tune')) {
  import('lil-gui').then(({ default: GUI }) => {
    const gui = new GUI({ title: 'Watercolor style' });
    gui.close();
    const p = pipeline.params;
    const post = gui.addFolder('Paint (post)');
    post.add(p, 'enabled').name('watercolor on');
    post.add(p, 'radius', 0, 6, 1).name('paint blobs').listen();
    post.add(p, 'renderScale', 0.3, 1, 0.05).name('paint resolution').listen();
    post.add(p, 'autoQuality').name('auto quality');
    post.add(p, 'wobble', 0, 12).name('edge wobble');
    post.add(p, 'wobbleFreq', 0.2, 5).name('wobble size');
    post.add(p, 'wetEdge', 0, 4).name('wet edges');
    post.add(p, 'wetRadius', 0.5, 8).name('wet edge width');
    post.add(p, 'density', 0, 1.5).name('wash unevenness');
    post.add(p, 'densityScale', 0.5, 8).name('wash scale');
    post.add(p, 'granulation', 0, 2).name('granulation');
    post.add(p, 'ink', 0, 1.5).name('ink lines');
    post.add(p, 'inkWidth', 0.5, 3).name('ink width');
    post.add(p, 'inkWobble', 0, 8).name('ink wobble');
    post.add(p, 'paper', 0, 1).name('paper');
    post.add(p, 'paperScale', 0.5, 3).name('paper grain size');
    post.add(p, 'vignette', 0, 1).name('paper border');
    post.add(p, 'saturation', 0, 1.5);
    post.addColor(p, 'paperColor').name('paper color');
    post.addColor(p, 'inkColor').name('ink color');
    const sh = gui.addFolder('Shading');
    sh.add(paintUniforms.uBanding, 'value', 0, 1).name('banding');
    sh.add(paintUniforms.uBandSoft, 'value', 0.01, 0.5).name('band softness');
    sh.add(paintUniforms.uSkyFill, 'value', 0, 0.6).name('sky fill');
    sh.add(paintUniforms.uPigmentVar, 'value', 0, 0.5).name('pigment blotches');
    sh.add(paintUniforms.uPigmentScale, 'value', 0.2, 6).name('blotch scale');
    sh.addColor({ c: '#' + paintUniforms.uShadowTint.value.getHexString() }, 'c').name('shadow tint')
      .onChange((v) => paintUniforms.uShadowTint.value.set(v));
    gui.add({ log: () => console.log(JSON.stringify({ post: p, banding: paintUniforms.uBanding.value, soft: paintUniforms.uBandSoft.value }, null, 1)) }, 'log').name('print settings');
    window.__gui = gui;
  });
}

const sky = scene.getObjectByName('sky');
const timer = new THREE.Timer();
function frame(now) {
  if (leaving) return; // (on the way out: the picture's been let go)
  timer.update(now);
  // (Never backwards: after a long build, the first frame can come stamped with a time from before the
  // clock started, and a step back in time sank the dog under the ground and flung the camera far away.)
  const raw = Math.max(0, timer.getDelta()), dt = Math.min(raw, 1 / 20);
  const t = timer.getElapsed();

  player.update(dt, input, follow.yaw, world);
  chapter.update(dt);
  hud.update(dt);
  world.update(t, player.pos);
  follow.update(dt, player.pos, player.heading, player.speed);

  sky?.position.copy(camera.position);

  // Keep the shadow camera centred on the dog.
  sun.target.position.copy(player.pos);
  sun.position.copy(player.pos).add(new THREE.Vector3(8, 14, 6));

  pipeline.adapt(raw); // (unclamped: auto quality needs to know how slow slow is)
  const r0 = drawn ? 0 : performance.now();
  pipeline.render(scene, camera);
  if (!drawn) firstMs = performance.now() - r0; // (the first picture: every shader made, every shape sent)
  input.endFrame();
  if (++drawn === 2) {
    loading(null);
    loadNote.remove();
    // (the slowest steps of the build and setup, biggest first)
    const steps = Object.fromEntries((window.__marks ?? []).slice().sort((a, b) => b[1] - a[1]).slice(0, 12));
    window.__report?.('ready', `first pictures after ${Math.round(performance.now() - buildT0)} ms`, {
      build: Math.round(builtAt - buildT0), setup: Math.round(setupAt - builtAt), first: Math.round(firstMs),
      programs: renderer.info.programs?.length, geometries: renderer.info.memory.geometries, px: `${canvas.width}x${canvas.height}`, steps,
    });
    warm = { t0: now, frames: 0, long: 0, worst: 0, programs: renderer.info.programs?.length };
    // Now get the shader for everything else in the world ready, in the background: otherwise the
    // first time something new comes into view (a pond, the beach, a hidden prop) that frame stalls while
    // its shader's made. Made for the scene's own picture (what the paint pass reads), so they're the very
    // ones used. (A browser that can't make shaders in the background makes them all here, at once, while
    // you're still at the start.)
    setTimeout(() => {
      if (leaving) return;
      const t0 = performance.now(), before = renderer.info.programs?.length;
      try {
        renderer.setRenderTarget(pipeline.params.enabled ? pipeline.sceneRT : null);
        renderer.compileAsync(scene, camera).then(() => {
          if (warm) warm.made = { programs: (renderer.info.programs?.length ?? 0) - (before ?? 0), ms: Math.round(performance.now() - t0) };
        }, () => {});
      } catch { /* not this time */ } finally { renderer.setRenderTarget(null); }
    }, 250);
  } else if (warm && !warm.done) {
    // The first ten seconds of play: how smooth (a stutter is often a shader being made the first time
    // something comes into view).
    warm.frames++;
    if (raw > 0.05) warm.long++;
    warm.worst = Math.max(warm.worst, raw);
    if (now - warm.t0 >= 10000) {
      warm.done = true;
      window.__report?.('warm', `${Math.round((warm.frames * 1000) / (now - warm.t0))} fps over the first 10 s`, {
        stutters: warm.long, worst: Math.round(warm.worst * 1000), programs: renderer.info.programs?.length, early: warm.programs, made: warm.made ?? null, step: pipeline.level, dpr: pixelRatio,
      });
    }
  }
  requestAnimationFrame(frame);
}
let drawn = 0, firstMs = 0, warm = null;
requestAnimationFrame(frame);

window.__game = { scene, camera, player, pipeline, renderer, follow, chapter, hud, input, progress, world };
