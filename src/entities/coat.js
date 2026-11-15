import * as THREE from 'three';
import { fbm3 } from '../core/rng.js';

/*
 * Helpers for painting dog coats (see breeds/*.js). A coat painter is called for every vertex:
 *   coat(kind, l, n, t, out) → out colour
 *   kind: body | neck | head | ear | tail | upperLeg | lowerLeg | paw | extra (corgi bum, beard)
 *   l = the point in the part's own space. For the head: x across (±0.05), y up (-0.04 jaw … 0.06
 *       crown), z forward (-0.065 back of the skull … nose tip). For the neck: y up the neck, +z = throat.
 *   n = the point in "normalised whippet" body space, so markings line up across parts whatever the
 *       breed's proportions: y ≈ 0.48 along the middle of the body (0.58 top of the back, 0.3–0.4
 *       belly), z from -0.39 (tail end) to 0.31 (chest).
 *   t = 0..1 along tails.
 */

export const C = (hex) => new THREE.Color(hex);
export const ss = THREE.MathUtils.smoothstep;
export const n3 = (p, s, o = 0, oct = 3) => fbm3(p.x * s + o, p.y * s, p.z * s - o, oct);

export const WHITE = C(0xf6f1e8), WHITE_SHADE = C(0xe6dccd);
export function white(p, out) { return out.copy(WHITE).lerp(WHITE_SHADE, n3(p, 25) * 0.6); }
export function solid(base, light, p, out, scale = 14, amt = 0.5) { return out.copy(base).lerp(light, ss(n3(p, scale), 0.35, 0.75) * amt); }

/** 0 at the stop (between the eyes) → 1 at the nose tip, for a breed with muzzle length HL. */
export const muzzleAt = (HL) => (l) => (l.z - 0.03) / (0.136 * HL);
/** A soft wobble to add to a threshold, so markings aren't ruler-straight. */
export const wob = (p, s = 12, amt = 0.05) => (n3(p, s, 2, 2) - 0.5) * amt;
/** Blotchy patches (merle, Blenheim, piebald): 0..1. */
export const patches = (p, scale, cut, soft = 0.04, o = 0) => ss(n3(p, scale, o, 3), cut - soft, cut + soft);
/** A white blaze up the middle of the face. */
export const blaze = (l, w = 0.006, grow = 0.12, back = -0.04) => Math.abs(l.x) < w + Math.max(0, l.z + 0.02) * grow && l.y > 0 && l.z > back;
/** Near the eyes (for masks and spectacles). */
export const nearEyes = (l, r) => Math.hypot(Math.abs(l.x) - 0.036, l.y - 0.026, l.z - 0.035) < r;

const tmp = new THREE.Vector3();
/** Head and ears are small: scale their points up so noise patterns match the body's. */
export const big = (l, k = 3) => tmp.copy(l).multiplyScalar(k);
