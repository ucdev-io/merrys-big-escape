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

const canvas = document.getElementById('game');
const isMobile = matchMedia('(pointer: coarse)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Phones have ~3x screens; 2x keeps them crisp. Auto-quality may step this down if the phone struggles.
let pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 2 : 1.5);

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

const world = buildYard();
scene.add(world.group);

const input = new Input();
const player = new Player();
player.pos.copy(world.spawn);
scene.add(player.object);
follow.snap(player.pos);
follow.setOccluders(world.occluders, world.foliage);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  pipeline.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
pipeline.onTooSlow = () => {
  if (pixelRatio > 1.25) { pixelRatio = Math.max(1.25, pixelRatio - 0.25); resize(); }
};
// Storybook is the chosen look; add ?styles to the URL to compare the others.
if (location.search.includes('styles')) createStylePicker(pipeline, () => window.__gui?.controllersRecursive().forEach((c) => c.updateDisplay()));
else applyStyle(pipeline, 'storybook');
// Small screens: the paper texture and border read heavier, so go lighter.
if (isMobile) Object.assign(pipeline.params, { paper: 0.45, vignette: 0.4, granulation: 0.4 });

// ?debug shows the live quality settings.
if (location.search.includes('debug')) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:8px;bottom:8px;font:12px monospace;background:#fff8;padding:2px 6px;z-index:9;pointer-events:none';
  document.body.appendChild(d);
  let frames = 0, last = performance.now();
  setInterval(() => {
    const now = performance.now(), fps = (frames * 1000) / (now - last); frames = 0; last = now;
    const p = pipeline.params;
    d.textContent = `fps ${fps.toFixed(0)} · dpr ${pixelRatio} · paint ${p.renderScale.toFixed(2)} · blobs ${p.radius}`;
  }, 1000);
  (function count() { frames++; requestAnimationFrame(count); })();
}

const hud = new HUD(camera);
createTouchControls(input);
const chapter = new YardChapter({ scene, world, player, hud, input, follow, pipeline });

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

const timer = new THREE.Timer();
function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();

  player.update(dt, input, follow.yaw, world);
  chapter.update(dt);
  hud.update(dt);
  world.update(t);
  follow.update(dt, player.pos, player.heading, player.speed);

  // Keep the shadow camera centred on the dog.
  sun.target.position.copy(player.pos);
  sun.position.copy(player.pos).add(new THREE.Vector3(8, 14, 6));

  pipeline.adapt(dt);
  pipeline.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { scene, camera, player, pipeline, renderer, follow, chapter, hud, input };
