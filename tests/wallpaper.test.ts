import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { RoomArchitecture, WALLPAPERS, resolveWallpaper, wallShouldShow, type ArchitectureContract } from '../lib/room/wallpaper';

const contract: ArchitectureContract = {
  wallpaperNodeIds: ['back.upper', 'left.upper', 'right.upper'],
  walls: [
    { id: 'back', nodeIds: ['back'], point: [0, 1.5, -.78], inward: [0, 0, 1] },
    { id: 'left', nodeIds: ['left', 'window.root'], point: [-2.52, 1.5, .55], inward: [1, 0, 0] },
    { id: 'right', nodeIds: ['right'], point: [2.57, 1.5, .55], inward: [-1, 0, 0] },
  ],
};
function fixture() {
  const root = new THREE.Group();
  for (const wall of contract.walls) {
    const group = new THREE.Group(); group.userData.web_id = wall.id;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    mesh.userData.web_id = `${wall.id}.upper`; group.add(mesh); root.add(group);
  }
  for (const id of ['window.root', 'decor.wall-art.root']) {
    const object = new THREE.Group(); object.userData.web_id = id; root.add(object);
  }
  const nodes = new Map<string, THREE.Object3D>(); root.traverse(o => nodes.set(o.userData.web_id, o));
  return { root, nodes, architecture: new RoomArchitecture(root, contract) };
}

describe('wall finishes and full-orbit cutaway', () => {
  it('ships the left-wall window and complete wallpaper/cutaway groups in the actual addon', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/room/expansion/manifest.json', import.meta.url), 'utf8'));
    const bytes = readFileSync(new URL(`../public${manifest.asset.url}`, import.meta.url));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    const nodes = new Map<string, { translation?: number[]; rotation?: number[] }>(gltf.nodes.map((n: { extras?: { web_id?: string } }) => [n.extras?.web_id, n]));
    expect(manifest.architecture.walls.map((w: { id: string }) => w.id).sort()).toEqual(['back', 'left', 'right', 'south']);
    expect(manifest.hideBaseNodeIds).toContain('scene.architecture.left.wall.00feb0f3');
    manifest.architecture.wallpaperNodeIds.forEach((id: string) => expect(nodes.has(id)).toBe(true));
    const windowRoot = nodes.get('window.root')!;
    expect(new THREE.Vector3().fromArray(windowRoot.translation!).distanceTo(new THREE.Vector3(-2.0545, 1.73, .55))).toBeLessThan(.00001);
    expect(new THREE.Quaternion().fromArray(windowRoot.rotation!).normalize().angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))).toBeLessThan(.00001);
  });
  it('validates stored choices without accepting arbitrary values', () => {
    WALLPAPERS.forEach(style => expect(resolveWallpaper(style.id)).toBe(style.id));
    [null, 'old-style', {}, 1].forEach(value => expect(resolveWallpaper(value)).toBe('linen'));
  });
  it('keeps all walls visible from inside and hides each outside wall with its attachments', () => {
    const { nodes, architecture } = fixture();
    architecture.update(new THREE.Vector3(0, 2, 1));
    expect([...nodes.values()].every(n => n.visible)).toBe(true);
    architecture.update(new THREE.Vector3(-4, 2, 1));
    expect(nodes.get('left')!.visible).toBe(false);
    expect(nodes.get('window.root')!.visible).toBe(false);
    expect(nodes.get('right')!.visible).toBe(true);
    architecture.update(new THREE.Vector3(0, 2, -4));
    expect(nodes.get('left')!.visible).toBe(true);
    expect(nodes.get('window.root')!.visible).toBe(true);
    expect(nodes.get('back')!.visible).toBe(false);
    expect(nodes.get('decor.wall-art.root')!.visible).toBe(false);
    architecture.update(new THREE.Vector3(4, 2, 1));
    expect(nodes.get('back')!.visible).toBe(true);
    expect(nodes.get('decor.wall-art.root')!.visible).toBe(true);
    expect(nodes.get('right')!.visible).toBe(false);
    architecture.dispose();
    expect([...nodes.values()].every(n => n.visible)).toBe(true);
  });
  it('avoids flicker within the wall-plane hysteresis band', () => {
    expect(wallShouldShow(new THREE.Vector3(.01, 1, 0), [0, 0, 0], [1, 0, 0], false)).toBe(false);
    expect(wallShouldShow(new THREE.Vector3(-.01, 1, 0), [0, 0, 0], [1, 0, 0], true)).toBe(true);
    expect(wallShouldShow(new THREE.Vector3(.1, 1, 0), [0, 0, 0], [1, 0, 0], false)).toBe(true);
  });
  it('caches wallpaper materials and restores originals on disposal', () => {
    const context = { fillStyle: '', strokeStyle: '', lineWidth: 0, fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    try {
      const { nodes, architecture } = fixture();
      const mesh = nodes.get('left.upper') as THREE.Mesh;
      const original = mesh.material;
      architecture.setWallpaper('linen');
      const linen = mesh.material as THREE.MeshStandardMaterial;
      const disposeMaterial = vi.spyOn(linen, 'dispose'), disposeTexture = vi.spyOn(linen.map!, 'dispose');
      architecture.setWallpaper('pinstripe'); expect(mesh.material).not.toBe(linen);
      architecture.setWallpaper('linen'); expect(mesh.material).toBe(linen);
      expect(linen.map!.repeat.toArray()).toEqual([2, 2]);
      expect(linen.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      architecture.dispose();
      expect(mesh.material).toBe(original);
      expect(disposeMaterial).toHaveBeenCalledOnce(); expect(disposeTexture).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
  it('fails explicitly when an authored wall is absent', () => {
    expect(() => new RoomArchitecture(new THREE.Group(), contract)).toThrow('Missing architecture node');
  });
});
