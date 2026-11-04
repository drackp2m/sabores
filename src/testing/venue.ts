import { Tapa, TimeSlot, Venue, Weekday } from '../app/venues';

/** The same slots every day; with none, a week with no tapas. */
export function week(slots: TimeSlot[] = []): Record<Weekday, TimeSlot[]> {
  return {
    monday: slots,
    tuesday: slots,
    wednesday: slots,
    thursday: slots,
    friday: slots,
    saturday: slots,
    sunday: slots,
  };
}

export function testTapa(extra: Partial<Tapa> = {}): Tapa {
  return {
    number: 1,
    name: 'TAPA',
    description: '',
    photo: '',
    glutenFree: 'no',
    flavorRoute: false,
    ...extra,
  };
}

/** With the bare minimum: each spec adds what it's about. */
export function testVenue(extra: Partial<Venue> = {}): Venue {
  return {
    number: 1,
    name: 'VENUE',
    address: 'C/ MAYOR, 1',
    phone: null,
    instagram: null,
    drinks: [],
    notes: [],
    schedule: week(),
    tapas: [],
    // No coordinates: the map doesn't have to frame anything (jsdom has no sizes).
    location: null,
    ...extra,
  };
}
