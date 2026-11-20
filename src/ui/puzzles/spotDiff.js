import * as THREE from 'three';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { PuzzleSession, solved, prizeLine, howLine } from './puzzle.js';
import { cardCrop } from './jigsaw.js';
import { gnome } from '../../world/props.js';
import { cardboardBox, mailbox, birdbath, lawnmower, bbq } from '../../world/town/townProps.js';
import { blocked } from '../../world/spots.js';

/**
 * 🔍 Spot the difference: two snaps of the painted view, one picture apart. For the second, a few things
 * change (a gnome turns up on the pavement, a car vanishes, a postbox appears…), then everything's put
 * back exactly as it was. Only the bits that changed are copied into the second picture, so cars driving
 * along and rain falling don't count. Tap the differences on either picture. Quicker is better.
 */
const MAX_W = 640, WANT = 5, MIN = 3;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rand = (a, b) => a + Math.random() * (b - a);
// Things that turn up (each made fresh, and put away afterwards). Scale: so they show from a few metres off.
const PROPS = [
  { make: (ry) => gnome(0, 0, ry), scale: 1.7 },
  { make: (ry) => cardboardBox(0, 0, ry), scale: 1.6 },
  { make: (ry) => mailbox(0, 0, ry, [0xd9534f, 0x5b86c4, 0x6f9a52][Math.floor(Math.random() * 3)]), scale: 1.2 },
  { make: () => birdbath(0, 0), scale: 1.1 },
  { make: (ry) => lawnmower(0, 0, ry), scale: 1.4 },
  { make: (ry) => bbq(0, 0, ry), scale: 1.0 },
];

/** A picture of the middle of the canvas (the postcard's shape), scaled down: a 2D canvas we can read. */
function grab(canvas, crop, scale) {
  const out = document.createElement('canvas');
  out.width = Math.round(crop.w * scale); out.height = Math.round(crop.h * scale);
  out.getContext('2d').drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  return out;
}

/** Where an object is in the postcard (a rectangle in its pixels), or null if any of it's behind the camera. */
function rectOf(obj, camera, W, H, crop, scale) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    const px = (((v.x + 1) / 2) * W - crop.x) * scale, py = (((1 - v.y) / 2) * H - crop.y) * scale;
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
  }
  return { x0, y0, x1, y1 };
}
const pad = (r, p) => ({ x0: r.x0 - p, y0: r.y0 - p, x1: r.x1 + p, y1: r.y1 + p });
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Change a few things in the scene for the second snap. Returns the changes: { rect, undo }.
 * (Only things whose whole shape is in the picture, not too big or too small, and clear of the dog and each other.)
 */
function makeChanges({ scene, camera, world, player }, W, H, crop, scale) {
  const cw = crop.w * scale, ch = crop.h * scale, area = cw * ch, changes = [];
  const fits = (r) => r && r.x0 > cw * 0.03 && r.y0 > ch * 0.03 && r.x1 < cw * 0.97 && r.y1 < ch * 0.97
    && (r.x1 - r.x0) * (r.y1 - r.y0) > 18 * 18 && (r.x1 - r.x0) * (r.y1 - r.y0) < area * 0.18;
  const dog = rectOf(player.object, camera, W, H, crop, scale);
  const free = (r) => (!dog || !overlaps(pad(r, 6), dog)) && changes.every((c) => !overlaps(pad(r, 10), c.rect));
  // 1) Something that's there vanishes: a car, a neighbour, a bin… (things of their own, in the scene itself).
  const cam = camera.position;
  const gone = scene.children.filter((o) => {
    if (!o.visible || o === player.object || o.isLight || o.isCamera || o.isLine || o.isPoints || o.isSprite || o.isInstancedMesh) return false;
    if (!(o.isGroup || o.isMesh)) return false;
    const b = new THREE.Box3().setFromObject(o), size = b.getSize(new THREE.Vector3()).length();
    if (b.isEmpty() || size < 0.3 || size > 6) return false;
    const d = b.getCenter(new THREE.Vector3()).distanceTo(cam);
    return d > 3 && d < 35;
  }).sort(() => Math.random() - 0.5);
  for (const o of gone) {
    if (changes.length >= 2) break;
    const r = rectOf(o, camera, W, H, crop, scale);
    if (!fits(r) || !free(r)) continue;
    o.visible = false;
    changes.push({ rect: r, undo: () => { o.visible = true; } });
  }
  // 2) Things that weren't there turn up, on the ground where the camera can see.
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  for (let tries = 0; tries < 60 && changes.length < WANT + 2; tries++) {
    const u = rand(0.08, 0.92), v = rand(0.4, 0.92); // (somewhere in the picture's lower part: the ground)
    const sx = (crop.x + u * crop.w) / W, sy = (crop.y + v * crop.h) / H;
    ray.setFromCamera(new THREE.Vector2(sx * 2 - 1, 1 - sy * 2), camera);
    if (!ray.ray.intersectPlane(ground, hit)) continue;
    const d = hit.distanceTo(cam);
    if (d < 4 || d > 24 || blocked(world, hit.x, hit.z, 0.5)) continue;
    const P = PROPS[Math.floor(Math.random() * PROPS.length)];
    const obj = P.make(Math.atan2(cam.x - hit.x, cam.z - hit.z) + rand(-0.6, 0.6));
    obj.position.set(hit.x, 0.02, hit.z);
    obj.scale.multiplyScalar(P.scale);
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const r = rectOf(obj, camera, W, H, crop, scale);
    if (!fits(r) || !free(r)) { put(obj); continue; }
    changes.push({ rect: r, undo: () => put(obj) });
  }
  return changes;
}
/** Away it goes (its shapes were made for this; the paints are shared, so they stay). */
function put(obj) {
  obj.removeFromParent();
  obj.traverse((m) => { m.geometry?.dispose(); if (m.material && !m.material.userData?.paint) m.material.dispose(); });
}

