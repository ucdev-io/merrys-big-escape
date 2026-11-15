import * as THREE from 'three';

// Shared uniforms: every painted material references these same objects, so the
// style panel can retune the whole world at once.
export const paintUniforms = {
  uShadowTint: { value: new THREE.Color(0.62, 0.6, 0.86) }, // shadows go blue-violet, never black
  uLightTint: { value: new THREE.Color(1.06, 1.0, 0.9) },   // warm sunlit side
  uBanding: { value: 0.65 },     // 0 = smooth shading, 1 = hard bands
  uBandSoft: { value: 0.22 },    // softness of the band edges
  uSkyFill: { value: 0.18 },     // light bouncing down from the sky
  uPigmentVar: { value: 0.16 },  // blotchy pigment variation on surfaces
  uPigmentScale: { value: 1.6 },
  uSunIntensity: { value: 1.0 },
};

/*
 * 🍂❄️🌸☀️ Seasons, painted in. Materials made with paint(color, { season }) (and everything the
 * town or garden bakes together: see world/merge.js) follow these shared uniforms, so the whole world
 * changes with the season and the weather: snow settles on whatever faces up, leaves turn, blossom
 * comes out, greens go lush or frosty, and rain darkens things. render/seasonLook.js sets them.
 * Anything else (dogs, people, effects) keeps exactly the shader it always had.
 *
 * Season kinds (what a surface is): none 0 (never changes), world 1 (snow and rain only), plant 2
 * (also its greens follow the season — the default), foliage 3 (tree leaves: autumn colours, blossom),
 * road 4 (slushy snow). Merged geometry carries one per vertex (attribute wcKind = kind + 8 × a random
 * 0–31 for the thing it came from, so each tree picks its own autumn colour, and whether it blossoms).
 */
export const SEASON_KINDS = { none: 0, world: 1, plant: 2, foliage: 3, road: 4 };
const col = (hex) => new THREE.Color(hex);
export const seasonUniforms = {
  uSnow: { value: 0 },     // snow cover, 0..1 (it settles patchily as this rises)
  uFrost: { value: 0 },    // winter: pale, frosty greens
  uAutumn: { value: 0 },   // autumn: leaves turn, and fall on the ground
  uBlossom: { value: 0 },  // spring: blossom on some trees, petals under them
  uFresh: { value: 0 },    // spring: fresh yellow-greens
  uLush: { value: 0 },     // summer: deep, rich greens
  uWet: { value: 0 },      // rain: everything a shade darker
  uSnowCol: { value: col(0xf7f9fd) },
  uLeafA: { value: col(0xe8b44a) }, // gold
  uLeafB: { value: col(0xdb7a35) }, // orange
  uLeafC: { value: col(0xb44a2e) }, // russet
  uLeafD: { value: col(0xa7a64a) }, // still a bit green
  uBlossomA: { value: col(0xf6c3d3) },
  uBlossomB: { value: col(0xfdf0f3) },
};

