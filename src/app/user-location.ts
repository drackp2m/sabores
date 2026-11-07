import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, fromEvent, timeout } from 'rxjs';

import { Store } from './store';
import { Coordinates, TravelMode, distanceMeters, normalize } from './venues';

export interface Origin extends Coordinates {
  /** "Tu ubicación" or the address that was typed. */
  label: string;
}

/** The Castelló de la Plana area (west, north, east, south), the same as in scripts/geocode.swift. */
const VIEWBOX = '-0.12,40.03,0.07,39.93';

/** Some 50 km around it (Vila-real, Benicàssim, Sagunt…), in the same format. */
const SURROUNDINGS = '-0.62,40.44,0.55,39.54';

/** What OpenStreetMap calls towns, cities and neighborhoods. */
const TOWNS = ['boundary', 'place'];

/**
 * Official street map (CartoCiudad, from the IGN): it has every house number, which OpenStreetMap
 * lacks on many streets (it then gives the middle of a stretch, and not always the same one).
 */
const CARTOCIUDAD = 'https://www.cartociudad.es/geocoder/api/geocoder/candidates';
const MUNICIPALITY = 'Castelló de la Plana/Castellón de la Plana';
const PROVINCE = 'Castelló/Castellón';

/** It sometimes takes very long or never answers: after this time, OpenStreetMap takes over. */
const CARTOCIUDAD_TIMEOUT = 5000;

interface Candidate {
  /** 'portal', 'callejero', 'toponimo'… */
  type: string;
  /** "CALLE HERRERO 49, Castelló de la Plana (…)". */
  address: string;
  /** "CALLE", "AVENIDA"… */
  tip_via: string | null;
  /** "Benicàssim/Benicasim": the municipality, under both of its names if it has two. */
  muni: string;
  portalNumber: number;
  lat: number;
  lng: number;
}

interface OsmPlace {
  lat: string;
  lon: string;
  category: string;
}

/** In meters: GPS wanders a little even standing still, and nothing has to recalculate for that. */
const MIN_MOVE = 20;

const MY_LOCATION = 'Tu ubicación';

/** Where the last starting point came from, to recover it when the app opens again. */
type Source = 'geolocation' | 'address';

/**
 * Point from which distances and arrival times are calculated. The last one is recovered when the
 * app opens: the current location if that's what was used, asking for it again unless the browser
 * has been told not to give it; otherwise, the last address searched for. The current location
 * keeps moving with the phone for as long as it's the starting point, but only while a map shows
 * it: otherwise, it isn't worth the battery, nor having the list change while it's being read.
 */
