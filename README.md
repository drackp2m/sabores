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
    "drinks": [                         // sin repetidas y en orden alfabético
      { "name": "Caña", "type": "Cerveza" },  // name: sin sinónimos (1/3 CERVEZA → Tercio…)
      { "name": "Tercio", "type": "Cerveza" } // type: tipo por el que se filtra en la app
    ],
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
Las bebidas se normalizan con la tabla `drinkNames` de `extract.swift`: si la guía trae una nueva, el script
avisa para que se añada ahí con su nombre y tipo.

## Web app (Angular)

Abre la carpeta en VS Code → *Dev Containers: Reopen in Container* (con OrbStack en marcha).

La primera vez, `.devcontainer/post-create.sh` genera la app con la última versión de Angular CLI
(SCSS, sin SSR, pnpm), instala Leaflet para el mapa de OpenStreetMap y configura `angular.json` para
servir `data/` en `/data` (p. ej. `fetch('data/locales.json')`, `data/fotos/01-1.jpg`). Los ficheros
generados no sobrescriben los que ya existen, así que se conserva el código de `src/`. Si ya existe
`package.json`, solo hace `pnpm install`.

```sh
pnpm start          # ng serve --host 0.0.0.0 → http://localhost:4200
pnpm start:safari   # lo mismo por HTTPS, para el iPhone en la red local → https://<mac>.local:4200
pnpm test           # tests unitarios
```

Safari en el iPhone necesita HTTPS con un certificado en el que confíe, servido en HTTP/1.1 (con el
HTTP/2 de `ng serve --ssl` no carga). `pnpm start:safari` ([scripts/safari.mjs](scripts/safari.mjs))
arranca `ng serve` en el 4201 y pone delante, en el 4200, un proxy TLS en HTTP/1.1 con el
certificado de `.cert/` (fuera de git). Se genera una vez con [mkcert](https://github.com/FiloSottile/mkcert)
en una terminal del Mac, no en la del contenedor (`scutil` e `ipconfig` son de macOS, y la CA en la
que confía el iPhone es la del mkcert del Mac), desde la carpeta del proyecto:

```sh
mkdir -p .cert && mkcert -cert-file .cert/cert.pem -key-file .cert/key.pem \
  "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost
```

El iPhone tiene que confiar en la CA de mkcert (`mkcert -CAROOT` → `rootCA.pem`: se instala como
perfil y se activa en Ajustes → General → Información → Ajustes de confianza de certificados), y VS
Code tiene que reenviar los puertos a toda la red: `"remote.localPortHost": "allInterfaces"` en los
ajustes de usuario.

El terminal usa zsh con Powerlevel10k, zsh-autosuggestions y zsh-syntax-highlighting. Su
configuración está en `.devcontainer/zsh/` (`ZDOTDIR`): ahí van `.p10k.zsh` (o ejecuta
`p10k configure`), `.aliases` y el historial. Para instalar más paquetes: `sudo apk add …`.

La app muestra los locales en una lista y en un mapa, con filtros por texto (local, tapa,
ingrediente, calle o bebida), día y rango de horas en que sirven tapas («Abierto ahora» rellena
día y hora), tapas sin gluten (o «bajo petición»), tipo de bebida y sello Castelló Ruta de Sabor. Los
sellos de cada tapa son iconos (espiga tachada verde o ámbar y el logo de la ruta, en
`public/ruta-sabor.svg`) con una leyenda sobre la lista. Las descripciones se recortan a tres líneas con «Ver
más» y, al pinchar una foto, se amplía desde su sitio sobre el fondo desenfocado. Las bebidas, en el
filtro y en cada ficha, van de la más habitual a la menos. Se pueden ordenar por
número, por cercanía (a la ubicación del navegador o a una dirección, que se busca en
OpenStreetMap/Nominatim; cada ficha muestra el tiempo aproximado de llegada, a pie, en coche o según
la distancia) o por cierre más
próximo (primero los que sirven tapas ahora y cierran antes; luego los que abren antes). Cada ficha
y cada popup del mapa dicen cuánto falta para que cierre o abra.

Si cierra antes de que dé tiempo a llegar, el estado sale en rojo.

La cabecera cambia entre la vista «Detalles» y la vista «Fotos»: el nombre de cada local con sus
sellos, el tiempo de llegada, el estado y las fotos, con los mismos filtros. Al pinchar uno se abre su ficha con su mapa, y el botón flotante
«Volver» (o el botón atrás del navegador) regresa a la galería donde se dejó.

```
src/app/
  locales.ts      tipos de locales.json y lógica de filtrado (tests en locales.spec.ts)
  app.*           cabecera, filtros, lista y mapa
  ubicacion.ts    punto de partida: geolocalización o dirección buscada en Nominatim
  local-card/     ficha de un local con sus tapas, avisos y horario
  galeria/        vista «Fotos»
  mapa/           mapa Leaflet con los locales filtrados
  origen/         panel para elegir el punto de partida
  estado-horario/ «cierra en… / abre en…» (en rojo si no da tiempo a llegar)
  sello/          iconos de sin gluten y Ruta de Sabor
  plegable/       texto recortado con «Ver más»
  visor/          foto ampliada
  icono/          iconos SVG
```

Se puede instalar como app (*Añadir a pantalla de inicio* en el iPhone, *Instalar app* en Android):
`public/manifest.webmanifest` y las etiquetas de Apple en `src/index.html`. Los iconos (`public/icon-*.png`,
`apple-touch-icon.png`, `favicon.*`) son la «S» de `public/favicon.svg` exportada a PNG; la versión
*maskable* deja margen para el recorte redondo de Android.

## Despliegue

`.github/workflows/deploy.yml` pasa los tests, compila y publica `dist/ruta-tapas/browser` en GitHub Pages
con cada push a `main` (o a mano, desde la pestaña Actions). Se sirve en https://sabores.drackp2m.dev:

- En GitHub, *Settings → Pages*: *Source* = **GitHub Actions** y *Custom domain* = `sabores.drackp2m.dev`
  (al publicar con Actions no hace falta fichero `CNAME`), con *Enforce HTTPS*.
- En Cloudflare, un registro `CNAME` `sabores` → `drackp2m.github.io` en modo *DNS only* (nube gris), para
  que GitHub pueda emitir y renovar el certificado.