/** Did this change actually show (it might have been behind a hedge)? Compares the two pictures inside it. */
function shows(a, b, r) {
  const x = Math.max(0, Math.floor(r.x0)), y = Math.max(0, Math.floor(r.y0));
  const w = Math.min(a.width - x, Math.ceil(r.x1 - r.x0)), h = Math.min(a.height - y, Math.ceil(r.y1 - r.y0));
  if (w < 4 || h < 4) return false;
  const pa = a.getContext('2d').getImageData(x, y, w, h).data, pb = b.getContext('2d').getImageData(x, y, w, h).data;
  let n = 0;
  for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 60) n++;
  return n > Math.max(12, w * h * 0.04);
}

/**
 * Snap the view twice and open the puzzle. ctx: { hud, player }; scene, camera, world: the town's;
 * pipeline: its snap hook copies the next picture.
 */
export function openSpotDiff(ctx, { pipeline, scene, camera, world, where, onEnd = null }) {
  const S = new PuzzleSession(ctx, { onEnd });
  S.show('<h1>🔍 Spot the difference</h1><p>Say cheese! Snapping the view… twice!</p>', [['Close', () => S.close()]]);
  const fail = (why) => S.show(`<h1>🔍 Spot the difference</h1><p>${why}</p>`, [['OK', () => S.close()]]);
  let got = false;
  pipeline.snap = (canvas) => {
    got = true;
    if (S.over) return;
    const W = canvas.width, H = canvas.height, crop = cardCrop(W, H), scale = Math.min(1, MAX_W / Math.max(crop.w, crop.h));
    let a, changes;
    try { a = grab(canvas, crop, scale); a.getContext('2d').getImageData(0, 0, 1, 1); } catch { return fail('The camera’s not working just now. Try again in a moment!'); }
    try { changes = makeChanges({ scene, camera, world, player: ctx.player }, W, H, crop, scale); } catch (e) { console.warn(e); changes = []; }
    pipeline.snap = (canvas2) => {
      let b = null;
      try { b = grab(canvas2, crop, scale); } catch { /* (handled below) */ }
      for (const c of changes) c.undo(); // (everything back just as it was, before anything else happens)
      if (S.over) return;
      if (!b) return fail('The camera’s not working just now. Try again in a moment!');
      // Keep the ones that really show, and copy just those bits of the second picture onto a copy of the first.
      const kept = changes.filter((c) => shows(a, b, pad(c.rect, 2))).slice(0, WANT);
      if (kept.length < MIN) return fail('Hmm, there’s not much to see from here. Try somewhere with a bit more going on (the street, the park…), then try again!');
      const b2 = document.createElement('canvas');
      b2.width = a.width; b2.height = a.height;
      const g = b2.getContext('2d');
      g.drawImage(a, 0, 0);
      for (const c of kept) {
        const r = pad(c.rect, 4), x = Math.max(0, Math.floor(r.x0)), y = Math.max(0, Math.floor(r.y0));
        const w = Math.min(b2.width - x, Math.ceil(r.x1 - r.x0)), h = Math.min(b2.height - y, Math.ceil(r.y1 - r.y0));
        g.drawImage(b, x, y, w, h, x, y, w, h);
      }
      sfx.pop?.();
      play(S, { a: a.toDataURL('image/jpeg', 0.88), b: b2.toDataURL('image/jpeg', 0.88), w: a.width, h: a.height, diffs: kept.map((c) => c.rect) }, where);
    };
  };
  setTimeout(() => { if (got || S.over) return; pipeline.snap = null; fail('The camera’s not working just now. Try again in a moment!'); }, 4000);
  return S;
}

