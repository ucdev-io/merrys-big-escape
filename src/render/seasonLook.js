import * as THREE from 'three';
import { paintUniforms, seasonUniforms, paint, SEASON_KINDS } from './watercolorMaterial.js';

/*
 * 🍂❄️🌸☀️ How the world looks in each season and weather: the shared season uniforms (snow, leaves,
 * blossom, greens, wetness — see render/watercolorMaterial.js), the sky, the fog and the light.
 * Changes ease in, so snow settles and melts, leaves turn, and showers darken things gently.
 *
 * For new scenery: anything built into the town (or the garden) follows the season by itself. Things
 * added another way can call dressSeason(object) (world/merge.js), or be painted with
 * paint(color, { season: 'plant' | 'foliage' | 'world' | 'road' }). seasonColor() gives the seasonal
 * version of a colour, for anything coloured in code (particles, a mesh's own colours…).
 */

const ratio = (a, b) => a.map((v, i) => v / b[i]);
const STORYBOOK_LIGHT = [1.06, 1.0, 0.9], STORYBOOK_SHADOW = [0.62, 0.6, 0.86];
export const SEASON_LOOK = {
  spring: { frost: 0, autumn: 0, blossom: 1, fresh: 1, lush: 0.15, snow: 0, top: 0x8cbbe0, horizon: 0xf3ead8, fog: 0xe4e9dc, light: [1.05, 1.0, 0.93], shadow: [0.62, 0.62, 0.86], cloud: 0.05 },
  summer: { frost: 0, autumn: 0, blossom: 0, fresh: 0, lush: 1, snow: 0, top: 0x7db4e2, horizon: 0xf6e8c8, fog: 0xe8e6d2, light: [1.1, 1.01, 0.85], shadow: [0.6, 0.58, 0.86], cloud: -0.2 },
  autumn: { frost: 0, autumn: 1, blossom: 0, fresh: 0, lush: 0, snow: 0, top: 0x97b3cc, horizon: 0xf4dbb8, fog: 0xe9dfcd, light: [1.09, 0.98, 0.83], shadow: [0.64, 0.58, 0.82], cloud: 0.12 },
  winter: { frost: 1, autumn: 0, blossom: 0, fresh: 0, lush: 0, snow: 0.86, top: 0xa4bfd8, horizon: 0xeef0f2, fog: 0xe8ecef, light: [1.02, 1.01, 1.04], shadow: [0.6, 0.64, 0.93], cloud: 0.22 },
};
export const WEATHER_LOOK = {
  clear: { wet: 0, cloud: 0, grey: 0, dim: 1, fog: 1, sat: 1, drift: 1 },
  showers: { wet: 1, cloud: 0.95, grey: 0.6, dim: 0.84, fog: 0.72, sat: 0.86, drift: 2.5, cloudCol: 0xc8cdd3, fogCol: 0xd6dadb },
  windy: { wet: 0, cloud: 0.5, grey: 0.12, dim: 0.97, fog: 1, sat: 0.98, drift: 7 },
  snow: { wet: 0, cloud: 0.8, grey: 0.4, dim: 0.92, fog: 0.74, sat: 0.92, drift: 1.6, cloudCol: 0xedf0f4, fogCol: 0xedf0f3, snow: 1 },
};
const GREY_TOP = new THREE.Color(0xa7b0b9), GREY_HORIZON = new THREE.Color(0xdde0e1), FAIR_CLOUD = new THREE.Color(1.0, 0.98, 0.95);
const UNIFORM = { frost: 'uFrost', autumn: 'uAutumn', blossom: 'uBlossom', fresh: 'uFresh', lush: 'uLush' };

const ease = (v, to, rate, dt) => v + (to - v) * (1 - Math.exp(-dt * rate));
const toward = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