const NOISE_GLSL = /* glsl */ `
float wcHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wcNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wcHash(i + vec3(0,0,0)), wcHash(i + vec3(1,0,0)), f.x),
                 mix(wcHash(i + vec3(0,1,0)), wcHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wcHash(i + vec3(0,0,1)), wcHash(i + vec3(1,0,1)), f.x),
                 mix(wcHash(i + vec3(0,1,1)), wcHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

// The season, applied to a surface's base pigment before it's lit (so snow and leaves shade like
// everything else). The uniform checks are the same for every pixel, so they cost next to nothing.
const SEASON_GLSL = /* glsl */ `
varying float vWcKind, vWcRnd;
uniform float uSnow, uFrost, uAutumn, uBlossom, uFresh, uLush, uWet;
uniform vec3 uSnowCol, uLeafA, uLeafB, uLeafC, uLeafD, uBlossomA, uBlossomB;
vec3 wcAutumn(float tree, float fine) {
  return tree < 0.33 ? mix(uLeafA, uLeafB, fine) : tree < 0.6 ? mix(uLeafB, uLeafC, fine) : tree < 0.84 ? mix(uLeafC, uLeafA, fine * 0.6) : mix(uLeafD, uLeafA, fine);
}
vec3 wcSeason(vec3 base, vec3 p, vec3 n) {
  float kind = vWcKind;
  if (kind < 0.5) return base;
  bool plant = kind > 1.5 && kind < 3.5, leaf = kind > 2.5 && kind < 3.5;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float green = clamp((base.g - max(base.r, base.b)) * 5.0, 0.0, 1.0); // how leafy this pigment is
  // Each tree (and the ground under it) shares a slow wash of noise: its own autumn colour, blossom or not.
  float tree = (uAutumn + uBlossom > 0.001) ? wcNoise(vec3(p.x, 0.0, p.z) * 0.21 + 3.7) : 0.5;
  if (plant) {
    vec3 lush = mix(vec3(lum), base, 1.35) * vec3(0.95, 1.0, 0.9);
    vec3 fresh = base * vec3(1.05, 1.08, 0.86) + vec3(0.012, 0.02, 0.0);
    vec3 frost = mix(vec3(lum), base, 0.35) * 0.9 + vec3(0.12, 0.13, 0.14);
    vec3 golden = base * vec3(1.1, 1.0, 0.78);
    base = mix(base, lush, green * uLush);
    base = mix(base, fresh, green * uFresh);
    base = mix(base, golden, green * uAutumn * (leaf ? 0.0 : 0.45));
    base = mix(base, frost, green * uFrost);
  }
  if (leaf && uAutumn + uBlossom > 0.001) { // (vWcRnd: this tree's own dice roll)
    float fine = wcNoise(p * 1.7);
    base = mix(base, wcAutumn(vWcRnd, fine) * (0.62 + lum * 1.3), uAutumn * green);
    float bl = step(0.55, vWcRnd) * smoothstep(0.26, 0.5, wcNoise(p * 6.0 + 7.0));
    base = mix(base, mix(uBlossomA, uBlossomB, fine), bl * uBlossom);
  }
  // Fallen leaves (autumn) and petals (under the blossom, in spring): small, scattered, more in some places.
  if (!leaf && uAutumn + uBlossom > 0.001 && n.y > 0.7) {
    float d = wcNoise(p * 9.0 + 11.0), level = smoothstep(0.75, 0.95, n.y) * (kind > 3.5 ? 0.35 : 1.0); // ('flat' is a GLSL word)
    float leaves = smoothstep(0.8, 0.86, d) * smoothstep(0.25, 0.7, tree) * uAutumn;
    float petals = smoothstep(0.83, 0.88, d) * smoothstep(0.47, 0.54, tree) * uBlossom * green; // (on the grass)
    base = mix(base, wcAutumn(tree, fract(d * 9.0)) * 0.95, leaves * level * 0.85);
    base = mix(base, uBlossomA, petals * level * 0.85);
  }
  float cover = 0.0;
  if (uSnow > 0.001) {
    float drift = wcNoise(p * 2.1) - 0.5;
    cover = smoothstep(0.25, 0.6, n.y + drift * 0.5 - (1.0 - uSnow) * 0.9) * min(1.0, uSnow * 6.0);
    if (kind > 3.5) cover *= 0.4 + 0.35 * smoothstep(0.3, 0.7, wcNoise(p * 0.6)); // roads: slush and tyre-worn
    base = mix(base, uSnowCol, cover);
  }
  return base * (1.0 - uWet * 0.13 * (1.0 - cover));
}
`;

function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, paintUniforms);
  const season = !!this.userData?.wcSeason; // (only seasonal materials get the extra code)
  if (season) {
    Object.assign(shader.uniforms, seasonUniforms);
    if (!this.userData.wcAttr) { shader.uniforms.uKind = { value: this.userData.wcKind ?? 2 }; shader.uniforms.uRnd = { value: this.userData.wcRnd ?? 0.5 }; }
  }

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWcPos;\nvarying vec3 vWcNormal;${season
      ? `\nvarying float vWcKind, vWcRnd;\n${this.userData.wcAttr ? 'attribute float wcKind;' : 'uniform float uKind, uRnd;'}` : ''}`)
    .replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          nm = nm * mat3(instanceMatrix);
        #endif
        vWcPos = (modelMatrix * wp).xyz;
        vWcNormal = normalize(nm * objectNormal);${season ? (this.userData.wcAttr
          ? '\n        vWcKind = mod(wcKind, 8.0); vWcRnd = floor(wcKind / 8.0) / 31.0;'
          : '\n        vWcKind = uKind; vWcRnd = uRnd;') : ''}
      }`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWcPos;
      varying vec3 vWcNormal;
      uniform vec3 uShadowTint;
      uniform vec3 uLightTint;
      uniform float uBanding;
      uniform float uBandSoft;
      uniform float uSkyFill;
      uniform float uPigmentVar;
      uniform float uPigmentScale;
      uniform float uSunIntensity;
      ${NOISE_GLSL}${season ? SEASON_GLSL : ''}`
    )
    .replace(
      '#include <opaque_fragment>',
      `{
        // How lit is this pixel by the sun (N·L × shadow), recovered from Lambert's result.
        vec3 base = diffuseColor.rgb;
        float lit = dot(reflectedLight.directDiffuse, vec3(1.0)) / max(dot(base, vec3(1.0)), 1e-4);
        lit = clamp(lit * PI / max(uSunIntensity, 1e-3), 0.0, 1.0);

        // Soft paint bands.
        float b = lit * 3.0;
        float bf = floor(b);
        float banded = (bf + smoothstep(0.5 - uBandSoft, 0.5 + uBandSoft, b - bf)) / 3.0;
        float t = mix(lit, banded, uBanding);
${season ? '\n        base = wcSeason(base, vWcPos, vWcNormal);\n' : ''}
        vec3 col = mix(base * uShadowTint, base * uLightTint, t);
        col *= 1.0 + uSkyFill * (0.5 + 0.5 * vWcNormal.y) - uSkyFill * 0.5;

        // Uneven pigment: low-frequency blotches stuck to the world.
        float n = wcNoise(vWcPos * uPigmentScale) * 0.65 + wcNoise(vWcPos * uPigmentScale * 3.7) * 0.35;
        col *= 1.0 + (n - 0.5) * uPigmentVar * 2.0;

        outgoingLight = col + totalEmissiveRadiance;
      }
      #include <opaque_fragment>`
    );
}

