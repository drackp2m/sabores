import { Injectable, computed, inject, resource } from '@angular/core';

import { Clock } from './clock';
import { UserLocation } from './user-location';
import { Arrival, RouteData, arrivalFrom, scheduleStatus, sortDrinks } from './venues';

/** The route's data and what depends on it: each venue's schedule status and arrival time. */
@Injectable({ providedIn: 'root' })
export class TapasRoute {
  private readonly clock = inject(Clock);
  private readonly location = inject(UserLocation);
  private readonly load = resource({ loader: loadRouteData });

  /** undefined until it arrives (and if it doesn't: see error). */
  readonly data = computed(() => (this.load.hasValue() ? this.load.value() : undefined));
  readonly error = this.load.error;
  readonly venues = computed(() => this.data()?.venues ?? []);

  /** Schedule status of each venue right now. */
  readonly statuses = computed(() => {
    const event = this.data()?.event;
    const now = this.clock.now();
    return new Map(this.venues().map((v) => [v.number, scheduleStatus(v.schedule, now, event)]));
  });

  /** Arrival time at each venue from the starting point. */
  readonly arrivals = computed(() => {
    const origin = this.location.origin();
    const mode = this.location.travelMode() || undefined;
    const arrivals = new Map<number, Arrival>();
    for (const venue of origin ? this.venues() : []) {
      if (venue.location) arrivals.set(venue.number, arrivalFrom(origin!, venue.location, mode));
    }
    return arrivals;
  });
}

/** The route's data, from the request index.html has already made (if not, it is requested now). */
async function loadRouteData(): Promise<RouteData> {
  const { routeData } = window as Window & { routeData?: Promise<Response> };
  const response = await (routeData ?? fetch('data/venues.json'));
  if (!response.ok) throw new Error(`data/venues.json: ${response.status}`);
  const data = (await response.json()) as RouteData;
  return { ...data, venues: sortDrinks(data.venues) };
}
