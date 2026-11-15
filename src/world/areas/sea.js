import * as THREE from 'three';
import { paintUniforms } from '../../render/watercolorMaterial.js';

/*
 * 🌊 The sea, painted by its own little shaders (one big flat surface: cheap, however far it goes):
 *   seaMaterial: shallows to deep water, swells rolling in to the shore, whitecaps when it's windy, glints
 *     of sun, a lacy edge of foam, and a fog of its own that fades into the sky's horizon, so it looks like
 *     sea all the way out.
 *   swashMaterial: the thin sheet of a wave running up the sand and sliding back, with a frothy front and
 *     wet, shiny sand where it's just been. The game moves it (uniforms), and the water zone with it.
 * Colours are plain (linear) THREE.Colors, like every other material in the scene. The beach's game
 * (game/town/beach/) keeps the fog, the weather and the season up to date; built headless, they're defaults.
 */

const NOISE = /* glsl */ `
float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/** Uniforms shared by the sea and the wave sheet (the game updates them). */
export function seaUniforms(a, shore) {
  return {
    uTime: { value: 0 },
    uDir: { value: new THREE.Vector2(a.dir[0], a.dir[1]) },
    uAcross: { value: new THREE.Vector2(a.across[0], a.across[1]) },
    uShore: { value: shore },
    uChop: { value: 0.15 },     // 0 calm … 1 a windy, white-capped sea
    uGlint: { value: 1 },       // sunshine on the water (less under cloud)
    uShallow: { value: new THREE.Color(0x9fd2cc) },
    uDeep: { value: new THREE.Color(0x5f9ec0) },
    uFoam: { value: new THREE.Color(0xf7f8f2) },
    uSand: { value: new THREE.Color(0xc4ab7c) },
    uLight: paintUniforms.uLightTint, // (the style's and the season's light, shared)
    uFogCol: { value: new THREE.Color(0xe4e6dc) },
    uFogNear: { value: 30 },
    uFogFar: { value: 120 },
    uFar: { value: 200 },
    uHorizon: { value: new THREE.Color(0xf3e6cf) },
    // the wave sheet
    uEdge: { value: 0.5 },      // where a wave's front is (metres up the beach from the waterline: negative)
    uSheen: { value: 0.5 },     // how far up the last wave got (the wet, shiny sand behind it)
    uSheenK: { value: 0 },      // and how wet that still is (0 dry … 1 just now)
  };
}

const SEA_VERT = /* glsl */ `
attribute float aEdge;
varying vec3 vW;
varying float vEdge, vDepth;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vEdge = aEdge;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const SEA_FRAG = /* glsl */ `
uniform float uTime, uShore, uChop, uGlint, uFogNear, uFogFar, uFar;
uniform vec2 uDir, uAcross;
uniform vec3 uShallow, uDeep, uFoam, uLight, uFogCol, uHorizon;
varying vec3 vW;
varying float vEdge, vDepth;
${NOISE}
void main() {
  float v = vEdge;                                  // metres out from the water's edge
  float u = dot(uAcross, vW.xz), out_ = dot(uDir, vW.xz) - uShore;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.5, 24.0, v));
  // Long swells rolling in to the shore: soft, broken bands of lighter water.
  float wob = sNoise(vec2(u * 0.045, out_ * 0.05)) * 5.0;
  float sw = sin((out_ + wob) * 0.62 + uTime * 1.5);
  float band = smoothstep(0.62, 0.97, sw) * (0.45 + 0.55 * sNoise(vec2(u * 0.13 + uTime * 0.04, out_ * 0.11)));
  col = mix(col, mix(col, uFoam, 0.6), band * smoothstep(55.0, 2.0, v) * (0.32 + uChop * 0.5));
  // White horses further out when it's windy.
  float wc = sNoise(vec2(u * 0.32 + uTime * 0.5, out_ * 0.3 - uTime * 0.25)) * sNoise(vec2(u * 0.09 - uTime * 0.03, out_ * 0.08));
  col = mix(col, uFoam, smoothstep(0.5 - uChop * 0.17, 0.56 - uChop * 0.15, wc) * (0.15 + uChop * 0.7) * smoothstep(5.0, 14.0, v));
  // A lacy edge of foam where the sea meets the sand.
  float lace = sNoise(vec2(u * 0.7 + uTime * 0.35, uTime * 0.25 + out_ * 0.3));
  col = mix(col, uFoam, smoothstep(1.1 + lace * 0.8, 0.15, v) * 0.85);
  // Glints of sun.
  float g = sNoise(vec2(u * 1.6 + uTime * 0.8, out_ * 1.25 - uTime * 0.6));
  col += vec3(0.18) * smoothstep(0.84, 0.93, g) * uGlint * smoothstep(3.0, 9.0, v) * smoothstep(95.0, 30.0, vDepth);
  col *= uLight;
  // Fog: a touch further off than the land's (the sea stays blue a long way), then the sky's own horizon.
  col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar * 1.45, vDepth) * 0.86);
  col = mix(col, uHorizon, smoothstep(uFar * 0.62, uFar * 0.97, vDepth));
  gl_FragColor = vec4(col, 1.0);
}`;

