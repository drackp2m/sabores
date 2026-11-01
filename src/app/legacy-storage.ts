/**
 * What older versions of the app left on people's devices, and how to bring it over. Those versions
 * saved everything under Spanish names, which is why they appear here: this is the data as it exists
 * out there, not code to translate. Nothing else in the app knows about them. Once nobody can have
 * an old copy left, this file can go, along with the calls in store.ts, theme.ts and app.ts.
 */

const LEGACY_THEME_KEY = 'ruta-tapas:tema';
const LEGACY_VIEW_KEY = 'ruta-tapas:vista';

const STORES = { valoraciones: 'ratings', favoritos: 'favorites', ajustes: 'settings' };

const TRIED: Record<string, string> = {
  ninguna: 'none',
  alguna: 'some',
  pendientes: 'pending',
  todas: 'all',
};
const SORT: Record<string, string> = { numero: 'number', cercania: 'nearest', cierre: 'closing' };
const VIEW: Record<string, string> = { detalles: 'details', fotos: 'photos' };
const TRAVEL_MODE: Record<string, string> = { pie: 'walking', coche: 'driving' };
const SOURCE: Record<string, string> = { ubicacion: 'geolocation', direccion: 'address' };

const FILTER_KEYS: Record<string, string> = {
  texto: 'text',
  dia: 'day',
  desde: 'from',
  hasta: 'to',
  sinGluten: 'glutenFree',
  bebida: 'drink',
  rutaDeSabor: 'flavorRoute',
  favoritos: 'favorites',
  probadas: 'tried',
};

/** Empty values ('' or null) mean the same in both versions, so anything unknown stays as it is. */
function translated(names: Record<string, string>, value: unknown): unknown {
  return names[value as string] ?? value;
}

/** A saved setting under its current name and with its current values; undefined if it isn't old. */
export function translateSetting(key: string, value: unknown): [string, unknown] | undefined {
  switch (key) {
    case 'filtros': {
      const entries = Object.entries(value as Record<string, unknown>).map(([filter, setting]) => [
        FILTER_KEYS[filter] ?? filter,
        filter === 'probadas' ? translated(TRIED, setting) : setting,
      ]);
      return ['filters', Object.fromEntries(entries)];
    }
    case 'orden':
      return ['sort', translated(SORT, value)];
    case 'vista':
      return ['view', translated(VIEW, value)];
    case 'medio':
      return ['travelMode', translated(TRAVEL_MODE, value)];
    case 'fuente':
      return ['source', translated(SOURCE, value)];
    case 'direccion': {
      const { etiqueta, ...coordinates } = value as Record<string, unknown>;
      return ['address', { ...coordinates, label: etiqueta }];
    }
    default:
      return undefined;
  }
}

/**
 * Renames the stores of version 1 of the database and translates its settings. It runs inside the
 * upgrade transaction, which is all or nothing: if anything fails, the data stays as it was.
 */
export function migrateDatabase(transaction: IDBTransaction): void {
  for (const [legacy, current] of Object.entries(STORES)) {
    transaction.objectStore(legacy).name = current;
  }
  const settings = transaction.objectStore(STORES.ajustes);
  const keys = settings.getAllKeys();
  const values = settings.getAll();
  values.onsuccess = () => {
    keys.result.forEach((key, i) => {
      const setting = translateSetting(key as string, values.result[i]);
      if (!setting) return;
      settings.delete(key);
      settings.put(setting[1], setting[0]);
    });
  };
}

/** The theme chosen in an older version: 'light', 'dark' or null if there isn't one. */
export function legacyTheme(): string | null {
  const theme = localStorage.getItem(LEGACY_THEME_KEY);
  return theme === 'claro' ? 'light' : theme === 'oscuro' ? 'dark' : null;
}

/** The view chosen before it was kept in the store. */
export function legacyView(): 'details' | 'photos' {
  try {
    return localStorage.getItem(LEGACY_VIEW_KEY) === 'fotos' ? 'photos' : 'details';
  } catch {
    return 'details';
  }
}
