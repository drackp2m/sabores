import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { Store } from './store';
import { Coordinates, TravelMode, normalize } from './venues';

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

/** Where the last starting point came from, to recover it when the app opens again. */
type Source = 'geolocation' | 'address';

/**
 * Point from which distances and arrival times are calculated. The last one is recovered when the
 * app opens: the current location if that's what was used and the browser already allows it;
 * otherwise, the last address searched for.
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

  constructor() {
    effect(() => this.store.saveSetting('travelMode', this.travelMode()));
    void this.restore();
  }

  useMyLocation(): void {
    if (!('geolocation' in navigator)) {
      this.fail('Tu navegador no permite obtener la ubicación: escribe una dirección.');
      return;
    }
    this.begin();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        this.setOrigin(
          { lat: coords.latitude, lng: coords.longitude, label: 'Tu ubicación' },
          'geolocation',
        ),
      () => this.fail('No se ha podido obtener tu ubicación: escribe una dirección.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
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
    this.origin.set(null);
    this.error.set('');
    this.store.saveSetting('source', null);
  }

  private async restore(): Promise<void> {
    const source = this.store.setting<Source | null>('source');
    if (!source) return;
    if (source === 'geolocation' && (await geolocationAllowed())) {
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
    if (source === 'address') this.store.saveSetting('address', origin);
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

/** Without asking: only if permission was already given (Safari on iOS, say, asks again). */
async function geolocationAllowed(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted';
  } catch {
    return false;
  }
}
