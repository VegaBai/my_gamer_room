import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import { DEFAULT_LANGUAGE, ROOM_COPY, controlLabel, formatControlValue, groupLabel, resolveLanguage, statusLabel } from '../lib/room/i18n';

describe('room display language', () => {
  it('defaults to English, including invalid or absent saved preferences', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    for (const value of [null, undefined, '', 'fr', 'EN', {}]) expect(resolveLanguage(value)).toBe('en');
    expect(resolveLanguage('zh')).toBe('zh');
  });
  it('translates every primary and advanced control without changing its identity', () => {
    const original = JSON.stringify(DEFAULT_CONTROLS);
    for (const language of ['en', 'zh'] as const) for (const control of DEFAULT_CONTROLS) {
      expect(controlLabel(control.id, language)).not.toBe(ROOM_COPY[language].interactivePart);
      expect(groupLabel(control.id, language)).not.toBe(ROOM_COPY[language].interactivePart);
    }
    expect(JSON.stringify(DEFAULT_CONTROLS)).toBe(original);
    expect(JSON.stringify(ROOM_COPY.en)).not.toMatch(/\p{Script=Han}/u);
  });
  it('uses the chosen language for loading, quality, errors and tilt direction', () => {
    const tilt = DEFAULT_CONTROLS.find(control => control.id === 'monitors.leftTilt')!;
    expect(formatControlValue(tilt, 5, 'en')).toBe('Up 5°');
    expect(formatControlValue(tilt, -5, 'zh')).toBe('俯 5°');
    expect(statusLabel({ ready: true, usingBlenderAsset: true, variant: 'low' }, 'en')).toBe('Lightweight');
    for (const stage of Object.keys(ROOM_COPY.en.loading) as Array<keyof typeof ROOM_COPY.en.loading>) {
      expect(ROOM_COPY.zh.loading[stage]).toBeTruthy();
    }
    expect(ROOM_COPY.en.webglError).not.toEqual(ROOM_COPY.zh.webglError);
  });
});
