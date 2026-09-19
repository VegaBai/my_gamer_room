import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTROLS, PRIMARY_CONTROL_IDS, BASE_PRIMARY_CONTROL_IDS } from '../lib/room/default-controls';
import { RoomStateMachine } from '../lib/room/state-machine';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('room controls contract', () => {
  it('preserves thirteen base interactions and adds six independent expansion controls', () => {
    expect(BASE_PRIMARY_CONTROL_IDS).toHaveLength(13);
    expect(PRIMARY_CONTROL_IDS).toHaveLength(19);
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
  it('enforces a layout safety stop for sliders, click reversal, demo and reset', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.setLimits({ 'monitors.face': { min: 0, max: 1 / 3, clickValue: 1 / 3 } });
    machine.setDirect('monitors.face', 1);
    expect(machine.getValue('monitors.face')).toBe(1 / 3);
    machine.toggle('monitors.face', 0); machine.tick(2000);
    expect(machine.getValue('monitors.face')).toBe(0);
    machine.animateTo('monitors.face', 1, 2000);
    for (let time = 2000; time <= 4000; time += 20) {
      machine.tick(time); expect(machine.getValue('monitors.face')).toBeLessThanOrEqual(1 / 3);
    }
    machine.setDirect('monitors.leftTrim', 15); machine.setDirect('monitors.rightTilt', 5);
    expect(machine.getValue('monitors.leftTrim')).toBe(15);
    expect(machine.getValue('monitors.rightTilt')).toBe(5);
    machine.reset(4000); machine.tick(6000);
    expect(machine.getValue('monitors.face')).toBe(0);
    expect(DEFAULT_CONTROLS.find(c => c.id === 'monitors.face')!.max).toBe(1);
    expect(() => machine.setLimits({ 'monitors.face': { min: 0, max: 2, clickValue: 2 } })).toThrow();
    expect(machine.getDefinition('monitors.face').max).toBe(1 / 3);
  });
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

  it.each(['cabinet.drawer.1', 'desk.lift', 'chair.swivel', 'microphone.fold', 'monitors.face'])(
    'resets every control in the %s menu without touching other devices', (selectedId) => {
      const machine = new RoomStateMachine(DEFAULT_CONTROLS);
      for (const control of DEFAULT_CONTROLS) machine.setDirect(control.id, control.clickValue);
      const group = machine.getDefinition(selectedId).group;
      const before = machine.snapshot();
      machine.resetGroup(selectedId, 100);
      machine.resetGroup(selectedId, 100);
      expect(machine.snapshot()).toEqual(before);
      machine.tick(1200);
      for (const control of DEFAULT_CONTROLS) expect(machine.getValue(control.id)).toBe(
        control.group === group ? control.default : before[control.id],
      );
    },
  );

  it('reverses an active group while unrelated animation continues unchanged', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('desk.lift', 0);
    machine.toggle('monitors.face', 0);
    machine.tick(300);
    const before = machine.snapshot();
    machine.resetGroup('monitors.leftTilt', 300);
    machine.tick(300);
    expect(machine.snapshot()).toEqual(before);
    expect(machine.isAnimating('desk.lift')).toBe(true);
    machine.tick(1200);
    expect(machine.getValue('monitors.face')).toBe(0);
    expect(machine.getValue('desk.lift')).toBe(1);
  });

  it('local reset cancels future demo steps without resetting the camera or other tweens', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const { RoomEngine } = await import('../lib/room/room-engine');
    const applyCamera = vi.fn();
    const engine = Object.create(RoomEngine.prototype) as InstanceType<typeof RoomEngine>;
    Object.assign(engine, { state: new RoomStateMachine(DEFAULT_CONTROLS), reduceMotion: false,
      demoTimers: new Set(), orbit: { autoRotate: true }, callbacks: { onUserInput: vi.fn() },
      lastInputAt: 0, applyCamera, artworkCamera: { active: false } });
    engine.runDemo();
    await vi.advanceTimersByTimeAsync(0);
    engine.state.setDirect('monitors.leftTilt', 5);
    engine.resetGroup('monitors.face');
    expect(engine.state.isAnimating('desk.lift')).toBe(true);
    expect(engine.state.isAnimating('monitors.leftTilt')).toBe(true);
    expect(applyCamera).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(7000);
    expect(engine.state.isAnimating('cabinet.drawer.1')).toBe(false);
    expect(engine.state.getValue('cabinet.drawer.1')).toBe(0);
    engine.state.tick(performance.now() + 8000);
    expect(engine.state.getValue('desk.lift')).toBe(1);
    expect(engine.state.getValue('monitors.leftTilt')).toBe(0);
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
      artworkCamera: { active: false },
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
