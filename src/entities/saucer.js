import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';

/*
 * 🛸 Zib's flying saucer: a round silver hull with a coral rim of twinkly lights (they chase round), a glassy dome
 * with a little antenna on top, and a warm glow underneath. Hovering over the Farm's crop field (game/town/ufo.js),
 * and landed on Planet Boing (trips/ufo/), on its three legs.
 * Its own coordinates: the bottom of the hull is y = 0, the rim's at R across.
 */

export const SAUCER = { R: 3.05, rimY: 0.7, top: 1.25, domeR: 1.3, legY: -0.95 };

const V2 = (x, y) => new THREE.Vector2(x, y);
const HULL = 0xd6d8e8, RIM = 0xf08a9a, DOME = 0xa8e4ec, LIGHTS = [0xfff1a0, 0x9ff0f0, 0xffb0d0];

function mesh(geo, color, parent, pos = [0, 0, 0], rot = [0, 0, 0], opts) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * A saucer. legs: standing on three legs (landed), feet at SAUCER.legY. door: a hatch at +z (where a ramp goes).
 * Returns { root, lights (a group that turns: the chasing lights), glow (the underside), dome }.
 */
export function saucerModel({ legs = false, door = false } = {}) {
  const root = new THREE.Group();
  const R = SAUCER.R;
  // The hull: one smooth lathe, the belly curving up to the rim, then the top curving up to the dome.
  const hull = [V2(0.001, 0), V2(1.1, 0.04), V2(2.0, 0.2), V2(2.7, 0.44), V2(R, 0.64), V2(R + 0.02, 0.7), V2(R, 0.77), V2(2.5, 0.98), V2(1.7, 1.17), V2(0.001, 1.25)];
  mesh(new THREE.LatheGeometry(hull, 56), HULL, root);
  // The coral rim, and its lights (in a group that turns, so they chase round).
  mesh(new THREE.TorusGeometry(R + 0.01, 0.1, 10, 64), RIM, root, [0, SAUCER.rimY, 0], [Math.PI / 2, 0, 0]);
  const lights = new THREE.Group();
  lights.position.y = SAUCER.rimY;
  root.add(lights);
  const bulb = new THREE.SphereGeometry(0.12, 12, 8);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, c = LIGHTS[i % 3];
    const m = mesh(bulb, c, lights, [Math.cos(a) * (R + 0.1), 0, Math.sin(a) * (R + 0.1)], [0, 0, 0], { emissive: c });
    m.castShadow = false;
  }
  // A ring of round portholes round the top.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, r = 2.15;
    const p = mesh(new THREE.CircleGeometry(0.17, 14), 0x6e7fa8, root, [Math.cos(a) * r, 1.06, Math.sin(a) * r]);
    p.lookAt(Math.cos(a) * r * 2, 1.06 + r * 0.55, Math.sin(a) * r * 2);
    p.castShadow = false;
  }
  // The dome, its rim, and an antenna with a bobble on top.
  const dome = mesh(new THREE.SphereGeometry(SAUCER.domeR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), DOME, root, [0, 1.18, 0], [0, 0, 0], { emissive: 0x1d3c44 });
  mesh(new THREE.TorusGeometry(SAUCER.domeR + 0.02, 0.06, 8, 40), 0xb9bccf, root, [0, 1.2, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.6, 8), 0x9a9db4, root, [0, 2.75, 0]);
  mesh(new THREE.SphereGeometry(0.11, 12, 8), 0xff6f7f, root, [0, 3.08, 0], [0, 0, 0], { emissive: 0x802838 });
  // The warm glow underneath.
  const glow = mesh(new THREE.CircleGeometry(1.15, 32), 0xfff3b0, root, [0, 0.03, 0], [Math.PI / 2, 0, 0], { emissive: 0x8a7a40 });
  glow.castShadow = false;
  mesh(new THREE.TorusGeometry(1.2, 0.07, 8, 36), 0xb9bccf, root, [0, 0.05, 0], [Math.PI / 2, 0, 0]).castShadow = false;
  if (legs) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6, top = new THREE.Vector3(Math.cos(a) * 1.9, 0.25, Math.sin(a) * 1.9);
      const foot = new THREE.Vector3(Math.cos(a) * 2.55, SAUCER.legY + 0.06, Math.sin(a) * 2.55), mid = top.clone().add(foot).multiplyScalar(0.5);
      const len = top.distanceTo(foot), leg = mesh(new THREE.CylinderGeometry(0.07, 0.09, len, 10), 0xb9bccf, root, mid.toArray());
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 16), 0x9a9db4, root, foot.toArray());
    }
  }
  if (door) {
    // A round-topped hatch on the rim at +z, open: a warm light inside.
    const d = mesh(new THREE.CircleGeometry(0.62, 24, 0, Math.PI), 0xfff0b8, root, [0, 0.38, R - 0.32], [0.38, 0, 0], { emissive: 0x9a8040 });
    d.castShadow = false;
    const frame = mesh(new THREE.TorusGeometry(0.64, 0.05, 6, 24, Math.PI), RIM, root, [0, 0.38, R - 0.31], [0.38, 0, 0]);
    frame.castShadow = false;
  }
  return { root, lights, glow, dome };
}

/** The beam of light from underneath, `h` long, down to the ground (soft and see-through). */
export function beamModel(h) {
  const geo = new THREE.CylinderGeometry(1.0, 2.1, h, 32, 1, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff8cc, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}
