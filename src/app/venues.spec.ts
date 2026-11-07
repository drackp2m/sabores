import { testTapa, testVenue, week } from '../testing/venue';
import {
  Filters,
  NO_FILTERS,
  Tapa,
  TimeSlot,
  Venue,
  Weekday,
  arrivalFrom,
  changeKind,
  closingKey,
  describeStatus,
  drinkTypes,
  filterVenues,
  formatDistance,
  formatDuration,
  isWithdrawn,
  limitedSchedule,
  nextHour,
  openBetween,
  photoUrl,
  scheduleChanges,
  scheduleStatus,
  sortBy,
  sortDrinks,
  splitSlots,
  statusBadge,
  statusKind,
  tapaKey,
  timeRange,
  unchanged,
  weekdayOf,
  withdrawalNotice,
} from './venues';

function venue(
  name: string,
  tapa: Partial<Tapa> = {},
  schedule: Partial<Record<Weekday, TimeSlot[]>> = {},
  extra: Partial<Venue> = {},
): Venue {
  return testVenue({
    name,
    drinks: [{ name: 'Caña', type: 'Cerveza' }],
    schedule: { ...week(), ...schedule },
    tapas: [testTapa(tapa)],
    ...extra,
  });
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
  /** On Mondays only, with those slots. */
  const onMonday = (slots: TimeSlot[], from: string, to: string) =>
    openBetween({ ...week(), monday: slots }, 'monday', from, to);

  it('without times, serving tapas that day is enough', () => {
    expect(onMonday(slots, '', '')).toBe(true);
    expect(onMonday([], '', '')).toBe(false);
  });

  it('with only "from", goes up to the end of the day', () => {
    const lunch = slots.slice(0, 1);
    expect(onMonday(lunch, '12:00', '')).toBe(true);
    expect(onMonday(lunch, '16:00', '')).toBe(false);
    expect(onMonday(slots, '16:00', '')).toBe(true); // It opens again at 20:00.
    expect(onMonday(slots, '23:30', '')).toBe(true); // "until closing time"
  });

  it('with the same time in both, checks that exact time', () => {
    expect(onMonday(slots, '12:00', '12:00')).toBe(true);
    expect(onMonday(slots, '15:59', '15:59')).toBe(true);
    expect(onMonday(slots, '16:00', '16:00')).toBe(false);
    expect(onMonday(slots, '23:30', '23:30')).toBe(true);
  });

  it('takes 00:00 as the end of the day', () => {
    const lunch = slots.slice(0, 1);
    expect(onMonday(lunch, '', '00:00')).toBe(true);
    expect(onMonday(lunch, '00:00', '00:00')).toBe(true);
    expect(onMonday(lunch, '17:00', '00:00')).toBe(false);
    expect(onMonday(slots, '17:00', '00:00')).toBe(true);
  });

  it('with a range, any overlapping slot counts', () => {
    expect(onMonday(slots, '17:00', '19:00')).toBe(false);
    expect(onMonday(slots, '17:00', '20:30')).toBe(true);
    expect(onMonday(slots, '15:30', '18:00')).toBe(true);
    expect(onMonday(slots, '16:00', '20:00')).toBe(false); // They only touch.
    expect(onMonday(slots, '', '12:30')).toBe(true);
  });

  it('accepts slots past midnight, up to 24:00', () => {
    expect(onMonday([{ open: '21:00', close: '01:00' }], '23:00', '')).toBe(true);
    expect(onMonday([{ open: '21:00', close: '01:00' }], '23:59', '23:59')).toBe(true);
  });

  it('with "to" before "from", goes on until that time the following day', () => {
    const night = [{ open: '21:00', close: '23:00' }];
    const breakfast = [{ open: '07:00', close: '13:00' }];
    const schedule = (days: Partial<Record<Weekday, TimeSlot[]>>) => ({ ...week(), ...days });
    // That night.
    expect(openBetween(schedule({ friday: night }), 'friday', '22:00', '01:00')).toBe(true);
    expect(openBetween(schedule({ friday: night }), 'friday', '23:00', '06:00')).toBe(false);
    // The following morning, not that day's.
    expect(openBetween(schedule({ saturday: breakfast }), 'friday', '22:00', '08:00')).toBe(true);
    expect(openBetween(schedule({ friday: breakfast }), 'friday', '22:00', '08:00')).toBe(false);
    expect(openBetween(schedule({ saturday: breakfast }), 'friday', '22:00', '07:00')).toBe(false);
    // From Sunday into Monday.
    expect(openBetween(schedule({ monday: breakfast }), 'sunday', '22:00', '08:00')).toBe(true);
  });

  describe('without a day', () => {
    const friday = { ...week(), friday: [{ open: '17:00', close: '20:00' }] };

    it('any day counts', () => {
      expect(openBetween(friday, '', '', '')).toBe(true);
      expect(openBetween(week(), '', '', '')).toBe(false);
      expect(openBetween(friday, '', '18:00', '19:00')).toBe(true);
      expect(openBetween(friday, '', '19:30', '19:30')).toBe(true);
      expect(openBetween(friday, '', '20:00', '')).toBe(false);
      expect(openBetween(friday, 'monday', '18:00', '19:00')).toBe(false);
    });

    it('with "to" before "from", any night with the following morning', () => {
      const saturday = { ...week(), saturday: [{ open: '07:00', close: '13:00' }] };
      expect(openBetween(saturday, '', '22:00', '08:00')).toBe(true);
      expect(openBetween(saturday, '', '22:00', '07:00')).toBe(false);
      expect(openBetween(friday, '', '19:00', '02:00')).toBe(true);
      expect(openBetween(friday, '', '21:00', '02:00')).toBe(false);
    });
  });
});

