import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { createPaperTexture } from './paperTexture.js';

// Noise texture channels: R = paper grain, G = big soft blobs, B = medium wobble. All tileable, 512².

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Pass 1 (low res): wobbly UVs (edge bleed) + Kuwahara filter (flat paint blobs).
const PAINT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tNoise;
uniform vec2 uRes;
uniform int uRadius;
uniform float uWobble;
uniform float uWobbleFreq;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / uRes;
  vec2 nq = gl_FragCoord.xy / 512.0 * uWobbleFreq * 0.6;
  vec2 wob = vec2(texture2D(tNoise, nq).b, texture2D(tNoise, nq + vec2(0.37, 0.71)).b) - 0.5;
  vec2 uv = vUv + wob * uWobble * px;

  if (uRadius <= 0) { gl_FragColor = texture2D(tScene, uv); return; }

  vec3 m[4]; vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  int r = uRadius;
  for (int j = -r; j <= r; j++) {
    for (int i = -r; i <= r; i++) {
      vec3 c = texture2D(tScene, uv + vec2(float(i), float(j)) * px).rgb;
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
      if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
      if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
      if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
    }
  }
  float n = float((r + 1) * (r + 1));
  float best = 1e9; vec3 outc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec3 mu = m[k] / n;
    vec3 v = abs(s[k] / n - mu * mu);
    float sig = v.r + v.g + v.b;
    if (sig < best) { best = sig; outc = mu; }
  }
  gl_FragColor = vec4(outc, 1.0);
}
`;

// Pass 2 (full res): wet-edge darkening, pigment density, granulation, wobbly ink lines, paper.
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tPaint;
uniform sampler2D tDepth;
uniform sampler2D tNoise;
uniform vec2 uRes;       // output resolution
uniform vec2 uLowRes;    // paint/depth resolution
uniform float uNear, uFar;
uniform float uWetEdge, uWetRadius;
uniform float uDensity, uDensityScale;
uniform float uGranulation;
uniform float uInk, uInkWidth, uInkWobble;
uniform float uPaper, uPaperScale;
uniform vec3 uPaperColor, uInkColor;
uniform float uVignette;
uniform float uSaturation;
uniform float uSniff;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// Bousseau et al.: darken/lighten a pigment the way a thicker/thinner wash does.
vec3 pigment(vec3 c, float d) { return clamp(c - (c - c * c) * (d - 1.0), 0.0, 1.0); }

void main() {
  vec2 lpx = 1.0 / uLowRes;
  vec3 lin = texture2D(tPaint, vUv).rgb;
  vec3 c = toSRGB(lin);

  // Wet edges: pigment pools where a wash meets a different color.
  vec3 blur = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472;
    blur += texture2D(tPaint, vUv + vec2(cos(a), sin(a)) * uWetRadius * lpx).rgb;
  }
  blur = toSRGB(blur / 6.0);
  float edge = clamp(length(c - blur) * 2.5, 0.0, 1.0);
  c = pigment(c, 1.0 + edge * uWetEdge);

  // Uneven wash density (turbulent flow).
  vec2 sp = vUv * vec2(uRes.x / uRes.y, 1.0) * uDensityScale;
  float dens = texture2D(tNoise, sp * 0.25).g * 0.7 + texture2D(tNoise, sp * 0.8 + 0.3).g * 0.3;
  c = pigment(c, 1.0 + (dens - 0.5) * uDensity);

  // Paper texture & pigment granulation into the paper's valleys.
  vec4 nz = texture2D(tNoise, gl_FragCoord.xy / uPaperScale / 512.0);
  float paper = nz.r;
  c = pigment(c, 1.0 + (0.5 - paper) * uGranulation);

  // Ink: depth discontinuities, sampled through wobbly coordinates so lines look hand drawn.
  vec2 wq = gl_FragCoord.xy / 900.0;
  vec2 wob = (vec2(texture2D(tNoise, wq).b, texture2D(tNoise, wq + 0.5).b) - 0.5) * uInkWobble * lpx * 2.0;
  vec2 iuv = vUv + wob;
  float d0 = linDepth(iuv);
  vec2 w = uInkWidth * lpx;
  float dl = linDepth(iuv - vec2(w.x, 0.0)), dr = linDepth(iuv + vec2(w.x, 0.0));
  float dd = linDepth(iuv - vec2(0.0, w.y)), du = linDepth(iuv + vec2(0.0, w.y));
  float dmax = max(max(abs(dl - d0), abs(dr - d0)), max(abs(dd - d0), abs(du - d0)));
  float ink = smoothstep(0.06, 0.16, dmax / max(d0, 0.5) * 3.0);
  ink *= 1.0 - smoothstep(25.0, 70.0, d0);                       // fade lines into the distance
  ink *= 0.5 + 0.5 * texture2D(tNoise, gl_FragCoord.xy / 300.0).b; // broken, pencil-like strokes
  c = mix(c, uInkColor * c * 1.2, clamp(ink * uInk, 0.0, 1.0));

  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  // Sniff vision: the world fades to a warm sepia so scent trails stand out.
  c = mix(c, mix(vec3(l) * vec3(1.06, 0.97, 0.86), c, 0.35), uSniff * 0.8);

  // Paper shows through: multiply by paper tone, lighter in the fibres.
  vec3 paperTone = uPaperColor * (0.9 + 0.1 * paper);
  c = mix(c, c * paperTone, uPaper);

  // Soft paper-colored border, like the unpainted edge of the sheet.
  vec2 vq = vUv - 0.5;
  float vig = smoothstep(0.35, 0.85, length(vq * vec2(1.0, 0.85)) + (texture2D(tNoise, vUv * 1.5).g - 0.5) * 0.15);
  c = mix(c, uPaperColor, vig * uVignette);
  c = mix(c, c * vec3(0.82, 0.72, 0.62), smoothstep(0.25, 0.75, length(vq)) * uSniff * 0.7);

  gl_FragColor = vec4(c, 1.0);
}
`;

