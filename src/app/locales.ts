/** Tipos de data/locales.json y lógica de filtrado y orden (sin dependencias de Angular). */

export type Dia =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

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

export interface Bebida {
  /** Nombre normalizado ("Tercio", "Copa de vino"…). */
  name: string;
  /** Tipo por el que se filtra ("Cerveza", "Vino"…). */
  type: string;
}

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface Local {
  number: number;
  name: string;
  subtitle: string | null;
  address: string;
  phone: string | null;
  instagram: string | null;
  /** En orden alfabético en locales.json; la app las ordena con ordenarBebidas(). */
  drinks: Bebida[];
  notes: string[];
  /** Un día sin franjas no sirve tapas. */
  schedule: Record<Dia, Franja[]>;
  tapas: Tapa[];
  location: Coordenadas | null;
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
  /** Rango 'HH:MM'; solo se tiene en cuenta si hay día. Sin "hasta", vale la hora exacta de "desde". */
  desde: string;
  hasta: string;
  /** 'yes': alguna tapa sin gluten; 'optional': también vale "sin gluten bajo petición". */
  sinGluten: '' | 'yes' | 'optional';
  /** Tipo de bebida (Bebida.type). */
  bebida: string;
  rutaDeSabor: boolean;
  /** Solo los locales marcados con el corazón. */
  favoritos: boolean;
  /** Según las tapas valoradas (las que tienen estrellas se dan por probadas). */
  probadas: Probadas;
}

/** 'pendientes': le queda alguna tapa sin probar; 'ninguna': no se ha probado ninguna; 'todas': ya están todas. */
export type Probadas = '' | 'pendientes' | 'ninguna' | 'todas';

export const SIN_FILTROS: Filtros = {
  texto: '',
  dia: '',
  desde: '',
  hasta: '',
  sinGluten: '',
  bebida: '',
  rutaDeSabor: false,
  favoritos: false,
  probadas: '',
};

/** Lo que ha marcado el usuario (almacen.ts): los locales favoritos y las estrellas de cada tapa. */
export interface Marcas {
  favoritos: ReadonlySet<number>;
  /** Por claveTapa(); sin entrada, sin probar. */
  valoraciones: ReadonlyMap<string, number>;
}

export const SIN_MARCAS: Marcas = { favoritos: new Set(), valoraciones: new Map() };

/** Una tapa se identifica por el número de su local y el suyo dentro de él (1 o 2). */
export function claveTapa(local: number, tapa: number): string {
  return `${local}-${tapa}`;
}

export function filtrarLocales(
  locales: readonly Local[],
  filtros: Filtros,
  marcas: Marcas = SIN_MARCAS,
): Local[] {
  const texto = normalizar(filtros.texto.trim());
  const { dia, desde, hasta, sinGluten, bebida, rutaDeSabor, favoritos, probadas } = filtros;
  return locales.filter(
    (local) =>
      (!favoritos || marcas.favoritos.has(local.number)) &&
      (!probadas || cumpleProbadas(local, probadas, marcas.valoraciones)) &&
      (!texto || textoDe(local).includes(texto)) &&
      (!dia || abiertoEntre(local.schedule[dia], desde, hasta)) &&
      (!sinGluten ||
        local.tapas.some(
          (t) =>
            t.glutenFree === 'yes' || (sinGluten === 'optional' && t.glutenFree === 'optional'),
        )) &&
      (!bebida || local.drinks.some((b) => b.type === bebida)) &&
      (!rutaDeSabor || local.tapas.some((t) => t.castelloRutaDeSabor)),
  );
}

function cumpleProbadas(
  local: Local,
  probadas: Exclude<Probadas, ''>,
  valoraciones: ReadonlyMap<string, number>,
): boolean {
  const probada = (t: Tapa) => valoraciones.has(claveTapa(local.number, t.number));
  switch (probadas) {
    case 'pendientes':
      return !local.tapas.every(probada);
    case 'ninguna':
      return !local.tapas.some(probada);
    case 'todas':
      return local.tapas.every(probada);
  }
}

/**
 * ¿Sirve tapas en algún momento entre "desde" y "hasta"? Sin "hasta", a la hora exacta de "desde"; sin
 * "desde", desde el principio del día. Sin ninguna, basta con que tenga alguna franja ese día.
 */
