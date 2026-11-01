/** Fast at first and slowing down on arrival. */
export const SETTLE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * From one height to another: making room takes longer than folding. If it was pressed halfway
 * through, `from` is the height it had at that moment.
 */
export function animateHeight(element: HTMLElement, from: number, to: number): Animation {
  return element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: to > from ? 400 : 300,
    easing: SETTLE,
  });
}
