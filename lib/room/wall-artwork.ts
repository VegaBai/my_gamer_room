import * as THREE from 'three';
import { ArtworkError, artworkDrawRect, validateArtworkFile, type ArtworkFit } from './artwork-input';

/** Owns only the isolated print material; frame, screens and furniture are untouched. */
export class WallArtwork {
  private readonly surfaces: Array<{ mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }> = [];
  private material: THREE.MeshBasicMaterial | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private bitmap: ImageBitmap | null = null;
  private request = 0;
  private disposed = false;
  private aspect = 5 / 7;
  private fit: ArtworkFit = 'contain';

  constructor(root: THREE.Object3D) {
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (!materials.some(material => material.name === 'MAT_WallArt_Image') && node.name !== 'art-image-surface') return;
      this.surfaces.push({ mesh: node, original: node.material });
      let current: THREE.Object3D | null = node;
      while (current) {
        const aspect = current.userData.artworkAspect;
        if (typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0) { this.aspect = aspect; break; }
        current = current.parent;
      }
    });
  }

  get available() { return this.surfaces.length > 0; }

  async replace(file: File): Promise<boolean> {
    validateArtworkFile(file);
    if (!this.available || this.disposed) throw new ArtworkError('unavailable');
    const request = ++this.request;
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new ArtworkError('decode'); }
    if (request !== this.request || this.disposed) { bitmap.close(); return false; }
    if (bitmap.width * bitmap.height > 32_000_000 || Math.max(bitmap.width, bitmap.height) > 8192) {
      bitmap.close();
      throw new ArtworkError('dimensions');
    }
    const previous = this.bitmap;
    this.bitmap = bitmap;
    try { this.paint(); }
    catch (error) { this.bitmap = previous; bitmap.close(); throw error; }
    previous?.close();
    return true;
  }

  setFit(fit: ArtworkFit) {
    this.fit = fit;
    if (this.bitmap) this.paint();
  }

  private paint() {
    if (!this.bitmap) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(2048 * Math.min(1, this.aspect));
    canvas.height = Math.round(2048 / Math.max(1, this.aspect));
    const context = canvas.getContext('2d');
    if (!context) throw new ArtworkError('decode');
    context.fillStyle = '#f8f4f0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const rect = artworkDrawRect(this.bitmap.width, this.bitmap.height, canvas.width, canvas.height, this.fit);
    context.drawImage(this.bitmap, rect.x, rect.y, rect.width, rect.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // Matches the independent glTF print surface's UVs.
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.FrontSide });
    material.name = 'MAT_WallArt_UserImage';
    for (const { mesh, original } of this.surfaces) {
      mesh.material = Array.isArray(original)
        ? original.map(part => part.name === 'MAT_WallArt_Image' ? material : part)
        : material;
    }
    this.material?.dispose();
    this.texture?.dispose();
    this.material = material;
    this.texture = texture;
  }

  reset() {
    ++this.request; // Invalidates an in-flight decode before restoring the original.
    for (const { mesh, original } of this.surfaces) mesh.material = original;
    this.material?.dispose();
    this.texture?.dispose();
    this.bitmap?.close();
    this.material = null;
    this.texture = null;
    this.bitmap = null;
  }

  dispose() { this.disposed = true; this.reset(); }
}