export function abiertoEntre(franjas: readonly Franja[], desde: string, hasta: string): boolean {
  if (!desde && !hasta) return franjas.length > 0;
  const inicio = desde ? minutos(desde) : 0;
  let fin = hasta ? minutos(hasta) : inicio;
  // "Hasta" antes que "desde": el rango pasa de medianoche, pero las franjas cuentan hasta las 24:00.
  if (fin < inicio) fin = FIN_DEL_DIA;
  return franjas.some((f) => {
    const [abre, cierra] = limites(f);
    return inicio === fin ? abre <= inicio && inicio < cierra : abre < fin && inicio < cierra;
  });
}

export function formatearFranjas(franjas: readonly Franja[]): string {
  if (!franjas.length) return 'Sin tapas';
  return franjas.map(formatearFranja).join(' · ');
}

function formatearFranja(franja: Franja): string {
  return `${franja.open}–${franja.close ?? 'cierre'}`;
}

/** Las franjas de un día en dos columnas, la de la mañana (o mediodía) y la de la tarde (o noche). */
export interface FranjasDia {
  manana: string | null;
  tarde: string | null;
}

/**
 * Reparte las franjas de un día para alinearlas en columnas: con dos, una en cada; con una sola, en
 * la de la mañana si empieza antes de las 15:00 y si no en la de la tarde.
 */
export function repartirFranjas(franjas: readonly Franja[]): FranjasDia {
  if (!franjas.length) return { manana: null, tarde: null };
  if (franjas.length === 1) {
    const texto = formatearFranja(franjas[0]);
    return franjas[0].open < '15:00'
      ? { manana: texto, tarde: null }
      : { manana: null, tarde: texto };
  }
  return {
    manana: formatearFranja(franjas[0]),
    tarde: franjas.slice(1).map(formatearFranja).join(' · '),
  };
}

/** Tipos de bebida con cuántos locales la sirven: primero los más habituales. */
export function tiposDeBebida(locales: readonly Local[]): { tipo: string; locales: number }[] {
  return [...contarLocales(locales, (b) => b.type)]
    .map(([tipo, locales]) => ({ tipo, locales }))
    .sort((a, b) => b.locales - a.locales || a.tipo.localeCompare(b.tipo, 'es'));
}

/** Ordena las bebidas de cada local por cuántos locales las sirven (las más habituales primero). */
export function ordenarBebidas(locales: readonly Local[]): Local[] {
  const cuenta = contarLocales(locales, (b) => b.name);
  return locales.map((local) => ({
    ...local,
    drinks: [...local.drinks].sort(
      (a, b) => cuenta.get(b.name)! - cuenta.get(a.name)! || a.name.localeCompare(b.name, 'es'),
    ),
  }));
}

function contarLocales(
  locales: readonly Local[],
  clave: (b: Bebida) => string,
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const local of locales) {
    for (const valor of new Set(local.drinks.map(clave))) {
      cuenta.set(valor, (cuenta.get(valor) ?? 0) + 1);
    }
  }
  return cuenta;
}

export function diaDe(fecha: Date): Dia {
  // getDay() empieza en domingo; DIAS, en lunes.
  return DIAS[(fecha.getDay() + 6) % 7].id;
}

/** Estado del horario de tapas en un momento dado. */
export interface Estado {
  abierto: boolean;
  /** Minutos hasta que deja de servir tapas (abierto) o empieza (cerrado); null: ya no abre más. */
  minutos: number | null;
  /** Abierto "hasta el cierre": no se sabe cuándo acaba (se cuenta hasta medianoche). */
  hastaElCierre?: boolean;
}

/** Busca la franja en curso o, si no hay, la próxima apertura dentro de las fechas de la ruta. */
export function estadoHorario(
  horario: Record<Dia, Franja[]>,
  ahora: Date,
  evento?: Pick<Evento, 'startDate' | 'endDate'>,
): Estado {
  const t = ahora.getHours() * 60 + ahora.getMinutes();
  for (let d = 0; d <= 7; d++) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + d);
    const iso = isoDe(fecha);
    if (evento && iso > evento.endDate) break;
    if (evento && iso < evento.startDate) continue;
    for (const f of horario[diaDe(fecha)]) {
      const [abre, cierra] = limites(f);
      if (d === 0 && abre <= t && t < cierra) {
        return { abierto: true, minutos: cierra - t, hastaElCierre: f.close === null };
      }
    }
    const aperturas = horario[diaDe(fecha)]
      .map((f) => minutos(f.open))
      .filter((abre) => d > 0 || abre > t);
    if (aperturas.length) {
      return { abierto: false, minutos: d * FIN_DEL_DIA + Math.min(...aperturas) - t };
    }
  }
  return { abierto: false, minutos: null };
}

