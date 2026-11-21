import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { createPaperTexture } from './paperTexture.js';

// Noise texture channels: R = paper grain, G = big soft blobs, B = medium wobble. All tileable, 512².

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Pass 1 (low res): wobbly UVs (edge bleed) + Kuwahara filter (flat paint blobs).
// The blob radius R is built into the shader (a #define, one shader per size, swapped when auto
// quality changes it), so the loops have fixed lengths the graphics chip can unroll. Each row is
// summed as its left half, middle and right half, then added to the quarters it belongs to: the same
// (2R+1)² reads as before, without four tests for every one.
const PAINT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tNoise;
uniform vec2 uRes;
uniform float uWobble;
uniform float uWobbleFreq;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / uRes;
  vec2 nq = gl_FragCoord.xy / 512.0 * uWobbleFreq * 0.6;
  vec2 wob = vec2(texture2D(tNoise, nq).b, texture2D(tNoise, nq + vec2(0.37, 0.71)).b) - 0.5;
  vec2 uv = vUv + wob * uWobble * px;
#if R < 1
  gl_FragColor = texture2D(tScene, uv);
#else
  // m0..m3: the four (R+1)² quarters (up-left, up-right, down-left, down-right; the middle row and
  // column count in each one they touch); s0..s3: their sums of squares.
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  for (int j = -R; j <= R; j++) {
    float y = float(j) * px.y;
    vec3 c = texture2D(tScene, uv + vec2(0.0, y)).rgb;
    vec3 lm = c, ls = c * c, rm = c, rs = c * c; // (the middle column is in both halves)
    for (int i = 1; i <= R; i++) {
      vec3 a = texture2D(tScene, uv + vec2(-float(i) * px.x, y)).rgb;
      vec3 b = texture2D(tScene, uv + vec2(float(i) * px.x, y)).rgb;
      lm += a; ls += a * a; rm += b; rs += b * b;
    }
    if (j <= 0) { m0 += lm; s0 += ls; m1 += rm; s1 += rs; }
    if (j >= 0) { m2 += lm; s2 += ls; m3 += rm; s3 += rs; }
  }
  const float n = float((R + 1) * (R + 1));
  vec3 mu = m0 / n, v = abs(s0 / n - mu * mu);
  float best = v.r + v.g + v.b; vec3 outc = mu;
  mu = m1 / n; v = abs(s1 / n - mu * mu);
  if (v.r + v.g + v.b < best) { best = v.r + v.g + v.b; outc = mu; }
  mu = m2 / n; v = abs(s2 / n - mu * mu);
  if (v.r + v.g + v.b < best) { best = v.r + v.g + v.b; outc = mu; }
  mu = m3 / n; v = abs(s3 / n - mu * mu);
  if (v.r + v.g + v.b < best) { outc = mu; }
  gl_FragColor = vec4(outc, 1.0);
#endif
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
  // (Six taps round a circle, at fixed angles: no sin and cos per tap per pixel.)
  vec2 wr = uWetRadius * lpx;
  vec3 blur = texture2D(tPaint, vUv + vec2(1.0, 0.0) * wr).rgb
    + texture2D(tPaint, vUv + vec2(0.5, 0.8660254) * wr).rgb
    + texture2D(tPaint, vUv + vec2(-0.5, 0.8660254) * wr).rgb
    + texture2D(tPaint, vUv + vec2(-1.0, 0.0) * wr).rgb
    + texture2D(tPaint, vUv + vec2(-0.5, -0.8660254) * wr).rgb
    + texture2D(tPaint, vUv + vec2(0.5, -0.8660254) * wr).rgb;
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

/**
 * Auto quality's ladder, best first. Slow frames step down a rung at a time — smaller paint blobs
 * first (the paint filter reads (2r+1)² pixels for each one, so they cost the most, and one size
 * smaller hardly shows), then a little less paint resolution (that's what looks blurry, so it comes
 * last). Quick frames step back up. Blob sizes are relative to the style's own.
 */
export const LADDER = [
  { drop: 0, scale: 1 },     // 0: the full look (computers start here)
  { drop: 1, scale: 1 },     // 1: phones start here
  { drop: 1, scale: 0.9 },
  { drop: 2, scale: 0.9 },
  { drop: 2, scale: 0.85 },
  { drop: 2, scale: 0.8 },   // as low as phones go
  { drop: 2, scale: 0.75 },  // as low as computers go
];
const SLOW = 1 / 33, VERY_SLOW = 1 / 22, FAST = 1 / 52; // typical frame slower than ~33 fps / ~22 fps; quicker than ~52 fps

