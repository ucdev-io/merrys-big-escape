import { paintUniforms } from './watercolorMaterial.js';

// Each preset sets post-process params (pipeline.params) and surface shading (paintUniforms).
const BASE_POST = {
  wobble: 4.5, wobbleFreq: 1.6, wetEdge: 2.2, wetRadius: 2.5, density: 0.8, densityScale: 2.5,
  granulation: 0.55, ink: 0.6, inkWidth: 1.0, inkWobble: 2.0, paper: 0.5, paperScale: 1.0,
  vignette: 0.4, saturation: 1.0, paperColor: '#f6efe0', inkColor: '#4a3a33', radius: 3,
};
const BASE_SHADE = { banding: 0.65, bandSoft: 0.22, skyFill: 0.18, pigmentVar: 0.16, shadowTint: [0.62, 0.6, 0.86], lightTint: [1.06, 1.0, 0.9] };

export const STYLES = {
  storybook: {
    label: 'Storybook',
    blurb: 'Gentle washes with soft pencil outlines',
    post: {}, shade: {},
  },
  softWash: {
    label: 'Soft wash',
    blurb: 'Wet, dreamy and blotchy — no outlines',
    post: { radius: 4, wobble: 7, wetEdge: 3.2, wetRadius: 3.5, density: 1.15, granulation: 0.8, ink: 0, paper: 0.75, saturation: 0.82, vignette: 0.95 },
    shade: { banding: 0.3, bandSoft: 0.4, pigmentVar: 0.26, shadowTint: [0.72, 0.68, 0.92] },
  },
  inkWash: {
    label: 'Ink & wash',
    blurb: 'Bold wobbly ink lines over light colour',
    post: { radius: 2, wobble: 3, wetEdge: 1.2, density: 0.6, granulation: 0.45, ink: 1.1, inkWidth: 1.25, inkWobble: 3.5, inkColor: '#3a2c26', paper: 0.85, saturation: 0.8 },
    shade: { banding: 0.85, bandSoft: 0.14, pigmentVar: 0.12, shadowTint: [0.7, 0.68, 0.84] },
  },
  gouache: {
    label: 'Gouache',
    blurb: 'Rich, opaque paint with chunky brush dabs',
    post: { radius: 5, wobble: 2.5, wetEdge: 0.8, density: 0.35, granulation: 0.25, ink: 0.25, paper: 0.35, vignette: 0.5, saturation: 1.22 },
    shade: { banding: 0.9, bandSoft: 0.1, pigmentVar: 0.1, skyFill: 0.25, shadowTint: [0.5, 0.5, 0.82], lightTint: [1.1, 1.02, 0.88] },
  },
  sketchbook: {
    label: 'Sketchbook',
    blurb: 'Pale, grainy colour on rough paper',
    post: { radius: 2, wobble: 5, wetEdge: 1.8, density: 1.2, granulation: 1.6, ink: 1.0, inkWidth: 1.2, inkColor: '#5b5068', paper: 1.0, saturation: 0.6, paperColor: '#f3ecdc' },
    shade: { banding: 0.6, bandSoft: 0.25, pigmentVar: 0.3, shadowTint: [0.75, 0.73, 0.9] },
  },
};

export function applyStyle(pipeline, key) {
  const s = STYLES[key] ?? STYLES.storybook;
  const post = { ...BASE_POST, ...s.post };
  Object.assign(pipeline.params, post);
  const sh = { ...BASE_SHADE, ...s.shade };
  paintUniforms.uBanding.value = sh.banding;
  paintUniforms.uBandSoft.value = sh.bandSoft;
  paintUniforms.uSkyFill.value = sh.skyFill;
  paintUniforms.uPigmentVar.value = sh.pigmentVar;
  paintUniforms.uShadowTint.value.setRGB(...sh.shadowTint);
  paintUniforms.uLightTint.value.setRGB(...sh.lightTint);
  pipeline.settle?.(2000);
}
