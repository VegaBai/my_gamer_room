import type { Vec3 } from './types';

/** Camera directions are glTF Y-up, pointing from the object into the room. */
export const FURNITURE_INSPECTIONS: Record<string, { key: string; parts: string[]; backward: Vec3 }> = {
  'trash.open': { key: 'bin', parts: ['t01-bin-body','t02-bin-lid','t03-bin-pedal','t04-bin-liner'], backward: [1,.7,1.5] },
  'nightstand.drawer': { key: 'nightstand', parts: ['n01-carcass','n02-drawer','n03-handle','n04-slide-carriage'], backward: [1,.6,.25] },
  'bedsideLamp.power': { key: 'lamp', parts: ['l01-lamp-base','l02-lampshade','l03-bulb'], backward: [1,.5,.4] },
  'guitar.take': { key: 'guitar', parts: ['g01-guitar','g02-guitar-stand'], backward: [1,.4,1.5] },
  'coat.take': { key: 'coat', parts: ['c01-coat-rack','c02-pink-coat','c03-hat','c04-bag','c05-shoes'], backward: [-1,.25,.4] },
  'plush.lift': { key: 'bed', parts: ['b01-bed-frame','b02-mattress','b03-duvet','b04-pillow','b05-peach-cat'], backward: [.2,.85,-1] },
  'closet.open': { key: 'closet', parts: ['d01-closet-frame','d02-closet-leaf'], backward: [0,.15,-1] },
  'entry.open': { key: 'entry', parts: ['d03-entry-frame','d04-entry-leaf'], backward: [-1,.2,-.35] },
};
FURNITURE_INSPECTIONS['trash.liner'] = FURNITURE_INSPECTIONS['trash.open'];
