/**
 * Other sites' links, in Safari. Added to the Home Screen of an iPhone or iPad, the app opens them in
 * a browser of its own, on top of it: without Safari's sign-ins, and from where Instagram's don't reach
 * its app. Prefixed with x-safari-, iOS hands them to Safari instead. It came with iOS 17 and isn't
 * documented: before that, or if it ever stops working, they open like any link. The Dock's web apps
 * on a Mac already open them in the default browser.
 */
const SAFARI = 'x-safari-';

/** Apple Maps': the system takes them to its app, with no browser in between. */
const SYSTEM_HOSTS = new Set(['maps.apple.com']);

/** The address that opens the link in Safari; null if it doesn't leave the app or isn't a web page. */
export function safariUrl(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin === origin || SYSTEM_HOSTS.has(url.hostname)) return null;
  return SAFARI + url.href;
}

/** Opened from the Home Screen of an iPhone or iPad (a Mac has no touch screen), on iOS 17 or later. */
export function homeScreenApp(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return false;
  if (navigator.maxTouchPoints < 2) return false;
  // An iPad says it's a Mac, without the version.
  const version = /OS (\d+)_/.exec(navigator.userAgent);
  return !version || Number(version[1]) >= 17;
}

/**
 * From the Home Screen, each tap on another site's link opens it in Safari: also those MapLibre paints,
 * like the map's credits. Before anyone else hears it, so that none can stop it on the way. It returns
 * how to stop listening.
 */
export function openLinksInSafari(navigate = (url: string) => location.assign(url)): () => void {
  if (!homeScreenApp()) return () => {};
  const listener = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    const url = safariUrl(link.href, location.origin);
    if (!url) return;
    event.preventDefault();
    navigate(url);
  };
  document.addEventListener('click', listener, true);
  return () => document.removeEventListener('click', listener, true);
}
