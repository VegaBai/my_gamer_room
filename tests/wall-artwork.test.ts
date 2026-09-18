import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ArtworkError, MAX_ARTWORK_BYTES, artworkDrawRect, validateArtworkFile } from '../lib/room/artwork-input';
import { WallArtwork } from '../lib/room/wall-artwork';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const root = new THREE.Group();
  const print = new THREE.MeshBasicMaterial();
  print.name = 'MAT_WallArt_Image';
  const side = new THREE.MeshStandardMaterial();
  const image = new THREE.Mesh(new THREE.BoxGeometry(), [print, side]);
  image.userData.artworkAspect = .75;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(), side);
  root.add(image, frame);
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  return { image, frame, print, side, context, manager: new WallArtwork(root) };
}

describe('local wall artwork', () => {
  it('accepts only bounded raster images, never SVG or empty files', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(() => validateArtworkFile({ type, size: 123 })).not.toThrow();
    for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: MAX_ARTWORK_BYTES + 1 }]) {
      expect(() => validateArtworkFile(file)).toThrow(ArtworkError);
    }
  });

  it('fits and crops without changing the source aspect ratio', () => {
    expect(artworkDrawRect(200, 100, 300, 400, 'contain')).toEqual({ x: 0, y: 125, width: 300, height: 150 });
    expect(artworkDrawRect(200, 100, 300, 400, 'cover')).toEqual({ x: -250, y: 0, width: 800, height: 400 });
    expect(() => artworkDrawRect(0, 1, 3, 4, 'contain')).toThrow(ArtworkError);
  });

  it('changes only the isolated front material, preserves glTF UV orientation, and restores original', async () => {
    const { manager, image, frame, side, print, context } = fixture();
    const bitmap = { width: 400, height: 300, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    expect(await manager.replace(file)).toBe(true);
    const replacement = (image.material as THREE.Material[])[0] as THREE.MeshBasicMaterial;
    expect(replacement.map?.flipY).toBe(false);
    expect(replacement.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(replacement.toneMapped).toBe(false);
    expect(frame.material).toBe(side);
    expect((image.material as THREE.Material[])[1]).toBe(side);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    manager.setFit('cover');
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    manager.reset();
    expect((image.material as THREE.Material[])[0]).toBe(print);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('reset cancels a pending decode so an old request cannot overwrite the original', async () => {
    const { manager, image, print } = fixture();
    const bitmap = { width: 100, height: 100, close: vi.fn() };
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('createImageBitmap', () => new Promise(done => { resolve = done; }));
    const pending = manager.replace(new File(['test'], 'test.png', { type: 'image/png' }));
    manager.reset();
    resolve(bitmap);
    expect(await pending).toBe(false);
    expect((image.material as THREE.Material[])[0]).toBe(print);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('rejects excessive decoded dimensions without changing the print', async () => {
    const { manager, image, print } = fixture();
    const bitmap = { width: 9000, height: 10, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    await expect(manager.replace(new File(['test'], 'test.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'dimensions' });
    expect((image.material as THREE.Material[])[0]).toBe(print);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
