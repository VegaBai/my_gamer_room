import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickRoomControl } from '../lib/room/room-picking';
import { PHOTO_WALL_INTERACTION_ID, registerPhotoWallInteraction } from '../lib/room/photo-wall';

function setup() {
  const root = new THREE.Group();
  const hits: THREE.Object3D[] = [];
  const visuals = new Map<string, THREE.Object3D[]>();
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  ray.layers.set(2);
  const mesh = (z: number, id?: string, proxy = false) => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .2), new THREE.MeshStandardMaterial());
    object.position.z = z;
    if (id) { object.userData.controlId = id; object.layers.enable(2); hits.push(object); }
    if (proxy) object.layers.set(2);
    root.add(object);
    return object;
  };
  const pick = () => { root.updateMatrixWorld(true); return pickRoomControl(ray, root, hits, visuals); };
  return { root, hits, visuals, ray, mesh, pick };
}

describe('room picking with additive furniture', () => {
  it('clicks the wall-mounted photo board outside the base root, respecting wall cutaway and occlusion', () => {
    const s = setup(); const base = new THREE.Group(); s.root.add(base);
    const wall = new THREE.Group(); s.root.add(wall);
    const board = new THREE.Group(); wall.add(board);
    const print = s.mesh(1); board.add(print);
    const originalMaterial = print.material;
    registerPhotoWallInteraction(board, s.hits, s.visuals);
    expect(s.pick()).toBe(PHOTO_WALL_INTERACTION_ID);
    expect(print.layers.isEnabled(0)).toBe(true);
    expect(print.material).toBe(originalMaterial);
    wall.visible = false; expect(s.pick()).toBeNull();
    wall.visible = true; base.add(s.mesh(2)); expect(s.pick()).toBeNull();
  });
  it('picks a real door instead of an overlapping legacy cabinet box', () => {
    const s = setup(); s.mesh(2, 'cabinet.door', true); s.mesh(1, 'bookshelf.leftDoor');
    expect(s.pick()).toBe('bookshelf.leftDoor'); expect(s.ray.layers.mask).toBe(4);
  });
  it('does not select through a solid wall', () => {
    const s = setup(); s.mesh(2); s.mesh(1, 'floorLamp.power');
    expect(s.pick()).toBeNull();
  });
  it('ignores retired walls and targets under hidden ancestors', () => {
    const s = setup(); const hidden = new THREE.Group(); hidden.visible = false; s.root.add(hidden);
    hidden.add(s.mesh(2)); hidden.add(s.mesh(1.5, 'old.window'));
    s.mesh(1, 'blinds.raise'); expect(s.pick()).toBe('blinds.raise');
  });
  it('lets the window glass transmit clicks to real mechanisms', () => {
    const s = setup(); const glass = s.mesh(2); glass.material = new THREE.MeshPhysicalMaterial({ transmission: 1 });
    s.mesh(1, 'blinds.tilt'); expect(s.pick()).toBe('blinds.tilt');
  });
  it('retains a visible legacy mechanism while rejecting a proxy in front of an occluding wall', () => {
    const s = setup(); const actual = s.mesh(1); s.visuals.set('desk.lift', [actual]);
    s.mesh(2, 'desk.lift', true); expect(s.pick()).toBe('desk.lift');
    s.mesh(1.5); expect(s.pick()).toBeNull();
  });
  it('rejects an oversized proxy when its real furniture is off-ray behind a wall', () => {
    const s = setup(); const actual = s.mesh(0); actual.position.x = 3;
    s.visuals.set('cabinet.door', [actual]); s.mesh(2, 'cabinet.door', true); s.mesh(1);
    expect(s.pick()).toBeNull();
  });
});
