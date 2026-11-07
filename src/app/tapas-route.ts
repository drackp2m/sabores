import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { Clock } from './clock';
import { UserLocation } from './user-location';
import {
  Arrival,
  RouteData,
  SlotChange,
  Weekday,
  arrivalFrom,
  isoDate,
  limitedSchedule,
  scheduleChanges,
  scheduleStatus,
  sortDrinks,
} from './venues';

/** The route's data and what depends on it: each venue's schedule status and arrival time. */
@Injectable({ providedIn: 'root' })
export class TapasRoute {
  private readonly clock = inject(Clock);
  private readonly location = inject(UserLocation);
  private readonly load = resource({ loader: loadRouteData });

  /** undefined until it arrives (and if it doesn't: see error). */
  readonly data = computed(() => (this.load.hasValue() ? this.load.value() : undefined));
  readonly error = this.load.error;
  /**
   * «Horarios revisados», which App keeps in step with the filters: each venue's schedule, only while
   * it's open.
   */
  readonly reviewedHours = signal(false);
  /**
   * What the reviewed hours do to each slot of the guide's schedule, of the venues where they take
   * something away.
   */
  readonly changes = computed(() => {
    const changes = new Map<number, Record<Weekday, SlotChange[]>>();
    for (const venue of this.data()?.venues ?? []) {
      const venueChanges = scheduleChanges(venue);
      if (venueChanges) changes.set(venue.number, venueChanges);
    }
    return changes;
  });
  /** With «Horarios revisados», with the limited schedules: everything else goes by them. */
  readonly venues = computed(() => {
    const venues = this.data()?.venues ?? [];
    if (!this.reviewedHours()) return venues;
    const changes = this.changes();
    return venues.map((venue) => {
      const venueChanges = changes.get(venue.number);
      return venueChanges ? { ...venue, schedule: limitedSchedule(venueChanges) } : venue;
    });
  });

  /** 'YYYY-MM-DD': it only changes at midnight. For the venues that withdraw (isWithdrawn()). */
  readonly today = computed(() => isoDate(this.clock.now()));

  /** Schedule status of each venue right now. */
  readonly statuses = computed(() => {
    const event = this.data()?.event;
    const now = this.clock.now();
    return new Map(
      this.venues().map((v) => [v.number, scheduleStatus(v.schedule, now, event, v.withdrawnFrom)]),
    );
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
