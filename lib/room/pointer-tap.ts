type PointerSample = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button' | 'isPrimary'>;

/** A click/tap must start and end on the same target, without orbiting or pinching. */
export class PointerTap {
  private start: { id: number; x: number; y: number; target: string } | null = null;

  down(event: PointerSample, target: string | null) {
    if (this.start || !event.isPrimary || event.button !== 0 || !target) {
      this.cancel();
      return;
    }
    this.start = { id: event.pointerId, x: event.clientX, y: event.clientY, target };
  }

  move(event: PointerSample) {
    if (this.start && event.pointerId === this.start.id
      && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) >= 7) this.cancel();
  }

  up(event: PointerSample, target: string | null): string | null {
    const start = this.start;
    this.cancel();
    return start && event.isPrimary && event.button === 0 && event.pointerId === start.id
      && target === start.target && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7
      ? target : null;
  }

  cancel() { this.start = null; }
}
