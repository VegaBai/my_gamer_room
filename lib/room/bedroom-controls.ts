import type { ControlDefinition } from './types';

const items = [
  ['trash.open', '脚踏桶盖', '垃圾桶', 0, 1],
  ['trash.liner', '取出内桶', '垃圾桶', 0, 1],
  ['nightstand.drawer', '床头柜抽屉', '床头柜', 0, 1],
  ['bedsideLamp.power', '床头灯', '床头灯', 1, 0],
  ['closet.open', '浴室推拉门', '浴室', 0, 1],
  ['entry.open', '房门', '房门', 0, 1],
  ['guitar.take', '取下吉他', '吉他', 0, 1],
  ['coat.take', '取下外套', '衣帽架', 0, 1],
  ['plush.lift', '拿起抱枕', '单人床', 0, 1],
] as const;

export const BEDROOM_CONTROLS: ControlDefinition[] = items.map(([id, label, group, initial, click]) => ({
  id, label, group, primary: true, min: 0, max: 1, default: initial, clickValue: click,
  durationMs: id === 'bedsideLamp.power' ? 250 : 1100, unit: '%',
}));
export const isBedroomControl = (id: string) => BEDROOM_CONTROLS.some(c => c.id === id);

