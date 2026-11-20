import * as THREE from 'three';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { TOWN } from '../../world/town/generator.js';
import { toWorld } from '../../world/areas/areas.js';
import { blocked } from '../../world/spots.js';
import { groundY } from '../seasons/common.js';

// 🐾 Fast travel: from the Sniff Book, dig a tunnel straight to a place you've already found (or home).
// Down she goes, the page turns to paper for a moment, and up she pops at the other end.

const R = TOWN.BLOCK / 2 + 1; // the middle of the pavement round a block (as in life.js)
const facing = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz); // (a heading from one spot towards another)

/** Why the dog can't dig off somewhere just now (a short line for a tip), or null if she can. */
export function travelBlock(ch) {
  const P = ch.player, f = ch.friends;
  if (ch.travelling) return 'Already digging!';
  if (ch.games?.active) return 'Not in the middle of a game!';
  if (ch.heists?.target()) return 'Take your loot home first!';
  if (ch.actions.carry.held) return 'Put down what you’re carrying first.';
  if (P.sledging || ch.seasons?.parts?.sledge?.state === 'towed') return 'Not with a sledge in tow!';
  if (P.swim > 0.4 || P.inWater) return 'Out of the water first!';
  if (f?.duchess?.job?.ducklings?.some((k) => k.state === 'following')) return 'The ducklings can’t dig that fast! Walk them home first.';
  if (f?.extras?.some((e) => e.state === 'follow')) return 'Pepper’s on a walk with you!';
  const bj = f?.board?.job;
  if (bj?.twistOk && bj.spec?.twist === 'timer') return 'No shortcuts against the clock!';
  if (P.frozen || P.scripted || !P.grounded || !ch.hud.card.classList.contains('hidden')) return 'Not just now!';
  return null;
}

/** Where to pop up for a place (or 'home'): { x, z, face }, somewhere clear and out of everyone's way. */
export function landingFor(ch, id) {
  const { world, layout } = ch;
  if (id === 'home') {
    const homes = world.homes ?? [];
    const h = homes[(ch.homeSlot ?? 0) % Math.max(1, homes.length)];
    return h ? { x: h.pos.x, z: h.pos.z, face: h.face } : null;
  }
  const area = layout.areas?.find((a) => a.kind === id);
  if (area) return areaLanding(world, area);
  const p = layout.places.find((q) => q.id === id && q.type !== 'home');
  return p ? blockLanding(ch, p) : null;
}

/** Just inside an area's gate, facing in (or just outside it, if that's all that's clear). */
function areaLanding(world, a) {
  const u = a.lane.gateU;
  const tries = [[0, 4], [0, 5.5], [1.5, 4], [-1.5, 4], [0, 3], [3, 5], [-3, 5], [0, 7]];
  for (const [du, dv] of tries) {
    const [x, z] = toWorld(a, u + du, a.front + dv);
    if (!blocked(world, x, z, 0.6)) return { x, z, face: a.turn };
  }
  const [x, z] = toWorld(a, u, a.front - 3);
  return { x, z, face: a.turn };
}

/**
 * On the pavement round a town block, on the side facing the middle of town, looking into the block.
 * (Never the pond's own spot, which is water.) Steps along the pavement until it's clear of walls,
 * lamps and bins, and far enough from the 📋 board, Gus and Duchess that nobody pops up a card.
 */
