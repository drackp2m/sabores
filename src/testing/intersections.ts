type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

const HEADER = 60;

/**
 * Replaces IntersectionObserver and returns a function that tells every observer, as the browser
 * does, which of its targets are already above the header.
 */
export function stubIntersections(): (isAbove: (target: Element) => boolean) => void {
  const observers = new Set<{ callback: Callback; targets: Element[] }>();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly observer: { callback: Callback; targets: Element[] };

      constructor(callback: Callback) {
        this.observer = { callback, targets: [] };
        observers.add(this.observer);
      }

      observe(target: Element) {
        this.observer.targets.push(target);
      }

      disconnect() {
        observers.delete(this.observer);
      }
    },
  );
  return (isAbove) => {
    for (const { callback, targets } of observers) {
      callback(
        targets.map((target) => ({
          target,
          isIntersecting: !isAbove(target),
          rootBounds: { top: HEADER } as DOMRectReadOnly,
          boundingClientRect: { bottom: isAbove(target) ? 0 : 500 } as DOMRectReadOnly,
        })),
      );
    }
  };
}
