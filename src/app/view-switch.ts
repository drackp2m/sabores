import { isPhone, reducedMotion } from './media';

/**
 * Fixed on the screen, the same in every view. Not one on its way out (animate.leave, in app.html):
 * the page takes it away once it's gone, and a new picture losing something named stops the
 * transition. «Subir», say, which the venue view doesn't have. It leaves with the rest of the page.
 */
const FIXED = {
  header: '.header',
  'scroll-top': '.scroll-top',
  back: '.back',
};

/**
 * The menu, which choosing a view closes: it leaves from the old picture, on its own. In the header's,
 * its shadow (which goes well beyond the header) could move it.
 */
const MENU = '.menu';

/**
 * The filters and what's above the list: the same elements in both list views. From one to the other
 * they stay where they are (as many as styles/_view-switch.scss has names for), instead of leaving and
 * coming back. With the card in its place on the screen, so are they: they're only in sight with the
 * first venue, which has nothing else above it in either view.
 */
const ABOVE_LIST = ['app-filters', 'main > .summary', 'main > .sort', 'main > app-origin'];

/**
 * What comes and goes, top to bottom: what's above the list (except from one list view to the other),
 * the cards (in the venue view, the map and the card) and the footer. Even if it's the same element in
 * both views, it goes and comes back in its new place, like the rest.
 */
const BLOCKS = [
  ...ABOVE_LIST,
  '.list > app-venue-card > article',
  'app-gallery li',
  '.detail > .map',
  '.detail > app-venue-card > article',
  '.footer',
].join(', ');

/** As many as styles/_view-switch.scss has times for, on each side: more than fit on a phone. */
const AROUND = 12;

/** With it on the root, what the card shows doesn't change: it only moves (see _view-switch.scss). */
const SAME_CARD = 'same-card';

/** A venue's card in the view on the page: the list's article or the gallery's li. */
function cardOf(number: number): HTMLElement | null {
  const venue = document.getElementById(`venue-${number}`);
  return venue?.querySelector<HTMLElement>(':scope > article') ?? venue;
}

/** The card in the venue view. */
function openCard(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.detail > app-venue-card > article');
}

/** What's in sight above and below the card, from the closest one outwards, but those staying. */
function around(
  card: HTMLElement,
  staying: readonly (HTMLElement | null)[],
): { above: HTMLElement[]; below: HTMLElement[] } {
  const all = document.querySelectorAll<HTMLElement>(BLOCKS);
  const blocks = [...all].filter((block) => !staying.includes(block));
  const at = blocks.indexOf(card);
  const inSight = (block: HTMLElement) => {
    const { top, bottom } = block.getBoundingClientRect();
    return bottom > 0 && top < innerHeight;
  };
  const closest = (side: HTMLElement[]) => side.filter(inSight).slice(0, AROUND);
  return { above: closest(blocks.slice(0, at).reverse()), below: closest(blocks.slice(at + 1)) };
}

/**
 * The photos of what arrives, in the new picture: new elements, which would otherwise come in empty
 * and flash once decoded. They're the ones already on the page (the same venues), so the browser has
 * them at hand: decoded as they're painted, and not lazily, which waits for the page to be painted.
 * Waiting for them instead (an update that returns a promise) flashed white in Safari before the
 * transition started. They stay that way: back to decoding on their own, Safari could leave them
 * empty for a moment once on the page again, as the transition ends.
 */
function photosAtOnce(elements: readonly HTMLElement[]): void {
  for (const element of elements) {
    for (const photo of element.querySelectorAll('img')) {
      photo.loading = 'eager';
      photo.decoding = 'sync';
    }
  }
}

/** Whether there can be one: the browser has them, on a phone and without reduced motion. */
function canTransition(): boolean {
  return 'startViewTransition' in document && isPhone() && !reducedMotion();
}

interface CardMove {
  /** The card on the page now. */
  before: HTMLElement;
  /** Changes the view and renders it, with the menu closed. */
  update: () => void;
  /** The card in the new view, once rendered. */
  after: () => HTMLElement | null;
  /** Leaves the new page where it has to be, from where the card was on the screen. */
  place: (after: HTMLElement, top: number) => void;
  /** What the card shows changes: it leaves to the right and the new one comes in from there. */
  slide: boolean;
  /** What's above the list stays where it is: from one list view to the other. */
  keepAboveList?: boolean;
}

/**
 * The venue's card goes from the old view to the new one as a view transition
 * (styles/_view-switch.scss): its outline takes the new height and its new place, along with its
 * heading (the same in every view) and its heart, in the bottom right corner. What's around it moves
 * away, and the new one comes closer. The menu goes back up behind the header.
 */
