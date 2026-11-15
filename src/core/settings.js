// Little player settings (instead of URL options nobody wants to type on a phone).
const KEY = 'merry.settings';
const DEFAULTS = { debug: false, styles: false };

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; }
}
export function setSetting(k, v) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), [k]: v })); } catch { /* ignore */ }
}
