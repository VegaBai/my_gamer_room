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
  const nodes: THREE.Object3D[] = data.nodes.map((node: { name?: string; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: object }) => {
    const object = new THREE.Object3D();
    object.name = node.name ?? '';
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    object.userData = node.extras ?? {};
    if (node.mesh !== undefined) {
      object.userData.materials = data.meshes[node.mesh].primitives.map((primitive: { material: number }) => data.materials[primitive.material]);
      const bounds = new THREE.Box3();
      for (const primitive of data.meshes[node.mesh].primitives) {
        const accessor = data.accessors[primitive.attributes.POSITION];
        bounds.union(new THREE.Box3(new THREE.Vector3(...accessor.min), new THREE.Vector3(...accessor.max)));
      }
      object.userData.localBounds = bounds;
    }
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
        ...controlInputRange(control, values, track));
    }
    for (const [id, target] of targets) {
      const node = semantic.get(id)!;
      node.position.copy(target.position); node.quaternion.copy(target.quaternion); node.scale.copy(target.scale);
    }
    scene.updateMatrixWorld(true);
  }
  function worldBounds(id: string) {
    const node = semantic.get(id)!;
    return (node.userData.localBounds as THREE.Box3).clone().applyMatrix4(node.matrixWorld);
  }
  return { scene, nodes, semantic, apply, worldBounds };
}

