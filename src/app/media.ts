// The same media queries as in styles/_media.scss, for the code.

/** List on the left and map on the right. */
export function isDesktop(): boolean {
  return desktop().matches;
}

/** The same, to hear when it changes (on turning an iPad). */
export function desktop(): MediaQueryList {
  return matchMedia('(min-width: 960px)');
}

/**
 * A phone: narrower than two of the gallery's cards side by side (20rem each, see gallery.ts), with
 * the gap and the margins. The gallery and the list have a single column, as wide in both.
 */
export function isPhone(): boolean {
  return matchMedia('(max-width: 42.98rem)').matches;
}

/** No mouse: app-root scrolls instead of the document, and the map moves with two fingers. */
export function isTouch(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The system's theme (the app's, in theme.ts). */
export function systemDark(): MediaQueryList {
  return matchMedia('(prefers-color-scheme: dark)');
}

/** Pixels in 1rem (fewer on narrow screens, see styles/_base.scss). */
export function remInPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}
