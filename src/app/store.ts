import { Injectable, signal } from '@angular/core';

import { migrateDatabase } from './legacy-storage';
import { tapaKey } from './venues';

/** IndexedDB can't rename a database: changing this would leave everyone's ratings behind. */
const DB_NAME = 'ruta-tapas';
const VERSION = 2;
/** Stars of each tapa (by tapaKey), favorite venues (by number) and settings (by name). */
const TABLES = ['ratings', 'favorites', 'settings'] as const;
type Table = (typeof TABLES)[number];
/** If the database doesn't answer within this time, the app starts without it (nothing gets saved). */
const MAX_WAIT = 2000;

/**
 * What gets saved on the device, in IndexedDB: the stars of each tapa, the favorite venues and the
 * settings (filters, sort order, view…). It is read in full at startup, before showing anything
 * (app.config.ts); from then on the app works with what is in memory and each change gets written
 * right away. Without IndexedDB (or if it fails), everything works the same, but only for the visit.
 */
@Injectable({ providedIn: 'root' })
export class Store {
  /** Stars (1–5) by tapaKey(); a tapa with no stars hasn't been tried. */
  readonly ratings = signal<ReadonlyMap<string, number>>(new Map());
  readonly favorites = signal<ReadonlySet<number>>(new Set());
  private readonly settings = new Map<string, unknown>();
  private db: IDBDatabase | null = null;

  async load(): Promise<void> {
    try {
      const db = await Promise.race([openDatabase(), wait(MAX_WAIT)]);
      if (!db) return;
      const [ratings, favorites, settings] = await readAll(db);
      this.ratings.set(new Map(ratings as [string, number][]));
      this.favorites.set(new Set(favorites.map(([number]) => number as number)));
      for (const [key, value] of settings) this.settings.set(key as string, value);
      // In case another tab with a newer version of the app needs to upgrade the database.
      db.onversionchange = () => {
        db.close();
        this.db = null;
      };
      this.db = db;
    } catch {
      // No IndexedDB (old browser, blocked storage…): in memory only.
    }
  }

  /** What was saved under that name, as it was saved (undefined if there is nothing). */
  setting<T>(key: string): T | undefined {
    return this.settings.get(key) as T | undefined;
  }

  saveSetting(key: string, value: unknown): void {
    this.settings.set(key, value);
    this.write('settings', (table) => table.put(value, key));
  }

  /** From 1 to 5 stars; 0 leaves it unrated (not tried). */
  rate(venue: number, tapa: number, stars: number): void {
    const key = tapaKey(venue, tapa);
    const ratings = new Map(this.ratings());
    if (stars) ratings.set(key, stars);
    else ratings.delete(key);
    this.ratings.set(ratings);
    this.write('ratings', (table) => (stars ? table.put(stars, key) : table.delete(key)));
  }

  toggleFavorite(venue: number): void {
    const favorites = new Set(this.favorites());
    const mark = !favorites.delete(venue);
    if (mark) favorites.add(venue);
    this.favorites.set(favorites);
    this.write('favorites', (table) => (mark ? table.put(true, venue) : table.delete(venue)));
  }

  /** Without waiting for it to finish: if it fails, the change stays in memory until the app closes. */
  private write(table: Table, change: (table: IDBObjectStore) => void): void {
    try {
      if (this.db) change(this.db.transaction(table, 'readwrite').objectStore(table));
    } catch {
      // The connection has closed (the browser cut it off, for example).
    }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion) migrateDatabase(request.transaction!);
      else for (const table of TABLES) request.result.createObjectStore(table);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Each table as [key, value] pairs, all in the same transaction. */
function readAll(db: IDBDatabase): Promise<[IDBValidKey, unknown][][]> {
  const transaction = db.transaction(TABLES, 'readonly');
  return Promise.all(
    TABLES.map(async (name) => {
      const table = transaction.objectStore(name);
      // Both requests go out now, before waiting: otherwise the transaction would close.
      const [keys, values] = await Promise.all([
        result(table.getAllKeys()),
        result(table.getAll()),
      ]);
      return keys.map((key, i): [IDBValidKey, unknown] => [key, values[i]]);
    }),
  );
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function wait(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
