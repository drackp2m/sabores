import { Coordinates, TravelMode, distanceMeters } from './venues';

/** The route's [lng, lat] points, the way GeoJSON has them. */
export type Route = [number, number][];

const PROFILES: Record<TravelMode, string> = {
  walking: 'routed-foot/route/v1/foot',
  driving: 'routed-car/route/v1/driving',
};

/** One request per journey: opening the same venue again doesn't ask for it again. */
const routes = new Map<string, Promise<Route | null>>();

/**
 * Shortest route along the streets (OSRM from openstreetmap.de, on foot or by car) from the starting
 * point to the venue; null if the service doesn't answer.
 */
export function findRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: TravelMode,
): Promise<Route | null> {
  const points = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://routing.openstreetmap.de/${PROFILES[mode]}/${points}?overview=full&geometries=geojson`;
  let route = routes.get(url);
  if (!route) {
    route = fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (data: { routes?: { geometry: { coordinates: Route } }[] } | null) =>
          data?.routes?.[0]?.geometry.coordinates ?? null,
      )
      .catch(() => null);
    // If it fails, it can be retried later.
    route.then((r) => r ?? routes.delete(url));
    routes.set(url, route);
  }
  return route;
}

/** How many meters a point is from a route: from the closest spot along any of its stretches. */
export function distanceToRoute(point: Coordinates, route: Route): number {
  // Near the point the Earth is flat enough: each stretch, in meters from it.
  const metersPerDegree = (2 * Math.PI * 6_371_000) / 360;
  const toMeters = ([lng, lat]: [number, number]) => ({
    x: (lng - point.lng) * metersPerDegree * Math.cos((point.lat * Math.PI) / 180),
    y: (lat - point.lat) * metersPerDegree,
  });
  let closest = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = toMeters(route[i - 1]);
    const b = toMeters(route[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
    closest = Math.min(closest, Math.hypot(a.x + along * dx, a.y + along * dy));
  }
  return closest;
}

/** Directions in the system's maps app: Apple Maps on iPhone, iPad and Mac; Google Maps elsewhere. */
export function directionsLink(
  destination: Coordinates,
  name: string,
  mode: TravelMode = 'walking',
): string {
  const point = `${destination.lat},${destination.lng}`;
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) {
    const params = new URLSearchParams({
      daddr: point,
      q: name,
      dirflg: mode === 'walking' ? 'w' : 'd',
    });
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({
    api: '1',
    destination: point,
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
