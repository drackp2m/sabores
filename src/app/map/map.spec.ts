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
  beforeEach(() => {
    fitBounds = vi.spyOn(maplibre.Map.prototype, 'fitBounds').mockReturnThis();
    statuses.set(new Map());
    localStorage.clear(); // The theme.
    TestBed.configureTestingModule({
      providers: [
        { provide: TapasRoute, useValue: { statuses, arrivals } },
        { provide: UserLocation, useValue: { lost, mapInSight } },
      ],
    });
  });
  afterEach(() => fitBounds.mockRestore());

  async function create(venues: Venue[], routeTo: number | null = null) {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', venues);
    fixture.componentRef.setInput('routeTo', routeTo);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const change = async (name: string, value: unknown) => {
      fixture.componentRef.setInput(name, value);
      await fixture.whenStable();
    };
    const marker = (number: number) =>
      el.querySelector<HTMLElement>(`.venue-marker[title^="${number}."]`);
    return { fixture, el, change, marker };
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
    const { fixture, el, change } = await create([ONE, TWO, THREE]);
    fixture.componentInstance.focus(2);
    await fixture.whenStable();
    const popup = () => el.querySelector('.maplibregl-popup strong')?.textContent;
    expect(popup()).toBe('VENUE 2');

    await change('venues', [THREE, TWO, ONE]);
    expect(popup()).toBe('VENUE 2');
    await change('venues', [ONE, THREE]);
    expect(popup()).toBeUndefined();
  });

  it('if asked to focus a venue before MapLibre arrives, does it as soon as it’s there', async () => {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', [ONE, TWO]);
    fixture.componentInstance.focus(2);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 2');
  });

  describe('popup', () => {
    async function openPopup() {
      const created = await create([ONE, TWO]);
      created.fixture.componentInstance.focus(2);
      await created.fixture.whenStable();
      const popup = created.el.querySelector<HTMLElement>('.maplibregl-popup')!;
      return { ...created, popup, button: popup.querySelector('button')! };
    }

    it('has the number, the name, the address and a button to the venue', async () => {
      const { popup, button } = await openPopup();
      expect(popup.querySelector('.venue-number')?.textContent).toBe('2');
      expect(popup.querySelector('.popup-heading strong')?.textContent).toBe('VENUE 2');
      expect(button.getAttribute('aria-label')).toBe('Ver los detalles del local');
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

      it('in the small map it goes as high as it can, with the venue in the middle', async () => {
        const { easeTo, restore } = watchCamera(300);
        await openPopup();

        // jsdom measures nothing: the popup is left with no height, only with the top margin.
        const { center, offset, zoom } = easeTo.mock.lastCall![0];
        expect(center).toEqual({ lng: TWO.location!.lng, lat: TWO.location!.lat });
        expect(offset).toEqual([0, 10 - 300 / 2]);
        expect(zoom).toBe(16);
        restore();
      });

      it('enlarged, the venue goes a third of the way down', async () => {
        const { easeTo, restore } = watchCamera(900);
        const { fixture, el } = await create([ONE, TWO]);
        el.querySelector<HTMLElement>('.expand')!.click();
        fixture.componentInstance.focus(2);
        await fixture.whenStable();

        expect(easeTo.mock.lastCall![0].offset).toEqual([0, 900 / 3 - 900 / 2]);
        restore();
      });
    });

    it('keeps up with the arrival time and the schedule status while open', async () => {
      const arrival: Arrival = { meters: 900, mode: 'walking', minutes: 12 };
      arrivals.set(new Map([[2, arrival]]));
      statuses.set(new Map([[2, { open: true, minutes: 120 }]]));
      const { fixture, popup } = await openPopup();
      const image = popup.querySelector('img');
      const status = () => popup.querySelector('.popup-status')!.textContent;
      expect(status()).toContain('12 min');

      arrivals.set(new Map([[2, { ...arrival, minutes: 7 }]]));
      await fixture.whenStable();
      expect(status()).toContain('7 min');
      expect(popup.querySelector('img')).toBe(image); // The photos aren't loaded again.

      arrivals.set(new Map());
      statuses.set(new Map());
      await fixture.whenStable();
      expect(status()).toBe('');
    });

    it('its button opens the venue', async () => {
      const { fixture, button } = await openPopup();
      const open = vi.fn();
      fixture.componentInstance.venueOpen.subscribe(open);
      button.click();
      expect(open).toHaveBeenCalledExactlyOnceWith(2);
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

    it('clicking outside closes it and leaves its venue selected, until the next click', async () => {
      const { fixture, el, marker } = await openPopup();
      const clickMap = async () => {
        el.querySelector<HTMLElement>('.maplibregl-canvas-container')!.click();
        await fixture.whenStable();
      };

      await clickMap();
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      expect(marker(2)!.classList).toContain('active');

      await clickMap();
      expect(marker(2)!.classList).not.toContain('active');
    });

    it('its marker opens and closes it, and it stays selected', async () => {
      const { fixture, el, marker } = await create([ONE, TWO]);
      const select = vi.fn();
      fixture.componentInstance.venueSelect.subscribe(select);
      const clickMarker = async () => {
        marker(2)!.click();
        await fixture.whenStable();
      };

      await clickMarker();
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 2');
      expect(select).toHaveBeenCalledExactlyOnceWith(2);

      await clickMarker();
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      expect(marker(2)!.classList).toContain('active');
    });

    it('only one is open: another venue’s replaces it', async () => {
      const { fixture, el, marker } = await openPopup();

      marker(1)!.click();
      await fixture.whenStable();
      expect(el.querySelectorAll('.maplibregl-popup').length).toBe(1);
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 1');

      fixture.componentInstance.focus(2);
      await fixture.whenStable();
      expect(el.querySelectorAll('.maplibregl-popup').length).toBe(1);
      expect(el.querySelector('.maplibregl-popup strong')?.textContent).toBe('VENUE 2');
    });

    it('in the venue view, the map has none: it only centers on the venue', async () => {
      const { fixture, el, marker } = await create([ONE], 1);
      fixture.componentInstance.focus(1);
      await fixture.whenStable();
      expect(el.querySelector('.maplibregl-popup')).toBeNull();
      expect(marker(1)!.classList).toContain('static');
    });
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

  it('adds its own to the style: the local names, the credits in Spanish and the route', async () => {
    const { el } = await create([ONE]);
    const style = FakeMap.of(el).getStyle();
    expect(JSON.stringify(style)).not.toContain('name_en');
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
