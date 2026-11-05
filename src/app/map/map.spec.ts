import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as maplibre from 'maplibre-gl';

import { Map as FakeMap } from '../../testing/maplibre';
import { testVenue } from '../../testing/venue';
import { TapasRoute } from '../tapas-route';
import { Themes } from '../theme';
import { UserLocation } from '../user-location';
import { Arrival, Status, Venue } from '../venues';
import { VenueMap } from './map';

function venue(number: number): Venue {
  return testVenue({
    number,
    name: `VENUE ${number}`,
    location: { lat: 39.98 + number / 1000, lng: -0.04 },
  });
}

const [ONE, TWO, THREE] = [1, 2, 3].map(venue);

describe('VenueMap', () => {
  // The map is a simulated one: only the number of times it frames gets counted.
  let fitBounds: ReturnType<typeof vi.spyOn>;
  const statuses = signal<ReadonlyMap<number, Status>>(new Map());
  const arrivals = signal<ReadonlyMap<number, Arrival>>(new Map());
  const lost = signal(false);
  const mapInSight = signal(false);
  const live = signal(false);
  beforeEach(() => {
    fitBounds = vi.spyOn(maplibre.Map.prototype, 'fitBounds').mockReturnThis();
    statuses.set(new Map());
    localStorage.clear(); // The theme.
    TestBed.configureTestingModule({
      providers: [
        { provide: TapasRoute, useValue: { statuses, arrivals } },
        { provide: UserLocation, useValue: { lost, mapInSight, live } },
      ],
    });
  });
  afterEach(() => fitBounds.mockRestore());

  /** In the venue view (routeTo), with the card of the venue the route goes to in the middle. */
  async function create(venues: Venue[], routeTo: number | null = null, current = routeTo) {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', venues);
    fixture.componentRef.setInput('routeTo', routeTo);
    fixture.componentRef.setInput('current', current);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const change = async (name: string, value: unknown) => {
      fixture.componentRef.setInput(name, value);
      await fixture.whenStable();
    };
    const marker = (number: number) =>
      el.querySelector<HTMLElement>(`.venue-marker[title^="${number}."]`);
    const touch = async (number: number) => {
      marker(number)!.click();
      await fixture.whenStable();
    };
    const clickMap = async () => {
      el.querySelector<HTMLElement>('.maplibregl-canvas-container')!.click();
      await fixture.whenStable();
    };
    /** Full screen, or back. */
    const toggleLarge = async () => {
      el.querySelector<HTMLElement>('.expand')!.click();
      await fixture.whenStable();
    };
    return { fixture, el, change, marker, touch, clickMap, toggleLarge };
  }

  it('with the same venues in another order it neither recreates the markers nor frames', async () => {
    const { change, marker } = await create([ONE, TWO, THREE]);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    const before = [1, 2, 3].map(marker);

    await change('venues', [THREE, ONE, TWO]);
    await change('venues', [ONE, TWO, THREE]);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    [1, 2, 3].forEach((number, i) => expect(marker(number)).toBe(before[i]));
  });

  it('on filtering, removes and adds only those that change and frames again', async () => {
    const { el, change, marker } = await create([ONE, TWO]);
    const two = marker(2);

    await change('venues', [TWO, THREE]);
    expect(fitBounds).toHaveBeenCalledTimes(2);
    expect(marker(1)).toBeNull();
    expect(marker(2)).toBe(two);
    expect(marker(3)).not.toBeNull();
    expect(el.querySelectorAll('.venue-marker').length).toBe(2);
  });

  it('the open popup stays open while its venue stays on the map', async () => {
    const { change, el, touch, toggleLarge } = await create([ONE, TWO, THREE], 1);
    await toggleLarge();
    await touch(2);
    const popup = () => el.querySelector('.maplibregl-popup strong')?.textContent;
    expect(popup()).toBe('VENUE 2');

    await change('venues', [THREE, TWO, ONE]);
    expect(popup()).toBe('VENUE 2');
    await change('venues', [ONE, THREE]);
    expect(popup()).toBeUndefined();
  });

  it('goes straight to the venue before the map is painted, and on its way once it is', async () => {
    const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
    const { fixture } = await create([ONE, TWO], 1);
    fixture.componentInstance.focus(1);
    expect(easeTo.mock.lastCall![0]).toMatchObject({ zoom: 16, animate: false });

    FakeMap.of(fixture.nativeElement).load();
    fixture.componentInstance.focus(2);
    expect(easeTo.mock.lastCall![0]).toMatchObject({ zoom: 16, animate: true });
    easeTo.mockRestore();
  });

  it('if asked to focus a venue before MapLibre arrives, does it as soon as it’s there', async () => {
    const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', [ONE, TWO]);
    fixture.componentInstance.focus(2);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(easeTo.mock.lastCall![0]).toMatchObject({ center: TWO.location, zoom: 16 });
    expect(el.querySelector('.venue-marker.destination')?.getAttribute('title')).toBe('2. VENUE 2');
    easeTo.mockRestore();
  });

  describe('popup', () => {
    /** Full screen in the venue view, with the route to venue 1: venue 2's, open. */
    async function openPopup() {
      const created = await create([ONE, TWO], 1);
      await created.toggleLarge();
      await created.touch(2);
      const popup = created.el.querySelector<HTMLElement>('.maplibregl-popup')!;
      return { ...created, popup };
    }

    it('only full screen: small, touching a venue only says it was touched', async () => {
      const { fixture, el, touch, toggleLarge } = await create([ONE, TWO], 1);
      const touched = vi.fn();
      fixture.componentInstance.venueSelect.subscribe(touched);

      await touch(2);
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      expect(touched).toHaveBeenCalledExactlyOnceWith(2);

      await toggleLarge();
      await touch(2);
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 2');
      expect(touched).toHaveBeenCalledTimes(2);
    });

    it('has the number, the name and the address, without buttons', async () => {
      const { popup } = await openPopup();
      expect(popup.querySelector('.venue-number')?.textContent).toBe('2');
      expect(popup.querySelector('.popup-heading strong')?.textContent).toBe('VENUE 2');
      expect(popup.querySelector('button')).toBeNull();
    });

    it('takes up all the width between the map’s buttons, keeping their margin', async () => {
      const width = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(400);
      const { popup } = await openPopup();
      expect(popup.style.maxWidth).toBe(`${400 - 2 * (10 + 36 + 10)}px`);
      width.mockRestore();
    });

    describe('on opening', () => {
      /** Spies on where the map is sent, in a map of that height. */
      function watchCamera(mapHeight: number) {
        const height = vi.spyOn(Element.prototype, 'clientHeight', 'get');
        const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
        height.mockReturnValue(mapHeight);
        return {
          easeTo,
          restore() {
            height.mockRestore();
            easeTo.mockRestore();
          },
        };
      }

      it('its venue goes a third of the way down, in the middle, at the zoom it’s at', async () => {
        const { easeTo, restore } = watchCamera(900);
        await openPopup();

        const { center, offset, zoom } = easeTo.mock.lastCall![0];
        expect(center).toEqual({ lng: TWO.location!.lng, lat: TWO.location!.lat });
        expect(offset).toEqual([0, 900 / 3 - 900 / 2]);
        expect(zoom).toBeUndefined();
        restore();
      });

      it('lower if the popup doesn’t fit above it, as far from the top as the buttons', async () => {
        const { easeTo, restore } = watchCamera(900);
        // The marker's middle, 415 px below the top of the popup.
        const rects = vi
          .spyOn(Element.prototype, 'getBoundingClientRect')
          .mockImplementation(function (this: Element) {
            const marker = this.classList.contains('venue-marker');
            return { top: marker ? 400 : 0, height: marker ? 30 : 0 } as DOMRect;
          });
        await openPopup();

        expect(easeTo.mock.lastCall![0].offset).toEqual([0, 415 + 10 - 900 / 2]);
        rects.mockRestore();
        restore();
      });
    });

    it('keeps up with the schedule status while open, without how long it takes to get there', async () => {
      arrivals.set(new Map([[2, { meters: 900, mode: 'walking', minutes: 12 }]]));
      statuses.set(new Map([[2, { open: true, minutes: 120 }]]));
      const { fixture, popup } = await openPopup();
      const image = popup.querySelector('img');
      const status = () => popup.querySelector('.popup-status')!.textContent;
      expect(status()).toBe('cierra en 2 h');
      expect(popup.querySelector('.arrival-time')).toBeNull();

      statuses.set(new Map([[2, { open: true, minutes: 25 }]]));
      await fixture.whenStable();
      expect(status()).toBe('cierra en 25 min');
      expect(popup.querySelector('.schedule-status')!.classList).toContain('soon');
      expect(popup.querySelector('img')).toBe(image); // The photos aren't loaded again.

      arrivals.set(new Map());
      statuses.set(new Map());
      await fixture.whenStable();
      expect(status()).toBe('');
    });

    it('what starts on it reaches the map, to drag it, but clicks stay on it', async () => {
      const { fixture, el, popup } = await openPopup();
      expect(popup.parentElement).toBe(el.querySelector('.maplibregl-canvas-container'));

      popup.querySelector<HTMLElement>('.popup-heading')!.click();
      await fixture.whenStable();
      expect(el.querySelector('.maplibregl-popup')).toBe(popup);
    });

    it('a double tap on it doesn’t zoom the map, and one outside it does', async () => {
      const { el, popup } = await openPopup();
      const { doubleClickZoom } = FakeMap.of(el);
      const touch = (target: Element) =>
        target.dispatchEvent(
          Object.assign(new Event('touchstart', { bubbles: true }), { touches: [] }),
        );

      touch(popup.querySelector('.popup-heading')!);
      expect(doubleClickZoom.isEnabled()).toBe(false);

      touch(el.querySelector('.maplibregl-canvas-container')!);
      expect(doubleClickZoom.isEnabled()).toBe(true);
    });

    it('clicking outside closes it, and the route still goes where it went', async () => {
      const { el, marker, clickMap } = await openPopup();
      expect(marker(1)!.classList).toContain('destination');
      expect(marker(2)!.classList).not.toContain('destination');

      await clickMap();
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      expect(marker(1)!.classList).toContain('destination');
      expect(marker(2)!.classList).not.toContain('destination');
    });

    it('its marker opens and closes it', async () => {
      const { el, touch } = await openPopup();

      await touch(2);
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      await touch(2);
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 2');
    });

    it('only one is open: another venue’s replaces it', async () => {
      const { el, touch } = await openPopup();

      await touch(1);
      expect(el.querySelectorAll('.maplibregl-popup').length).toBe(1);
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 1');

      await touch(2);
      expect(el.querySelectorAll('.maplibregl-popup').length).toBe(1);
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 2');
    });

    it('reducing the map closes it at once', async () => {
      const { el, touch, toggleLarge } = await openPopup();

      await toggleLarge();
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      await touch(2);
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
    });

    it('small, in the venue view, touching a venue moves neither the map nor the route', async () => {
      const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
      const { fixture, marker, change, touch } = await create([ONE, TWO], 1);
      const touched: number[] = [];
      fixture.componentInstance.venueSelect.subscribe((number) => touched.push(number));

      const moves = easeTo.mock.calls.length;
      await touch(2);
      expect(touched).toEqual([2]);
      // Its card comes to the middle (app.ts): already in sight, the map stays.
      await change('current', 2);
      expect(easeTo).toHaveBeenCalledTimes(moves);
      expect(marker(1)!.classList).toContain('destination');
      expect(marker(2)!.classList).not.toContain('destination');
      easeTo.mockRestore();
    });

    it('beside the list, touching a venue doesn’t choose it: only its card’s map button does', async () => {
      const { fixture, el, marker, touch, clickMap } = await create([ONE, TWO]);

      await touch(2);
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      expect(el.querySelector('.venue-marker.destination')).toBeNull();

      fixture.componentInstance.focus(1);
      await fixture.whenStable();
      expect(marker(1)!.classList).toContain('destination');
      await touch(2);
      await clickMap();
      expect(marker(1)!.classList).toContain('destination');
      expect(marker(2)!.classList).not.toContain('destination');
    });
  });

  it('in the venue view, it goes to the venue whose card is in the middle, at the zoom it’s at', async () => {
    const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
    const { fixture, change, marker } = await create([ONE, TWO], 1);
    await change('current', 2);
    expect(marker(1)!.classList).toContain('destination');
    expect(easeTo).toHaveBeenLastCalledWith({
      center: [TWO.location!.lng, TWO.location!.lat],
      duration: 250,
      animate: false,
    });
    // On its way, already the one in the middle: its card's button doesn't come and go.
    expect(fixture.componentInstance.centered()).toBe(2);
    easeTo.mockRestore();
  });

  it('going to a venue is going to the middle, even before MapLibre arrives', async () => {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', [ONE, TWO]);
    fixture.componentRef.setInput('routeTo', 2);
    fixture.componentInstance.focus(2);
    expect(fixture.componentInstance.centered()).toBe(2);
    await fixture.whenStable();
  });

  it('says which venue is in the middle of the map once it stops', async () => {
    const { fixture } = await create([ONE, TWO], 1);
    const map = FakeMap.of(fixture.nativeElement);
    const center = vi.spyOn(map, 'getCenter');

    center.mockReturnValue(TWO.location!);
    map.endGesture();
    expect(fixture.componentInstance.centered()).toBe(2);
    center.mockReturnValue({ lat: 39, lng: 0 });
    map.endGesture();
    expect(fixture.componentInstance.centered()).toBeNull();
  });

  it('without WebGL2, it says there’s no map instead of leaving it empty', async () => {
    FakeMap.webgl2 = false;
    const { el } = await create([ONE]);
    expect(el.querySelector('.no-map')?.textContent).toBe('No se ha podido cargar el mapa.');
    expect(el.querySelector('.venue-marker')).toBeNull();
    expect(el.querySelector('[aria-label="Acercar"]')).toBeNull();
    FakeMap.webgl2 = true;
  });

  it('brings MapLibre’s styles once, before the app’s, which restyle them', async () => {
    await create([ONE]);
    await create([TWO]);
    const links = document.querySelectorAll('#maplibre-styles');
    expect(links.length).toBe(1);
    expect(document.head.firstElementChild).toBe(links[0]);
  });

  it('adds its own to the style: names and credits in Spanish, and the route', async () => {
    const { el } = await create([ONE]);
    const style = FakeMap.of(el).getStyle();
    expect(style.layers[0].layout).toEqual({
      'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
    });
    expect(style.sources['openmaptiles']).toMatchObject({
      attribution: expect.stringContaining('Datos de'),
    });
    expect(style.layers.slice(-2).map((layer) => layer.id)).toEqual(['route', 'route-dots']);
  });

  it('follows the theme’s style, only when it changes', async () => {
    const setStyle = vi.spyOn(maplibre.Map.prototype, 'setStyle');
    const { fixture, el } = await create([ONE]);
    const themes = TestBed.inject(Themes);
    expect(FakeMap.of(el).styleUrl).toContain('/liberty');
    expect(setStyle).toHaveBeenCalledOnce(); // By the simulated map itself, on being created.

    themes.theme.set('light');
    await fixture.whenStable();
    expect(setStyle).toHaveBeenCalledOnce();

    themes.theme.set('dark');
    await fixture.whenStable();
    expect(FakeMap.of(el).styleUrl).toContain('/dark');
    expect(setStyle).toHaveBeenCalledTimes(2);
    setStyle.mockRestore();
  });

  it('its zoom buttons go up and down a level, as far as there are levels', async () => {
    const { fixture, el } = await create([ONE]);
    const button = (label: string) =>
      el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    const press = async (label: string) => {
      button(label).click();
      await fixture.whenStable();
    };
    const zoom = () => FakeMap.of(el).getZoom();

    await press('Acercar');
    expect(zoom()).toBe(14);
    await press('Alejar');
    expect(zoom()).toBe(13);

    FakeMap.of(el).zoomTo(18);
    await fixture.whenStable();
    expect(button('Acercar').disabled).toBe(true);
    expect(button('Alejar').disabled).toBe(false);

    FakeMap.of(el).zoomTo(-1);
    await fixture.whenStable();
    expect(button('Acercar').disabled).toBe(false);
    expect(button('Alejar').disabled).toBe(true);
  });

  it('once turned, a button pointing north turns it back', async () => {
    const { fixture, el } = await create([ONE]);
    const button = () => el.querySelector<HTMLElement>('[aria-label="Orientar el mapa al norte"]');
    expect(button()).toBeNull();

    FakeMap.of(el).rotateTo(30);
    await fixture.whenStable();
    expect(button()!.querySelector<HTMLElement>('app-icon')!.style.rotate).toBe('-30deg');

    button()!.click();
    await fixture.whenStable();
    expect(FakeMap.of(el).getBearing()).toBe(0);
    expect(button()).toBeNull();
  });

  it('the north button goes away on pressing it, and comes back on turning it again', async () => {
    const { fixture, el } = await create([ONE]);
    const map = FakeMap.of(el);
    vi.spyOn(map, 'resetNorth').mockReturnThis(); // Still on its way.
    const button = () => el.querySelector<HTMLElement>('[aria-label="Orientar el mapa al norte"]');
    map.rotateTo(30);
    await fixture.whenStable();

    button()!.click();
    await fixture.whenStable();
    expect(button()).toBeNull();

    map.rotateTo(40);
    map.endGesture();
    await fixture.whenStable();
    expect(button()).not.toBeNull();
  });

  it('a turn that ends near north goes back to it smoothly, once it stops', async () => {
    const { el } = await create([ONE]);
    const map = FakeMap.of(el);
    const resetNorth = vi.spyOn(map, 'resetNorth');

    map.rotateTo(20);
    map.endGesture();
    expect(resetNorth).not.toHaveBeenCalled();

    map.rotateTo(-5);
    map.endGesture();
    expect(resetNorth).toHaveBeenCalledExactlyOnceWith({ duration: 250 });
    expect(map.getBearing()).toBe(0);
  });

  it('frames the venues again without turning it back to the north', async () => {
    const { el, change } = await create([ONE]);
    FakeMap.of(el).rotateTo(30);

    await change('venues', [ONE, TWO]);
    expect(fitBounds.mock.lastCall![1]).toMatchObject({ bearing: 30 });
  });

  it('goes to the user’s point, named by what it is, without turning the map', async () => {
    const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
    const { fixture, el, change } = await create([ONE]);
    const button = () => el.querySelector<HTMLElement>('.buttons.bottom.left button');
    expect(button()).toBeNull();

    await change('origin', { lat: 39.98, lng: -0.04 });
    expect(button()!.getAttribute('aria-label')).toBe('Ir al punto de partida');
    live.set(true);
    await fixture.whenStable();
    expect(button()!.getAttribute('aria-label')).toBe('Ir a mi ubicación');

    button()!.click();
    expect(easeTo).toHaveBeenLastCalledWith({ center: [-0.04, 39.98], zoom: 16, duration: 250 });
    live.set(false);
    easeTo.mockRestore();
  });

  it('hides the button to the user’s point once pressed, until the map leaves it or it moves', async () => {
    const { fixture, el, change } = await create([ONE]);
    const button = () => el.querySelector<HTMLElement>('[aria-label="Ir al punto de partida"]');
    await change('origin', { lat: 39.98, lng: -0.04 });

    button()!.click();
    await fixture.whenStable();
    expect(button()).toBeNull();
    // The fake map stays where it was created, away from the point.
    FakeMap.of(el).endGesture();
    await fixture.whenStable();
    expect(button()).not.toBeNull();

    button()!.click();
    await change('origin', { lat: 39.981, lng: -0.04 });
    expect(button()).not.toBeNull();
  });

  it('marks the user’s point while the location is lost', async () => {
    const { fixture, el, change } = await create([ONE]);
    await change('origin', { lat: 39.98, lng: -0.04 });
    const point = el.querySelector('.origin-marker')!;
    expect(point.classList).not.toContain('lost');

    lost.set(true);
    await fixture.whenStable();
    expect(point.classList).toContain('lost');

    lost.set(false);
    await fixture.whenStable();
    expect(point.classList).not.toContain('lost');
  });

  it('moves the user’s point without adding it again, which would restart its flicker', async () => {
    const { el, change } = await create([ONE]);
    await change('origin', { lat: 39.98, lng: -0.04 });
    const point = el.querySelector('.origin-marker');
    const addTo = vi.spyOn(maplibre.Marker.prototype, 'addTo');

    await change('origin', { lat: 39.981, lng: -0.04 });
    expect(addTo).not.toHaveBeenCalled();
    expect(el.querySelector('.origin-marker')).toBe(point);
    addTo.mockRestore();

    await change('origin', null);
    expect(el.querySelector('.origin-marker')).toBeNull();
  });

  it('names the user’s point on hovering over it or touching it', async () => {
    const { el, change } = await create([ONE]);
    await change('origin', { lat: 39.98, lng: -0.04 });
    const point = el.querySelector('.origin-marker')!;
    const tooltip = () => el.querySelector('.origin-tooltip')?.textContent;

    point.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltip()).toBe('Punto de partida');
    point.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tooltip()).toBeUndefined();

    point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tooltip()).toBe('Punto de partida');
    el.querySelector<HTMLElement>('.maplibregl-canvas-container')!.click();
    expect(tooltip()).toBeUndefined();
  });

  it('with the live location, the user’s point is them', async () => {
    const { fixture, el, change } = await create([ONE]);
    await change('origin', { lat: 39.98, lng: -0.04 });
    const point = el.querySelector('.origin-marker')!;
    const tooltip = () => el.querySelector('.origin-tooltip')?.textContent;
    live.set(true);
    await fixture.whenStable();

    point.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltip()).toBe('Tu ubicación');

    live.set(false);
    await fixture.whenStable();
    expect(tooltip()).toBe('Punto de partida');
  });

  describe('going full screen', () => {
    const root = document.documentElement.style;
    /** Each animation of the way, finished on demand. */
    let ends: (() => void)[];
    let animate: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      ends = [];
      animate = vi.spyOn(Element.prototype, 'animate').mockImplementation(
        () =>
          ({
            finished: new Promise<void>((resolve) => ends.push(resolve)),
            cancel() {},
          }) as unknown as Animation,
      );
    });
    afterEach(() => animate.mockRestore());

    const arrive = async (fixture: { whenStable(): Promise<unknown> }) => {
      ends.at(-1)!();
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
    };
    const keyframes = () => animate.mock.lastCall![0];

    it('lays it out full screen at once, and in its place only once back', async () => {
      const { fixture, el } = await create([ONE]);
      const frame = el.querySelector('.frame')!;
      const button = el.querySelector<HTMLElement>('.expand')!;

      button.click();
      await fixture.whenStable();
      expect(frame.classList).toContain('large');
      expect(button.title).toBe('Reducir el mapa');
      // From where the small map is, with the page's background where the header leaves.
      expect(root.getPropertyValue('--map-top')).not.toBe('');
      expect(document.documentElement.classList).toContain('large-map');
      expect(keyframes()).toEqual([{ '--map-large': 0 }, { '--map-large': 1 }]);
      await arrive(fixture);
      expect(root.getPropertyValue('--map-large')).toBe('1');

      // The button says what it does next at once; the map goes back to its place once there.
      button.click();
      await fixture.whenStable();
      expect(button.title).toBe('Ampliar el mapa');
      expect(keyframes()).toEqual([{ '--map-large': 1 }, { '--map-large': 0 }]);
      expect(frame.classList).toContain('large');
      await arrive(fixture);
      expect(frame.classList).not.toContain('large');
      expect(root.getPropertyValue('--map-large')).toBe('');
      expect(root.getPropertyValue('--map-top')).toBe('');
      expect(document.documentElement.classList).not.toContain('large-map');
    });

    it('half under the header, its edges go from where they were, and what was hidden stays so', async () => {
      const { fixture, el } = await create([ONE]);
      const header = document.body.appendChild(document.createElement('app-header'));
      const box = (top: number, bottom: number, left = 16, right = 359) =>
        ({ top, bottom, left, right, width: right - left, height: bottom - top }) as DOMRect;
      const rects = vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          if (this === header) return box(0, 100);
          if (this === el) return box(60, 420);
          return box(0, 800, 0, 375); // Full screen.
        });

      el.querySelector<HTMLElement>('.expand')!.click();
      await fixture.whenStable();
      // What was shown of it: from the header down.
      expect(root.getPropertyValue('--map-top')).toBe('100px');
      expect(root.getPropertyValue('--map-rise')).toBe('-100px');
      expect(root.getPropertyValue('--map-bottom')).toBe('380px');
      // Where its edges are, for its buttons: the top one, under the header.
      expect(root.getPropertyValue('--map-edge-top')).toBe('60px');
      expect(root.getPropertyValue('--map-edge-bottom')).toBe('380px');
      // Square at the top, where the header cut it; round at the bottom.
      expect(root.getPropertyValue('--map-round-top')).toBe('0');
      expect(root.getPropertyValue('--map-round-bottom')).toBe('1');
      rects.mockRestore();
      header.remove();
    });

    it('pressed again on the way, it turns back from where it is', async () => {
      const { fixture, el } = await create([ONE]);
      const button = el.querySelector<HTMLElement>('.expand')!;
      button.click();
      await fixture.whenStable();
      const style = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: () => '0.4',
      } as unknown as CSSStyleDeclaration);

      button.click();
      await fixture.whenStable();
      expect(keyframes()).toEqual([{ '--map-large': 0.4 }, { '--map-large': 0 }]);
      style.mockRestore();
      // The first one, cancelled, no longer counts.
      ends[0]();
      await new Promise((r) => setTimeout(r));
      expect(el.querySelector('.frame.large')).not.toBeNull();
      await arrive(fixture);
      expect(el.querySelector('.frame.large')).toBeNull();
    });

    it('leaving with it on its way leaves the page as it was', async () => {
      const { fixture, el } = await create([ONE]);
      el.querySelector<HTMLElement>('.expand')!.click();
      await fixture.whenStable();
      fixture.destroy();
      expect(root.getPropertyValue('--map-large')).toBe('');
      expect(root.getPropertyValue('--map-drop')).toBe('');
    });
  });

  it('lets the page scroll over it, except enlarged', async () => {
    const { fixture, el } = await create([ONE]);
    const gestures = FakeMap.of(el).cooperativeGestures;
    expect(gestures.isEnabled()).toBe(true);

    el.querySelector<HTMLElement>('.expand')!.click();
    await fixture.whenStable();
    expect(gestures.isEnabled()).toBe(false);
  });

  it('says whether it’s on screen: whole or enlarged, until it’s gone', async () => {
    let report!: (entries: { intersectionRatio: number }[]) => void;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { fixture, el } = await create([ONE]);
    expect(mapInSight()).toBe(false);

    report([{ intersectionRatio: 1 }]);
    await fixture.whenStable();
    expect(mapInSight()).toBe(true);

    report([{ intersectionRatio: 0.6 }]);
    await fixture.whenStable();
    expect(mapInSight()).toBe(false);

    el.querySelector<HTMLElement>('.expand')!.click();
    await fixture.whenStable();
    expect(mapInSight()).toBe(true);

    fixture.destroy();
    expect(mapInSight()).toBe(false);
    vi.unstubAllGlobals();
  });

  describe('route to the venue', () => {
    // ONE is at 39.981, -0.04: along a street to the east and then up.
    const STREET = [
      [-0.05, 39.98],
      [-0.04, 39.98],
      [-0.04, 39.981],
    ];
    const request = vi.fn(
      async () => new Response(JSON.stringify({ routes: [{ geometry: { coordinates: STREET } }] })),
    );
    const walking = (minutes: number): Arrival => ({ meters: 900, mode: 'walking', minutes });
    beforeEach(() => {
      request.mockClear();
      vi.stubGlobal('fetch', request);
      arrivals.set(new Map([[1, walking(12)]]));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      arrivals.set(new Map());
    });

    function map(fixture: { nativeElement: HTMLElement }): FakeMap {
      return FakeMap.of(fixture.nativeElement);
    }

    /** What's drawn: the points of the line (by car) or the dots (on foot). */
    function drawn(fixture: { nativeElement: HTMLElement }, source: 'route' | 'route-dots') {
      const { data } = map(fixture).getSource(source) as unknown as {
        data: { features: { geometry: { coordinates: [number, number][] } }[] };
      };
      return data.features[0]?.geometry.coordinates;
    }

    const line = (fixture: { nativeElement: HTMLElement }) => drawn(fixture, 'route');
    const dots = (fixture: { nativeElement: HTMLElement }) => drawn(fixture, 'route-dots');

    /** From each dot to the next, in pixels on the screen, at the zoom of the moment. */
    function gaps(fixture: { nativeElement: HTMLElement }): number[] {
      const points = dots(fixture)!.map((dot) => map(fixture).project(dot));
      return points
        .slice(1)
        .map((point, i) => Math.round(Math.hypot(point.x - points[i].x, point.y - points[i].y)));
    }

    /** The map with the route drawn in the venue view, from a different start: routes are kept. */
    async function withRoute(lng: number) {
      const created = await create([ONE], 1);
      await created.change('origin', { lat: 39.98, lng });
      await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(2));
      expect(request).toHaveBeenCalledOnce();
      return created;
    }

    it('draws the route from the service, dotted on foot and solid by car', async () => {
      const { fixture } = await withRoute(-0.055);
      expect(line(fixture)).toBeUndefined();
      // From the start of the street to its end.
      expect(dots(fixture)![0][0]).toBeCloseTo(STREET[0][0], 6);
      expect(dots(fixture)![0][1]).toBeCloseTo(STREET[0][1], 6);
      expect(dots(fixture)!.at(-1)![0]).toBeCloseTo(STREET[2][0], 6);

      arrivals.set(new Map([[1, { ...walking(12), mode: 'driving' }]]));
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(line(fixture)).toEqual(STREET));
      expect(dots(fixture)).toBeUndefined();
    });

    it('on foot, the dots are as far apart on screen at any zoom', async () => {
      const { fixture } = await withRoute(-0.057);
      // 116.5 px along the street, then 11.7 up: the gap at the corner, shorter.
      expect(gaps(fixture)).toEqual([...Array(11).fill(10), 7]);

      map(fixture).zoomTo(14);
      expect(gaps(fixture)).toEqual([...Array(23).fill(10), 8, 10]);
    });

    it('stays on changing the theme, which brings another style', async () => {
      const { fixture } = await withRoute(-0.056);
      expect(map(fixture).styleUrl).toContain('/liberty');
      const before = dots(fixture);

      TestBed.inject(Themes).theme.set('dark');
      await fixture.whenStable();
      expect(map(fixture).styleUrl).toContain('/dark');
      expect(dots(fixture)).toEqual(before);
    });

    it('counts from the starting point: walking to the street isn’t leaving it', async () => {
      const { change } = await withRoute(-0.06);

      await change('origin', { lat: 39.98, lng: -0.058 });
      expect(request).toHaveBeenCalledOnce();
    });

    it('walking along it, it isn’t asked for again, redrawn or framed again', async () => {
      const setData = vi.spyOn(maplibre.GeoJSONSource.prototype, 'setData');
      const { change } = await withRoute(-0.05);
      const draws = setData.mock.calls.length;

      await change('origin', { lat: 39.9801, lng: -0.045 });
      arrivals.set(new Map([[1, walking(6)]]));
      await change('origin', { lat: 39.9805, lng: -0.04 });

      expect(request).toHaveBeenCalledOnce();
      expect(fitBounds).toHaveBeenCalledTimes(2);
      expect(setData).toHaveBeenCalledTimes(draws);
      setData.mockRestore();
    });

    it('frames it at once if it arrives before the map is painted, and on its way after', async () => {
      const { fixture, change } = await withRoute(-0.053);
      expect(fitBounds.mock.lastCall![1]).toMatchObject({ animate: false });

      map(fixture).load();
      await change('origin', { lat: 39.991, lng: -0.046 });
      await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(3));
      expect(fitBounds.mock.lastCall![1]).toMatchObject({ animate: true });
    });

    it('with another venue’s card in the middle, the map goes to it and the route stays', async () => {
      const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
      arrivals.set(new Map([1, 2].map((number) => [number, walking(12)])));
      const { fixture, change } = await create([ONE, TWO], 1);
      await change('origin', { lat: 39.98, lng: -0.0542 });
      await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(2));
      const before = dots(fixture);

      await change('current', 2);
      expect(easeTo.mock.lastCall![0]).toMatchObject({
        center: [TWO.location!.lng, TWO.location!.lat],
      });
      expect(fitBounds).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenCalledOnce();
      expect(dots(fixture)).toEqual(before);

      // Back on the card of the venue the route goes to, the map shows the whole route again.
      await change('current', 1);
      expect(fitBounds).toHaveBeenCalledTimes(3);
      expect(request).toHaveBeenCalledOnce();
      easeTo.mockRestore();
    });

    it('a new route isn’t framed with another venue’s card in the middle', async () => {
      arrivals.set(new Map([1, 2].map((number) => [number, walking(12)])));
      const { fixture, change } = await create([ONE, TWO], 1, 2);
      await change('origin', { lat: 39.98, lng: -0.0543 });
      await vi.waitFor(() => expect(dots(fixture)).toBeDefined());
      expect(fitBounds).toHaveBeenCalledOnce(); // Only the venues, on painting them.
    });

    it('its card’s map button frames the route to another venue, without going to it first', async () => {
      const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
      arrivals.set(new Map([1, 2].map((number) => [number, walking(12)])));
      const { fixture, change } = await create([ONE, TWO], 1, 2);
      await change('origin', { lat: 39.98, lng: -0.054 });
      await vi.waitFor(() => expect(dots(fixture)).toBeDefined());
      const moves = easeTo.mock.calls.length;

      fixture.componentInstance.showRoute(2);
      await change('routeTo', 2);
      await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(2));
      expect(request).toHaveBeenCalledTimes(2);
      expect(easeTo).toHaveBeenCalledTimes(moves);
      easeTo.mockRestore();
    });

    it('from a card on the side, its map button frames the route once both have arrived', async () => {
      arrivals.set(new Map([1, 2].map((number) => [number, walking(12)])));
      const { fixture, change } = await create([ONE, TWO], 1);
      await change('origin', { lat: 39.98, lng: -0.0544 });
      await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(2));

      // Its card comes to the middle at the same time as the route is asked for.
      fixture.componentInstance.showRoute(2);
      fixture.componentRef.setInput('routeTo', 2);
      fixture.componentRef.setInput('current', 2);
      await fixture.whenStable();
      await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(3));
    });

    it('without a starting point, its card’s map button takes the map to the venue', async () => {
      const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
      const { fixture } = await create([ONE, TWO], 1, 2);
      fixture.componentInstance.showRoute(2);
      expect(easeTo.mock.lastCall![0]).toMatchObject({ center: TWO.location, zoom: 16 });
      easeTo.mockRestore();
    });

    it('without a route to it, the map goes to the venue itself', async () => {
      const easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
      arrivals.set(new Map([1, 2].map((number) => [number, walking(12)])));
      const { change } = await create([ONE, TWO], 1);
      const moves = easeTo.mock.calls.length;
      request.mockResolvedValueOnce(new Response('', { status: 503 }));
      await change('origin', { lat: 39.98, lng: -0.0545 });
      await vi.waitFor(() => expect(easeTo).toHaveBeenCalledTimes(moves + 1));
      expect(easeTo.mock.lastCall![0]).toMatchObject({
        center: [ONE.location!.lng, ONE.location!.lat],
      });
      easeTo.mockRestore();
    });

    it('on leaving it, it asks for another one from there', async () => {
      const { change } = await withRoute(-0.051);

      await change('origin', { lat: 39.99, lng: -0.045 });
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.lastCall).toEqual([expect.stringContaining('-0.045,39.99;')]);
    });

    it('on changing how to get there, it asks for another one', async () => {
      const { fixture } = await withRoute(-0.052);

      arrivals.set(new Map([[1, { ...walking(12), mode: 'driving' }]]));
      await fixture.whenStable();
      expect(request).toHaveBeenCalledTimes(2);
    });

    describe('guided', () => {
      const guideButton = (el: HTMLElement) =>
        el.querySelector<HTMLElement>('[aria-label="Guiarme hasta el local"]');
      let easeTo: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        live.set(true);
        easeTo = vi.spyOn(maplibre.Map.prototype, 'easeTo');
      });
      afterEach(() => {
        live.set(false);
        easeTo.mockRestore();
      });

      /** Guiding along the route, from a different start. */
      async function guiding(lng: number) {
        const created = await withRoute(lng);
        guideButton(created.el)!.click();
        await created.fixture.whenStable();
        return created;
      }

      it('is offered with a live location and a venue to go to', async () => {
        live.set(false);
        const { fixture, el, change } = await create([ONE, TWO]);
        await change('origin', { lat: 39.98, lng: -0.05 });
        expect(guideButton(el)).toBeNull();

        live.set(true);
        await fixture.whenStable();
        expect(guideButton(el)).toBeNull();

        fixture.componentInstance.focus(2);
        await fixture.whenStable();
        expect(guideButton(el)).not.toBeNull();
      });

      it('full screen, a venue’s popup pauses it, and it goes on once the popup closes', async () => {
        const { el, touch, clickMap, toggleLarge } = await guiding(-0.0581);
        await toggleLarge();

        await touch(1);
        expect(el.querySelector('.maplibregl-popup')).not.toBeNull();
        expect(guideButton(el)).not.toBeNull();
        expect(el.querySelector('.guided-arrival')).toBeNull();

        await clickMap();
        expect(el.querySelector('.maplibregl-popup')).toBeNull();
        expect(guideButton(el)).toBeNull();
        expect(el.querySelector('.guided-arrival')).not.toBeNull();
      });

      it('reducing the map with the popup open, it goes on too', async () => {
        const { el, touch, toggleLarge } = await guiding(-0.0582);
        await toggleLarge();
        await touch(1);

        await toggleLarge();
        expect(guideButton(el)).toBeNull();
      });

      it('moving the map by hand with the popup open, it doesn’t go on', async () => {
        const { el, touch, clickMap, toggleLarge } = await guiding(-0.0583);
        await toggleLarge();
        await touch(1);

        FakeMap.of(el).startGesture();
        await clickMap();
        expect(guideButton(el)).not.toBeNull();
      });

      it('its button closes the popup open and goes on guiding', async () => {
        const { fixture, el, touch, toggleLarge } = await guiding(-0.0584);
        await toggleLarge();
        await touch(1);

        guideButton(el)!.click();
        await fixture.whenStable();
        expect(el.querySelector('.maplibregl-popup')).toBeNull();
        expect(guideButton(el)).toBeNull();
      });

      it('keeps up with the user close up, low on the map, looking along the route', async () => {
        const height = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(800);
        const { el, change } = await guiding(-0.0531);
        expect(guideButton(el)).toBeNull();
        // Along the street to the east.
        const [first] = easeTo.mock.lastCall!;
        expect(first).toMatchObject({ center: [-0.0531, 39.98], zoom: 17, offset: [0, 800 / 4] });
        expect(first.bearing).toBeCloseTo(90);

        // On the stretch going up, with no other route.
        await change('origin', { lat: 39.9805, lng: -0.04 });
        const [next] = easeTo.mock.lastCall!;
        expect(next.center).toEqual([-0.04, 39.9805]);
        expect(next.bearing).toBeCloseTo(0);
        expect(request).toHaveBeenCalledOnce();
        height.mockRestore();
      });

      it('on leaving the route, it doesn’t frame the new one: it keeps up with the user', async () => {
        const { change } = await guiding(-0.0541);

        await change('origin', { lat: 39.995, lng: -0.046 });
        await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(easeTo).toHaveBeenCalledTimes(3));
        expect(fitBounds).toHaveBeenCalledTimes(2);
      });

      it('says how long is left at the top, by what’s left of the route', async () => {
        const { el, change } = await guiding(-0.0571);
        const arrival = () => el.querySelector('.guided-arrival')?.textContent?.trim();
        // Some 1,460 m along the street and 110 m up.
        expect(arrival()).toBe('20 min · 1,6 km');

        await change('origin', { lat: 39.9805, lng: -0.04 });
        expect(arrival()).toBe('1 min · 60 m');

        FakeMap.of(el).startGesture();
        await change('origin', { lat: 39.9806, lng: -0.04 });
        expect(arrival()).toBeUndefined();
      });

      it('moving the map by hand stops it and brings the button back', async () => {
        const { fixture, el, change } = await guiding(-0.0591);

        FakeMap.of(el).startGesture();
        await fixture.whenStable();
        expect(guideButton(el)).not.toBeNull();

        easeTo.mockClear();
        await change('origin', { lat: 39.98, lng: -0.045 });
        expect(easeTo).not.toHaveBeenCalled();
      });
    });
  });

  describe('highlighted', () => {
    /** The markers with that class, by number. */
    const withClass = (el: HTMLElement, name: string) =>
      [...el.querySelectorAll(`.venue-marker.${name}`)].map((m) =>
        parseInt(m.getAttribute('title')!),
      );
    /** The marker with the pin, by number. */
    const pinned = (el: HTMLElement) =>
      [...el.querySelectorAll('.venue-marker')]
        .filter((m) => m.querySelector('use[href="#icon-pin"]'))
        .map((m) => parseInt(m.getAttribute('title')!));

    it('the venue the route goes to has the pin, which goes along with it', async () => {
      const { el, change } = await create([ONE, TWO, THREE], 1);
      expect(withClass(el, 'destination')).toEqual([1]);
      expect(pinned(el)).toEqual([1]);

      await change('routeTo', 3);
      expect(withClass(el, 'destination')).toEqual([3]);
      expect(pinned(el)).toEqual([3]);
      expect(el.querySelectorAll('.venue-marker svg').length).toBe(1);

      // Filtered out, it goes with its marker; back, with it again.
      await change('venues', [ONE, TWO]);
      expect(pinned(el)).toEqual([]);
      await change('venues', [ONE, TWO, THREE]);
      expect(pinned(el)).toEqual([3]);
    });

    it('in the venue view, the one whose card is in the middle too, if it’s another', async () => {
      const { el, change } = await create([ONE, TWO, THREE], 1);
      expect(withClass(el, 'current')).toEqual([]);

      await change('current', 2);
      expect(withClass(el, 'current')).toEqual([2]);
      expect(withClass(el, 'destination')).toEqual([1]);

      await change('routeTo', 2);
      expect(withClass(el, 'current')).toEqual([]);
      expect(withClass(el, 'destination')).toEqual([2]);
    });

    it('beside the list, only the one chosen with its card’s map button, once it is', async () => {
      const { fixture, el } = await create([ONE, TWO]);
      expect(pinned(el)).toEqual([]);

      fixture.componentInstance.focus(2);
      await fixture.whenStable();
      expect(pinned(el)).toEqual([2]);
      expect(withClass(el, 'current')).toEqual([]);
    });
  });

  it('paints each marker in the color of its status, also those added later', async () => {
    const open: Status = { open: true, minutes: 120 };
    const soon: Status = { open: true, minutes: 20 };
    const closed: Status = { open: false, minutes: 60 };
    /** Venue 1's, venue 2's… */
    const setStatuses = (...list: Status[]) =>
      statuses.set(new Map(list.map((status, i) => [i + 1, status])));
    const { fixture, change, marker } = await create([ONE]);
    setStatuses(open, closed);
    await fixture.whenStable();
    expect(marker(1)!.classList).toContain('open');

    await change('venues', [ONE, TWO]);
    expect(marker(2)!.classList).toContain('closed');
    setStatuses(soon, closed);
    await fixture.whenStable();
    expect(marker(1)!.classList).toContain('soon');
    expect(marker(1)!.classList).not.toContain('open');
    expect(fitBounds).toHaveBeenCalledTimes(2);
  });

  it('doesn’t touch the markers when the minutes change but no color does', async () => {
    const { fixture, marker } = await create([ONE]);
    statuses.set(new Map([[1, { open: true, minutes: 120 }]]));
    await fixture.whenStable();
    const toggle = vi.spyOn(marker(1)!.classList, 'toggle');

    statuses.set(new Map([[1, { open: true, minutes: 119 }]]));
    await fixture.whenStable();
    expect(toggle).not.toHaveBeenCalled();

    statuses.set(new Map([[1, { open: true, minutes: 30 }]]));
    await fixture.whenStable();
    expect(marker(1)!.classList).toContain('soon');
  });
});
