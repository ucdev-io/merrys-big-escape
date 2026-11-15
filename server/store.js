// Saved dogs and neighbourhoods, kept as JSON files in data/ on the computer running the game.
// A dog's stars, outfit and garden escape follow it from device to device, and a neighbourhood
// stays as everyone left it (places found, golden bones, whose house is whose).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BREED_IDS } from '../src/entities/breedIds.js';
import { levelForXp } from '../src/game/levels.js';
import { cleanName, cleanId, cleanLook, cleanSeed } from './clean.js';

// Where saves live: $MERRY_DATA, or <project>/data (npm scripts run from the project folder).
// Worked out on first use, so the dev server can point itself somewhere else first.
let DIR = null, FILES = null;
function files() {
  if (!FILES) {
    DIR = path.resolve(process.env.MERRY_DATA || path.join(process.cwd(), 'data'));
    FILES = { profiles: path.join(DIR, 'profiles.json'), worlds: path.join(DIR, 'worlds.json') };
  }
  return FILES;
}
const MAX_PROFILES = 200, MAX_WORLDS = 100;
const db = { profiles: {}, worlds: {} };
let loaded = false;

const now = () => Date.now();
const newId = () => 'd' + crypto.randomBytes(8).toString('hex').slice(0, 11);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function load() {
  if (loaded) return;
  loaded = true;
  const FILES = files();
  for (const kind of Object.keys(FILES)) {
    // If the file is missing or damaged, fall back to the backup from the last run.
    const data = readJson(FILES[kind]) ?? readJson(FILES[kind] + '.bak');
    db[kind] = data?.[kind] && typeof data[kind] === 'object' ? data[kind] : {};
  }
}

// ---- saving: batched, atomic (write a temp file, then swap it in), with one backup per run ----
const timers = {};
const backedUp = new Set();
function saveSoon(kind) {
  if (timers[kind]) return;
  timers[kind] = setTimeout(() => { timers[kind] = null; write(kind); }, 800);
}
function write(kind) {
  try {
    const file = files()[kind], tmp = file + '.tmp';
    fs.mkdirSync(DIR, { recursive: true });
    if (!backedUp.has(kind) && fs.existsSync(file)) { fs.copyFileSync(file, file + '.bak'); backedUp.add(kind); }
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, [kind]: db[kind] }, null, 1));
    try { fs.renameSync(tmp, file); } catch { fs.copyFileSync(tmp, file); fs.rmSync(tmp, { force: true }); }
  } catch (e) {
    console.warn(`[dog park] Couldn't save ${kind}: ${e.message}`);
  }
}
/** Write anything waiting to be saved, right now. */
export function flush() {
  for (const kind of Object.keys(timers)) if (timers[kind]) { clearTimeout(timers[kind]); timers[kind] = null; write(kind); }
}
process.once('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { flush(); process.exit(0); });

// ---- dogs ----

const blankLook = () => ({ collar: null, neck: null, hat: null });
function publicProfile(p, online) {
  const out = { id: p.id, name: p.name, breed: p.breed, xp: p.xp, level: levelForXp(p.xp), stats: p.stats, look: p.look, yardDone: !!p.yardDone, seen: p.seen };
  if (online) out.online = online.has(p.id);
  return out;
}

/** Every saved dog, most recently played first. `online`: ids of dogs playing right now. */
export function listProfiles(online = new Set()) {
  load();
  return Object.values(db.profiles).sort((a, b) => b.seen - a.seen).map((p) => publicProfile(p, online));
}

export function getProfile(id) {
  load();
  const p = db.profiles[cleanId(id)];
  return p ? publicProfile(p) : null;
}

/**
 * A new dog. `from` brings along stars etc. earned on a device before dogs were saved here
 * (capped, so it can't be silly).
 */
export function createProfile({ name, breed, from } = {}) {
  load();
  if (Object.keys(db.profiles).length >= MAX_PROFILES) return null;
  const p = { id: newId(), name: cleanName(name), breed: BREED_IDS.includes(breed) ? breed : 'merry', xp: 0, stats: {}, look: blankLook(), yardDone: false, created: now(), seen: now() };
  if (from && typeof from === 'object') apply(p, from, true);
  db.profiles[p.id] = p;
  saveSoon('profiles');
  return publicProfile(p);
}

/**
 * Bring a dog up to date. Stars and stats arrive as amounts *earned since the last sync*, so two
 * devices (or a phone that was offline for a while) can never overwrite each other's progress.
 */
export function syncProfile(id, patch) {
  load();
  const p = db.profiles[cleanId(id)];
  if (!p) return null;
  // Each batch has an id: one sent twice (the page closed before the reply came) counts once.
  const sid = typeof patch?.sid === 'string' ? patch.sid.slice(0, 24) : null;
  if (sid && p.syncs?.includes(sid)) return publicProfile(p);
  apply(p, patch ?? {}, false);
  if (sid) p.syncs = [...(p.syncs ?? []).slice(-19), sid];
  p.seen = now();
  saveSoon('profiles');
  return publicProfile(p);
}

function apply(p, s, importing) {
  const xp = Math.floor(Number(s.xp) || 0);
  if (xp > 0) p.xp += Math.min(xp, importing ? 20000 : 1500);
  if (s.stats && typeof s.stats === 'object') {
    for (const [k, v] of Object.entries(s.stats).slice(0, 20)) {
      if (!/^[a-z]{1,16}$/.test(k) || (!(k in p.stats) && Object.keys(p.stats).length >= 30)) continue;
      const n = Math.floor(Number(v) || 0);
      if (n > 0) p.stats[k] = (p.stats[k] ?? 0) + Math.min(n, importing ? 100000 : 500);
    }
  }
  if (s.look) p.look = cleanLook(s.look, levelForXp(p.xp));
  if (typeof s.name === 'string') p.name = cleanName(s.name);
  if (BREED_IDS.includes(s.breed)) p.breed = s.breed;
  if (s.yardDone === true) p.yardDone = true;
}

// ---- neighbourhoods ----

function publicWorld(w, live) {
  return { seed: w.seed, code: w.code, places: w.discovered.length, bones: w.bones.length, played: w.played, owner: db.profiles[w.owner]?.name ?? null, live: !!live?.has(w.code) };
}

/** Saved neighbourhoods, most recently played first. `live`: codes of packs playing right now. */
export function listWorlds(live = new Set()) {
  load();
  return Object.values(db.worlds).sort((a, b) => b.played - a.played).slice(0, 30).map((w) => publicWorld(w, live));
}

/** The saved neighbourhood for a seed (made, and owned by `owner`, if it's new). */
export function worldFor(seed, owner = null) {
  load();
  seed = cleanSeed(seed);
  let w = db.worlds[seed];
  if (!w) {
    const all = Object.values(db.worlds);
    if (all.length >= MAX_WORLDS) delete db.worlds[all.sort((a, b) => a.played - b.played)[0].seed]; // forget the oldest
    w = db.worlds[seed] = { seed, code: null, discovered: [], bones: [], houses: {}, owner: owner ?? null, created: now(), played: now() };
    if (owner) w.houses[owner] = 0; // the first house is theirs
  }
  return w;
}

export function worldByCode(code) {
  load();
  return Object.values(db.worlds).find((w) => w.code === code) ?? null;
}

/** Something about a neighbourhood changed (a find, a house, someone came or went). */
export function touchWorld(w) {
  w.played = now();
  saveSoon('worlds');
}

/** For tests: forget what's in memory and read the files again. */
export function reload() { flush(); loaded = false; load(); }
export const dataDir = () => (files(), DIR);