/** Drives the look. `sky`: the sky dome (if any). Call set() when the season or weather changes, update() every frame. */
export class SeasonLook {
  constructor({ scene, pipeline, sky = null }) {
    Object.assign(this, { scene, pipeline, sky });
    // Whatever the style set up is the "fine day": seasons and weather work from there.
    this.base = {
      light: paintUniforms.uLightTint.value.clone(), shadow: paintUniforms.uShadowTint.value.clone(), skyFill: paintUniforms.uSkyFill.value,
      fog: scene.fog?.color.clone(), near: scene.fog?.near, far: scene.fog?.far, sat: pipeline?.params.saturation ?? 1,
    };
    this.season = 'autumn';
    this.weather = 'clear';
    this.snowDay = 0;   // 0..1: how much a snowy spell has added to the snow
    this.wet = 0;       // 0..1: puddles and darker colours after rain
    this.mix = { ...WEATHER_LOOK.clear, cloud: 0 };
    this.cols = { top: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), cloud: new THREE.Color(), light: new THREE.Color(), shadow: new THREE.Color() };
    this._a = new THREE.Color(); this._b = new THREE.Color();
    this.first = true;
    // Places with a fog of their own, on top of the season's and the weather's (under the trees in the
    // woods…): key → { k: 0..1 how far in, near, far, color, mix }. See setLocal().
    this.locals = new Map();
  }

  /** A place's own fog (key: the area, say), or null when we're nowhere near it. The strongest one wins. */
  setLocal(key, L) { if (L && L.k > 0.001) this.locals.set(key, L); else this.locals.delete(key); }

  set(season, weather) {
    if (season) this.season = season;
    if (weather) this.weather = weather;
  }

  /** Snap straight to the current season (no easing), e.g. when the world is first shown. */
  snap() { this.first = true; this.update(1 / 60); }

  update(dt) {
    const S = SEASON_LOOK[this.season] ?? SEASON_LOOK.autumn, W = WEATHER_LOOK[this.weather] ?? WEATHER_LOOK.clear, U = seasonUniforms;
    const fast = this.first ? 1e3 : 1.1, slow = this.first ? 1e3 : 0.5;
    for (const [k, u] of Object.entries(UNIFORM)) U[u].value = ease(U[u].value, S[k], fast, dt);
    // Snow: winter's blanket, deeper while it's snowing (and it takes its time to settle and melt).
    this.snowDay = this.season === 'winter' ? toward(this.snowDay, W.snow ? 1 : 0, dt / (W.snow ? 45 : 150)) : 0;
    const snow = S.snow ? S.snow + (1 - S.snow) * this.snowDay : 0;
    U.uSnow.value = this.first ? snow : U.uSnow.value < snow ? Math.min(snow, U.uSnow.value + dt * (U.uSnow.value < S.snow * 0.98 ? 0.35 : 0.03)) : Math.max(snow, U.uSnow.value - dt * 0.4);
    // Wet: darkens as a shower gets going, then dries off slowly.
    this.wet = this.first ? W.wet : toward(this.wet, W.wet, dt / (W.wet ? 22 : 75));
    U.uWet.value = this.wet;

    // Weather mix (cloud cover, greyness, dimming, fog), easing between spells.
    const M = this.mix;
    for (const k of ['cloud', 'grey', 'dim', 'fog', 'sat', 'drift']) M[k] = ease(M[k], W[k] ?? WEATHER_LOOK.clear[k], slow * 0.6, dt);
    const C = this.cols;
    const target = (c, hex, greyTo, grey) => this._a.set(hex).lerp(greyTo, grey);
    C.top.lerp(target(C.top, S.top, GREY_TOP, M.grey), this.first ? 1 : 1 - Math.exp(-dt * 0.8));
    C.horizon.lerp(target(C.horizon, S.horizon, GREY_HORIZON, M.grey * 0.8), this.first ? 1 : 1 - Math.exp(-dt * 0.8));
    C.cloud.lerp(this._b.set(W.cloudCol ?? 0xfffaf2).lerp(FAIR_CLOUD, W.cloudCol ? 0 : 1), this.first ? 1 : 1 - Math.exp(-dt * 0.6));
    if (this.sky?.material?.uniforms) {
      const u = this.sky.material.uniforms;
      u.uTop.value.copy(C.top);
      u.uHorizon.value.copy(C.horizon);
      if (u.uCloud) { u.uCloud.value = Math.max(-0.3, Math.min(1, S.cloud + M.cloud)); u.uCloudCol.value.copy(C.cloud); }
      u.uTime.value += dt * M.drift;
    }
    const fog = this.scene.fog;
    if (fog && this.base.fog) {
      this._a.set(S.fog);
      if (W.fogCol) this._a.lerp(this._b.set(W.fogCol), Math.min(1, M.cloud));
      C.fog.lerp(this._a, this.first ? 1 : 1 - Math.exp(-dt * 0.8));
      fog.color.copy(C.fog);
      fog.near = this.base.near * M.fog;
      fog.far = this.base.far * (0.3 + 0.7 * M.fog);
      let z = null;
      for (const q of this.locals.values()) if (!z || q.k > z.k) z = q;
      if (z) { // (closer, never further than the weather's, and tinted)
        const e = z.k * z.k * (3 - 2 * z.k);
        fog.near += (Math.min(fog.near, z.near) - fog.near) * e;
        fog.far += (Math.min(fog.far, z.far) - fog.far) * e;
        fog.color.lerp(z.color, e * z.mix);
      }
    }
    // Light: the season's tint (relative to the style's own), dimmer under cloud.
    const L = ratio(S.light, STORYBOOK_LIGHT), H = ratio(S.shadow, STORYBOOK_SHADOW);
    this._a.copy(this.base.light).multiply(this._b.setRGB(...L)).multiplyScalar(M.dim);
    C.light.lerp(this._a, this.first ? 1 : 1 - Math.exp(-dt * 0.8));
    this._a.copy(this.base.shadow).multiply(this._b.setRGB(...H)).multiplyScalar(0.92 + 0.08 * M.dim);
    C.shadow.lerp(this._a, this.first ? 1 : 1 - Math.exp(-dt * 0.8));
    paintUniforms.uLightTint.value.copy(C.light);
    paintUniforms.uShadowTint.value.copy(C.shadow);
    paintUniforms.uSkyFill.value = this.base.skyFill * (this.season === 'winter' ? 1.25 : 1); // (snow bounces the light about)
    if (this.pipeline) this.pipeline.params.saturation = this.base.sat * M.sat;
    this.first = false;
  }

  /** Put the fine-day look back (e.g. leaving the town). */
  restore() {
    paintUniforms.uLightTint.value.copy(this.base.light);
    paintUniforms.uShadowTint.value.copy(this.base.shadow);
    paintUniforms.uSkyFill.value = this.base.skyFill;
    if (this.pipeline) this.pipeline.params.saturation = this.base.sat;
  }
}

