import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { tripWorld, TripChapter } from '../kit.js';

/*
 * 📦 A plain room, for testing trips (going in and out, and that nothing's left behind): __game.trips.go('box', { id: 'alley' }).
 * Never reached in play.
 */

export function build(ctx) {
  const { group, C, W, R, col } = tripWorld(ctx.origin);
  const scene = new THREE.Scene();
  scene.add(group);
  const S = 7;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), paint(0xd9c9a8));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  for (const [x, z, w, d] of [[0, -S, S * 2, 0.4], [0, S, S * 2, 0.4], [-S, 0, 0.4, S * 2], [S, 0, 0.4, S * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), paint(0xb49a7c));
    m.position.set(x, 0.7, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    C.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), paint(0xa8784e));
  crate.position.set(2, 0.5, -2);
  crate.castShadow = true;
  group.add(crate);
  C.box(1.5, -2.5, 2.5, -1.5, 1);
  const mat = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), paint(0x6a8f5a));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.01, S - 1.4);
  group.add(mat);

  const world = {
    group, colliders: col, water: [], gardens: [], beds: [], bins: [],
    bounds: R(-S + 0.3, -S + 0.3, S - 0.3, S - 0.3),
    occluders: {},
    camera: { pitchMin: 0.4 },
    spawn: () => { const p = W(0, 0); return { x: p.x, z: p.z, face: Math.PI }; },
    exits: [{ id: 'alley', rect: R(-0.8, S - 2.2, 0.8, S - 0.6), open: () => true, text: '🐾 Back up!' }],
    update() {},
    dispose() {},
  };
  const chapter = new TripChapter(ctx, { scene, world });
  ctx.hud.setObjective('A test box. Nothing to see here!', '', { icon: '📦' });
  return { scene, world, chapter, look: { fog: 0xe8e0d0, near: 20, far: 60, music: 'town' } };
}
