import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PendingTasks,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as ml from 'maplibre-gl';

import { ArrivalTime, createArrivalTime } from '../arrival-time/arrival-time';
import { Clock } from '../clock';
import { Icon, createIcon } from '../icon/icon';
import { desktop, isTouch, reducedMotion, remInPx } from '../media';
import {
  Route,
  directionsLink,
  distanceAlongRoute,
  distanceToRoute,
  findRoute,
  routeBearing,
} from '../routing';
import { WHOLE } from '../scroll-position';
import { TapasRoute } from '../tapas-route';
import { Themes } from '../theme';
import { UserLocation } from '../user-location';
import {
  Arrival,
  Coordinates,
  StatusKind,
  Venue,
  distanceMeters,
  journeyMinutes,
  photoUrl,
  statusBadge,
  statusKind,
} from '../venues';

const CASTELLON: ml.LngLatLike = [-0.037, 39.986];

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
/** The one the tiles come with, in Spanish; each credit, in one piece (styles/_map.scss). */
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>' +
  '<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a>' +
  '<span>Datos de <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a></span>';
/**
 * Our own, at double size, for some of what OpenFreeMap's sprite lacks (see createMap): the dark
 * style's woods, with the hatching of Dark Matter, the style it comes from (public/map/LICENSE.md).
 */
const OWN_IMAGES: Readonly<Record<string, string>> = {
  'wood-pattern': 'map/wood-pattern@2x.png',
};

/**
 * MapLibre, apart from the rest of the app: it's most of the JS and viewing the photos doesn't need
 * it. The browser downloads it only once, however many times it's requested.
 */
export async function loadMapLibre(): Promise<typeof ml> {
  loadMapLibreStyles();
  const maplibre = await import('maplibre-gl');
  // Published on its own and copied to the root of the build (angular.json).
  maplibre.setWorkerUrl(`maplibre-gl-worker.mjs?v=${maplibre.getVersion()}`);
  return maplibre;
}

/**
 * Its styles, also apart (angular.json): among the app's they would delay the first paint. Much
 * lighter than the code, they get here first. Before the app's, which restyle it.
 */
function loadMapLibreStyles(): void {
  if (document.getElementById('maplibre-styles')) return;
  const link = document.createElement('link');
  link.id = 'maplibre-styles';
  link.rel = 'stylesheet';
  link.href = 'maplibre-gl.css';
  document.head.prepend(link);
}

/**
 * Touch screen (no mouse): one finger scrolls the page and the map moves with two, on pinching
 * (it follows the midpoint between the fingers while it zooms).
 */
const TOUCH = isTouch();

const MIN_ZOOM = -1;
const MAX_ZOOM = 18;

/** How long the map takes to get where it's sent, in ms. */
const MOVE_TIME = 250;

/** Guided, how close up it goes. */
const GUIDE_ZOOM = 17;
/** And how long it takes to keep up with each step, slower: it turns at the corners. */
const GUIDE_TIME = 1000;

const ROUTE_COLOR = '#2563eb';
/** Of the line by car, and of the dots on foot. */
const ROUTE_WIDTH = 5;
/** On foot, from one dot to the next, in pixels. */
const DOT_SPACING = 10;

const STATUS_KINDS: StatusKind[] = ['open', 'soon', 'late', 'closed'];

/** How far a finger must move to know where it's going (fingers tremble a little on touching). */
const DRAG_THRESHOLD = 10;

/** In degrees: how near north a turn can end to go back to it (as MapLibre's bearingSnap). */
const NORTH_SNAP = 7;

/** In meters: how far the starting point can get from the route drawn before asking for another. */
const OFF_ROUTE = 40;

/** How far the map's buttons are from its edges, and a popup from them. */
const BUTTON_MARGIN = 10;
/** Their width, in rem. */
const BUTTON_WIDTH = 2.25;

/**
 * Whether the map has already been moved with two fingers: then they know, and aren't told again.
 * For the whole session, on both maps (list and venue).
 */
let knowsHowToMoveIt = false;

/** Whether they're the same venues, even if in another order or in another array. */
function sameVenues(a: readonly Venue[], b: readonly Venue[]): boolean {
  if (a.length !== b.length) return false;
  const numbers = new Set(b.map((venue) => venue.number));
  return a.every((venue) => numbers.has(venue.number));
}

/** Whether each venue is the same color in both. */
function sameKinds(
  a: ReadonlyMap<number, StatusKind>,
  b: ReadonlyMap<number, StatusKind>,
): boolean {
  return a.size === b.size && [...a].every(([number, kind]) => b.get(number) === kind);
}

/** How long the map takes to go full screen or back, all the way. */
const RESIZE_TIME = 450;
const RESIZE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
/**
 * On the root while the map is full screen or on its way: the page's background, and not the
 * header's, shows where the header leaves (styles/_base.scss).
 */
const LARGE_MAP = 'large-map';
/** What setLarge leaves on the root while the map is full screen or on its way. */
const SMALL_MAP = [
  '--map-large',
  '--map-top',
  '--map-right',
  '--map-bottom',
  '--map-edge-top',
  '--map-edge-bottom',
  '--map-round-top',
  '--map-round-bottom',
  '--map-left',
  '--map-rise',
  '--map-drop',
  '--map-shift-x',
  '--map-shift-y',
];

/**
 * OpenStreetMap map with one marker per venue; it fits the filtered venues. With a starting point, it
 * draws the route to the chosen venue (or the one selected on the map, which gets highlighted). It
 * can go full screen and open the venue in the maps app.
 */
