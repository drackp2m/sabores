// The same media queries as in styles/_media.scss, for the code.

/** List on the left and map on the right. */
export function isDesktop(): boolean {
  return matchMedia('(min-width: 960px)').matches;
}

/** No mouse: app-root scrolls instead of the document, and the map moves with two fingers. */
export function isTouch(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pixels in 1rem (fewer on narrow screens, see styles/_base.scss). */
export function remInPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}
