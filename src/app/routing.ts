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

/** In meters, of the route ahead that says which way it goes: a corner turns the map bit by bit. */
const AHEAD = 30;

interface Spot {
  x: number;
  y: number;
}

/** From one spot to another, in meters. */
function length(a: Spot, b: Spot): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The one that far (from 0 to 1) on the way from a to b. */
function between(a: Spot, b: Spot, t: number): Spot {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * The route's points, in meters east (x) and north (y) of the point: near it the Earth is flat enough.
 * And the closest spot on it: on which stretch (the one ending at that point) and how far along it.
 */
function snap(point: Coordinates, route: Route) {
  const metersPerDegree = (2 * Math.PI * 6_371_000) / 360;
  const points = route.map(([lng, lat]) => ({
    x: (lng - point.lng) * metersPerDegree * Math.cos((point.lat * Math.PI) / 180),
    y: (lat - point.lat) * metersPerDegree,
  }));
  let closest = { distance: Infinity, stretch: 1, along: 0 };
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(a.x + along * dx, a.y + along * dy);
    if (distance < closest.distance) closest = { distance, stretch: i, along };
  }
  return { points, ...closest };
}

/** How many meters a point is from a route: from the closest spot along any of its stretches. */
export function distanceToRoute(point: Coordinates, route: Route): number {
  return snap(point, route).distance;
}

/** How many meters are left from the point to the end of the route: to it, and then along it. */
export function distanceAlongRoute(point: Coordinates, route: Route): number {
  const { points, stretch, along, distance } = snap(point, route);
  let left = distance;
  for (let i = stretch; i < points.length; i++) {
    left += length(points[i - 1], points[i]) * (i === stretch ? 1 - along : 1);
  }
  return left;
}

/**
 * Which way the route goes from the point, in degrees clockwise from north: from the closest spot on
 * it to the one AHEAD meters further along, or to its end. None at the end itself.
 */
export function routeBearing(point: Coordinates, route: Route): number | undefined {
  if (route.length < 2) return undefined;
  const { points, stretch, along } = snap(point, route);
  const from = between(points[stretch - 1], points[stretch], along);
  let to = from;
  let left = AHEAD;
  for (let i = stretch; i < points.length && left > 0; i++) {
    const step = length(to, points[i]);
    to = step > left ? between(to, points[i], left / step) : points[i];
    left -= step;
  }
  if (to.x === from.x && to.y === from.y) return undefined;
  return (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
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
