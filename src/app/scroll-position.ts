import { Injectable, computed, signal } from '@angular/core';

import { remInPx } from './media';
import { Venue } from './venues';

/** Longer than any list: an area that goes on this far only has one edge left to cross. */
const FAR = 1_000_000;
/** How many different venues must go out of sight on one side to forget the one to return to. */
const FORGET_AFTER = 3;
/** A whole card in sight. Not 1: with fractional sizes, some browsers never quite get there. */
const WHOLE = 0.99;
/** In px: the browser tells when a card crosses an edge, but rounds where that edge is. */
const SNAP = 1;
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
  /** Whether that venue is in sight, whole and with its margins; null until it's known. */
  private readonly inView = signal<boolean | null>(null);
  /** The app has moved the list and left it out of sight: if the user does it, they know the way. */
  private readonly away = signal(false);
  /** Whether to offer going back to it. */
  readonly canReturn = computed(() => this.away() && this.inView() === false);
  /** The different venues the user has lost sight of since then, on each side of the screen. */
  private readonly lost = { above: new Set<string>(), below: new Set<string>() };
  /** Only while a scroll started by the app lasts. */
  private stillness?: ReturnType<typeof setTimeout>;
  /** That scroll has really moved something (on desktop, going to the map doesn't move the list). */
  private moved = false;

  leaveFrom(number: number): void {
    this.returnTo.set(number);
    this.inView.set(null);
    this.away.set(false);
    this.lost.above.clear();
    this.lost.below.clear();
    this.moved = false;
  }

  /**
   * The app has just moved the page: until it stops, what happens isn't the user's doing. Scroll is
   * only listened to meanwhile, and if nothing moves (the map was already in sight) it just expires.
   */
  appScrolled(): void {
    if (this.stillness === undefined) {
      document.addEventListener('scroll', this.onScroll, ANY_SCROLL);
    }
    this.waitForStillness();
  }

  private readonly onScroll = () => {
    this.moved = true;
    this.waitForStillness();
  };

  private waitForStillness(): void {
    clearTimeout(this.stillness);
    this.stillness = setTimeout(() => {
      this.stillness = undefined;
      document.removeEventListener('scroll', this.onScroll, ANY_SCROLL);
      if (this.moved && this.inView() === false) this.away.set(true);
      this.moved = false;
    }, SCROLL_END);
  }

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

  /**
   * While there's a venue to return to, watches its card and the rest of the list, and returns how
   * to stop. The user forgets it by bringing it back into sight once it's been offered, or by losing
   * sight of FORGET_AFTER other venues on the same side. What the app scrolls doesn't count for
   * either of them.
   */
  watchReturn(
    card: Element,
    cards: readonly Element[],
    header: number,
    root: Element | null,
  ): () => void {
    const margin = remInPx();
    const sight = new IntersectionObserver(
      (entries) => {
        const inView = entries.at(-1)!.intersectionRatio >= WHOLE;
        const back = inView && this.inView() === false && this.away();
        if (back && this.stillness === undefined) this.returnTo.set(null);
        this.inView.set(inView);
      },
      { root, rootMargin: `-${header + margin}px 0px -${margin}px`, threshold: WHOLE },
    );
    sight.observe(card);
    const others = cards.filter((other) => other !== card);
    const observers = [sight, ...this.countLost(others, header, root)];
    return () => observers.forEach((observer) => observer.disconnect());
  }

  /**
   * Cards that were shown and then left the area completely: one that starts to be cut off is still
   * in it, and one that only peeked out wasn't shown. Shown means with both edges in sight, at once
   * or not, because a card can be taller than the screen. Each area has a single edge, so a card is
   * reported when either of its own crosses one. While the app scrolls nothing counts as lost, but
   * what it leaves on the screen has been shown.
   */
  private countLost(
    cards: readonly Element[],
    header: number,
    root: Element | null,
  ): IntersectionObserver[] {
    const tops = new Set<Element>();
    const bottoms = new Set<Element>();
    const watchSide = (lost: Set<string>, rootMargin: string) => {
      const observer = new IntersectionObserver(
        (entries) => {
          const screenEnd = (root ?? document.documentElement).clientHeight;
          const inSight = (edge: number) => edge >= header - SNAP && edge <= screenEnd + SNAP;
          for (const { target, isIntersecting, boundingClientRect } of entries) {
            if (inSight(boundingClientRect.top)) tops.add(target);
            if (inSight(boundingClientRect.bottom)) bottoms.add(target);
            if (isIntersecting) continue;
            const shown = tops.has(target) && bottoms.has(target);
            if (shown && this.stillness === undefined) lost.add(target.id);
            tops.delete(target);
            bottoms.delete(target);
          }
          if (lost.size >= FORGET_AFTER) this.returnTo.set(null);
        },
        { root, rootMargin, threshold: [0, 1] },
      );
      for (const card of cards) observer.observe(card);
      return observer;
    };
    return [
      watchSide(this.lost.above, `-${header}px 0px ${FAR}px`), // Gone above the header.
      watchSide(this.lost.below, `${FAR}px 0px 0px`), // Gone below the screen.
    ];
  }
}