/**
 * The seasonal version of a colour right now (a THREE.Color), for things coloured in code rather than
 * painted by the seasonal shader: the same shift the shader gives that kind of surface (minus the snow
 * and the noise). kind: 'plant' (greens follow the season), 'foliage' (autumn colours), 'world' (just rain).
 */
export function seasonColor(hex, kind = 'plant', out = new THREE.Color()) {
  const U = seasonUniforms, c = out.set(hex), k = SEASON_KINDS[kind] ?? 2;
  if (k < 1) return c;
  const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  const green = Math.min(1, Math.max(0, (c.g - Math.max(c.r, c.b)) * 5));
  const mixTo = (r, g, b, t) => { c.r += (r - c.r) * t; c.g += (g - c.g) * t; c.b += (b - c.b) * t; };
  if (k === 2 || k === 3) {
    const sat = (s) => [lum + (c.r - lum) * s, lum + (c.g - lum) * s, lum + (c.b - lum) * s];
    let [r, g, b] = sat(1.35); mixTo(r * 0.95, g, b * 0.9, green * U.uLush.value);
    mixTo(c.r * 1.05 + 0.012, c.g * 1.08 + 0.02, c.b * 0.86, green * U.uFresh.value);
    if (k === 2) mixTo(c.r * 1.1, c.g, c.b * 0.78, green * U.uAutumn.value * 0.45);
    [r, g, b] = sat(0.35); mixTo(r * 0.9 + 0.12, g * 0.9 + 0.13, b * 0.9 + 0.14, green * U.uFrost.value);
  }
  if (k === 3 && U.uAutumn.value > 0.001) {
    const a = U.uLeafB.value, f = 0.62 + lum * 1.3;
    mixTo(a.r * f, a.g * f, a.b * f, U.uAutumn.value * green);
  }
  return c.multiplyScalar(1 - U.uWet.value * 0.13);
}

/** A painted material that follows the season as `kind` (shorthand for paint(color, { season: kind })). */
export const seasonalMaterial = (color, kind = 'plant', opts = {}) => paint(color, { ...opts, season: kind });
export { dressSeason, seasonKindOf } from '../world/merge.js';
