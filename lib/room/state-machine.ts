import type { ControlDefinition } from './types';

type Listener = (values: Readonly<Record<string, number>>) => void;

interface ActiveTween {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class RoomStateMachine {
  private readonly definitions = new Map<string, ControlDefinition>();
  private readonly authoredDefinitions = new Map<string, ControlDefinition>();
  private readonly values: Record<string, number> = {};
  private readonly tweens = new Map<string, ActiveTween>();
  private readonly listeners = new Set<Listener>();

  constructor(definitions: ControlDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) {
        throw new Error(`Duplicate room control: ${definition.id}`);
      }
      this.definitions.set(definition.id, definition);
      this.authoredDefinitions.set(definition.id, definition);
      this.values[definition.id] = definition.default;
    }
  }

  /** A room layout may narrow an authored mechanism's physical travel. */
  setLimits(limits: Record<string, { min: number; max: number; clickValue: number }>) {
    const next = new Map(this.authoredDefinitions);
    for (const [id, limit] of Object.entries(limits)) {
      const authored = this.authoredDefinitions.get(id);
      if (!authored || ![limit.min, limit.max, limit.clickValue].every(Number.isFinite)
        || limit.min < authored.min || limit.max > authored.max || limit.min > authored.default
        || limit.max < authored.default || limit.clickValue < limit.min || limit.clickValue > limit.max) {
        throw new Error(`Invalid physical limit for ${id}`);
      }
      next.set(id, { ...authored, ...limit });
    }
    this.tweens.clear();
    for (const [id, definition] of next) {
      this.definitions.set(id, definition);
      this.values[id] = clamp(this.values[id], definition.min, definition.max);
    }
    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return { ...this.values };
  }

  getValue(id: string) {
    this.requireDefinition(id);
    return this.values[id];
  }

  getDefinition(id: string) {
    return this.requireDefinition(id);
  }

  isAnimating(id?: string) {
    return id ? this.tweens.has(id) : this.tweens.size > 0;
  }

  toggle(id: string, now: number) {
    const definition = this.requireDefinition(id);
    const active = this.tweens.get(id);
    const currentTarget = active?.to ?? this.values[id];
    const headingToClick = Math.abs(currentTarget - definition.clickValue) < 1e-6;
    this.animateTo(id, headingToClick ? definition.default : definition.clickValue, now);
  }

  animateTo(id: string, target: number, now: number, durationMs?: number) {
    const definition = this.requireDefinition(id);
    const to = clamp(target, definition.min, definition.max);
    const from = this.values[id];
    if (Math.abs(to - from) < 1e-8) {
      this.tweens.delete(id);
      return;
    }
    const authoredTravel = Math.max(1e-8, Math.abs(definition.clickValue - definition.default));
    const remainingRatio = Math.min(1, Math.abs(to - from) / authoredTravel);
    this.tweens.set(id, {
      from,
      to,
      startedAt: now,
      durationMs: Math.max(120, (durationMs ?? definition.durationMs) * Math.max(0.28, remainingRatio)),
    });
  }

  setDirect(id: string, value: number) {
    const definition = this.requireDefinition(id);
    this.tweens.delete(id);
    this.values[id] = clamp(value, definition.min, definition.max);
    this.emit();
  }

  reset(now: number) {
    for (const definition of this.definitions.values()) {
      this.animateTo(definition.id, definition.default, now, Math.min(850, definition.durationMs));
    }
  }

  resetGroup(controlId: string, now: number) {
    const group = this.requireDefinition(controlId).group;
    for (const definition of this.definitions.values()) {
      if (definition.group === group) {
        this.animateTo(definition.id, definition.default, now, Math.min(850, definition.durationMs));
      }
    }
  }

  cancelAll() {
    this.tweens.clear();
  }

  tick(now: number) {
    if (this.tweens.size === 0) return false;
    for (const [id, tween] of this.tweens) {
      const t = clamp((now - tween.startedAt) / tween.durationMs, 0, 1);
      this.values[id] = tween.from + (tween.to - tween.from) * easeInOutCubic(t);
      if (t >= 1) this.tweens.delete(id);
    }
    this.emit();
    return true;
  }

  private requireDefinition(id: string) {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown room control: ${id}`);
    return definition;
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