/** "cierra en 1 h 20 min", "abre en 45 min", "abre mañana a las 12:00"… */
export function describirEstado(estado: Estado, ahora: Date): string {
  const { abierto, minutos } = estado;
  if (abierto)
    return estado.hastaElCierre ? 'hasta el cierre' : `cierra en ${formatearDuracion(minutos!)}`;
  if (minutos === null) return 'no hay más tapas';
  if (minutos < 12 * 60) return `abre en ${formatearDuracion(minutos)}`;
  const apertura = new Date(ahora.getTime() + minutos * 60_000);
  const dias = Math.round(
    (new Date(apertura).setHours(0, 0, 0, 0) - new Date(ahora).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  const cuando =
    dias === 0
      ? 'hoy'
      : dias === 1
        ? 'mañana'
        : `el ${DIAS.find((d) => d.id === diaDe(apertura))!.nombre.toLowerCase()}`;
  return `abre ${cuando} a las ${apertura.toTimeString().slice(0, 5)}`;
}

export type TipoEstado = 'abierto' | 'pronto' | 'tarde' | 'cerrado';

/**
 * Para el color: abierto, a punto de cerrar (30 min o menos), cierra antes de que dé tiempo a
 * llegar o cerrado.
 */
export function tipoEstado(estado: Estado, llegada?: Llegada | null): TipoEstado {
  const { abierto, minutos, hastaElCierre } = estado;
  if (!abierto) return 'cerrado';
  if (hastaElCierre) return 'abierto';
  if (llegada && minutos! < llegada.minutos) return 'tarde';
  return minutos! <= 30 ? 'pronto' : 'abierto';
}

/** Texto, color y aviso (si no da tiempo a llegar) de la pastilla de estado. */
export function pastillaEstado(
  estado: Estado,
  ahora: Date,
  llegada?: Llegada | null,
): { texto: string; tipo: TipoEstado; aviso: string } {
  const tipo = tipoEstado(estado, llegada);
  return {
    texto: describirEstado(estado, ahora),
    tipo,
    aviso:
      tipo === 'tarde'
        ? `Cierra antes de que llegues: tardas ${formatearDuracion(llegada!.minutos)}`
        : '',
  };
}

/** Clave para ordenar por cierre: primero los abiertos (los que cierran antes), luego los que abren antes. */
export function claveCierre(estado: Estado): number {
  if (estado.minutos === null) return Infinity;
  return estado.abierto ? estado.minutos : 8 * FIN_DEL_DIA + estado.minutos;
}

/** Ordena por la clave y, si empatan, por número de local. */
export function ordenarPor(locales: readonly Local[], clave: (local: Local) => number): Local[] {
  return [...locales].sort((a, b) => clave(a) - clave(b) || a.number - b.number);
}

export function formatearDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Distancia en línea recta (haversine). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type Medio = 'pie' | 'coche';

export interface Llegada {
  /** En línea recta. */
  metros: number;
  minutos: number;
  modo: Medio;
}

/**
 * Tiempo aproximado de llegada a pie (4,8 km/h) o en coche (25 km/h por ciudad). Sin medio, a pie
 * hasta 2,5 km en línea recta y en coche a partir de ahí. Las calles alargan el recorrido un 30–40 %.
 */
export function llegadaDesde(origen: Coordenadas, destino: Coordenadas, medio?: Medio): Llegada {
  const metros = distanciaMetros(origen, destino);
  const modo = medio ?? (metros <= 2500 ? 'pie' : 'coche');
  const recorrido = metros * (modo === 'pie' ? 1.3 : 1.4);
  const metrosPorMinuto = modo === 'pie' ? 80 : 417;
  return { metros, modo, minutos: Math.max(1, Math.round(recorrido / metrosPorMinuto)) };
}

export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
}

const FIN_DEL_DIA = 24 * 60;

/** Minutos desde medianoche de una franja; "hasta el cierre" o pasada la medianoche cuenta hasta las 24:00. */
function limites({ open, close }: Franja): [number, number] {
  const abre = minutos(open);
  return [abre, close === null || minutos(close) <= abre ? FIN_DEL_DIA : minutos(close)];
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isoDe(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function textoDe(local: Local): string {
  return normalizar(
    [
      local.name,
      local.subtitle,
      local.address,
      ...local.drinks.flatMap((b) => [b.name, b.type]),
      ...local.tapas.flatMap((t) => [t.name, t.description]),
    ].join(' '),
  );
}
