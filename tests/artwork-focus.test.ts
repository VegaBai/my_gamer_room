import { describe, expect, it } from 'vitest';
import { artworkViewport } from '../lib/room/artwork-focus';

describe('wall art preview framing', () => {
  it('reserves the side panel even in a narrow portrait desktop window', () => {
    const rect = artworkViewport(808, 953);
    expect(rect.centerX + rect.width / 2).toBeLessThan(454);
    expect(rect.centerY - rect.height / 2).toBe(104);
  });

  it('reserves the bottom panel and two-row toolbar on a phone', () => {
    const rect = artworkViewport(390, 844);
    expect(rect.centerY + rect.height / 2).toBeLessThan(844 - 112 - 844 * .48);
    expect(rect.centerY - rect.height / 2).toBe(94);
    expect(rect.width).toBe(366);
  });

  it('uses the same width breakpoint as the controls, not viewport aspect', () => {
    expect(artworkViewport(760, 953).centerX).toBe(380);
    expect(artworkViewport(761, 953).centerX).toBeLessThan(250);
    expect(artworkViewport(1440, 640).height).toBe(454);
  });
});
