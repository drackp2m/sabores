import { Route, distanceAlongRoute, distanceToRoute, routeBearing } from './routing';
import { distanceMeters } from './venues';

describe('distanceToRoute', () => {
  const ROUTE: Route = [
    [-0.04, 39.98],
    [-0.04, 39.99],
    [-0.03, 39.99],
  ];

  it('is zero anywhere along a stretch, not only at its ends', () => {
    expect(distanceToRoute({ lat: 39.985, lng: -0.04 }, ROUTE)).toBeCloseTo(0, 3);
    expect(distanceToRoute({ lat: 39.99, lng: -0.035 }, ROUTE)).toBeCloseTo(0, 3);
  });

  it('measures to the closest spot of the closest stretch', () => {
    const point = { lat: 39.985, lng: -0.041 };
    const expected = distanceMeters(point, { lat: 39.985, lng: -0.04 });
    expect(distanceToRoute(point, ROUTE)).toBeCloseTo(expected, 0);
  });

  it('past the end, measures to the end', () => {
    const point = { lat: 39.979, lng: -0.04 };
    expect(distanceToRoute(point, ROUTE)).toBeCloseTo(
      distanceMeters(point, { lat: 39.98, lng: -0.04 }),
      0,
    );
  });
});

describe('routeBearing', () => {
  // North for some 1,100 m, then east.
  const ROUTE: Route = [
    [-0.04, 39.98],
    [-0.04, 39.99],
    [-0.03, 39.99],
  ];
  /** Degrees of latitude in so many meters. */
  const meters = (m: number) => m / ((2 * Math.PI * 6_371_000) / 360);

  it('looks along the stretch the point is on, or next to', () => {
    expect(routeBearing({ lat: 39.985, lng: -0.04 }, ROUTE)).toBeCloseTo(0);
    expect(routeBearing({ lat: 39.985, lng: -0.0401 }, ROUTE)).toBeCloseTo(0);
    expect(routeBearing({ lat: 39.99, lng: -0.035 }, ROUTE)).toBeCloseTo(90);
  });

  it('nearing a corner, turns bit by bit to the street that comes next', () => {
    const point = (before: number) => ({ lat: 39.99 - meters(before), lng: -0.04 });
    expect(routeBearing(point(15), ROUTE)).toBeCloseTo(45, 0);
    expect(routeBearing(point(6), ROUTE)).toBeGreaterThan(70);
  });

  it('has none at the end', () => {
    expect(routeBearing({ lat: 39.99, lng: -0.03 }, ROUTE)).toBeUndefined();
  });
});

describe('distanceAlongRoute', () => {
  // North for some 1,112 m, then east for some 852.
  const ROUTE: Route = [
    [-0.04, 39.98],
    [-0.04, 39.99],
    [-0.03, 39.99],
  ];

  it('counts what’s left of the stretch the point is on and of those after it', () => {
    const corner = { lat: 39.99, lng: -0.04 };
    const end = { lat: 39.99, lng: -0.03 };
    expect(distanceAlongRoute(corner, ROUTE)).toBeCloseTo(distanceMeters(corner, end), -1);
    const halfway = { lat: 39.985, lng: -0.04 };
    expect(distanceAlongRoute(halfway, ROUTE)).toBeCloseTo(
      distanceMeters(halfway, corner) + distanceMeters(corner, end),
      -1,
    );
  });

  it('adds how far the point is from the route', () => {
    const beside = { lat: 39.985, lng: -0.041 };
    const onIt = { lat: 39.985, lng: -0.04 };
    expect(distanceAlongRoute(beside, ROUTE) - distanceAlongRoute(onIt, ROUTE)).toBeCloseTo(
      distanceMeters(beside, onIt),
      0,
    );
  });
});