@Component({
  selector: 'app-map',
  imports: [ArrivalTime, Icon],
  template: `
    <div class="frame" [class.large]="large()" [style.--credits-height.px]="creditsHeight()">
      <div #container class="container"></div>
      @if (map()) {
        <div class="buttons left">
          <button
            type="button"
            class="secondary icon"
            title="Acercar"
            aria-label="Acercar"
            [disabled]="closest()"
            (click)="zoomBy(1)"
          >
            <app-icon name="plus" />
          </button>
          <button
            type="button"
            class="secondary icon"
            title="Alejar"
            aria-label="Alejar"
            [disabled]="farthest()"
            (click)="zoomBy(-1)"
          >
            <app-icon name="minus" />
          </button>
        </div>
      }
      <div class="buttons">
        <button
          type="button"
          class="secondary icon expand"
          [title]="enlarged() ? 'Reducir el mapa' : 'Ampliar el mapa'"
          [attr.aria-label]="enlarged() ? 'Reducir el mapa' : 'Ampliar el mapa'"
          (click)="setLarge(!enlarged())"
        >
          <app-icon [name]="enlarged() ? 'collapse' : 'expand'" />
        </button>
        @if (externalLink(); as link) {
          <a
            class="secondary icon"
            [href]="link"
            target="_blank"
            rel="noopener"
            title="Cómo llegar en la app de mapas"
            aria-label="Cómo llegar en la app de mapas"
          >
            <app-icon name="external" />
          </a>
        }
      </div>
      @if (guidedArrival(); as arrival) {
        <app-arrival-time class="guided-arrival" [arrival]="arrival" distance />
      }
      <div class="buttons bottom left">
        @if (originButton(); as label) {
          <button
            type="button"
            class="secondary icon"
            [title]="label"
            [attr.aria-label]="label"
            (click)="goToOrigin()"
          >
            <app-icon name="location" />
          </button>
        }
        @if (canGuide() && !guiding()) {
          <button
            type="button"
            class="secondary icon"
            title="Guiarme hasta el local"
            aria-label="Guiarme hasta el local"
            (click)="startGuiding()"
          >
            <app-icon name="guide" />
          </button>
        }
      </div>
      <div class="buttons bottom">
        @if (rotated()) {
          <button
            type="button"
            class="secondary icon"
            title="Orientar el mapa al norte"
            aria-label="Orientar el mapa al norte"
            (click)="resetNorth()"
          >
            <app-icon name="north" class="needle" [style.rotate.deg]="-bearing()" />
          </button>
        }
      </div>
      <p class="hint" [class.visible]="hint()" aria-hidden="true">
        Usa dos dedos para mover el mapa
      </p>
      @if (noMap()) {
        <p class="no-map">No se ha podido cargar el mapa.</p>
      }
    </div>
  `,
  host: { '(document:keydown.escape)': 'setLarge(false)' },
  styles: `
    @use 'media';

    :host {
      display: block;
    }

    // The map's gap stays on the page; when enlarged, only the frame takes up the screen.
    .frame {
      position: relative;
      height: 100%;

      // Only on phones: on desktop the map is already large, and being sticky (see app.scss) it would
      // stay under the header and the rest of the page.
      @include media.below-desktop {
        &.large {
          position: fixed;
          inset: 0;
          z-index: 1150; // Above the header and the floating buttons.
          // The map reaches the bottom edge, and so does the credits' strip, with their text out of
          // the home indicator's area (styles/_map.scss: MapLibre paints it outside the component).
          padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) 0
            env(safe-area-inset-left, 0px);
          --attribution-bottom: calc(var(--map-large) * env(safe-area-inset-bottom, 0px));
          background: var(--background);
          // On its way (setLarge), clipped from what was shown of it on the page, with round corners
          // (with --map-large at 0), to the whole screen (at 1). Its edges and what goes on them (the
          // buttons, the border) go from where they were, even under the header: the clip hides them
          // there. The variables, only on the way and while full screen: without them, nothing is
          // clipped.
          --frame-closed: calc(1 - var(--map-large));
          --frame-top: calc(var(--frame-closed) * var(--map-top, 0px));
          --frame-right: calc(var(--frame-closed) * var(--map-right, 0px));
          --frame-bottom: calc(var(--frame-closed) * var(--map-bottom, 0px));
          --frame-left: calc(var(--frame-closed) * var(--map-left, 0px));
          --frame-edge-top: calc(var(--frame-closed) * var(--map-edge-top, 0px));
          --frame-edge-bottom: calc(var(--frame-closed) * var(--map-edge-bottom, 0px));
          --frame-radius: calc(var(--frame-closed) * var(--radius));
          // Square where something covered the map: as it was seen.
          --frame-radius-top: calc(var(--frame-radius) * var(--map-round-top, 1));
          --frame-radius-bottom: calc(var(--frame-radius) * var(--map-round-bottom, 1));
          clip-path: inset(
            var(--frame-top) var(--frame-right) var(--frame-bottom) var(--frame-left) round
              var(--frame-radius-top) var(--frame-radius-top) var(--frame-radius-bottom)
              var(--frame-radius-bottom)
          );

          .container {
            border: 0;
            border-radius: 0;
          }

          // The small map's border, which fades on the way.
          &::after {
            content: '';
            position: absolute;
            inset: var(--frame-edge-top) var(--frame-right) var(--frame-edge-bottom)
              var(--frame-left);
            z-index: 999; // Above the map, below its buttons.
            border: 1px solid var(--border);
            border-radius: var(--frame-radius);
            opacity: var(--frame-closed);
            pointer-events: none;
          }
        }
      }
    }

    @include media.desktop {
      .expand {
        display: none;
      }
    }

    // Top right and, the zoom ones, top left: inside the map's border. At the bottom, as far from the
    // credits (see createMap) as the others from the edges: on the left, from the bottom up, those to
    // guide and to go to the user's point; on the right, the one to face north.
    .buttons {
      position: absolute;
      top: 11px;
      right: 11px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      // Full screen, a pixel closer to the edges, which have no border, and out of the safe area. On
      // the way, in the corners of what's shown.
      .large & {
        top: calc(
          var(--frame-edge-top) + 11px + var(--map-large) * (env(safe-area-inset-top, 0px) - 1px)
        );
        right: calc(
          var(--frame-right) + 11px + var(--map-large) * (env(safe-area-inset-right, 0px) - 1px)
        );
      }

      &.left {
        right: auto;
        left: 11px;

        .large & {
          right: auto;
          left: calc(
            var(--frame-left) + 11px + var(--map-large) * (env(safe-area-inset-left, 0px) - 1px)
          );
        }
      }

      &.bottom {
        top: auto;
        bottom: calc(var(--credits-height) + 11px);

        .large & {
          top: auto;
          bottom: calc(
            var(--frame-edge-bottom) + var(--credits-height) + 11px - var(--map-large) * 1px
          );
        }
      }

      // See-through like the credits' strip (styles/_map.scss); on hover, like the other buttons.
      .icon {
        width: 2.25rem;
        height: 2.25rem;
        background: color-mix(in srgb, var(--surface) 80%, transparent);
        box-shadow: 0 1px 5px rgb(0 0 0 / 0.25);

        @media (hover: hover) {
          &:hover:not(:disabled) {
            background: var(--accent-soft);
          }
        }
      }

      .needle {
        --icon-fill: currentColor;
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--brand);
        border-radius: 0.5rem;
        color: var(--brand);
        font-size: 1.1rem;
      }
    }

    // Top center, between the buttons and as tall as them.
    .guided-arrival {
      position: absolute;
      top: 11px;
      left: 50%;
      z-index: 1000;
      height: 2.25rem;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: var(--surface);
      box-shadow: 0 1px 5px rgb(0 0 0 / 0.25);
      white-space: nowrap;
      translate: -50%;

      .large & {
        top: calc(
          var(--frame-edge-top) + 11px + var(--map-large) * (env(safe-area-inset-top, 0px) - 1px)
        );
      }
    }

    // Above the buttons, without catching touches.
    .hint {
      position: absolute;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 1rem;
      border-radius: var(--radius);
      background: rgb(0 0 0 / 0.45);
      color: #fff;
      font-weight: 600;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;

      &.visible {
        opacity: 1;
      }
    }

    .no-map {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 1rem;
      color: var(--muted);
      text-align: center;
    }

    .container {
      height: 100%;
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
  `,
})
export class VenueMap {
  readonly venues = input.required<readonly Venue[]>();
  /** Starting point, if one was chosen. */
  readonly origin = input<Coordinates | null>(null);
  /**
   * Venue to always draw the route to (in the venue view, which has no popups: its data is already on
   * the page); otherwise, the one selected on the map.
   */
  readonly routeTo = input<number | null>(null);
  /** Number of the venue whose marker was clicked. */
  readonly venueSelect = output<number>();
  /** Number of the venue to open, from the button on its popup. */
  readonly venueOpen = output<number>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly tapasRoute = inject(TapasRoute);
  private readonly clock = inject(Clock);
  private readonly location = inject(UserLocation);
  private readonly themes = inject(Themes);