export class WatercolorPipeline {
  constructor(renderer, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.params = {
      enabled: true,
      // Paint at full resolution — MSAA is off (the paint filter smooths edges anyway), which makes
      // full resolution about as cheap as the old blurry 67%-with-MSAA. Phones start a little lower.
      renderScale: quality === 'high' ? 1.0 : 0.85,
      autoQuality: true,
      radius: quality === 'high' ? 3 : 2,
      wobble: 4.5,
      wobbleFreq: 1.6,
      wetEdge: 2.2,
      wetRadius: 2.5,
      density: 0.8,
      densityScale: 2.5,
      granulation: 0.55,
      ink: 0.6,
      inkWidth: 1.0,
      inkWobble: 2.0,
      paper: 0.6,
      paperScale: 1.0,
      vignette: 0.6,
      saturation: 1.0,
      paperColor: '#f6efe0',
      inkColor: '#4a3a33',
    };
    this.outW = 1; this.outH = 1;
    this.frameTimes = [];
    this.qualityCooldown = 2;

    const rtOpts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, samples: 0 });
    this.minScale = quality === 'high' ? 0.75 : 0.65;
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.paintRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    const noise = createPaperTexture();

    this.paintMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PAINT_FRAG,
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tNoise: { value: noise },
        uRes: { value: new THREE.Vector2() },
        uRadius: { value: 3 },
        uWobble: { value: 4 },
        uWobbleFreq: { value: 1.6 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tPaint: { value: this.paintRT.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        tNoise: { value: noise },
        uRes: { value: new THREE.Vector2() },
        uLowRes: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 200 },
        uWetEdge: { value: 0 }, uWetRadius: { value: 0 },
        uDensity: { value: 0 }, uDensityScale: { value: 0 },
        uGranulation: { value: 0 },
        uInk: { value: 0 }, uInkWidth: { value: 1 }, uInkWobble: { value: 0 },
        uPaper: { value: 0 }, uPaperScale: { value: 1 },
        uPaperColor: { value: new THREE.Color() },
        uInkColor: { value: new THREE.Color() },
        uVignette: { value: 0 },
        uSaturation: { value: 1 },
        uSniff: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.paintMat);
  }

  /** Output (drawing-buffer) size in pixels. */
  setSize(w, h) {
    this.outW = w; this.outH = h;
    const s = this.params.renderScale;
    const lw = Math.max(1, Math.round(w * s)), lh = Math.max(1, Math.round(h * s));
    this.sceneRT.setSize(lw, lh);
    this.paintRT.setSize(lw, lh);
    this.paintMat.uniforms.uRes.value.set(lw, lh);
    this.compMat.uniforms.uLowRes.value.set(lw, lh);
    this.compMat.uniforms.uRes.value.set(w, h);
    this._scale = s;
  }

  /** Drop quality step by step if frames are slow (integrated GPUs, tablets). */
  adapt(dt) {
    const p = this.params;
    if (!p.autoQuality || !p.enabled) return;
    this.qualityCooldown -= dt;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    if (this.qualityCooldown > 0 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (avg > 1 / 40) {
      // Cheapest-looking losses first; keep the image sharp as long as possible.
      if (p.radius > 1) p.radius--;
      else if (p.renderScale > this.minScale) { p.renderScale = Math.max(this.minScale, p.renderScale - 0.05); this.setSize(this.outW, this.outH); }
      else this.onTooSlow?.();
      this.frameTimes.length = 0;
      this.qualityCooldown = 2;
    }
  }

  syncUniforms(camera) {
    const p = this.params, pu = this.paintMat.uniforms, cu = this.compMat.uniforms;
    if (p.renderScale !== this._scale) this.setSize(this.outW, this.outH);
    pu.uRadius.value = p.radius;
    pu.uWobble.value = p.wobble;
    pu.uWobbleFreq.value = p.wobbleFreq;
    cu.uNear.value = camera.near;
    cu.uFar.value = camera.far;
    cu.uWetEdge.value = p.wetEdge;
    cu.uWetRadius.value = p.wetRadius;
    cu.uDensity.value = p.density;
    cu.uDensityScale.value = p.densityScale;
    cu.uGranulation.value = p.granulation;
    cu.uInk.value = p.ink;
    cu.uInkWidth.value = p.inkWidth;
    cu.uInkWobble.value = p.inkWobble;
    cu.uPaper.value = p.paper;
    cu.uPaperScale.value = p.paperScale;
    // Shader works in display space, so hand it the sRGB values as-is.
    cu.uPaperColor.value.setStyle(p.paperColor, THREE.SRGBColorSpace).convertLinearToSRGB();
    cu.uInkColor.value.setStyle(p.inkColor, THREE.SRGBColorSpace).convertLinearToSRGB();
    cu.uVignette.value = p.vignette;
    cu.uSaturation.value = p.saturation;
    cu.uSniff.value = this.sniff ?? 0;
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.params.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    this.syncUniforms(camera);
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    this.quad.material = this.paintMat;
    r.setRenderTarget(this.paintRT);
    this.quad.render(r);

    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
