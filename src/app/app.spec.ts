import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { stubIntersections } from '../testing/intersections';
import { Map as FakeMap } from '../testing/maplibre';
import { testTapa, testVenue, week } from '../testing/venue';
import { App } from './app';
import { Clock } from './clock';
import { VenueMap } from './map/map';
import { ScrollPosition } from './scroll-position';
import { Store } from './store';
import { Filters, NO_FILTERS, RouteData, TimeSlot, Venue } from './venues';

function venue(number: number, name: string, drinks: [string, string][]): Venue {
  return testVenue({
    number,
    name,
    phone: '600000000',
    instagram: '@venue',
    location: { lat: 39.98 + number / 1000, lng: 0 },
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

/** A venue's map button, in either view. */
const MAP_BUTTON = (number: number) => `#venue-${number} button[aria-label='Ver en el mapa']`;

/** The venue of the venue view, by its marker on the map: number and name. */
const activeMarker = (el: HTMLElement) =>
  el.querySelector('.venue-marker.active')?.getAttribute('title');

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

  it('in the «Fotos» view opens a venue with its map button and returns to the gallery', async () => {
    const { el, press } = await start();
    await press('.menu-button');
    await press('.menu button', 'Fotos');
    expect(el.querySelector('.menu')).toBeNull();
    expect(el.querySelector('app-venue-card')).toBeNull();
    expect(el.querySelectorAll('app-gallery li').length).toBe(2);

    // The card itself doesn't open anything.
    await press('#venue-2 h2');
    expect(el.querySelector('app-venue-card')).toBeNull();

    const focus = vi.spyOn(VenueMap.prototype, 'focus');
    const entries = history.length;
    await press(MAP_BUTTON(2));
    expect(el.querySelector('.filters')).toBeNull();
    // All of the gallery's venues, side by side, and on the map; that one, the venue.
    const names = [...el.querySelectorAll('.cards app-venue-card h2')].map((h) => h.textContent);
    expect(names).toEqual(['ORIGEN', 'CÚPULA']);
    expect(el.querySelectorAll('.venue-marker').length).toBe(2);
    expect(activeMarker(el)).toBe('2. CÚPULA');
    // The browser's back button doesn't return from it: only «Volver».
    expect(history.length).toBe(entries);
    expect(el.querySelector('.back')).not.toBeNull();
    // The map, before the card: on phones it goes on top.
    expect(el.querySelector('.detail > :first-child')!.tagName).toBe('APP-MAP');
    expect(focus).toHaveBeenCalledWith(2);
    focus.mockRestore();

    await press('.back');
    expect(el.querySelector('app-venue-card')).toBeNull();
    expect(el.querySelectorAll('app-gallery li').length).toBe(2);
    expect(TestBed.inject(Store).setting('view')).toBe('photos');
  });

  it('in «Detalles» there’s no map: the map button opens the venue', async () => {
    const { el, press } = await start();
    expect(el.querySelector('app-map')).toBeNull();
    await press(MAP_BUTTON(1));
    expect(el.querySelector('.list')).toBeNull();
    expect(el.querySelectorAll('.cards app-venue-card').length).toBe(2);
    expect(el.querySelector('app-map')).not.toBeNull();
    expect(activeMarker(el)).toBe('1. ORIGEN');
  });

  it('in the venue view, a card’s map button is gone while its venue is in the middle', async () => {
    const { el, press, fixture } = await start();
    await press(MAP_BUTTON(1));
    const map = FakeMap.of(el.querySelector('app-map')!);
    const { lat, lng } = DATA.venues[1].location!;
    vi.spyOn(map, 'getCenter').mockReturnValue({ lat, lng });
    map.endGesture();
    await fixture.whenStable();
    const idle = (number: number) =>
      el.querySelector(MAP_BUTTON(number))!.classList.contains('idle');
    expect(idle(2)).toBe(true);
    expect(idle(1)).toBe(false);
  });

  it('without a starting point, only the card in the middle has its map button, once moved', async () => {
    const { el, press, fixture } = await start();
    await press(MAP_BUTTON(1));
    const idle = (number: number) =>
      el.querySelector(MAP_BUTTON(number))!.classList.contains('idle');
    // The map goes to the venue; once the other one's card is in the middle, it will go to it.
    expect(idle(1)).toBe(true);
    expect(idle(2)).toBe(true);

    // Moved off it by hand.
    const map = FakeMap.of(el.querySelector('app-map')!);
    vi.spyOn(map, 'getCenter').mockReturnValue({ lat: 39, lng: 0 });
    map.endGesture();
    await fixture.whenStable();
    expect(idle(1)).toBe(false);
    expect(idle(2)).toBe(true);
  });

  it('in the venue view, a card’s map button brings its venue to the middle and the map to it', async () => {
    const { el, press } = await start();
    await press(MAP_BUTTON(1));
    const focus = vi.spyOn(VenueMap.prototype, 'focus');
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
    await press(MAP_BUTTON(2));
    expect(activeMarker(el)).toBe('2. CÚPULA');
    expect(scrollTo.mock.instances.at(-1)).toBe(el.querySelector('.cards'));
    expect(focus).toHaveBeenCalledWith(2);
    focus.mockRestore();
    scrollTo.mockRestore();
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

    await press(MAP_BUTTON(2));
    expect(el.querySelector('app-filters')).toBeNull();
    await press('.back');
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
      /** «Volver», from the venue. */
      const goBack = async () => {
        await press('.back');
        await new Promise((r) => setTimeout(r));
        await fixture.whenStable();
      };
      /** In the venue view, that venue's card gets to the middle of the cards side by side. */
      const inMiddle = async (number: number) => {
        report((target) => !!target.closest('.cards') && target.id !== `venue-${number}`);
        await fixture.whenStable();
      };
      return {
        inMiddle,
        ...started,
        scrollTo,
        switchTo,
        goBack,
        position: TestBed.inject(ScrollPosition),
        open: (number: number) => press(MAP_BUTTON(number)),
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

    it('from a venue opened in the gallery, «Detalles» stays on it, for going back', async () => {
      const { el, open, scrollTo, switchTo, goBack, position } = await startFollowing();
      await switchTo('Fotos');
      await scrollTo(2);
      await open(5);
      expect(position.current()).toBe(2);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await switchTo('Detalles');
      expect(activeMarker(el)).toBe('5. LOCAL 5');
      expect(el.querySelector('app-gallery, .list')).toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(TestBed.inject(Store).setting('view')).toBe('details');

      // Going back, in the new view, it lands on it.
      await goBack();
      expect(landedOn(scrollIntoView)).toEqual(['venue-5']);
      expect(el.querySelector('#venue-5')!.tagName).toBe('APP-VENUE-CARD');
    });

    it('from a venue opened in the list, «Fotos» stays on it, for going back', async () => {
      const { el, open, switchTo, goBack } = await startFollowing();
      await open(5);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await switchTo('Fotos');
      expect(activeMarker(el)).toBe('5. LOCAL 5');
      expect(scrollIntoView).not.toHaveBeenCalled();

      await goBack();
      expect(landedOn(scrollIntoView)).toEqual(['venue-5']);
      expect(el.querySelector('#venue-5')!.tagName).toBe('LI');
    });

    it('from a venue opened in the gallery, «Fotos» changes nothing', async () => {
      const { el, open, scrollTo, switchTo, goBack } = await startFollowing();
      await switchTo('Fotos');
      await scrollTo(2);
      await open(5);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const top = vi.spyOn(Element.prototype, 'scrollTo');
      await switchTo('Fotos');
      expect(el.querySelector('.detail app-venue-card')).not.toBeNull();

      // Back where it was left, as if nothing had been chosen.
      await goBack();
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(top).toHaveBeenCalledWith({ top: 0 }); // What's saved: nothing scrolls in the tests.
    });

    it('in the venue view, the venue is the card in the middle, and «Volver» lands on it', async () => {
      const { el, open, inMiddle, goBack } = await startFollowing();
      await open(2);
      expect(activeMarker(el)).toBe('2. LOCAL 2');

      await inMiddle(3);
      expect(activeMarker(el)).toBe('3. LOCAL 3');
      await inMiddle(4);
      expect(activeMarker(el)).toBe('4. LOCAL 4');

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      await goBack();
      expect(landedOn(scrollIntoView)).toEqual(['venue-4']);
    });

    it('a venue touched on the map brings its card to the middle, not those on the way', async () => {
      const { el, fixture, open, inMiddle } = await startFollowing();
      await open(2);
      const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
      el.querySelector<HTMLElement>('.venue-marker[title^="5."]')!.click();
      await fixture.whenStable();
      expect(activeMarker(el)).toBe('5. LOCAL 5');
      expect(scrollTo.mock.instances.at(-1)).toBe(el.querySelector('.cards'));

      // On its way, those it passes by stay as they are.
      await inMiddle(3);
      expect(activeMarker(el)).toBe('5. LOCAL 5');
      await inMiddle(4);
      expect(activeMarker(el)).toBe('5. LOCAL 5');
      // Once there, scrolling chooses again.
      await inMiddle(5);
      await inMiddle(6);
      expect(activeMarker(el)).toBe('6. LOCAL 6');
    });

    it('touching the cards on their way to one leaves them wherever they’re taken', async () => {
      const { el, fixture, open, inMiddle } = await startFollowing();
      await open(2);
      el.querySelector<HTMLElement>('.venue-marker[title^="6."]')!.click();
      await fixture.whenStable();
      el.querySelector('.cards')!.dispatchEvent(new Event('pointerdown'));
      await inMiddle(4);
      expect(activeMarker(el)).toBe('4. LOCAL 4');
    });

    it('from a venue opened in the gallery, going back leaves it where it was', async () => {
      const { open, scrollTo, switchTo, goBack } = await startFollowing();
      await switchTo('Fotos');
      await scrollTo(2);
      await open(5);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const top = vi.spyOn(Element.prototype, 'scrollTo');
      await goBack();
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(top).toHaveBeenCalledWith({ top: 0 }); // What's saved: nothing scrolls in the tests.
    });

    it('from a venue opened in the list, going back leaves it where it was', async () => {
      const { open, scrollTo, goBack } = await startFollowing();
      await scrollTo(2);
      await open(5);

      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const top = vi.spyOn(Element.prototype, 'scrollTo');
      await goBack();
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(top).toHaveBeenCalledWith({ top: 0 }); // What's saved: nothing scrolls in the tests.
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

  it('the schedule stays open from the list to the venue and back', async () => {
    const { fixture, el, press } = await start();
    el.querySelector<HTMLElement>('#venue-1 summary')!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLDetailsElement>('#venue-1 details')!.open).toBe(true);

    await press(MAP_BUTTON(1));
    const opened = el.querySelector<HTMLDetailsElement>('.detail details')!;
    expect(opened.open).toBe(true);
    expect(opened.querySelectorAll('dt').length).toBe(7);
    expect(opened.querySelector('summary.open')).not.toBeNull();

    await press('.back');
    expect(el.querySelector<HTMLDetailsElement>('#venue-1 details')!.open).toBe(true);
    expect(el.querySelector<HTMLDetailsElement>('#venue-2 details')!.open).toBe(false);
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
