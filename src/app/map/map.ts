import {
  Component,
  DestroyRef,
  ElementRef,
  PendingTasks,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as L from 'leaflet';

import { createArrivalTime } from '../arrival-time/arrival-time';
import { Clock } from '../clock';
import { Icon, createIcon } from '../icon/icon';
import { isTouch, remInPx } from '../media';
import { directionsLink, findRoute } from '../routing';
import { ScrollPosition } from '../scroll-position';
import { TapasRoute } from '../tapas-route';
import { Coordinates, StatusKind, Venue, photoUrl, statusBadge, statusKind } from '../venues';

const CASTELLON: L.LatLngExpression = [39.986, -0.037];

/**
 * Leaflet, apart from the rest of the app: it's a third of the JS and viewing the photos doesn't need
 * it. The browser downloads it only once, however many times it's requested.
 */
export async function loadLeaflet(): Promise<typeof L> {
  const module = await import('leaflet');
  // It isn't an ES module: in the production build, what it exports arrives in default.
  return (module as { default?: typeof L }).default ?? module;
}

/**
 * Touch screen (no mouse): one finger scrolls the page and the map moves with two, on pinching
 * (Leaflet moves the map with the midpoint between the fingers while it zooms).
 */
const TOUCH = isTouch();

const STATUS_KINDS: StatusKind[] = ['open', 'soon', 'late', 'closed'];

/** How far a finger must move to know where it's going (fingers tremble a little on touching). */
const DRAG_THRESHOLD = 10;

/**
 * Whether the map has already been moved with two fingers: then they know, and aren't told again.
 * For the whole session, on both maps (list and venue).
 */
let knowsHowToMoveIt = false;

/**
 * A venue's marker: a small dot (styles/_leaflet.scss) in the middle of a 1.875rem area to click on.
 * In rem, like everything else; Leaflet wants it in pixels, so it's calculated on painting.
 */
function venueIcon(leaflet: typeof L, rem: number): L.DivIcon {
  const side = Math.round(1.875 * rem);
  return new leaflet.DivIcon({
    className: 'venue-marker',
    iconSize: [side, side],
    popupAnchor: [0, -Math.round(0.35 * rem)],
  });
}

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

/**
 * OpenStreetMap map with one marker per venue; it fits the filtered venues. With a starting point, it
 * draws the route to the chosen venue (or the one selected on the map, which gets highlighted). It
 * can go full screen and open the venue in the maps app.
 */
@Component({
  selector: 'app-map',
  imports: [Icon],
  template: `
    <div class="frame" [class.large]="large()">
      <div #container class="container"></div>
      <div class="buttons">
        <button
          type="button"
          class="secondary icon expand"
          [title]="large() ? 'Reducir el mapa' : 'Ampliar el mapa'"
          [attr.aria-label]="large() ? 'Reducir el mapa' : 'Ampliar el mapa'"
          (click)="large.set(!large())"
        >
          <app-icon [name]="large() ? 'collapse' : 'expand'" />
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
      <p class="hint" [class.visible]="hint()" aria-hidden="true">
        Usa dos dedos para mover el mapa
      </p>
      @if (noMap()) {
        <p class="no-map">No se ha podido cargar el mapa.</p>
      }
    </div>
  `,
  host: { '(document:keydown.escape)': 'large.set(false)' },
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
          // The map reaches the bottom edge; only the attribution keeps out of the home indicator's
          // area (styles/_leaflet.scss: Leaflet paints it outside the component).
          padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) 0
            env(safe-area-inset-left, 0px);
          --attribution-bottom: env(safe-area-inset-bottom, 0px);
          background: var(--background);

          .container {
            border: 0;
            border-radius: 0;
          }
        }
      }
    }

    @include media.desktop {
      .expand {
        display: none;
      }
    }

    // Top right, like Leaflet's controls (which are on the left).
    .buttons {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .large & {
        top: calc(10px + env(safe-area-inset-top, 0px));
        right: calc(10px + env(safe-area-inset-right, 0px));
      }

      .icon {
        width: 2.25rem;
        height: 2.25rem;
        box-shadow: 0 1px 5px rgb(0 0 0 / 0.25);
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--brand);
        border-radius: 0.5rem;
        background: var(--surface);
        color: var(--brand);
        font-size: 1.1rem;

        &:hover {
          background: var(--accent-soft);
        }
      }
    }

    // Above Leaflet's controls, without catching touches.
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
  /** Venue to always draw the route to (in the venue view); otherwise, the open popup's. */
  readonly routeTo = input<number | null>(null);
  /** Number of the venue whose marker was clicked. */
  readonly venueSelect = output<number>();

  private readonly tapasRoute = inject(TapasRoute);
  private readonly clock = inject(Clock);
  private readonly position = inject(ScrollPosition);

  /** Full screen. */
  protected readonly large = signal(false);
  /**
   * Venue selected on opening its popup. When closed (with its button or by clicking outside) it
   * stays selected, with its route; clicking outside again deselects it.
   */
  private readonly selected = signal<number | null>(null);
  /** Whether a popup was open when the map was clicked (that click only closes it). */
  private hadPopup = false;
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

  protected readonly externalLink = computed(() => {
    const venue = this.destination();
    if (!venue?.location) return null;
    const arrival = this.tapasRoute.arrivals().get(venue.number);
    return directionsLink(venue.location, venue.name, arrival?.mode);
  });

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  /** Once Leaflet has arrived (see createMap). */
  private readonly map = signal<L.Map | undefined>(undefined);
  /** Leaflet couldn't be downloaded. */
  protected readonly noMap = signal(false);
  protected readonly hint = signal(false);
  private hideHint?: ReturnType<typeof setTimeout>;
  /**
   * Where a finger landed on the map, until it's known where it's going. It's cleared on lifting it:
   * Leaflet's controls and popups don't let touchstart through and the previous touch would remain.
   */
  private touchStart?: { x: number; y: number };
  // Created with the map: if there's a map, they're there.
  private leaflet!: typeof L;
  private layer!: L.FeatureGroup;
  private routeLayer!: L.FeatureGroup;
  private originMarker!: L.CircleMarker;
  private readonly markers = new Map<number, L.Marker>();
  private resizeObserver?: ResizeObserver;
  /** The venue asked to be focused before Leaflet arrived. */
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

      pendingTasks.run(() => this.createMap(container));
    });

    // Enlarged, it moves with one finger (there's no page to scroll).
    effect(() => {
      const map = this.map();
      if (!map) return;
      if (this.large() || !TOUCH) map.dragging.enable();
      else map.dragging.disable();
    });

    // Route along the streets to the venue, with the same mode (on foot or by car) as the arrival time.
    effect((onCleanup) => {
      const map = this.map();
      const origin = this.origin();
      const venue = this.destination();
      const arrival = venue && this.tapasRoute.arrivals().get(venue.number);
      const fixed = this.routeTo() !== null;
      if (!map) return;
      this.routeLayer.clearLayers();
      if (!origin || !venue?.location || !arrival) return;
      let current = true;
      onCleanup(() => (current = false));
      void findRoute(origin, venue.location, arrival.mode).then((route) => {
        if (!current || !route) return;
        const line = new this.leaflet.Polyline(route, {
          pane: 'route',
          color: '#2563eb',
          weight: 5,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
          // On foot, dotted; by car, solid.
          dashArray: arrival.mode === 'walking' ? '1 9' : undefined,
          interactive: false,
        }).addTo(this.routeLayer);
        // In the venue view, show the whole route; with a popup open the map doesn't move.
        if (fixed) {
          map.fitBounds(line.getBounds().extend([origin.lat, origin.lng]), {
            padding: [30, 30],
            maxZoom: 17,
          });
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.map()?.remove();
      clearTimeout(this.hideHint);
    });

    // One marker per venue, in the color of its schedule badge (open, about to close, no time to get
    // there, closed); the active one, golden (like the stars) and above the others.
    effect(() => {
      const map = this.map();
      const venues = this.placed();
      const active = this.active();
      const kinds = this.kinds();
      if (!map) return;
      untracked(() => this.paint(map, venues));
      for (const [number, marker] of this.markers) {
        const kind = kinds.get(number);
        const classes = marker.getElement()?.classList;
        for (const other of STATUS_KINDS) classes?.toggle(other, other === kind);
        classes?.toggle('active', number === active);
        const above = number === active ? 1000 : 0;
        if (marker.options.zIndexOffset !== above) marker.setZIndexOffset(above);
      }
      const number = this.pendingFocus;
      this.pendingFocus = null;
      if (number !== null) untracked(() => this.focus(number));
    });

    effect(() => {
      const map = this.map();
      const origin = this.origin();
      if (!map) return;
      if (origin) this.originMarker.setLatLng([origin.lat, origin.lng]).addTo(map);
      else this.originMarker.remove();
    });
  }

  /** Centers the map on a venue and opens its popup. */
  focus(number: number): void {
    const map = this.map();
    if (!map) {
      this.pendingFocus = number;
      return;
    }
    const marker = this.markers.get(number);
    if (!marker) return;
    this.container().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.position.appScrolled();
    map.setView(marker.getLatLng(), 17);
    marker.openPopup();
  }

  /** As soon as Leaflet arrives, the map and its layers. */
  private async createMap(container: HTMLElement): Promise<void> {
    let leaflet: typeof L;
    try {
      leaflet = await loadLeaflet();
    } catch {
      this.noMap.set(true);
      return;
    }
    if (this.destroyRef.destroyed) return;
    this.leaflet = leaflet;
    this.layer = new leaflet.FeatureGroup();
    this.routeLayer = new leaflet.FeatureGroup();
    this.originMarker = new leaflet.CircleMarker(CASTELLON, {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 1,
    }).bindTooltip('Punto de partida');

    // No wheel zoom: scrolling down the page, passing over the map doesn't move it.
    const map = new leaflet.Map(container, {
      center: CASTELLON,
      zoom: 14,
      scrollWheelZoom: false,
      dragging: !TOUCH,
      zoomControl: false,
    });
    // The zoom buttons, with our icons (like those on the right, see styles/_leaflet.scss).
    new leaflet.Control.Zoom({
      zoomInText: createIcon('plus').outerHTML,
      zoomInTitle: 'Acercar',
      zoomOutText: createIcon('minus').outerHTML,
      zoomOutTitle: 'Alejar',
    }).addTo(map);
    new leaflet.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    // The route, under the markers.
    map.createPane('route').style.zIndex = '350';
    // Before the popup closes with the same click (also on preclick, but registered afterwards).
    map.on(
      'preclick',
      () => (this.hadPopup = !!map.getContainer().querySelector('.leaflet-popup')),
    );
    map.on('click', () => {
      if (!this.hadPopup) this.selected.set(null);
    });
    this.routeLayer.addTo(map);
    this.layer.addTo(map);
    // Every time its size changes (on enlarging or reducing it, when the scrollbar comes or goes…),
    // Leaflet has to measure again.
    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(container);
    this.map.set(map);
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
   * their popup open if they have one, stay as they are). If anything changed, it frames those left.
   */
  private paint(map: L.Map, venues: readonly Venue[]): void {
    const numbers = new Set(venues.map((venue) => venue.number));
    const removed = [...this.markers.keys()].filter((number) => !numbers.has(number));
    for (const number of removed) {
      this.layer.removeLayer(this.markers.get(number)!);
      this.markers.delete(number);
    }
    // If the selected one is no longer among the filtered ones, it stops being selected.
    const selected = this.selected();
    if (selected !== null && !numbers.has(selected)) this.selected.set(null);
    const added = venues.filter((venue) => !this.markers.has(venue.number));
    if (added.length) this.addMarkers(added);
    if ((removed.length || added.length) && this.markers.size) {
      map.fitBounds(this.layer.getBounds(), { padding: [30, 30], maxZoom: 16 });
    }
  }

  private addMarkers(venues: readonly Venue[]): void {
    // Reading the font size forces a style recalculation: only when one has to be created.
    const rem = remInPx();
    const icon = venueIcon(this.leaflet, rem);
    const popupWidth = Math.round(15 * rem);
    for (const venue of venues) {
      if (!venue.location) continue;
      const marker = new this.leaflet.Marker([venue.location.lat, venue.location.lng], {
        icon,
        title: `${venue.number}. ${venue.name}`,
        riseOnHover: true,
      })
        // The content is generated on opening, with the schedule status of that moment.
        .bindPopup(() => this.popup(venue), { minWidth: popupWidth, maxWidth: popupWidth })
        .on('click', () => this.venueSelect.emit(venue.number))
        .on('popupopen', () => this.selected.set(venue.number));
      marker.addTo(this.layer);
      this.markers.set(venue.number, marker);
    }
  }

  /**
   * Name, address, arrival time, schedule status and tapa photos (styles in styles/_popups.scss: Leaflet
   * paints it outside the component).
   */
  private popup(venue: Venue): HTMLElement {
    const div = document.createElement('div');
    div.className = 'venue-popup';
    const title = document.createElement('strong');
    title.textContent = `${venue.number}. ${venue.name}`;
    const address = document.createElement('span');
    address.textContent = venue.address;
    div.append(title, address);
    const row = document.createElement('div');
    row.className = 'popup-status';
    const arrival = this.tapasRoute.arrivals().get(venue.number);
    if (arrival) row.append(createArrivalTime(arrival));
    const status = this.tapasRoute.statuses().get(venue.number);
    if (status) {
      const { text, kind, warning } = statusBadge(status, this.clock.now(), arrival);
      const badge = document.createElement('span');
      badge.className = `schedule-status ${kind}`;
      badge.textContent = text;
      if (warning) badge.title = warning;
      row.append(badge);
    }
    if (row.childElementCount) div.append(row);
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
}
