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

function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, paintUniforms);

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWcPos;\nvarying vec3 vWcNormal;')
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
        vWcNormal = normalize(nm * objectNormal);
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
      ${NOISE_GLSL}`
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

/** A soft painted material. Same color+options returns the same shared instance. */
export function paint(color, { vertexColors = false, transparent = false, opacity = 1, side = THREE.FrontSide, emissive = 0x000000 } = {}) {
  const key = `${color}|${vertexColors}|${transparent}|${opacity}|${side}|${emissive}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({ color, vertexColors, transparent, opacity, side, emissive });
  m.onBeforeCompile = onBeforeCompile;
  m.customProgramCacheKey = () => 'watercolor-v1';
  cache.set(key, m);
  return m;
}
