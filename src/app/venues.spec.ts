import {
  Filters,
  NO_FILTERS,
  Tapa,
  TimeSlot,
  Venue,
  Weekday,
  arrivalFrom,
  closingKey,
  describeStatus,
  drinkTypes,
  filterVenues,
  formatDistance,
  formatDuration,
  openBetween,
  photoUrl,
  scheduleStatus,
  sortBy,
  sortDrinks,
  splitSlots,
  statusBadge,
  statusKind,
  tapaKey,
  weekdayOf,
} from './venues';

function venue(
  name: string,
  tapa: Partial<Tapa> = {},
  schedule: Partial<Record<Weekday, TimeSlot[]>> = {},
  extra: Partial<Venue> = {},
): Venue {
  return {
    number: 1,
    name,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: null,
    instagram: null,
    drinks: [{ name: 'Caña', type: 'Cerveza' }],
    notes: [],
    schedule: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
      ...schedule,
    },
    tapas: [
      {
        number: 1,
        name: 'TAPA',
        description: '',
        photo: '',
        glutenFree: 'no',
        flavorRoute: false,
        ...tapa,
      },
    ],
    location: null,
    ...extra,
  };
}

describe('photoUrl', () => {
  it('points to the WebP version of that width', () => {
    const tapa = { photo: 'photos/07-2.jpg' } as Tapa;
    expect(photoUrl(tapa, 500)).toBe('data/photos/07-2-500.webp');
    expect(photoUrl(tapa, 690)).toBe('data/photos/07-2-690.webp');
  });
});

describe('openBetween', () => {
  const slots: TimeSlot[] = [
    { open: '12:00', close: '16:00' },
    { open: '20:00', close: null },
  ];

  it('without times, serving tapas that day is enough', () => {
    expect(openBetween(slots, '', '')).toBe(true);
    expect(openBetween([], '', '')).toBe(false);
  });

  it('with only "from", checks that exact time', () => {
    expect(openBetween(slots, '12:00', '')).toBe(true);
    expect(openBetween(slots, '16:00', '')).toBe(false);
    expect(openBetween(slots, '23:30', '')).toBe(true); // "until closing time"
  });

  it('with a range, any overlapping slot counts', () => {
    expect(openBetween(slots, '17:00', '19:00')).toBe(false);
    expect(openBetween(slots, '17:00', '20:30')).toBe(true);
    expect(openBetween(slots, '15:30', '18:00')).toBe(true);
    expect(openBetween(slots, '16:00', '20:00')).toBe(false); // They only touch.
    expect(openBetween(slots, '', '12:30')).toBe(true);
  });

  it('accepts slots and ranges past midnight', () => {
    expect(openBetween([{ open: '21:00', close: '01:00' }], '23:00', '')).toBe(true);
    expect(openBetween([{ open: '21:00', close: '23:00' }], '22:00', '01:00')).toBe(true);
  });
});

describe('weekdayOf', () => {
  it('returns the day of the week', () => {
    expect(weekdayOf(new Date(2026, 9, 28))).toBe('wednesday');
    expect(weekdayOf(new Date(2026, 10, 1))).toBe('sunday');
  });
});

