import { CLASSIC } from './breeds/classic.js';
import { LITTLE } from './breeds/little.js';
import { MEDIUM } from './breeds/medium.js';
import { BIG } from './breeds/big.js';
import { NPCS } from './breeds/npc.js';
import { BREED_IDS } from './breedIds.js';

/*
 * Every dog you can play. Each breed tweaks the base (whippet) skeleton and paints its own coat.
 *
 * Shape:   L leg length · T leg/neck thickness · len body length · gx/gy body width/depth
 *          tuck (1 = whippet waist, 0 = straight belly) · neck · headLen (muzzle; 0.25 = squashy pug)
 *          headW (skull size) · muzzleW (broad terrier/bulldog muzzle) · size (whole dog)
 * Coat:    fluff (how far the coat puffs out, ~0.005 smooth … 0.03 fluffball) · curl (poodle-ish curls)
 *          headFluff (how fluffy the head is, relative to the body) · ruff (fluffy chest)
 * Parts:   ears 'rose' | 'flop' | 'prick' | 'button' | 'bat' | 'tipped' | 'long' (+ earSize, earLen)
 *          tail 'long' | 'up' | 'stub' | 'otter' | 'straight' | 'curl' | 'plume' | 'feather' | 'sabre'
 *          eyeColor (hex, or [left, right]) · eyeSize · jowls · beard · topknot (bow colour) · fluffyBum
 *          coat(kind, l, n, t, out) → colour (see coat.js)
 * Personality: speed (walk/run multiplier), bark (pitch), stiff (0..1 old-dog gait), wiggle (sausage/corgi
 *          sway), grumpy (scowly brows), shivers (whippet-style shivers when standing still)
 * Picker:  group 'little' | 'medium' | 'big', dogName, breed, emoji, blurb, swatch
 */
export const BREEDS = { ...CLASSIC, ...LITTLE, ...MEDIUM, ...BIG };
export const BREED_KEYS = Object.keys(BREEDS);
export const BREED_GROUPS = [
  { id: 'little', name: 'Little dogs' },
  { id: 'medium', name: 'Medium dogs' },
  { id: 'big', name: 'Big dogs' },
];

/** The breed for a key — or a dog you meet, like Gus (unknown keys, e.g. from a newer version of the game, become Merry). */
export const breedOf = (key) => (Object.hasOwn(BREEDS, key) ? BREEDS[key] : Object.hasOwn(NPCS, key) ? NPCS[key] : BREEDS.merry);

if (import.meta.env?.DEV) {
  const missing = BREED_KEYS.filter((k) => !BREED_IDS.includes(k));
  if (missing.length) console.warn('Add these to breedIds.js so the server lets them in:', missing);
}
