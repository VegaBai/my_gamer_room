import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { composeTrackDelta, controlInputRange } from '../lib/room/room-engine';
import type { RoomManifestV1 } from '../lib/room/types';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';

const manifest = JSON.parse(readFileSync(path.resolve('public/room/room-manifest.json'), 'utf8')) as RoomManifestV1;
const tiltDefinition = DEFAULT_CONTROLS.find(control => control.id === 'monitors.leftTilt')!;
function loadNodes(variant: 'desktop' | 'low') {
  const glb = readFileSync(path.resolve('public', manifest.variants[variant].url.slice(1)));
  const data = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const nodes: THREE.Object3D[] = data.nodes.map((node: { name?: string; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: object }) => {
    const object = new THREE.Object3D();
    object.name = node.name ?? '';
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    object.userData = node.extras ?? {};
    return object;
  });
  data.nodes.forEach((node: { children?: number[] }, i: number) => node.children?.forEach((child) => nodes[i].add(nodes[child])));
  const scene = new THREE.Group();
  for (const i of data.scenes[data.scene ?? 0].nodes) scene.add(nodes[i]);
  const semantic = new Map(nodes.filter((node) => node.userData.web_id).map((node) => [node.userData.web_id as string, node]));
  const bases = new Map([...semantic].map(([id, node]) => [id, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }]));
  function apply(values: Record<string, number>) {
    const targets = new Map([...bases].map(([id, base]) => [id, { position: base.position.clone(), quaternion: base.quaternion.clone(), scale: base.scale.clone() }]));
    for (const control of manifest.controls) {
      for (const track of control.tracks ?? []) composeTrackDelta(targets.get(track.nodeId)!, track,
        ...controlInputRange(control, values));
    }
    for (const [id, target] of targets) {
      const node = semantic.get(id)!;
      node.position.copy(target.position); node.quaternion.copy(target.quaternion); node.scale.copy(target.scale);
    }
    scene.updateMatrixWorld(true);
  }
  return { scene, nodes, semantic, apply };
}

