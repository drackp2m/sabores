import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';

import { Status, Venue } from '../venues';
import { VenueMap } from './map';

// jsdom has no ResizeObserver or scrollIntoView (focus).
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

function venue(number: number): Venue {
  return {
    number,
    name: `VENUE ${number}`,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: null,
    instagram: null,
    drinks: [],
    notes: [],
    schedule: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
    tapas: [],
    location: { lat: 39.98 + number / 1000, lng: -0.04 },
  };
}

const [ONE, TWO, THREE] = [1, 2, 3].map(venue);

describe('VenueMap', () => {
  // In jsdom the map has no size: only the number of times it frames gets counted.
  let fitBounds: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis();
  });
  afterEach(() => fitBounds.mockRestore());

  async function create(venues: Venue[]) {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', venues);
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
    expect(popup()).toBe('2. VENUE 2');

    await change('venues', [THREE, TWO, ONE]);
    expect(popup()).toBe('2. VENUE 2');
    await change('venues', [ONE, THREE]);
    expect(popup()).toBeUndefined();
  });

  it('if asked to focus a venue before Leaflet arrives, does it as soon as it’s there', async () => {
    const fixture = TestBed.createComponent(VenueMap);
    fixture.componentRef.setInput('venues', [ONE, TWO]);
    fixture.componentInstance.focus(2);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.leaflet-popup strong')?.textContent).toBe('2. VENUE 2');
  });

  it('paints each marker in the color of its status, also those added later', async () => {
    const open: Status = { open: true, minutes: 120 };
    const soon: Status = { open: true, minutes: 20 };
    const closed: Status = { open: false, minutes: 60 };
    /** Venue 1's, venue 2's… */
    const statuses = (...list: Status[]) => new Map(list.map((status, i) => [i + 1, status]));
    const { change, marker } = await create([ONE]);
    await change('statuses', statuses(open, closed));
    expect(marker(1)!.classList).toContain('open');

    await change('venues', [ONE, TWO]);
    expect(marker(2)!.classList).toContain('closed');
    await change('statuses', statuses(soon, closed));
    expect(marker(1)!.classList).toContain('soon');
    expect(marker(1)!.classList).not.toContain('open');
    expect(fitBounds).toHaveBeenCalledTimes(2);
  });
});
