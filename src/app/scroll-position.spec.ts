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

  describe('the venue to return to', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => {
      const card = document.createElement('article');
      card.id = id;
      return card;
    });
    const target = cards[0];
    const none: string[] = [];

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function watch() {
      const report = stubIntersections();
      const position = TestBed.inject(ScrollPosition);
      position.leaveFrom(1);
      const stop = position.watchReturn(target, cards, 60, null);
      /**
       * What the browser would say: the cards gone on each side, those whole on the screen, those
       * with just one edge in sight, and whether the target is whole.
       */
      const page = ({
        above = none,
        below = none,
        shown = none,
        top = none,
        bottom = none,
        whole = false,
      } = {}) =>
        report(
          (card, side) => (side === 'above' ? above : below).includes(card.id),
          (card) => (card === target ? whole : shown.includes(card.id)),
          (card, edge) => (edge === 'top' ? top : bottom).includes(card.id),
        );
      const appMoves = () => {
        position.appScrolled();
        document.dispatchEvent(new Event('scroll'));
      };
      const pageStops = () => vi.advanceTimersByTime(200);
      /** The list on the page, with the app having taken the target out of sight. */
      const offered = () => {
        page();
        appMoves();
        pageStops();
      };
      return { position, stop, page, appMoves, pageStops, offered };
    }

    describe('is offered', () => {
      it('once a scroll of the app has left it out of sight', () => {
        const { position, page, appMoves, pageStops } = watch();
        page({ whole: true });
        appMoves();
        page();
        expect(position.canReturn()).toBe(false);
        pageStops();
        expect(position.canReturn()).toBe(true);
      });

      it('not if that scroll hasn’t moved anything, even with its card cut off', () => {
        const { position, page, pageStops } = watch();
        page();
        position.appScrolled();
        pageStops();
        expect(position.canReturn()).toBe(false);
      });

      it('not if the scroll leaves it in sight', () => {
        const { position, page, appMoves, pageStops } = watch();
        page({ whole: true });
        appMoves();
        pageStops();
        expect(position.canReturn()).toBe(false);
      });

      it('not if it’s the user who loses sight of it', () => {
        const { position, page, pageStops } = watch();
        page({ whole: true });
        page();
        pageStops();
        expect(position.canReturn()).toBe(false);
      });

      it('only when the page stops, however long the scroll takes', () => {
        const { position, page, appMoves } = watch();
        page();
        appMoves();
        vi.advanceTimersByTime(150);
        document.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(150);
        expect(position.canReturn()).toBe(false);
        vi.advanceTimersByTime(50);
        expect(position.canReturn()).toBe(true);
      });

      it('again if another scroll of the app leaves it out of sight', () => {
        const { position, page, appMoves, pageStops, offered } = watch();
        offered();
        appMoves();
        page({ whole: true });
        pageStops();
        expect(position.canReturn()).toBe(false);
        expect(position.returnTo()).toBe(1);

        appMoves();
        page();
        pageStops();
        expect(position.canReturn()).toBe(true);
      });
    });

    describe('is forgotten', () => {
      it('if the user brings it back into sight once offered', () => {
        const { position, page, offered } = watch();
        offered();
        page({ whole: true });
        expect(position.returnTo()).toBeNull();
      });

      it('not if the user brings it back before it was ever offered', () => {
        const { position, page } = watch();
        page();
        page({ whole: true });
        expect(position.returnTo()).toBe(1);
      });

      it('after three different venues shown go out of sight on one side', () => {
        const { position, page, offered } = watch();
        offered();
        page({ shown: ['b', 'c', 'd'] });
        page({ above: ['b'] });
        page({ above: ['b', 'c'] });
        expect(position.returnTo()).toBe(1);
        page({ above: ['b', 'c', 'd'] });
        expect(position.returnTo()).toBeNull();
      });

      it('on the side below as well', () => {
        const { position, page } = watch();
        page({ shown: ['b', 'c', 'd'] });
        page({ below: ['b', 'c', 'd'] });
        expect(position.returnTo()).toBeNull();
      });

      it('also before being offered', () => {
        const { position, page } = watch();
        page({ shown: ['b', 'c', 'd'] });
        page({ above: ['b', 'c', 'd'] });
        expect(position.returnTo()).toBeNull();
      });

      it('not with the venues split between both sides', () => {
        const { position, page } = watch();
        page({ shown: ['b', 'c', 'd', 'e'] });
        page({ above: ['b', 'c'], below: ['d', 'e'] });
        expect(position.returnTo()).toBe(1);
      });

      it('not by losing sight of the same one over and over', () => {
        const { position, page, offered } = watch();
        offered();
        for (let i = 0; i < 5; i++) {
          page({ shown: ['b'] });
          page({ above: ['b'] });
        }
        expect(position.returnTo()).toBe(1);
      });

      it('the ones that come back into sight still count', () => {
        const { position, page, offered } = watch();
        offered();
        page({ shown: ['b'] });
        page({ above: ['b'] });
        page({ shown: ['b', 'c'] });
        page({ above: ['c'] });
        page({ shown: ['c', 'd'] });
        page({ above: ['d'] });
        expect(position.returnTo()).toBeNull();
      });

      it('without counting the ones that only peeked out', () => {
        const { position, page, offered } = watch();
        offered();
        page({ top: ['b', 'c', 'd', 'e'] });
        page({ below: ['b', 'c', 'd', 'e'] });
        page({ bottom: ['b', 'c', 'd', 'e'] });
        page({ above: ['b', 'c', 'd', 'e'] });
        expect(position.returnTo()).toBe(1);
      });

      it('counting the ones too tall to be whole once both edges have been in sight', () => {
        const { position, page, offered } = watch();
        offered();
        page({ top: ['b', 'c', 'd'] });
        page({ bottom: ['b', 'c', 'd'] });
        page({ above: ['b', 'c', 'd'] });
        expect(position.returnTo()).toBeNull();
      });

      it('without counting the venue itself', () => {
        const { position, page, offered } = watch();
        offered();
        page({ shown: ['b', 'c'] });
        page({ above: ['a', 'b', 'c'] });
        expect(position.returnTo()).toBe(1);
      });

      it('without counting what the app scrolls, which has to be shown again', () => {
        const { position, page, appMoves, pageStops } = watch();
        page({ shown: ['b', 'c', 'd', 'e'] });
        appMoves();
        page({ above: ['b', 'c', 'd', 'e'] });
        pageStops();
        page();
        page({ above: ['b', 'c', 'd', 'e'] });
        expect(position.returnTo()).toBe(1);
      });

      it('counting a venue the app lands on as shown', () => {
        const { position, page, appMoves, pageStops } = watch();
        appMoves();
        page({ shown: ['b', 'c', 'd'] });
        pageStops();
        page({ above: ['b', 'c', 'd'] });
        expect(position.returnTo()).toBeNull();
      });

      it('and the count goes on if the list changes, but starts over with each venue', () => {
        const { position, stop, page, offered } = watch();
        offered();
        page({ shown: ['b', 'c', 'd'] });
        page({ above: ['b', 'c'], shown: ['d'] });
        stop();
        const stopAgain = position.watchReturn(target, cards, 60, null);
        page({ shown: ['d'] });
        page({ above: ['d'] });
        expect(position.returnTo()).toBeNull();

        stopAgain();
        position.leaveFrom(2);
        position.watchReturn(target, cards, 60, null);
        page({ shown: ['b', 'c'] });
        page({ above: ['b', 'c'] });
        expect(position.returnTo()).toBe(2);
      });
    });
  });
});
