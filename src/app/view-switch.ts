import { isTouch, oneColumn, reducedMotion } from './media';

/**
 * Fixed on the screen, the same element in every view. The floating buttons go on a layer of their
 * own, which stays, and not each one: those coming and going (animate.leave, in app.html) do so as
 * the transition goes on, and a new picture losing something named stops it. On the layer, live,
 * they're seen coming and going above the rest; otherwise, with the page underneath it all.
 */
const FIXED = {
  header: 'app-header',
  floating: '.floating',
};

/**
 * With a mouse (on desktop, or in a narrow window like Safari's responsive mode on a Mac) the document
 * scrolls, with the header sticky at its top (styles/_base.scss). In the new picture of a page the update leaves
 * scrolled, as on going back to the list, Safari left it out: its place there, but empty. Not on
 * opening a venue, with the new page at the top: sticky, it's where it would be anyway. Until the
 * transition ends, it doesn't stick: it's moved by hand to where it would, the top of the screen.
 * On touch screens it's fixed, out of what scrolls (app.scss).
 */
function holdHeader(): HTMLElement | null {
  const header = isTouch() ? null : document.querySelector<HTMLElement>(FIXED.header);
  if (!header) return null;
  header.style.setProperty('position', 'relative');
  header.style.setProperty('top', '0px');
  const below = -header.getBoundingClientRect().top;
  header.style.setProperty('top', `${Math.max(0, below)}px`);
  return header;
}

function releaseHeader(header: HTMLElement | null): void {
  header?.style.removeProperty('position');
  header?.style.removeProperty('top');
}

/**
 * The floating buttons arriving with the new view (animate.enter, in app.html). Their way in starts as
 * soon as they're on the page, inside the update, before the new picture is captured and painted,
 * which can take a while: on the screen, «Volver» came in already halfway, and not from beyond its
 * edge. They wait out of sight until the transition starts, and from then on, as long as what
 * arrives in it waits (styles/_view-switch.scss: $duration - $arriving, 700ms × 0.35).
 */
const ARRIVING = '.floating > .entering';
const ARRIVE_AFTER = 245;

/** The arrivals of the floating buttons, held out of sight until play. */
function holdArrivals(): Animation[] {
  const held = [...document.querySelectorAll<HTMLElement>(ARRIVING)].flatMap((button) =>
    button.getAnimations(),
  );
  for (const animation of held) {
    animation.effect?.updateTiming({ delay: ARRIVE_AFTER, fill: 'backwards' });
    animation.pause();
  }
  return held;
}

/**
 * The menu, which choosing a view closes: it leaves from the old picture, on its own. In the header's,
 * its shadow (which goes well beyond the header) could move it.
 */
const MENU = '.menu';

/**
 * The filters and what's above the list: the same elements in both list views. From one to the other
 * they stay where they are, instead of leaving and coming back. With the card in its place on the screen, so are they: they're only in sight with the
 * first venue, which has nothing else above it in either view.
 */
const ABOVE_LIST = ['app-filters', 'main > .summary', 'main > .sort', 'main > app-origin'];

/**
 * On desktop, the map beside the list or the gallery: the same element in both, it stays too. Fixed
 * while scrolling, it's where it was, unless the end of the list pushes it up: then it goes along.
 */
const BESIDE_LIST = '.results > .map';

/** What both list views share (as many as styles/_view-switch.scss has names for). */
const SHARED = [...ABOVE_LIST, BESIDE_LIST];

/**
 * What comes and goes, top to bottom: what's above the list (except from one list view to the other),
 * the cards (in the venue view, the map and the cards side by side) and the footer. Even if it's the
 * same element in both views, it goes and comes back in its new place, like the rest.
 */
const BLOCKS = [
  ...ABOVE_LIST,
  '.list > app-venue-card > article',
  'app-gallery li',
  '.detail > .map',
  '.cards > app-venue-card > article',
  '.footer',
].join(', ');

/** As many as styles/_view-switch.scss has times for, on each side: more than fit on a phone. */
const AROUND = 12;

/** With it on the root, what the card shows doesn't change: it only moves (see _view-switch.scss). */
const SAME_CARD = 'same-card';

/**
 * On the new card's map button while it arrives: as it was in the view it comes from, so that the
 * card looks the same in both pictures (in the venue view the one in the middle may have none, see
 * VenueHeader). From the moment the transition starts, it comes or goes along with all of it
 * (SWITCHING), until it ends.
 */
const KEPT = { shown: 'kept-shown', hidden: 'kept-hidden' };
const SWITCHING = 'switching';

