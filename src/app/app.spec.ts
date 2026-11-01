import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import * as L from 'leaflet';

import { App } from './app';
import { Store } from './store';
import { RouteData, Venue } from './venues';

// jsdom has no ResizeObserver (collapsible text in the cards, map), IntersectionObserver (scroll-to-top
// button), animate or getAnimations (photo viewer, stars, heart) or matchMedia. No IndexedDB either:
// the store stays in memory.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;
Element.prototype.animate ??= () => ({ finished: Promise.resolve() }) as unknown as Animation;
Element.prototype.getAnimations ??= () => [];
window.matchMedia ??= () => ({ matches: false }) as MediaQueryList;

function venue(number: number, name: string, drinks: [string, string][]): Venue {
  const slots = [{ open: '00:00', close: null }];
  return {
    number,
    name,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: '600000000',
    instagram: '@venue',
    drinks: drinks.map(([name, type]) => ({ name, type })),
    notes: [],
    schedule: {
      monday: slots,
      tuesday: slots,
      wednesday: slots,
      thursday: slots,
      friday: slots,
      saturday: slots,
      sunday: slots,
    },
    tapas: [1, 2].map((t) => ({
      number: t,
      name: `TAPA ${number}.${t}`,
      description: '',
      photo: `photos/0${number}-${t}.jpg`,
      glutenFree: 'no' as const,
      flavorRoute: false,
    })),
    // No coordinates: the map doesn't have to frame anything (jsdom has no sizes).
    location: null,
  };
}

