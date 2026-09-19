import * as THREE from 'three';
import { EXPANSION_CONTROL_IDS } from './expansion-controls';
import type { RoomCameraDefinition, Vec3 } from './types';
import type { ArchitectureContract } from './wallpaper';

export interface ExpansionContract {
  schema: 'room-expansion-runtime/1';
  asset: { url: string; sha256: string; bytes: number };
  rootNodeId: string;
  defaults: Record<string, number>;
  hideBaseNodeIds: string[];
  architecture?: ArchitectureContract;
  blinds: {
    slatIds: string[]; topHeight: number; loweredPitch: number; raisedPitch: number;
    tiltFadeExponent: number; bottomRailId: string; bottomOffset: number;
    slatThickness: number; slatChordWidth: number;
    cords: { nodeId: string; topHeight: number }[]; cordModelLength: number;
  };
  doors: { nodeId: string; controlId: string; angleDegrees: number }[];
  emission: {
    controlId: string; meshIds: string[]; strength: number; color?: Vec3;
    preserveMaterialColor?: boolean; lightPosition_glTF?: Vec3;
    lightIntensity?: number; distance?: number;
  }[];
  selectable: { controlId: string; nodeIds: string[] }[];
  camera: {
    position: Vec3; target: Vec3; fov: number; near: number; far: number;
    minDistance: number; maxDistance: number; minAzimuthAngle: number;
    maxAzimuthAngle: number; minPolarAngle: number; maxPolarAngle: number;
  };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const vec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(finite);

export function validateExpansionContract(contract: ExpansionContract) {
  if (contract.schema !== 'room-expansion-runtime/1' || contract.rootNodeId !== 'expansion.root') throw new Error('Unsupported room expansion');
  if (!contract.asset?.url?.startsWith('/room/expansion/') || !/^[a-f0-9]{64}$/.test(contract.asset.sha256)) throw new Error('Expansion asset provenance missing');
  const b = contract.blinds;
  if (!b || !Array.isArray(b.slatIds) || b.slatIds.length < 2 || new Set(b.slatIds).size !== b.slatIds.length
    || ![b.topHeight, b.loweredPitch, b.raisedPitch, b.tiltFadeExponent, b.bottomOffset, b.slatThickness, b.slatChordWidth, b.cordModelLength].every(finite)
    || b.raisedPitch <= b.slatThickness || b.loweredPitch < b.raisedPitch || b.tiltFadeExponent < 1 || b.cordModelLength <= 0
    || !Array.isArray(b.cords) || b.cords.some(cord => !cord.nodeId || !finite(cord.topHeight))) throw new Error('Invalid blind mechanism');
  if (!Array.isArray(contract.doors) || contract.doors.length !== 2 || contract.doors.some(door => !door.nodeId || !finite(door.angleDegrees))) throw new Error('Invalid bookcase hinges');
  if (!Array.isArray(contract.emission) || contract.emission.length !== 2 || contract.emission.some(spec => !spec.meshIds?.length || !finite(spec.strength) || spec.strength < 0
    || (spec.color !== undefined && !vec3(spec.color)) || (spec.lightPosition_glTF !== undefined && (!vec3(spec.lightPosition_glTF) || !finite(spec.lightIntensity) || !finite(spec.distance))))) throw new Error('Invalid expansion lighting');
  const ids = contract.selectable?.map(spec => spec.controlId) ?? [];
  if (new Set(ids).size !== EXPANSION_CONTROL_IDS.length || ids.length !== EXPANSION_CONTROL_IDS.length
    || EXPANSION_CONTROL_IDS.some(id => !ids.includes(id) || !finite(contract.defaults?.[id]))
    || contract.selectable.some(spec => !spec.nodeIds?.length)) throw new Error('Expansion controls are incomplete');
  if (!Array.isArray(contract.hideBaseNodeIds) || !contract.hideBaseNodeIds.length) throw new Error('Missing window replacement contract');
  const c = contract.camera;
  if (!c || !vec3(c.position) || !vec3(c.target) || ![c.fov, c.near, c.far, c.minDistance, c.maxDistance, c.minAzimuthAngle, c.maxAzimuthAngle, c.minPolarAngle, c.maxPolarAngle].every(finite)) throw new Error('Invalid expansion camera');
}

export function blindPose(contract: ExpansionContract['blinds'], tilt: number, raised: number) {
  const r = THREE.MathUtils.clamp(finite(raised) ? raised : 0, 0, 1);
  const angle = THREE.MathUtils.clamp(finite(tilt) ? tilt : 30, -70, 70);
  const pitch = THREE.MathUtils.lerp(contract.loweredPitch, contract.raisedPitch, r);
  return {
    slatHeights: contract.slatIds.map((_, index) => contract.topHeight - index * pitch),
    angle: THREE.MathUtils.degToRad(angle) * Math.pow(1 - r, contract.tiltFadeExponent),
    bottomHeight: contract.topHeight - (contract.slatIds.length - 1) * pitch - contract.bottomOffset,
  };
}

export class RoomExpansion {
  readonly nodes = new Map<string, THREE.Object3D>();
  readonly hitTargets: THREE.Mesh[] = [];
  readonly visualTargets = new Map<string, THREE.Object3D[]>();
  readonly camera: RoomCameraDefinition;
  private readonly lights: { controlId: string; light: THREE.PointLight; intensity: number }[] = [];
  private readonly emitters: { controlId: string; materials: THREE.MeshStandardMaterial[]; strength: number }[] = [];
  private readonly hidden: { object: THREE.Object3D; wasVisible: boolean }[] = [];

