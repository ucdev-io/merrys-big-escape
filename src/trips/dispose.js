/**
 * Give back everything a trip's scene made (its shapes, its own materials and pictures) once it's done
 * with. Never the painted materials (render/watercolorMaterial.js paint() hands out one shared material
 * per colour, which the town uses too), or anything marked userData.shared.
 * @returns how many shapes were given back
 */
export function disposeTree(root) {
  const geos = new Set(), mats = new Set();
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) geos.add(o.geometry);
    for (const m of [o.material].flat()) if (m && !m.userData?.paint && !m.userData?.shared) mats.add(m);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    for (const v of Object.values(m)) if (v?.isTexture && !v.userData?.shared) v.dispose();
    m.dispose();
  }
  root.clear?.();
  return geos.size;
}
