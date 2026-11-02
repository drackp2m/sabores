import { Route, distanceToRoute } from './routing';
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
