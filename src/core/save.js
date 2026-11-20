// Progress lives in this browser only; storage can be unavailable (private mode), so never throw.
const KEY = 'merry.save.v1';
const MAX_TOWNS = 30; // (the towns you've been to, newest first: older ones are forgotten)
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

/*
 * 🏘️ Each town keeps its own finds: save.town is just which town you're in ({ seed }), and
 * save.towns[seed] is what you've done there ({ discovered, bones, den, farm, trips, at }).
 * (Older saves kept one town's finds in save.town itself: they move across the first time they're read.)
 */
const KEEP = ['discovered', 'bones', 'den', 'farm', 'trips'];
const legacy = (t) => (t && (t.discovered || t.bones || t.den !== undefined || t.farm !== undefined)
  ? Object.fromEntries(KEEP.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])) : null);

/** The towns (seed → what you've done there), with an old-style save.town moved in. */
function towns(s) {
  const out = { ...(s.towns ?? {}) };
  const old = legacy(s.town);
  if (old && s.town.seed && !out[s.town.seed]) out[s.town.seed] = { ...old, at: Date.now() };
  return out;
}

/** What you've done in this town: { discovered, bones, den, farm, trips } (empty for a town you've never been to). */
export function townSave(seed) {
  return towns(loadSave())[seed] ?? {};
}

/** Save some of what you've done in this town (merged into what's there), and make it the town you're in. */
export function writeTown(seed, patch = {}) {
  const s = loadSave(), all = towns(s);
  all[seed] = { ...(all[seed] ?? {}), ...patch, at: Date.now() };
  const keep = Object.entries(all).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0)).slice(0, MAX_TOWNS);
  writeSave({ chapter: 'town', town: { seed }, towns: Object.fromEntries(keep) });
}

/** Go to a town (a new one, or one you've been to before, finds and all). `found`: places a pack has already found there. */
export function setTown(seed, found = null) {
  const t = townSave(seed);
  const discovered = found ? [...new Set([...(t.discovered ?? []), ...found])] : t.discovered ?? [];
  writeTown(seed, { discovered });
  if (!loadSave().firstTown) writeSave({ firstTown: visitedTowns().at(-1)?.seed ?? seed }); // (the oldest one you've been to)
}

/** The first town you ever went to (the bus can always take you back there). */
export function firstTown() {
  return loadSave().firstTown ?? visitedTowns().at(-1)?.seed ?? null;
}

/** The towns you've been to, newest first: [{ seed, discovered, …, at }]. */
export function visitedTowns() {
  return Object.entries(towns(loadSave())).map(([seed, t]) => ({ seed, ...t })).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}
