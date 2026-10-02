import * as THREE from 'three';
import { ArtworkError, artworkDrawRect, validateArtworkFile, type ArtworkFit } from './artwork-input';

export const PHOTO_SLOTS = ['seaside', 'mountain', 'city'] as const;
export const PHOTO_WALL_INTERACTION_ID = 'photo-wall.inspect';

export function registerPhotoWallInteraction(root: THREE.Object3D, hits: THREE.Object3D[], visuals: Map<string, THREE.Object3D[]>) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.layers.enable(2);
    object.userData.controlId = PHOTO_WALL_INTERACTION_ID;
    hits.push(object);
  });
  visuals.set(PHOTO_WALL_INTERACTION_ID, [root]);
}
export type PhotoSlot = typeof PHOTO_SLOTS[number];
export interface PhotoRecord { blob: Blob; name: string; fit: ArtworkFit }
export interface PhotoStore {
  get(id: PhotoSlot): Promise<PhotoRecord | undefined>;
  put(id: PhotoSlot, value: PhotoRecord): Promise<void>;
  remove(id: PhotoSlot): Promise<void>;
}
export interface PhotoStatus { id: PhotoSlot; name: string; fit: ArtworkFit; saved: boolean }

/** Images stay in this browser's IndexedDB; no network request is made. */
export class LocalPhotoStore implements PhotoStore {
  private async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vega-room-photo-wall', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Photo storage blocked'));
    });
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('photos', mode);
      const request = operation(transaction.objectStore('photos'));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error ?? Error('Photo storage failed')); };
    });
  }
  get(id: PhotoSlot) { return this.run<PhotoRecord | undefined>('readonly', store => store.get(id)); }
  async put(id: PhotoSlot, value: PhotoRecord) { await this.run('readwrite', store => store.put(value, id)); }
  async remove(id: PhotoSlot) { await this.run('readwrite', store => store.delete(id)); }
}

interface Surface {
  mesh: THREE.Mesh; original: THREE.Material | THREE.Material[];
  request: number; bitmap?: ImageBitmap; record?: PhotoRecord;
  texture?: THREE.CanvasTexture; material?: THREE.MeshStandardMaterial; saved: boolean;
}

export class PhotoWall {
  private readonly surfaces = new Map<PhotoSlot, Surface>();
  private disposed = false;
  constructor(readonly root: THREE.Object3D, private readonly storage: PhotoStore = new LocalPhotoStore()) {
    root.traverse(mesh => {
      const id = mesh.userData.photoSlot as PhotoSlot;
      if (!(mesh instanceof THREE.Mesh) || !PHOTO_SLOTS.includes(id) || !mesh.geometry.getAttribute('uv1')) return;
      this.surfaces.set(id, { mesh, original: mesh.material, request: 0, saved: true });
    });
  }
  get available() { return this.surfaces.size === 3; }
  get status(): PhotoStatus[] {
    return PHOTO_SLOTS.filter(id => this.surfaces.has(id)).map(id => {
      const s = this.surfaces.get(id)!;
      return { id, name: s.record?.name ?? '', fit: s.record?.fit ?? 'cover', saved: s.saved };
    });
  }
  private surface(id: PhotoSlot) {
    const s = this.surfaces.get(id);
    if (!s || this.disposed) throw new ArtworkError('unavailable');
    return s;
  }
  async restore() {
    await Promise.all(PHOTO_SLOTS.map(async id => {
      try {
        const record = await this.storage.get(id);
        if (record && !this.disposed) await this.apply(id, record, false);
      } catch { /* Original scenery remains usable without browser storage. */ }
    }));
  }
  replace(id: PhotoSlot, file: File) {
    validateArtworkFile(file);
    return this.apply(id, { blob: file, name: file.name, fit: this.surface(id).record?.fit ?? 'cover' }, true);
  }
  private async apply(id: PhotoSlot, record: PhotoRecord, persist: boolean) {
    const s = this.surface(id), request = ++s.request;
    validateArtworkFile(record.blob);
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(record.blob, { imageOrientation: 'from-image' }); }
    catch { throw new ArtworkError('decode'); }
    if (request !== s.request || this.disposed) { bitmap.close(); return false; }
    if (bitmap.width * bitmap.height > 32_000_000 || Math.max(bitmap.width, bitmap.height) > 8192) {
      bitmap.close(); throw new ArtworkError('dimensions');
    }
    const old = s.bitmap, previous = s.record;
    s.bitmap = bitmap; s.record = { ...record, fit: record.fit === 'contain' ? 'contain' : 'cover' };
    try { this.paint(s); }
    catch (error) { s.bitmap = old; s.record = previous; bitmap.close(); throw error; }
    old?.close(); s.saved = true;
    if (persist) {
      try { await this.storage.put(id, s.record); }
      catch { if (request === s.request) s.saved = false; }
    }
    return request === s.request && !this.disposed;
  }
  private paint(s: Surface) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx || !s.bitmap || !s.record) throw new ArtworkError('decode');
    ctx.fillStyle = '#f8f4f0'; ctx.fillRect(0, 0, 1024, 1024);
    const rect = artworkDrawRect(s.bitmap.width, s.bitmap.height, 1024, 1024, s.record.fit);
    ctx.drawImage(s.bitmap, rect.x, rect.y, rect.width, rect.height);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; texture.channel = 1; texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .52, metalness: 0 });
    material.name = 'User_Photo_' + s.mesh.userData.photoSlot;
    s.mesh.material = material; s.material?.dispose(); s.texture?.dispose(); s.material = material; s.texture = texture;
  }
  async setFit(id: PhotoSlot, fit: ArtworkFit) {
    const s = this.surface(id);
    if (!s.record) return;
    s.record = { ...s.record, fit }; this.paint(s);
    try { await this.storage.put(id, s.record); s.saved = true; } catch { s.saved = false; }
  }
  private clear(s: Surface) {
    ++s.request; s.mesh.material = s.original; s.bitmap?.close(); s.material?.dispose(); s.texture?.dispose();
    s.bitmap = undefined; s.record = undefined; s.material = undefined; s.texture = undefined; s.saved = true;
  }
  async reset(id: PhotoSlot) {
    const s = this.surface(id); this.clear(s);
    try { await this.storage.remove(id); } catch { s.saved = false; }
  }
  dispose() { this.disposed = true; for (const s of this.surfaces.values()) this.clear(s); }
}
