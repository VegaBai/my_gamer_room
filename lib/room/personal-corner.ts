import * as THREE from 'three';

export interface PersonalCornerContract {
  schema: 'personal-corner/1';
  asset: { url: string; sha256: string; bytes: number };
}

/** Exported geometry is already in home coordinates; attach the cup to the lift. */
export function installPersonalCorner(base: THREE.Object3D, wall: THREE.Object3D,
  root: THREE.Object3D, spec: PersonalCornerContract) {
  if (spec.schema !== 'personal-corner/1'
    || !/^\/room\/personal-corner\/[a-f0-9]{64}\.glb$/.test(spec.asset.url)) throw Error('Invalid personal corner contract');
  let desk: THREE.Object3D | undefined;
  base.traverse(o => { if (o.userData.web_id === 'desk.top') desk = o; });
  const mug = root.children.find(o => o.userData.attachment === 'desk.top');
  const board = root.children.find(o => o.userData.attachment === 'back.wall');
  if (!desk || !mug || !board) throw Error('Personal corner attachment missing');
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  desk.add(mug);
  // Preserve world placement while inheriting the wall's camera cutaway visibility.
  base.add(board); base.updateWorldMatrix(true, true); wall.attach(board);
  return [mug, board];
}
