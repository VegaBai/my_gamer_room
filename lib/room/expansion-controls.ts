import type { ControlDefinition } from './types';

export const EXPANSION_CONTROLS: ControlDefinition[] = [
  { id: 'blinds.tilt', label: '叶片角度', group: '百叶窗', primary: true,
    min: -70, max: 70, default: 30, clickValue: -70, durationMs: 700, unit: '°' },
  { id: 'blinds.raise', label: '百叶升降', group: '百叶窗', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 1500, unit: '%' },
  { id: 'floorLamp.power', label: '落地灯', group: '落地灯', primary: true,
    min: 0, max: 1, default: 1, clickValue: 0, durationMs: 250 },
  { id: 'bookshelf.leftDoor', label: '书架左柜门', group: '书架', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 850, unit: '%' },
  { id: 'bookshelf.rightDoor', label: '书架右柜门', group: '书架', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 850, unit: '%' },
  { id: 'bookshelf.lights', label: '书架氛围灯', group: '书架', primary: true,
    min: 0, max: 1, default: 1, clickValue: 0, durationMs: 250 },
];

export const EXPANSION_CONTROL_IDS = EXPANSION_CONTROLS.map(control => control.id);
export const isExpansionControl = (id: string | null): boolean => id !== null && EXPANSION_CONTROL_IDS.includes(id);
export const isPowerControl = (id: string): boolean => id === 'floorLamp.power' || id === 'bookshelf.lights';
