/**
 * Give back everything a trip's scene made (its shapes, its own materials and pictures) once it's done
 * with. Never the painted materials (render/watercolorMaterial.js paint() hands out one shared material
 * per colour), anything marked userData.shared, or anything the town (`keep`) is still using: some shapes
 * are made once and handed to everything (a dog breed's coat, the spheres eyes and noses are made of…).
 * (A shape kept for later in a cache, a dog breed's coat say, only loses its copy on the graphics chip: it's sent
 * again the next time it's drawn.)
 * @returns how many shapes were given back
 */
export function disposeTree(root, keep = null) {
  const inUse = new Set();
  keep?.traverse((o) => { if (o.geometry) inUse.add(o.geometry); for (const m of [o.material].flat()) if (m) inUse.add(m); });
  const geos = new Set(), mats = new Set();
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared && !inUse.has(o.geometry)) geos.add(o.geometry);
    for (const m of [o.material].flat()) if (m && !m.userData?.paint && !m.userData?.shared && !inUse.has(m)) mats.add(m);
    if (o.isSkinnedMesh) o.skeleton?.dispose(); // (a skinned dog's bone texture)
    if (o.isInstancedMesh) o.dispose(); // (its own per-copy buffers on the graphics chip: the dirt, sparkles, splashes…)
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    for (const v of Object.values(m)) if (v?.isTexture && !v.userData?.shared) v.dispose();
    m.dispose();
  }
  root.clear?.();
  return geos.size;
}
