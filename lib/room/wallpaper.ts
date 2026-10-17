import * as THREE from 'three';
import type { Vec3 } from './types';
import { WALLPAPERS, resolveWallpaper, type WallpaperId } from './wallpaper-options';
export { WALLPAPERS, resolveWallpaper, WALLPAPER_STORAGE_KEY, type WallpaperId } from './wallpaper-options';

export interface ArchitectureContract {
  wallpaperNodeIds: string[];
  walls: { id: string; nodeIds: string[]; point: Vec3; inward: Vec3 }[];
}

export function wallShouldShow(camera: THREE.Vector3, point: Vec3, inward: Vec3, wasVisible: boolean) {
  const distance = (camera.x - point[0]) * inward[0] + (camera.y - point[1]) * inward[1] + (camera.z - point[2]) * inward[2];
  return distance > .04 ? true : distance < -.04 ? false : wasVisible;
}

function makeWallpaper(id: WallpaperId) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Wallpaper canvas is unavailable');
  const style = WALLPAPERS.find(item => item.id === id)!;
  ctx.fillStyle = style.color; ctx.fillRect(0, 0, 512, 512);
  // Small, seamless geometric textile patterns, intentionally low contrast.
  if (id !== 'plain') {
    for (let i = 0; i < 512; i += 4) {
      ctx.strokeStyle = i % 12 === 0 ? 'rgba(111,99,87,.045)' : 'rgba(255,255,255,.17)';
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(i + .5, 0); ctx.lineTo(i + .5, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i + .5); ctx.lineTo(512, i + .5); ctx.stroke();
    }
  }
  if (id === 'pinstripe') {
    for (let x = 0; x < 512; x += 64) {
      ctx.fillStyle = 'rgba(128,97,108,.12)'; ctx.fillRect(x, 0, 2, 512);
      ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillRect(x + 5, 0, 1, 512);
    }
  }
  if (id === 'diamond') {
    ctx.strokeStyle = 'rgba(114,134,130,.12)'; ctx.lineWidth = 1.5;
    for (let x = -512; x <= 1024; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 512, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 512, 512); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2); // Authored wall UVs are physical metres; one tile = 50 cm.
  texture.anisotropy = 4;
  return texture;
}

export class RoomArchitecture {
  readonly available: boolean;
  private readonly walls: { spec: ArchitectureContract['walls'][number]; objects: THREE.Object3D[]; visible: boolean }[] = [];
  private readonly surfaces: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[] = [];
  private readonly materials = new Map<WallpaperId, THREE.MeshStandardMaterial>();
  private readonly visibility = new Map<THREE.Object3D, boolean>();

  constructor(root: THREE.Object3D, contract: ArchitectureContract) {
    const nodes = new Map<string, THREE.Object3D>();
    root.traverse(object => { if (typeof object.userData.web_id === 'string') nodes.set(object.userData.web_id, object); });
    const requireNode = (id: string) => {
      const object = nodes.get(id); if (!object) throw new Error(`Missing architecture node ${id}`); return object;
    };
    if (contract.walls.length < 3 || contract.wallpaperNodeIds.length < 3) throw new Error('Incomplete room architecture');
    for (const spec of contract.walls) {
      if (![...spec.point, ...spec.inward].every(Number.isFinite) || Math.abs(new THREE.Vector3(...spec.inward).length() - 1) > .001) throw new Error('Invalid wall plane');
      const objects = spec.nodeIds.map(requireNode);
      // This existing decoration is attached to the back wall, not to the new addon.
      if (spec.id === 'back' && nodes.has('decor.wall-art.root')) objects.push(nodes.get('decor.wall-art.root')!);
      objects.forEach(object => this.visibility.set(object, object.visible));
      this.walls.push({ spec, objects, visible: true });
    }
    const seen = new Set<THREE.Mesh>();
    contract.wallpaperNodeIds.forEach(id => requireNode(id).traverse(object => {
      if (!(object instanceof THREE.Mesh) || seen.has(object)) return;
      seen.add(object); this.surfaces.push({ mesh: object, original: object.material });
    }));
    this.available = this.surfaces.length > 0;
  }

  setWallpaper(id: WallpaperId) {
    id = resolveWallpaper(id);
    let material = this.materials.get(id);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ map: makeWallpaper(id), roughness: .94, metalness: 0 });
      this.materials.set(id, material);
    }
    this.surfaces.forEach(({ mesh }) => { mesh.material = material; });
  }

  update(camera: THREE.Vector3) {
    this.walls.forEach(wall => {
      wall.visible = wallShouldShow(camera, wall.spec.point, wall.spec.inward, wall.visible);
      wall.objects.forEach(object => { object.visible = wall.visible && this.visibility.get(object)!; });
    });
  }

  dispose() {
    this.surfaces.forEach(({ mesh, original }) => { mesh.material = original; });
    this.visibility.forEach((visible, object) => { object.visible = visible; });
    this.materials.forEach(material => { material.map?.dispose(); material.dispose(); });
    this.materials.clear();
  }
}
