import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Gallery } from './gallery/gallery';
import { Icon, IconName } from './icon/icon';
import { legacyView } from './legacy-storage';
import { VenueMap, loadLeaflet } from './map/map';
import { OriginPanel } from './origin/origin';
import { Seal } from './seal/seal';
import { Store } from './store';
import { Theme, Themes } from './theme';
import { UserLocation } from './user-location';
import { VenueCard } from './venue-card/venue-card';
import {
  Arrival,
  Filters,
  NO_FILTERS,
  NO_MARKS,
  RouteData,
  TriedFilter,
  Venue,
  WEEKDAYS,
  Weekday,
  arrivalFrom,
  closingKey,
  drinkTypes,
  filterVenues,
  scheduleStatus,
  sortBy,
  sortDrinks,
  weekdayOf,
} from './venues';
import { PhotoViewer, Viewer } from './viewer/viewer';

type View = 'details' | 'photos';
type Sort = 'number' | 'nearest' | 'closing';

/** Same as in app.scss: list on the left and map on the right. */
const DESKTOP = '(min-width: 960px)';
/** Same as in styles.scss: app-root scrolls on touch screens; the document does everywhere else. */
const TOUCH = '(hover: none) and (pointer: coarse)';
/** How long the map waits for typing in the search box to stop before it rearranges itself. */
const MAP_DELAY = 500;

const THEMES: readonly { theme: Theme; name: string; icon: IconName }[] = [
  { theme: 'light', name: 'Claro', icon: 'sun' },
  { theme: 'dark', name: 'Oscuro', icon: 'moon' },
  { theme: 'system', name: 'Sistema', icon: 'system' },
];