describe('scheduleChanges and limitedSchedule', () => {
  const slot = (open: string, close: string | null): TimeSlot => ({ open, close });
  const schedule = week([slot('12:00', '14:00'), slot('20:00', '22:00')]);
  const changes = (
    reviewedHours: Partial<Record<Weekday, TimeSlot[]>>,
    tapas: Partial<Record<Weekday, TimeSlot[]>> = schedule,
  ) =>
    scheduleChanges(
      testVenue({
        schedule: { ...week(), ...tapas },
        reviewedHours: { ...week(), ...reviewedHours },
      }),
    );
  const limit = (...args: Parameters<typeof changes>) => limitedSchedule(changes(...args)!);

  it('there are none without reviewed hours, or if they take nothing away', () => {
    expect(scheduleChanges(testVenue({ schedule }))).toBeNull();
    expect(changes(week([slot('11:00', '23:30')]))).toBeNull();
  });

  it('tell what happens to each slot: nothing, cut or closed', () => {
    const monday = changes({ monday: [slot('13:00', '18:00')] })!.monday;
    expect(monday).toEqual([
      { slot: slot('12:00', '14:00'), parts: [slot('13:00', '14:00')] },
      { slot: slot('20:00', '22:00'), parts: [] },
    ]);
    expect(monday.map(changeKind)).toEqual(['trimmed', 'closed']);
    expect(changeKind({ slot: slot('12:00', '14:00'), parts: [slot('12:00', '14:00')] })).toBe(
      'none',
    );
  });

  it('only leaves the slots, or the parts of them, when the venue is open', () => {
    const limited = limit({
      ...week([slot('11:00', '18:00')]),
      friday: [slot('13:00', '21:00')],
      sunday: [],
    })!;
    expect(limited.monday).toEqual([slot('12:00', '14:00')]);
    expect(limited.friday).toEqual([slot('13:00', '14:00'), slot('20:00', '21:00')]);
    expect(limited.sunday).toEqual([]);
  });

  it('never adds tapas: a venue open all day keeps its slots as they are', () => {
    const limited = limit({ ...week([slot('00:00', '00:00')]), monday: [] })!;
    expect(limited.tuesday).toEqual(schedule.tuesday);
    expect(limited.monday).toEqual([]);
  });

  it('ends "until closing time" when the venue closes, if that is before midnight', () => {
    const limited = limit(
      { ...week([slot('09:00', '23:00')]), saturday: [slot('09:00', '02:00')] },
      week([slot('20:00', null)]),
    )!;
    expect(limited.friday).toEqual([slot('20:00', '23:00')]);
    expect(limited.saturday).toEqual([slot('20:00', null)]);
  });

  it('counts what the night before goes on after midnight', () => {
    const limited = limit(
      { saturday: [slot('20:00', '02:00')] },
      { sunday: [slot('00:30', '03:00')] },
    )!;
    expect(limited.sunday).toEqual([slot('00:30', '02:00')]);
  });
});

