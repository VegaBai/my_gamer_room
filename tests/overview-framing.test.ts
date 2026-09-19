import { describe, expect, it } from 'vitest';
import { overviewFraming } from '../lib/room/overview-framing';

describe('responsive room overview', () => {
  it('keeps the authored desktop lens and expands portrait framing above the controls', () => {
    expect(overviewFraming(39, 1124, 953)).toEqual({ fov: 39, offsetY: 0 });
    const mobile = overviewFraming(39, 390, 844);
    expect(mobile.fov).toBeGreaterThan(80); expect(mobile.fov).toBeLessThanOrEqual(88);
    expect(mobile.offsetY).toBeCloseTo(185.68);
    expect(overviewFraming(39, 844, 390)).toEqual({ fov: 39, offsetY: 0 });
  });
});
