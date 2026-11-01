/** Fast at first and slowing down on arrival. */
export const SETTLE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/**
 * A gentle start and slowing down on arrival: for what grows, whose first frames have to be seen.
 * With SETTLE it would already be halfway there by the third frame.
 */
export const GLIDE = 'cubic-bezier(0.4, 0, 0.1, 1)';

/** Height of the gradient through which the new content appears (about two lines). */
const FADE = 40;

/**
 * From one height to another: making room takes longer than folding. If it was pressed halfway
 * through, `from` is the height it had at that moment.
 */
export function animateHeight(element: HTMLElement, from: number, to: number): Animation {
  const opening = to > from;
  return element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: opening ? 450 : 300,
    easing: opening ? GLIDE : SETTLE,
  });
}

/**
 * Makes room from one height to another with the new content appearing behind it, from top to bottom.
 * Two masks: one over what was already in view and, on top of it, one ending in a gradient that sets
 * off from that same edge, a bit later than the height: each line appears little by little, after
 * room has been made for it.
 */
export function unfold(element: HTMLElement, from: number, to: number): void {
  animateHeight(element, from, to);
  const mask = (height: number): Keyframe => ({
    maskImage: `linear-gradient(#000 0 0), linear-gradient(#000 calc(100% - ${FADE}px), transparent)`,
    maskRepeat: 'no-repeat',
    maskSize: `100% ${from}px, 100% ${height}px`,
  });
  element.animate([mask(from), mask(to + FADE)], {
    duration: 450,
    delay: 120,
    easing: GLIDE,
    fill: 'backwards',
  });
}