describe('timeRange', () => {
  const sundayEvening = new Date(2026, 10, 1, 18, 30);
  const range = (day: Weekday | '', from: string, to: string) =>
    timeRange({ ...NO_FILTERS, day, from, to }, sundayEvening);

  it('has nothing to fill in with both ends or with neither', () => {
    expect(range('sunday', '12:00', '14:00')).toEqual({ from: '12:00', to: '14:00' });
    expect(range('sunday', '22:00', '02:00')).toEqual({ from: '22:00', to: '02:00' });
    expect(range('sunday', '', '')).toEqual({ from: '', to: '' });
    expect(range('', '', '')).toEqual({ from: '', to: '' });
  });

  it('without "to", goes up to midnight', () => {
    expect(range('sunday', '12:00', '')).toEqual({ from: '12:00', to: '00:00' });
    expect(range('monday', '12:00', '')).toEqual({ from: '12:00', to: '00:00' });
    expect(range('', '12:00', '')).toEqual({ from: '12:00', to: '00:00' });
  });

  it('without "from", starts now if it is for today and "to" is still to come', () => {
    expect(range('sunday', '', '20:00')).toEqual({ from: '18:30', to: '20:00' });
    expect(range('sunday', '', '00:00')).toEqual({ from: '18:30', to: '00:00' });
  });

  it('without "from", starts with the day if now does not fit', () => {
    expect(range('sunday', '', '14:00')).toEqual({ from: '00:00', to: '14:00' });
    expect(range('sunday', '', '18:30')).toEqual({ from: '00:00', to: '18:30' });
    expect(range('monday', '', '20:00')).toEqual({ from: '00:00', to: '20:00' });
    // Without a day it isn't for today.
    expect(range('', '', '20:00')).toEqual({ from: '00:00', to: '20:00' });
  });
});

