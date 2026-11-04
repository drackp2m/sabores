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
import { VenueMap, loadMapLibre } from './map/map';
import { isDesktop, isTouch, reducedMotion, remInPx } from './media';
import { OriginPanel } from './origin/origin';
import { ScrollPosition } from './scroll-position';
import { Seal } from './seal/seal';
import { Store } from './store';
import { TapasRoute } from './tapas-route';
import { Theme, Themes } from './theme';
import { UserLocation } from './user-location';
import { VenueCard } from './venue-card/venue-card';
import { switchView } from './view-switch';
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

/** How long the map waits for typing in the search box to stop before it rearranges itself. */
const MAP_DELAY = 500;

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
    '(window:popstate)': 'onNavigate($event)',
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
  /** The scroll-to-top button, once the map is out of sight (in the photo view, the gallery's top). */
  protected readonly showScrollTop = signal(false);
  private readonly scrollTopMark = viewChild<ElementRef<HTMLElement>>('scrollTopMark');

  /** Any that are missing (added after they were saved) start empty. */
  protected readonly filters = signal<Filters>({
    ...NO_FILTERS,
    ...this.store.setting<Partial<Filters>>('filters'),
  });
  /** Every minute there's a new one, but the list only gets filtered again if it starts "now". */
  protected readonly range = computed(() => timeRange(this.filters(), this.clock.now()), {
    equal: (a, b) => a.from === b.from && a.to === b.to,
  });
  private readonly searchText = computed(() => this.filters().text);
  /** The search text for the map: the one from when typing stops (MAP_DELAY). */
  private readonly mapText = signal(this.filters().text);

  protected readonly sort = signal<Sort>(this.store.setting<Sort>('sort') ?? 'number');
  protected readonly view = signal<View>(this.store.setting<View>('view') ?? legacyView());
  /** Venue opened from the photo view or from its popup on the map. */
  protected readonly detail = signal<number | null>(null);
  /** Venue whose marker was just clicked, to highlight it in the list. */
  protected readonly highlighted = signal<number | null>(null);

  protected readonly filtered = computed(() => this.filter(this.filters()));
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

  protected readonly detailVenue = computed(() =>
    this.tapasRoute.venues().find((v) => v.number === this.detail()),
  );
  protected readonly detailOnly = computed(() => {
    const venue = this.detailVenue();
    return venue ? [venue] : [];
  });

  /** The venue to go back to, as long as the filters leave it in the list. */
  private readonly returnVenue = computed(() => {
    const origin = this.position.returnTo();
    return this.visible().some((v) => v.number === origin) ? origin : null;
  });
  protected readonly returnButton = computed(() =>
    this.position.canReturn() ? this.returnVenue() : null,
  );
  /**
   * Whether it's above the venue the scroll is on: on desktop, a marker can take the list either way
   * (on phones the map is above the list, and coming back is always down).
   */
  protected readonly returnUp = computed(() => {
    const venues = this.visible();
    const at = (number: number | null) => venues.findIndex((v) => v.number === number);
    return at(this.returnVenue()) < at(this.position.current());
  });

  /** Gallery scroll when opening a venue, to leave it the same on the way back. */
  private galleryScroll = 0;
  /** The menu is leaving a venue: whatever the view, it opens on that venue. */
  private leavingFromMenu = false;

  constructor() {
    // In «Detalles» it will be needed: download it along with the data, without waiting for it. If
    // it fails, the map will say so.
    if (this.view() === 'details') loadMapLibre().catch(() => {});

    effect(() => this.store.saveSetting('filters', this.filters()));
    // «Abierto ahora» goes on with the clock: every minute, and on opening the app or coming back.
    effect(() => {
      const hour = nextHour(this.clock.now());
      this.filters.update((filters) => (filters.openNow ? { ...filters, ...hour } : filters));
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

    // «Subir», as soon as the mark at the end of the map has gone under the header. Without listening
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

    // Which venue the scroll is on. The same mark says whether there's a list to follow.
    afterRenderEffect((onCleanup) => {
      const venues = this.visible();
      if (!this.scrollTopMark()) return;
      const marks = [...this.host.querySelectorAll('.venue-mark')];
      onCleanup(this.position.follow(venues, marks, this.headerOverlap, this.root));
    });

    // What decides on the venue to return to, only while there is one.
    afterRenderEffect((onCleanup) => {
      const card = this.card(this.returnVenue());
      if (!card) return;
      const cards = this.visible().flatMap((v) => this.card(v.number) ?? []);
      onCleanup(this.position.watchReturn(card, cards, this.headerOverlap, this.root));
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
    if (this.detail() !== null) {
      this.leavingFromMenu = true;
      history.back();
    } else if (view !== this.view()) {
      this.switchTo(view);
      return;
    }
    this.view.set(view);
  }

  /**
   * From one list view to the other, on the venue the scroll is on. On a phone, as a transition that
   * keeps it in place on the screen (view-switch.ts), with the new view rendered at once; otherwise,
   * landing on it.
   */
  private switchTo(view: View): void {
    const venue = this.position.current();
    const change = () => {
      this.position.returnTo.set(null);
      this.view.set(view);
    };
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

  /** Shows a venue of the list on the map, remembering it to be able to return. */
  protected locate(map: VenueMap, number: number): void {
    this.position.leaveFrom(number, this.outOfSightAtMap(number));
    map.focus(number);
  }

  /**
   * Whether the venue's card will be out of sight once the page gets to the map. It goes as little as
   * it takes to show it whole below the header (focus, in map.ts), and no higher than the top. The
   * card has to be whole, with its margins, as ScrollPosition sees it.
   */
  private outOfSightAtMap(number: number): boolean {
    const card = this.card(number)?.getBoundingClientRect();
    const map = this.host.querySelector('.results .map')?.getBoundingClientRect();
    if (!card || !map) return false;
    const top = this.headerHeight + remInPx();
    const rootTop = this.root?.getBoundingClientRect().top ?? 0;
    const bottom = rootTop + (this.root ?? document.documentElement).clientHeight;
    let by = 0;
    if (map.top < top) by = Math.max(map.top - top, -this.scroller.scrollTop);
    else if (map.bottom > bottom) by = Math.min(map.bottom - bottom, map.top - top);
    // A pixel either way: the browser rounds where the page stops.
    return by !== 0 && (card.top - by < top - 1 || card.bottom - by > bottom - remInPx() + 1);
  }

  protected returnToVenue(number: number): void {
    this.position.returnTo.set(null);
    this.card(number)?.scrollIntoView({ behavior: this.scrollBehavior, block: 'start' });
    this.highlight(number);
  }

  /**
   * On desktop, clicking a marker takes the list to its card, but no lower than where the list ends
   * next to the map: any further, the footer would come in and push the map up. The last cards stay
   * lower on the screen, still in sight.
   */
  protected showInList(number: number): void {
    const card = this.card(number);
    const results = this.host.querySelector('.results');
    const map = results?.querySelector<HTMLElement>('.map');
    if (!isDesktop() || !card || !map) return;
    // Where the card would stay, and the map stays: below the header (scroll-padding-top).
    const top = this.headerHeight + remInPx();
    const lowest = results!.getBoundingClientRect().bottom - (top + map.offsetHeight);
    const by = Math.min(card.getBoundingClientRect().top - top, lowest);
    this.scroller.scrollBy({ top: by, behavior: this.scrollBehavior });
    this.highlight(number);
  }

  private get scrollBehavior(): ScrollBehavior {
    return reducedMotion() ? 'auto' : 'smooth';
  }

  private highlight(number: number): void {
    this.position.appScrolled();
    this.highlighted.set(number);
    setTimeout(() => this.highlighted.update((n) => (n === number ? null : n)), 1600);
  }

  /**
   * Opens a venue in a new history entry: the browser's back button returns to where it was. From the
   * map, on that venue's card (onNavigate): the one it had gone to the map from no longer counts.
   */
  protected openVenue(number: number): void {
    this.galleryScroll = this.scroller.scrollTop;
    this.position.returnTo.set(null);
    history.pushState({ venue: number }, '');
    this.detail.set(number);
    this.scroller.scrollTo({ top: 0 });
  }

  protected goBack(): void {
    history.back();
  }

  protected onNavigate(event: PopStateEvent): void {
    const number = (event.state as { venue?: number } | null)?.venue ?? null;
    const opened = this.detail();
    const land = this.leavingFromMenu || this.view() === 'details';
    this.leavingFromMenu = false;
    this.detail.set(number);
    // From a venue to «Detalles», or to any view from the menu, it opens on that same venue.
    if (number === null && land) {
      this.landOn(opened);
      return;
    }
    const top = number === null ? this.galleryScroll : 0;
    afterNextRender(() => this.scroller.scrollTo({ top }), { injector: this.injector });
  }
}
