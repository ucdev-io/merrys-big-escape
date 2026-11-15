import * as THREE from 'three';
import { getAudio, isMuted } from '../core/audio.js';

/*
 * 🌦️ Weather you can see and hear: rain, snowflakes, leaves (or petals) blowing about, a rainbow after
 * a shower, and a soft hiss of rain or rush of wind. The falling things live in a box that follows
 * the camera and are moved entirely on the GPU: one draw call each, and nothing to do per flake.
 */

const FALL_VERT = /* glsl */ `
attribute vec4 aSeed;   // where in the box (0..1), and a random number
attribute vec3 aCol;
uniform float uTime, uFall, uSize, uLen, uSway, uSpin, uStreak;
uniform vec3 uCam, uBox;
uniform vec2 uWind;
varying vec2 vUv;
varying vec3 vCol;
varying float vFade;
void main() {
  float r = aSeed.w, t = uTime * (0.75 + 0.5 * r);
  vec3 p;
  p.y = fract(aSeed.y - t * uFall / uBox.y) * uBox.y + uCam.y - uBox.y * 0.45;
  vec2 xz = aSeed.xz * uBox.xz + uWind * t;
  xz.x += sin(t * 1.3 + r * 40.0) * uSway; xz.y += cos(t * 1.1 + r * 25.0) * uSway;
  p.xz = uCam.xz + (fract((xz - uCam.xz) / uBox.xz) - 0.5) * uBox.xz; // tiles round the camera
  vec2 e = abs(p.xz - uCam.xz) / (uBox.xz * 0.5);
  vFade = (1.0 - smoothstep(0.75, 1.0, max(e.x, e.y))) * smoothstep(0.8, 2.2, distance(p, cameraPosition));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy;
  if (uStreak > 0.5) { // rain: a streak along the way it's falling, side-on to the camera
    up = normalize(vec3(uWind.x, -uFall, uWind.y)) * -1.0;
    right = normalize(cross(up, normalize(p - cameraPosition)));
    q *= vec2(uSize, uLen);
  } else {
    float a = uSpin * (t * (0.6 + r) + r * 6.28);
    q = mat2(cos(a), sin(a), -sin(a), cos(a)) * (q * vec2(uSize, uLen));
  }
  vec3 w = p + right * q.x + up * q.y;
  vUv = position.xy + 0.5;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FALL_FRAG = /* glsl */ `
uniform float uAlpha, uShape;
varying vec2 vUv;
varying vec3 vCol;
varying float vFade;
void main() {
  vec2 c = vUv - 0.5;
  float a;
  if (uShape < 0.5) a = (1.0 - abs(c.x) * 2.0) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y); // a streak of rain
  else if (uShape < 1.5) a = smoothstep(0.5, 0.18, length(c));                                               // a soft flake
  else a = smoothstep(0.5, 0.36, length(c * vec2(1.0, 1.7))) * (0.82 + 0.18 * smoothstep(0.0, 0.06, abs(c.x)));  // a leaf, with its vein
  a *= uAlpha * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;

const SHAPES = { rain: 0, snow: 1, leaf: 2 };

/** A box of falling things round the camera. */
class Fall {
  constructor(scene, { count, shape, box, colors, alpha, size, len }) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    const seed = new Float32Array(count * 4), col = new Float32Array(count * 3), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      c.set(colors[i % colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    this.col = new THREE.InstancedBufferAttribute(col, 3);
    g.setAttribute('aCol', this.col);
    g.instanceCount = 0;
    this.max = count;
    this.uniforms = {
      uTime: { value: 0 }, uFall: { value: 6 }, uSize: { value: size }, uLen: { value: len }, uSway: { value: 0 }, uSpin: { value: 0 },
      uStreak: { value: shape === 'rain' ? 1 : 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) },
      uWind: { value: new THREE.Vector2() }, uAlpha: { value: alpha }, uShape: { value: SHAPES[shape] },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.geo = g;
  }

  /** How many are falling (0..1 of the most), and the colours to use (leaves: the season's). */
  set(amount, colors) {
    this.geo.instanceCount = Math.round(this.max * Math.max(0, Math.min(1, amount)));
    if (colors && colors !== this.colors) {
      this.colors = colors;
      const c = new THREE.Color();
      for (let i = 0; i < this.max; i++) { c.set(colors[i % colors.length]); this.col.setXYZ(i, c.r, c.g, c.b); }
      this.col.needsUpdate = true;
    }
  }

  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}

/** A soft rainbow across the sky after a shower (opposite the sun). */
function rainbow() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; varying vec2 vUv;
      vec3 band(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float r = length((vUv - vec2(0.5, 0.0)) * vec2(2.0, 1.0)), k = (r - 0.72) / 0.14;
        if (k < 0.0 || k > 1.0) discard;
        float edge = smoothstep(0.0, 0.18, k) * smoothstep(1.0, 0.82, k);
        vec3 c = mix(vec3(1.0), band(0.78 - k * 0.78), 0.55);
        gl_FragColor = vec4(c, edge * uAlpha * 0.42 * smoothstep(0.0, 0.25, vUv.y));
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), mat);
  m.renderOrder = 1;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