  /** Full screen, as laid out: also while it goes back to its place (see setLarge). */
  protected readonly large = signal(false);
  /** Full screen, as asked for: the button already says what it does next. */
  protected readonly enlarged = signal(false);
  /** Going full screen or back, while it lasts. */
  private resizing?: Animation;
  private readonly injector = inject(Injector);
  private readonly desktopQuery = desktop();
  private readonly desktop = signal(this.desktopQuery.matches);
  /**
   * Only in the list (the venue view has its data on the page), and not on desktop: there the list is
   * next to the map, and clicking a marker takes it to its card.
   */
  private readonly popups = computed(() => this.routeTo() === null && !this.desktop());
  /** The whole map on screen, below the header. */
  private readonly inSight = signal(false);
  /**
   * Venue selected on opening its popup (or, without popups, on clicking its marker or going to it).
   * When closed (by clicking outside) it stays selected, with its route; clicking outside again
   * deselects it.
   */
  private readonly selected = signal<number | null>(null);
  private readonly active = computed(() => this.routeTo() ?? this.selected());
  /**
   * Those with a marker. It only changes when which ones they are changes: the list arrives in a new
   * array on reordering it, marking a favorite or rating a tapa, and the map doesn't have to move.
   */
  private readonly placed = computed(() => this.venues().filter((venue) => venue.location), {
    equal: sameVenues,
  });
  private readonly destination = computed(() => {
    const number = this.active();
    return this.venues().find((venue) => venue.number === number && venue.location);
  });
  /**
   * Each marker's color. Every minute there are new statuses, because the minutes left change, but
   * this only changes when some color does: until then, the markers aren't touched.
   */
  private readonly kinds = computed(
    () => {
      const arrivals = this.tapasRoute.arrivals();
      return new Map(
        [...this.tapasRoute.statuses()].map(([number, status]) => [
          number,
          statusKind(status, arrivals.get(number)),
        ]),
      );
    },
    { equal: sameKinds },
  );

  /**
   * Where the route drawn starts. The starting point moves with the phone, but while it stays on the
   * route this doesn't change: there's no need to ask for it again, nor to redraw it or frame it.
   */
  private readonly routeStart = computed(() => this.origin(), {
    equal: (a, b) => {
      if (!a || !b) return a === b;
      const route = this.route();
      return (route ? distanceToRoute(b, route) : distanceMeters(a, b)) < OFF_ROUTE;
    },
  });
  /** On foot or by car: the arrival itself changes with every step, but this rarely does. */
  private readonly routeMode = computed(() => {
    const venue = this.destination();
    return venue && this.tapasRoute.arrivals().get(venue.number)?.mode;
  });