function mapButton(card: HTMLElement | null): HTMLElement | null | undefined {
  return card?.querySelector<HTMLElement>('.map-button');
}

/**
 * A venue's card in the view on the page: the article of the list's or the venue view's (among the
 * cards side by side), or the gallery's li.
 */
function cardOf(number: number): HTMLElement | null {
  const venue = document.getElementById(`venue-${number}`);
  return venue?.querySelector<HTMLElement>(':scope > article') ?? venue;
}

/** What's in sight above and below the card, from the closest one outwards, but those staying. */
function around(
  card: HTMLElement,
  staying: readonly (HTMLElement | null)[],
): { above: HTMLElement[]; below: HTMLElement[] } {
  const all = document.querySelectorAll<HTMLElement>(BLOCKS);
  const blocks = [...all].filter((block) => !staying.includes(block));
  const at = blocks.indexOf(card);
  // On the screen, and with its middle on it: not the venue view's cards peeking on the sides.
  const inSight = (block: HTMLElement) => {
    const { top, bottom, left, right } = block.getBoundingClientRect();
    const middle = (left + right) / 2;
    return bottom > 0 && top < innerHeight && middle >= 0 && middle <= innerWidth;
  };
  const closest = (side: HTMLElement[]) => side.filter(inSight).slice(0, AROUND);
  return { above: closest(blocks.slice(0, at).reverse()), below: closest(blocks.slice(at + 1)) };
}

/**
 * In the venue view, the cards on each side of the one in the middle, peeking at the screen's edges
 * (around leaves them out): they come and go sideways.
 */
function beside(card: HTMLElement): { left: HTMLElement | null; right: HTMLElement | null } {
  const holder = card.parentElement;
  if (!holder?.parentElement?.matches('.cards')) return { left: null, right: null };
  const peeking = (next: Element | null) => {
    const neighbour = next?.querySelector<HTMLElement>(':scope > article');
    if (!neighbour) return null;
    const { top, bottom, left, right } = neighbour.getBoundingClientRect();
    return bottom > 0 && top < innerHeight && right > 0 && left < innerWidth ? neighbour : null;
  };
  return {
    left: peeking(holder.previousElementSibling),
    right: peeking(holder.nextElementSibling),
  };
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

/**
 * Leaves the card on the same fraction of a pixel it was on: cards can start between two pixels (in
 * the venue view, under a map 22.3rem tall, always) and the browser only scrolls whole ones. Each line
 * of text rounds to the screen's pixels its own way: on another fraction, the card would end up to
 * half a pixel away, with some of its lines a pixel off. What holds the cards moves by what's left
 * over, half a pixel at most: on going back or switching view the card is exactly where it was; on
 * opening a venue, whole pixels away, its lines on the same pixels as in the list.
 */
function sameFraction(after: HTMLElement, top: number): void {
  const holder = after.closest('[id^="venue-"]')?.parentElement;
  let rest = (top - after.getBoundingClientRect().top) % 1;
  if (Math.abs(rest) > 0.5) rest -= Math.sign(rest);
  if (!holder || !rest) return;
  const margin = parseFloat(getComputedStyle(holder).marginTop) || 0;
  holder.style.marginTop = `${margin + rest}px`;
}

/**
 * Whether there can be one: the browser has them, the list and the gallery in a single column (on a
 * phone or on desktop, see oneColumn), and without reduced motion. In several columns, the cards
 * beside the venue's would come and go upwards and downwards, as if they were above and below it.
 */
function canTransition(): boolean {
  return 'startViewTransition' in document && oneColumn() && !reducedMotion();
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
  /** What both list views share stays where it is (SHARED): from one to the other. */
  keepShared?: boolean;
}

/**
 * The venue's card goes from the old view to the new one as a view transition
 * (styles/_view-switch.scss): its outline takes the new height and its new place, along with its
 * heading (the same in every view) and its heart, in the bottom right corner. What's around it moves
 * away, and the new one comes closer: above and below, and in the venue view, on its sides. The menu
 * goes back up behind the header.
 */
function moveCard({
  before,
  update,
  after: find,
  place,
  slide,
  keepShared = false,
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
      name(document.querySelector<HTMLElement>(selector), key);
    }
    const staying = keepShared
      ? SHARED.map((selector) => document.querySelector<HTMLElement>(selector))
      : [];
    staying.forEach((element, i) => name(element, `stay-${i + 1}`));
    name(card, 'card');
    name(card.querySelector('app-venue-header'), 'card-heading');
    name(card.querySelector('app-favorite'), 'card-favorite');
    const { above, below } = around(card, staying);
    above.forEach((block, i) => name(block, `${side}-up-${i + 1}`));
    below.forEach((block, i) => name(block, `${side}-down-${i + 1}`));
    const { left, right } = beside(card);
    name(left, `${side}-left`);
    name(right, `${side}-right`);
  };
  const clear = () => {
    for (const element of named.splice(0)) element.style.removeProperty('view-transition-name');
  };
  // How far the card's edges go: what's around it goes along with them.
  const root = document.documentElement;
  const shift = (edge: 'top' | 'bottom', by: number) =>
    root.style.setProperty(`--card-${edge}`, `${by}px`);

  root.classList.toggle(SAME_CARD, !slide);
  const kept = mapButton(before)?.classList.contains('idle') ? KEPT.hidden : KEPT.shown;
  let keptButton: HTMLElement | null | undefined;
  let header: HTMLElement | null = null;
  nameAll(before, 'out');
  const menu = document.querySelector<HTMLElement>(MENU);
  name(menu, 'menu');
  const { top, bottom } = before.getBoundingClientRect();
  // The floating buttons arriving wait for the transition to start (holdArrivals). Not if it was
  // given up before the update: nothing would let them go.
  let started = false;
  let arrivals: Animation[] = [];
  const transition = document.startViewTransition(() => {
    // Those on the page in both views (filters, footer...) come back under another name.
    clear();
    update();
    if (!started) arrivals = holdArrivals();
    // Closed, the menu stays in the page until its own way out ends: hidden, it isn't in the new
    // picture either. Gone from it halfway through, the transition would stop.
    menu?.style.setProperty('display', 'none');
    const after = find();
    if (!after) return;
    keptButton = mapButton(after);
    keptButton?.classList.add(kept);
    place(after, top);
    sameFraction(after, top);
    header = holdHeader();
    const edges = after.getBoundingClientRect();
    shift('top', edges.top - top);
    shift('bottom', edges.bottom - bottom);
    nameAll(after, 'in');
    photosAtOnce(named);
  });
  // If it can't be shown (the tab in the background, say), the view just changes. The floating
  // buttons come in anyway; the map button, as it always does once the card is there.
  const arrive = () => {
    started = true;
    arrivals.forEach((animation) => animation.play());
  };
  const start = () => {
    arrive();
    keptButton?.classList.replace(kept, SWITCHING);
  };
  transition.ready.then(start, arrive);
  const end = () => {
    clear();
    root.classList.remove(SAME_CARD);
    keptButton?.classList.remove(kept, SWITCHING);
    releaseHeader(header);
    root.style.removeProperty('--card-top');
    root.style.removeProperty('--card-bottom');
  };
  transition.finished.then(end, end);
}

