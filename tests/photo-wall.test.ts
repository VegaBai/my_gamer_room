import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PhotoWall, PHOTO_SLOTS, type PhotoRecord, type PhotoSlot, type PhotoStore } from '../lib/room/photo-wall';

function setup(storage?: PhotoStore) {
  const root = new THREE.Group();
  const originals = new Map<PhotoSlot, THREE.Material>();
  for (const id of PHOTO_SLOTS) {
    const geometry = new THREE.PlaneGeometry(1, 1); geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());
    const material = new THREE.MeshStandardMaterial(); originals.set(id, material);
    const mesh = new THREE.Mesh(geometry, material); mesh.userData.photoSlot = id; root.add(mesh);
  }
  const records = new Map<PhotoSlot, PhotoRecord>();
  const store: PhotoStore = storage ?? {
    get: async id => records.get(id), put: async (id, value) => { records.set(id, value); }, remove: async id => { records.delete(id); },
  };
  const draw = vi.fn();
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage: draw }) }) });
  const decode = vi.fn(async (): Promise<{ width: number; height: number; close: () => void }> => ({ width: 800, height: 400, close: vi.fn() }));
  vi.stubGlobal('createImageBitmap', decode);
  return { wall: new PhotoWall(root, store), root, originals, records, store, decode, draw };
}
afterEach(() => vi.unstubAllGlobals());
const file = () => new File(['image fixture'], 'my-photo.png', { type: 'image/png' });

describe('independent locally saved Polaroids', () => {
  it('changes only the selected print, uses local UVs, preserves aspect, and restores after reload', async () => {
    const s = setup(); await s.wall.replace('seaside', file());
    expect(s.root.children[1]).toHaveProperty('material', s.originals.get('mountain'));
    const material = (s.root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material.map?.channel).toBe(1); expect(material.map?.flipY).toBe(false);
    expect(s.draw.mock.calls[0].slice(1)).toEqual([-512, 0, 2048, 1024]);
    await s.wall.setFit('seaside', 'contain');
    expect(s.draw.mock.lastCall?.slice(1)).toEqual([0, 256, 1024, 512]);
    s.wall.dispose();
    const next = setup(s.store); await next.wall.restore();
    expect(next.wall.status[0]).toMatchObject({ name: 'my-photo.png', fit: 'contain', saved: true });
    await next.wall.reset('seaside'); expect(s.records.has('seaside')).toBe(false);
    expect(next.root.children[0]).toHaveProperty('material', next.originals.get('seaside'));
  });
  it('reset invalidates a late image decode so the old image cannot reappear', async () => {
    const s = setup(); let finish!: (value: { width: number; height: number; close: () => void }) => void;
    s.decode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.wall.replace('seaside', file()); await s.wall.reset('seaside');
    const bitmap = { width: 20, height: 20, close: vi.fn() }; finish(bitmap);
    expect(await pending).toBe(false); expect(bitmap.close).toHaveBeenCalled(); expect(s.records.size).toBe(0);
  });
  it('storage failure leaves the photo visible and explicitly marks it unsaved', async () => {
    const s = setup({ get: async () => undefined, put: async () => { throw Error('quota'); }, remove: async () => undefined });
    await s.wall.replace('city', file()); expect(s.wall.status[2]).toMatchObject({ name: 'my-photo.png', saved: false });
    expect(s.root.children[2]).not.toHaveProperty('material', s.originals.get('city'));
  });
  it('actual GLB exposes exactly three isolated photo surfaces with replacement UVs', () => {
    const spec = JSON.parse(readFileSync('public/room/personal-corner/manifest.json', 'utf8'));
    const bytes = readFileSync('public' + spec.asset.url);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const photos = gltf.nodes.filter((node: { extras?: { photoSlot?: string } }) => node.extras?.photoSlot);
    expect(photos.map((p: { extras: { photoSlot: string } }) => p.extras.photoSlot).sort()).toEqual([...PHOTO_SLOTS].sort());
    for (const p of photos) expect(gltf.meshes[p.mesh].primitives[0].attributes.TEXCOORD_1).toBeTypeOf('number');
  });
});
