import { Injectable, signal } from '@angular/core';

import { claveTapa } from './locales';

const NOMBRE = 'ruta-tapas';
const VERSION = 1;
/** Estrellas de cada tapa (por claveTapa), locales favoritos (por número) y ajustes (por nombre). */
const TABLAS = ['valoraciones', 'favoritos', 'ajustes'] as const;
type Tabla = (typeof TABLAS)[number];
/** Si la base de datos no responde en este tiempo, la app arranca sin ella (lo de esta visita no se guarda). */
const ESPERA_MAXIMA = 2000;

/**
 * Lo que se guarda en el dispositivo, en IndexedDB: las estrellas de cada tapa, los locales
 * favoritos y los ajustes (filtros, orden, vista…). Se lee entero al arrancar, antes de mostrar
 * nada (app.config.ts); a partir de ahí se trabaja con lo que hay en memoria y cada cambio se
 * escribe al momento. Sin IndexedDB (o si falla), funciona igual, pero solo durante la visita.
 */
@Injectable({ providedIn: 'root' })
export class Almacen {
  /** Estrellas (1–5) por claveTapa(); una tapa sin estrellas no se ha probado. */
  readonly valoraciones = signal<ReadonlyMap<string, number>>(new Map());
  readonly favoritos = signal<ReadonlySet<number>>(new Set());
  private readonly ajustes = new Map<string, unknown>();
  private bd: IDBDatabase | null = null;

  async cargar(): Promise<void> {
    try {
      const bd = await Promise.race([abrirBase(), esperar(ESPERA_MAXIMA)]);
      if (!bd) return;
      const [valoraciones, favoritos, ajustes] = await leerTodo(bd);
      this.valoraciones.set(new Map(valoraciones as [string, number][]));
      this.favoritos.set(new Set(favoritos.map(([numero]) => numero as number)));
      for (const [clave, valor] of ajustes) this.ajustes.set(clave as string, valor);
      // Si otra pestaña con una versión más nueva de la app necesita actualizar la base de datos.
      bd.onversionchange = () => {
        bd.close();
        this.bd = null;
      };
      this.bd = bd;
    } catch {
      // Sin IndexedDB (navegador antiguo, almacenamiento bloqueado…): solo en memoria.
    }
  }

  /** Lo guardado con ese nombre, tal cual se guardó (undefined si no hay nada). */
  ajuste<T>(clave: string): T | undefined {
    return this.ajustes.get(clave) as T | undefined;
  }

  guardarAjuste(clave: string, valor: unknown): void {
    this.ajustes.set(clave, valor);
    this.escribir('ajustes', (tabla) => tabla.put(valor, clave));
  }

  /** De 1 a 5 estrellas; 0 la deja sin valorar (sin probar). */
  valorar(local: number, tapa: number, estrellas: number): void {
    const clave = claveTapa(local, tapa);
    const valoraciones = new Map(this.valoraciones());
    if (estrellas) valoraciones.set(clave, estrellas);
    else valoraciones.delete(clave);
    this.valoraciones.set(valoraciones);
    this.escribir('valoraciones', (tabla) =>
      estrellas ? tabla.put(estrellas, clave) : tabla.delete(clave),
    );
  }

  alternarFavorito(local: number): void {
    const favoritos = new Set(this.favoritos());
    const marcar = !favoritos.delete(local);
    if (marcar) favoritos.add(local);
    this.favoritos.set(favoritos);
    this.escribir('favoritos', (tabla) => (marcar ? tabla.put(true, local) : tabla.delete(local)));
  }

  /** Sin esperar a que acabe: si falla, el cambio se queda en memoria hasta que se cierre la app. */
  private escribir(tabla: Tabla, cambio: (tabla: IDBObjectStore) => void): void {
    try {
      if (this.bd) cambio(this.bd.transaction(tabla, 'readwrite').objectStore(tabla));
    } catch {
      // La conexión se ha cerrado (p. ej. el navegador la ha cortado).
    }
  }
}

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const peticion = indexedDB.open(NOMBRE, VERSION);
    peticion.onupgradeneeded = () => {
      for (const tabla of TABLAS) peticion.result.createObjectStore(tabla);
    };
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => ko(peticion.error);
  });
}

/** Cada tabla como pares [clave, valor], todas en la misma transacción. */
function leerTodo(bd: IDBDatabase): Promise<[IDBValidKey, unknown][][]> {
  const transaccion = bd.transaction(TABLAS, 'readonly');
  return Promise.all(
    TABLAS.map(async (nombre) => {
      const tabla = transaccion.objectStore(nombre);
      // Las dos peticiones se hacen ya, antes de esperar: si no, la transacción se cerraría.
      const [claves, valores] = await Promise.all([
        resultado(tabla.getAllKeys()),
        resultado(tabla.getAll()),
      ]);
      return claves.map((clave, i): [IDBValidKey, unknown] => [clave, valores[i]]);
    }),
  );
}

function resultado<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => {
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => ko(peticion.error);
  });
}

function esperar(ms: number): Promise<null> {
  return new Promise((ok) => setTimeout(() => ok(null), ms));
}
