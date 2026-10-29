import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { App } from './app';
import { DatosRuta, Local } from './locales';

// jsdom no tiene ResizeObserver (texto plegable de las fichas) ni animate y matchMedia (visor de fotos).
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.animate ??= () => ({ finished: Promise.resolve() }) as unknown as Animation;
window.matchMedia ??= () => ({ matches: false }) as MediaQueryList;

function local(number: number, name: string, drinks: [string, string][]): Local {
  const franjas = [{ open: '00:00', close: null }];
  return {
    number,
    name,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: '600000000',
    instagram: '@local',
    drinks: drinks.map(([name, type]) => ({ name, type })),
    notes: [],
    schedule: {
      monday: franjas,
      tuesday: franjas,
      wednesday: franjas,
      thursday: franjas,
      friday: franjas,
      saturday: franjas,
      sunday: franjas,
    },
    tapas: [1, 2].map((t) => ({
      number: t,
      name: `TAPA ${number}.${t}`,
      description: '',
      photo: `fotos/0${number}-${t}.jpg`,
      glutenFree: 'no' as const,
      castelloRutaDeSabor: false,
    })),
    // Sin coordenadas: el mapa no tiene que ajustarse (jsdom no tiene tamaños).
    location: null,
  };
}

const DATOS: DatosRuta = {
  event: {
    name: 'Ruta de prueba',
    edition: '',
    startDate: '2000-01-01',
    endDate: '2100-01-01',
    price: '',
    city: '',
  },
  locales: [
    local(1, 'ORIGEN', [
      ['Caña', 'Cerveza'],
      ['Copa de vino', 'Vino'],
      ['Agua', 'Agua'],
    ]),
    local(2, 'CÚPULA', [
      ['Agua', 'Agua'],
      ['Vermut', 'Vermut'],
    ]),
  ],
};

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  async function arrancar() {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController).expectOne('data/locales.json').flush(DATOS);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const pulsar = async (selector: string, texto?: string) => {
      const boton = [...el.querySelectorAll<HTMLElement>(selector)].find(
        (b) => !texto || b.textContent!.includes(texto),
      )!;
      boton.click();
      await fixture.whenStable();
    };
    return { fixture, el, pulsar };
  }

  it('pide data/locales.json al arrancar', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
    TestBed.inject(HttpTestingController).expectOne('data/locales.json');
  });

  it('muestra las fichas con las bebidas y ofrece filtrar por tipo, las más habituales primero', async () => {
    const { el } = await arrancar();
    expect(el.querySelectorAll('app-local-card').length).toBe(2);
    expect(el.querySelector('app-local-card')!.textContent).toContain('Agua · Caña · Copa de vino');
    const opciones = [...el.querySelectorAll('.campo')]
      .find((c) => c.textContent!.includes('Bebida'))!
      .querySelectorAll('option');
    expect([...opciones].map((o) => o.textContent!.trim())).toEqual([
      'Cualquiera',
      'Agua (2)',
      'Cerveza (1)',
      'Vermut (1)',
      'Vino (1)',
    ]);
  });

  it('en la vista «Fotos» abre un local y vuelve a la galería', async () => {
    Element.prototype.scrollTo = () => {}; // jsdom no lo implementa
    const { el, pulsar } = await arrancar();
    await pulsar('.boton-menu');
    await pulsar('.menu button', 'Fotos');
    expect(el.querySelector('.menu')).toBeNull();
    expect(el.querySelector('app-local-card')).toBeNull();
    expect(el.querySelectorAll('app-galeria li').length).toBe(2);

    await pulsar('app-galeria li button', 'CÚPULA');
    expect(el.querySelector('.filtros')).toBeNull();
    expect(el.querySelector('app-local-card h2')!.textContent).toBe('CÚPULA');
    expect(history.state).toEqual({ local: 2 });
    expect(el.querySelector('.volver')).not.toBeNull();

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('app-local-card')).toBeNull();
    expect(el.querySelectorAll('app-galeria li').length).toBe(2);
    expect(localStorage.getItem('ruta-tapas:vista')).toBe('fotos');
  });

  it('amplía una foto al pincharla y la cierra con la X', async () => {
    const { fixture, el, pulsar } = await arrancar();
    await pulsar('app-local-card .foto');
    const visor = () => el.querySelector('app-visor-fotos [role=dialog]');
    expect(visor()!.querySelector('img')!.getAttribute('src')).toBe('data/fotos/01-1.jpg');

    await pulsar('app-visor-fotos .cerrar');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(visor()).toBeNull();
  });

  it('pinta los iconos como SVG', async () => {
    const { el } = await arrancar();
    const trazo = el.querySelector('app-local-card footer app-icono path')!;
    expect(trazo.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});
