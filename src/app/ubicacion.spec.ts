import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Ubicacion } from './ubicacion';

/** Un portal como los devuelve CartoCiudad. */
function portal(calle: string, portalNumber: number, lat: number, lng: number) {
  return {
    type: 'portal',
    address: `${calle} ${portalNumber}, Castelló de la Plana (Castelló de la Plana/Castellón de la Plana)`,
    tip_via: calle.split(' ')[0],
    portalNumber,
    lat,
    lng,
  };
}

describe('Ubicacion', () => {
  let ubicacion: Ubicacion;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    ubicacion = TestBed.inject(Ubicacion);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  /** La petición a ese servicio, cuando llegue (van una detrás de otra). */
  const peticion = (servicio: string) =>
    vi.waitFor(() => http.expectOne((r) => r.url.includes(servicio)));

  it('con número, pone el portal del callejero oficial de esa calle', async () => {
    const busqueda = ubicacion.buscar('Calle Herrero, 49');
    const callejero = await peticion('cartociudad');
    expect(callejero.request.params.get('municipio_filter')).toContain('Castelló de la Plana');
    callejero.flush([
      portal('CALLE ISABEL FERRER', 49, 39.988, -0.037),
      portal('CALLE HERRERO', 49, 39.979, -0.041),
    ]);
    await busqueda;
    expect(ubicacion.origen()).toEqual({ lat: 39.979, lng: -0.041, etiqueta: 'Calle Herrero, 49' });
  });

  it('si el callejero no tiene ese número, lo busca en OpenStreetMap', async () => {
    const busqueda = ubicacion.buscar('Avenida del Mar 20');
    (await peticion('cartociudad')).flush([portal('AVENIDA MAR', 209, 39.98, -0.001)]);
    (await peticion('nominatim')).flush([{ lat: '39.985', lon: '-0.033' }]);
    await busqueda;
    expect(ubicacion.origen()).toEqual({
      lat: 39.985,
      lng: -0.033,
      etiqueta: 'Avenida del Mar 20',
    });
  });

  it('sin número, o si el callejero falla, va a OpenStreetMap', async () => {
    let busqueda = ubicacion.buscar('Plaza Mayor');
    (await peticion('nominatim')).flush([{ lat: '39.986', lon: '-0.037' }]);
    await busqueda;
    expect(ubicacion.origen()?.lat).toBe(39.986);

    busqueda = ubicacion.buscar('Herrero 49');
    (await peticion('cartociudad')).error(new ProgressEvent('error'));
    (await peticion('nominatim')).flush([{ lat: '39.98', lon: '-0.04' }]);
    await busqueda;
    expect(ubicacion.origen()?.lat).toBe(39.98);
    expect(ubicacion.error()).toBe('');
  });
});
