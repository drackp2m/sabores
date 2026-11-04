import { openVenue, switchView } from './view-switch';

/** The transition names on the page, by name. */
function names(): Record<string, string> {
  const named: Record<string, string> = {};
  for (const element of document.querySelectorAll<HTMLElement>('*')) {
    const name = element.style.getPropertyValue('view-transition-name');
    if (name) named[name] = element.id || element.className || element.tagName.toLowerCase();
  }
  return named;
}

const card = (number: number) => `
  <app-venue-card id="venue-${number}">
    <article id="card-${number}">
      <app-venue-header></app-venue-header><img loading="lazy" /><app-favorite></app-favorite>
    </article>
  </app-venue-card>`;

const LIST = `
  <header class="header"></header>
  <button class="scroll-top" id="scroll-top"></button>
  <main><app-filters id="filters"></app-filters><section class="list">${card(3)}${card(4)}</section></main>
  <footer class="footer" id="footer"></footer>`;

const VENUE = `
  <header class="header"></header>
  <main class="detail"><div class="map" id="map"></div>${card(3)}</main>
  <button class="back" id="back"></button>
  <button class="scroll-top leaving" id="leaving"></button>
  <footer class="footer" id="footer"></footer>`;

describe('view transitions', () => {
  let captured: {
    before: Record<string, string>;
    after?: Record<string, string>;
    returned?: unknown;
  };
  let finish: () => void;
  const scroller = document.createElement('div');

  beforeEach(() => {
    document.body.innerHTML = LIST;
    scroller.scrollTop = 500;
    // A phone, with motion: everything in sight.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('reduce') }));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
    } as DOMRect);
    const finished = new Promise<void>((resolve) => (finish = resolve));
    Object.assign(document, {
      startViewTransition: (update: () => unknown) => {
        captured = { before: names() };
        captured.returned = update();
        captured.after = names();
        return { ready: Promise.resolve(), finished };
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (document as Partial<Document>).startViewTransition;
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  const toVenue = () => (document.body.innerHTML = VENUE);

  it('on opening a venue, its card goes under the map, which arrives from above', async () => {
    let sameCard: boolean | undefined;
    const update = () => {
      sameCard = document.documentElement.classList.contains('same-card');
      toVenue();
    };
    expect(openVenue(3, scroller, update, false)).toBe(true);

    expect(captured.before).toMatchObject({
      'scroll-top': 'scroll-top',
      card: 'card-3',
      'card-heading': 'app-venue-header',
      'card-favorite': 'app-favorite',
      'out-up-1': 'filters',
      'out-down-1': 'card-4',
      'out-down-2': 'footer',
    });
    // «Subir», on its way out, isn't named: once gone, it would stop the transition.
    expect(captured.after).toEqual({
      header: 'header',
      back: 'back',
      card: 'card-3',
      'card-heading': 'app-venue-header',
      'card-favorite': 'app-favorite',
      'in-up-1': 'map',
      'in-down-1': 'footer',
    });
    expect(scroller.scrollTop).toBe(0);
    // From the list it's the same card: it only moves.
    expect(sameCard).toBe(true);

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(names()).toEqual({});
    expect(document.documentElement.classList.contains('same-card')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--card-top')).toBe('');
  });

  it('paints the photos of what arrives in the new picture, without waiting for them', async () => {
    openVenue(3, scroller, toVenue, false);
    const photo = document.querySelector('#card-3 img') as HTMLImageElement;
    expect(photo.loading).toBe('eager');
    expect(photo.decoding).toBe('sync');
    // A promise would hold the new picture back, and Safari flashed white meanwhile.
    expect(captured.returned).toBeUndefined();

    // And so they stay, also once on the page again.
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(photo.decoding).toBe('sync');
  });

  it('from the gallery, what the card shows changes as on switching view', () => {
    let sameCard: boolean | undefined;
    openVenue(
      3,
      scroller,
      () => {
        sameCard = document.documentElement.classList.contains('same-card');
        toVenue();
      },
      true,
    );
    expect(sameCard).toBe(false);
  });

  it('there is none without a phone, with reduced motion or without the card', () => {
    const update = vi.fn();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(openVenue(3, scroller, update, false)).toBe(false);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(openVenue(3, scroller, update, false)).toBe(false);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('reduce') }));
    expect(openVenue(9, scroller, update, false)).toBe(false);
    expect(switchView(null, scroller, update)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
