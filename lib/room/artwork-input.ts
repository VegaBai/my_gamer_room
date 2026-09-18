export type ArtworkFit = 'contain' | 'cover';
export const ARTWORK_INTERACTION_ID = 'artwork.change';
export type ArtworkErrorCode = 'type' | 'size' | 'decode' | 'dimensions' | 'unavailable';
export class ArtworkError extends Error {
  constructor(readonly code: ArtworkErrorCode) { super(code); }
}

export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateArtworkFile(file: Pick<File, 'type' | 'size'>) {
  if (!IMAGE_TYPES.has(file.type)) throw new ArtworkError('type');
  if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) throw new ArtworkError('size');
}

/** Centered, aspect-preserving drawing rectangle. Negative offsets crop; never stretch. */
export function artworkDrawRect(width: number, height: number, targetWidth: number, targetHeight: number, fit: ArtworkFit) {
  if (![width, height, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new ArtworkError('dimensions');
  }
  const scale = (fit === 'cover' ? Math.max : Math.min)(targetWidth / width, targetHeight / height);
  return { x: (targetWidth - width * scale) / 2, y: (targetHeight - height * scale) / 2, width: width * scale, height: height * scale };
}
