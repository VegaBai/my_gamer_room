import { describe, expect, it } from 'vitest';
import { PointerTap } from '../lib/room/pointer-tap';

const event = (values = {}) => ({ pointerId: 1, clientX: 10, clientY: 20, button: 0, isPrimary: true, ...values });

describe('scene object clicks and taps', () => {
  it('accepts a first touch without depending on prior hover', () => {
    const tap = new PointerTap();
    tap.down(event(), 'artwork.change');
    expect(tap.up(event(), 'artwork.change')).toBe('artwork.change');
    expect(tap.up(event(), 'artwork.change')).toBeNull();
  });

  it('rejects a changed target and a drag returning to its starting point', () => {
    const tap = new PointerTap();
    tap.down(event(), 'chair.swivel');
    expect(tap.up(event(), 'artwork.change')).toBeNull();
    tap.down(event(), 'artwork.change');
    tap.move(event({ clientX: 30 }));
    tap.move(event());
    expect(tap.up(event(), 'artwork.change')).toBeNull();
  });

  it('rejects right clicks, secondary pointers, and cancelled gestures', () => {
    const tap = new PointerTap();
    tap.down(event({ button: 2 }), 'artwork.change');
    expect(tap.up(event({ button: 2 }), 'artwork.change')).toBeNull();
    tap.down(event(), 'artwork.change');
    tap.down(event({ pointerId: 2, isPrimary: false }), 'artwork.change');
    expect(tap.up(event(), 'artwork.change')).toBeNull();
    tap.down(event(), 'artwork.change');
    tap.cancel();
    expect(tap.up(event(), 'artwork.change')).toBeNull();
  });

  it('requires the same pointer and a strictly sub-seven-pixel movement', () => {
    const tap = new PointerTap();
    tap.down(event(), 'artwork.change');
    expect(tap.up(event({ pointerId: 3 }), 'artwork.change')).toBeNull();
    tap.down(event(), 'artwork.change');
    expect(tap.up(event({ clientX: 17 }), 'artwork.change')).toBeNull();
    tap.down(event(), 'artwork.change');
    expect(tap.up(event({ clientX: 16 }), 'artwork.change')).toBe('artwork.change');
  });
});
