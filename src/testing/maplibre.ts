// What the app uses of MapLibre, for the tests: without WebGL2 the real one doesn't even start in jsdom
// (setup.ts puts this one in its place). It keeps what the app relies on: the same DOM, with clicks
// reaching the map through the element markers go in, and popups that toggle and close the same way.
// Nothing moves: what the camera is asked to do gets checked with spies on these methods.
import type { LngLatLike, StyleSpecification } from 'maplibre-gl';

type Listener = (event: never) => void;

class Evented {
  private listeners: Record<string, Listener[]> = {};

  on(type: string, listener: Listener): this {
    (this.listeners[type] ??= []).push(listener);
    return this;
  }

  off(type: string, listener: Listener): this {
    this.listeners[type] = this.listeners[type]?.filter((other) => other !== listener);
    return this;
  }

  protected fire(type: string, event: unknown = {}): void {
    for (const listener of [...(this.listeners[type] ?? [])]) listener(event as never);
  }
}

export class GPUInitializationError extends Error {}

export class GeoJSONSource {
  constructor(public data: unknown) {}

  setData(data: unknown): void {
    this.data = data;
  }
}

export class LngLatBounds {
  extend(_point: LngLatLike): this {
    return this;
  }
}

interface Options {
  container: HTMLElement;
  style: string;
  center: [number, number];
  zoom: number;
  transformStyle(previous: undefined, next: StyleSpecification): StyleSpecification;
}

/** The part of a real style that the app touches. */
const STYLE: StyleSpecification = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles' } },
  layers: [
    {
      id: 'streets',
      type: 'symbol',
      source: 'openmaptiles',
      layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] },
    },
  ],
};

class FakeMap extends Evented {
  /** Whether there's WebGL2. */
  static webgl2 = true;
  private static readonly maps = new WeakMap<HTMLElement, FakeMap>();

  /** The map of a VenueMap, by its element. */
  static of(el: HTMLElement): FakeMap {
    return FakeMap.maps.get(el.querySelector<HTMLElement>('.container')!)!;
  }

  readonly cooperativeGestures = {
    enabled: false,
    enable() {
      this.enabled = true;
    },
    disable() {
      this.enabled = false;
    },
    isEnabled() {
      return this.enabled;
    },
  };
  readonly doubleClickZoom = {
    enabled: true,
    enable() {
      this.enabled = true;
    },
    disable() {
      this.enabled = false;
    },
    isEnabled() {
      return this.enabled;
    },
  };
  private readonly canvasContainer = document.createElement('div');
  private zoom: number;
  private bearing = 0;
  private style!: StyleSpecification;
  private readonly sources = new globalThis.Map<string, GeoJSONSource>();

  constructor(private readonly options: Options) {
    super();
    if (!FakeMap.webgl2) throw new GPUInitializationError();
    FakeMap.maps.set(options.container, this);
    this.zoom = options.zoom;
    this.canvasContainer.className = 'maplibregl-canvas-container';
    this.canvasContainer.addEventListener('click', (originalEvent) =>
      this.fire('click', { originalEvent }),
    );
    const credits = document.createElement('div');
    credits.className = 'maplibregl-ctrl-attrib';
    options.container.append(this.canvasContainer, credits);
    this.setStyle(options.style);
  }

  setStyle(url: string): this {
    this.options.style = url;
    this.style = this.options.transformStyle(undefined, STYLE);
    this.sources.clear();
    for (const [id, source] of Object.entries(this.style.sources)) {
      if (source.type === 'geojson') this.sources.set(id, new GeoJSONSource(source.data));
    }
    return this;
  }

  getStyle(): StyleSpecification {
    return this.style;
  }

  /** The style's address: in the real one, its contents say which one it is. */
  get styleUrl(): string {
    return this.options.style;
  }