describe('cabinet-top book replacement', () => {
  for (const variant of ['desktop', 'low'] as const) {
    it(`${variant}: replaces the plant with grounded books that stay on the cabinet`, () => {
      const room = loadNodes(variant);
      const books = room.semantic.get('decor.scifi.books')!;
      expect(books).toBeDefined();
      expect(room.nodes.some(node => node.name.startsWith('Decor_Plant_'))).toBe(false);
      expect(books.parent?.userData.web_id).toBe('cabinet.root');
      expect(books.userData.web_preoptimized_book_stack).toBe(true);
      expect(books.userData.web_surface_boundary_limit).toBe(0);
      const defaults = Object.fromEntries(manifest.controls.map(control => [control.id, control.default]));
      room.apply(defaults);
      const matrix = books.matrixWorld.clone();
      const box = room.worldBounds('decor.scifi.books');
      expect(box.min.y).toBeGreaterThanOrEqual(.8199);
      expect(box.min.y).toBeLessThan(.823);
      expect(box.min.x).toBeGreaterThanOrEqual(.929);
      expect(box.max.x).toBeLessThanOrEqual(1.271);
      room.apply({ ...defaults, 'desk.lift': 1, 'cabinet.drawer.1': 1,
        'cabinet.drawer.2': 1, 'cabinet.drawer.3': 1, 'cabinet.drawer.4': 1, 'cabinet.door': 1 });
      books.matrixWorld.elements.forEach((value, i) => expect(value).toBeCloseTo(matrix.elements[i], 8));
      room.apply(defaults);
      books.matrixWorld.elements.forEach((value, i) => expect(value).toBeCloseTo(matrix.elements[i], 8));
    });
  }
});

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
    it(`${variant}: uses the rebuilt support and clean texture-free mechanical finish`, () => {
      const rig = loadNodes(variant);
      const parts = [...rig.semantic].filter(([id]) => /^monitors\.arm\..*\.mesh$/.test(id)).map(([, node]) => node);
      expect(parts).toHaveLength(7);
      for (const part of parts) {
        expect(part.userData.web_analytic_support, part.name).toBeTruthy();
        expect(part.userData.web_surface_boundary_limit).toBe(0);
        for (const material of part.userData.materials) {
          expect(material.normalTexture).toBeUndefined();
          expect(material.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
          expect(material.pbrMetallicRoughness?.metallicRoughnessTexture).toBeUndefined();
        }
      }
    });

    it(`${variant}: support stays rigid without scale, shear, or accumulated deformation`, () => {
      const rig = loadNodes(variant);
      const parts = [...rig.semantic].filter(([id]) => /^monitors\.arm\..*\.mesh$/.test(id)).map(([, node]) => node);
      expect(parts).toHaveLength(7);
      const ancestors = new Set<THREE.Object3D>();
      for (const part of parts) for (let node: THREE.Object3D | null = part; node; node = node.parent) ancestors.add(node);
      for (const node of ancestors) expect(node.scale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
      for (const control of manifest.controls) for (const track of control.tracks ?? []) {
        if (ancestors.has(rig.semantic.get(track.nodeId)!)) expect(track.path).not.toBe('scale');
      }
      for (const face of [0, .1, .2, .25, .4, .7, 1]) for (const trim of [-15, 0, 15]) for (const tilt of [-5, 0, 5]) {
        rig.apply({ 'monitors.face': face, 'monitors.leftTrim': trim, 'monitors.rightTrim': -trim,
          'monitors.leftTilt': tilt, 'monitors.rightTilt': -tilt, 'desk.lift': face });
        for (const part of parts) {
          const axes = [0, 1, 2].map(column => new THREE.Vector3().setFromMatrixColumn(part.matrixWorld, column));
          for (const axis of axes) expect(axis.length()).toBeCloseTo(1, 5);
          expect(axes[0].dot(axes[1])).toBeCloseTo(0, 5);
          expect(axes[0].dot(axes[2])).toBeCloseTo(0, 5);
          expect(axes[1].dot(axes[2])).toBeCloseTo(0, 5);
          expect(part.matrixWorld.determinant()).toBeCloseTo(1, 5);
        }
      }
    });

    it(`${variant}: parks the two screens close together and clear of the speakers`, () => {
      const rig = loadNodes(variant);
      rig.apply({});
      const left = rig.worldBounds('monitors.left.mesh');
      const right = rig.worldBounds('monitors.right.mesh');
      const gap = right.min.x - left.max.x;
      expect(gap).toBeGreaterThanOrEqual(.008);
      expect(gap).toBeLessThanOrEqual(.03);
      const speakers = ['scene.10.speaker.mesh.01.95753e88', 'scene.10.speaker.right.instance.mesh.01.58051953'].map(rig.worldBounds);
      for (const screen of [left, right]) for (const speaker of speakers) expect(screen.intersectsBox(speaker)).toBe(false);
    });

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
      for (const side of ['left', 'right']) {
        const body = rig.worldBounds(`monitors.${side}.mesh`);
        const panel = rig.worldBounds(side === 'left' ? 'scene.screen.left.b7d389a0' : 'scene.screen.right.41439fdc');
        // Catch a keep-world attachment made after changing the parked pose:
        // it can preserve relative motion while leaving the glow at the old gap.
        expect(body.getCenter(new THREE.Vector3()).distanceTo(panel.getCenter(new THREE.Vector3()))).toBeLessThan(.05);
      }
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

describe('published microphone U-yoke contract', () => {
  for (const variant of ['desktop', 'low'] as const) it(`${variant}: stays connected and centred through folding, yaw and desk lift`, () => {
    const rig = loadNodes(variant);
    const head = rig.semantic.get('microphone.head.mesh')!;
    const capsule = rig.semantic.get('microphone.capsule.mesh')!;
    const knobs = rig.semantic.get('microphone.mount.knobs.mesh')!;
    expect(knobs).toBeDefined();
    const hardware = rig.nodes.filter(node => node.userData.web_analytic_microphone_mount);
    expect(hardware).toHaveLength(3);
    const clevis = hardware.find(node => node !== head && node !== knobs)!;
    rig.apply({});
    const relative = head.matrixWorld.clone().invert().multiply(capsule.matrixWorld);
    const basePosition = capsule.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(relative.elements[12])).toBeLessThan(.001);
    expect(Math.abs(relative.elements[14])).toBeLessThan(.001);
    for (const part of hardware) {
      expect(part.userData.web_surface_boundary_limit).toBe(0);
      for (const material of part.userData.materials) expect(material.normalTexture).toBeUndefined();
    }
    for (let step = 0; step <= 20; step++) for (const yaw of [-30, 0, 10]) for (const lift of [0, 1]) {
      rig.apply({ 'microphone.fold': step / 20, 'microphone.yaw': yaw, 'desk.lift': lift });
      const current = head.matrixWorld.clone().invert().multiply(capsule.matrixWorld);
      current.elements.forEach((value, i) => expect(value).toBeCloseTo(relative.elements[i], 5));
      expect(new THREE.Vector3(0, 1, 0).transformDirection(capsule.matrixWorld).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(.001);
      expect(head.getWorldPosition(new THREE.Vector3()).distanceTo(clevis.getWorldPosition(new THREE.Vector3()))).toBeLessThan(.001);
      for (const part of hardware) expect(part.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(.00001);
    }
    rig.apply({ 'desk.lift': 1 });
    expect(capsule.getWorldPosition(new THREE.Vector3()).sub(basePosition).distanceTo(new THREE.Vector3(0, .4, 0))).toBeLessThan(.001);
    rig.apply({});
    expect(capsule.getWorldPosition(new THREE.Vector3()).distanceTo(basePosition)).toBeLessThan(.00001);
  });
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
