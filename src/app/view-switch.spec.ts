import { closeVenue, openVenue, switchView } from './view-switch';

/** The transition names on the page, by name. */
function names(): Record<string, string> {
  const named: Record<string, string> = {};
  for (const element of document.querySelectorAll<HTMLElement>('*')) {
    const name = element.style.getPropertyValue('view-transition-name');
    if (name) named[name] = element.id || element.className || element.tagName.toLowerCase();
  }
  return named;
}

/** With its map button, or without it (idle) if its venue is in the middle of the map. */
const card = (number: number, idle = false) => `
  <app-venue-card id="venue-${number}">
    <article id="card-${number}">
      <app-venue-header><button class="map-button${idle ? ' idle' : ''}"></button></app-venue-header>
      <img loading="lazy" /><app-favorite></app-favorite>
    </article>
  </app-venue-card>`;

const LIST = `
  <app-header></app-header>
  <main><app-filters id="filters"></app-filters><section class="list">${card(3)}${card(4)}</section></main>
  <div class="floating" id="floating"><button class="scroll-top"></button></div>
  <footer class="footer" id="footer"></footer>`;

// The cards side by side, with 3 in the middle, and in the middle of the map.
const VENUE = `
  <app-header></app-header>
  <main class="detail">
    <div class="map" id="map"></div>
    <div class="cards">${card(2)}${card(3, true)}${card(4)}</div>
  </main>
  <div class="floating" id="floating">
    <button class="back entering"></button><button class="scroll-top leaving"></button>
  </div>
  <footer class="footer" id="footer"></footer>`;

/** Where an element is, that far from the top: the venue view's cards beside the middle one, off it. */
function at(element: Element, top: number): DOMRect {
  const beside = element.closest('.cards') && element.id !== 'card-3';
  const left = beside ? (element.id === 'card-2' ? -innerWidth : innerWidth) : 0;
  return { top, bottom: top + 200, left, right: left + 300 } as DOMRect;
}

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
    // A phone, with motion: everything in sight, but the venue view's cards beside the middle one.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('reduce') }));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return at(this, 100);
    });
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

  it('on switching view, the filters stay where they are: only the cards come and go', () => {
    // The same page: the same filters, and the other cards around.
    expect(switchView(4, scroller, () => {})).toBe(true);
    const around = {
      header: 'app-header',
      floating: 'floating',
      'stay-1': 'filters',
      card: 'card-4',
      'card-heading': 'app-venue-header',
      'card-favorite': 'app-favorite',
    };
    expect(captured.before).toEqual({ ...around, 'out-up-1': 'card-3', 'out-down-1': 'footer' });
    expect(captured.after).toEqual({ ...around, 'in-up-1': 'card-3', 'in-down-1': 'footer' });
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
      floating: 'floating',
      card: 'card-3',
      'card-heading': 'app-venue-header',
      'card-favorite': 'app-favorite',
      'out-up-1': 'filters',
      'out-down-1': 'card-4',
      'out-down-2': 'footer',
    });
    // The floating buttons' layer, not the buttons coming and going on it: «Subir», once gone, would
    // stop the transition.
    expect(captured.after).toEqual({
      header: 'app-header',
      floating: 'floating',
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

  it('on going back, the card stays in place and the list arrives around it, as the map leaves', () => {
    toVenue();
    // Under the map, 300px from the top; in the list, with the scroll it had, 150px lower.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return at(this, this.id !== 'card-3' ? 100 : this.closest('.detail') ? 300 : 450);
    });
    let sameCard: boolean | undefined;
    const update = () => {
      sameCard = document.documentElement.classList.contains('same-card');
      document.body.innerHTML = LIST;
    };
    expect(closeVenue(3, scroller, update, false)).toBe(true);

    expect(captured.before).toEqual({
      header: 'app-header',
      floating: 'floating',
      card: 'card-3',
      'card-heading': 'app-venue-header',
      'card-favorite': 'app-favorite',
      'out-up-1': 'map',
      'out-down-1': 'footer',
    });
    expect(captured.after).toMatchObject({
      header: 'app-header',
      floating: 'floating',
      card: 'card-3',
      'in-up-1': 'filters',
      'in-down-1': 'card-4',
      'in-down-2': 'footer',
    });
    // The list goes up those 150px, and the card is where it was.
    expect(scroller.scrollTop).toBe(650);
    // From the venue to the list it's the same card: it only moves.
    expect(sameCard).toBe(true);
  });

  it('the card arriving keeps its map button as it was in the other view, until it’s there', async () => {
    // In the list it has it; in the middle of the venue view, with its venue in the middle of the map,
    // it wouldn't.
    openVenue(3, scroller, toVenue, false);
    const button = document.querySelector('#card-3 .map-button')!;
    expect(button.classList).toContain('kept-shown');

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(button.classList).not.toContain('kept-shown');
  });

  it('and back to the list, without it as it was in the venue view', () => {
    toVenue();
    closeVenue(3, scroller, () => (document.body.innerHTML = LIST), false);
    expect(document.querySelector('#card-3 .map-button')!.classList).toContain('kept-hidden');
  });

  it('into the gallery, what the card shows changes', () => {
    toVenue();
    let sameCard: boolean | undefined;
    const update = () => {
      sameCard = document.documentElement.classList.contains('same-card');
      document.body.innerHTML = LIST;
    };
    closeVenue(3, scroller, update, true);
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
    expect(closeVenue(9, scroller, update, false)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
