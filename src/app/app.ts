import {
  ApplicationRef,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { Clock } from './clock';
import { FiltersPanel } from './filters/filters';
import { Gallery } from './gallery/gallery';
import { Icon, IconName } from './icon/icon';
import { legacyView } from './legacy-storage';
import { VenueMap } from './map/map';
import { isTouch, reducedMotion, remInPx } from './media';
import { OriginPanel } from './origin/origin';
import { ScrollPosition } from './scroll-position';
import { Seal } from './seal/seal';
import { Store } from './store';
import { TapasRoute } from './tapas-route';
import { Theme, Themes } from './theme';
import { UserLocation } from './user-location';
import { VenueCard } from './venue-card/venue-card';
import { openVenue, switchView } from './view-switch';
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
import { PhotoViewer, Viewer } from './viewer/viewer';

type View = 'details' | 'photos';
type Sort = 'number' | 'nearest' | 'closing';

const THEMES: readonly { theme: Theme; name: string; icon: IconName }[] = [
  { theme: 'light', name: 'Claro', icon: 'sun' },
  { theme: 'dark', name: 'Oscuro', icon: 'moon' },
  { theme: 'system', name: 'Sistema', icon: 'system' },
];

@Component({
  selector: 'app-root',
  imports: [FiltersPanel, Gallery, Icon, OriginPanel, PhotoViewer, Seal, VenueCard, VenueMap],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    // Safari on iOS ignores user-scalable=no: pinch-to-zoom gets blocked here.
    '(document:gesturestart)': '$event.preventDefault()',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
})
export class App {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly appRef = inject(ApplicationRef);
  protected readonly location = inject(UserLocation);
  protected readonly theme = inject(Themes);
  private readonly viewer = inject(Viewer);
  /** Already loaded at startup (app.config.ts): filters, sort order and view start as they were left. */
  private readonly store = inject(Store);
  private readonly position = inject(ScrollPosition);
  protected readonly tapasRoute = inject(TapasRoute);
  private readonly clock = inject(Clock);
  protected readonly themes = THEMES;

  protected readonly menuOpen = signal(false);
  /** The scroll-to-top button, once the top of the list or the gallery has gone under the header. */
  protected readonly showScrollTop = signal(false);
  private readonly scrollTopMark = viewChild<ElementRef<HTMLElement>>('scrollTopMark');
  /** The venue view's map. */
  private readonly detailMap = viewChild<VenueMap>('detailMap');

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
  /** Venue opened with its map button, from either view. */
  protected readonly detail = signal<number | null>(null);

  protected readonly filtered = computed(() => this.filter(this.filters()));

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

  protected readonly detailVenue = computed(() =>
    this.tapasRoute.venues().find((v) => v.number === this.detail()),
  );
  protected readonly detailOnly = computed(() => {
    const venue = this.detailVenue();
    return venue ? [venue] : [];
  });

  /** The list's or the gallery's scroll when opening a venue, to leave it the same on the way back. */
  private listScroll = 0;

  constructor() {
    effect(() => this.store.saveSetting('filters', this.filters()));
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

    // Which venue the scroll is on. The same mark says whether there's a list to follow; it stays on
    // switching view, but the venues' marks are new.
    afterRenderEffect((onCleanup) => {
      const venues = this.visible();
      this.view();
      if (!this.scrollTopMark()) return;
      const marks = [...this.host.querySelectorAll('.venue-mark')];
      onCleanup(this.position.follow(venues, marks, this.headerOverlap, this.root));
    });

    // Clicking outside the menu closes it; it only listens while open: otherwise, every click
    // anywhere on the page would check the view again.
    effect((onCleanup) => {
      if (!this.menuOpen()) return;
      const onClick = (event: MouseEvent) => this.closeMenuOutside(event);
      document.addEventListener('click', onClick);
      onCleanup(() => document.removeEventListener('click', onClick));
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
    return this.host.querySelector<HTMLElement>('.header')!.offsetHeight;
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

  /** Opening the menu closes any enlarged photo (the header stays above it). */
  protected toggleMenu(): void {
    const open = !this.menuOpen();
    this.menuOpen.set(open);
    if (open) this.viewer.close();
  }

  /** The menu button already opens and closes it on its own. */
  private closeMenuOutside(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('.menu, .menu-button')) return;
    this.menuOpen.set(false);
  }

  /** Sorting by distance needs a starting point: if there is none, it asks for the location. */
  protected changeSort(sort: Sort): void {
    this.sort.set(sort);
    this.store.saveSetting('sort', sort);
    if (sort === 'nearest' && !this.location.origin()) this.location.useMyLocation();
  }

  protected changeView(view: View): void {
    this.menuOpen.set(false);
    this.store.saveSetting('view', view);
    const opened = this.detail();
    // From a venue, whatever the view, it opens on that same venue.
    if (opened !== null) {
      this.detail.set(null);
      this.view.set(view);
      this.landOn(opened);
    } else if (view !== this.view()) {
      this.switchTo(view);
    }
  }

  /**
   * From one list view to the other, on the venue the scroll is on. On a phone, as a transition that
   * keeps it in place on the screen (view-switch.ts), with the new view rendered at once; otherwise,
   * landing on it.
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
   * From a venue's map button, in either view: it opens with its map showing it once it's on the
   * page. Not as a history entry: the browser's back button doesn't return from it, only «Volver»
   * (goBack). On a phone, as a transition that takes the card to its place under the map
   * (view-switch.ts), with the venue rendered at once.
   */
  protected openVenue(number: number): void {
    this.listScroll = this.scroller.scrollTop;
    const open = () => {
      this.detail.set(number);
      this.scroller.scrollTo({ top: 0 });
    };
    const render = () => {
      open();
      this.appRef.tick();
      this.detailMap()?.focus(number);
    };
    if (openVenue(number, this.scroller, render, this.view() === 'photos')) return;
    open();
    afterNextRender(() => this.detailMap()?.focus(number), { injector: this.injector });
  }

  /** «Volver»: to the list or the gallery, where it was left. */
  protected goBack(): void {
    this.detail.set(null);
    const top = this.listScroll;
    afterNextRender(() => this.scroller.scrollTo({ top }), { injector: this.injector });
  }
}
