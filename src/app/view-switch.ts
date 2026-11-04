import { isPhone, reducedMotion } from './media';

/** Fixed on the screen, the same in both views. */
const FIXED = {
  header: '.header',
  'return-to-venue': '.return',
  'scroll-top': '.scroll-top',
};

/**
 * The menu, which choosing a view closes: it leaves from the old picture, on its own. In the header's,
 * its shadow (which goes well beyond the header) could move it.
 */
const MENU = '.menu';

/**
 * What comes and goes, top to bottom: the filters and what's above the list, the map in «Detalles»,
 * the cards and the footer. Even if it's the same element in both views, it goes and comes back in
 * its new place, like the rest.
 */
const BLOCKS = [
  'app-filters',
  'main > .summary',
  'main > .sort',
  'main > app-origin',
  '.results > .map',
  '.list > app-venue-card > article',
  'app-gallery li',
  '.footer',
].join(', ');

/** As many as styles/_view-switch.scss has times for, on each side: more than fit on a phone. */
const AROUND = 12;

/** A venue's card in the view on the page: the list's article or the gallery's li. */
function cardOf(number: number): HTMLElement | null {
  const venue = document.getElementById(`venue-${number}`);
  return venue?.querySelector<HTMLElement>(':scope > article') ?? venue;
}

/** What's in sight above and below the card, from the closest one outwards. */
function around(card: HTMLElement): { above: HTMLElement[]; below: HTMLElement[] } {
  const blocks = [...document.querySelectorAll<HTMLElement>(BLOCKS)];
  const at = blocks.indexOf(card);
  const inSight = (block: HTMLElement) => {
    const { top, bottom } = block.getBoundingClientRect();
    return bottom > 0 && top < innerHeight;
  };
  const closest = (side: HTMLElement[]) => side.filter(inSight).slice(0, AROUND);
  return { above: closest(blocks.slice(0, at).reverse()), below: closest(blocks.slice(at + 1)) };
}

/**
 * From one list view to the other on a phone, as a view transition (styles/_view-switch.scss). The
 * venue's card stays where it is on the screen, and so do its outline (taking the new height), its
 * heading (the same in both) and its heart, in the bottom right corner; the rest of what it shows leaves to the right and the new one comes in from
 * there. What's around it moves away, and the new one comes closer. Update changes the view and
 * renders it, with the menu closed: it goes back up behind the header. False, with nothing done, if
 * it can't: no transitions in the browser, not a phone, reduced motion or no card to keep.
 */
export function switchView(number: number | null, scroller: Element, update: () => void): boolean {
  if (number === null || !('startViewTransition' in document) || !isPhone() || reducedMotion()) {
    return false;
  }
  const before = cardOf(number);
  if (!before) return false;

  const named: HTMLElement[] = [];
  const name = (element: HTMLElement | null, value: string) => {
    if (!element) return;
    element.style.setProperty('view-transition-name', value);
    named.push(element);
  };
  // What gets captured: the fixed ones, the card and what's in sight around it.
  const nameAll = (card: HTMLElement, side: 'out' | 'in') => {
    for (const [key, selector] of Object.entries(FIXED)) {
      name(document.querySelector<HTMLElement>(selector), key);
    }
    name(card, 'card');
    name(card.querySelector('app-venue-header'), 'card-heading');
    name(card.querySelector('app-favorite'), 'card-favorite');
    const { above, below } = around(card);
    above.forEach((block, i) => name(block, `${side}-up-${i + 1}`));
    below.forEach((block, i) => name(block, `${side}-down-${i + 1}`));
  };
  const clear = () => {
    for (const element of named.splice(0)) element.style.removeProperty('view-transition-name');
  };
  // How far the card's edges go: what's around it goes along with them.
  const root = document.documentElement.style;
  const shift = (edge: 'top' | 'bottom', by: number) =>
    root.setProperty(`--card-${edge}`, `${by}px`);

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
    const after = cardOf(number);
    if (!after) return;
    // As far as the page lets it: no higher than the top, no lower than the end. In whole pixels,
    // rounded here: left to the browser, which can drop the fraction always the same way, everything
    // went down a pixel on every switch.
    scroller.scrollTop = Math.round(scroller.scrollTop + after.getBoundingClientRect().top - top);
    const edges = after.getBoundingClientRect();
    shift('top', edges.top - top);
    shift('bottom', edges.bottom - bottom);
    nameAll(after, 'in');
  });
  // If it can't be shown (the tab in the background, say), the view just changes.
  transition.ready.catch(() => {});
  const end = () => {
    clear();
    root.removeProperty('--card-top');
    root.removeProperty('--card-bottom');
  };
  transition.finished.then(end, end);
  return true;
}
