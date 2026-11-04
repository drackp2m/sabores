import { Injectable, signal } from '@angular/core';

import { Venue } from './venues';

/** Longer than any list: an area that goes on this far only has one edge left to cross. */
const FAR = 1_000_000;
/** A whole card in sight. Not 1: with fractional sizes, some browsers never quite get there. */
export const WHOLE = 0.99;

/** Which venue the scroll is on, in the list or in the gallery. For the visit: it isn't saved. */
@Injectable({ providedIn: 'root' })
export class ScrollPosition {
  /**
   * The first venue on the page with nothing hidden at the top, its margin included. Without a list
   * (in the venue view) it stays as it was; null until it's known.
   */
  readonly current = signal<number | null>(null);

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
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (isIntersecting) passed.delete(target);
          else passed.add(target);
        }
        // With all of them passed there's no first one (-1): it's on the last one.
        const first = marks.findIndex((mark) => !passed.has(mark));
        this.current.set(venues.at(first)?.number ?? null);
      },
      { root, rootMargin: `-${header}px 0px ${FAR}px` },
    );
    for (const mark of marks) observer.observe(mark);
    return () => observer.disconnect();
  }
}