const cache = new Map();

/**
 * A soft painted material. Same color+options returns the same shared instance.
 * season: follow the seasons as this kind of surface ('world' | 'plant' | 'foliage' | 'road' | 'none'),
 * or 'attr' for merged geometry that says per vertex (attribute wcKind). Leave it out for anything
 * that should never change (dogs, people, effects…).
 */
export function paint(color, { vertexColors = false, transparent = false, opacity = 1, side = THREE.FrontSide, emissive = 0x000000, season = null, rnd = 0.5 } = {}) {
  if (!(season in SEASON_KINDS) && season !== 'attr' || season === 'none') season = null; // ('none': just the plain paint)
  rnd = Math.round(Math.max(0, Math.min(1, rnd)) * 31) / 31; // (a tree's own dice roll: its autumn colour, its blossom)
  const key = `${color}|${vertexColors}|${transparent}|${opacity}|${side}|${emissive}${season ? `|${season}|${rnd}` : ''}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({ color, vertexColors, transparent, opacity, side, emissive });
  m.onBeforeCompile = onBeforeCompile;
  m.userData.paint = { color, vertexColors, transparent, opacity, side, emissive };
  if (season) {
    Object.assign(m.userData, { wcSeason: true, wcAttr: season === 'attr', wcKind: SEASON_KINDS[season] ?? 2, wcRnd: rnd, season });
    m.customProgramCacheKey = () => (season === 'attr' ? 'watercolor-v1-sa' : 'watercolor-v1-s');
  } else m.customProgramCacheKey = () => 'watercolor-v1';
  cache.set(key, m);
  return m;
}

/** The seasonal twin of a painted material (as `kind`; rnd 0..1: a tree's own dice roll), or the material itself if it isn't one of ours. */
export function seasonalPaint(material, kind = 'plant', rnd = 0.5) {
  const p = material?.userData?.paint;
  if (!p || material.userData.wcSeason) return material;
  return paint(p.color, { ...p, season: kind, rnd: kind === 'foliage' ? rnd : 0.5 });
}

/** A steady dice roll (0..1) for whatever's at (x, z): the same on every device. */
export function spotRandom(x, z) {
  const h = (Math.imul(Math.round(x * 7), 73856093) ^ Math.imul(Math.round(z * 7), 19349663)) >>> 0;
  return ((Math.imul(h ^ (h >>> 13), 1274126177) >>> 0) % 32) / 31;
}