/**
 * Scrolls the new page so that the card stays where it was on the screen, as far as the page lets it:
 * no higher than the top, no lower than the end. In whole pixels, rounded here: left to the browser,
 * which can drop the fraction always the same way, everything went down a pixel on every switch. The
 * fraction left over, sameFraction makes up for.
 */
function keepInPlace(scroller: Element): CardMove['place'] {
  return (after, top) => {
    scroller.scrollTop = Math.round(scroller.scrollTop + after.getBoundingClientRect().top - top);
  };
}

/**
 * From one list view to the other, on a phone or on desktop: the venue's card stays where it is on the
 * screen, and what it shows changes. What's above the list stays too, and on desktop the map beside
 * it. False, with nothing done, if it can't: no transitions in the browser, the gallery in several
 * columns, reduced motion or no card to keep.
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
    keepShared: true,
  });
  return true;
}

/**
 * From a list view to the venue's, on a phone: the card goes from where it is to its place, at the top
 * of the page under the map, which comes down from above; update leaves it in the middle of the cards
 * side by side, whose neighbours arrive with the rest of the page. From the gallery, what the card
 * shows changes as on switching view; from the list it's the same card, it only moves. False, with
 * nothing done, if it can't (see switchView).
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
    after: () => cardOf(number),
    place: () => (scroller.scrollTop = 0),
    slide: fromGallery,
  });
  return true;
}

/**
 * From the venue's view back to a list view, on a phone: the card in the middle stays where it is on
 * the screen, as on switching view, and the list arrives around it while the map goes back up. Into
 * the gallery, what the card shows changes. False, with nothing done, if it can't (see switchView).
 */
export function closeVenue(
  number: number,
  scroller: Element,
  update: () => void,
  toGallery: boolean,
): boolean {
  const before = cardOf(number);
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
