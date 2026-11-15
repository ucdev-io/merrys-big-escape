import * as THREE from 'three';
import { mesh } from '../world/props.js';
import { smellySock } from './items.js';
import { treatMesh } from './treats.js';

/*
 * Things a dog can pick up and carry in its mouth. build() makes the model, real-world sized, lying
 * on the ground at y = 0. hold: where it sits in the mouth (dog head space: +z forward, +y up),
 * e.g. a stick held crossways.
 */

function squeaky() {
  const g = new THREE.Group();
  mesh(new THREE.SphereGeometry(0.055, 18, 12), 0xd9534f, g, [0, 0.055, 0]);
  mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 22), 0xf6d06a, g, [0, 0.055, 0], [0, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10), 0xf1e8d8, g, [0, 0.112, 0]); // the squeaker
  return g;
}

function tennisBall() {
  const g = new THREE.Group();
  mesh(new THREE.SphereGeometry(0.034, 16, 12), 0xc8dc4a, g, [0, 0.034, 0]);
  mesh(new THREE.TorusGeometry(0.034, 0.004, 4, 20), 0xf4f1e4, g, [0, 0.034, 0], [0.5, 0.3, 0]);
  return g;
}

function slipper() {
  const g = new THREE.Group();
  mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 12), 0x8e6fb0, g, [0, 0.03, 0], [Math.PI / 2, 0, 0], [1, 1, 0.5]);
  mesh(new THREE.SphereGeometry(0.05, 12, 8), 0xf6e8f2, g, [0, 0.055, 0.07], [0, 0, 0], [1, 0.5, 0.9]); // fluffy front
  return g;
}

function stick() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 8), 0x8a6346, g, [0, 0.018, 0], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 6), 0x8a6346, g, [0.08, 0.03, 0.04], [0.6, 0, Math.PI / 2 - 0.5]); // a twig
  mesh(new THREE.SphereGeometry(0.02, 8, 6), 0x7fae64, g, [0.13, 0.04, 0.07], [0, 0, 0], [1, 0.5, 1]); // a leaf
  return g;
}

function teddy() {
  const g = new THREE.Group();
  const fur = 0xc28a55;
  mesh(new THREE.SphereGeometry(0.065, 14, 10), fur, g, [0, 0.07, 0], [0, 0, 0], [1, 1.1, 0.85]);
  mesh(new THREE.SphereGeometry(0.05, 14, 10), fur, g, [0, 0.17, 0]);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.02, 8, 6), fur, g, [s * 0.04, 0.215, 0]);              // ears
    mesh(new THREE.SphereGeometry(0.025, 8, 6), fur, g, [s * 0.065, 0.09, 0.02]);          // arms
    mesh(new THREE.SphereGeometry(0.028, 8, 6), fur, g, [s * 0.04, 0.02, 0.03]);            // legs
    mesh(new THREE.SphereGeometry(0.007, 6, 4), 0x241a17, g, [s * 0.018, 0.18, 0.045]);     // eyes
  }
  mesh(new THREE.SphereGeometry(0.022, 10, 8), 0xe8c8a0, g, [0, 0.16, 0.04]);              // snout
  mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 18), 0xd9534f, g, [0, 0.125, 0], [Math.PI / 2, 0, 0]); // ribbon
  return g;
}

function newspaper() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 14), 0xeeeae0, g, [0, 0.035, 0], [0, 0, Math.PI / 2]);
  mesh(new THREE.TorusGeometry(0.036, 0.005, 4, 14), 0xd9534f, g, [0, 0.035, 0], [0, Math.PI / 2, 0]); // rubber band
  return g;
}

function frisbee() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.02, 24), 0xe39a52, g, [0, 0.012, 0]);
  mesh(new THREE.TorusGeometry(0.115, 0.008, 6, 26), 0xd9534f, g, [0, 0.02, 0], [Math.PI / 2, 0, 0]);
  return g;
}

function oldBone() {
  const g = new THREE.Group();
  const col = 0xece2cc;
  mesh(new THREE.CapsuleGeometry(0.022, 0.16, 6, 10), col, g, [0, 0.03, 0], [0, 0, Math.PI / 2]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) mesh(new THREE.SphereGeometry(0.026, 10, 8), col, g, [x * 0.1, 0.03, z * 0.02]);
  return g;
}

function sock() {
  const g = smellySock();
  g.scale.setScalar(0.85);
  const outer = new THREE.Group();
  outer.add(g);
  g.rotation.x = -Math.PI / 2; // lying down
  g.position.y = 0.04;
  return outer;
}

// hold: [x, y, z] position and [x, y, z] rotation in the dog's mouth.
export const CARRYABLES = {
  squeaky: { name: 'squeaky ball', emoji: '🔴', build: squeaky, hold: { pos: [0, -0.03, 0.03], rot: [0, 0, 0] } },
  ball: { name: 'tennis ball', emoji: '🎾', build: tennisBall, hold: { pos: [0, -0.02, 0.02], rot: [0, 0, 0] } },
  slipper: { name: 'slipper', emoji: '🥿', build: slipper, hold: { pos: [0, -0.03, 0.05], rot: [-0.3, 0, 0] } },
  stick: { name: 'stick', emoji: '🪵', build: stick, hold: { pos: [0, -0.025, 0.0], rot: [0, 0, 0] } },
  teddy: { name: 'teddy', emoji: '🧸', build: teddy, hold: { pos: [0, -0.14, 0.03], rot: [0.2, 0, 0] } },
  sock: { name: 'sock', emoji: '🧦', build: sock, hold: { pos: [0, -0.06, 0.03], rot: [1.2, 0, 0] } },
  newspaper: { name: 'newspaper', emoji: '📰', build: newspaper, hold: { pos: [0, -0.03, 0.0], rot: [0, 0, 0] } },
  frisbee: { name: 'frisbee', emoji: '🥏', build: frisbee, hold: { pos: [0, -0.04, 0.08], rot: [1.2, 0, 0] } },
  bone: { name: 'old bone', emoji: '🦴', build: oldBone, hold: { pos: [0, -0.025, 0.0], rot: [0, 0, 0] } },
  // Pinched from the bakery street (heists: see treats.js).
  croissant: { name: 'croissant', emoji: '🥐', build: () => treatMesh('croissant'), hold: { pos: [0, -0.03, 0.035], rot: [0, 0, 0] } },
  bun: { name: 'iced bun', emoji: '🧁', build: () => treatMesh('bun'), hold: { pos: [0, -0.06, 0.045], rot: [0.3, 0, 0] } },
  links: { name: 'string of sausages', emoji: '🌭', build: () => treatMesh('links'), hold: { pos: [0, -0.02, 0.03], rot: [0, 0, 0] } }, // (the end of one: the rest trails behind)
  sausage: { name: 'sausage', emoji: '🌭', build: () => treatMesh('sausage'), hold: { pos: [0, -0.025, 0.03], rot: [0, 0, 0] } },
  burger: { name: 'burger', emoji: '🍔', build: () => treatMesh('burger'), hold: { pos: [0, -0.07, 0.05], rot: [0.3, 0, 0] } },
};

// Lawns are a few centimetres thick and things are put down at ground level: lift the flattest things a
// little so they sit on the grass instead of hiding in it (a frisbee vanished completely).
for (const k of ['ball', 'stick', 'frisbee', 'bone']) {
  const c = CARRYABLES[k], build = c.build;
  c.build = () => { const g = build(); for (const m of g.children) m.position.y += 0.04; return g; };
  c.hold = { pos: [c.hold.pos[0], c.hold.pos[1] - 0.04, c.hold.pos[2]], rot: c.hold.rot };
}
