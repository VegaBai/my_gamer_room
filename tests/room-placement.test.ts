import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RoomPlacement } from '../lib/room/room-placement';

function fixture() {
  const room = new THREE.Group(), desk = new THREE.Group(), top = new THREE.Group(), monitor = new THREE.Group(), pc = new THREE.Group(), cabinet = new THREE.Group();
  desk.userData.web_id = 'desk.root'; pc.userData.web_id = 'pc'; monitor.userData.web_id = 'monitor';
  room.add(desk, pc, cabinet); desk.add(top); top.add(monitor);
  top.position.y = .78; monitor.position.set(.2, .35, -.3); pc.position.set(.8, 0, 0);
  room.updateMatrixWorld(true);
  return { room, desk, top, monitor, pc, cabinet };
}

describe('static desk layout above existing animation', () => {
  it('moves all attached devices and PC once, preserving channels, reset and other furniture', () => {
    const { room, desk, top, monitor, pc, cabinet } = fixture();
    const before = monitor.getWorldPosition(new THREE.Vector3());
    const local = monitor.matrix.clone(), cabinetMatrix = cabinet.matrixWorld.clone();
    const placement = new RoomPlacement(room, [{ id: 'desk', nodeIds: ['desk.root', 'pc'], translation: [0, 0, -.26] }]);
    placement.apply(); placement.apply(); room.updateMatrixWorld(true);
    expect(monitor.getWorldPosition(new THREE.Vector3()).sub(before).distanceTo(new THREE.Vector3(0, 0, -.26))).toBeLessThan(1e-8);
    expect(pc.getWorldPosition(new THREE.Vector3()).z).toBeCloseTo(-.26);
    expect(desk.position.toArray()).toEqual([0, 0, 0]);
    expect(monitor.matrix.equals(local)).toBe(true);
    top.position.y = 1.18; desk.position.set(0, 0, 0); room.updateMatrixWorld(true);
    expect(monitor.getWorldPosition(new THREE.Vector3()).z).toBeCloseTo(before.z - .26);
    expect(cabinet.matrixWorld.equals(cabinetMatrix)).toBe(true);
    placement.dispose(); room.updateMatrixWorld(true);
    expect(desk.parent).toBe(room);
    expect(monitor.getWorldPosition(new THREE.Vector3()).z).toBeCloseTo(before.z);
  });
  it('uses world translation even inside a rotated and scaled parent', () => {
    const { room, desk } = fixture();
    room.position.set(1, 2, 3); room.rotation.y = .4; room.scale.setScalar(2); room.updateMatrixWorld(true);
    const before = desk.getWorldPosition(new THREE.Vector3());
    const placement = new RoomPlacement(room, [{ id: 'test', nodeIds: ['desk.root'], translation: [0, 0, -.26] }]);
    placement.apply(); room.updateMatrixWorld(true);
    expect(desk.getWorldPosition(new THREE.Vector3()).sub(before).distanceTo(new THREE.Vector3(0, 0, -.26))).toBeLessThan(1e-8);
  });
  it('validates every root before mutation and rejects nested/double offsets', () => {
    const { room, desk } = fixture();
    expect(() => new RoomPlacement(room, [{ id: 'bad', nodeIds: ['desk.root', 'missing'], translation: [0, 0, -.26] }])).toThrow();
    expect(desk.parent).toBe(room);
    expect(() => new RoomPlacement(room, [{ id: 'nested', nodeIds: ['desk.root', 'monitor'], translation: [0, 0, -.26] }])).toThrow('Nested');
    expect(() => new RoomPlacement(room, [{ id: 'repeat', nodeIds: ['desk.root', 'desk.root'], translation: [0, 0, -.26] }])).toThrow('repeated');
  });
});
