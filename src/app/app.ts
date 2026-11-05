import {
  ApplicationRef,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { CardSteps } from './card-steps/card-steps';
import { Clock } from './clock';
import { FiltersPanel } from './filters/filters';
import { Gallery } from './gallery/gallery';
import { Header, View } from './header/header';
import { Icon } from './icon/icon';
import { legacyView } from './legacy-storage';
import { VenueMap, loadMapLibre } from './map/map';
import { desktop, isTouch, reducedMotion, remInPx } from './media';
import { OriginPanel } from './origin/origin';
import { ScrollPosition } from './scroll-position';
import { Seal } from './seal/seal';
import { Store } from './store';
import { TapasRoute } from './tapas-route';
import { UserLocation } from './user-location';
import { VenueCard } from './venue-card/venue-card';
import { closeVenue, openVenue, switchView } from './view-switch';
import {
  Filters,
  NO_FILTERS,
  NO_MARKS,
  Venue,
  closingKey,
  filterVenues,
  nextHour,
  sortBy,
  timeRange,
} from './venues';
import { PhotoViewer } from './viewer/viewer';

type Sort = 'number' | 'nearest' | 'closing';

/**
 * How long the map beside the list waits for typing in the search box to stop before it rearranges
 * itself.
 */
const MAP_DELAY = 500;

@Component({
  selector: 'app-root',
  imports: [
    CardSteps,
    FiltersPanel,
    Gallery,
    Header,
    Icon,
    OriginPanel,
    PhotoViewer,
    Seal,
    VenueCard,
    VenueMap,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    // Safari on iOS ignores user-scalable=no: pinch-to-zoom gets blocked here.
    '(document:gesturestart)': '$event.preventDefault()',
  },
})
export class App {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly appRef = inject(ApplicationRef);
  protected readonly location = inject(UserLocation);
  /** Already loaded at startup (app.config.ts): filters, sort order and view start as they were left. */
  private readonly store = inject(Store);
  private readonly position = inject(ScrollPosition);
  protected readonly tapasRoute = inject(TapasRoute);
  private readonly clock = inject(Clock);

  /** The scroll-to-top button, once the top of the list or the gallery has gone under the header. */
  protected readonly showScrollTop = signal(false);
  private readonly scrollTopMark = viewChild<ElementRef<HTMLElement>>('scrollTopMark');
  private readonly desktopQuery = desktop();
  /**
   * On desktop the list or the gallery has the map beside it, and its map buttons take it to their
   * venue: there's no venue view. A signal, for turning an iPad.
   */
  protected readonly desktop = signal(this.desktopQuery.matches);
  /** The map beside the list or the gallery, on desktop. */
  private readonly listMap = viewChild<VenueMap>('listMap');
  /** The venue in the middle of the map beside the list: its map button has nothing to do. */
  protected readonly centeredBeside = computed(() => this.listMap()?.centered() ?? null);
  /** The venue view's map. */
  private readonly detailMap = viewChild<VenueMap>('detailMap');
  /** The venue view's cards, side by side. */
  private readonly cards = viewChild<ElementRef<HTMLElement>>('cards');

  /** Any that are missing (added after they were saved) start empty. */
  protected readonly filters = signal<Filters>({
    ...NO_FILTERS,
    ...this.store.setting<Partial<Filters>>('filters'),
  });
  /** Every minute there's a new one, but the list only gets filtered again if it starts "now". */
  protected readonly range = computed(() => timeRange(this.filters(), this.clock.now()), {
    equal: (a, b) => a.from === b.from && a.to === b.to,
  });
  protected readonly sort = signal<Sort>(this.store.setting<Sort>('sort') ?? 'number');
  protected readonly view = signal<View>(this.store.setting<View>('view') ?? legacyView());
  /**
   * In the venue view, the venue: the one opened with its map button, from either view, and then the
   * one whose card is in the middle (see selectVenue). The route doesn't follow it (see destination).
   */
  protected readonly detail = signal<number | null>(null);
  /**
   * In the venue view, the venue the route goes to: the one opened, and then the one chosen with its
   * card's map button (showOnMap). Scrolling the cards or touching the map doesn't change it: its
   * card is the only one without that button.
   */
  protected readonly destination = signal<number | null>(null);
  /**
   * The venue view's, on the map and side by side below it: the list's as it was on opening a venue,
   * which stays the same while there (sorted by distance, the list follows the user's steps).
   */
  protected readonly detailVenues = signal<readonly Venue[]>([]);
  /**
   * The venue whose card is on its way to the middle, chosen on the map: those it passes by on the
   * way don't get selected. Until it gets there, or the cards are touched.
   */
  private cardOnItsWay: number | null = null;

  protected readonly filtered = computed(() => this.filter(this.filters()));
  private readonly searchText = computed(() => this.filters().text);
  /** The search text for the map beside the list: the one from when typing stops (MAP_DELAY). */
  private readonly mapText = signal(this.filters().text);
  /** The same ones, but with the text in mapText (the map doesn't care about the order). */
  protected readonly onMap = computed(() =>
    this.filter({ ...this.filters(), text: this.mapText() }),
  );

  protected readonly visible = computed(() => {
    const venues = this.filtered();
    switch (this.sort()) {
      case 'nearest': {
        const arrivals = this.tapasRoute.arrivals();
        return arrivals.size
          ? sortBy(venues, (v) => arrivals.get(v.number)?.meters ?? Infinity)
          : venues;
      }
      case 'closing': {
        const statuses = this.tapasRoute.statuses();
        return sortBy(venues, (v) => closingKey(statuses.get(v.number)!));
      }
      default:
        return venues;
    }
  });

  /**
   * The list's or the gallery's scroll when opening a venue, to leave it the same on the way back
   * (without a transition, see goBack). Null if the view or the venue changed meanwhile: it lands on
   * the venue.
   */
  private listScroll: number | null = 0;

  constructor() {
    // On desktop it will be needed: download it along with the data, without waiting for it. If it
    // fails, the map will say so.
    if (this.desktop()) loadMapLibre().catch(() => {});
    const onDesktop = ({ matches }: MediaQueryListEvent) => this.desktop.set(matches);
    this.desktopQuery.addEventListener('change', onDesktop);
    inject(DestroyRef).onDestroy(() => this.desktopQuery.removeEventListener('change', onDesktop));
    // Turning an iPad (or widening the window) in the venue view: on desktop there is none. Back in
    // the list on that venue, with the map beside it on it.
    effect(() => {
      if (this.desktop()) untracked(() => this.leaveForDesktop());
    });
    effect((onCleanup) => {
      const text = this.searchText();
      // With the search empty («Limpiar», say) there's no more typing to wait for.
      if (!text) {
        this.mapText.set('');
        return;
      }
      const delay = setTimeout(() => this.mapText.set(text), MAP_DELAY);
      onCleanup(() => clearTimeout(delay));
    });

    effect(() => this.store.saveSetting('filters', this.filters()));
    // «Horarios revisados» changes the schedules everywhere: cards, statuses, map, filters and sorting.
    effect(() => this.tapasRoute.reviewedHours.set(this.filters().reviewedHours));
    // «Abierto ahora» goes on with the clock: every minute, and on opening the app or coming back.
    effect(() => {
      const hour = nextHour(this.clock.now());
      this.filters.update((filters) => (filters.openNow ? { ...filters, ...hour } : filters));
    });
    // «Subir», as soon as the mark at the top of the list or the gallery has gone under the header. Without listening
    // to scroll: the browser tells when it crosses, with no JavaScript in between. With no mark (in
    // the venue view or while loading), there is no button. From one list view to the other it stays
    // as it was until the browser tells, instead of leaving and coming back.
    afterRenderEffect((onCleanup) => {
      const mark = this.scrollTopMark()?.nativeElement;
      if (!mark) {
        this.showScrollTop.set(false);
        return;
      }
      const observer = new IntersectionObserver(
        ([{ boundingClientRect, rootBounds }]) =>
          this.showScrollTop.set(boundingClientRect.bottom <= (rootBounds?.top ?? 0)),
        { rootMargin: `-${this.headerHeight}px 0px 0px` },
      );
      observer.observe(mark);
      onCleanup(() => observer.disconnect());
    });

    // In the venue view, the venue is the one whose card is in the middle as they scroll: the one
    // crossing a thin line down the middle (between two, in the gap, the one before stays). Without
    // listening to scroll, as with «Subir».
    afterRenderEffect((onCleanup) => {
      const strip = this.cards()?.nativeElement;
      const venues = this.detailVenues();
      if (!strip) return;
      const cards = [...strip.children];
      const observer = new IntersectionObserver(
        (entries) => {
          for (const { target, isIntersecting } of entries) {
            const number = venues[cards.indexOf(target)]?.number;
            if (isIntersecting && number !== undefined) this.cardInMiddle(number);
          }
        },
        { root: strip, rootMargin: '0px -49%' },
      );
      for (const card of cards) observer.observe(card);
      // Touched, they go wherever they're taken.
      const touched = () => (this.cardOnItsWay = null);
      const passive = { passive: true };
      strip.addEventListener('pointerdown', touched, passive);
      strip.addEventListener('wheel', touched, passive);
      onCleanup(() => {
        observer.disconnect();
        strip.removeEventListener('pointerdown', touched);
        strip.removeEventListener('wheel', touched);
      });
    });

    // Which venue the scroll is on. The same mark says whether there's a list to follow; it stays on
    // switching view, but the venues' marks are new.
    afterRenderEffect((onCleanup) => {
      const venues = this.visible();
      this.view();
      if (!this.scrollTopMark()) return;
      const marks = [...this.host.querySelectorAll('.venue-mark')];
      onCleanup(this.position.follow(venues, marks, this.headerOverlap, this.root));
    });
  }

  /**
   * Favorites and ratings, only with their filter on: otherwise, marking a favorite or rating a tapa
   * would filter the whole list again.
   */
  private filter(filters: Filters): Venue[] {
    return filterVenues(
      this.tapasRoute.venues(),
      { ...filters, ...this.range() },
      {
        favorites: filters.favorites ? this.store.favorites() : NO_MARKS.favorites,
        ratings: filters.tried ? this.store.ratings() : NO_MARKS.ratings,
      },
    );
  }

  /** What scrolls: app-root on touch screens, the document elsewhere (see styles/_base.scss). */
  private get scroller(): Element {
    if (isTouch()) return this.host;
    return document.scrollingElement ?? document.documentElement;
  }

  /** What scrolls, for an IntersectionObserver: null is the document. */
  private get root(): Element | null {
    return isTouch() ? this.host : null;
  }

  private get headerHeight(): number {
    return this.host.querySelector<HTMLElement>('app-header')!.offsetHeight;
  }

  /** What the header hides of what scrolls: nothing on touch screens, where it starts below it. */
  private get headerOverlap(): number {
    return isTouch() ? 0 : this.headerHeight;
  }

  /** A venue's card or, in the photo view, its place in the gallery. */
  private card(number: number | null): HTMLElement | null {
    return document.getElementById(`venue-${number}`);
  }

  protected scrollToTop(): void {
    this.scroller.scrollTo({ top: 0, behavior: this.scrollBehavior });
  }

  /** Sorting by distance needs a starting point: if there is none, it asks for the location. */
  protected changeSort(sort: Sort): void {
    this.sort.set(sort);
    this.store.saveSetting('sort', sort);
    if (sort === 'nearest' && !this.location.origin()) this.location.useMyLocation();
  }

  /** From the header's menu, already closed. */
  protected changeView(view: View): void {
    this.store.saveSetting('view', view);
    if (view === this.view()) return;
    // From a venue it stays there, with its card as it is: the new view is for going back (goBack).
    if (this.detail() !== null) {
      this.view.set(view);
      this.listScroll = null;
    } else {
      this.switchTo(view);
    }
  }

  /**
   * From one list view to the other, on the venue the scroll is on. On a phone or on desktop, as a
   * transition that keeps it in place on the screen (view-switch.ts), with the new view rendered at
   * once; otherwise (the gallery in several columns), landing on it.
   */
  private switchTo(view: View): void {
    const venue = this.position.current();
    const change = () => this.view.set(view);
    const render = () => {
      change();
      this.appRef.tick();
    };
    if (switchView(venue, this.scroller, render)) return;
    change();
    this.landOn(venue);
  }

  /**
   * In the new list, leaves the page on that venue. On the first one, at the very top: there is
   * nothing above it worth hiding. In the second round: the first one adds the «Ver más» that move
   * the cards (collapsible.ts), and Safari wouldn't make up for it.
   */
  private landOn(number: number | null): void {
    const land = () => {
      const card = number === this.visible()[0]?.number ? null : this.card(number);
      if (card) this.landExactlyOn(card);
      else this.scroller.scrollTo({ top: 0 });
    };
    afterNextRender(() => afterNextRender(land, { injector: this.injector }), {
      injector: this.injector,
    });
  }

  /**
   * Where the card is in the venue view. Cards can start between two pixels and the browser only
   * scrolls whole ones: what's left over would round each line its own way, moving them on coming
   * back from the venue. The list makes up for it. The last cards, which can't get that high, are
   * left as they are.
   */
  private landExactlyOn(card: HTMLElement): void {
    card.scrollIntoView({ block: 'start' });
    const rest = this.headerHeight + remInPx() - card.getBoundingClientRect().top;
    if (Math.abs(rest) < 1) card.parentElement!.style.marginTop = `${rest}px`;
  }

  private get scrollBehavior(): ScrollBehavior {
    return reducedMotion() ? 'auto' : 'smooth';
  }

  /**
   * A venue's map button, in either list view: on desktop, the map beside it goes to the venue (whole
   * in sight, see VenueMap.focus); on phones, the venue opens (openVenue).
   */
  protected locate(number: number): void {
    const map = this.listMap();
    if (map) map.focus(number);
    else this.openVenue(number);
  }

  /**
   * On desktop, clicking a marker takes the list to its card, but no lower than where the list ends
   * next to the map: any further, the footer would come in and push the map up. The last cards stay
   * lower on the screen, still in sight.
   */
  protected showInList(number: number): void {
    const card = this.card(number);
    const results = card?.closest('.results');
    const map = results?.querySelector<HTMLElement>(':scope > .map');
    if (!card || !map) return;
    // Where the card would stay, and the map stays: below the header (scroll-padding-top).
    const top = this.headerHeight + remInPx();
    const lowest = results!.getBoundingClientRect().bottom - (top + map.offsetHeight);
    const by = Math.min(card.getBoundingClientRect().top - top, lowest);
    this.scroller.scrollBy({ top: by, behavior: this.scrollBehavior });
  }

  /**
   * On desktop there's no venue view (see desktop): in the list on the venue, with the map beside it
   * on the one the route went to.
   */
  private leaveForDesktop(): void {
    const number = this.detail();
    const destination = this.destination() ?? number;
    if (number === null || destination === null) return;
    this.closeDetail();
    this.landOn(number);
    afterNextRender(() => this.listMap()?.focus(destination), { injector: this.injector });
  }

  /**
   * From a venue's map button, in either view, below desktop (see locate): it opens with its map
   * showing it once it's on the page, and the list's cards side by side below it, with its own in the
   * middle. Not as a history entry: the browser's back button doesn't return from it, only «Volver»
   * (goBack). On a phone, as a transition that takes the card to its place under the map
   * (view-switch.ts), with the venue rendered at once.
   */
  protected openVenue(number: number): void {
    this.listScroll = this.scroller.scrollTop;
    const open = () => {
      this.detailVenues.set(this.visible());
      this.detail.set(number);
      this.destination.set(number);
      this.scroller.scrollTo({ top: 0 });
    };
    const show = () => {
      this.centerCard(number, 'instant');
      this.detailMap()?.focus(number);
    };
    const render = () => {
      open();
      this.appRef.tick();
      show();
    };
    if (openVenue(number, this.scroller, render, this.view() === 'photos')) return;
    open();
    afterNextRender(show, { injector: this.injector });
  }

  /**
   * A venue's card got to the middle, scrolling them: it's the venue, with the map going to it (see
   * VenueMap.follow). On the way to one chosen on the map, only that one.
   */
  private cardInMiddle(number: number): void {
    if (this.cardOnItsWay !== null && number !== this.cardOnItsWay) return;
    this.cardOnItsWay = null;
    this.choose(number);
  }

  /**
   * On the map, its marker: its card comes to the middle, and the map stays where it is (map.ts knows
   * it was touched there; full screen, it opens its popup). The same with a mouse from the buttons for
   * the card before or after (card-steps.ts), with the map going to it. The route stays where it was
   * going (see destination).
   */
  protected selectVenue(number: number): void {
    if (number === this.detail()) return;
    this.cardOnItsWay = number;
    this.choose(number);
    this.centerCard(number, this.scrollBehavior);
  }

  /**
   * A card's map button, in the venue view: the route goes to its venue from now on, framed on the
   * map (or the venue itself, without one: see VenueMap.showRoute), and its card comes to the middle
   * if it wasn't.
   */
  protected showOnMap(number: number): void {
    this.destination.set(number);
    this.selectVenue(number);
    this.detailMap()?.showRoute(number);
  }

  /** Another venue, which «Volver» leaves the list on (see listScroll). */
  private choose(number: number): void {
    if (number === this.detail()) return;
    this.detail.set(number);
    this.listScroll = null;
  }

  /** Scrolls the cards (only them, not the page) to leave that venue's in the middle, at its stop. */
  private centerCard(number: number, behavior: ScrollBehavior): void {
    const strip = this.cards()?.nativeElement;
    const card = this.card(number);
    if (!strip || !card) return;
    const { left, width } = card.getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    const middle = left - box.left - (box.width - width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + middle, behavior });
  }

  /**
   * «Volver»: to the list or the gallery, on the venue whose card is in the middle. On a phone, as a
   * transition (view-switch.ts) in which the card stays where it is on the screen and the list,
   * rendered at once, arrives around it; not if the venue is no longer in it (it stopped being a
   * favorite, say, with that filter on), with no place for the card to go. Otherwise, where it was
   * left; or on the venue, if the view or the venue changed.
   */
  protected goBack(): void {
    const number = this.detail();
    const top = this.listScroll;
    const render = () => {
      this.closeDetail();
      this.appRef.tick();
    };
    const inList = this.visible().some((venue) => venue.number === number);
    const toGallery = this.view() === 'photos';
    if (number !== null && inList && closeVenue(number, this.scroller, render, toGallery)) return;
    this.closeDetail();
    if (top === null) this.landOn(number);
    else afterNextRender(() => this.scroller.scrollTo({ top }), { injector: this.injector });
  }

  /** Out of the venue view. */
  private closeDetail(): void {
    this.detail.set(null);
    this.destination.set(null);
    this.detailVenues.set([]);
    this.cardOnItsWay = null;
  }
}
