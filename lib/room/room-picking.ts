import * as THREE from 'three';

export function isVisibleInScene(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

export function objectControlId(object?: THREE.Object3D | null): string | null {
  for (let node = object ?? null; node; node = node.parent) {
    if (typeof node.userData.controlId === 'string') return node.userData.controlId;
  }
  return null;
}

function isSolidHit(hit: THREE.Intersection) {
  if (!(hit.object instanceof THREE.Mesh) || !isVisibleInScene(hit.object)) return false;
  const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
  const material = materials[hit.face?.materialIndex ?? 0] ?? materials[0];
  return material.visible && !(material.transparent && material.opacity < .9)
    && !(material instanceof THREE.MeshPhysicalMaterial && material.transmission > .2);
}

/** Visible mesh selection wins over legacy oversized click boxes; walls still occlude. */
export function pickRoomControl(raycaster: THREE.Raycaster, root: THREE.Object3D,
  hitTargets: THREE.Object3D[], visualTargets: Map<string, THREE.Object3D[]>) {
  const previousMask = raycaster.layers.mask;
  try {
    raycaster.layers.set(0);
    const firstSolid = raycaster.intersectObject(root, true).find(isSolidHit);
    const directId = objectControlId(firstSolid?.object);
    if (directId) return directId;
    raycaster.layers.set(2);
    const proxyHit = raycaster.intersectObjects(hitTargets, true).find(hit => isVisibleInScene(hit.object));
    const id = objectControlId(proxyHit?.object);
    if (!id || !proxyHit) return null;
    // An actual pick mesh behind the nearest solid is occluded, even if a proxy is nearer.
    if (proxyHit.object.layers.isEnabled(0)) return null;
    raycaster.layers.set(0);
    const actual = raycaster.intersectObjects(visualTargets.get(id) ?? [], true).find(isSolidHit);
    if (firstSolid && actual && firstSolid.distance < actual.distance - .002) return null;
    if (firstSolid && !actual) return null;
    return id;
  } finally { raycaster.layers.mask = previousMask; }
}
