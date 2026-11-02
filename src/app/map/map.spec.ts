import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';

import { testVenue } from '../../testing/venue';
import { TapasRoute } from '../tapas-route';
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
  // In jsdom the map has no size: only the number of times it frames gets counted.
  let fitBounds: ReturnType<typeof vi.spyOn>;
  const statuses = signal<ReadonlyMap<number, Status>>(new Map());
  const arrivals = signal<ReadonlyMap<number, Arrival>>(new Map());
  beforeEach(() => {
    fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis();
    statuses.set(new Map());
    TestBed.configureTestingModule({
      providers: [{ provide: TapasRoute, useValue: { statuses, arrivals } }],
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
      el.querySelector<HTMLElement>(`.leaflet-marker-icon[title^="${number}."]`);
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
    expect(el.querySelectorAll('.leaflet-marker-icon').length).toBe(2);
  });

  it('the open popup stays open while its venue stays on the map', async () => {
    const { fixture, el, change } = await create([ONE, TWO, THREE]);
    fixture.componentInstance.focus(2);
    await fixture.whenStable();
    const popup = () => el.querySelector('.leaflet-popup strong')?.textContent;
    expect(popup()).toBe('VENUE 2');

    await change('venues', [THREE, TWO, ONE]);
    expect(popup()).toBe('VENUE 2');
    await change('venues', [ONE, THREE]);
    expect(popup()).toBeUndefined();
  });

  it('if asked to focus a venue before Leaflet arrives, does it as soon as it’s there', async () => {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', [ONE, TWO]);
    fixture.componentInstance.focus(2);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.leaflet-popup strong')?.textContent).toBe('VENUE 2');
  });

  describe('popup', () => {
    async function openPopup() {
      const created = await create([ONE, TWO]);
      created.fixture.componentInstance.focus(2);
      await created.fixture.whenStable();
      const popup = created.el.querySelector<HTMLElement>('.leaflet-popup')!;
      return { ...created, popup, button: popup.querySelector('button')! };
    }

    it('has the number, the name, the address and a button to the venue, and no close button', async () => {
      const { popup, button } = await openPopup();
      expect(popup.querySelector('.venue-number')?.textContent).toBe('2');
      expect(popup.querySelector('.popup-heading strong')?.textContent).toBe('VENUE 2');
      expect(button.getAttribute('aria-label')).toBe('Ver los detalles del local');
      expect(popup.querySelector('.leaflet-popup-close-button')).toBeNull();
    });

    it('takes up all the width between the map’s buttons, keeping their margin', async () => {
      const size = vi
        .spyOn(L.Map.prototype, 'getSize')
        .mockImplementation(() => new L.Point(400, 300));
      const { popup } = await openPopup();
      const content = popup.querySelector<HTMLElement>('.leaflet-popup-content')!;
      expect(content.style.width).toBe(`${400 - 2 * (10 + 36 + 10)}px`);
      size.mockRestore();
    });

    describe('on opening', () => {
      /** Where the map's center ends up, relative to venue 2, in pixels at the zoom it goes to. */
      function centerFromVenue(setView: { mock: { lastCall?: Parameters<L.Map['setView']> } }) {
        const [center, zoom] = setView.mock.lastCall!;
        const pixels = (point: L.LatLngExpression) =>
          L.CRS.EPSG3857.latLngToPoint(L.latLng(point as L.LatLngLiteral), zoom!);
        return pixels(center).subtract(pixels(TWO.location!));
      }

      it('in the small map it goes as high as it can, with the venue in the middle', async () => {
        const size = vi
          .spyOn(L.Map.prototype, 'getSize')
          .mockImplementation(() => new L.Point(400, 300));
        const setView = vi.spyOn(L.Map.prototype, 'setView');
        await openPopup();

        // jsdom measures nothing: the popup is left with no height, only with the top margin.
        const { x, y } = centerFromVenue(setView);
        expect(x).toBeCloseTo(0, 2);
        expect(y).toBeCloseTo(300 / 2 - 10, 2);
        expect(setView.mock.lastCall![1]).toBe(17);
        size.mockRestore();
        setView.mockRestore();
      });

      it('enlarged, the venue goes a third of the way down', async () => {
        const size = vi
          .spyOn(L.Map.prototype, 'getSize')
          .mockImplementation(() => new L.Point(400, 900));
        const setView = vi.spyOn(L.Map.prototype, 'setView');
        const { fixture, el } = await create([ONE, TWO]);
        el.querySelector<HTMLElement>('.expand')!.click();
        fixture.componentInstance.focus(2);
        await fixture.whenStable();

        const { x, y } = centerFromVenue(setView);
        expect(x).toBeCloseTo(0, 2);
        expect(y).toBeCloseTo(900 / 2 - 900 / 3, 2);
        size.mockRestore();
        setView.mockRestore();
      });
    });

    it('its button opens the venue', async () => {
      const { fixture, button } = await openPopup();
      const open = vi.fn();
      fixture.componentInstance.venueOpen.subscribe(open);
      button.click();
      expect(open).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('dragging from it moves the map, and letting go on its button doesn’t open the venue', async () => {
      const { fixture, el, button } = await openPopup();
      const open = vi.fn();
      fixture.componentInstance.venueOpen.subscribe(open);
      const mouse = (x: number) => ({ bubbles: true, button: 1, clientX: x, clientY: 100 });
      const pane = el.querySelector<HTMLElement>('.leaflet-map-pane')!;
      const before = pane.style.left;

      button.dispatchEvent(new MouseEvent('mousedown', mouse(100)));
      button.dispatchEvent(new MouseEvent('mousemove', mouse(160)));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      button.dispatchEvent(new MouseEvent('mouseup', mouse(160)));
      button.click();

      expect(pane.style.left).not.toBe(before);
      expect(open).not.toHaveBeenCalled();
    });

    it('in the venue view, the map has none: it only centers on the venue', async () => {
      const { fixture, el, marker } = await create([ONE], 1);
      fixture.componentInstance.focus(1);
      await fixture.whenStable();
      expect(el.querySelector('.leaflet-popup')).toBeNull();
      expect(marker(1)!.classList).not.toContain('leaflet-interactive');
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
