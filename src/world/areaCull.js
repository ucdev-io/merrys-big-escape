import * as THREE from 'three';

/**
 * The things that wander about an area (the beach's gulls and crabs, the farm's sheep, hens and pigs…) are an
 * instanced mesh each, too spread out and too busy to box up every frame. So they go by the area instead:
 *   - drawn only when the area's in view (a sphere round its strip, as high as a gull flies), and
 *   - in the sun's shadow only while the camera's near the area: the shadow map covers just a few metres round
 *     the dog, so from anywhere else their shadows were drawn every frame (all 100k-odd triangles) for nothing.
 * (They used to be drawn from anywhere in town, both ways.) rect: the area's strip, { x0, z0, x1, z1 }.
 * Call update(camera) every frame (the areas' cull() does).
 */
export class AreaCull {
  constructor(meshes, rect, { high = 16, margin = 6, shadowNear = 32 } = {}) {
    this.rect = rect;
    this.shadowNear = shadowNear;
    const box = new THREE.Box3(new THREE.Vector3(rect.x0 - margin, -2, rect.z0 - margin), new THREE.Vector3(rect.x1 + margin, high, rect.z1 + margin));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.meshes = meshes.filter((m) => m?.isInstancedMesh);
    for (const m of this.meshes) {
      m.boundingSphere = sphere.clone(); // (in its own space, which is the world's: these sit straight in the scene)
      m.frustumCulled = true;
      m.userData.casts = m.castShadow;
    }
    this.near = null;
  }

  update(camera) {
    const r = this.rect, c = camera.position;
    const away = Math.hypot(Math.max(r.x0 - c.x, 0, c.x - r.x1), Math.max(r.z0 - c.z, 0, c.z - r.z1));
    const near = away < this.shadowNear;
    if (near === this.near) return;
    this.near = near;
    for (const m of this.meshes) m.castShadow = near && m.userData.casts;
  }
}
