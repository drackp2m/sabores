# Ruta de Tapas Sabores Castellón · Autumn 2026

Data extracted from `GUÍA OFICIAL 2026 DIGITAL.pdf` (15 Oct – 7 Nov 2026, tapa + drink €6).

```
data/
  venues.json           60 venues with their tapas, schedules and coordinates
  photos/NN-T.jpg       photo of each tapa (NN = venue number, T = 1 or 2); the original, out of the app
  photos/NN-T-500.webp  the version for thumbnails (generated with `pnpm photos`)
  photos/NN-T-690.webp  the version to view it enlarged
  geocode-cache.json    geocoding responses (avoids repeating requests)
  geocode-overrides.json  (optional) manual coordinates: {"45": {"lat": 39.98, "lng": -0.04}}
scripts/
  extract.swift         PDF → venues.json + photos
  geocode.swift         adds "location" to each venue
  measure.mjs           measures the built app in headless Chromium (`pnpm measure`)
  photos.mjs            JPG → WebP; run it when the photos change and commit the result
  safari.mjs            HTTPS proxy for Safari on the iPhone (`pnpm start:safari`)
```

## `venues.json` format

```jsonc
{
  "event": { "name", "edition", "startDate": "2026-10-15", "endDate": "2026-11-07", "price", "city" },
  "venues": [{
    "number": 1,
    "name": "ORIGEN",
    "subtitle": null,                    // e.g. "TASCA GASTRONÓMICA"
    "address": "C/ CARCAGENTE, 17",
    "phone": "641986169",
    "instagram": "@origen_castellon",    // null if it doesn't appear
    "drinks": [                          // without duplicates and in alphabetical order
      { "name": "Caña", "type": "Cerveza" },  // name: without synonyms (1/3 CERVEZA → Tercio…)
      { "name": "Tercio", "type": "Cerveza" } // type: the type the app filters by
    ],
    "notes": [],                         // notices: "SERVICIO SOLO EN TERRAZA", "31 DE OCT. NO HAY TAPAS"…
    "schedule": {                        // monday … sunday; [] = no tapas that day
      "monday": [{ "open": "12:00", "close": "16:00" }, { "open": "19:00", "close": "22:00" }]
      // "close": null → "until closing time"
    },
    "tapas": [{
      "number": 1,
      "name": "NIDO DE BOQUERÓN",
      "description": "…",
      "flavorRoute": false,              // "Castelló Ruta de Sabor" seal
      "glutenFree": "no",                // "yes" | "optional" (gluten-free on request) | "no"
      "photo": "photos/01-1.jpg"
    }],
    "location": {                        // null if it couldn't be geocoded
      "lat": 39.98, "lng": -0.03,
      "source": "cartociudad",           // cartociudad | nominatim | manual
      "precision": "portal"              // portal | street | place | manual
    },
    "page": 4                            // page in the PDF
  }]
}
```

## Regenerating the data

The scripts only use Swift + PDFKit, which come with macOS (nothing to install):

```sh
swift scripts/extract.swift "GUÍA OFICIAL 2026 DIGITAL.pdf" data
swift scripts/geocode.swift data
```

`extract.swift` overwrites `venues.json` without coordinates; `geocode.swift` adds them back from the cache.
Drinks are normalized with the `drinkNames` table in `extract.swift`: if the guide brings a new one, the
script warns so that it gets added there with its name and type.

## Web app (Angular)

Open the folder in VS Code → *Dev Containers: Reopen in Container* (with OrbStack running).

The first time, `.devcontainer/post-create.sh` generates the app with the latest Angular CLI (SCSS, no
SSR, pnpm), installs Leaflet for the OpenStreetMap map and configures `angular.json` to serve `data/` at
`/data` (e.g. `fetch('data/venues.json')`, `data/photos/01-1-500.webp`). Generated files don't overwrite
existing ones, so the code in `src/` is kept. If `package.json` already exists, it just runs `pnpm install`.

```sh
pnpm start          # ng serve --host 0.0.0.0 → http://localhost:4200
pnpm start:safari   # the same over HTTPS, for the iPhone on the local network → https://<mac>.local:4200
pnpm test           # unit tests
pnpm measure        # builds and measures it in Chromium (--cpu 4, --network, --json)
pnpm photos         # generates the WebP versions of the photos
```