/** The hiss of rain and the rush of wind (filtered noise, made on the fly). */
class WeatherSound {
  constructor() { this.nodes = null; this.rain = 0; this.wind = 0; }
  ensure() {
    const A = getAudio();
    if (this.nodes || !A || A.ctx.state !== 'running') return !!this.nodes;
    const ctx = A.ctx, len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const rainF = ctx.createBiquadFilter(); rainF.type = 'bandpass'; rainF.frequency.value = 2600; rainF.Q.value = 0.5;
    const rain = ctx.createGain(); rain.gain.value = 0;
    const windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 420; windF.Q.value = 0.8;
    const wind = ctx.createGain(); wind.gain.value = 0;
    src.connect(rainF).connect(rain).connect(A.master);
    src.connect(windF).connect(wind).connect(A.master);
    src.start();
    this.nodes = { ctx, rain, wind, windF };
    return true;
  }
  update(dt, rain, wind) {
    if (!this.ensure()) return;
    const n = this.nodes, quiet = isMuted() ? 0 : 1, t = n.ctx.currentTime;
    this.rain += (rain - this.rain) * (1 - Math.exp(-dt * 1.5));
    this.wind += (wind - this.wind) * (1 - Math.exp(-dt * 1.0));
    const gust = 0.65 + 0.35 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.0);
    n.rain.gain.setTargetAtTime(this.rain * 0.05 * quiet, t, 0.1);
    n.wind.gain.setTargetAtTime(this.wind * 0.06 * gust * quiet, t, 0.2);
    n.windF.frequency.setTargetAtTime(300 + gust * 260, t, 0.3);
  }
}

export const LEAF_COLORS = {
  autumn: [0xd9893c, 0xc0632d, 0xe0b04a, 0xb5482a, 0x9a6a3a],
  spring: [0xf6c3d3, 0xfdf0f3, 0xf2a0b4, 0xfbe0e8],      // petals
  summer: [0x8fb565, 0x9cbf6a, 0x6f9a52],
  winter: [0xf7f9fd],
};

export class WeatherFx {
  constructor(scene, { mobile = false } = {}) {
    const k = mobile ? 0.55 : 1;
    this.rain = new Fall(scene, { count: Math.round(900 * k), shape: 'rain', box: [26, 14, 26], colors: [0xc4d2de, 0xd8e2ea], alpha: 0.62, size: 0.042, len: 0.55 });
    this.snow = new Fall(scene, { count: Math.round(700 * k), shape: 'snow', box: [24, 12, 24], colors: [0xffffff, 0xf3f6fb], alpha: 0.95, size: 0.075, len: 0.075 });
    this.leaves = new Fall(scene, { count: Math.round(170 * k), shape: 'leaf', box: [30, 10, 30], colors: LEAF_COLORS.autumn, alpha: 0.95, size: 0.13, len: 0.13 });
    this.bow = rainbow();
    scene.add(this.bow);
    this.sound = new WeatherSound();
    this.amount = { rain: 0, snow: 0, leaves: 0, wind: 0 };
    this.bowT = 0;
    this.time = 0;
  }

  /** A rainbow for a while (when a shower clears up). */
  showRainbow(secs = 55) { this.bowT = secs; }

  /**
   * @param want { rain, snow, leaves, wind } 0..1 each; leafColors: what's blowing about.
   */
  update(dt, camera, want, leafColors) {
    this.time += dt;
    const A = this.amount;
    for (const k of Object.keys(A)) A[k] += ((want[k] ?? 0) - A[k]) * (1 - Math.exp(-dt * 0.6));
    const wind = A.wind;
    const cam = camera.position;
    for (const [f, amt, fall, windK, sway, spin] of [[this.rain, A.rain, 9, 2.5, 0, 0], [this.snow, A.snow, 1.1, 1.6, 0.35, 0], [this.leaves, A.leaves, 0.9, 5, 0.9, 2.2]]) {
      f.set(amt, f === this.leaves ? leafColors : null);
      const u = f.uniforms;
      u.uTime.value = this.time;
      u.uCam.value.copy(cam);
      u.uFall.value = fall;
      u.uWind.value.set(0.8 + wind * windK, 0.35 + wind * windK * 0.4);
      u.uSway.value = sway * (1 + wind);
      u.uSpin.value = spin;
    }
    // The rainbow: far off, opposite the sun (the sun shines from +x +z), standing on the horizon.
    this.bowT = Math.max(0, this.bowT - dt);
    const a = Math.min(1, this.bowT / 6, (55 - this.bowT) / 5);
    this.bow.visible = a > 0.01;
    if (this.bow.visible) {
      this.bow.material.uniforms.uAlpha.value = a;
      this.bow.position.set(cam.x - 0.8 * 150, 10, cam.z - 0.6 * 150);
      this.bow.lookAt(cam.x, 10, cam.z);
    }
    this.sound.update(dt, A.rain, Math.max(wind, A.snow * 0.25));
  }

  dispose() { for (const f of [this.rain, this.snow, this.leaves]) f.dispose(); this.bow.removeFromParent(); this.sound.update(0.1, 0, 0); }
}
