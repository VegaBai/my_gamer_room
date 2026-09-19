import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RoomExpansion, blindPose, validateExpansionContract, type ExpansionContract } from '../lib/room/room-expansion';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import { EXPANSION_CONTROL_IDS } from '../lib/room/expansion-controls';
import { RoomStateMachine } from '../lib/room/state-machine';

const contract = JSON.parse(readFileSync(new URL('../public/room/expansion/manifest.json', import.meta.url), 'utf8')) as ExpansionContract;
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/expansion-poses.json', import.meta.url), 'utf8')) as {
  tolerance: number; fixtures: { id: string; controls: Record<string, number>; nodes: Record<string, { position: number[]; quaternion: number[]; scale: number[] }> }[];
};

function rig() {
  const root = new THREE.Group(), base = new THREE.Group();
  const ids = new Set([contract.rootNodeId, ...contract.blinds.slatIds, contract.blinds.bottomRailId,
    ...contract.blinds.cords.map(c => c.nodeId), ...contract.doors.map(d => d.nodeId),
    ...contract.emission.flatMap(s => s.meshIds), ...contract.selectable.flatMap(s => s.nodeIds)]);
  for (const id of ids) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01), new THREE.MeshStandardMaterial({ emissive: '#ffaabb' }));
    mesh.userData.web_id = id;
    const pose = fixtures.fixtures[0].nodes[id];
    if (pose) {
      mesh.position.fromArray(pose.position); mesh.quaternion.fromArray(pose.quaternion); mesh.scale.fromArray(pose.scale);
    }
    root.add(mesh);
  }
  for (const id of contract.hideBaseNodeIds) { const node = new THREE.Group(); node.userData.web_id = id; base.add(node); }
  return { root, base, expansion: new RoomExpansion(root, structuredClone(contract), base) };
}

describe('room expansion mechanisms', () => {
  it('ships all six controls with the same defaults as Blender', () => {
    expect(() => validateExpansionContract(contract)).not.toThrow();
    const state = new RoomStateMachine(DEFAULT_CONTROLS);
    for (const id of EXPANSION_CONTROL_IDS) expect(state.getValue(id)).toBe(contract.defaults[id]);
  });
  it.each(fixtures.fixtures)('matches Blender local transforms in $id', fixture => {
    const { expansion } = rig(); expansion.apply(fixture.controls);
    const ids = [...contract.blinds.slatIds, contract.blinds.bottomRailId, ...contract.blinds.cords.map(c => c.nodeId), ...contract.doors.map(d => d.nodeId)];
    for (const id of ids) {
      const actual = expansion.nodes.get(id)!; const expected = fixture.nodes[id];
      expect(actual.position.distanceTo(new THREE.Vector3().fromArray(expected.position)), `${id} position`).toBeLessThan(fixtures.tolerance);
      expect(actual.quaternion.angleTo(new THREE.Quaternion().fromArray(expected.quaternion).normalize()), `${id} rotation`).toBeLessThan(fixtures.tolerance);
      expect(actual.scale.distanceTo(new THREE.Vector3().fromArray(expected.scale)), `${id} scale`).toBeLessThan(fixtures.tolerance);
    }
  });
  it('keeps positive blade clearance throughout raising, including either maximum tilt', () => {
    const b = contract.blinds;
    for (let step = 0; step <= 100; step++) for (const tilt of [-70, 70]) {
      const pose = blindPose(b, tilt, step / 100);
      const pitch = pose.slatHeights[0] - pose.slatHeights[1];
      const verticalSize = b.slatChordWidth * Math.abs(Math.sin(pose.angle)) + b.slatThickness * Math.abs(Math.cos(pose.angle));
      expect(pitch - verticalSize).toBeGreaterThan(0);
    }
    expect(blindPose(b, 70, 1).angle).toBe(0);
    expect(blindPose(b, NaN, Infinity).angle).toBeCloseTo(Math.PI / 6);
  });
  it('turns off both emissive surfaces and the actual floor light without hiding geometry', () => {
    const { expansion } = rig();
    expansion.apply({ ...contract.defaults, 'floorLamp.power': 0, 'bookshelf.lights': 0 });
    for (const spec of contract.emission) for (const id of spec.meshIds) {
      const node = expansion.nodes.get(id)! as THREE.Mesh;
      expect((node.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0);
      expect(node.visible).toBe(true);
    }
    expansion.root.traverse(node => { if (node instanceof THREE.PointLight) expect(node.intensity).toBe(0); });
    expansion.apply(contract.defaults);
    for (const spec of contract.emission) for (const id of spec.meshIds) expect(((expansion.nodes.get(id)! as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(spec.strength);
  });
  it('restores original architecture on detach and validates before hiding anything', () => {
    const { base, expansion } = rig();
    expect(base.children.slice(0, contract.hideBaseNodeIds.length).every(n => !n.visible)).toBe(true);
    expansion.detach(); expect(base.children.every(n => n.visible)).toBe(true);
    const bad = structuredClone(contract); bad.selectable.pop();
    expect(() => validateExpansionContract(bad)).toThrow('incomplete');
  });
});