  constructor(readonly root: THREE.Object3D, readonly contract: ExpansionContract, baseRoot: THREE.Object3D) {
    validateExpansionContract(contract);
    root.traverse(object => {
      const id = object.userData.web_id;
      if (typeof id === 'string') {
        if (this.nodes.has(id)) throw new Error(`Duplicate addon node: ${id}`);
        this.nodes.set(id, object);
      }
    });
    const requireNode = (id: string) => {
      const node = this.nodes.get(id);
      if (!node) throw new Error(`Missing addon node: ${id}`);
      return node;
    };
    requireNode(contract.rootNodeId);
    const b = contract.blinds;
    [...b.slatIds, b.bottomRailId, ...b.cords.map(c => c.nodeId), ...contract.doors.map(d => d.nodeId)] .forEach(requireNode);
    const claimed = new Set<THREE.Mesh>();
    for (const spec of contract.selectable) {
      const roots = spec.nodeIds.map(requireNode);
      this.visualTargets.set(spec.controlId, roots);
      let meshCount = 0;
      for (const node of roots) node.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (claimed.has(object)) throw new Error(`Overlapping addon picking ownership: ${object.name}`);
        claimed.add(object); meshCount++;
      });
      if (!meshCount) throw new Error(`No geometry for ${spec.controlId}`);
    }
    contract.emission.forEach(spec => spec.meshIds.forEach(id => {
      let count = 0;
      requireNode(id).traverse(object => { if (object instanceof THREE.Mesh) count++; });
      if (!count) throw new Error(`No luminous mesh ${id}`);
    }));
    const baseNodes = new Map<string, THREE.Object3D>();
    baseRoot.traverse(object => { if (typeof object.userData.web_id === 'string') baseNodes.set(object.userData.web_id, object); });
    for (const id of contract.hideBaseNodeIds) {
      const object = baseNodes.get(id);
      if (!object) throw new Error(`Base room cannot install expansion; missing ${id}`);
      this.hidden.push({ object, wasVisible: object.visible });
    }
    // Only mutate the live scene after every required identity has been checked.
    root.traverse(object => {
      if (object instanceof THREE.Light || object instanceof THREE.Camera) object.visible = false;
      if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = true; }
    });
    for (const spec of contract.selectable) for (const node of this.visualTargets.get(spec.controlId)!) node.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.layers.enable(2); // Keep the visible layer: these are real meshes, not proxies.
      object.userData.controlId = spec.controlId;
      this.hitTargets.push(object);
    });
    for (const spec of contract.emission) {
      const materials = new Set<THREE.MeshStandardMaterial>();
      for (const id of spec.meshIds) requireNode(id).traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        const clones = originals.map(material => {
          const clone = material.clone();
          if (clone instanceof THREE.MeshStandardMaterial) {
            if (spec.color) clone.emissive.setRGB(...spec.color);
            materials.add(clone);
          }
          return clone;
        });
        object.material = Array.isArray(object.material) ? clones : clones[0];
      });
      this.emitters.push({ controlId: spec.controlId, materials: [...materials], strength: spec.strength });
      if (spec.lightPosition_glTF) {
        const light = new THREE.PointLight(spec.color ? new THREE.Color(...spec.color) : '#ffd4ba', spec.lightIntensity, spec.distance, 2);
        light.position.set(...spec.lightPosition_glTF);
        light.castShadow = false;
        root.add(light);
        this.lights.push({ controlId: spec.controlId, light, intensity: spec.lightIntensity! });
      }
    }
    const c = contract.camera;
    this.camera = { position: c.position, target: c.target, fovDegrees: c.fov, near: c.near, far: c.far,
      minDistance: c.minDistance, maxDistance: c.maxDistance, minAzimuth: c.minAzimuthAngle,
      maxAzimuth: c.maxAzimuthAngle, minPolar: c.minPolarAngle, maxPolar: c.maxPolarAngle };
    this.hidden.forEach(({ object }) => { object.visible = false; });
    baseRoot.add(root);
    this.apply(contract.defaults);
  }

  apply(values: Readonly<Record<string, number>>) {
    const value = (id: string) => finite(values[id]) ? values[id] : this.contract.defaults[id];
    const b = this.contract.blinds;
    const pose = blindPose(b, value('blinds.tilt'), value('blinds.raise'));
    b.slatIds.forEach((id, index) => {
      const node = this.nodes.get(id)!;
      node.position.y = pose.slatHeights[index];
      node.rotation.x = pose.angle;
    });
    this.nodes.get(b.bottomRailId)!.position.y = pose.bottomHeight;
    b.cords.forEach(cord => { this.nodes.get(cord.nodeId)!.scale.y = (cord.topHeight - pose.bottomHeight) / b.cordModelLength; });
    this.contract.doors.forEach(door => {
      this.nodes.get(door.nodeId)!.rotation.y = THREE.MathUtils.degToRad(door.angleDegrees) * THREE.MathUtils.clamp(value(door.controlId), 0, 1);
    });
    this.emitters.forEach(spec => spec.materials.forEach(material => { material.emissiveIntensity = spec.strength * THREE.MathUtils.clamp(value(spec.controlId), 0, 1); }));
    this.lights.forEach(spec => { spec.light.intensity = spec.intensity * THREE.MathUtils.clamp(value(spec.controlId), 0, 1); });
  }

  detach() {
    this.hidden.forEach(({ object, wasVisible }) => { object.visible = wasVisible; });
    this.root.removeFromParent();
  }
}