  protected readonly externalLink = computed(() => {
    const venue = this.destination();
    if (!venue?.location) return null;
    const arrival = this.tapasRoute.arrivals().get(venue.number);
    return directionsLink(venue.location, venue.name, arrival?.mode);
  });

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  /** Once MapLibre has arrived (see createMap). */
  protected readonly map = signal<ml.Map | undefined>(undefined);
  /** MapLibre couldn't be downloaded, or there's no WebGL2 for it. */
  protected readonly noMap = signal(false);
  protected readonly hint = signal(false);
  private hideHint?: ReturnType<typeof setTimeout>;
  private readonly zoom = signal(13);
  /**
   * As far as it goes: MapLibre doesn't let the world (512 pixels high at zoom 0) get shorter than the
   * map, which in most maps comes before MIN_ZOOM. Measured with the map (see createMap).
   */
  private readonly farthestZoom = signal(MIN_ZOOM);
  protected readonly closest = computed(() => this.zoom() >= MAX_ZOOM);
  /** Give or take a rounding: MapLibre gets there by its own sums. */
  protected readonly farthest = computed(() => this.zoom() <= this.farthestZoom() + 1e-6);
  /** Which way is up, in degrees clockwise from north. */
  protected readonly bearing = signal(0);
  /** On its way back to the north (see resetNorth): until it gets there or is moved otherwise. */
  private readonly northBound = signal(false);
  /** The north button goes away as soon as it's pressed, not on getting there. */
  protected readonly rotated = computed(() => this.bearing() !== 0 && !this.northBound());
  /** Of the strip with the credits, the bottom buttons' floor. */
  protected readonly creditsHeight = signal(0);
  /**
   * The map is on the user's point, or on its way there (see goToOrigin): until it's moved off it
   * (see createMap), or the point moves.
   */
  private readonly onOrigin = linkedSignal({ source: this.origin, computation: () => false });
  /**
   * The button to go to the user's point, by what it is. Not while guiding, nor once pressed: the map
   * is on it. Like the north one, it goes away as soon as it's pressed, not on getting there.
   */
  protected readonly originButton = computed(() => {
    if (!this.map() || !this.origin() || this.guiding() || this.onOrigin()) return null;
    return this.location.live() ? 'Ir a mi ubicación' : 'Ir al punto de partida';
  });
  /** With the starting point moving with the phone and a venue to go to. */
  protected readonly canGuide = computed(
    () => !!this.map() && this.location.live() && !!this.destination(),
  );
  /**
   * The map keeps up with the user (see guide). Until it's moved by hand, and off whenever guiding
   * becomes possible or stops being so.
   */
  protected readonly guiding = linkedSignal({ source: this.canGuide, computation: () => false });
  /** Guided, how long to the venue: by what's left of the route (until it arrives, as in the list). */
  protected readonly guidedArrival = computed((): Arrival | undefined => {
    const origin = this.origin();
    const venue = this.destination();
    const route = this.route();
    if (!this.guiding() || !origin || !venue) return undefined;
    const arrival = this.tapasRoute.arrivals().get(venue.number);
    if (!arrival || !route) return arrival;
    const meters = distanceAlongRoute(origin, route);
    return { meters, mode: arrival.mode, minutes: journeyMinutes(meters, arrival.mode) };
  });
  /** Where a finger landed on the map, until it's known where it's going. */
  private touchStart?: { x: number; y: number };
  // Created with the map: if there's a map, they're there.
  private maplibre!: typeof ml;
  private originMarker!: ml.Marker;
  private originTooltip!: ml.Popup;
  /** The style showing: the theme's. */
  private style = this.themeStyle();
  /** The route drawn, from the starting point itself: it may be some way off the street it begins on. */
  private readonly route = signal<Route | undefined>(undefined);
  private readonly markers = new Map<number, ml.Marker>();
  private resizeObserver?: ResizeObserver;
  /** The venue asked to be focused before MapLibre arrived. */
  private pendingFocus: number | null = null;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const pendingTasks = inject(PendingTasks);
    afterNextRender(() => {
      // By hand and passive: with Angular's, if the finger starts on the map, the browser would have
      // to wait for them to finish before scrolling (none of them calls preventDefault).
      const container = this.container().nativeElement;
      const passive = { passive: true };
      container.addEventListener('touchstart', (event) => this.startTouch(event), passive);
      container.addEventListener('touchmove', (event) => this.showHint(event), passive);
      container.addEventListener('touchend', () => (this.touchStart = undefined), passive);
      // Before the map hears about it.
      const before = { passive: true, capture: true };
      container.addEventListener('touchstart', (event) => this.keepDoubleTap(event), before);

      this.watchSight(container);
      pendingTasks.run(() => this.createMap(container));
    });

    effect(() => this.location.mapInSight.set(this.large() || this.inSight()));
    // Leaving the venue on its way: the page stays as it is.
    this.destroyRef.onDestroy(() => {
      this.resizing?.cancel();
      this.forgetSmall();
    });

    // Over the map, the page still scrolls: with one finger (the map moves with two) and with the
    // mouse wheel (it zooms the map with Ctrl, ⌘ on Mac, or pinching on a trackpad, as in Google
    // Maps). Enlarged there's no page to scroll: it moves with one finger and zooms with the wheel.
    effect(() => {
      const gestures = this.map()?.cooperativeGestures;
      if (!gestures) return;
      if (this.large()) gestures.disable();
      else gestures.enable();
    });

    effect(() => {
      const map = this.map();
      const style = this.themeStyle();
      if (!map || style === this.style) return;
      this.style = style;
      map.setStyle(style);
    });

    // Route along the streets to the venue, with the same mode (on foot or by car) as the arrival time.
    effect((onCleanup) => {
      const map = this.map();
      const origin = this.routeStart();
      const venue = this.destination();
      const mode = this.routeMode();
      const fixed = this.routeTo() !== null;
      if (!map) return;
      this.route.set(undefined);
      untracked(() => this.drawRoute(map));
      if (!origin || !venue?.location || !mode) return;
      let current = true;
      onCleanup(() => (current = false));
      void findRoute(origin, venue.location, mode).then((route) => {
        if (!current || !route) return;
        this.route.set([[origin.lng, origin.lat], ...route]);
        this.drawRoute(map);
        // In the venue view, show the whole route; with a popup open the map doesn't move. Guided, it
        // looks along it (see the effect below).
        if (fixed) this.frame(map, this.route()!, 16);
      });
    });

    // Guided, the map keeps up with every step and with the route, when it arrives (guide reads them).
    effect(() => {
      const map = this.map();
      if (map) this.guide(map);
    });

    // Guided, the screen stays on. Hiding the app lets go of it: it's asked for again on coming back.
    effect((onCleanup) => {
      if (!this.guiding() || !('wakeLock' in navigator)) return;
      let lock: Promise<WakeLockSentinel | void> | undefined;
      const request = () => {
        if (!document.hidden) lock = navigator.wakeLock.request('screen').catch(() => {});
      };
      request();
      document.addEventListener('visibilitychange', request);
      onCleanup(() => {
        document.removeEventListener('visibilitychange', request);
        void lock?.then((sentinel) => sentinel?.release());
      });
    });

    // The open popup keeps up with the arrival time and the schedule status.
    effect(() => {
      const venue = this.destination();
      const status = venue && this.popupStatus(venue);
      const popup = venue && this.markers.get(venue.number)?.getPopup();
      if (!status || !popup?.isOpen()) return;
      popup
        .getElement()
        .querySelector('.popup-status')!
        .replaceChildren(...status);
    });

    const onDesktop = ({ matches }: MediaQueryListEvent) => this.desktop.set(matches);
    this.desktopQuery.addEventListener('change', onDesktop);

    this.destroyRef.onDestroy(() => {
      this.desktopQuery.removeEventListener('change', onDesktop);
      this.resizeObserver?.disconnect();
      this.map()?.remove();
      clearTimeout(this.hideHint);
      this.location.mapInSight.set(false);
    });

    // One marker per venue, in the color of its schedule badge (open, about to close, no time to get
    // there, closed); the active one, golden (like the stars) and above the others.
    effect(() => {
      const map = this.map();
      const venues = this.placed();
      const active = this.active();
      const kinds = this.kinds();
      const popups = this.popups();
      if (!map) return;
      untracked(() => {
        this.paint(map, venues);
        this.setPopups(venues, popups);
      });
      for (const [number, marker] of this.markers) {
        const kind = kinds.get(number);
        const classes = marker.getElement().classList;
        for (const other of STATUS_KINDS) classes.toggle(other, other === kind);
        classes.toggle('active', number === active);
      }
      const number = this.pendingFocus;
      this.pendingFocus = null;
      if (number !== null) untracked(() => this.focus(number));
    });

