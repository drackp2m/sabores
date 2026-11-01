/** Types of data/venues.json and the filtering and sorting logic (no Angular dependencies). */

export type Weekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface TimeSlot {
  open: string;
  /** null = "until closing time". */
  close: string | null;
}

export interface Tapa {
  number: number;
  name: string;
  description: string;
  photo: string;
  glutenFree: 'yes' | 'optional' | 'no';
  flavorRoute: boolean;
}

export interface Drink {
  /** Normalized name ("Tercio", "Copa de vino"…). */
  name: string;
  /** Type used by the filter ("Cerveza", "Vino"…). */
  type: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Venue {
  number: number;
  name: string;
  subtitle: string | null;
  address: string;
  phone: string | null;
  instagram: string | null;
  /** Alphabetical in venues.json; the app sorts them with sortDrinks(). */
  drinks: Drink[];
  notes: string[];
  /** A day with no slots serves no tapas. */
  schedule: Record<Weekday, TimeSlot[]>;
  tapas: Tapa[];
  location: Coordinates | null;
}

export interface RouteEvent {
  name: string;
  edition: string;
  startDate: string;
  endDate: string;
  price: string;
  city: string;
}

export interface RouteData {
  event: RouteEvent;
  venues: Venue[];
}

export const WEEKDAYS: readonly { id: Weekday; name: string }[] = [
  { id: 'monday', name: 'Lunes' },
  { id: 'tuesday', name: 'Martes' },
  { id: 'wednesday', name: 'Miércoles' },
  { id: 'thursday', name: 'Jueves' },
  { id: 'friday', name: 'Viernes' },
  { id: 'saturday', name: 'Sábado' },
  { id: 'sunday', name: 'Domingo' },
];

export interface Filters {
  /**
   * Searches names, addresses, drinks and tapas, ignoring accents and case. If it is a number, it
   * looks for the venue with that number.
   */
  text: string;
  day: Weekday | '';
  /** 'HH:MM' range; only used when there is a day. Without "to", the exact time in "from" counts. */
  from: string;
  to: string;
  /** 'yes': some gluten-free tapa; 'optional': "gluten-free on request" counts too. */
  glutenFree: '' | 'yes' | 'optional';
  /** Drink type (Drink.type). */
  drink: string;
  flavorRoute: boolean;
  /** Only the venues marked with the heart. */
  favorites: boolean;
  /** Based on the rated tapas (those with stars count as tried). */
  tried: TriedFilter;
}

/**
 * 'none': no tapa tried yet; 'some': at least one tried; 'pending': at least one still to try; 'all':
 * every tapa tried.
 */
export type TriedFilter = '' | 'none' | 'some' | 'pending' | 'all';

export const NO_FILTERS: Filters = {
  text: '',
  day: '',
  from: '',
  to: '',
  glutenFree: '',
  drink: '',
  flavorRoute: false,
  favorites: false,
  tried: '',
};

/** What the user has marked (store.ts): favorite venues and the stars of each tapa. */
export interface UserMarks {
  favorites: ReadonlySet<number>;
  /** By tapaKey(); no entry means not tried. */
  ratings: ReadonlyMap<string, number>;
}

export const NO_MARKS: UserMarks = { favorites: new Set(), ratings: new Map() };

/** A tapa is identified by its venue's number and its own number within it (1 or 2). */
export function tapaKey(venue: number, tapa: number): string {
  return `${venue}-${tapa}`;
}

/** A tapa's photo, in one of its versions (scripts/photos.mjs): thumbnail or enlarged. */
export function photoUrl(tapa: Tapa, width: 500 | 690): string {
  return `data/${tapa.photo.replace(/\.jpg$/, '')}-${width}.webp`;
}

export function filterVenues(
  venues: readonly Venue[],
  filters: Filters,
  marks: UserMarks = NO_MARKS,
): Venue[] {
  const text = normalize(filters.text.trim());
  const number = /^\d+$/.test(text) ? Number(text) : null;
  const { day, from, to, glutenFree, drink, flavorRoute, favorites, tried } = filters;
  return venues.filter(
    (venue) =>
      (!favorites || marks.favorites.has(venue.number)) &&
      (!tried || matchesTried(venue, tried, marks.ratings)) &&
      (!text || (number !== null ? venue.number === number : searchTextOf(venue).includes(text))) &&
      (!day || openBetween(venue.schedule[day], from, to)) &&
      (!glutenFree ||
        venue.tapas.some(
          (t) =>
            t.glutenFree === 'yes' || (glutenFree === 'optional' && t.glutenFree === 'optional'),
        )) &&
      (!drink || venue.drinks.some((d) => d.type === drink)) &&
      (!flavorRoute || venue.tapas.some((t) => t.flavorRoute)),
  );
}

function matchesTried(
  venue: Venue,
  tried: Exclude<TriedFilter, ''>,
  ratings: ReadonlyMap<string, number>,
): boolean {
  const isTried = (t: Tapa) => ratings.has(tapaKey(venue.number, t.number));
  switch (tried) {
    case 'none':
      return !venue.tapas.some(isTried);
    case 'some':
      return venue.tapas.some(isTried);
    case 'pending':
      return !venue.tapas.every(isTried);
    case 'all':
      return venue.tapas.every(isTried);
  }
}

/**
 * Does it serve tapas at some point between "from" and "to"? Without "to", at the exact time in
 * "from"; without "from", since the start of the day. Without either, any slot that day is enough.
 */
export function openBetween(slots: readonly TimeSlot[], from: string, to: string): boolean {
  if (!from && !to) return slots.length > 0;
  const start = from ? toMinutes(from) : 0;
  let end = to ? toMinutes(to) : start;
  // "To" before "from": the range goes past midnight, but slots only count up to 24:00.
  if (end < start) end = END_OF_DAY;
  return slots.some((slot) => {
    const [opens, closes] = bounds(slot);
    return start === end ? opens <= start && start < closes : opens < end && start < closes;
  });
}

export function formatSlots(slots: readonly TimeSlot[]): string {
  if (!slots.length) return 'Sin tapas';
  return slots.map(formatSlot).join(' · ');
}

function formatSlot(slot: TimeSlot): string {
  return `${slot.open}–${slot.close ?? 'cierre'}`;
}

/** A day's slots in two columns: morning (or midday) and afternoon (or evening). */
export interface DaySlots {
  morning: string | null;
  afternoon: string | null;
}

/**
 * Splits a day's slots so that they line up in columns: with two, one in each; with just one, in the
 * morning column if it starts before 15:00 and in the afternoon one otherwise.
 */
export function splitSlots(slots: readonly TimeSlot[]): DaySlots {
  if (!slots.length) return { morning: null, afternoon: null };
  if (slots.length === 1) {
    const text = formatSlot(slots[0]);
    return slots[0].open < '15:00'
      ? { morning: text, afternoon: null }
      : { morning: null, afternoon: text };
  }
  return {
    morning: formatSlot(slots[0]),
    afternoon: slots.slice(1).map(formatSlot).join(' · '),
  };
}

/** Drink types with how many venues serve them: the most common first. */
export function drinkTypes(venues: readonly Venue[]): { type: string; venues: number }[] {
  return [...countVenues(venues, (d) => d.type)]
    .map(([type, venues]) => ({ type, venues }))
    .sort((a, b) => b.venues - a.venues || a.type.localeCompare(b.type, 'es'));
}

/** Sorts each venue's drinks by how many venues serve them (the most common first). */
export function sortDrinks(venues: readonly Venue[]): Venue[] {
  const count = countVenues(venues, (d) => d.name);
  return venues.map((venue) => ({
    ...venue,
    drinks: [...venue.drinks].sort(
      (a, b) => count.get(b.name)! - count.get(a.name)! || a.name.localeCompare(b.name, 'es'),
    ),
  }));
}

function countVenues(venues: readonly Venue[], key: (d: Drink) => string): Map<string, number> {
  const count = new Map<string, number>();
  for (const venue of venues) {
    for (const value of new Set(venue.drinks.map(key))) {
      count.set(value, (count.get(value) ?? 0) + 1);
    }
  }
  return count;
}

export function weekdayOf(date: Date): Weekday {
  // getDay() starts on Sunday; WEEKDAYS, on Monday.
  return WEEKDAYS[(date.getDay() + 6) % 7].id;
}

/** State of the tapas schedule at a given moment. */
export interface Status {
  open: boolean;
  /** Minutes until it stops serving tapas (open) or starts (closed); null: it won't open again. */
  minutes: number | null;
  /** Open "until closing time": nobody knows when that is (it counts until midnight). */
  untilClosing?: boolean;
}

/** Finds the current slot or, failing that, the next opening within the dates of the route. */
export function scheduleStatus(
  schedule: Record<Weekday, TimeSlot[]>,
  now: Date,
  event?: Pick<RouteEvent, 'startDate' | 'endDate'>,
): Status {
  const t = now.getHours() * 60 + now.getMinutes();
  for (let d = 0; d <= 7; d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const iso = isoDate(date);
    if (event && iso > event.endDate) break;
    if (event && iso < event.startDate) continue;
    for (const slot of schedule[weekdayOf(date)]) {
      const [opens, closes] = bounds(slot);
      if (d === 0 && opens <= t && t < closes) {
        return { open: true, minutes: closes - t, untilClosing: slot.close === null };
      }
    }
    const openings = schedule[weekdayOf(date)]
      .map((slot) => toMinutes(slot.open))
      .filter((opens) => d > 0 || opens > t);
    if (openings.length) {
      return { open: false, minutes: d * END_OF_DAY + Math.min(...openings) - t };
    }
  }
  return { open: false, minutes: null };
}

/** "cierra en 1 h 20 min", "abre en 45 min", "abre mañana a las 12:00"… */
export function describeStatus(status: Status, now: Date): string {
  const { open, minutes } = status;
  if (open)
    return status.untilClosing ? 'hasta el cierre' : `cierra en ${formatDuration(minutes!)}`;
  if (minutes === null) return 'no hay más tapas';
  if (minutes < 12 * 60) return `abre en ${formatDuration(minutes)}`;
  const opening = new Date(now.getTime() + minutes * 60_000);
  const days = Math.round(
    (new Date(opening).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  const when =
    days === 0
      ? 'hoy'
      : days === 1
        ? 'mañana'
        : `el ${WEEKDAYS.find((d) => d.id === weekdayOf(opening))!.name.toLowerCase()}`;
  return `abre ${when} a las ${opening.toTimeString().slice(0, 5)}`;
}

export type StatusKind = 'open' | 'soon' | 'late' | 'closed';

/**
 * For the color: open, about to close (30 min or less), closes before you can get there, or closed.
 */
export function statusKind(status: Status, arrival?: Arrival | null): StatusKind {
  const { open, minutes, untilClosing } = status;
  if (!open) return 'closed';
  if (untilClosing) return 'open';
  if (arrival && minutes! < arrival.minutes) return 'late';
  return minutes! <= 30 ? 'soon' : 'open';
}

/** Text, color and warning (if you can't get there in time) of the status badge. */
export function statusBadge(
  status: Status,
  now: Date,
  arrival?: Arrival | null,
): { text: string; kind: StatusKind; warning: string } {
  const kind = statusKind(status, arrival);
  return {
    text: describeStatus(status, now),
    kind,
    warning:
      kind === 'late'
        ? `Cierra antes de que llegues: tardas ${formatDuration(arrival!.minutes)}`
        : '',
  };
}

/** Key to sort by closing time: first the open ones (soonest to close), then the soonest to open. */
export function closingKey(status: Status): number {
  if (status.minutes === null) return Infinity;
  return status.open ? status.minutes : 8 * END_OF_DAY + status.minutes;
}

/** Sorts by the key and, on a tie, by venue number. */
export function sortBy(venues: readonly Venue[], key: (venue: Venue) => number): Venue[] {
  return [...venues].sort((a, b) => key(a) - key(b) || a.number - b.number);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Straight-line distance (haversine). */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type TravelMode = 'walking' | 'driving';

export interface Arrival {
  /** In a straight line. */
  meters: number;
  minutes: number;
  mode: TravelMode;
}

/**
 * Rough arrival time on foot (4.8 km/h) or by car (25 km/h in town). With no mode, on foot up to
 * 2.5 km in a straight line and by car beyond that. Streets make the journey 30–40 % longer.
 */
export function arrivalFrom(
  origin: Coordinates,
  destination: Coordinates,
  travelMode?: TravelMode,
): Arrival {
  const meters = distanceMeters(origin, destination);
  const mode = travelMode ?? (meters <= 2500 ? 'walking' : 'driving');
  const journey = meters * (mode === 'walking' ? 1.3 : 1.4);
  const metersPerMinute = mode === 'walking' ? 80 : 417;
  return { meters, mode, minutes: Math.max(1, Math.round(journey / metersPerMinute)) };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
}

const END_OF_DAY = 24 * 60;

/** A slot's minutes since midnight; "until closing" or past midnight counts up to 24:00. */
function bounds({ open, close }: TimeSlot): [number, number] {
  const opens = toMinutes(open);
  return [opens, close === null || toMinutes(close) <= opens ? END_OF_DAY : toMinutes(close)];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isoDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Lowercase and without accents, to compare what gets typed. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** What gets searched in each venue, already normalized: built the first time it is searched. */
const searchTexts = new WeakMap<Venue, string>();

function searchTextOf(venue: Venue): string {
  let text = searchTexts.get(venue);
  if (text === undefined) {
    text = normalize(
      [
        venue.name,
        venue.subtitle,
        venue.address,
        ...venue.drinks.flatMap((d) => [d.name, d.type]),
        ...venue.tapas.flatMap((t) => [t.name, t.description]),
      ].join(' '),
    );
    searchTexts.set(venue, text);
  }
  return text;
}
