import * as THREE from 'three';
import { fbm3 } from '../../core/rng.js';
import { areaFillers, worldRect } from './areas.js';
import { layoutWoods } from './woodsLayout.js';
import { buildWoods } from './woodsBuild.js';
import { layoutBeach } from './beachLayout.js';
import { buildBeach } from './beachBuild.js';

/*
 * Turning a town's planned areas (./areas.js) into the world: first each area's layout (plain data, so
 * the ground can be shaped and coloured for it), then its meshes and colliders. Called by buildTown.
 * A new kind of area adds a layout and a builder here.
 */

const LAYOUTS = { woods: layoutWoods, beach: layoutBeach };
const BUILDERS = { woods: buildWoods, beach: buildBeach };

/** Each planned area's layout (in the town's order). */
export function layoutAreas(layout) { return (layout.areas ?? []).map((a) => LAYOUTS[a.kind](a, layout.seed)); }

/**
 * Where the ground is flat: the town (half: its half-width, verge and all) and each area's strip (plus a little).
 * data (the areas' layouts): an area can also reshape the ground round about (the beach sinks the hills under
 * its sea): flats.sink(x, z, h) → the height there, for groundAt (./terrain.js).
 */
export function areaFlats(layout, half, data = null) {
  const flats = [{ x0: -half, z0: -half, x1: half, z1: half }, ...(layout.areas ?? []).map((a) => { const r = a.strip; return { x0: r.x0 - 2, z0: r.z0 - 2, x1: r.x1 + 2, z1: r.z1 + 2 }; })];
  const sinks = (data ?? []).filter((d) => d.sink);
  if (sinks.length) flats.sink = (x, z, h) => sinks.reduce((y, d) => d.sink(x, z, y), h);
  return flats;
}

/** Is (x, z) clear of anything an area keeps for itself out beyond its strip (the beach's sea)? */
export function areaClear(data, x, z) { return !data.some((d) => d.keepOut?.(x, z)); }

/** Colour the ground under the areas (woodland floor under the trees): (x, z, color) → tints color, or null. */
export function areaGround(data) {
  if (!data.length) return null;
  const floor = new THREE.Color(0x7f9655), moss = new THREE.Color(0x6f8f4e), earth = new THREE.Color(0x8c8058), c2 = new THREE.Color();
  return (x, z, c) => {
    for (const d of data) {
      if (d.tint) { d.tint(x, z, c); continue; } // (an area with a colouring of its own: the beach's sand)
      const k = d.floor?.(x, z) ?? 0;
      if (k <= 0) continue;
      const n = fbm3(x * 0.09, 3, z * 0.09, 3);
      c2.copy(floor).lerp(n > 0.5 ? moss : earth, Math.min(1, Math.abs(n - 0.5) * 2.2));
      c.lerp(c2, k * 0.85);
    }
  };
}

/**
 * Build the areas into `root` (merged with the rest of the town later). col: the town's colliders. extra:
 * the town's lists (water…). half: the town's own half-width (its old bounds). flats: see areaFlats.
 * Returns { list (what each area's game needs), lawn(x, z) }.
 */
export function buildAreas(root, layout, data, col, extra, half, flats) {
  const list = data.map((d) => {
    const a = d.a, g = new THREE.Group();
    g.rotation.y = a.turn; // (so the area builds in its own (u, v) frame: x = u, z = v)
    root.add(g);
    const C = {
      circle: (u, v, r, top, stand) => { const [x, z] = d.W(u, v); return col.circle(x, z, r, top, stand); },
      box: (u0, v0, u1, v1, top, stand) => { const r = worldRect(a, u0, v0, u1, v1); return col.box(r.x0, r.z0, r.x1, r.z1, top, stand); },
    };
    return BUILDERS[d.kind](g, d, { C, extra, flats });
  });
  // The hillsides beside each area are out of bounds.
  for (const f of areaFillers(layout.areas, half)) col.box(f.x0, f.z0, f.x1, f.z1);
  return { list, lawn: (x, z) => data.some((d) => d.lawn(x, z)) };
}