describe('filterVenues', () => {
  const venues = [
    venue(
      'CÚPULA',
      { name: 'NUBE MARINA', glutenFree: 'yes' },
      { monday: [{ open: '20:00', close: '21:30' }] },
      { drinks: [{ name: 'Vermut casero', type: 'Vermut' }] },
    ),
    venue(
      'ORIGEN',
      { glutenFree: 'optional', flavorRoute: true },
      { monday: [{ open: '12:00', close: '16:00' }] },
    ),
    venue('DOS EN VERDE', {}, { friday: [{ open: '17:00', close: '20:00' }] }),
  ];
  const names = (filters: Partial<Filters>) =>
    filterVenues(venues, { ...NO_FILTERS, ...filters }).map((v) => v.name);

  it('without filters returns them all', () => {
    expect(names({})).toEqual(['CÚPULA', 'ORIGEN', 'DOS EN VERDE']);
  });

  it('searches ignoring accents and case, also in tapas and drinks', () => {
    expect(names({ text: 'cupula' })).toEqual(['CÚPULA']);
    expect(names({ text: 'Nube' })).toEqual(['CÚPULA']);
    expect(names({ text: 'casero' })).toEqual(['CÚPULA']);
  });

  it('with a number, looks for the venue with that number', () => {
    const numbered = venues.map((v, i) => ({ ...v, number: i + 1 }));
    const search = (text: string) =>
      filterVenues(numbered, { ...NO_FILTERS, text }).map((v) => v.name);
    expect(search(' 2 ')).toEqual(['ORIGEN']);
    // Even if the addresses contain that number (C/ MAYOR, 1).
    expect(search('1')).toEqual(['CÚPULA']);
    expect(search('12')).toEqual([]);
  });

  it('filters by day and time range', () => {
    expect(names({ day: 'monday' })).toEqual(['CÚPULA', 'ORIGEN']);
    expect(names({ day: 'monday', from: '13:00' })).toEqual(['ORIGEN']);
    expect(names({ day: 'monday', from: '15:00', to: '20:30' })).toEqual(['CÚPULA', 'ORIGEN']);
  });

  it('filters by gluten-free tapas', () => {
    expect(names({ glutenFree: 'yes' })).toEqual(['CÚPULA']);
    expect(names({ glutenFree: 'optional' })).toEqual(['CÚPULA', 'ORIGEN']);
  });

  it('filters by drink type', () => {
    expect(names({ drink: 'Vermut' })).toEqual(['CÚPULA']);
    expect(names({ drink: 'Cerveza' })).toEqual(['ORIGEN', 'DOS EN VERDE']);
  });

  it('filters by the Castelló Ruta de Sabor seal', () => {
    expect(names({ flavorRoute: true })).toEqual(['ORIGEN']);
  });
});

describe('filterVenues with favorites and ratings', () => {
  // Three venues with two tapas: both tried in the 1st, one in the 2nd and none in the 3rd.
  const venues = [1, 2, 3].map((number) => {
    const base = venue(`VENUE ${number}`, {}, {}, { number });
    return { ...base, tapas: [base.tapas[0], { ...base.tapas[0], number: 2 }] };
  });
  const marks = {
    favorites: new Set([2, 3]),
    ratings: new Map([
      [tapaKey(1, 1), 5],
      [tapaKey(1, 2), 3],
      [tapaKey(2, 2), 1],
    ]),
  };
  const numbers = (filters: Partial<Filters>) =>
    filterVenues(venues, { ...NO_FILTERS, ...filters }, marks).map((v) => v.number);

  it('only the favorites', () => {
    expect(numbers({ favorites: true })).toEqual([2, 3]);
  });

  it('based on the tried tapas (the rated ones)', () => {
    expect(numbers({ tried: 'none' })).toEqual([3]);
    expect(numbers({ tried: 'some' })).toEqual([1, 2]);
    expect(numbers({ tried: 'pending' })).toEqual([2, 3]);
    expect(numbers({ tried: 'all' })).toEqual([1]);
    expect(numbers({ tried: 'pending', favorites: true })).toEqual([2, 3]);
  });

  it('without marks, nothing is a favorite or tried', () => {
    expect(filterVenues(venues, { ...NO_FILTERS, tried: 'none' }).length).toBe(3);
    expect(filterVenues(venues, { ...NO_FILTERS, favorites: true })).toEqual([]);
  });
});