Safari on the iPhone needs HTTPS with a certificate it trusts, served over HTTP/1.1 (it doesn't load with
the HTTP/2 of `ng serve --ssl`). `pnpm start:safari` ([scripts/safari.mjs](scripts/safari.mjs)) starts
`ng serve` on 4201 and puts in front of it, on 4200, a TLS proxy over HTTP/1.1 with the certificate in
`.cert/` (out of git). It gets generated once with [mkcert](https://github.com/FiloSottile/mkcert) in a Mac
terminal, not in the container's (`scutil` and `ipconfig` are macOS tools, and the CA the iPhone trusts is
the Mac's mkcert one), from the project folder:

```sh
mkdir -p .cert && mkcert -cert-file .cert/cert.pem -key-file .cert/key.pem \
  "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost
```

The iPhone has to trust mkcert's CA (`mkcert -CAROOT` → `rootCA.pem`: it gets installed as a profile and
enabled in Settings → General → About → Certificate Trust Settings), and VS Code has to forward the ports
to the whole network: `"remote.localPortHost": "allInterfaces"` in the user settings.

The terminal uses zsh with Powerlevel10k, zsh-autosuggestions and zsh-syntax-highlighting. Its
configuration is in `.devcontainer/zsh/` (`ZDOTDIR`): that's where `.p10k.zsh` (or run `p10k configure`),
`.aliases` and the history go. To install more packages: `sudo apk add …`.

The app shows the venues in a list and on a map, with filters by text (venue, tapa, ingredient, street or
drink), day and time range when they serve tapas («Abierto ahora» fills in day and time; with only one
end of the range, the other is shown in grey: up to midnight, or from now on), gluten-free tapas (or «bajo petición»), drink type and the Castelló Ruta de Sabor seal. Each tapa's seals are icons
(crossed-out wheat in green or amber and the route's logo, in `public/flavor-route.svg`) with a legend
above the list. Descriptions are clamped to three lines with «Ver más» and, on clicking a photo, it
enlarges from its place over the blurred background. Drinks, in the filter and on each card, go from most
to least common. Venues can be sorted by number, by distance (to the browser's location or to an address,
searched in the official street map or in OpenStreetMap/Nominatim; each card shows the rough arrival time,
on foot, by car or based on the distance) or by soonest closing (first those serving tapas now that close
soonest; then those opening soonest). Each card and each map popup say how long until it closes or opens.

If it closes before you can get there, the status shows in red.

The header switches between the «Detalles» view and the «Fotos» view: each venue's name with its seals,
the arrival time, the status and the photos, with the same filters. Clicking one opens its card with its
map, and the floating «Volver» button (or the browser's back button) returns to the gallery where it was
left.

Code, comments, file names and commands are in English; only the text the app shows is in Spanish.

```
src/app/
  venues.ts          types of venues.json and filtering logic (tests in venues.spec.ts)
  app.*              header, list and map, view and history
  tapas-route.ts     the route's data, each venue's schedule status and arrival time
  clock.ts           the current time, which changes as each minute starts
  store.ts           what's saved on the device: ratings, favorites and settings, in IndexedDB
  legacy-storage.ts  brings over what older versions saved (under Spanish names)
  theme.ts           light, dark or system theme
  user-location.ts   starting point: geolocation or an address searched for
  routing.ts         route along the streets and link to the maps app
  venue-card/        a venue's card with its tapas, notices and schedule
  gallery/           the «Fotos» view
  map/               Leaflet map with the filtered venues
  filters/           the filters' form
  origin/            panel to choose the starting point
  schedule-status/   «cierra en… / abre en…» (in red if you can't get there in time)
  seal/              gluten-free and Ruta de Sabor icons
  stars/             stars to rate a tapa
  favorite/          favorite heart
  tapa-photo/        a tapa's thumbnail, which enlarges in the viewer
  collapsible/       clamped text with «Ver más»
  viewer/            enlarged photo
  icon/              SVG icons
```

It can be installed as an app (*Add to Home Screen* on iPhone, *Install app* on Android):
`public/manifest.webmanifest` and the Apple tags in `src/index.html`. The icons (`public/icon-*.png`,
`apple-touch-icon.png`, `favicon.*`) are the «S» from `public/favicon.svg` exported to PNG; the *maskable*
version leaves margin for Android's round crop.

## Deployment

`.github/workflows/deploy.yml` runs the tests, builds and publishes `dist/tapas-route/browser` to GitHub
Pages on each push to `main` (or by hand, from the Actions tab). It's served at https://sabores.drackp2m.dev:

- On GitHub, *Settings → Pages*: *Source* = **GitHub Actions** and *Custom domain* = `sabores.drackp2m.dev`
  (publishing with Actions needs no `CNAME` file), with *Enforce HTTPS*.
- On Cloudflare, a `CNAME` record `sabores` → `drackp2m.github.io` in *DNS only* mode (gray cloud), so that
  GitHub can issue and renew the certificate.
