import { Coordinates, TravelMode } from './venues';

/** The route's [lat, lng] points, the way Leaflet draws them. */
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
      .then((data: { routes?: { geometry: { coordinates: [number, number][] } }[] } | null) =>
        data?.routes?.[0]
          ? data.routes[0].geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng])
          : null,
      )
      .catch(() => null);
    // If it fails, it can be retried later.
    route.then((r) => r ?? routes.delete(url));
    routes.set(url, route);
  }
  return route;
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