    effect(() => {
      const map = this.map();
      const origin = this.origin();
      const lost = this.location.lost();
      if (!map) return;
      const point = this.originMarker.getElement();
      if (origin) {
        this.originTooltip.setLngLat([origin.lng, origin.lat]);
        this.originMarker.setLngLat([origin.lng, origin.lat]);
        // Adding it again would restart the flicker.
        if (!point.isConnected) this.originMarker.addTo(map);
      } else {
        this.originTooltip.remove();
        this.originMarker.remove();
      }
      point.classList.toggle('lost', lost);
    });
  }

  /**
   * Full screen or back, on a phone (on desktop there's no button). It goes from where it is on the
   * page to the whole screen, clipped (styles here and in styles/_map.scss): the header goes up with
   * its top edge and what's below it, down with its bottom edge (app.scss). All of it follows
   * --map-large, from 0 (in its place) to 1 (full screen), on the root. Laid out full screen from the
   * start, and in its place only once back: the map doesn't change size on the way, which would
   * make MapLibre paint it again on every frame. Pressed again on the way, it turns back from there.
   */
  protected setLarge(large: boolean): void {
    if (large === this.enlarged()) return;
    this.enlarged.set(large);
    const root = document.documentElement;
    // Where it is on the way: until the animation is cancelled, the value it gives.
    const at = this.resizing
      ? parseFloat(getComputedStyle(root).getPropertyValue('--map-large')) || 0
      : Number(!large);
    this.resizing?.cancel();
    this.resizing = undefined;
    if (large && !this.large()) {
      // From its place: measured before laying it out full screen, and again once it is.
      const small = this.host.getBoundingClientRect();
      this.placeSmall(small, new DOMRect(0, 0, innerWidth, innerHeight));
      root.style.setProperty('--map-large', '0');
      root.classList.add(LARGE_MAP);
      this.large.set(true);
      afterNextRender(
        () => {
          this.placeSmall(small, this.host.querySelector('.frame')!.getBoundingClientRect());
          this.resize(0, 1);
        },
        { injector: this.injector },
      );
      return;
    }
    this.resize(at, Number(large));
  }

  /**
   * Where the small map is, on a screen the size of the frame full screen. What was shown of it, for
   * the clip and for what makes way: not under the header, nor below the screen, so that what was
   * hidden there doesn't appear. And where its edges are, even hidden, for what goes on them. What
   * it shows stays where it was: full screen, MapLibre keeps the same center, in the middle of the
   * map.
   */
  private placeSmall(small: DOMRect, frame: DOMRect): void {
    const header = document.querySelector('.header')?.getBoundingClientRect().bottom ?? frame.top;
    const top = Math.max(small.top, header) - frame.top;
    const bottom = frame.bottom - Math.min(small.bottom, frame.bottom);
    const edgeTop = small.top - frame.top;
    const edgeBottom = frame.bottom - small.bottom;
    const map = this.map()?.getContainer().getBoundingClientRect() ?? frame;
    const set = (name: string, px: number) =>
      document.documentElement.style.setProperty(name, `${px}px`);
    set('--map-top', top);
    set('--map-right', frame.right - small.right);
    set('--map-bottom', bottom);
    set('--map-left', small.left - frame.left);
    set('--map-edge-top', edgeTop);
    set('--map-edge-bottom', edgeBottom);
    document.documentElement.style.setProperty('--map-round-top', String(Number(top <= edgeTop)));
    document.documentElement.style.setProperty(
      '--map-round-bottom',
      String(Number(bottom <= edgeBottom)),
    );
    set('--map-rise', -top);
    set('--map-drop', bottom);
    set('--map-shift-x', small.left + small.width / 2 - (map.left + map.width / 2));
    set('--map-shift-y', small.top + small.height / 2 - (map.top + map.height / 2));
  }

  /** From that far on the way to that far, in the time it takes for that distance. */
  private resize(from: number, to: number): void {
    const root = document.documentElement;
    const animation = root.animate([{ '--map-large': from }, { '--map-large': to }], {
      duration: reducedMotion() ? 0 : RESIZE_TIME * Math.abs(to - from),
      easing: RESIZE_EASING,
      fill: 'forwards',
    });
    this.resizing = animation;
    animation.finished.then(
      () => {
        if (this.resizing !== animation) return;
        this.resizing = undefined;
        root.style.setProperty('--map-large', String(to));
        animation.cancel();
        if (to) return;
        // Back in its place, where it already looks to be.
        this.large.set(false);
        afterNextRender(() => this.forgetSmall(), { injector: this.injector });
      },
      () => {},
    );
  }

  /** Without the variables, nothing makes way: the header and the card stay as they are. */
  private forgetSmall(): void {
    const root = document.documentElement;
    for (const name of SMALL_MAP) root.style.removeProperty(name);
    root.classList.remove(LARGE_MAP);
  }

  /** Zooms in on a venue and opens its popup; with no popup, it just centers it. */
  focus(number: number): void {
    const map = this.map();
    if (!map) {
      this.pendingFocus = number;
      return;
    }
    const marker = this.markers.get(number);
    if (!marker) return;
    this.guiding.set(false);
    // The component, not its container: the page gives it its scroll-margin-top (app.scss).
    this.host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const zoom = 16;
    const popup = marker.getPopup();
    if (popup) {
      if (!popup.isOpen()) marker.togglePopup();
      this.placePopup(marker, zoom);
    } else {
      this.selected.set(number);
      map.easeTo({ center: marker.getLngLat(), zoom, duration: MOVE_TIME });
    }
  }

  /**
   * As close as on going to a venue (see focus), or closer if it already was. Without turning it. On
   * the point once on its way: easeTo first ends the move under way, and that one didn't get there.
   */
  protected goToOrigin(): void {
    const map = this.map()!;
    const { lng, lat } = this.origin()!;
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: MOVE_TIME });
    this.onOrigin.set(true);
  }

  /** Its popup would hide the way ahead: it gets closed, and its venue stays selected. */
  protected startGuiding(): void {
    this.openPopup?.remove();
    this.guiding.set(true);
  }

  // These buttons move the map by hand too, and stop guiding.

  protected zoomBy(levels: number): void {
    const map = this.map()!;
    this.guiding.set(false);
    map.zoomTo(map.getZoom() + levels, { duration: MOVE_TIME });
  }

  protected resetNorth(): void {
    this.guiding.set(false);
    this.northBound.set(true);
    this.map()!.resetNorth({ duration: MOVE_TIME });
  }

  /** The theme's map. */
  private themeStyle(): string {
    return this.themes.dark() ? STYLE_DARK : STYLE_LIGHT;
  }

  /** As soon as MapLibre arrives, the map. Without WebGL2 it throws on creating it. */
  private async createMap(container: HTMLElement): Promise<void> {
    let map: ml.Map;
    try {
      const maplibre = await loadMapLibre();
      if (this.destroyRef.destroyed) return;
      this.maplibre = maplibre;
      map = new maplibre.Map({
        container,
        style: this.style,
        transformStyle: (_, style) => this.ownStyle(style),
        center: CASTELLON,
        zoom: this.zoom(),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // It turns (twisting two fingers; with the right button, or Ctrl, and the mouse; with Shift
        // and the arrows), but stays flat: two fingers going up together move it.
        maxPitch: 0,
        touchPitch: false,
        // Ours, smooth (see NORTH_SNAP below).
        bearingSnap: 0,
        // See the observer below.
        trackResize: false,
        attributionControl: { compact: false },
        locale: { 'Map.Title': 'Mapa' },
      });
      // OpenFreeMap's sprite lacks images its styles ask for: in the dark one, the woods' pattern and
      // the towns' dot (below zoom 9); in both, some icons of places (offices, sports centres…).
      // Without them they aren't drawn: ours if there is one (OWN_IMAGES); otherwise a blank one,
      // which leaves them so with no warning in the console. Each tile asks: only the first adds it.
      map.setMissingStyleImageResolver(async (id) => {
        const url = OWN_IMAGES[id];
        const image = url
          ? (await map.loadImage(url)).data
          : { width: 1, height: 1, data: new Uint8Array(4) };
        if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: url ? 2 : 1 });
      });
    } catch {
      this.noMap.set(true);
      return;
    }
    const origin = document.createElement('div');
    origin.className = 'origin-marker';
    this.originMarker = new this.maplibre.Marker({ element: origin });
    // Like the venues' popups (styles/_popups.scss), pointing at it from above.
    this.originTooltip = new this.maplibre.Popup({
      anchor: 'bottom',
      className: 'origin-tooltip',
      closeButton: false,
      closeOnClick: false,
      focusAfterOpen: false,
      offset: 7,
    }).setText('Punto de partida');
    origin.addEventListener('mouseenter', () => this.originTooltip.addTo(map));
    origin.addEventListener('mouseleave', () => this.originTooltip.remove());
    // The click that closes a popup leaves its venue selected; with none open, it deselects it. Not on
    // a marker: that one gets selected, on opening its popup or, without one, on clicking it.
    map.on('click', ({ originalEvent }) => {
      const target = originalEvent.target as Element;
      if (!this.openPopup && !target.closest('.venue-marker')) this.selected.set(null);
      // On touch screens there's no hovering: touching it shows the tooltip, and elsewhere hides it.
      if (originalEvent.target === origin) this.originTooltip.addTo(map);
      else this.originTooltip.remove();
    });
    map.on('zoomend', () => {
      this.zoom.set(map.getZoom());
      if (this.route()) this.drawDots(map);
    });
    map.on('rotate', () => this.bearing.set(map.getBearing()));
    // Moved by hand (with the fingers, the mouse or the keyboard), it stops guiding. When the app
    // moves it, there's no original event.
    map.on('movestart', ({ originalEvent }) => {
      if (originalEvent) this.guiding.set(false);
    });
    // A turn that ends near north goes back to it. MapLibre does it within the momentum the fingers or
    // the mouse leave on letting go, as long as that lasts: after a slow turn, a few hundredths of a
    // second, and it jumps. Here, once it has stopped, at the pace of the north button. Only after a
    // gesture: when the app moves the map there's no original event. Any move, on ending (even cut short
    // by another), ends the way back to the north, and the way to the user's point if it isn't in the
    // center (under a pixel away: zooming or turning around it leaves it there).
    map.on('moveend', ({ originalEvent }) => {
      this.northBound.set(false);
      const origin = this.origin();
      const center = map.project(map.getCenter());
      if (origin && center.dist(map.project([origin.lng, origin.lat])) >= 1) {
        this.onOrigin.set(false);
      }
      const bearing = map.getBearing();
      if (originalEvent && bearing !== 0 && Math.abs(bearing) < NORTH_SNAP) this.resetNorth();
    });
    // One line or two, with the width of the map, and empty until the style arrives.
    const credits = container.querySelector('.maplibregl-ctrl-attrib')!;
    const creditsObserver = new ResizeObserver(([entry]) =>
      this.creditsHeight.set(entry.borderBoxSize[0].blockSize),
    );
    creditsObserver.observe(credits);
    this.destroyRef.onDestroy(() => creditsObserver.disconnect());
    // Every time its size changes (on enlarging or reducing it, when the scrollbar comes or goes…), the
    // map has to measure again and paint at once (resizing clears it), the open popup, if any, to fit
    // again and, guided, the user's point to go back to its place. By hand and not with MapLibre's
    // trackResize, which would do it too late for the popup. Taller, it can't go as far out: if it
    // was, it gets closer.
    this.resizeObserver = new ResizeObserver(() => {
      this.farthestZoom.set(Math.max(MIN_ZOOM, Math.log2(container.clientHeight / 512)));
      map.resize().redraw();
      this.zoom.set(map.getZoom());
      this.guide(map, 0);
      const popup = this.openPopup;
      if (popup) {
        this.fitPopup(popup);
        this.placePopup(this.markers.get(this.selected()!)!);
      }
    });
    this.resizeObserver.observe(container);
    this.map.set(map);
  }

  /**
   * What the app adds to the theme's style, each time one arrives: the names in Spanish (it prefers
   * the English ones), or as they are on the street signs where OpenStreetMap has no Spanish one, the
   * credits and the route, on top of it all.
   */
  private ownStyle(style: ml.StyleSpecification): ml.StyleSpecification {
    const own: ml.StyleSpecification = JSON.parse(
      JSON.stringify(style).replaceAll('"name_en"', '"name:es"'),
    );
    const tiles = own.sources['openmaptiles'];
    if (tiles?.type === 'vector') tiles.attribution = ATTRIBUTION;
    own.sources['route'] = { type: 'geojson', data: this.routeLine() };
    own.sources['route-dots'] = { type: 'geojson', data: this.routeDots() };
    own.layers.push(
      {
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_COLOR, 'line-width': ROUTE_WIDTH, 'line-opacity': 0.85 },
      },
      {
        id: 'route-dots',
        type: 'circle',
        source: 'route-dots',
        paint: {
          'circle-color': ROUTE_COLOR,
          'circle-radius': ROUTE_WIDTH / 2,
          'circle-opacity': 0.85,
        },
      },
    );
    return own;
  }

  /** By car, a solid line. */
  private routeLine(): ml.GeoJSONSourceSpecification['data'] {
    const route = this.routeMode() === 'walking' ? undefined : this.route();
    return {
      type: 'FeatureCollection',
      features: route
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: route.slice(1) },
            },
          ]
        : [],
    };
  }

  /**
   * On foot, dots: round and DOT_SPACING apart at the zoom of the moment (a dashed line stretches its
   * dots on zooming in, until the next whole level). On zooming they're placed again (createMap).
   */
  private routeDots(): ml.GeoJSONSourceSpecification['data'] {
    const map = this.map();
    const dots: [number, number][] = [];
    const route = this.route();
    if (map && route && this.routeMode() === 'walking') {
      const points = route.slice(1).map((point) => map.project(point));
      let next = 0; // Where the next dot goes, in pixels from the start of the stretch.
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        for (; next < length; next += DOT_SPACING) {
          const t = next / length;
          dots.push(map.unproject([a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)]).toArray());
        }
        next -= length;
      }
    }
    return {
      type: 'FeatureCollection',
      features: dots.length
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: dots } }]
        : [],
    };
  }

  /** Until its style arrives there's nothing to draw it on: it will come with it (ownStyle). */
  private drawRoute(map: ml.Map): void {
    if (!map.getLayer('route')) return;
    map.getSource<ml.GeoJSONSource>('route')!.setData(this.routeLine());
    this.drawDots(map);
  }

  private drawDots(map: ml.Map): void {
    map.getSource<ml.GeoJSONSource>('route-dots')?.setData(this.routeDots());
  }

  /**
   * Guided: the user's point a quarter of the way up from the bottom, close up, with the route ahead
   * pointing up (until it arrives, the venue). Nothing if not guiding.
   */
  private guide(map: ml.Map, duration = GUIDE_TIME): void {
    const origin = this.origin();
    const destination = this.destination()?.location;
    if (!this.guiding() || !origin || !destination) return;
    const route = this.route() ?? [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ];
    map.easeTo({
      center: [origin.lng, origin.lat],
      zoom: GUIDE_ZOOM,
      bearing: routeBearing(origin, route) ?? map.getBearing(),
      offset: [0, map.getContainer().clientHeight / 4],
      duration,
    });
  }

  /** Without turning it back to the north, as it would by default. Not while guiding (see guide). */
  private frame(map: ml.Map, points: ml.LngLatLike[], maxZoom: number, animate = true): void {
    if (this.guiding()) return;
    const bounds = points.reduce(
      (all, point) => all.extend(point),
      new this.maplibre.LngLatBounds(),
    );
    map.fitBounds(bounds, {
      padding: 30,
      maxZoom,
      bearing: map.getBearing(),
      linear: true,
      duration: MOVE_TIME,
      animate,
    });
  }

  /** Only with the whole map in sight: half of it, with the list below, doesn't count. */
  private watchSight(container: HTMLElement): void {
    const header = document.querySelector<HTMLElement>('.header')?.offsetHeight ?? 0;
    const observer = new IntersectionObserver(
      (entries) => this.inSight.set(entries.at(-1)!.intersectionRatio >= WHOLE),
      { rootMargin: `-${header}px 0px 0px`, threshold: WHOLE },
    );
    observer.observe(container);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** A double tap stays on the popup, like clicks: the map doesn't zoom. */
  private keepDoubleTap({ target }: TouchEvent): void {
    const zoom = this.map()?.doubleClickZoom;
    if ((target as Element).closest('.venue-popup')) zoom?.disable();
    else zoom?.enable();
  }

  private startTouch(event: TouchEvent): void {
    if (event.touches.length > 1) knowsHowToMoveIt = true;
    const [finger] = event.touches;
    this.touchStart =
      event.touches.length === 1 ? { x: finger.clientX, y: finger.clientY } : undefined;
  }

  /**
   * On trying to move the map with one finger, it reminds that it takes two (and the page keeps
   * scrolling). Only when dragging sideways: vertically it's scrolling the page, which is what it
   * wanted.
   */
  private showHint(event: TouchEvent): void {
    const start = this.touchStart;
    if (!start || !TOUCH || this.large() || knowsHowToMoveIt || event.touches.length !== 1) return;
    const [finger] = event.touches;
    const dx = Math.abs(finger.clientX - start.x);
    const dy = Math.abs(finger.clientY - start.y);
    if (Math.max(dx, dy) < DRAG_THRESHOLD) return;
    this.touchStart = undefined; // Decided for the whole drag.
    if (dx <= dy) return;
    this.hint.set(true);
    clearTimeout(this.hideHint);
    this.hideHint = setTimeout(() => this.hint.set(false), 1200);
  }

  /**
   * Removes the markers of those no longer there and adds those of the new ones (the others, with
   * their popup open if they have one, stay as they are). If anything changed, it frames those left:
   * at once if there was nothing to come from.
   */
  private paint(map: ml.Map, venues: readonly Venue[]): void {
    const numbers = new Set(venues.map((venue) => venue.number));
    const removed = [...this.markers.keys()].filter((number) => !numbers.has(number));
    for (const number of removed) {
      this.markers.get(number)!.remove();
      this.markers.delete(number);
    }
    // If the selected one is no longer among the filtered ones, it stops being selected.
    const selected = this.selected();
    if (selected !== null && !numbers.has(selected)) this.selected.set(null);
    const added = venues.filter((venue) => !this.markers.has(venue.number));
    const animate = this.markers.size > 0;
    if (added.length) this.addMarkers(map, added);
    if ((removed.length || added.length) && this.markers.size) {
      const points = [...this.markers.values()].map((marker) => marker.getLngLat());
      this.frame(map, points, 15, animate);
    }
  }

  private addMarkers(map: ml.Map, venues: readonly Venue[]): void {
    const clickable = this.routeTo() === null;
    for (const venue of venues) {
      if (!venue.location) continue;
      // A small dot (styles/_map.scss) in the middle of an area to click on.
      const element = document.createElement('div');
      element.className = 'venue-marker';
      element.title = `${venue.number}. ${venue.name}`;
      const marker = new this.maplibre.Marker({ element });
      marker.setLngLat([venue.location.lng, venue.location.lat]);
      if (clickable) {
        element.role = 'button';
        marker.on('click', () => {
          if (!marker.getPopup()) this.selected.set(venue.number);
          this.venueSelect.emit(venue.number);
        });
      } else {
        element.classList.add('static');
      }
      marker.addTo(map);
      this.markers.set(venue.number, marker);
    }
  }

  /** Gives the markers their popup, or takes it away, as the layout changes (see popups). */
  private setPopups(venues: readonly Venue[], popups: boolean): void {
    let offset: number | undefined;
    for (const venue of venues) {
      const marker = this.markers.get(venue.number);
      if (!marker || !!marker.getPopup() === popups) continue;
      if (!popups) {
        marker.setPopup(null);
        continue;
      }
      // Reading the font size forces a style recalculation: only when one has to be created.
      offset ??= Math.round(0.35 * remInPx());
      const popup = new this.maplibre.Popup({
        anchor: 'bottom',
        offset,
        className: 'map-popup',
        maxWidth: 'none', // See fitPopup.
        closeButton: false,
        focusAfterOpen: false,
      });
      popup.on('open', () => this.showPopup(venue, marker));
      marker.setPopup(popup);
    }
  }

  /** The only one open: the selected venue's, if it hasn't been closed. */
  private get openPopup(): ml.Popup | undefined {
    const popup = this.markers.get(this.selected()!)?.getPopup();
    return popup?.isOpen() ? popup : undefined;
  }

  /**
   * The content is generated just before measuring it, with the schedule status of that moment. The
   * popup goes among the markers so that what starts on it reaches the map: dragging it moves the map
   * (which also keeps the button from being clicked on letting go). Clicks are still only its own.
   */
  private showPopup(venue: Venue, marker: ml.Marker): void {
    const popup = marker.getPopup()!;
    if (this.openPopup !== popup) this.openPopup?.remove();
    this.guiding.set(false); // It moves the map to make room for it.
    this.selected.set(venue.number);
    this.fitPopup(popup);
    popup.setDOMContent(this.popup(venue));
    this.map()!.getCanvasContainer().append(popup.getElement());
    this.placePopup(marker);
  }

  /**
   * As wide as the map allows, between its buttons with their margin on both sides: at most, since its
   * photos have a limit too (styles/_popups.scss).
   */
  private fitPopup(popup: ml.Popup): void {
    const side = 2 * BUTTON_MARGIN + Math.round(BUTTON_WIDTH * remInPx());
    popup.setMaxWidth(`${this.map()!.getContainer().clientWidth - 2 * side}px`);
  }

  /**
   * Moves the map to leave an open popup in its place, at the zoom given (the current one if none).
   * Its venue, always in the middle, which leaves the popup centered between the buttons: enlarged, a
   * third of the way down, or lower if the popup doesn't fit above; otherwise, with the popup as high
   * as it goes, as far from the top as the buttons.
   */
  private placePopup(marker: ml.Marker, zoom = this.map()!.getZoom()): void {
    const map = this.map()!;
    const icon = marker.getElement().getBoundingClientRect();
    const popup = marker.getPopup()!.getElement().getBoundingClientRect();
    const highest = icon.top + icon.height / 2 - popup.top + BUTTON_MARGIN;
    const { clientHeight: height } = map.getContainer();
    const y = this.large() ? Math.max(height / 3, highest) : highest;
    map.easeTo({
      center: marker.getLngLat(),
      zoom,
      offset: [0, y - height / 2],
      duration: MOVE_TIME,
    });
  }

  /**
   * Laid out like a card: number, name and address, with a button to the venue on the right. Below,
   * arrival time, schedule status and tapa photos (styles in styles/_popups.scss: MapLibre paints it
   * outside the component).
   */
  private popup(venue: Venue): HTMLElement {
    const div = document.createElement('div');
    div.className = 'venue-popup';
    for (const type of ['click', 'dblclick']) {
      div.addEventListener(type, (event) => event.stopPropagation());
    }
    const header = document.createElement('div');
    header.className = 'popup-header';
    const number = document.createElement('span');
    number.className = 'venue-number';
    number.textContent = `${venue.number}`;
    const heading = document.createElement('div');
    heading.className = 'popup-heading';
    const title = document.createElement('strong');
    title.textContent = venue.name;
    const address = document.createElement('span');
    address.textContent = venue.address;
    heading.append(title, address);
    header.append(number, heading, this.openButton(venue));
    div.append(header);
    const row = document.createElement('div');
    row.className = 'popup-status';
    row.append(...this.popupStatus(venue));
    div.append(row);
    const tapas = document.createElement('div');
    tapas.className = 'popup-tapas';
    for (const tapa of venue.tapas) {
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.src = photoUrl(tapa, 500);
      img.alt = '';
      img.width = 690;
      img.height = 439;
      const name = document.createElement('figcaption');
      name.textContent = tapa.name;
      figure.append(img, name);
      tapas.append(figure);
    }
    div.append(tapas);
    return div;
  }

  /** Arrival time and schedule status, right now. */
  private popupStatus(venue: Venue): HTMLElement[] {
    const arrival = this.tapasRoute.arrivals().get(venue.number);
    const status = this.tapasRoute.statuses().get(venue.number);
    const row: HTMLElement[] = arrival ? [createArrivalTime(arrival)] : [];
    if (status) {
      const { text, kind, warning } = statusBadge(status, this.clock.now(), arrival);
      const badge = document.createElement('span');
      badge.className = `schedule-status ${kind}`;
      badge.textContent = text;
      if (warning) badge.title = warning;
      row.push(badge);
    }
    return row;
  }

  private openButton(venue: Venue): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary icon';
    button.title = 'Ver los detalles del local';
    button.setAttribute('aria-label', button.title);
    button.append(createIcon('list'));
    button.addEventListener('click', () => this.venueOpen.emit(venue.number));
    return button;
  }
}
