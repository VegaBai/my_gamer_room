export const WALLPAPERS = [
  { id: 'linen', en: 'Ivory linen', zh: '米白亚麻', color: '#eeeae4' },
  { id: 'pinstripe', en: 'Quiet pinstripes', zh: '雾粉细条', color: '#eee6e5' },
  { id: 'diamond', en: 'Soft diamond weave', zh: '浅灰菱格', color: '#e5e9e8' },
  { id: 'plain', en: 'Warm porcelain', zh: '暖白素面', color: '#f0ece6' },
] as const;
export type WallpaperId = typeof WALLPAPERS[number]['id'];
export const WALLPAPER_STORAGE_KEY = 'gamer-room.wallpaper';
export const resolveWallpaper = (value: unknown): WallpaperId => WALLPAPERS.some(item => item.id === value) ? value as WallpaperId : 'linen';
