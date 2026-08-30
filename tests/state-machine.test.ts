import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTROLS, PRIMARY_CONTROL_IDS } from '../lib/room/default-controls';
import { RoomStateMachine } from '../lib/room/state-machine';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('room controls contract', () => {
  it('exposes exactly eleven primary click interactions with unique ids', () => {
    expect(PRIMARY_CONTROL_IDS).toHaveLength(11);
    expect(new Set(DEFAULT_CONTROLS.map((control) => control.id)).size).toBe(DEFAULT_CONTROLS.length);
    for (const control of DEFAULT_CONTROLS) {
      expect(control.default).toBeGreaterThanOrEqual(control.min);
      expect(control.default).toBeLessThanOrEqual(control.max);
      expect(control.clickValue).toBeGreaterThanOrEqual(control.min);
      expect(control.clickValue).toBeLessThanOrEqual(control.max);
    }
  });
});

describe('RoomStateMachine', () => {
  it('plays a click action to its authored end state', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('cabinet.drawer.1', 0);
    expect(machine.tick(275)).toBe(true);
    expect(machine.getValue('cabinet.drawer.1')).toBeCloseTo(.5, 6);
    machine.tick(550);
    expect(machine.getValue('cabinet.drawer.1')).toBe(1);
    expect(machine.isAnimating('cabinet.drawer.1')).toBe(false);
  });

  it('reverses from the current tween value without a jump', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('cabinet.door', 0);
    machine.tick(300);
    const beforeReverse = machine.getValue('cabinet.door');
    machine.toggle('cabinet.door', 300);
    expect(machine.getValue('cabinet.door')).toBe(beforeReverse);
    machine.tick(300);
    expect(machine.getValue('cabinet.door')).toBe(beforeReverse);
    machine.tick(511);
    expect(machine.getValue('cabinet.door')).toBe(0);
    expect(machine.isAnimating('cabinet.door')).toBe(false);
  });

  it('lets a slider take over and cancel the active tween', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('desk.lift', 0);
    machine.tick(400);
    machine.setDirect('desk.lift', .63);
    expect(machine.isAnimating('desk.lift')).toBe(false);
    expect(machine.getValue('desk.lift')).toBe(.63);
    machine.tick(2000);
    expect(machine.getValue('desk.lift')).toBe(.63);
  });

  it('runs independent mechanisms concurrently', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('desk.lift', 0);
    machine.toggle('microphone.fold', 0);
    machine.toggle('chair.swivel', 0);
    machine.tick(450);
    expect(machine.getValue('desk.lift')).toBeGreaterThan(0);
    expect(machine.getValue('microphone.fold')).toBe(.5);
    expect(machine.getValue('chair.swivel')).toBeGreaterThan(22);

    machine.setDirect('desk.lift', .42);
    expect(machine.isAnimating('desk.lift')).toBe(false);
    expect(machine.isAnimating('microphone.fold')).toBe(true);
    expect(machine.isAnimating('chair.swivel')).toBe(true);

    machine.tick(1200);
    expect(machine.getValue('desk.lift')).toBe(.42);
    expect(machine.getValue('microphone.fold')).toBe(1);
    expect(machine.getValue('chair.swivel')).toBe(45);
  });

  it('smoothly resets a mixture of active tweens and slider-owned values', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('desk.lift', 0);
    machine.toggle('microphone.fold', 0);
    machine.tick(300);
    machine.setDirect('chair.swivel', -20);
    machine.setDirect('cabinet.door', 100);
    expect(machine.getValue('cabinet.door')).toBe(1);

    const beforeReset = machine.snapshot();
    machine.reset(300);
    expect(machine.snapshot()).toEqual(beforeReset);
    machine.tick(300);
    expect(machine.snapshot()).toEqual(beforeReset);

    machine.tick(1500);
    for (const control of DEFAULT_CONTROLS) {
      expect(machine.getValue(control.id)).toBe(control.default);
    }
    expect(machine.isAnimating()).toBe(false);
  });

  it('rejects unknown controls', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    expect(() => machine.toggle('unknown.control', 0)).toThrow('Unknown room control');
  });

  it('cancels every pending demo step when direct user input takes over', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    });

    const { RoomEngine } = await import('../lib/room/room-engine');
    const callbacks = {
      onProgress: vi.fn(),
      onReady: vi.fn(),
      onSelect: vi.fn(),
      onHover: vi.fn(),
      onValues: vi.fn(),
      onUserInput: vi.fn(),
    };
    const engine = Object.create(RoomEngine.prototype) as InstanceType<typeof RoomEngine>;
    Object.assign(engine as unknown as Record<string, unknown>, {
      state: new RoomStateMachine(DEFAULT_CONTROLS),
      reduceMotion: false,
      demoTimers: new Set<ReturnType<typeof setTimeout>>(),
      orbit: { autoRotate: true },
      callbacks,
      lastInputAt: 0,
    });

    engine.runDemo();
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.state.isAnimating('desk.lift')).toBe(true);

    engine.setControl('desk.lift', .37);
    expect(engine.state.getValue('desk.lift')).toBe(.37);
    expect(engine.state.isAnimating()).toBe(false);

    await vi.advanceTimersByTimeAsync(7000);
    expect(engine.state.getValue('desk.lift')).toBe(.37);
    for (const control of DEFAULT_CONTROLS) {
      if (control.id !== 'desk.lift') expect(engine.state.getValue(control.id)).toBe(control.default);
    }
    expect(engine.state.isAnimating()).toBe(false);
    expect(callbacks.onUserInput).toHaveBeenCalledTimes(2);
  });
});
