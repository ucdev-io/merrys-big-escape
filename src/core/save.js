// Progress lives in this browser only; storage can be unavailable (private mode), so never throw.
const KEY = 'merry.save.v1';
export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
/** Merge a patch into the save (so chapters don't wipe each other's progress). */
export function writeSave(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadSave(), ...patch })); } catch { /* ignore */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
