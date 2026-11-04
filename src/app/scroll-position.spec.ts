import { TestBed } from '@angular/core/testing';

import { stubIntersections } from '../testing/intersections';
import { testVenue } from '../testing/venue';
import { ScrollPosition } from './scroll-position';

describe('ScrollPosition', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('the current venue', () => {
    const venues = [3, 1, 2].map((number) => testVenue({ number }));
    const marks = venues.map(() => document.createElement('span'));

    function follow() {
      const report = stubIntersections();
      const position = TestBed.inject(ScrollPosition);
      const stop = position.follow(venues, marks, 60, null);
      const passed = (count: number) =>
        report((mark) => marks.indexOf(mark as HTMLElement) < count);
      return { position, stop, passed };
    }

    it('isn’t known until the browser tells', () => {
      const { position } = follow();
      expect(position.current()).toBeNull();
    });

    it('is the first in the list order whose mark hasn’t gone under the header', () => {
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
      passed(3);
      expect(position.current()).toBe(2);
    });

    it('stays as it was after it stops following', () => {
      const { position, stop, passed } = follow();
      passed(1);
      stop();
      passed(2);
      expect(position.current()).toBe(1);
    });
  });
});
