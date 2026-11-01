import { TestBed } from '@angular/core/testing';

import { Clock } from './clock';

describe('Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 40, 500));
  });
  afterEach(() => vi.useRealTimers());

  const seconds = (clock: Clock) => clock.now().getTime() / 1000;

  it('changes as each minute starts, whenever it was started', () => {
    const clock = TestBed.inject(Clock);
    const start = seconds(clock);

    vi.advanceTimersByTime(19_400);
    expect(seconds(clock)).toBe(start);
    vi.advanceTimersByTime(100);
    expect(clock.now()).toEqual(new Date(2026, 9, 15, 12, 1));

    vi.advanceTimersByTime(59_900);
    expect(clock.now()).toEqual(new Date(2026, 9, 15, 12, 1));
    vi.advanceTimersByTime(100);
    expect(clock.now()).toEqual(new Date(2026, 9, 15, 12, 2));
  });

  it('catches up on returning to the page, and stays on the minute', () => {
    const clock = TestBed.inject(Clock);
    // The phone was locked: time went by, but no timer ran.
    vi.setSystemTime(new Date(2026, 9, 15, 12, 30, 15));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.now()).toEqual(new Date(2026, 9, 15, 12, 30, 15));

    vi.advanceTimersByTime(45_000);
    expect(clock.now()).toEqual(new Date(2026, 9, 15, 12, 31));
  });

  it('leaves no timer behind on being destroyed', () => {
    TestBed.inject(Clock);
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });
});