@Injectable({ providedIn: 'root' })
export class UserLocation {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);

  readonly origin = signal<Origin | null>(null);
  /** How the arrival time is calculated; '' = based on the distance. Remembered for next time. */
  readonly travelMode = signal<TravelMode | ''>(this.store.setting<TravelMode>('travelMode') ?? '');
  readonly searching = signal(false);
  readonly error = signal('');
  /** Whether a map is on screen, whole or full screen (the map says so). */
  readonly mapInSight = signal(false);
  /** The phone has stopped giving the location: the starting point is the last one it gave. */
  readonly lost = signal(false);
  /** The current location is the starting point, or is about to be. */
  private readonly following = signal(false);
  /** The starting point is the current location, and moves with the phone. */
  readonly live = computed(() => this.following() && this.origin()?.label === MY_LOCATION);
  /** With no map in sight, only until the first reading: the list needs it to work out distances. */
  private readonly watching = computed(
    () => this.following() && (this.mapInSight() || this.searching()),
  );
  private watchId?: number;

  constructor() {
    effect(() => this.store.saveSetting('travelMode', this.travelMode()));
    effect(() => {
      if (this.watching()) this.watch();
      else this.stopWatching();
    });
    void this.restore();
    // While the app is hidden the browser stops telling, and it doesn't always resume on its own.
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (!document.hidden && this.watchId !== undefined) this.watch();
      });
  }

  useMyLocation(): void {
    if (!('geolocation' in navigator)) {
      this.fail('Tu navegador no permite obtener la ubicación: escribe una dirección.');
      return;
    }
    this.begin();
    this.following.set(true);
  }

  /**
   * Looks for the address, up to some 50 km around Castelló: with a number, first the exact portal
   * in the official street map; otherwise, in OpenStreetMap.
   */
  async search(address: string): Promise<void> {
    const q = address.trim();
    if (!q) return;
    this.begin();
    try {
      const place = (await this.portal(q)) ?? (await this.place(q));
      if (place) this.setOrigin({ ...place, label: q }, 'address');
      else this.fail(`No se ha encontrado «${q}» cerca de Castelló.`);
    } catch {
      this.fail('No se ha podido buscar la dirección. Inténtalo de nuevo.');
    }
  }

  clear(): void {
    this.following.set(false);
    this.lost.set(false);
    this.origin.set(null);
    this.error.set('');
    this.store.saveSetting('source', null);
  }

  /**
   * The browser tells when the location changes: there's nothing to ask for every so often. Once it's
   * known, a failure (no signal for a while) leaves it where it was, marked as lost, and the browser
   * keeps trying.
   */
  private watch(): void {
    this.stopWatching();
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords }) => this.moveTo(coords),
      () => {
        if (this.searching()) {
          this.following.set(false);
          this.fail('No se ha podido obtener tu ubicación: escribe una dirección.');
        } else {
          this.lost.set(true);
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  private stopWatching(): void {
    if (this.watchId !== undefined) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = undefined;
  }

  /** Less than it should move, or than the reading's own margin of error, isn't a move. */
  private moveTo({ latitude: lat, longitude: lng, accuracy }: GeolocationCoordinates): void {
    if (!this.following()) return; // It was removed and the watch hasn't stopped yet.
    this.lost.set(false);
    const origin = this.origin();
    const distance = origin?.label === MY_LOCATION && distanceMeters(origin, { lat, lng });
    if (distance !== false && distance < Math.max(MIN_MOVE, accuracy)) return;
    this.setOrigin({ lat, lng, label: MY_LOCATION }, 'geolocation');
  }

  private async restore(): Promise<void> {
    const source = this.store.setting<Source | null>('source');
    if (!source) return;
    if (source === 'geolocation' && !(await geolocationDenied())) {
      this.useMyLocation();
      return;
    }
    const address = this.store.setting<Origin>('address');
    if (address && !this.origin()) this.origin.set(address);
  }

  /**
   * The portal with one of the typed numbers and whose street was typed too: the street map
   * autocompletes what gets typed, so with «Mar 20» it suggests number 209 or, with «Herrero 49», also
   * number 49 of Isabel Ferrer. The one in Castelló; in another town, only if its name was typed (for
   * the whole province it gives just a few, alphabetically by town). If it fails, OpenStreetMap takes
   * over.
   */
  private async portal(q: string): Promise<Coordinates | undefined> {
    const numbers = (q.match(/\d+/g) ?? []).map(Number);
    if (!numbers.length) return undefined;
    const text = normalize(q);
    const matches = (candidate: Candidate) => {
      if (candidate.type !== 'portal' || !numbers.includes(candidate.portalNumber)) return false;
      const words = streetWords(candidate);
      return words.length > 0 && words.every((word) => text.includes(word));
    };
    try {
      const [inCastello, inProvince] = await Promise.all([
        this.candidates(q, { municipio_filter: MUNICIPALITY }),
        this.candidates(q, { provincia_filter: PROVINCE }),
      ]);
      const portal =
        inProvince.find((candidate) => matches(candidate) && wasTyped(candidate, text)) ??
        inCastello.find(matches);
      return portal && { lat: portal.lat, lng: portal.lng };
    } catch {
      return undefined;
    }
  }

  private async candidates(q: string, filter: Record<string, string>): Promise<Candidate[]> {
    const candidates = await firstValueFrom(
      this.http
        .get<Candidate[] | null>(CARTOCIUDAD, { params: { q, limit: 10, ...filter } })
        .pipe(timeout(CARTOCIUDAD_TIMEOUT)),
    );
    return candidates ?? [];
  }

  /**
   * A nearby town or neighborhood, even if something in Castelló shares its name (Sagunto street, the
   * Benicàssim road). Otherwise, whatever is in Castelló and, if there is nothing, around it.
   */
  private async place(q: string): Promise<Coordinates | undefined> {
    const nearby = await this.nominatim(q, SURROUNDINGS);
    const place =
      nearby && TOWNS.includes(nearby.category)
        ? nearby
        : ((await this.nominatim(q, VIEWBOX)) ?? nearby);
    return place && { lat: Number(place.lat), lng: Number(place.lon) };
  }

  private async nominatim(q: string, area: string): Promise<OsmPlace | undefined> {
    const results = await firstValueFrom(
      this.http.get<OsmPlace[]>('https://nominatim.openstreetmap.org/search', {
        params: {
          q,
          format: 'jsonv2',
          limit: 1,
          countrycodes: 'es',
          'accept-language': 'es',
          viewbox: area,
          bounded: 1,
        },
      }),
    );
    return results[0];
  }

  private begin(): void {
    this.searching.set(true);
    this.error.set('');
  }

  private setOrigin(origin: Origin, source: Source): void {
    this.origin.set(origin);
    this.searching.set(false);
    this.store.saveSetting('source', source);
    if (source === 'address') {
      this.following.set(false);
      this.store.saveSetting('address', origin);
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.searching.set(false);
  }
}

/** The words in the street's name: from "CALLE REY DON JAIME 80 D, Castelló…", rey, don, jaime. */
function streetWords({ address, tip_via }: Candidate): string[] {
  const street = normalize(address.split(',')[0]);
  const type = normalize(tip_via ?? '');
  return (street.startsWith(type) ? street.slice(type.length) : street)
    .replace(/ \d+.*$/, '')
    .split(' ')
    .filter(Boolean);
}

/** Whether the text includes the name of its municipality. */
function wasTyped({ muni }: Candidate, text: string): boolean {
  return normalize(muni)
    .split('/')
    .some((name) => text.includes(name));
}

/**
 * Only if it was refused for good. Safari on iOS, from the Home Screen above all, often forgets that
 * it was allowed and says it will ask: then it asks, rather than the app opening without it and the
 * route waiting for it to be asked for by hand. With no way to know, it asks too.
 */
async function geolocationDenied(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'denied';
  } catch {
    return false;
  }
}