describe('drinks', () => {
  const withDrinks = (...drinks: [string, string][]) =>
    venue('X', {}, {}, { drinks: drinks.map(([name, type]) => ({ name, type })) });
  const venues = [
    withDrinks(['Caña', 'Cerveza'], ['Copa de vino', 'Vino'], ['Tercio', 'Cerveza']),
    withDrinks(['Agua', 'Agua'], ['Caña', 'Cerveza'], ['Michelada', 'Cóctel']),
    withDrinks(['Agua', 'Agua'], ['Caña', 'Cerveza']),
  ];

  it('counts the venues of each type, the most common first', () => {
    expect(drinkTypes(venues)).toEqual([
      { type: 'Cerveza', venues: 3 },
      { type: 'Agua', venues: 2 },
      { type: 'Cóctel', venues: 1 },
      { type: 'Vino', venues: 1 },
    ]);
  });

  it('sorts each venue’s drinks by how many venues serve them and then alphabetically', () => {
    expect(sortDrinks(venues).map((v) => v.drinks.map((d) => d.name))).toEqual([
      ['Caña', 'Copa de vino', 'Tercio'],
      ['Caña', 'Agua', 'Michelada'],
      ['Caña', 'Agua'],
    ]);
  });
});

describe('scheduleStatus', () => {
  // Wednesday 28 October 2026.
  const at = (time: string) => new Date(`2026-10-28T${time}`);
  const schedule = venue(
    'X',
    {},
    {
      wednesday: [
        { open: '12:00', close: '16:00' },
        { open: '20:00', close: null },
      ],
      friday: [{ open: '13:00', close: '15:00' }],
    },
  ).schedule;
  const route = { startDate: '2026-10-15', endDate: '2026-11-07' };

  it('when open, counts down to the end of the slot', () => {
    expect(scheduleStatus(schedule, at('14:40'), route)).toEqual({
      open: true,
      minutes: 80,
      untilClosing: false,
    });
    expect(scheduleStatus(schedule, at('22:00'), route)).toEqual({
      open: true,
      minutes: 120,
      untilClosing: true,
    });
  });

  it('when closed, counts down to the next opening', () => {
    expect(scheduleStatus(schedule, at('17:00'), route)).toEqual({ open: false, minutes: 180 });
    expect(scheduleStatus(schedule, at('09:15'), route)).toEqual({ open: false, minutes: 165 });
    // Thursday without tapas: Friday at 13:00.
    expect(scheduleStatus({ ...schedule, wednesday: [] }, at('10:00'), route)).toEqual({
      open: false,
      minutes: 2 * 24 * 60 + 180,
    });
  });

  it('respects the dates of the route', () => {
    expect(scheduleStatus(schedule, at('14:00'), { ...route, endDate: '2026-10-27' })).toEqual({
      open: false,
      minutes: null,
    });
    expect(scheduleStatus(schedule, at('14:00'), { ...route, startDate: '2026-10-30' })).toEqual({
      open: false,
      minutes: 2 * 24 * 60 - 60,
    });
  });
});

describe('statusKind', () => {
  it('tells open, about to close and closed apart', () => {
    expect(statusKind({ open: true, minutes: 90 })).toBe('open');
    expect(statusKind({ open: true, minutes: 30 })).toBe('soon');
    expect(statusKind({ open: true, minutes: 10, untilClosing: true })).toBe('open');
    expect(statusKind({ open: false, minutes: 10 })).toBe('closed');
  });

  it('warns if it closes before you can get there', () => {
    const arrival = { meters: 2000, minutes: 33, mode: 'walking' as const };
    expect(statusKind({ open: true, minutes: 90 }, arrival)).toBe('open');
    expect(statusKind({ open: true, minutes: 32 }, arrival)).toBe('late');
    expect(statusKind({ open: true, minutes: 20, untilClosing: true }, arrival)).toBe('open');
    expect(statusKind({ open: false, minutes: 10 }, arrival)).toBe('closed');
    expect(statusBadge({ open: true, minutes: 20 }, new Date(), arrival)).toEqual({
      text: 'cierra en 20 min',
      kind: 'late',
      warning: 'Cierra antes de que llegues: tardas 33 min',
    });
  });
});

