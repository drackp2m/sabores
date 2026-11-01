type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
type Side = 'above' | 'below';
type Edge = 'top' | 'bottom';

const HEADER = 60;
const SCREEN = 800;
const IN_SIGHT = 400;
const ABOVE = -1000;
const BELOW = 1000;

/**
 * Replaces IntersectionObserver and returns a function that tells every observer, as the browser
 * does, which of its targets have left the area it watches, on its side of the screen, which are
 * whole on the screen and which have only one of their edges in sight.
 */
export function stubIntersections(): (
  hasLeft: (target: Element, side: Side) => boolean,
  isWhole?: (target: Element) => boolean,
  hasInSight?: (target: Element, edge: Edge) => boolean,
) => void {
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(SCREEN);
  const observers = new Set<{ callback: Callback; side: Side; targets: Element[] }>();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly observer: { callback: Callback; side: Side; targets: Element[] };

      constructor(callback: Callback, options: IntersectionObserverInit) {
        const side = options.rootMargin?.startsWith('-') ? 'above' : 'below';
        this.observer = { callback, side, targets: [] };
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
  return (hasLeft, isWhole = () => false, hasInSight = () => false) => {
    for (const { callback, side, targets } of observers) {
      const edge = (target: Element, name: Edge) => {
        if (isWhole(target) || hasInSight(target, name)) return IN_SIGHT;
        return hasLeft(target, side) ? ABOVE : BELOW;
      };
      callback(
        targets.map((target) => ({
          target,
          isIntersecting: !hasLeft(target, side),
          intersectionRatio: isWhole(target) ? 1 : 0,
          rootBounds: { top: HEADER } as DOMRectReadOnly,
          boundingClientRect: {
            top: edge(target, 'top'),
            bottom: edge(target, 'bottom'),
          } as DOMRectReadOnly,
        })),
      );
    }
  };
}