@Component({
  selector: 'app-root',
  imports: [FormsModule, Gallery, Icon, OriginPanel, PhotoViewer, Seal, VenueCard, VenueMap],
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly location = inject(UserLocation);
  protected readonly theme = inject(Themes);
  private readonly viewer = inject(Viewer);
  /** Already loaded at startup (app.config.ts): filters, sort order and view start as they were left. */
  private readonly store = inject(Store);
  protected readonly weekdays = WEEKDAYS;
  protected readonly themes = THEMES;

  protected readonly menuOpen = signal(false);
  /** The scroll-to-top button, once the map is out of sight (in the photo view, the gallery's top). */
  protected readonly showScrollTop = signal(false);
  private readonly scrollTopMark = viewChild<ElementRef<HTMLElement>>('scrollTopMark');

  protected readonly load = resource({ loader: loadRouteData });
  /** undefined until it arrives (and if it doesn't: see load.error()). */
  protected readonly data = computed(() => (this.load.hasValue() ? this.load.value() : undefined));

  /** Any that are missing (added after they were saved) start empty. */
  private readonly saved: Filters = {
    ...NO_FILTERS,
    ...this.store.setting<Partial<Filters>>('filters'),
  };
  protected readonly text = signal(this.saved.text);
  protected readonly day = signal<Weekday | ''>(this.saved.day);
  protected readonly from = signal(this.saved.from);
  protected readonly to = signal(this.saved.to);
  protected readonly glutenFree = signal<Filters['glutenFree']>(this.saved.glutenFree);
  protected readonly drink = signal(this.saved.drink);
  protected readonly flavorRoute = signal(this.saved.flavorRoute);
  protected readonly favorites = signal(this.saved.favorites);
  protected readonly tried = signal<TriedFilter>(this.saved.tried);
  /** The search text for the map: the one from when typing stops (MAP_DELAY). */
  private readonly mapText = signal(this.saved.text);

  private readonly filters = computed<Filters>(() => ({
    text: this.text(),
    day: this.day(),
    from: this.from(),
    to: this.to(),
    glutenFree: this.glutenFree(),
    drink: this.drink(),
    flavorRoute: this.flavorRoute(),
    favorites: this.favorites(),
    tried: this.tried(),
  }));

  protected readonly sort = signal<Sort>(this.store.setting<Sort>('sort') ?? 'number');
  protected readonly view = signal<View>(this.store.setting<View>('view') ?? legacyView());
  /** Venue opened from the photo view. */
  protected readonly detail = signal<number | null>(null);
  /** Venue whose marker was just clicked, to highlight it in the list. */
  protected readonly highlighted = signal<number | null>(null);
  protected readonly now = signal(new Date());

  protected readonly drinks = computed(() => drinkTypes(this.data()?.venues ?? []));

  protected readonly filtered = computed(() => this.filter(this.filters()));
  /** The same ones, but with the text in mapText (the map doesn't care about the order). */
  protected readonly onMap = computed(() =>
    this.filter({ ...this.filters(), text: this.mapText() }),
  );

  /** Schedule status of each venue right now. */
  protected readonly statuses = computed(() => {
    const data = this.data();
    const now = this.now();
    return new Map(
      (data?.venues ?? []).map((v) => [v.number, scheduleStatus(v.schedule, now, data!.event)]),
    );
  });

  /** Arrival time at each venue from the starting point. */
  protected readonly arrivals = computed(() => {
    const origin = this.location.origin();
    const mode = this.location.travelMode() || undefined;
    const arrivals = new Map<number, Arrival>();
    for (const venue of origin ? (this.data()?.venues ?? []) : []) {
      if (venue.location) arrivals.set(venue.number, arrivalFrom(origin!, venue.location, mode));
    }
    return arrivals;
  });

  protected readonly visible = computed(() => {
    const venues = this.filtered();
    switch (this.sort()) {
      case 'nearest': {
        const arrivals = this.arrivals();
        return arrivals.size
          ? sortBy(venues, (v) => arrivals.get(v.number)?.meters ?? Infinity)
          : venues;
      }
      case 'closing': {
        const statuses = this.statuses();
        return sortBy(venues, (v) => closingKey(statuses.get(v.number)!));
      }
      default:
        return venues;
    }
  });

  protected readonly detailVenue = computed(() =>
    this.data()?.venues.find((v) => v.number === this.detail()),
  );
  protected readonly detailOnly = computed(() => {
    const venue = this.detailVenue();
    return venue ? [venue] : [];
  });

  /** Gallery scroll when opening a venue, to leave it the same on the way back. */
  private galleryScroll = 0;

  constructor() {
    // In «Detalles» it will be needed: download it along with the data, without waiting for it. If
    // it fails, the map will say so.
    if (this.view() === 'details') loadLeaflet().catch(() => {});

    const clock = setInterval(() => this.now.set(new Date()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(clock));
    effect(() => this.store.saveSetting('filters', this.filters()));
    effect((onCleanup) => {
      const text = this.text();
      const delay = setTimeout(() => this.mapText.set(text), MAP_DELAY);
      onCleanup(() => clearTimeout(delay));
    });

    // «Subir», as soon as the mark at the end of the map has gone under the header. Without listening
    // to scroll: the browser tells when it crosses, with no JavaScript in between. With no mark (in
    // the venue view or while loading), there is no button.
    afterRenderEffect((onCleanup) => {
      const mark = this.scrollTopMark()?.nativeElement;
      this.showScrollTop.set(false);
      if (!mark) return;
      const header = this.host.querySelector<HTMLElement>('.header')!.offsetHeight;
      const observer = new IntersectionObserver(
        ([{ boundingClientRect, rootBounds }]) =>
          this.showScrollTop.set(boundingClientRect.bottom <= (rootBounds?.top ?? 0)),
        { rootMargin: `-${header}px 0px 0px` },
      );
      observer.observe(mark);
      onCleanup(() => observer.disconnect());
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
    return filterVenues(this.data()?.venues ?? [], filters, {
      favorites: filters.favorites ? this.store.favorites() : NO_MARKS.favorites,
      ratings: filters.tried ? this.store.ratings() : NO_MARKS.ratings,
    });
  }

  /** What scrolls: app-root on touch screens, the document elsewhere (see styles.scss). */
  private get scroller(): Element {
    if (globalThis.matchMedia?.(TOUCH).matches) return this.host;
    return document.scrollingElement ?? document.documentElement;
  }

  protected scrollToTop(): void {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scroller.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
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

  /** Venues serving tapas right now. */
  protected openNow(): void {
    const date = new Date();
    this.day.set(weekdayOf(date));
    this.from.set(date.toTimeString().slice(0, 5));
    this.to.set('');
  }

  protected clearFilters(): void {
    this.text.set('');
    this.mapText.set('');
    this.day.set('');
    this.from.set('');
    this.to.set('');
    this.glutenFree.set('');
    this.drink.set('');
    this.flavorRoute.set(false);
    this.favorites.set(false);
    this.tried.set('');
  }

  /** Sorting by distance needs a starting point: if there is none, it asks for the location. */
  protected changeSort(sort: Sort): void {
    this.sort.set(sort);
    this.store.saveSetting('sort', sort);
    if (sort === 'nearest' && !this.location.origin()) this.location.useMyLocation();
  }

  protected changeView(view: View): void {
    this.menuOpen.set(false);
    if (this.detail() !== null) history.back();
    else if (view !== this.view()) this.scroller.scrollTo({ top: 0 });
    this.view.set(view);
    this.store.saveSetting('view', view);
  }

  /** On desktop, clicking a marker takes the list to its card. */
  protected showInList(number: number): void {
    if (!matchMedia(DESKTOP).matches) return;
    document
      .getElementById(`venue-${number}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.highlighted.set(number);
    setTimeout(() => this.highlighted.update((n) => (n === number ? null : n)), 1600);
  }

  /** Opens a venue in a new history entry: the browser's back button returns to the gallery. */
  protected openVenue(number: number): void {
    this.galleryScroll = this.scroller.scrollTop;
    history.pushState({ venue: number }, '');
    this.detail.set(number);
    this.scroller.scrollTo({ top: 0 });
  }

  protected goBack(): void {
    history.back();
  }

  protected onNavigate(event: PopStateEvent): void {
    const number = (event.state as { venue?: number } | null)?.venue ?? null;
    this.detail.set(number);
    const top = number === null && this.view() === 'photos' ? this.galleryScroll : 0;
    afterNextRender(() => this.scroller.scrollTo({ top }), { injector: this.injector });
  }
}

/** The route's data, from the request index.html has already made (if not, it is requested now). */
async function loadRouteData(): Promise<RouteData> {
  const { routeData } = window as Window & { routeData?: Promise<Response> };
  const response = await (routeData ?? fetch('data/venues.json'));
  if (!response.ok) throw new Error(`data/venues.json: ${response.status}`);
  const data = (await response.json()) as RouteData;
  return { ...data, venues: sortDrinks(data.venues) };
}
