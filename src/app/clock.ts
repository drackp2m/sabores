import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** The current time. Schedules go by the minute, so it changes as each one starts. */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly time = signal(new Date());
  readonly now = this.time.asReadonly();
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Timers stop on a locked phone or in a background tab: on coming back it would be behind.
    const onReturn = () => {
      if (document.visibilityState === 'visible') this.tick();
    };
    document.addEventListener('visibilitychange', onReturn);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', onReturn);
    });
    this.waitForNextMinute();
  }

  private tick(): void {
    this.time.set(new Date());
    this.waitForNextMinute();
  }

  private waitForNextMinute(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), 60_000 - (Date.now() % 60_000));
  }
}
