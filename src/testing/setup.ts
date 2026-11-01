// jsdom has no ResizeObserver (collapsible text in the cards, map), IntersectionObserver (scroll-to-top
// button), animate or getAnimations (photo viewer, stars, heart), matchMedia, scrollIntoView (map) or
// scrollTo. No IndexedDB either: the store stays in memory.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;
Element.prototype.animate ??= () => ({ finished: Promise.resolve() }) as unknown as Animation;
Element.prototype.getAnimations ??= () => [];
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.scrollTo ??= () => {};
window.matchMedia ??= () => ({ matches: false }) as MediaQueryList;
