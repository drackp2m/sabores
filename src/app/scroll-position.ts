import { Injectable, signal } from '@angular/core';

import { Venue } from './venues';

/** Longer than any list: everything below the header counts as seen, however far it is. */
const BELOW_HEADER = 1_000_000;
/** How many venues the user must go by, up and down added together, to forget the one to return to. */
const FORGET_AFTER = 3;
/** With no movement for this long, a scroll started by the app has finished. */
const SCROLL_END = 200;
/** Any scroll on the page, whichever element it happens in (see styles/_base.scss). */
const ANY_SCROLL = { capture: true, passive: true };

/** Which venue the scroll is on, in the list or in the gallery. For the visit: it isn't saved. */
@Injectable({ providedIn: 'root' })
export class ScrollPosition {
  /**
   * The first venue on the page with nothing hidden at the top, its margin included. Without a list
   * (in the venue view) it stays as it was; null until it's known.
   */
  readonly current = signal<number | null>(null);
  /** The venue the user went to the map from, to be able to return to it. */
  readonly returnTo = signal<number | null>(null);
  /** Venues gone by since then, without counting what the app scrolls on its own. */
  private goneBy = 0;
  /** Only while a scroll started by the app lasts. */
  private stillness?: ReturnType<typeof setTimeout>;

  leaveFrom(number: number): void {
    this.returnTo.set(number);
    this.goneBy = 0;
  }

  /**
   * The app has just moved the page: until it stops, what goes by isn't the user's doing. Scroll is
   * only listened to meanwhile, and if nothing moves (the map was already in sight) it just expires.
   */
  appScrolled(): void {
    if (this.stillness === undefined) {
      document.addEventListener('scroll', this.waitForStillness, ANY_SCROLL);
    }
    this.waitForStillness();
  }

  private readonly waitForStillness = () => {
    clearTimeout(this.stillness);
    this.stillness = setTimeout(() => {
      this.stillness = undefined;
      document.removeEventListener('scroll', this.waitForStillness, ANY_SCROLL);
    }, SCROLL_END);
  };

  /**
   * Keeps current up to date with the list on the page and returns how to stop. Each venue has its
   * mark (.venue-mark), in the same order, because a card can be taller than the screen: its own top
   * edge wouldn't be noticed. Without listening to scroll: the browser tells when a mark crosses the
   * header, with no JavaScript in between. The area watched goes on far below the screen so that
   * crossing the header is the only way out: otherwise, a mark that jumps from below the screen to
   * above it in one go (scrollbar, End key, landing on a venue) would never be reported. That needs
   * the element that scrolls as the root (null for the document): it clips what's below the screen.
   */
  follow(
    venues: readonly Venue[],
    marks: readonly Element[],
    header: number,
    root: Element | null,
  ): () => void {
    const passed = new Set<Element>();
    let last: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (isIntersecting) passed.delete(target);
          else passed.add(target);
        }
        // With all of them passed there's no first one: it's on the last one.
        const first = marks.findIndex((mark) => !passed.has(mark));
        const index = first < 0 ? marks.length - 1 : first;
        this.current.set(venues[index]?.number ?? null);
        // Nothing has gone by on the first report: what's new is the list, not the scroll.
        this.count(Math.abs(index - (last ?? index)));
        last = index;
      },
      { root, rootMargin: `-${header}px 0px ${BELOW_HEADER}px` },
    );
    for (const mark of marks) observer.observe(mark);
    return () => observer.disconnect();
  }

  private count(venues: number): void {
    if (this.stillness !== undefined) return;
    this.goneBy += venues;
    if (this.goneBy >= FORGET_AFTER) this.returnTo.set(null);
  }
}
