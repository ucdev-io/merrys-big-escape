// Tidying up whatever clients send: home Wi-Fi play, but never trust shapes or sizes.
import { COSMETIC } from '../src/game/cosmetics.js';

export const cleanName = (s) => String(s ?? '').replace(/[^A-Za-z0-9 '\-]/g, '').trim().slice(0, 14) || 'Doggo';
export const cleanSeed = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 32);
export const cleanId = (s) => String(s ?? '').replace(/[^a-z0-9_\-]/gi, '').slice(0, 24);
export const cleanCode = (s) => { const c = String(s ?? '').toUpperCase().trim(); return /^[A-Z]{4}-\d{2}$/.test(c) ? c : null; };
export const num = (v, lim = 1e4) => (Number.isFinite(v) && Math.abs(v) < lim ? Math.round(v * 100) / 100 : 0);
export const cleanLevel = (v) => Math.max(1, Math.min(99, v | 0));
export const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n).map(cleanId).filter(Boolean);

const SLOTS = ['collar', 'neck', 'hat'];
/** An outfit: only real cosmetics in the right slots (and, given a level, only ones unlocked by it). */
export function cleanLook(v, level = 99) {
  return Object.fromEntries(SLOTS.map((slot) => {
    const c = COSMETIC[typeof v?.[slot] === 'string' ? v[slot] : ''];
    return [slot, c && c.slot === slot && c.level <= level ? c.id : null];
  }));
}
