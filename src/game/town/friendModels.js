import * as THREE from 'three';
import { mesh } from '../../world/props.js';
import { paint } from '../../render/watercolorMaterial.js';

/** The Lost & Found noticeboard: a wooden board on two posts, covered in posters. */
export function noticeboard(x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 8), 0x7a5a42, g, [s * 0.55, 0.85, 0]);
  mesh(new THREE.BoxGeometry(1.4, 0.95, 0.06), 0x9a7452, g, [0, 1.25, 0]);
  mesh(new THREE.BoxGeometry(1.5, 0.08, 0.14), 0x7a5a42, g, [0, 1.76, 0]); // little roof
  const papers = [[-0.4, 1.38, 0xfbf6ec], [0.05, 1.42, 0xf6d06a], [0.45, 1.3, 0xfbf6ec], [-0.15, 1.08, 0xf2a0b4], [0.35, 1.0, 0x9fc6e8]];
  for (const [px, py, c] of papers) mesh(new THREE.BoxGeometry(0.3, 0.34, 0.01), c, g, [px, py, 0.036], [0, 0, (px * 0.4) % 0.2]);
  mesh(new THREE.SphereGeometry(0.025, 8, 6), 0xd9534f, g, [0.05, 1.56, 0.05]); // drawing pin
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A glowing ring of paw prints on a doorstep: "the thing goes here!" */
export function doorMarker() {
  const g = new THREE.Group();
  const glow = paint(0xf6d06a, { emissive: 0x8a6a20 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 40), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  for (let i = 0; i < 6; i++) { // paw prints round the ring
    const a = (i / 6) * Math.PI * 2, p = new THREE.Group();
    p.position.set(Math.cos(a) * 0.48, 0.05, Math.sin(a) * 0.48);
    p.rotation.y = -a;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), glow); pad.rotation.x = -Math.PI / 2; p.add(pad);
    for (let k = -1; k <= 1; k++) { const toe = new THREE.Mesh(new THREE.CircleGeometry(0.028, 10), glow); toe.rotation.x = -Math.PI / 2; toe.position.set(k * 0.05, 0, 0.08 - Math.abs(k) * 0.02); p.add(toe); }
    g.add(p);
  }
  return g;
}
