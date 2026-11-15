// Little player settings (instead of URL options nobody wants to type on a phone).
const KEY = 'merry.settings';
// picture: 'auto' (eases off when the device is struggling) or 'sharp' (never does).
// season: 'auto' (the calendar) or one to keep.
const DEFAULTS = { debug: false, styles: false, autoFullscreen: true, haptics: true, texture: 'light', music: true, picture: 'auto', season: 'auto' };

// Paint texture strength levels (see WatercolorPipeline.texture).
export const TEXTURE_LEVELS = { off: 0, light: 0.4, medium: 0.7, strong: 1 };
export const TEXTURE_NAMES = { off: 'Off', light: 'Light', medium: 'Medium', strong: 'Strong' };

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; }
}
export function setSetting(k, v) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), [k]: v })); } catch { /* ignore */ }
}
