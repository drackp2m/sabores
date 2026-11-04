import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import * as maplibre from 'maplibre-gl';

import { stubIntersections } from '../testing/intersections';
import { testTapa, testVenue, week } from '../testing/venue';
import { App } from './app';
import { Clock } from './clock';
import { ScrollPosition } from './scroll-position';
import { Store } from './store';
import { Filters, NO_FILTERS, RouteData, TimeSlot, Venue } from './venues';

function venue(number: number, name: string, drinks: [string, string][]): Venue {
  return testVenue({
    number,
    name,
    phone: '600000000',
    instagram: '@venue',
    drinks: drinks.map(([name, type]) => ({ name, type })),
    schedule: week([{ open: '00:00', close: null }]),
    tapas: [1, 2].map((t) =>
      testTapa({ number: t, name: `TAPA ${number}.${t}`, photo: `photos/0${number}-${t}.jpg` }),
    ),
  });
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
    tried.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['CÚPULA']);
    tried.value = 'all';
    tried.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['ORIGEN']);

    await press('.actions button', 'Limpiar');
    expect(names()).toEqual(['ORIGEN', 'CÚPULA']);
  });

  it('the map doesn’t move on marking a favorite or rating, and waits for typing to stop', async () => {
    // In jsdom the map has no size: only the number of times it frames gets counted.
    const fitBounds = vi.spyOn(maplibre.Map.prototype, 'fitBounds').mockReturnThis();
    const { fixture, el, press } = await start({
      ...DATA,
      venues: DATA.venues.map((v) => ({
        ...v,
        location: { lat: 39.98 + v.number / 1000, lng: 0 },
      })),
    });
    const markers = () => el.querySelectorAll('app-map .venue-marker').length;
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

    // With «Limpiar» there's nothing to wait for.
    await press('.actions button', 'Limpiar');
    expect(search.value).toBe('');
    expect(markers()).toBe(2);
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

  it('shows a saved drink even though its option arrives with the data', async () => {
    TestBed.inject(Store).saveSetting('filters', { ...NO_FILTERS, drink: 'Vermut' });
    const { el } = await start();
    await new Promise((r) => setTimeout(r)); // The form sets it again on seeing the new options.
    const drink = [...el.querySelectorAll('.field')]
      .find((f) => f.textContent!.includes('Bebida'))!
      .querySelector('select')!;
    expect(drink.value).toBe('Vermut');
    expect(el.querySelectorAll('app-venue-card').length).toBe(1);
  });

  it('filters by time without a day too, also into the following day', async () => {
    const { fixture, el } = await start({
      ...DATA,
      venues: [
        { ...DATA.venues[0], schedule: week([{ open: '12:00', close: '14:00' }]) },
        { ...DATA.venues[1], schedule: week([{ open: '20:00', close: '22:00' }]) },
      ],
    });
    const names = () => [...el.querySelectorAll('app-venue-card h2')].map((h) => h.textContent);
    const shown = () => [...el.querySelectorAll('app-time-field span')].map((s) => s.textContent);
    const [from, to] = el.querySelectorAll<HTMLInputElement>('input[type=time]');
    const type = async (input: HTMLInputElement, time: string) => {
      input.value = time;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    expect(from.disabled).toBe(false);
    expect(to.disabled).toBe(false);

    await type(from, '21:00');
    expect(shown()).toEqual(['00:00']);
    expect(names()).toEqual(['CÚPULA']);

    await type(to, '13:00');
    expect(names()).toEqual(['ORIGEN', 'CÚPULA']);

    await type(to, '11:00');
    expect(names()).toEqual(['CÚPULA']);

    await type(from, '');
    expect(shown()).toEqual(['00:00']);
    expect(names()).toEqual([]);
  });

  /** «Abierto ahora», among the «Mostrar solo» checkboxes. */
  const openNowBox = (el: HTMLElement) =>
    [...el.querySelectorAll('.only label')]
      .find((l) => l.textContent!.includes('Abierto ahora'))!
      .querySelector('input')!;

  it('«Abierto ahora» fills in the day and the next hour, and «Limpiar» empties them', async () => {
    const { el, press } = await start();
    const day = [...el.querySelectorAll('.field')]
      .find((f) => f.textContent!.includes('Día'))!
      .querySelector('select')!;
    const [from, to] = el.querySelectorAll<HTMLInputElement>('input[type=time]');
    const openNow = openNowBox(el);
    expect(openNow.checked).toBe(false);

    await press('.only label', 'Abierto ahora');
    const now = new Date();
    expect(openNow.checked).toBe(true);
    expect(day.value).not.toBe('');
    expect(from.value).toBe(now.toTimeString().slice(0, 5));
    expect(to.value).toBe(new Date(now.getTime() + 3_600_000).toTimeString().slice(0, 5));

    await press('.actions button', 'Limpiar');
    expect(openNow.checked).toBe(false);
    expect(day.value).toBe('');
    expect(from.value).toBe('');
    expect(to.value).toBe('');
  });

  it('«Abierto ahora» unchecked goes back to any day and time', async () => {
    const { el, press } = await start();
    const day = [...el.querySelectorAll('.field')]
      .find((f) => f.textContent!.includes('Día'))!
      .querySelector('select')!;
    const [from, to] = el.querySelectorAll<HTMLInputElement>('input[type=time]');

    await press('.only label', 'Abierto ahora');
    await press('.only label', 'Abierto ahora');
    expect(openNowBox(el).checked).toBe(false);
    expect([day.value, from.value, to.value]).toEqual(['', '', '']);
  });

  describe('with «Abierto ahora» on', () => {
    const now = signal(new Date(2026, 10, 1, 23, 30)); // A Sunday.

    async function startAt(date: Date, saved?: Partial<Filters>) {
      now.set(date);
      TestBed.overrideProvider(Clock, { useValue: { now } });
      if (saved) TestBed.inject(Store).saveSetting('filters', { ...NO_FILTERS, ...saved });
      const { fixture, el, press } = await start();
      const day = [...el.querySelectorAll('.field')]
        .find((f) => f.textContent!.includes('Día'))!
        .querySelector('select')!;
      const [from, to] = el.querySelectorAll<HTMLInputElement>('input[type=time]');
      return {
        press,
        tick: async (date: Date) => {
          now.set(date);
          await fixture.whenStable();
        },
        type: async (input: HTMLInputElement, time: string) => {
          input.value = time;
          input.dispatchEvent(new Event('input'));
          await fixture.whenStable();
        },
        to,
        checked: () => openNowBox(el).checked,
        shown: () => [day.value, from.value, to.value],
      };
    }

    it('starts on the current time when the app opens', async () => {
      const saved = { openNow: true, day: 'friday', from: '13:00', to: '14:00' } as const;
      const { checked, shown } = await startAt(new Date(2026, 10, 1, 23, 30), saved);
      expect(checked()).toBe(true);
      expect(shown()).toEqual(['sunday', '23:30', '00:30']);
    });

    it('goes on with the clock, also past midnight', async () => {
      const { press, tick, shown } = await startAt(new Date(2026, 10, 1, 22, 59));
      await press('.only label', 'Abierto ahora');

      await tick(new Date(2026, 10, 1, 23, 0));
      expect(shown()).toEqual(['sunday', '23:00', '00:00']);
      await tick(new Date(2026, 10, 1, 23, 59));
      expect(shown()).toEqual(['sunday', '23:59', '00:59']);
      await tick(new Date(2026, 10, 2, 0, 0));
      expect(shown()).toEqual(['monday', '00:00', '01:00']);
    });

    it('stays as it is once the time is changed by hand', async () => {
      const { press, tick, type, to, checked, shown } = await startAt(new Date(2026, 10, 1, 20, 0));
      await press('.only label', 'Abierto ahora');
      await tick(new Date(2026, 10, 1, 20, 1));

      await type(to, '22:00');
      expect(checked()).toBe(false);
      await tick(new Date(2026, 10, 1, 20, 2));
      expect(shown()).toEqual(['sunday', '20:01', '22:00']);
    });
  });

  describe('with only one end of the time range', () => {
    const now = signal(new Date(2026, 10, 1, 18, 30)); // A Sunday.
    const open = (number: number, slot: TimeSlot) => ({
      ...DATA.venues[number],
      schedule: { ...DATA.venues[number].schedule, sunday: [slot] },
    });

    async function startOnSunday() {
      now.set(new Date(2026, 10, 1, 18, 30));
      TestBed.overrideProvider(Clock, { useValue: { now } });
      const venues = [
        open(0, { open: '12:00', close: '14:00' }),
        open(1, { open: '20:00', close: '22:00' }),
      ];
      const { fixture, el } = await start({ ...DATA, venues });
      const [from, to] = el.querySelectorAll<HTMLInputElement>('input[type=time]');
      const day = [...el.querySelectorAll('.field')]
        .find((f) => f.textContent!.includes('Día'))!
        .querySelector('select')!;
      day.value = 'sunday';
      day.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      const type = async (input: HTMLInputElement, time: string) => {
        input.value = time;
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      };
      const tick = async (hour: number, minute: number) => {
        now.set(new Date(2026, 10, 1, hour, minute));
        await fixture.whenStable();
      };
      return {
        fixture,
        from,
        to,
        type,
        tick,
        cards: () => el.querySelectorAll('app-venue-card').length,
        shown: () => [...el.querySelectorAll('app-time-field span')].map((s) => s.textContent),
      };
    }

    it('without "to", it applies up to midnight and says so', async () => {
      const { from, to, type, cards, shown } = await startOnSunday();
      expect(shown()).toEqual([]);

      await type(from, '13:00');
      expect(shown()).toEqual(['00:00']);
      expect(cards()).toBe(2);

      await type(from, '15:00');
      expect(cards()).toBe(1);

      await type(to, '16:00');
      expect(shown()).toEqual([]);
      expect(cards()).toBe(0);
    });

    it('without "from", it applies from now on, following the clock', async () => {
      const { to, type, tick, cards, shown } = await startOnSunday();

      await type(to, '21:00');
      expect(shown()).toEqual(['18:30']);
      expect(cards()).toBe(1);

      await tick(18, 31);
      expect(shown()).toEqual(['18:31']);

      await tick(21, 30);
      expect(shown()).toEqual(['00:00']);
      expect(cards()).toBe(2);
    });

    it('the list only gets filtered again if the time that applies changes', async () => {
      const { fixture, from, to, type, tick } = await startOnSunday();
      const filtered = () => fixture.componentInstance['filtered']();

      await type(from, '13:00');
      const list = filtered();
      await tick(18, 31);
      expect(filtered()).toBe(list);

      await type(from, '');
      await type(to, '21:00');
      const untilNine = filtered();
      await tick(18, 32);
      expect(filtered()).not.toBe(untilNine);
    });
  });

  it('the filters are still there on coming back from a venue', async () => {
    const { fixture, el, press } = await start();
    await press('.menu-button');
    await press('.menu button', 'Fotos');
    const search = el.querySelector<HTMLInputElement>('.field.text input')!;
    search.value = 'cúpula';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    await press('app-gallery li button', 'CÚPULA');
    expect(el.querySelector('app-filters')).toBeNull();
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('.field.text input')!.value).toBe('cúpula');
    expect(el.querySelectorAll('app-gallery li').length).toBe(1);
  });

  describe('following the scroll', () => {
    const venues = [1, 2, 3, 4, 5, 6, 7].map((number) => ({
      ...venue(number, `LOCAL ${number}`, []),
      location: { lat: 39.98 + number / 1000, lng: 0 },
    }));

    async function startFollowing() {
      const report = stubIntersections();
      const started = await start({ ...DATA, venues });
      const { fixture, el, press } = started;
      /**
       * The venue on top: those before it in the list have gone under the header. Others can be out
       * of sight, and others whole on the screen.
       */
      const scrollTo = async (
        number: number,
        { lost = [], whole = [] }: { lost?: number[]; whole?: number[] } = {},
      ) => {
        const marks = [...el.querySelectorAll('.venue-mark')];
        report(
          (target) =>
            marks.includes(target)
              ? marks.indexOf(target) < number - 1
              : lost.some((n) => target.id === `venue-${n}`),
          (card) => whole.some((n) => card.id === `venue-${n}`),
        );
        await fixture.whenStable();
      };
      const switchTo = async (view: string) => {
        await press('.menu-button');
        await press('.menu button', view);
        await new Promise((r) => setTimeout(r));
        await fixture.whenStable();
      };
      /** The browser goes back a page. */
      const browserBack = async () => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        await new Promise((r) => setTimeout(r));
        await fixture.whenStable();
      };
      /** Chooses a view in the menu with a venue open: going back is up to the browser. */
      const leaveVenueTo = async (view: string) => {
        vi.spyOn(history, 'back').mockImplementation(() => {});
        await press('.menu-button');
        await press('.menu button', view);
        await browserBack();
      };
      return {
        ...started,
        scrollTo,
        switchTo,
        browserBack,
        leaveVenueTo,
        position: TestBed.inject(ScrollPosition),
        locate: (number: number) => press(`#venue-${number} button[aria-label='Ver en el mapa']`),
        /** A scroll started by the app gets under way. */
        pageMoves: () => document.dispatchEvent(new Event('scroll')),
        /** Long enough for it to be over. */
        pageStops: async () => {
          await new Promise((r) => setTimeout(r, 250));
          await fixture.whenStable();
        },
        returnButton: () => el.querySelector('.return'),
      };
    }

    /** The element each scrollIntoView was called on. */
    const landedOn = (spy: { mock: { instances: unknown[] } }) =>
      spy.mock.instances.map((e) => (e as Element).id);

    afterEach(() => vi.restoreAllMocks());

    it('keeps the venue on switching view', async () => {
      const { el, scrollTo, switchTo, position } = await startFollowing();
      await scrollTo(4);
      expect(position.current()).toBe(4);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await switchTo('Fotos');
      expect(el.querySelector('app-gallery')).not.toBeNull();
      expect(landedOn(scrollIntoView)).toEqual(['venue-4']);
      expect(el.querySelector('#venue-4')!.tagName).toBe('LI');

      await switchTo('Detalles');
      expect(landedOn(scrollIntoView)).toEqual(['venue-4', 'venue-4']);
      expect(el.querySelector('#venue-4')!.tagName).toBe('APP-VENUE-CARD');
    });

    it('on the first venue, switching view goes to the very top', async () => {
      const { scrollTo, switchTo } = await startFollowing();
      await scrollTo(1);
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const top = vi.spyOn(Element.prototype, 'scrollTo');
      await switchTo('Fotos');
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(top).toHaveBeenCalledWith({ top: 0 });
    });

    it('the list makes up for the part of a pixel the scroll leaves a card off its place', async () => {
      const { el, scrollTo, switchTo } = await startFollowing();
      await scrollTo(4);
      await switchTo('Fotos');
      // With no header in the tests, its place is 1rem (16px) from the top.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 16.25,
      } as DOMRect);
      await switchTo('Detalles');
      expect(el.querySelector<HTMLElement>('.list')!.style.marginTop).toBe('-0.25px');
    });

    it('leaves the list alone if the card can’t get to its place', async () => {
      const { el, scrollTo, switchTo } = await startFollowing();
      await scrollTo(4);
      await switchTo('Fotos');
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 300,
      } as DOMRect);
      await switchTo('Detalles');
      expect(el.querySelector<HTMLElement>('.list')!.style.marginTop).toBe('');
    });

    it('from a venue opened in the gallery, «Detalles» lands on it', async () => {
      const { press, scrollTo, switchTo, leaveVenueTo, position } = await startFollowing();
      await switchTo('Fotos');
      await scrollTo(2);
      await press('app-gallery li button', 'LOCAL 5');
      expect(position.current()).toBe(2);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await leaveVenueTo('Detalles');
      expect(landedOn(scrollIntoView)).toEqual(['venue-5']);
    });

    it('from a venue opened in the list, «Fotos» lands on it', async () => {
      const { el, fixture, leaveVenueTo } = await startFollowing();
      fixture.componentInstance['openVenue'](5);
      await fixture.whenStable();

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await leaveVenueTo('Fotos');
      expect(landedOn(scrollIntoView)).toEqual(['venue-5']);
      expect(el.querySelector('#venue-5')!.tagName).toBe('LI');
    });

    it('from a venue opened in the gallery, «Fotos» lands on it too', async () => {
      const { press, scrollTo, switchTo, leaveVenueTo } = await startFollowing();
      await switchTo('Fotos');
      await scrollTo(2);
      await press('app-gallery li button', 'LOCAL 5');

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await leaveVenueTo('Fotos');
      expect(landedOn(scrollIntoView)).toEqual(['venue-5']);
    });

    it('from a venue opened in the gallery, going back leaves it where it was', async () => {
      const { press, scrollTo, switchTo, browserBack } = await startFollowing();
      await switchTo('Fotos');
      await scrollTo(2);
      await press('app-gallery li button', 'LOCAL 5');

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const top = vi.spyOn(Element.prototype, 'scrollTo');
      await browserBack();
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(top).toHaveBeenCalledWith({ top: 0 }); // What's saved: nothing scrolls in the tests.
    });

    it('«Volver al local» appears once the trip to the map stops and returns to it', async () => {
      const { el, scrollTo, locate, pageMoves, pageStops, press, returnButton, position } =
        await startFollowing();
      await scrollTo(6);
      await locate(6);
      await scrollTo(6, { whole: [6] });
      pageMoves();
      await scrollTo(1);
      expect(returnButton()).toBeNull();
      await pageStops();
      expect(returnButton()!.textContent).toContain('Volver al local 6');
      expect(returnButton()!.querySelector('use')!.getAttribute('href')).toBe('#icon-down');

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await press('.return');
      expect(landedOn(scrollIntoView)).toEqual(['venue-6']);
      expect(el.querySelector('#venue-6.highlighted')).not.toBeNull();
      expect(position.returnTo()).toBeNull();
    });

    it('offers it at once if the trip to the map is going to leave the venue out of sight', async () => {
      const { el, scrollTo, locate, pageMoves, pageStops, returnButton } = await startFollowing();
      await scrollTo(6);
      // The map above the screen, and the card 516 px further down once there: below the screen.
      const rect = (top: number, height: number) => ({ top, bottom: top + height }) as DOMRect;
      const at = (selector: string, box: DOMRect) =>
        vi.spyOn(el.querySelector(selector)!, 'getBoundingClientRect').mockReturnValue(box);
      at('.results .map', rect(-500, 357));
      at('#venue-6', rect(300, 300));
      vi.spyOn(Element.prototype, 'scrollTop', 'get').mockReturnValue(2000);
      vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(800);
      await locate(6);
      expect(returnButton()!.textContent).toContain('Volver al local 6');

      pageMoves();
      await scrollTo(1);
      await pageStops();
      expect(returnButton()!.textContent).toContain('Volver al local 6');
    });

    it('doesn’t offer going back if going to the map hasn’t moved the list', async () => {
      const { scrollTo, locate, pageStops, returnButton, position } = await startFollowing();
      await scrollTo(1);
      await locate(1);
      await scrollTo(1);
      await pageStops();
      expect(returnButton()).toBeNull();
      expect(position.returnTo()).toBe(1);
    });

    it('offers it when a marker takes the list away, not when the user does', async () => {
      const { fixture, scrollTo, locate, pageMoves, pageStops, returnButton } =
        await startFollowing();
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
      await scrollTo(1, { whole: [1] });
      await locate(1);
      await scrollTo(1, { whole: [1] });
      await pageStops();
      await scrollTo(2);
      await pageStops();
      expect(returnButton()).toBeNull();

      fixture.componentInstance['showInList'](7);
      pageMoves();
      await scrollTo(7);
      await pageStops();
      expect(returnButton()!.textContent).toContain('Volver al local 1');
      expect(returnButton()!.querySelector('use')!.getAttribute('href')).toBe('#icon-up');
    });

    it('forgets the venue after losing sight of three others', async () => {
      const { scrollTo, locate, pageMoves, pageStops, returnButton, position } =
        await startFollowing();
      await scrollTo(6);
      await locate(6);
      await scrollTo(6);
      pageMoves();
      await scrollTo(1);
      await pageStops();

      await scrollTo(1, { whole: [1, 2, 3] });
      await scrollTo(3, { lost: [1, 2] });
      expect(returnButton()).not.toBeNull();
      await scrollTo(4, { lost: [1, 2, 3] });
      expect(returnButton()).toBeNull();
      expect(position.returnTo()).toBeNull();
    });

    it('forgets the venue on bringing it back into sight', async () => {
      const { scrollTo, locate, pageMoves, pageStops, returnButton, position } =
        await startFollowing();
      await scrollTo(1, { whole: [1] });
      await locate(1);
      await scrollTo(1, { whole: [1] });
      pageMoves();
      await scrollTo(1);
      await pageStops();
      expect(returnButton()).not.toBeNull();

      await scrollTo(1, { whole: [1] });
      expect(position.returnTo()).toBeNull();
      expect(returnButton()).toBeNull();
    });

    it('«Volver al local» changes to the last venue the user went to the map from', async () => {
      const { scrollTo, locate, pageMoves, pageStops, returnButton } = await startFollowing();
      await scrollTo(6);
      await locate(6);
      await locate(2);
      await scrollTo(6);
      pageMoves();
      await pageStops();
      expect(returnButton()!.textContent).toContain('local 2');
    });

    it('«Volver al local» goes away on switching view', async () => {
      const { scrollTo, switchTo, locate, pageMoves, pageStops, returnButton } =
        await startFollowing();
      await scrollTo(6);
      await locate(6);
      await scrollTo(6);
      pageMoves();
      await pageStops();
      expect(returnButton()).not.toBeNull();

      await switchTo('Fotos');
      expect(returnButton()).toBeNull();
      await switchTo('Detalles');
      expect(returnButton()).toBeNull();
    });

    it('«Volver al local» goes away on opening a venue from its popup', async () => {
      const { el, press, scrollTo, locate, pageMoves, pageStops, returnButton, position } =
        await startFollowing();
      await scrollTo(6);
      await locate(6);
      await scrollTo(6);
      pageMoves();
      await pageStops();
      expect(returnButton()).not.toBeNull();

      await press(`.maplibregl-popup button[aria-label='Ver los detalles del local']`);
      expect(el.querySelector('.back')).not.toBeNull();
      expect(el.querySelectorAll('app-venue-card').length).toBe(1);
      expect(returnButton()).toBeNull();
      expect(position.returnTo()).toBeNull();
    });

    it('«Volver al local» waits while its venue is filtered out', async () => {
      const { fixture, el, scrollTo, locate, pageMoves, pageStops, press, returnButton } =
        await startFollowing();
      await scrollTo(6);
      await locate(6);
      await scrollTo(6);
      pageMoves();
      await pageStops();
      const search = el.querySelector<HTMLInputElement>('.field.text input')!;
      search.value = 'local 2';
      search.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(returnButton()).toBeNull();

      await press('.actions button', 'Limpiar');
      expect(returnButton()).not.toBeNull();
    });
  });

  it('keeps the sort order chosen', async () => {
    const first = await start();
    const select = first.el.querySelector<HTMLSelectElement>('.sort select')!;
    expect(select.value).toBe('number');
    select.value = 'closing';
    select.dispatchEvent(new Event('change'));
    await first.fixture.whenStable();
    expect(TestBed.inject(Store).setting('sort')).toBe('closing');
    first.fixture.destroy();

    const { el } = await start();
    expect(el.querySelector<HTMLSelectElement>('.sort select')!.value).toBe('closing');
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
