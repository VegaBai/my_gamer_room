import { describe, expect, it } from 'vitest';
import { overviewFraming } from '../lib/room/overview-framing';

describe('responsive room overview', () => {
  it('keeps the authored desktop lens and expands portrait framing above the controls', () => {
    expect(overviewFraming(39, 1600, 900).fov).toBeCloseTo(39);
    const compact = overviewFraming(39, 1124, 953);
    expect(compact.fov).toBeGreaterThan(50);
    expect(compact.offsetY).toBe(0);
    const mobile = overviewFraming(39, 390, 844);
    expect(mobile.fov).toBeGreaterThan(80); expect(mobile.fov).toBeLessThanOrEqual(88);
    expect(mobile.offsetY).toBeCloseTo(185.68);
    expect(overviewFraming(39, 844, 390).fov).toBeCloseTo(39);
  });
});
