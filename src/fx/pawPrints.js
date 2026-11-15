import * as THREE from 'three';

/*
 * 🐾 Paw prints: little pressed-in prints that slowly fade (in the snow, or muddy ones on a path).
 * All of them are one draw call; each print is drawn by the shader (a pad and four toes), so there's
 * no texture. step() adds one; Prints.follow() leaves a trail behind a moving dog.
 */

const VERT = /* glsl */ `
attribute vec4 aPrint;  // x, y, z, heading
attribute vec4 aLook;   // born (s), size, colour r, colour g/b packed below
attribute vec2 aTint;
uniform float uTime, uLife;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float c = cos(aPrint.w), s = sin(aPrint.w);
  vec2 q = position.xy * aLook.y;
  vec3 w = vec3(aPrint.x + q.x * c + q.y * s, aPrint.y, aPrint.z - q.x * s + q.y * c);
  float age = uTime - aLook.x;
  vAlpha = (1.0 - smoothstep(uLife * 0.6, uLife, age)) * step(0.0, age);
  vUv = position.xy + 0.5;
  vCol = vec3(aLook.z, aTint.x, aTint.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vCol;
float blob(vec2 p, vec2 c, vec2 r) { return smoothstep(1.0, 0.7, length((p - c) / r)); }
void main() {
  vec2 p = vUv - 0.5;
  float a = blob(p, vec2(0.0, -0.1), vec2(0.21, 0.17));
  a = max(a, blob(p, vec2(-0.2, 0.1), vec2(0.075, 0.095)));
  a = max(a, blob(p, vec2(-0.075, 0.22), vec2(0.075, 0.095)));
  a = max(a, blob(p, vec2(0.075, 0.22), vec2(0.075, 0.095)));
  a = max(a, blob(p, vec2(0.2, 0.1), vec2(0.075, 0.095)));
  a *= vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;

export class PawPrints {
  /** max: how many prints at once (the oldest go first); life: seconds before they've faded away. */
  constructor(scene, { max = 320, life = 40, opacity = 0.55 } = {}) {
    const quad = new THREE.PlaneGeometry(1, 1); // (its 2D corners: the shader lays it flat and turns it)
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.print = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(-1e4), 4).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPrint', this.print);
    g.setAttribute('aLook', this.look);
    g.setAttribute('aTint', this.tint);
    g.instanceCount = 0;
    this.uniforms = { uTime: { value: 0 }, uLife: { value: life }, uOpacity: { value: opacity } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.geo = g;
    this.max = max;
    this.next = 0;
    this.time = 0;
    this.trails = new Map();
    this.color = new THREE.Color(0x9fa9c4);
  }

  /** One print at (x, y, z), toes pointing along `heading`; size in metres; color (hex) or the default. */
  step(x, y, z, heading, size = 0.13, color = null) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    const c = color === null ? this.color : new THREE.Color(color);
    this.print.setXYZW(i, x, y, z, heading);
    this.look.setXYZW(i, this.time, size, c.r, 0);
    this.tint.setXY(i, c.g, c.b);
    this.print.needsUpdate = this.look.needsUpdate = this.tint.needsUpdate = true;
    this.geo.instanceCount = Math.max(this.geo.instanceCount, i + 1);
  }

  /**
   * Leave a trail behind a dog (call every frame): a print every stride, left, right, left…
   * key: who (one trail each); pos/heading: where the dog is; size: the dog's size; on: leave prints now?
   */
  follow(key, pos, heading, size, on, surfaceY, color = null) {
    let t = this.trails.get(key);
    if (!t) this.trails.set(key, (t = { x: pos.x, z: pos.z, side: 1 }));
    const d = Math.hypot(pos.x - t.x, pos.z - t.z), stride = 0.3 * size + 0.12;
    if (!on || d > 3) { t.x = pos.x; t.z = pos.z; return; } // (in the air, swimming, or a jump: start again)
    if (d < stride) return;
    t.x = pos.x; t.z = pos.z;
    t.side = -t.side;
    const s = 0.075 * size * t.side, cx = Math.cos(heading), cz = -Math.sin(heading);
    const x = pos.x + cx * s, z = pos.z + cz * s;
    this.step(x, surfaceY(x, z), z, heading, 0.15 * size + 0.035, color);
  }

  forget(key) { this.trails.delete(key); }

  update(dt) { this.time += dt; this.uniforms.uTime.value = this.time; }

  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}
