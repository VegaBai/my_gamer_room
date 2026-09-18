import type { ControlDefinition, RoomCameraDefinition } from './types';

export const DEFAULT_CAMERA: RoomCameraDefinition = {
  position: [4.9, 3.05, 6.6],
  target: [0.15, 1.15, -0.55],
  minDistance: 3.5,
  maxDistance: 7.2,
  minPolar: 0.85,
  maxPolar: 1.44,
  minAzimuth: 0.08,
  maxAzimuth: 0.94,
};

export const DEFAULT_CONTROLS: ControlDefinition[] = [
  ...[1, 2, 3, 4].map((index) => ({
    id: `cabinet.drawer.${index}`,
    label: `抽屉 ${index}`,
    group: '收纳柜',
    primary: true,
    min: 0,
    max: 1,
    default: 0,
    clickValue: 1,
    durationMs: 550,
    unit: '%' as const,
  })),
  {
    id: 'cabinet.door', label: '柜门', group: '收纳柜', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 750, unit: '%',
  },
  {
    id: 'desk.lift', label: '桌面高度', group: '升降桌', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 1200, unit: 'cm',
  },
  {
    id: 'chair.swivel', label: '椅身旋转', group: '电竞椅', primary: true,
    min: -45, max: 45, default: 0, clickValue: 45, durationMs: 750, unit: '°',
  },
  {
    id: 'chair.moveX', label: '左右移动', group: '电竞椅', primary: true,
    min: -.35, max: .35, default: 0, clickValue: .25, durationMs: 750, unit: 'cm',
  },
  {
    id: 'chair.moveY', label: '前后移动', group: '电竞椅', primary: true,
    min: -.45, max: .15, default: 0, clickValue: -.35, durationMs: 750, unit: 'cm',
  },
  {
    id: 'chair.headrest', label: '头枕拆装', group: '电竞椅', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 550, unit: '%',
  },
  {
    id: 'chair.lumbar', label: '腰枕拆装', group: '电竞椅', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 550, unit: '%',
  },
  {
    id: 'microphone.fold', label: '折叠程度', group: '话筒臂', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 900, unit: '%',
  },
  {
    id: 'microphone.yaw', label: '底座转向', group: '话筒臂', primary: false,
    min: -30, max: 10, default: 0, clickValue: 10, durationMs: 500, unit: '°',
  },
  {
    id: 'monitors.face', label: '双屏夹角', group: '双屏', primary: true,
    min: 0, max: 1, default: 0, clickValue: 1, durationMs: 900, unit: '°',
  },
  {
    id: 'monitors.leftTrim', label: '左屏微调', group: '双屏', primary: false,
    min: -15, max: 15, default: 0, clickValue: 15, durationMs: 450, unit: '°',
  },
  {
    id: 'monitors.rightTrim', label: '右屏微调', group: '双屏', primary: false,
    min: -15, max: 15, default: 0, clickValue: -15, durationMs: 450, unit: '°',
  },
  {
    id: 'monitors.leftTilt', label: '左屏俯仰', group: '双屏', primary: false,
    min: -5, max: 5, default: 0, clickValue: 5, durationMs: 550, unit: '°',
  },
  {
    id: 'monitors.rightTilt', label: '右屏俯仰', group: '双屏', primary: false,
    min: -5, max: 5, default: 0, clickValue: 5, durationMs: 550, unit: '°',
  },
];

export const PRIMARY_CONTROL_IDS = DEFAULT_CONTROLS
  .filter((control) => control.primary)
  .map((control) => control.id);
