// The same media queries as in styles/_media.scss, for the code.

/**
 * The list or the gallery on the left and the map on the right, with no venue view. A list, to hear
 * when it changes (on turning an iPad).
 */
export function desktop(): MediaQueryList {
  return matchMedia('(min-width: 960px)');
}

/**
 * The gallery and the list in a single column, as wide in both. On a phone, narrower than two of the
 * gallery's cards side by side (20rem each, see gallery.ts), with the gap and the margins; on desktop,
 * beside the map, in half of .content's 1280px at most (app.scss), which two of them don't fit in.
 */
export function oneColumn(): boolean {
  return matchMedia('(max-width: 42.98rem), (min-width: 960px)').matches;
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
