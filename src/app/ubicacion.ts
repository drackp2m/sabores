import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Almacen } from './almacen';
import { Coordenadas, Medio, normalizar } from './locales';

export interface Origen extends Coordenadas {
  /** "Tu ubicación" o la dirección que se ha escrito. */
  etiqueta: string;
}

/** Zona de Castelló de la Plana (oeste, norte, este, sur), la misma que usa scripts/geocode.swift. */
const VIEWBOX = '-0.12,40.03,0.07,39.93';

/**
 * Callejero oficial (CartoCiudad, del IGN): tiene todos los portales, que a OpenStreetMap le faltan
 * en muchas calles (entonces da el centro de un tramo, y no siempre el mismo).
 */
const CARTOCIUDAD = 'https://www.cartociudad.es/geocoder/api/geocoder/candidates';
const MUNICIPIO = 'Castelló de la Plana/Castellón de la Plana';

interface Candidato {
  /** 'portal', 'callejero', 'toponimo'… */
  type: string;
  /** "CALLE HERRERO 49, Castelló de la Plana (…)". */
  address: string;
  /** "CALLE", "AVENIDA"… */
  tip_via: string | null;
  portalNumber: number;
  lat: number;
  lng: number;
}

/** De dónde salió el último punto de partida, para recuperarlo al volver a abrir la app. */
type Fuente = 'ubicacion' | 'direccion';

/**
 * Punto desde el que se calculan distancias y tiempos de llegada. Al abrir la app se recupera el
 * último: la ubicación del momento si se usaba y el navegador ya la tiene permitida; si no, la
 * última dirección buscada.
 */
@Injectable({ providedIn: 'root' })
export class Ubicacion {
  private readonly http = inject(HttpClient);
  private readonly almacen = inject(Almacen);

  readonly origen = signal<Origen | null>(null);
  /** Cómo se calcula el tiempo de llegada; '' = según la distancia. Se recuerda para la próxima vez. */
  readonly medio = signal<Medio | ''>(this.almacen.ajuste<Medio>('medio') ?? '');
  readonly buscando = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => this.almacen.guardarAjuste('medio', this.medio()));
    void this.recuperar();
  }

  usarMiUbicacion(): void {
    if (!('geolocation' in navigator)) {
      this.fallar('Tu navegador no permite obtener la ubicación: escribe una dirección.');
      return;
    }
    this.empezar();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        this.fijar(
          { lat: coords.latitude, lng: coords.longitude, etiqueta: 'Tu ubicación' },
          'ubicacion',
        ),
      () => this.fallar('No se ha podido obtener tu ubicación: escribe una dirección.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  /**
   * Busca la dirección: con número, primero el portal en el callejero oficial; si no, en
   * OpenStreetMap, primero dentro de Castelló y luego en toda España.
   */
  async buscar(direccion: string): Promise<void> {
    const q = direccion.trim();
    if (!q) return;
    this.empezar();
    try {
      const lugar =
        (await this.portal(q)) ??
        (await this.nominatim(q, true)) ??
        (await this.nominatim(q, false));
      if (lugar) this.fijar({ ...lugar, etiqueta: q }, 'direccion');
      else this.fallar(`No se ha encontrado «${q}».`);
    } catch {
      this.fallar('No se ha podido buscar la dirección. Inténtalo de nuevo.');
    }
  }

  quitar(): void {
    this.origen.set(null);
    this.error.set('');
    this.almacen.guardarAjuste('fuente', null);
  }

  private async recuperar(): Promise<void> {
    const fuente = this.almacen.ajuste<Fuente | null>('fuente');
    if (!fuente) return;
    if (fuente === 'ubicacion' && (await ubicacionPermitida())) {
      this.usarMiUbicacion();
      return;
    }
    const direccion = this.almacen.ajuste<Origen>('direccion');
    if (direccion && !this.origen()) this.origen.set(direccion);
  }

  /**
   * El portal en Castelló con alguno de los números escritos y cuya calle también se ha escrito: el
   * callejero completa lo que se teclea, y con «Mar 20» propone el 209 o, con «Herrero 49», también
   * el 49 de Isabel Ferrer. Si falla, se sigue con OpenStreetMap.
   */
  private async portal(q: string): Promise<Coordenadas | undefined> {
    const numeros = (q.match(/\d+/g) ?? []).map(Number);
    if (!numeros.length) return undefined;
    try {
      const candidatos = await firstValueFrom(
        this.http.get<Candidato[] | null>(CARTOCIUDAD, {
          params: { q, limit: 10, municipio_filter: MUNICIPIO },
        }),
      );
      const texto = normalizar(q);
      const portal = candidatos?.find((candidato) => {
        if (candidato.type !== 'portal' || !numeros.includes(candidato.portalNumber)) return false;
        const palabras = palabrasDeLaCalle(candidato);
        return palabras.length > 0 && palabras.every((palabra) => texto.includes(palabra));
      });
      return portal && { lat: portal.lat, lng: portal.lng };
    } catch {
      return undefined;
    }
  }

  private async nominatim(q: string, enCastello: boolean): Promise<Coordenadas | undefined> {
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
    const [lugar] = resultados;
    return lugar && { lat: Number(lugar.lat), lng: Number(lugar.lon) };
  }

  private empezar(): void {
    this.buscando.set(true);
    this.error.set('');
  }

  private fijar(origen: Origen, fuente: Fuente): void {
    this.origen.set(origen);
    this.buscando.set(false);
    this.almacen.guardarAjuste('fuente', fuente);
    if (fuente === 'direccion') this.almacen.guardarAjuste('direccion', origen);
  }

  private fallar(mensaje: string): void {
    this.error.set(mensaje);
    this.buscando.set(false);
  }
}

/** Las palabras del nombre de la calle: de "CALLE REY DON JAIME 80 D, Castelló…", rey, don, jaime. */
function palabrasDeLaCalle({ address, tip_via }: Candidato): string[] {
  const calle = normalizar(address.split(',')[0]);
  const via = normalizar(tip_via ?? '');
  return (calle.startsWith(via) ? calle.slice(via.length) : calle)
    .replace(/ \d+.*$/, '')
    .split(' ')
    .filter(Boolean);
}

/** Sin preguntar: solo si el permiso ya se ha dado (Safari en iOS, p. ej., lo vuelve a pedir). */
async function ubicacionPermitida(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted';
  } catch {
    return false;
  }
}