const SWASH_VERT = /* glsl */ `
attribute float aV;
varying vec3 vW;
varying float vV, vDepth;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vV = aV;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const SWASH_FRAG = /* glsl */ `
uniform float uTime, uEdge, uSheen, uSheenK, uFogNear, uFogFar;
uniform vec2 uAcross;
uniform vec3 uShallow, uFoam, uSand, uLight, uFogCol;
varying vec3 vW;
varying float vV, vDepth;
${NOISE}
void main() {
  float u = dot(uAcross, vW.xz);
  // The wave's front, wobbling along the beach.
  float front = uEdge + (sNoise(vec2(u * 0.16, uTime * 0.12)) - 0.5) * 1.1 + (sNoise(vec2(u * 0.6, uTime * 0.4)) - 0.5) * 0.25;
  float under = vV - front;                         // > 0: under the sheet of water
  vec4 c = vec4(0.0);
  if (under > 0.0) {
    float froth = smoothstep(0.0, 0.08, under) * (1.0 - smoothstep(0.35, 1.1 + sNoise(vec2(u * 0.9, uTime)) * 0.6, under));
    vec3 water = mix(uShallow, uFoam, 0.25);
    c = vec4(mix(water, uFoam, froth), 0.42 + froth * 0.5);
    c.a *= smoothstep(0.75, 0.35, vV);              // (the sea itself takes over at its edge)
  } else if (vV > uSheen) {
    // Wet, shiny sand where the wave has just been: darker, drying off.
    float k = uSheenK * smoothstep(uSheen, uSheen + 0.6, vV) * (0.75 + 0.25 * sNoise(vec2(u * 0.5, vV * 2.0)));
    c = vec4(uSand * 0.82, 0.35 * k);
  }
  if (c.a < 0.01) discard;
  c.rgb *= uLight;
  c.rgb = mix(c.rgb, uFogCol, smoothstep(uFogNear, uFogFar, vDepth) * 0.86);
  gl_FragColor = c;
}`;

/** The sea's material (one per beach). */
export function seaMaterial(uniforms) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: false });
}

/** The wave sheet's material. */
export function swashMaterial(uniforms) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: SWASH_VERT, fragmentShader: SWASH_FRAG, fog: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
}

/**
 * The sea's surface, in an area's (u, v) frame: from the water's edge (edgeV(u), wobbly out along the
 * headlands) out past the horizon, a grid finer near the beach than far out. y: the sea's level.
 */
export function seaGeometry(u0, u1, edgeV, y, { far = 340, side = 330, edgeY = y } = {}) {
  const us = [];
  for (let u = u0 - side; u < u0 - 30; u += 20) us.push(u);
  for (let u = u0 - 30; u < u1 + 30; u += 2) us.push(u);
  for (let u = u1 + 30; u <= u1 + side; u += 20) us.push(u);
  const rows = [0, 1.2, 3, 7, 14, 28, 60, 130, far];
  const pos = [], edge = [], idx = [];
  // (The very edge dips to the sand, so the water meets it without a step.)
  for (const d of rows) for (const u of us) { pos.push(u, d === 0 ? edgeY : y, edgeV(u) + d); edge.push(d); }
  const n = us.length;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, e = c + 1;
    idx.push(a, c, b, b, c, e); // (wound to face up)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * The strip of sand the waves run up and down, as a sheet lying on the sand (yAt(u, v): the sand's height),
 * from v0 to v1 (attribute aV: metres from the waterline vS).
 */
export function swashGeometry(u0, u1, v0, v1, vS, yAt) {
  const pos = [], av = [], idx = [], cols = Math.ceil((u1 - u0) / 2), rows = Math.ceil((v1 - v0) / 0.7);
  for (let j = 0; j <= rows; j++) {
    const v = v0 + ((v1 - v0) * j) / rows;
    for (let i = 0; i <= cols; i++) { const u = u0 + ((u1 - u0) * i) / cols; pos.push(u, yAt(u, v) + 0.014, v); av.push(v - vS); }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