function blockLanding(ch, p) {
  const avoid = [[ch.friends?.board?.pos, 4], [ch.friends?.gus?.pos, 4.5], [ch.friends?.duchess?.pos, 4.5]].filter(([q]) => q);
  const ok = (x, z) => !blocked(ch.world, x, z, 0.7) && avoid.every(([q, r]) => (x - q.x) ** 2 + (z - q.z) ** 2 >= r * r);
  // The four sides, the ones facing the middle of town (0, 0) first.
  const sides = [[-Math.sign(p.x) || 1, 0], [0, -Math.sign(p.z) || 1], [Math.sign(p.x) || -1, 0], [0, Math.sign(p.z) || -1]];
  if (Math.abs(p.z) > Math.abs(p.x)) [sides[0], sides[1]] = [sides[1], sides[0]];
  for (const [nx, nz] of sides) {
    const sx = p.x + nx * R, sz = p.z + nz * R;
    for (let k = 0; k <= 24; k++) {
      const d = (k % 2 ? 1 : -1) * Math.ceil(k / 2); // 0, 1, -1, 2, -2… along the pavement
      const x = sx + (nx ? 0 : d), z = sz + (nz ? 0 : d);
      if (ok(x, z)) return { x, z, face: facing(x, z, p.x, p.z) };
    }
  }
  const [nx, nz] = sides[0];
  return { x: p.x + nx * R, z: p.z + nz * R, face: facing(p.x + nx * R, p.z + nz * R, p.x, p.z) };
}

/**
 * The trip itself (about 2.4 s): dig down in a spray of earth, a moment of paper, then pop up at `to`
 * and shake off. Returns a per-frame function; calls onDone() at the end, with the dog back to normal.
 */
export function digTravel({ ch, to, onDone }) {
  const { player: P, follow, hud, actions, pipeline, world, scene } = ch;
  P.frozen = true;
  P.lockY = true;
  P.vel.set(0, 0);
  P.vy = 0;
  hud.setPrompt('');
  sfx.tunnel();
  buzz(30);
  const from = P.pos.clone(), y0 = P.pos.y;
  const base = world.heightAt?.(to.x, to.z) ?? 0;
  const gyFrom = groundY(world, from.x, from.z), gyTo = groundY(world, to.x, to.z);
  // A hole to dig into (and one to come out of).
  const hole = new THREE.Mesh(ch.holeGeo ??= new THREE.CircleGeometry(0.4, 18), ch.holeMat ??= new THREE.MeshBasicMaterial({ color: 0x4a3426 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(from.x, gyFrom + 0.006, from.z);
  scene.add(hole);
  // The paper that covers the picture while she's underground.
  const fade = document.createElement('div');
  fade.className = 'travel-fade';
  hud.root.prepend(fade); // (under the HUD's buttons, over the picture)
  const tilt = (x) => { P.dog.body.rotation.x = x; };
  let t = 0, stage = 0;

  return (dt) => {
    t += dt;
    if (stage === 0) { // dig down, nose first
      const k = Math.min(1, t / 0.9);
      P.pos.y = y0 - k * 0.9;
      tilt(0.9 * Math.sin(k * Math.PI * 0.5));
      if (Math.random() < 0.5) actions.dirtBurst(from, 2, gyFrom);
      fade.style.opacity = Math.max(0, (k - 0.55) / 0.45).toFixed(2);
      if (k >= 1) {
        stage = 1; t = 0;
        // Underground: off to the other end.
        P.pos.set(to.x, base - 0.9, to.z);
        P.heading = to.face;
        P.object.rotation.y = to.face;
        follow.snap(P.pos);
        follow.yaw = to.face + Math.PI;
        hole.position.set(to.x, gyTo + 0.006, to.z);
        pipeline.settle?.(1000); // (the grass re-places itself here: not a sign of a slow phone)
      }
    } else if (stage === 1) { // the paper lifts
      const k = Math.min(1, t / 0.35);
      fade.style.opacity = (1 - k).toFixed(2);
      if (k >= 1) { stage = 2; t = 0; fade.remove(); sfx.pop(); actions.dirtBurst(V3(to.x, 0, to.z), 20, gyTo); }
    } else if (stage === 2) { // pop up
      const k = Math.min(1, t / 0.5);
      P.pos.y = base - 0.9 * (1 - k);
      tilt(-0.4 * (1 - k));
      if (k >= 1) { stage = 3; t = 0; P.happy = 1; P.dog.shake(); sfx.shake(); }
    } else if (stage === 3 && t > 0.6) {
      stage = 4;
      tilt(0);
      P.pos.y = base;
      P.vy = 0;
      P.grounded = true;
      P.lockY = false;
      P.frozen = false;
      setTimeout(() => hole.removeFromParent(), 2500);
      onDone?.();
    }
  };
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
