import * as THREE from 'three';
import { SPHERE, bakedMesh, group } from './shapes.js';

// Thank-you presents from the park friends that need more than a colour (see Dog.setLook in dog.js).

/** Pepper's daisy chain: a ring of little daisies round the neck, sized to this dog (one mesh). */
export function daisyChain(neck, dims) {
  const cy = 0.085 * dims.NL - 0.012, R = 0.049 * dims.nr + (dims.F ?? 0) * 1.3 + 0.012;
  const g = group(neck, [0, cy, 0.006], [Math.PI / 2 + 0.3, 0, 0]); // (lying round the neck like a collar)
  const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), e = new THREE.Euler(), out = new THREE.Vector3();
  const parts = [[new THREE.TorusGeometry(R, 0.003, 6, 40), 0x6f9a52]];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.set(c, s, 0);
    const rot = e.setFromQuaternion(q.setFromUnitVectors(Z, out)).toArray().slice(0, 3);
    parts.push([SPHERE, i % 4 === 3 ? 0xf2a0b4 : 0xfbf7ee, [c * (R + 0.003), s * (R + 0.003), 0], rot, [0.012, 0.012, 0.0035]]); // petals
    parts.push([SPHERE, 0xf2c14e, [c * (R + 0.006), s * (R + 0.006), 0], [0, 0, 0], [0.0045, 0.0045, 0.0045]]);                     // middle
  }
  bakedMesh(parts, g);
  return g;
}
