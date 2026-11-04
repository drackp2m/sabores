// jsdom has no ResizeObserver (collapsible text in the cards, map), IntersectionObserver (scroll-to-top
// button, scroll position), animate or getAnimations (photo viewer, stars, heart), matchMedia,
// scrollIntoView (map), scrollTo or scrollBy. No IndexedDB either: the store stays in memory, nor
// WebGL2: the map is a simulated one.
vi.mock('maplibre-gl', () => import('./maplibre'));
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;
Element.prototype.animate ??= () =>
  ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation;
Element.prototype.getAnimations ??= () => [];
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.scrollTo ??= () => {};
Element.prototype.scrollBy ??= () => {};
window.matchMedia ??= () =>
  ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;
