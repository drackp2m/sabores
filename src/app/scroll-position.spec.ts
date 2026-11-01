import { TestBed } from '@angular/core/testing';

import { stubIntersections } from '../testing/intersections';
import { testVenue } from '../testing/venue';
import { ScrollPosition } from './scroll-position';

describe('ScrollPosition', () => {
  const venues = [3, 1, 2, 6, 5, 4].map((number) => testVenue({ number }));
  const marks = venues.map(() => document.createElement('span'));

  function follow() {
    const report = stubIntersections();
    const position = TestBed.inject(ScrollPosition);
    const stop = position.follow(venues, marks, 60, null);
    const passed = (count: number) => report((mark) => marks.indexOf(mark as HTMLElement) < count);
    return { position, stop, passed };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('doesn’t know the venue until the browser tells', () => {
    const { position } = follow();
    expect(position.current()).toBeNull();
  });

  it('is the first venue in the list order whose mark hasn’t gone under the header', () => {
    const { position, passed } = follow();
    passed(0);
    expect(position.current()).toBe(3);
    passed(1);
    expect(position.current()).toBe(1);
    passed(2);
    expect(position.current()).toBe(2);
    passed(1);
    expect(position.current()).toBe(1);
  });

  it('stays on the last one with all of them passed', () => {
    const { position, passed } = follow();
    passed(6);
    expect(position.current()).toBe(4);
  });

  it('keeps the venue after it stops following', () => {
    const { position, stop, passed } = follow();
    passed(1);
    stop();
    passed(2);
    expect(position.current()).toBe(1);
  });

  describe('the venue to return to', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is forgotten after going by three venues, adding up both directions', () => {
      const { position, passed } = follow();
      passed(3);
      position.leaveFrom(6);
      passed(1);
      expect(position.returnTo()).toBe(6);
      passed(2);
      expect(position.returnTo()).toBeNull();
    });

    it('is forgotten after three venues in one go', () => {
      const { position, passed } = follow();
      passed(0);
      position.leaveFrom(3);
      passed(3);
      expect(position.returnTo()).toBeNull();
    });

    it('doesn’t count what the app scrolls, however far, until it stops', () => {
      const { position, passed } = follow();
      passed(5);
      position.leaveFrom(4);
      position.appScrolled();
      passed(0);
      expect(position.returnTo()).toBe(4);

      vi.advanceTimersByTime(200);
      passed(2);
      expect(position.returnTo()).toBe(4);
      passed(3);
      expect(position.returnTo()).toBeNull();
    });

    it('waits for the page to stop, not just for a while', () => {
      const { position, passed } = follow();
      passed(5);
      position.leaveFrom(4);
      position.appScrolled();
      vi.advanceTimersByTime(150);
      document.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(150);
      passed(0);
      expect(position.returnTo()).toBe(4);
    });

    it('doesn’t count the list changing', () => {
      const { position, stop, passed } = follow();
      passed(0);
      position.leaveFrom(3);
      stop();
      position.follow(venues, marks, 60, null);
      passed(5);
      expect(position.returnTo()).toBe(3);
    });

    it('starts counting again with each venue', () => {
      const { position, passed } = follow();
      passed(0);
      position.leaveFrom(3);
      passed(2);
      position.leaveFrom(2);
      passed(4);
      expect(position.returnTo()).toBe(2);
    });
  });
});