const DATA: RouteData = {
  event: {
    name: 'Test route',
    edition: '',
    startDate: '2000-01-01',
    endDate: '2100-01-01',
    price: '',
    city: '',
  },
  venues: [
    venue(1, 'ORIGEN', [
      ['Caña', 'Cerveza'],
      ['Copa de vino', 'Vino'],
      ['Agua', 'Agua'],
    ]),
    venue(2, 'CÚPULA', [
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
  afterEach(() => vi.unstubAllGlobals());

  /** What the server answers to the data request. */
  const serve = (response: () => Response) => {
    const request = vi.fn(async () => response());
    vi.stubGlobal('fetch', request);
    return request;
  };

  async function start(data = DATA) {
    serve(() => new Response(JSON.stringify(data)));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const press = async (selector: string, text?: string) => {
      const button = [...el.querySelectorAll<HTMLElement>(selector)].find(
        (b) => !text || b.textContent!.includes(text),
      )!;
      button.click();
      await fixture.whenStable();
    };
    return { fixture, el, press };
  }

  it('requests data/venues.json on startup', async () => {
    const request = serve(() => new Response(JSON.stringify(DATA)));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(request).toHaveBeenCalledExactlyOnceWith('data/venues.json');
  });

  it('uses the data index.html has already requested, without requesting it again', async () => {
    const request = serve(() => new Response(''));
    vi.stubGlobal('routeData', Promise.resolve(new Response(JSON.stringify(DATA))));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-venue-card').length).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });

  it('warns if the data can’t be loaded', async () => {
    serve(() => new Response('', { status: 404 }));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.message.error')?.textContent).toContain('venues.json');
    expect(el.querySelector('.summary')).toBeNull();
  });

  it('shows the cards with their drinks and offers filtering by type, the most common first', async () => {
    const { el } = await start();
    expect(el.querySelectorAll('app-venue-card').length).toBe(2);
    expect(el.querySelector('app-venue-card')!.textContent).toContain('Agua · Caña · Copa de vino');
    const options = [...el.querySelectorAll('.field')]
      .find((f) => f.textContent!.includes('Bebida'))!
      .querySelectorAll('option');
    expect([...options].map((o) => o.textContent!.trim())).toEqual([
      'Cualquiera',
      'Agua (2)',
      'Cerveza (1)',
      'Vermut (1)',
      'Vino (1)',
    ]);
  });

  it('in the «Fotos» view opens a venue and returns to the gallery', async () => {
    Element.prototype.scrollTo = () => {}; // jsdom doesn't implement it
    const { el, press } = await start();
    await press('.menu-button');
    await press('.menu button', 'Fotos');
    expect(el.querySelector('.menu')).toBeNull();
    expect(el.querySelector('app-venue-card')).toBeNull();
    expect(el.querySelectorAll('app-gallery li').length).toBe(2);

    await press('app-gallery li button', 'CÚPULA');
    expect(el.querySelector('.filters')).toBeNull();
    expect(el.querySelector('app-venue-card h2')!.textContent).toBe('CÚPULA');
    expect(history.state).toEqual({ venue: 2 });
    expect(el.querySelector('.back')).not.toBeNull();

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('app-venue-card')).toBeNull();
    expect(el.querySelectorAll('app-gallery li').length).toBe(2);
    expect(TestBed.inject(Store).setting('view')).toBe('photos');
  });

  it('enlarges a photo on clicking it and closes it on clicking anywhere', async () => {
    const { fixture, el, press } = await start();
    await press('app-venue-card .photo');
    const viewer = () => el.querySelector('app-photo-viewer [role=dialog]');
    const large = viewer()!.querySelector('img')!;
    expect(large.getAttribute('src')).toBe('data/photos/01-1-690.webp');
    expect(large.style.backgroundImage).toContain('data/photos/01-1-500.webp');

    await press('app-photo-viewer .backdrop');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(viewer()).toBeNull();
  });

  it('closes the menu on clicking outside it, but not inside', async () => {
    const { el, press } = await start();
    await press('.menu-button');
    await press('.menu .group');
    expect(el.querySelector('.menu')).not.toBeNull();

    await press('.summary');
    expect(el.querySelector('.menu')).toBeNull();
  });

  it('closes the enlarged photo on opening the menu', async () => {
    const { fixture, el, press } = await start();
    await press('app-venue-card .photo');
    expect(el.querySelector('app-photo-viewer [role=dialog]')).not.toBeNull();

    await press('.menu-button');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.querySelector('app-photo-viewer [role=dialog]')).toBeNull();
    expect(el.querySelector('.menu')).not.toBeNull();
  });

  it('rates a tapa in the enlarged photo, with the stars or the keyboard', async () => {
    const { fixture, el, press } = await start();
    const stars = () => [...el.querySelectorAll('app-photo-viewer app-stars button')];
    const marked = () => stars().findIndex((b) => b.getAttribute('aria-pressed') === 'true') + 1;
    await press('app-venue-card .photo');
    expect(marked()).toBe(0);
    expect(el.querySelector('app-photo-viewer .phrase')!.textContent).toContain(
      '¿Qué te ha parecido?',
    );

    await press('app-photo-viewer app-stars button:nth-child(4)');
    expect(marked()).toBe(4);
    expect(stars()[3].getAttribute('aria-label')).toBe('4 estrellas: Esto está increíble');
    // Pressing the stars doesn't close the photo.
    expect(el.querySelector('app-photo-viewer [role=dialog]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    await fixture.whenStable();
    expect(marked()).toBe(2);

    await press('app-photo-viewer .backdrop');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.querySelector('app-venue-card .photo')!.getAttribute('aria-label')).toBe(
      'Ampliar y valorar la foto de TAPA 1.1 (2 de 5 estrellas)',
    );
    expect(TestBed.inject(Store).ratings().get('1-1')).toBe(2);

    // Pressing the one already marked removes the rating.
    await press('app-venue-card .photo');
    await press('app-photo-viewer app-stars button:nth-child(2)');
    expect(marked()).toBe(0);
    expect(TestBed.inject(Store).ratings().has('1-1')).toBe(false);
  });

  it('marks favorites and filters by them and by the tried tapas', async () => {
    const { fixture, el, press } = await start();
    const names = () => [...el.querySelectorAll('app-venue-card h2')].map((h) => h.textContent);
    const heart = (n: number) => el.querySelectorAll('app-venue-card app-favorite button')[n];

    await press('app-venue-card:nth-of-type(2) app-favorite button');
    expect(heart(1).getAttribute('aria-pressed')).toBe('true');
    expect(heart(0).getAttribute('aria-pressed')).toBe('false');
    await press('.field input[type=checkbox]');
    expect(names()).toEqual(['CÚPULA']);
    await press('.field input[type=checkbox]');

    // Both of ORIGEN's tapas, tried (rated).
    const store = TestBed.inject(Store);
    store.rate(1, 1, 5);
    store.rate(1, 2, 3);
    const tried = [...el.querySelectorAll('.field')]
      .find((f) => f.textContent!.includes('Probadas'))!
      .querySelector('select')!;
    tried.value = 'pending';
    tried.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(names()).toEqual(['CÚPULA']);
    tried.value = 'all';
    tried.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(names()).toEqual(['ORIGEN']);

    await press('.actions button', 'Limpiar');
    expect(names()).toEqual(['ORIGEN', 'CÚPULA']);
  });

  it('the map doesn’t move on marking a favorite or rating, and waits for typing to stop', async () => {
    // In jsdom the map has no size: only the number of times it frames gets counted.
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis();
    const { fixture, el, press } = await start({
      ...DATA,
      venues: DATA.venues.map((v) => ({
        ...v,
        location: { lat: 39.98 + v.number / 1000, lng: 0 },
      })),
    });
    const markers = () => el.querySelectorAll('app-map .leaflet-marker-icon').length;
    expect(markers()).toBe(2);
    expect(fitBounds).toHaveBeenCalledTimes(1);

    await press('app-venue-card:nth-of-type(2) app-favorite button');
    TestBed.inject(Store).rate(1, 1, 4);
    await fixture.whenStable();
    expect(fitBounds).toHaveBeenCalledTimes(1);

    // The list changes right away; the map, half a second after the last letter.
    const search = el.querySelector<HTMLInputElement>('.field.text input')!;
    search.value = 'cúpula';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelectorAll('app-venue-card').length).toBe(1);
    expect(markers()).toBe(2);
    await new Promise((r) => setTimeout(r, 600));
    await fixture.whenStable();
    expect(markers()).toBe(1);
    expect(fitBounds).toHaveBeenCalledTimes(2);
    fitBounds.mockRestore();
  });

  it('on reopening the app, the filters, sort order and view are as they were left', async () => {
    const first = await start();
    const search = first.el.querySelector<HTMLInputElement>('.field.text input')!;
    search.value = 'cúpula';
    search.dispatchEvent(new Event('input'));
    await first.fixture.whenStable();
    expect(first.el.querySelectorAll('app-venue-card').length).toBe(1);
    await first.press('.menu-button');
    await first.press('.menu button', 'Fotos');
    first.fixture.destroy();

    // The store is the same one (in the app, the one loaded from IndexedDB on startup).
    const { el } = await start();
    expect(el.querySelector<HTMLInputElement>('.field.text input')!.value).toBe('cúpula');
    expect(el.querySelectorAll('app-gallery li').length).toBe(1);
  });

  it('creates the schedule the first time it opens and keeps it', async () => {
    const { fixture, el } = await start();
    const cards = el.querySelectorAll('app-venue-card');
    const schedule = cards[0].querySelector('details')!;
    expect(el.querySelector('app-venue-card dl')).toBeNull();

    schedule.querySelector('summary')!.click();
    await fixture.whenStable();
    expect(schedule.open).toBe(true);
    expect(schedule.querySelectorAll('dt').length).toBe(7);
    expect(cards[1].querySelector('dl')).toBeNull();
  });

  it('the heart only has the ripple and sparks while it beats', async () => {
    const { fixture, el } = await start();
    const heart = el.querySelector<HTMLElement>('app-venue-card app-favorite')!;
    expect(heart.querySelector('.ripple, .spark')).toBeNull();

    const animate = vi.spyOn(Element.prototype, 'animate');
    heart.querySelector('button')!.click();
    await fixture.whenStable();
    expect(animate.mock.instances.filter((e) => (e as Element).matches('.spark')).length).toBe(8);
    animate.mockRestore();
    await vi.waitFor(() => expect(heart.querySelector('.ripple, .spark')).toBeNull());
  });

  it('paints the icons as SVG, with their strokes just once on the page', async () => {
    const { el } = await start();
    const icons = el.querySelectorAll('app-venue-card footer app-icon use');
    expect(icons.length).toBe(6); // Phone, Instagram and heart, on both cards.
    for (const icon of icons) expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const symbol = document.querySelectorAll(icons[0].getAttribute('href')!);
    expect(symbol.length).toBe(1);
    expect(symbol[0].querySelector('path')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(el.querySelector('app-icon path')).toBeNull();
  });
});