describe('published monitor mechanical contract', () => {
  it('keeps screen pitch slider bounds synchronized with the validated manifest', () => {
    for (const side of ['left', 'right']) {
      const expected = DEFAULT_CONTROLS.find(control => control.id === `monitors.${side}Tilt`)!;
      const actual = manifest.controls.find(control => control.id === expected.id)!;
      expect(actual).toBeDefined();
      for (const key of ['min', 'max', 'default', 'clickValue', 'durationMs'] as const) expect(actual[key]).toBe(expected[key]);
    }
  });
  it('carries separate click proxies on the two moving screens', () => {
    const proxies = manifest.hitTargets.filter((target) => target.controlId === 'monitors.face');
    expect(proxies.map((target) => target.nodeId).sort()).toEqual(['monitors.leftPivot', 'monitors.rightPivot']);
  });

  for (const variant of ['desktop', 'low'] as const) {
    it(`${variant}: tilts at the terminal mount without pitching the carrier arm`, () => {
      const rig = loadNodes(variant);
      rig.apply({ 'monitors.face': .6, 'monitors.leftTrim': 15, 'monitors.rightTrim': -15 });
      const bases = new Map(['left', 'right'].flatMap(side => [
        `monitors.arm.${side}.upper.mesh`, `monitors.${side}PlateLevel`,
      ]).map(id => [id, rig.semantic.get(id)!.matrixWorld.clone()]));
      for (const side of ['left', 'right']) {
        const tilt = rig.semantic.get(`monitors.${side}Tilt`)!;
        expect(tilt?.parent).toBe(rig.semantic.get(`monitors.${side}PlateLevel`));
        expect(rig.semantic.get(`monitors.${side}Pivot`)?.parent).toBe(tilt);
        expect(rig.semantic.get(`monitors.arm.${side}.plate.mesh`)?.parent).toBe(tilt);
      }
      rig.apply({ 'monitors.face': .6, 'monitors.leftTrim': 15, 'monitors.rightTrim': -15,
        'monitors.leftTilt': tiltDefinition.max, 'monitors.rightTilt': tiltDefinition.min });
      for (const [id, base] of bases) expect(rig.semantic.get(id)!.matrixWorld.elements).toEqual(base.elements);
      for (const [side, degrees] of [['left', tiltDefinition.max], ['right', tiltDefinition.min]] as const) {
        const joint = rig.semantic.get(`monitors.${side}Tilt`)!;
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(joint.quaternion);
        expect(Math.asin(facing.y) * 180 / Math.PI).toBeCloseTo(degrees, 4);
      }
      rig.apply({});
      for (const side of ['left', 'right']) expect(rig.semantic.get(`monitors.${side}Tilt`)!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
    });

    it(`${variant}: emissive panels stay attached during combined arm, trim, and desk motion`, () => {
      const rig = loadNodes(variant);
      const pairs = [
        ['monitors.left.mesh', 'scene.screen.left.b7d389a0', 'monitors.leftPivot'],
        ['monitors.right.mesh', 'scene.screen.right.41439fdc', 'monitors.rightPivot'],
      ].map(([bodyId, panelId, pivotId]) => {
        const body = rig.semantic.get(bodyId)!;
        const panel = rig.semantic.get(panelId)!;
        expect(panel?.parent).toBe(rig.semantic.get(pivotId));
        return { body, panel };
      });
      rig.apply({});
      const relative = pairs.map(({ body, panel }) => body.matrixWorld.clone().invert().multiply(panel.matrixWorld));
      for (const face of [0, .37, .8, 1]) for (const leftTrim of [-15, 0, 15]) for (const rightTrim of [-15, 0, 15]) {
        const values = { 'monitors.face': face, 'monitors.leftTrim': leftTrim, 'monitors.rightTrim': rightTrim,
          'monitors.leftTilt': face > .5 ? tiltDefinition.max : tiltDefinition.min,
          'monitors.rightTilt': face > .5 ? tiltDefinition.min : tiltDefinition.max };
        rig.apply(values);
        const lower = pairs.map(({ body }) => body.getWorldPosition(new THREE.Vector3()));
        for (const lift of [.5, 1]) {
          rig.apply({ ...values, 'desk.lift': lift });
          pairs.forEach(({ body, panel }, i) => {
            const current = body.matrixWorld.clone().invert().multiply(panel.matrixWorld);
            current.elements.forEach((value, element) => expect(value).toBeCloseTo(relative[i].elements[element], 5));
            const delta = body.getWorldPosition(new THREE.Vector3()).sub(lower[i]);
            expect(delta.x).toBeCloseTo(0, 5);
            expect(delta.y).toBeCloseTo(.4 * lift, 5);
            expect(delta.z).toBeCloseTo(0, 5);
          });
        }
      }
    });

    it(`${variant}: inward motion carries the arm and screen; outward trim leaves arm fixed`, () => {
      const rig = loadNodes(variant);
      const armIds = [...rig.semantic.keys()].filter((id) => /^monitors\.arm\.(left|right)\.upper\.mesh$/.test(id));
      expect(armIds).toHaveLength(2);
      rig.apply({});
      const armBase = armIds.map((id) => rig.semantic.get(id)!.matrixWorld.clone());
      const screens = ['monitors.left.mesh', 'monitors.right.mesh'].map((id) => rig.semantic.get(id)!);
      const screenBase = screens.map((node) => node.getWorldPosition(new THREE.Vector3()));
      rig.apply({ 'monitors.leftTrim': -15, 'monitors.rightTrim': 15 });
      armIds.forEach((id, i) => expect(rig.semantic.get(id)!.matrixWorld.elements).toEqual(armBase[i].elements));
      rig.apply({ 'monitors.face': 1 });
      armIds.forEach((id, i) => expect(rig.semantic.get(id)!.matrixWorld.equals(armBase[i])).toBe(false));
      screens.forEach((node, i) => expect(node.getWorldPosition(new THREE.Vector3()).distanceTo(screenBase[i])).toBeGreaterThan(.005));
      const raisedBase = screens.map((node) => node.getWorldPosition(new THREE.Vector3()));
      rig.apply({ 'monitors.face': 1, 'desk.lift': 1 });
      screens.forEach((node, i) => {
        const delta = node.getWorldPosition(new THREE.Vector3()).sub(raisedBase[i]);
        expect(delta.x).toBeCloseTo(0, 5); expect(delta.y).toBeCloseTo(.4, 5); expect(delta.z).toBeCloseTo(0, 5);
      });
      rig.apply({});
      screens.forEach((node, i) => expect(node.getWorldPosition(new THREE.Vector3()).distanceTo(screenBase[i])).toBeLessThan(1e-6));
    });
  }
});

// The Blender-authored fixture is checked into the source together with the
// exact asset, so the comparison also runs independently of Blender in CI.
const fixturePath = path.resolve('tests/fixtures/monitor-poses.json');
describe('Blender / Three.js sampled motion parity', () => {
  it('includes the independently evaluated Blender pose fixture', () => expect(existsSync(fixturePath)).toBe(true));
  if (existsSync(fixturePath)) {
    const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as { face: number; leftTrim: number; rightTrim: number; leftTilt: number; rightTilt: number; nodes: Record<string, { translation: number[]; quaternion: number[] }> }[];
    it('covers both pitch limits and horizontal on each screen', () => {
      for (const key of ['leftTilt', 'rightTilt'] as const) {
        expect(fixtures.every(pose => Number.isFinite(pose[key]))).toBe(true);
        const sampled = new Set(fixtures.map(pose => pose[key]));
        for (const angle of [tiltDefinition.min, 0, tiltDefinition.max]) expect(sampled.has(angle)).toBe(true);
      }
    });
    for (const variant of ['desktop', 'low'] as const) it(`${variant}: all fixture poses agree within 1 mm / 0.1 degree`, () => {
      const rig = loadNodes(variant);
      for (const pose of fixtures) {
        rig.apply({ 'monitors.face': pose.face, 'monitors.leftTrim': pose.leftTrim, 'monitors.rightTrim': pose.rightTrim,
          'monitors.leftTilt': pose.leftTilt, 'monitors.rightTilt': pose.rightTilt });
        for (const [name, expected] of Object.entries(pose.nodes)) {
          const node = rig.semantic.get(name)!;
          expect(node, name).toBeDefined();
          const [x, y, z] = expected.translation;
          const [w, qx, qy, qz] = expected.quaternion;
          expect(node.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(x, z, -y)), `${variant} ${name} position`).toBeLessThan(.001);
          expect(node.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion(qx, qz, -qy, w).normalize()), `${variant} ${name} rotation`).toBeLessThan(Math.PI / 1800);
        }
      }
    });
  }
});