function play(S, pic, where) {
  S.pic = pic; // (what's where: handy for checking it)
  const t0 = performance.now(), found = new Set(), n = pic.diffs.length;
  let hints = 0, misses = 0, done = false;
  const ar = (pic.w / pic.h).toFixed(3);
  const img = (src, side) => `<div class="sd-pic" data-side="${side}" style="--ar:${ar}"><img src="${src}" alt="" draggable="false"></div>`;
  const page = S.show(`<h1>🔍 ${esc(where)}</h1>
    <div class="sd-pair" style="--ar:${ar}">${img(pic.a, 'a')}${img(pic.b, 'b')}</div>
    <p class="small sd-info">Find the <b>${n}</b> differences: tap them on either picture. Found: <b class="sd-n">0</b> / ${n}</p>`,
  [['💡 Hint', () => hint()], ['Close', () => S.close()]]);
  const pics = [...page.querySelectorAll('.sd-pic')];
  const ring = (k, cls = '') => {
    const r = pic.diffs[k], cx = ((r.x0 + r.x1) / 2 / pic.w) * 100, cy = ((r.y0 + r.y1) / 2 / pic.h) * 100;
    const d = Math.max(r.x1 - r.x0, r.y1 - r.y0) + 14;
    for (const p of pics) {
      const e = document.createElement('div');
      e.className = `sd-ring ${cls}`;
      e.style.cssText = `left:${cx}%; top:${cy}%; width:${(d / pic.w) * 100}%; aspect-ratio:1`;
      p.appendChild(e);
      if (cls) setTimeout(() => e.remove(), 1600);
    }
  };
  const hint = () => {
    if (done || S.over) return;
    const k = [...Array(n).keys()].find((i) => !found.has(i));
    if (k === undefined) return;
    hints++;
    ring(k, 'hint');
    sfx.plip?.();
  };
  for (const p of pics) {
    p.onpointerdown = (e) => {
      if (done || S.over) return;
      const box = p.getBoundingClientRect(), x = ((e.clientX - box.left) / box.width) * pic.w, y = ((e.clientY - box.top) / box.height) * pic.h;
      const k = pic.diffs.findIndex((r, i) => !found.has(i) && x > r.x0 - 8 && x < r.x1 + 8 && y > r.y0 - 8 && y < r.y1 + 8);
      if (k < 0) { misses++; p.classList.remove('miss'); void p.offsetWidth; p.classList.add('miss'); sfx.plip?.(); return; }
      found.add(k);
      ring(k);
      sfx.pop?.(); buzz(15);
      page.querySelector('.sd-n').textContent = found.size;
      if (found.size >= n) {
        done = true;
        const secs = Math.max(1, Math.round((performance.now() - t0) / 1000)) + hints * 10;
        setTimeout(() => finish(S, pic, where, secs, hints), 900);
      }
    };
  }
}

function finish(S, pic, where, secs, hints) {
  if (S.over) return;
  const r = solved('spotdiff', 'spotdiff', secs);
  S.show(`<h1>🔍 All ${pic.diffs.length} spotted!</h1>
    <div class="sd-pair done" style="--ar:${(pic.w / pic.h).toFixed(3)}"><div class="sd-pic" style="--ar:${(pic.w / pic.h).toFixed(3)}"><img src="${pic.b}" alt=""></div></div>
    <p>In <b>${secs}s</b>${hints ? ` (with ${hints} hint${hints === 1 ? '' : 's'}: +10s each)` : ''}. ${howLine(r, 's')}</p>
    ${prizeLine(r.prize, r.unlocked)}<p class="small">Every spot looks different: try it somewhere else!</p>`,
  [['Close', () => S.close()]]);
}