function moveCard({
  before,
  update,
  after: find,
  place,
  slide,
  keepAboveList = false,
}: CardMove): void {
  const named: HTMLElement[] = [];
  const name = (element: HTMLElement | null, value: string) => {
    if (!element) return;
    element.style.setProperty('view-transition-name', value);
    named.push(element);
  };
  // What gets captured: the fixed ones, what stays, the card and what's in sight around it.
  const nameAll = (card: HTMLElement, side: 'out' | 'in') => {
    for (const [key, selector] of Object.entries(FIXED)) {
      name(document.querySelector<HTMLElement>(`${selector}:not(.leaving)`), key);
    }
    const staying = keepAboveList
      ? ABOVE_LIST.map((selector) => document.querySelector<HTMLElement>(selector))
      : [];
    staying.forEach((element, i) => name(element, `stay-${i + 1}`));
    name(card, 'card');
    name(card.querySelector('app-venue-header'), 'card-heading');
    name(card.querySelector('app-favorite'), 'card-favorite');
    const { above, below } = around(card, staying);
    above.forEach((block, i) => name(block, `${side}-up-${i + 1}`));
    below.forEach((block, i) => name(block, `${side}-down-${i + 1}`));
  };
  const clear = () => {
    for (const element of named.splice(0)) element.style.removeProperty('view-transition-name');
  };
  // How far the card's edges go: what's around it goes along with them.
  const root = document.documentElement;
  const shift = (edge: 'top' | 'bottom', by: number) =>
    root.style.setProperty(`--card-${edge}`, `${by}px`);

  root.classList.toggle(SAME_CARD, !slide);
  nameAll(before, 'out');
  const menu = document.querySelector<HTMLElement>(MENU);
  name(menu, 'menu');
  const { top, bottom } = before.getBoundingClientRect();
  const transition = document.startViewTransition(() => {
    // Those on the page in both views (filters, footer...) come back under another name.
    clear();
    update();
    // Closed, the menu stays in the page until its own way out ends: hidden, it isn't in the new
    // picture either. Gone from it halfway through, the transition would stop.
    menu?.style.setProperty('display', 'none');
    const after = find();
    if (!after) return;
    place(after, top);
    const edges = after.getBoundingClientRect();
    shift('top', edges.top - top);
    shift('bottom', edges.bottom - bottom);
    nameAll(after, 'in');
    photosAtOnce(named);
  });
  // If it can't be shown (the tab in the background, say), the view just changes.
  transition.ready.catch(() => {});
  const end = () => {
    clear();
    root.classList.remove(SAME_CARD);
    root.style.removeProperty('--card-top');
    root.style.removeProperty('--card-bottom');
  };
  transition.finished.then(end, end);
}

/**
 * Scrolls the new page so that the card stays where it was on the screen, as far as the page lets it:
 * no higher than the top, no lower than the end. In whole pixels, rounded here: left to the browser,
 * which can drop the fraction always the same way, everything went down a pixel on every switch.
 */
function keepInPlace(scroller: Element): CardMove['place'] {
  return (after, top) => {
    scroller.scrollTop = Math.round(scroller.scrollTop + after.getBoundingClientRect().top - top);
  };
}

/**
 * From one list view to the other on a phone: the venue's card stays where it is on the screen, and
 * what it shows changes. What's above the list stays too. False, with nothing done, if it can't: no
 * transitions in the browser, not a phone, reduced motion or no card to keep.
 */
export function switchView(number: number | null, scroller: Element, update: () => void): boolean {
  const before = number === null ? null : cardOf(number);
  if (!before || !canTransition()) return false;
  moveCard({
    before,
    update,
    after: () => cardOf(number!),
    place: keepInPlace(scroller),
    slide: true,
    keepAboveList: true,
  });
  return true;
}

/**
 * From a list view to the venue's, on a phone: the card goes from where it is to its place, at the top
 * of the page under the map, which comes down from above. From the gallery, what the card shows
 * changes as on switching view; from the list it's the same card, it only moves. False, with nothing
 * done, if it can't (see switchView).
 */
export function openVenue(
  number: number,
  scroller: Element,
  update: () => void,
  fromGallery: boolean,
): boolean {
  const before = cardOf(number);
  if (!before || !canTransition()) return false;
  moveCard({
    before,
    update,
    after: openCard,
    place: () => (scroller.scrollTop = 0),
    slide: fromGallery,
  });
  return true;
}

/**
 * From the venue's view back to a list view, on a phone: the card stays where it is on the screen, as
 * on switching view, and the list arrives around it while the map goes back up. Into the gallery, what
 * the card shows changes. False, with nothing done, if it can't (see switchView).
 */
export function closeVenue(
  number: number,
  scroller: Element,
  update: () => void,
  toGallery: boolean,
): boolean {
  const before = openCard();
  if (!before || !canTransition()) return false;
  moveCard({
    before,
    update,
    after: () => cardOf(number),
    place: keepInPlace(scroller),
    slide: toGallery,
  });
  return true;
}