export class WatercolorPipeline {
  constructor(renderer, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.params = {
      enabled: true,
      // Paint at full resolution — MSAA is off (the paint filter smooths edges anyway), which makes
      // full resolution about as cheap as the old blurry 67%-with-MSAA. (The most auto quality uses.)
      renderScale: 1.0,
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
    // How strong the paper/wash texture is (0 = clean colour, 1 = full watercolour paper).
    // Scales the screen-space layers that read like an overlay: blotchy wash, paper grain, paper tint, border.
    this.texture = 1;
    this.frameTimes = [];
    this.level = quality === 'high' ? 0 : 1;                                  // where we are on LADDER
    this.floor = quality === 'high' ? LADDER.length - 1 : LADDER.length - 2;  // and how far down we'll go
    this.settleUntil = 0;   // ignore frames until then (just started, resized, back from another tab…)
    this.started = false;
    this.fastStreak = 0;    // quick windows in a row
    this.lastMove = null;   // { dir, med, at }: the last step, to judge whether it helped
    this.capped = false;    // a step down didn't help: the frame rate's capped (e.g. low-power mode)
    this.noUpUntil = 0;     // a step up was too slow a moment ago: no more until then
    this.ceilingWait = 60000; // (and how long the next such wait will be)
    document.addEventListener?.('visibilitychange', () => this.settle(2000));

    // 8-bit sRGB pictures (the chip turns them back into linear colour when they're read): half the
    // memory and reading of 16-bit floats, which the paint filter and the composite read many times a
    // pixel. sRGB keeps the steps even to the eye, like the screen's own.
    const rtOpts = { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, samples: 0 });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.paintRT = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false }); // (a flat picture: no depth to keep or clear)
    const noise = createPaperTexture();

    this.paintMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PAINT_FRAG,
      defines: { R: 3 }, // (the blob radius: see syncUniforms)
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tNoise: { value: noise },
        uRes: { value: new THREE.Vector2() },
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

  /** The paint resolution and blob size in use right now (the style's, less any auto-quality steps). */
  get effScale() { return this.params.renderScale * LADDER[this.level].scale; }
  get effRadius() { return Math.max(1, this.params.radius - LADDER[this.level].drop); }

  /** Don't judge the frame rate for a moment (something just changed). */
  settle(ms = 1500) { this.settleUntil = Math.max(this.settleUntil, performance.now() + ms); this.frameTimes.length = 0; }

  /** "Always sharp": no automatic steps down (and back to the full look now). */
  setSharp(on) {
    this.params.autoQuality = !on;
    if (on && this.level !== 0) { this.level = 0; this.setSize(this.outW, this.outH); }
    this.capped = false; this.gaveUp = false; this.noUpUntil = 0; this.lastMove = null; this.fastStreak = 0;
    this.settle(1500);
  }

  /** Output (drawing-buffer) size in pixels. */
  setSize(w, h) {
    this.outW = w; this.outH = h;
    const s = this.effScale;
    const lw = Math.max(1, Math.round(w * s)), lh = Math.max(1, Math.round(h * s));
    this.sceneRT.setSize(lw, lh);
    this.paintRT.setSize(lw, lh);
    this.paintMat.uniforms.uRes.value.set(lw, lh);
    this.compMat.uniforms.uLowRes.value.set(lw, lh);
    this.compMat.uniforms.uRes.value.set(w, h);
    this._scale = s;
  }

  /**
   * Auto quality, called every frame with the real (unclamped) frame time. Judges the typical
   * (median) frame over about a second, ignoring the moments just after a change.
   *   Slow (under ~33 fps): a step down — kept only if it actually helped. Paint steps first; if one
   *     doesn't help, fewer pixels get a try; if that doesn't either, the frame rate's capped (a phone
   *     in low-power mode runs at 30 fps whatever we do) and blurring it would be for nothing.
   *   Quick (over ~52 fps) for a few seconds: a step back up — and if that's too slow, back down,
   *     and no more trying for a while (longer each time).
   */
  adapt(dt) {
    const p = this.params;
    if (!p.autoQuality || !p.enabled) return;
    const now = performance.now();
    if (!this.started) { this.started = true; this.settle(3000); return; } // (shaders compiling, the town building…)
    if (now < this.settleUntil) return;
    this.frameTimes.push(dt); // (the odd hitch doesn't move the median)
    if (this.frameTimes.length < 45) return;
    const sorted = this.frameTimes.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1];
    this.frameTimes.length = 0;
    const last = this.lastMove;
    this.lastMove = null;
    if (last && now - last.at < 5000) {
      if (last.dir < 0 && med > last.med * 0.98) { // that step didn't help at all: undo exactly it
        this.step(+1, med, last.lever);
        this.lastMove = null;
        if (last.lever === 'paint' && !this.capped && this.step(-1, med, 'pixels')) return; // maybe it's the pixels?
        if (this.capped) this.gaveUp = true; // (slow for some other reason: stop trying)
        this.capped = true;
        return;
      }
      if (last.dir > 0 && med > SLOW) { // too much: back down, and leave it a while before trying again
        this.step(-1, med, last.lever);
        this.lastMove = null;
        this.noUpUntil = now + this.ceilingWait;
        this.ceilingWait = Math.min(this.ceilingWait * 2, 600000);
        return;
      }
    }
    if (med > SLOW) {
      this.fastStreak = 0;
      if (!this.capped || (med > VERY_SLOW && !this.gaveUp)) this.step(-1, med);
    } else if (med < FAST) {
      if (++this.fastStreak >= 5 && now >= (this.noUpUntil ?? 0)) this.step(+1, med);
    } else this.fastStreak = 0;
  }

  /**
   * One step down (-1) or up (+1), with either lever or just `only` one: 'paint' (the ladder) or
   * 'pixels' (main.js's pixel ratio: down last, up first). Returns the lever that moved, or null.
   */
  step(dir, med, only = null) {
    let lever = null;
    if (dir < 0) {
      if (only !== 'paint' && this.extraPixels?.(true) && this.onTooSlow?.()) lever = 'pixels'; // (drawing bigger than the screen: that goes first)
      else if (only !== 'pixels' && this.level < this.floor) { this.level++; lever = 'paint'; }
      else if (only !== 'paint' && this.onTooSlow?.()) lever = 'pixels';
    } else if (this.extraPixels?.(false)) { // at the screen's own pixels or more: the full paint first, then extra pixels
      if (only !== 'pixels' && this.level > 0) { this.level--; lever = 'paint'; }
      else if (only !== 'paint' && this.onFast?.()) lever = 'pixels';
    } else if (only !== 'paint' && this.onFast?.()) lever = 'pixels';
    else if (only !== 'pixels' && this.level > 0) { this.level--; lever = 'paint'; }
    this.fastStreak = 0;
    if (!lever) return null;
    this.setSize(this.outW, this.outH);
    this.lastMove = { dir, med, lever, at: performance.now() };
    this.settle(800);
    return lever;
  }

  syncUniforms(camera) {
    const p = this.params, pu = this.paintMat.uniforms, cu = this.compMat.uniforms;
    if (this.effScale !== this._scale) this.setSize(this.outW, this.outH);
    const R = this.effRadius; // (a new size means the shader for that size: made once, then reused)
    if (this.paintMat.defines.R !== R) { this.paintMat.defines.R = R; this.paintMat.needsUpdate = true; }
    pu.uWobble.value = p.wobble;
    pu.uWobbleFreq.value = p.wobbleFreq;
    cu.uNear.value = camera.near;
    cu.uFar.value = camera.far;
    cu.uWetEdge.value = p.wetEdge;
    cu.uWetRadius.value = p.wetRadius;
    const tex = this.texture;
    cu.uDensity.value = p.density * tex;
    cu.uDensityScale.value = p.densityScale;
    cu.uGranulation.value = p.granulation * tex;
    cu.uInk.value = p.ink;
    cu.uInkWidth.value = p.inkWidth;
    cu.uInkWobble.value = p.inkWobble;
    cu.uPaper.value = p.paper * tex;
    cu.uPaperScale.value = p.paperScale;
    // Shader works in display space, so hand it the sRGB values as-is.
    cu.uPaperColor.value.setStyle(p.paperColor, THREE.SRGBColorSpace).convertLinearToSRGB();
    cu.uInkColor.value.setStyle(p.inkColor, THREE.SRGBColorSpace).convertLinearToSRGB();
    cu.uVignette.value = p.vignette * tex;
    cu.uSaturation.value = p.saturation;
    cu.uSniff.value = this.sniff ?? 0;
  }

  render(scene, camera) {
    this.paintPicture(scene, camera);
    // A one-off look at the finished picture, while it's still there to read (the 📮 postcard jigsaw):
    // snap = (canvas) → … copies it straight away.
    if (this.snap) { const f = this.snap; this.snap = null; f(this.renderer.domElement); }
  }

  paintPicture(scene, camera) {
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
