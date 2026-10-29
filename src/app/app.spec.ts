import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Almacen } from './almacen';
import { App } from './app';
import { DatosRuta, Local } from './locales';

// jsdom no tiene ResizeObserver (texto plegable de las fichas), animate y getAnimations (visor de
// fotos, estrellas, corazón) ni matchMedia. Tampoco IndexedDB: el almacén se queda en memoria.
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.animate ??= () => ({ finished: Promise.resolve() }) as unknown as Animation;
Element.prototype.getAnimations ??= () => [];
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
    expect(TestBed.inject(Almacen).ajuste('vista')).toBe('fotos');
  });

  it('amplía una foto al pincharla y la cierra pinchando en cualquier sitio', async () => {
    const { fixture, el, pulsar } = await arrancar();
    await pulsar('app-local-card .foto');
    const visor = () => el.querySelector('app-visor-fotos [role=dialog]');
    expect(visor()!.querySelector('img')!.getAttribute('src')).toBe('data/fotos/01-1.jpg');

    await pulsar('app-visor-fotos .fondo');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(visor()).toBeNull();
  });

  it('cierra la foto ampliada al abrir el menú', async () => {
    const { fixture, el, pulsar } = await arrancar();
    await pulsar('app-local-card .foto');
    expect(el.querySelector('app-visor-fotos [role=dialog]')).not.toBeNull();

    await pulsar('.boton-menu');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.querySelector('app-visor-fotos [role=dialog]')).toBeNull();
    expect(el.querySelector('.menu')).not.toBeNull();
  });

  it('valora una tapa en la foto ampliada, con las estrellas o el teclado', async () => {
    const { fixture, el, pulsar } = await arrancar();
    const estrellas = () => [...el.querySelectorAll('app-visor-fotos app-estrellas button')];
    const marcada = () =>
      estrellas().findIndex((b) => b.getAttribute('aria-pressed') === 'true') + 1;
    await pulsar('app-local-card .foto');
    expect(marcada()).toBe(0);
    expect(el.querySelector('app-visor-fotos .frase')!.textContent).toContain(
      '¿Qué te ha parecido?',
    );

    await pulsar('app-visor-fotos app-estrellas button:nth-child(4)');
    expect(marcada()).toBe(4);
    expect(estrellas()[3].getAttribute('aria-label')).toBe('4 estrellas: Esto está increíble');
    // Pulsar las estrellas no cierra la foto.
    expect(el.querySelector('app-visor-fotos [role=dialog]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    await fixture.whenStable();
    expect(marcada()).toBe(2);

    await pulsar('app-visor-fotos .fondo');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.querySelector('app-local-card .foto')!.getAttribute('aria-label')).toBe(
      'Ampliar y valorar la foto de TAPA 1.1 (2 de 5 estrellas)',
    );
    expect(TestBed.inject(Almacen).valoraciones().get('1-1')).toBe(2);

    // Pulsar la que ya está marcada quita la valoración.
    await pulsar('app-local-card .foto');
    await pulsar('app-visor-fotos app-estrellas button:nth-child(2)');
    expect(marcada()).toBe(0);
    expect(TestBed.inject(Almacen).valoraciones().has('1-1')).toBe(false);
  });

  it('marca favoritos y filtra por ellos y por las tapas probadas', async () => {
    const { fixture, el, pulsar } = await arrancar();
    const nombres = () => [...el.querySelectorAll('app-local-card h2')].map((h) => h.textContent);
    const corazon = (n: number) => el.querySelectorAll('app-local-card app-favorito button')[n];

    await pulsar('app-local-card:nth-of-type(2) app-favorito button');
    expect(corazon(1).getAttribute('aria-pressed')).toBe('true');
    expect(corazon(0).getAttribute('aria-pressed')).toBe('false');
    await pulsar('.campo input[type=checkbox]');
    expect(nombres()).toEqual(['CÚPULA']);
    await pulsar('.campo input[type=checkbox]');

    // Las dos tapas de ORIGEN, probadas (valoradas).
    const almacen = TestBed.inject(Almacen);
    almacen.valorar(1, 1, 5);
    almacen.valorar(1, 2, 3);
    const probadas = [...el.querySelectorAll('.campo')]
      .find((c) => c.textContent!.includes('Probadas'))!
      .querySelector('select')!;
    probadas.value = 'pendientes';
    probadas.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(nombres()).toEqual(['CÚPULA']);
    probadas.value = 'todas';
    probadas.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(nombres()).toEqual(['ORIGEN']);

    await pulsar('.acciones button', 'Limpiar');
    expect(nombres()).toEqual(['ORIGEN', 'CÚPULA']);
  });

  it('al volver a abrir la app, los filtros, el orden y la vista son los que se dejaron', async () => {
    const primera = await arrancar();
    const buscar = primera.el.querySelector<HTMLInputElement>('.campo.texto input')!;
    buscar.value = 'cúpula';
    buscar.dispatchEvent(new Event('input'));
    await primera.fixture.whenStable();
    expect(primera.el.querySelectorAll('app-local-card').length).toBe(1);
    await primera.pulsar('.boton-menu');
    await primera.pulsar('.menu button', 'Fotos');
    primera.fixture.destroy();

    // El almacén es el mismo (en la app, el que se carga de IndexedDB al arrancar).
    const { el } = await arrancar();
    expect(el.querySelector<HTMLInputElement>('.campo.texto input')!.value).toBe('cúpula');
    expect(el.querySelectorAll('app-galeria li').length).toBe(1);
  });

  it('pinta los iconos como SVG', async () => {
    const { el } = await arrancar();
    const trazo = el.querySelector('app-local-card footer app-icono path')!;
    expect(trazo.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});