describe('describeStatus', () => {
  const now = new Date('2026-10-28T10:00');

  it('describes how long until it closes or opens', () => {
    expect(describeStatus({ open: true, minutes: 80 }, now)).toBe('cierra en 1 h 20 min');
    expect(describeStatus({ open: true, minutes: 120, untilClosing: true }, now)).toBe(
      'hasta el cierre',
    );
    expect(describeStatus({ open: false, minutes: 45 }, now)).toBe('abre en 45 min');
    expect(describeStatus({ open: false, minutes: null }, now)).toBe('no hay más tapas');
  });

  it('for distant openings, gives the day and the time', () => {
    expect(describeStatus({ open: false, minutes: 13 * 60 }, now)).toBe('abre hoy a las 23:00');
    expect(describeStatus({ open: false, minutes: 26 * 60 }, now)).toBe('abre mañana a las 12:00');
    expect(describeStatus({ open: false, minutes: 51 * 60 }, now)).toBe(
      'abre el viernes a las 13:00',
    );
  });
});

describe('sortBy', () => {
  const withNumber = (number: number) => venue(`V${number}`, {}, {}, { number });

  it('sorts by the key and, on a tie, by number', () => {
    const keys: Record<number, number> = { 1: 30, 2: 10, 3: 30, 4: Infinity, 5: Infinity };
    expect(
      sortBy([5, 4, 3, 2, 1].map(withNumber), (v) => keys[v.number]).map((v) => v.number),
    ).toEqual([2, 1, 3, 4, 5]);
  });

  it('by closing time, first the open ones and then the soonest to open', () => {
    const statuses = [
      { open: false, minutes: 10 },
      { open: true, minutes: 90 },
      { open: false, minutes: null },
      { open: true, minutes: 15 },
    ];
    expect(statuses.map(closingKey).sort((a, b) => a - b)).toEqual(
      [3, 1, 0, 2].map((i) => closingKey(statuses[i])),
    );
  });
});

describe('arrivalFrom', () => {
  const square = { lat: 39.986, lng: -0.037 };

  it('estimates the time on foot for short distances', () => {
    const arrival = arrivalFrom(square, { lat: 39.995, lng: -0.037 }); // ~1 km north
    expect(arrival.mode).toBe('walking');
    expect(Math.round(arrival.meters / 100)).toBe(10);
    expect(arrival.minutes).toBe(16);
  });

  it('and by car for long ones', () => {
    expect(arrivalFrom(square, { lat: 39.94, lng: -0.1 }).mode).toBe('driving');
  });

  it('or with the chosen mode', () => {
    const arrival = arrivalFrom(square, { lat: 39.995, lng: -0.037 }, 'driving');
    expect(arrival.mode).toBe('driving');
    expect(arrival.minutes).toBe(3);
    expect(arrivalFrom(square, { lat: 39.94, lng: -0.1 }, 'walking').mode).toBe('walking');
  });
});

describe('formats', () => {
  it('formats durations and distances', () => {
    expect(formatDuration(5)).toBe('5 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(135)).toBe('2 h 15 min');
    expect(formatDistance(847)).toBe('850 m');
    expect(formatDistance(1234)).toBe('1,2 km');
  });

  it('splits a day’s slots into morning and afternoon', () => {
    const slot = (open: string, close: string | null): TimeSlot => ({ open, close });
    expect(splitSlots([slot('12:00', '16:00'), slot('19:00', null)])).toEqual({
      morning: '12:00–16:00',
      afternoon: '19:00–cierre',
    });
    expect(splitSlots([slot('13:00', '15:00')])).toEqual({
      morning: '13:00–15:00',
      afternoon: null,
    });
    expect(splitSlots([slot('19:00', '21:00')])).toEqual({
      morning: null,
      afternoon: '19:00–21:00',
    });
    expect(splitSlots([])).toEqual({ morning: null, afternoon: null });
  });
});
