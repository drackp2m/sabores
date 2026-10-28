# Ruta de Tapas Sabores Castellón · Otoño 2026

Datos extraídos de `GUÍA OFICIAL 2026 DIGITAL.pdf` (15 oct – 7 nov 2026, tapa + bebida 6 €).

```
data/
  locales.json          60 locales con sus tapas, horarios y coordenadas
  fotos/NN-T.jpg        foto de cada tapa (NN = nº de local, T = 1 o 2)
  geocode-cache.json    respuestas de geocodificación (evita repetir peticiones)
  geocode-overrides.json  (opcional) coordenadas manuales: {"45": {"lat": 39.98, "lng": -0.04}}
scripts/
  extract.swift         PDF → locales.json + fotos
  geocode.swift         añade "location" a cada local
```

## Formato de `locales.json`

```jsonc
{
  "event": { "name", "edition", "startDate": "2026-10-15", "endDate": "2026-11-07", "price", "city" },
  "locales": [{
    "number": 1,
    "name": "ORIGEN",
    "subtitle": null,                    // p. ej. "TASCA GASTRONÓMICA"
    "address": "C/ CARCAGENTE, 17",
    "phone": "641986169",
    "instagram": "@origen_castellon",    // null si no aparece
    "drinks": ["COPA DE VINO", "CAÑA", "TERCIO"],
    "notes": [],                         // avisos: "SERVICIO SOLO EN TERRAZA", "31 DE OCT. NO HAY TAPAS"…
    "schedule": {                        // monday … sunday; [] = ese día no sirve tapas
      "monday": [{ "open": "12:00", "close": "16:00" }, { "open": "19:00", "close": "22:00" }]
      // "close": null → "hasta el cierre"
    },
    "tapas": [{
      "number": 1,
      "name": "NIDO DE BOQUERÓN",
      "description": "…",
      "photo": "fotos/01-1.jpg",
      "glutenFree": "no",                // "yes" | "optional" (sin gluten bajo petición) | "no"
      "castelloRutaDeSabor": false       // sello "Castelló Ruta de Sabor"
    }],
    "location": {                        // null si no se pudo geocodificar
      "lat": 39.98, "lng": -0.03,
      "source": "cartociudad",           // cartociudad | nominatim | manual
      "precision": "portal"              // portal | street | place | manual
    },
    "page": 4                            // página del PDF
  }]
}
```

## Regenerar los datos

Los scripts usan solo Swift + PDFKit, que ya vienen con macOS (no hay que instalar nada):

```sh
swift scripts/extract.swift "GUÍA OFICIAL 2026 DIGITAL.pdf" data
swift scripts/geocode.swift data
```

`extract.swift` sobrescribe `locales.json` sin coordenadas; `geocode.swift` las vuelve a añadir desde la caché.

## Web app (Angular)

Abre la carpeta en VS Code → *Dev Containers: Reopen in Container* (con OrbStack en marcha).

La primera vez, `.devcontainer/post-create.sh` genera la app con la última versión de Angular CLI
(SCSS, sin SSR, pnpm), instala Leaflet para el mapa de OpenStreetMap y configura `angular.json` para
servir `data/` en `/data` (p. ej. `fetch('data/locales.json')`, `data/fotos/01-1.jpg`). Los ficheros
generados no sobrescriben los que ya existen, así que se conserva el código de `src/`. Si ya existe
`package.json`, solo hace `pnpm install`.

```sh
pnpm start   # ng serve --host 0.0.0.0 → http://localhost:4200
pnpm test    # tests unitarios
```

El terminal usa zsh con Powerlevel10k, zsh-autosuggestions y zsh-syntax-highlighting. Su
configuración está en `.devcontainer/zsh/` (`ZDOTDIR`): ahí van `.p10k.zsh` (o ejecuta
`p10k configure`), `.aliases` y el historial. Para instalar más paquetes: `sudo apk add …`.

La app muestra los locales en una lista y en un mapa, con filtros por texto (local, tapa,
ingrediente, calle o bebida), día y hora en que sirven tapas («Abierto ahora» rellena ambos),
tapas sin gluten y sello Castelló Ruta de Sabor.

```
src/app/
  locales.ts      tipos de locales.json y lógica de filtrado (tests en locales.spec.ts)
  app.*           cabecera, filtros, lista y mapa
  local-card/     ficha de un local con sus tapas, avisos y horario
  mapa/           mapa Leaflet con los locales filtrados
```
