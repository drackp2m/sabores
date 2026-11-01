import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { UserLocation } from './user-location';

/** A portal as CartoCiudad returns it. */
function portal(
  street: string,
  portalNumber: number,
  lat: number,
  lng: number,
  muni = 'Castelló de la Plana/Castellón de la Plana',
) {
  return {
    type: 'portal',
    address: `${street} ${portalNumber}, ${muni}`,
    tip_via: street.split(' ')[0],
    muni,
    portalNumber,
    lat,
    lng,
  };
}

describe('UserLocation', () => {
  let location: UserLocation;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    location = TestBed.inject(UserLocation);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  /** The request to that service, when it arrives (they go one after another). */
  const request = (service: string) =>
    vi.waitFor(() => http.expectOne((r) => r.url.includes(service)));

  const onStreetMap = (filter: string) =>
    vi.waitFor(() => http.expectOne((r) => r.url.includes('cartociudad') && r.params.has(filter)));

  /** Answers both street map searches: in Castelló and in the whole province. */
  async function streetMap(inCastello: unknown[], inProvince: unknown[] = []) {
    (await onStreetMap('municipio_filter')).flush(inCastello);
    (await onStreetMap('provincia_filter')).flush(inProvince);
  }

  /** Answers the OpenStreetMap searches, which go first around Castelló and then within it. */
  async function openStreetMap(nearby: unknown[], inCastello: unknown[]) {
    (await request('nominatim')).flush(nearby);
    (await request('nominatim')).flush(inCastello);
  }

  it('with a number, uses the portal of that street from the official street map', async () => {
    const search = location.search('Calle Herrero, 49');
    await streetMap([
      portal('CALLE ISABEL FERRER', 49, 39.988, -0.037),
      portal('CALLE HERRERO', 49, 39.979, -0.041),
    ]);
    await search;
    expect(location.origin()).toEqual({ lat: 39.979, lng: -0.041, label: 'Calle Herrero, 49' });
  });

  it('if another town’s name was typed, uses that town’s portal', async () => {
    const search = location.search('Calle Mayor 10, Almassora');
    await streetMap(
      [portal('CALLE MAYOR', 10, 39.984, -0.037)],
      [
        portal('CALLE MAYOR', 10, 40.357, 0.024, 'Albocàsser'),
        portal('CALLE MAYOR', 10, 39.947, -0.06, 'Almassora'),
      ],
    );
    await search;
    expect(location.origin()?.lat).toBe(39.947);
  });

  it('another town’s portal doesn’t count if its name wasn’t typed', async () => {
    const search = location.search('Carrer Major 10');
    await streetMap([], [portal('CALLE MAJOR', 10, 39.82, -0.23, 'Almenara')]);
    await openStreetMap([], [{ lat: '39.984', lon: '-0.037' }]);
    await search;
    expect(location.origin()?.lat).toBe(39.984);
  });

  it('if the street map doesn’t have that number, looks in OpenStreetMap', async () => {
    const search = location.search('Avenida del Mar 20');
    await streetMap([portal('AVENIDA MAR', 209, 39.98, -0.001)]);
    await openStreetMap([], [{ lat: '39.985', lon: '-0.033' }]);
    await search;
    expect(location.origin()).toEqual({
      lat: 39.985,
      lng: -0.033,
      label: 'Avenida del Mar 20',
    });
  });

  it('without a number, or if the street map fails, goes to OpenStreetMap', async () => {
    let search = location.search('Plaza Mayor');
    await openStreetMap([], [{ lat: '39.986', lon: '-0.037' }]);
    await search;
    expect(location.origin()?.lat).toBe(39.986);

    search = location.search('Herrero 49');
    (await onStreetMap('municipio_filter')).error(new ProgressEvent('error'));
    (await onStreetMap('provincia_filter')).error(new ProgressEvent('error'));
    await openStreetMap([], [{ lat: '39.98', lon: '-0.04' }]);
    await search;
    expect(location.origin()?.lat).toBe(39.98);
    expect(location.error()).toBe('');
  });

  it('if the street map doesn’t answer, moves on to OpenStreetMap without waiting', async () => {
    vi.useFakeTimers();
    const search = location.search('Herrero 49');
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
    expect(http.match((r) => r.url.includes('cartociudad')).every((r) => r.cancelled)).toBe(true);
    await openStreetMap([], [{ lat: '39.98', lon: '-0.04' }]);
    await search;
    expect(location.origin()?.lat).toBe(39.98);
  });

  it('a nearby town beats anything with its name in Castelló', async () => {
    const search = location.search('Sagunto');
    const nominatim = await request('nominatim');
    expect(nominatim.request.params.get('bounded')).toBe('1');
    nominatim.flush([{ lat: '39.679', lon: '-0.279', category: 'boundary' }]);
    await search;
    expect(location.origin()?.lat).toBe(39.679);
  });

  it('anything else, first in Castelló, then nearby and no further', async () => {
    const peak = { lat: '40.239', lon: '-0.532', category: 'natural' };
    let search = location.search('Herrero');
    await openStreetMap([peak], [{ lat: '39.988', lon: '-0.03', category: 'leisure' }]);
    await search;
    expect(location.origin()?.lat).toBe(39.988);

    location.clear();
    search = location.search('Peñagolosa');
    await openStreetMap([peak], []);
    await search;
    expect(location.origin()?.lat).toBe(40.239);

    location.clear();
    search = location.search('Calle Inventada');
    await openStreetMap([], []);
    await search;
    expect(location.origin()).toBeNull();
    expect(location.error()).toBe('No se ha encontrado «Calle Inventada» cerca de Castelló.');
  });
});
