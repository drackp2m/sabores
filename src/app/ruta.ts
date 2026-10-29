import { Coordenadas, Medio } from './locales';

/** Puntos [lat, lng] del camino, tal como los dibuja Leaflet. */
export type Camino = [number, number][];

const PERFILES: Record<Medio, string> = {
  pie: 'routed-foot/route/v1/foot',
  coche: 'routed-car/route/v1/driving',
};

/** Una petición por trayecto: al volver a abrir el mismo local no se pide otra vez. */
const caminos = new Map<string, Promise<Camino | null>>();

/**
 * Camino más corto por calles (OSRM de openstreetmap.de, a pie o en coche) desde el punto de
 * partida hasta el local; null si el servicio no responde.
 */
export function buscarCamino(
  origen: Coordenadas,
  destino: Coordenadas,
  medio: Medio,
): Promise<Camino | null> {
  const puntos = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `https://routing.openstreetmap.de/${PERFILES[medio]}/${puntos}?overview=full&geometries=geojson`;
  let camino = caminos.get(url);
  if (!camino) {
    camino = fetch(url)
      .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
      .then((datos: { routes?: { geometry: { coordinates: [number, number][] } }[] } | null) =>
        datos?.routes?.[0]
          ? datos.routes[0].geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng])
          : null,
      )
      .catch(() => null);
    // Si falla, que se pueda reintentar más tarde.
    camino.then((c) => c ?? caminos.delete(url));
    caminos.set(url, camino);
  }
  return camino;
}

/** Cómo llegar en la app de mapas del sistema: Apple Maps en iPhone, iPad y Mac; Google Maps en el resto. */
export function enlaceComoLlegar(
  destino: Coordenadas,
  nombre: string,
  medio: Medio = 'pie',
): string {
  const punto = `${destino.lat},${destino.lng}`;
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) {
    const params = new URLSearchParams({
      daddr: punto,
      q: nombre,
      dirflg: medio === 'pie' ? 'w' : 'd',
    });
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({
    api: '1',
    destination: punto,
    travelmode: medio === 'pie' ? 'walking' : 'driving',
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