describe('nextHour', () => {
  it('goes from now until an hour later, past midnight from 23:00 on', () => {
    const at = (hour: number, minute: number) => nextHour(new Date(2026, 10, 1, hour, minute));
    expect(at(18, 30)).toEqual({ day: 'sunday', from: '18:30', to: '19:30' });
    expect(at(23, 0)).toEqual({ day: 'sunday', from: '23:00', to: '00:00' });
    expect(at(23, 45)).toEqual({ day: 'sunday', from: '23:45', to: '00:45' });
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
    expect(names({ day: 'monday', from: '13:00' })).toEqual(['CÚPULA', 'ORIGEN']);
    expect(names({ day: 'monday', from: '13:00', to: '13:00' })).toEqual(['ORIGEN']);
    expect(names({ day: 'monday', from: '15:00', to: '20:30' })).toEqual(['CÚPULA', 'ORIGEN']);
  });

  it('filters by time range without a day, on any', () => {
    expect(names({ from: '17:00', to: '17:00' })).toEqual(['DOS EN VERDE']);
    expect(names({ from: '19:00', to: '20:30' })).toEqual(['CÚPULA', 'DOS EN VERDE']);
    expect(names({ from: '19:00', to: '20:30', day: 'friday' })).toEqual(['DOS EN VERDE']);
  });

  it('filters by a time range that goes on into the following day', () => {
    expect(names({ day: 'sunday', from: '21:00', to: '13:00' })).toEqual(['ORIGEN']);
    expect(names({ day: 'monday', from: '21:00', to: '13:00' })).toEqual(['CÚPULA']);
    expect(names({ from: '21:00', to: '13:00' })).toEqual(['CÚPULA', 'ORIGEN']);
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

  it('with a day or a time, leaves out those withdrawn by today', () => {
    const withdrawn = venues.map((v) =>
      v.name === 'ORIGEN' ? { ...v, withdrawnFrom: '2026-11-06' } : v,
    );
    const on = (today: string, filters: Partial<Filters>) =>
      filterVenues(withdrawn, { ...NO_FILTERS, ...filters }, undefined, today).map((v) => v.name);
    expect(on('2026-11-05', { day: 'monday' })).toEqual(['CÚPULA', 'ORIGEN']);
    expect(on('2026-11-06', { day: 'monday' })).toEqual(['CÚPULA']);
    expect(on('2026-11-06', { from: '13:00', to: '13:00' })).toEqual([]);
    // The rest of the filters don't depend on its schedule: it's still there, with its ribbon.
    expect(on('2026-11-06', {})).toEqual(['CÚPULA', 'ORIGEN', 'DOS EN VERDE']);
    expect(on('2026-11-06', { flavorRoute: true })).toEqual(['ORIGEN']);
  });
});

describe('isWithdrawn and withdrawalNotice', () => {
  const withdrawing = testVenue({ withdrawnFrom: '2026-11-09' });

  it('it has withdrawn from that day on', () => {
    expect(isWithdrawn(withdrawing, '2026-11-08')).toBe(false);
    expect(isWithdrawn(withdrawing, '2026-11-09')).toBe(true);
    expect(isWithdrawn(withdrawing, '2026-11-10')).toBe(true);
    expect(isWithdrawn(testVenue(), '2026-11-10')).toBe(false);
  });

  it('until then, a notice says from when', () => {
    expect(withdrawalNotice(withdrawing, '2026-11-08')).toBe(
      'A partir del lunes 9 de noviembre deja de participar en la ruta.',
    );
    expect(withdrawalNotice(withdrawing, '2026-11-09')).toBeNull();
    expect(withdrawalNotice(testVenue(), '2026-11-08')).toBeNull();
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

  it('ends when the venue withdraws', () => {
    // Withdrawn from Friday: on Wednesday at night, nothing more.
    expect(scheduleStatus(schedule, at('17:00'), route, '2026-10-30')).toEqual({
      open: false,
      minutes: 180,
    });
    expect(
      scheduleStatus({ ...schedule, wednesday: [] }, at('10:00'), route, '2026-10-30'),
    ).toEqual({ open: false, minutes: null });
    expect(scheduleStatus(schedule, at('14:00'), route, '2026-10-28')).toEqual({
      open: false,
      minutes: null,
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
    const text = (text: string) => ({ text, change: 'none' });
    const split = (...slots: TimeSlot[]) => splitSlots(unchanged(slots));
    expect(split(slot('12:00', '16:00'), slot('19:00', null))).toEqual({
      morning: [text('12:00–16:00')],
      afternoon: [text('19:00–cierre')],
    });
    expect(split(slot('13:00', '15:00'))).toEqual({
      morning: [text('13:00–15:00')],
      afternoon: [],
    });
    expect(split(slot('19:00', '21:00'))).toEqual({
      morning: [],
      afternoon: [text('19:00–21:00')],
    });
    expect(split()).toEqual({ morning: [], afternoon: [] });
  });

  it('with the corrections, shows what is left of each slot, in the same column', () => {
    const slot = (open: string, close: string | null): TimeSlot => ({ open, close });
    const day = [
      { slot: slot('12:00', '14:00'), parts: [] },
      { slot: slot('19:00', '22:00'), parts: [slot('19:00', '21:00')] },
    ];
    expect(splitSlots(day)).toEqual({
      morning: [{ text: '12:00–14:00', change: 'closed' }],
      afternoon: [{ text: '19:00–22:00', change: 'trimmed' }],
    });
    expect(splitSlots(day, true)).toEqual({
      morning: [{ text: '12:00–14:00', change: 'closed' }],
      afternoon: [{ text: '19:00–21:00', change: 'trimmed' }],
    });
  });
});