  getLayer(id: string) {
    return this.style.layers.find((layer) => layer.id === id);
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  getContainer(): HTMLElement {
    return this.options.container;
  }

  getCanvasContainer(): HTMLElement {
    return this.canvasContainer;
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Flat, without Mercator: a degree is as long one way as the other, 512 pixels for the world at 0. */
  private get pixelsPerDegree(): number {
    return (512 * 2 ** this.zoom) / 360;
  }

  project(point: [number, number] | { lng: number; lat: number }): {
    x: number;
    y: number;
    dist(other: { x: number; y: number }): number;
  } {
    const [lng, lat] = Array.isArray(point) ? point : [point.lng, point.lat];
    const x = lng * this.pixelsPerDegree;
    const y = -lat * this.pixelsPerDegree;
    return { x, y, dist: (other) => Math.hypot(other.x - x, other.y - y) };
  }

  /** Where it was created: nothing moves. */
  getCenter(): { lng: number; lat: number } {
    const [lng, lat] = this.options.center;
    return { lng, lat };
  }

  unproject([x, y]: [number, number]) {
    const point: [number, number] = [x / this.pixelsPerDegree, -y / this.pixelsPerDegree];
    return { toArray: () => point };
  }

  zoomTo(zoom: number): this {
    this.zoom = zoom;
    this.fire('zoomend');
    return this;
  }

  getBearing(): number {
    return this.bearing;
  }

  rotateTo(bearing: number): this {
    this.bearing = bearing;
    this.fire('rotate');
    return this;
  }

  resetNorth(_options?: unknown): this {
    return this.rotateTo(0);
  }

  /** Starting to move the map by hand. */
  startGesture(): void {
    this.fire('movestart', { originalEvent: new Event('touchstart') });
  }

  /** Letting go of the map, once what the gesture left moving stops. */
  endGesture(): void {
    this.fire('moveend', { originalEvent: new Event('touchend') });
  }

  /** MapLibre's first paint, once the style and the tiles in sight are there. */
  load(): void {
    this.fire('load');
  }

  easeTo(_options: { center: unknown; zoom: number; offset?: [number, number] }): this {
    return this;
  }

  fitBounds(_bounds: LngLatBounds, _options: unknown): this {
    return this;
  }

  resize(): this {
    return this;
  }

  redraw(): this {
    return this;
  }

  setMissingStyleImageResolver(_resolver: (id: string) => void): this {
    return this;
  }

  remove(): void {
    this.fire('remove');
    this.options.container.replaceChildren();
  }
}

export class Popup extends Evented {
  private static readonly popups = new WeakMap<Element, Popup>();

  /** The popup open on the page with that element. */
  static of(element: Element): Popup {
    return Popup.popups.get(element)!;
  }

  private map?: FakeMap;
  private container?: HTMLElement;
  private readonly content = document.createElement('div');
  private maxWidth = '';
  /** How far above the point its arrow ends (in the real one, read from its position). */
  offset: number;

  constructor(
    private readonly options: { className: string; closeOnClick?: boolean; offset?: number },
  ) {
    super();
    this.content.className = 'maplibregl-popup-content';
    this.offset = options.offset ?? 0;
  }

  setOffset(offset: number): this {
    this.offset = offset;
    return this;
  }

  isOpen(): boolean {
    return !!this.map;
  }

  getElement(): HTMLElement {
    return this.container!;
  }

  setLngLat(_point: LngLatLike): this {
    return this;
  }

  setText(text: string): this {
    this.content.textContent = text;
    return this;
  }

  setDOMContent(node: Node): this {
    this.content.replaceChildren(node);
    return this;
  }

  setMaxWidth(width: string): this {
    this.maxWidth = width;
    if (this.container) this.container.style.maxWidth = width;
    return this;
  }

  addTo(map: FakeMap): this {
    this.remove();
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = `maplibregl-popup ${this.options.className}`;
    Popup.popups.set(this.container, this);
    this.container.style.maxWidth = this.maxWidth;
    this.container.append(this.content);
    map.getContainer().append(this.container);
    map.on('remove', this.remove);
    if (this.options.closeOnClick !== false) map.on('click', this.remove);
    this.fire('open');
    return this;
  }

  /** As in MapLibre, it says it closed only if it was open. */
  readonly remove = (): this => {
    this.container?.remove();
    const map = this.map;
    if (!map) return this;
    map.off('remove', this.remove).off('click', this.remove);
    this.map = undefined;
    this.fire('close');
    return this;
  };
}

export class Marker extends Evented {
  private readonly element: HTMLElement;
  private map?: FakeMap;
  private popup?: Popup;
  private point?: { lng: number; lat: number };

  constructor({ element }: { element: HTMLElement }) {
    super();
    this.element = element;
    element.classList.add('maplibregl-marker');
    element.addEventListener('click', () => this.fire('click'));
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getLngLat() {
    return this.point!;
  }

  setLngLat([lng, lat]: [number, number]): this {
    this.point = { lng, lat };
    return this;
  }

  getPopup(): Popup | undefined {
    return this.popup;
  }

  setPopup(popup?: Popup | null): this {
    this.popup?.remove();
    this.popup = popup ?? undefined;
    return this;
  }

  togglePopup(): this {
    if (this.popup?.isOpen()) this.popup.remove();
    else this.popup?.addTo(this.map!);
    return this;
  }

  addTo(map: FakeMap): this {
    this.map = map;
    map.getCanvasContainer().append(this.element);
    map.on('click', this.onMapClick);
    return this;
  }

  remove(): this {
    this.map?.off('click', this.onMapClick);
    this.map = undefined;
    this.element.remove();
    this.popup?.remove();
    return this;
  }

  private readonly onMapClick = ({ originalEvent }: { originalEvent: MouseEvent }): void => {
    if (this.element.contains(originalEvent.target as Node)) this.togglePopup();
  };
}

export { FakeMap as Map };

export function getVersion(): string {
  return 'test';
}

export function setWorkerUrl(): void {}
