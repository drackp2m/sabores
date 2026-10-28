/** Tipos de data/locales.json y lógica de filtrado (sin dependencias de Angular). */

export type Dia = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Franja {
  open: string;
  /** null = "hasta el cierre". */
  close: string | null;
}

export interface Tapa {
  number: number;
  name: string;
  description: string;
  photo: string;
  glutenFree: 'yes' | 'optional' | 'no';
  castelloRutaDeSabor: boolean;
}

export interface Local {
  number: number;
  name: string;
  subtitle: string | null;
  address: string;
  phone: string | null;
  instagram: string | null;
  drinks: string[];
  notes: string[];
  /** Un día sin franjas no sirve tapas. */
  schedule: Record<Dia, Franja[]>;
  tapas: Tapa[];
  location: { lat: number; lng: number } | null;
}

export interface Evento {
  name: string;
  edition: string;
  startDate: string;
  endDate: string;
  price: string;
  city: string;
}

export interface DatosRuta {
  event: Evento;
  locales: Local[];
}

export const DIAS: readonly { id: Dia; nombre: string }[] = [
  { id: 'monday', nombre: 'Lunes' },
  { id: 'tuesday', nombre: 'Martes' },
  { id: 'wednesday', nombre: 'Miércoles' },
  { id: 'thursday', nombre: 'Jueves' },
  { id: 'friday', nombre: 'Viernes' },
  { id: 'saturday', nombre: 'Sábado' },
  { id: 'sunday', nombre: 'Domingo' },
];

export interface Filtros {
  /** Busca en nombre, dirección, bebidas y tapas, sin distinguir acentos ni mayúsculas. */
  texto: string;
  dia: Dia | '';
  /** 'HH:MM'; solo se tiene en cuenta si hay día. */
  hora: string;
  /** 'yes': alguna tapa sin gluten; 'optional': también vale "sin gluten bajo petición". */
  sinGluten: '' | 'yes' | 'optional';
  rutaDeSabor: boolean;
}

export const SIN_FILTROS: Filtros = {
  texto: '',
  dia: '',
  hora: '',
  sinGluten: '',
  rutaDeSabor: false,
};

export function filtrarLocales(locales: readonly Local[], filtros: Filtros): Local[] {
  const texto = normalizar(filtros.texto.trim());
  const { dia, hora, sinGluten, rutaDeSabor } = filtros;
  return locales.filter(
    (local) =>
      (!texto || textoDe(local).includes(texto)) &&
      (!dia || abiertoA(local.schedule[dia], hora)) &&
      (!sinGluten ||
        local.tapas.some(
          (t) => t.glutenFree === 'yes' || (sinGluten === 'optional' && t.glutenFree === 'optional'),
        )) &&
      (!rutaDeSabor || local.tapas.some((t) => t.castelloRutaDeSabor)),
  );
}

/** ¿Sirve tapas a esa hora? Sin hora, basta con que tenga alguna franja ese día. */
export function abiertoA(franjas: readonly Franja[], hora: string): boolean {
  if (!hora) return franjas.length > 0;
  const t = minutos(hora);
  return franjas.some(({ open, close }) => {
    const desde = minutos(open);
    // "Hasta el cierre" o cierre pasada la medianoche: cuenta hasta el final del día.
    const hasta = close === null || minutos(close) <= desde ? 24 * 60 : minutos(close);
    return desde <= t && t < hasta;
  });
}

export function formatearFranjas(franjas: readonly Franja[]): string {
  if (!franjas.length) return 'Sin tapas';
  return franjas.map((f) => `${f.open}–${f.close ?? 'cierre'}`).join(' · ');
}

export function diaDe(fecha: Date): Dia {
  // getDay() empieza en domingo; DIAS, en lunes.
  return DIAS[(fecha.getDay() + 6) % 7].id;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function textoDe(local: Local): string {
  return normalizar(
    [
      local.name,
      local.subtitle,
      local.address,
      ...local.drinks,
      ...local.tapas.flatMap((t) => [t.name, t.description]),
    ].join(' '),
  );
}
