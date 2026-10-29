import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Coordenadas, Medio } from './locales';

export interface Origen extends Coordenadas {
  /** "Tu ubicación" o la dirección que se ha escrito. */
  etiqueta: string;
}

/** Zona de Castelló de la Plana (oeste, norte, este, sur), la misma que usa scripts/geocode.swift. */
const VIEWBOX = '-0.12,40.03,0.07,39.93';

/** Punto desde el que se calculan distancias y tiempos de llegada. */
@Injectable({ providedIn: 'root' })
export class Ubicacion {
  private readonly http = inject(HttpClient);

  readonly origen = signal<Origen | null>(null);
  /** Cómo se calcula el tiempo de llegada; '' = según la distancia. */
  readonly medio = signal<Medio | ''>('');
  readonly buscando = signal(false);
  readonly error = signal('');

  usarMiUbicacion(): void {
    if (!('geolocation' in navigator)) {
      this.fallar('Tu navegador no permite obtener la ubicación: escribe una dirección.');
      return;
    }
    this.empezar();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        this.fijar({ lat: coords.latitude, lng: coords.longitude, etiqueta: 'Tu ubicación' }),
      () => this.fallar('No se ha podido obtener tu ubicación: escribe una dirección.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  /** Busca la dirección en OpenStreetMap, primero dentro de Castelló y luego en toda España. */
  async buscar(direccion: string): Promise<void> {
    const q = direccion.trim();
    if (!q) return;
    this.empezar();
    try {
      const lugar = (await this.nominatim(q, true)) ?? (await this.nominatim(q, false));
      if (lugar) this.fijar({ lat: Number(lugar.lat), lng: Number(lugar.lon), etiqueta: q });
      else this.fallar(`No se ha encontrado «${q}».`);
    } catch {
      this.fallar('No se ha podido buscar la dirección. Inténtalo de nuevo.');
    }
  }

  quitar(): void {
    this.origen.set(null);
    this.error.set('');
  }

  private async nominatim(
    q: string,
    enCastello: boolean,
  ): Promise<{ lat: string; lon: string } | undefined> {
    const resultados = await firstValueFrom(
      this.http.get<{ lat: string; lon: string }[]>('https://nominatim.openstreetmap.org/search', {
        params: {
          q,
          format: 'jsonv2',
          limit: 1,
          countrycodes: 'es',
          'accept-language': 'es',
          viewbox: VIEWBOX,
          bounded: enCastello ? 1 : 0,
        },
      }),
    );
    return resultados[0];
  }

  private empezar(): void {
    this.buscando.set(true);
    this.error.set('');
  }

  private fijar(origen: Origen): void {
    this.origen.set(origen);
    this.buscando.set(false);
  }

  private fallar(mensaje: string): void {
    this.error.set(mensaje);
    this.buscando.set(false);
  }
}
