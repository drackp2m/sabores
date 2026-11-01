# Plan de revisión: rendimiento, buenas prácticas y reutilización

Revisión de toda la app (`src/`, configuración, tests y CI) sobre `main` (cfd87cc), 30 oct 2026. Las
etapas van en el orden en que propongo hacerlas: primero lo que se nota (mapa y scroll), luego el
peso de la página y la carga, y al final la reorganización del código. Una etapa por commit, con
tests y build en verde y midiendo antes y después.

## Punto de partida

|                                      |                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Bundle inicial                       | 476 kB (125 kB transferidos). Leaflet ocupa 146,5 kB (32 %) y `@angular/forms`, 39,6 kB                                |
| DOM de «Detalles» con los 60 locales | **8.234 elementos**, 14.873 nodos (4.519 son comentarios de Angular)                                                   |
| …de ellos                            | estrellas de las miniaturas: 1.800 · horario plegado: 1.991 · chispas del corazón: 480 · 878 iconos con 1.373 `<path>` |
| Fotos                                | 120 JPG de 690×439 px, 11,2 MB (95 kB de media), siempre a tamaño completo                                             |
| Tests                                | 39, en verde                                                                                                           |
| TypeScript                           | sin `strict` ni `strictTemplates`, aunque los dos ya compilan sin errores                                              |

Lighthouse avisa a partir de unos 1.400 elementos; aquí hay casi seis veces más, y cada recálculo de
estilos o de layout los recorre todos.

## Lo que probablemente se nota en escritorio

1. **El mapa se recoloca solo** (etapa 1, ✅ resuelto). Repinta los marcadores y vuelve a
   encuadrarlos cada vez que le llega un array nuevo, aunque sean los mismos locales: al marcar un
   favorito, al valorar una tapa, con cada letra del buscador y, con el orden «Cierre más próximo»,
   cada 30 segundos. Se pierde el zoom, se cierra el popup y el mapa se anima hasta encuadrar otra
   vez.
2. **Se lee el layout en cada evento de scroll** (etapa 2, ✅ resuelto). Si en ese momento ha
   llegado una foto diferida o ha cambiado algo, el navegador tiene que recalcular los 8.000
   elementos en mitad del scroll.
3. **La cabecera salta** (etapa 2: arreglados los dos sospechosos, falta confirmarlo en Safari).
   Los sospechosos: la barra de scroll aparece y desaparece al filtrar (toda la página se mueve de
   lado) y el rebote elástico de Safari y Chrome en el Mac arrastra la cabecera y el mapa sticky.

---

## Mediciones

`pnpm measure` ([scripts/measure.mjs](scripts/measure.mjs)) compila la app y la abre en Chromium sin
ventana (1280×900), con los datos reales; `pnpm measure --cpu 4` hace lo mismo con la CPU cuatro veces
más lenta, más o menos como un móvil normal, y `--network`, con la red de un móvil regular (la de
Lighthouse: 1,6 Mbps y 150 ms). Las teselas del mapa no se piden a OpenStreetMap. Los
tiempos varían alrededor de un 20 % de una vez a otra, y los fotogramas lentos, más aún (de 6 a 13
en tres pasadas iguales); los recuentos de elementos y de cambios, no.

Con `--cpu 4`:

|                                                                   | Base (cfd87cc)     | Etapa 1            | Etapa 2            | Etapa 3            | Etapa 4             | Etapa 5             | Etapa 6            |
| ----------------------------------------------------------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------- | ------------------- | ------------------ |
| Primera ficha · LCP · bloqueo (≈ TBT)                             | 664 · 752 · 331 ms | 611 · 728 · 322 ms | 473 · 536 · 235 ms | 465 · 528 · 189 ms | 433 · 532 · 153 ms  | 402 · 492 · 137 ms  | 415 · 516 · 146 ms |
| Elementos en la página                                            | 8.287              | 8.287              | 8.288              | **3.508**          | 3.510               | 3.510               | 3.513              |
| Scroll de 52.000 px por la lista: trabajo (layouts)               | 2.162 ms (×112)    | 1.794 ms (×113)    | 1.711 ms (×112)    | 1.643 ms (×111)    | 1.809 ms (×107–116) | **1.624 ms** (×112) | 1.484 ms (×112)    |
| …de ello, JavaScript                                              | 63 ms              | 46 ms              | **24 ms**          | 26 ms              | 29 ms               | 24 ms               | 19 ms              |
| …fotogramas de más de 25 ms                                       | 29                 | 14                 | 8                  | 6–13               | 14                  | **8**               | 7                  |
| Favorito con un popup abierto: ¿sigue abierto? ¿se mueve el mapa? | no · sí            | **sí · no**        | sí · no            | sí · no            | sí · no             | sí · no             | sí · no            |
| …veces que se rehacen los marcadores                              | 1                  | **0**              | 0                  | 0                  | 0                   | 0                   | 0                  |
| Escribir «queso»: cambios en los marcadores                       | 5                  | **1**              | 1                  | 1                  | 1                   | 1                   | 1                  |

Los layouts que quedan en el scroll no son de la app, sino de las fotos diferidas al cargarse:
sin fotos, o en una segunda pasada con ellas ya cargadas, se quedan en 1–4. Cuestan medio
milisegundo cada uno.

La etapa 3 quita casi el 60 % de la página y baja el bloqueo del arranque, pero el scroll se queda
dentro del ruido: de esos 1.643 ms, solo 104 son JavaScript, estilos y layout. El resto es pintar,
que en este Chromium va por software, así que en un dispositivo real puede ser muy distinto.

Desde la etapa 4, el script sirve los ficheros comprimidos, como GitHub Pages, y espera a que el mapa
acabe de pintarse antes de medir el scroll, así que esa fila no se compara con las columnas
anteriores. En las mismas condiciones, las etapas 3 y 4 salen iguales (mediana de 6 pasadas: 1.805 y
1.809 ms, 13 y 14 fotogramas lentos). Con las fotos de la etapa 5 el scroll sí baja (mediana de 5
pasadas), seguramente porque hay muchos menos píxeles que decodificar.

Con `--cpu 4 --network` (mediana de 3 pasadas):

|                                 | Etapa 3                   | Etapas 4 y 5                     | Etapa 6                          |
| ------------------------------- | ------------------------- | -------------------------------- | -------------------------------- |
| JS inicial (transferido)        | 125,7 kB                  | **91,6 kB** + 37,6 kB de Leaflet | **96,9 kB** + 37,6 kB de Leaflet |
| `venues.json` empieza a bajar a | 1.172 ms, al acabar el JS | **177 ms**, a la vez que el JS   | 176 ms, a la vez que el JS       |
| Primera ficha                   | 1.618 ms                  | **1.311 ms**                     | 1.295 ms                         |
| LCP                             | 1.708 ms                  | **1.360 ms**                     | 1.336 ms                         |
| Marcadores del mapa             | 1.618 ms                  | 1.488 ms                         | 1.508 ms                         |
| Bloqueo                         | 172 ms                    | **122 ms**                       | 121 ms                           |

La etapa 6 no busca mejorar estas filas y salen dentro del ruido (mediana de 3 pasadas; ese mismo día,
la etapa 5 da 401 · 496 · 145 ms), con 5 kB más de JS por Signal Forms (decisión 6). Lo que cambia es
lo que pasa cada minuto: está en la propia etapa.

---

## Etapa 0 · Red de seguridad y medición base ✅

- [x] `strict`, `strictTemplates` y `typeCheckHostBindings` en [tsconfig.json](tsconfig.json):
      comprobado que ya compilan sin errores, así que con esto basta para que siga siendo así.
- [x] El recuento del DOM, como script: al final, en vez de un spec en jsdom, es `pnpm measure` en
      Chromium (ver «Mediciones»), que además mide el arranque, el scroll, el favorito con un popup
      abierto y el buscador.
- [x] Medición base en Chrome: la columna «Base» de la tabla. Lighthouse no está en el contenedor;
      el script mide el LCP y el tiempo de bloqueo (lo mismo que el TBT de Lighthouse).
- [x] Safari en el Mac con trackpad, scroll rápido arriba y abajo (rebote): probado por ti, junto
      con la etapa 2.

## Etapa 1 · Mapa estable ✅

**Qué pasa.** El efecto de [map.ts](src/app/map/map.ts) llama a `paint()`,
que hace `clearLayers()` y `fitBounds()` ([map.ts](src/app/map/map.ts)), cada
vez que `locales` es un array nuevo. `visibles` cambia de referencia mucho más a menudo que de
contenido:

- `filtrados` lee siempre `almacen.favoritos()` y `almacen.valoraciones()`
  ([app.ts](src/app/app.ts)), aunque no se esté filtrando por ellos.
- Con el orden por cierre depende de `estados`, que depende del reloj
  ([app.ts](src/app/app.ts)).
- Cada letra del buscador filtra al momento.

**Cambios.**

- [x] En `Mapa`, un `computed` con `equal` que compare los números de local (`situados`): solo se
      repinta y se encuadra cuando cambia el conjunto, no el orden ni la referencia.
- [x] Repintar por diferencias (quitar los que sobran, añadir los nuevos) en vez de `clearLayers()`:
      el popup abierto sigue abierto si su local sigue en el mapa.
- [x] Juntar el efecto de colores de los marcadores con el repintado, en vez de depender del orden
      en que se ejecutan los efectos («Tras pintar los marcadores»). De paso, solo se tocan las
      clases y el `zIndexOffset` que cambian.
- [x] `filtrados`: leer favoritos y valoraciones solo con su filtro activo (si no, `SIN_MARCAS`).
      Lo de IndexedDB se sigue cargando entero en memoria al arrancar, como antes; esto solo evita
      que marcar un favorito o valorar vuelva a filtrar la lista.
- [x] Buscador, como pediste: la lista filtra al momento y el mapa espera a que se deje de escribir
      500 ms (`MAP_DELAY`, con un `mapText` aparte); «Limpiar» lo cambia al momento. Escribir
      una letra cuesta unos 30 ms (60 ms con la CPU ×4), así que el retardo no hacía falta para la
      lista: lo que se notaba era el mapa encuadrando con cada letra. Lo de guardar en IndexedDB con
      cada tecla se queda así (es una escritura pequeña y asíncrona).
- [x] Extra: buscar un número (solo cifras) busca el local con ese número, no las direcciones que lo
      llevan; el texto de cada local ya normalizado se guarda la primera vez que se busca.
- [x] Un `ResizeObserver` en el contenedor que llama a `invalidateSize()` (sustituye al de
      ampliar o reducir).
- [x] El modo oscuro: el `filter` de cinco funciones sobre las teselas
      ([styles.scss](src/styles.scss)) no pesa. Medido por ti en el Mac (DevTools,
      ⌘⇧P → «Show Rendering» → «Frame Rendering Stats»), arrastrando el mapa: de 57 a 59 fps tanto
      en claro como en oscuro. Se mantiene.

**Comprobado.** [map.spec.ts](src/app/map/map.spec.ts) (nuevo; tres de sus cuatro tests fallaban
con el `map.ts` de antes) y un test en [app.spec.ts](src/app/app.spec.ts): marcar un favorito o
valorar no encuadra el mapa; buscar, sí, medio segundo después. En `pnpm measure`, el popup sigue
abierto al marcar el corazón.

## Etapa 2 · Scroll y cabecera ✅

**Qué pasa.**

- En cada evento de scroll, [app.ts](src/app/app.ts) hace tres `querySelector`,
  dos `getBoundingClientRect` y un `offsetHeight`, en el documento y en `app-root`.
- Escritorio: sin `scrollbar-gutter`, al quedarse la lista más corta que la pantalla desaparece la
  barra de scroll (con barras clásicas: Windows, Linux o macOS con «mostrar siempre») y la cabecera y
  la página saltan de lado.
- Escritorio: sin `overscroll-behavior`, el rebote al llegar arriba o abajo desplaza la cabecera y el
  mapa sticky. En pantallas táctiles ya está en `none` ([styles.scss](src/styles.scss)).
- Móvil: el `(touchstart)` y el `(touchmove)` del mapa ([map.ts](src/app/map/map.ts))
  se registran como no pasivos (Angular no pone `passive`), así que, si el dedo empieza encima del
  mapa, el scroll puede tener que esperar al hilo principal. No llaman a `preventDefault`.
- El `(document:click)` del menú ([app.ts](src/app/app.ts)) y el `(document:keydown)` del
  visor ([viewer.ts](src/app/viewer/viewer.ts)) lanzan una detección de cambios con cada
  clic y cada tecla, en cualquier parte de la página.

**Cambios.**

- [x] El botón «Subir» con un `IntersectionObserver` sobre un elemento centinela (`.scroll-top-mark`,
      con el alto del mapa, que pasa a ser la variable `--alto-mapa`) y el alto de la cabecera como
      margen, en vez del listener de scroll: ningún JS mientras se hace scroll. Comprobado en
      Chromium que aparece en el mismo punto que antes (±20 px) en escritorio, en el móvil y en la
      vista de fotos.
- [x] `scrollbar-gutter: stable` en `html` fuera de las pantallas táctiles.
- [x] `overscroll-behavior-y: none` en el documento también en escritorio.
- [x] Listeners táctiles del mapa registrados a mano con `{ passive: true }`. Comprobado con una
      pantalla táctil emulada: el aviso de «dos dedos» sale al arrastrar de lado y no en vertical.
- [x] Escuchar los clics y las teclas del documento solo con el menú o la foto abiertos (test nuevo:
      pinchar fuera cierra el menú y dentro no).
- [x] Probado por ti en Safari en el Mac, con el trackpad (rebote arriba y abajo) y con «Mostrar
      barras de desplazamiento: siempre», filtrando hasta que la lista quepa en la pantalla: la
      cabecera y el mapa no se mueven.

## Etapa 3 · Un DOM más ligero ✅

De 8.288 a 3.508 elementos y de 14.873 a 5.576 nodos, con las 60 fichas en «Detalles».

- [x] **Horario**: el `<dl>` con los siete días se crea la primera vez que se abre y ya se queda
      ([venue-card.html](src/app/venue-card/venue-card.html)): esos 1.991 elementos solo existen en
      las fichas en las que se mira el horario. La animación es la de siempre, también la primera vez.
- [x] **Estrellas de las miniaturas**: un solo elemento con dos máscaras SVG, el relleno de las
      valoradas debajo del contorno de las cinco, en vez de 15 nodos y un componente por foto.
      [Stars](src/app/stars/stars.ts) se queda solo para valorar en el visor. La pastilla,
      compartida en [styles.scss](src/styles.scss) (`.stars-pill`): tienen que coincidir
      para que las del visor crezcan desde las de la miniatura.
- [x] **Componente `TapaPhoto`** ([tapa-photo.ts](src/app/tapa-photo/tapa-photo.ts)): el botón, la foto,
      las estrellas, el `aria-label` y `ampliar()`, que estaban repetidos en las fichas y la galería,
      con sus estilos. Es el propio `<button appTapaPhoto>`, sin un elemento más alrededor, y la foto
      lleva `decoding="async"`.
- [x] **Corazón**: la onda y las 8 chispas solo existen mientras late
      ([favorite.ts](src/app/favorite/favorite.ts)).
- [x] **Iconos**: un sprite SVG con un `<symbol>` por icono, una sola vez en la página, y en cada
      `app-icon` un `<use>` ([icon.ts](src/app/icon/icon.ts)). `--icon-fill` y
      `--icon-stroke` siguen funcionando.
- [x] **«Ver más»**: un solo `ResizeObserver` para todos los textos
      ([collapsible.ts](src/app/collapsible/collapsible.ts)).
- [x] Las máscaras y los `<use>`, probados por ti en Safari, en el Mac y en el iPhone: se ven los
      iconos y las estrellas (sin valorar y valoradas), y al ampliar una foto las estrellas crecen
      desde la miniatura.

**Comprobado.** 51 tests (dos nuevos: el horario diferido y las chispas; se adapta el de los iconos).
En Chromium, con el ratón de verdad y comparando con `main`:

- Las estrellas miden y están donde estaban (78 × 17,9 px) con 0, 3 y 5. A 4× son iguales; a 1×, el
  contorno de las vacías se ve un poco más suave.
- El horario se anima también la primera vez, y dos pulsaciones seguidas lo dejan cerrado.
- El corazón tiene 8 chispas mientras late y ninguna después, también con tres pulsaciones seguidas.
- «Ver más» sale en los mismos casos que en `main` (1 botón a 1.280 px, 13 a 520 px) y se vuelve a
  medir al cambiar el ancho.
- Los iconos, también los del zoom del mapa, se dibujan; las fotos mantienen su aspecto y su zoom al
  pasar por encima.
- En la galería, la foto se amplía y el nombre abre el local. Ningún error en la consola.

## Etapa 4 · Arranque ✅

**Qué pasaba.** Todo iba en fila: se descargaba el JS (125 kB), se abría IndexedDB (con hasta 2 s de
espera, [app.config.ts](src/app/app.config.ts)), se creaba `App` y solo entonces se pedía
`venues.json`.

- [x] Los datos bajan a la vez que el JS: un `fetch` en [index.html](src/index.html) y `loadRouteData()`
      en [app.ts](src/app/app.ts) usa esa respuesta. Primero fue un `<link rel="preload">`, pero
      Safari no lo aprovecha: lo comprobaste en la pestaña Red, donde salía dos veces.
- [x] Leaflet bajo demanda: `loadLeaflet()` en [map.ts](src/app/map/map.ts), y lo que se creaba
      en los campos de la clase pasa a `createMap()`. Saca 150 kB del bundle inicial (de 480 a 340
      kB). En «Detalles» empieza a bajar al arrancar la app, sin esperar a los datos; en «Fotos», al
      abrir un local. `leaflet.css` se queda en los estilos globales. No uso `@defer` porque las
      fichas llaman a `mapa.enfocar()` a través de la referencia `#mapa`, que desde fuera del bloque
      diferido no se ve.
- [x] Dos casos nuevos por tener Leaflet aparte: si se pulsa «Ver en el mapa» antes de que llegue, lo
      hace en cuanto está; y si no se puede descargar, el mapa lo dice y el resto de la app funciona.
- [x] `resource` en vez de `toSignal(http.get().pipe(catchError))`, sin tener que distinguir entre
      `undefined` y `null`. Iba a ser `httpResource`, pero no puede usar la petición de index.html.
- [x] Probado por ti en Safari: en la pestaña Red, `venues.json` sale una sola vez.

**Comprobado.** En Chromium, con la app compilada:

- `venues.json` se pide una vez.
- En «Fotos», Leaflet no se descarga hasta abrir un local.
- Con la descarga de Leaflet bloqueada salen las 60 fichas y el aviso en el mapa; con 2,5 s de retraso,
  «Ver en el mapa» abre el popup cuando llega.

Ojo: en los tests Leaflet no llega igual que en el build de producción (ver `loadLeaflet`), así que
un fallo ahí no lo detectan los tests. Lo detectó `pnpm measure`, que usa la app compilada.

## Etapa 5 · Fotos ✅

**Qué pasaba.** Recorrer la lista entera descargaba 11,7 MB, normalmente con datos móviles y en mitad
de la ruta, siempre con la foto de 690 px.

|                              | JPG     | WebP       |
| ---------------------------- | ------- | ---------- |
| Una miniatura (500 px)       | 98 kB   | **16 kB**  |
| Una foto ampliada (690 px)   | 98 kB   | **29 kB**  |
| Recorrer toda la lista       | 11,7 MB | **1,9 MB** |
| Lo que se publica de `data/` | 11,8 MB | 5,8 MB     |

- [x] [scripts/photos.mjs](scripts/photos.mjs) (`pnpm photos`), con `sharp`: se ejecuta a mano al cambiar
      las fotos y las versiones se suben a git. WebP a 500 px (calidad 75) y a 690 px (calidad 80).
- [x] `photoUrl()` en [venues.ts](src/app/venues.ts): las miniaturas y los popups usan la de 500 y
      el visor, la de 690. Antes el visor reutilizaba el fichero ya descargado; ahora tiene detrás
      la de 500 mientras llega la grande, para que no se vea un hueco al ampliar.
- [x] Cambio sobre el plan: 500 px en vez de 360, y sin `srcset`. Un iPhone tiene 3 píxeles por cada
      uno de CSS: pide unos 430–500 px y con 360 acabaría bajando siempre la de 690. Con 500 valen
      todos los casos y basta un solo fichero para las miniaturas.
- [x] Los JPG se quedan en git como original, pero no se publican (`ignore` en
      [angular.json](angular.json)).
- [x] Probado por ti en Safari: las fotos se ven bien y, al ampliar con mala conexión, la foto aparece
      enseguida y luego gana nitidez.

**Comprobado.** En Chromium, las 120 fotos cargan y no se pide ningún JPG; la de 690 px solo se pide al
ampliar. Con esa descarga retrasada 2 s, el visor enseña la miniatura desde el primer momento. En
`pnpm measure` se puede ver lo que se descarga al recorrer la lista.

## Etapa 6 · Estado compartido y una `App` más pequeña

**Qué pasaba.** `App` (341 líneas) se ocupaba de los filtros, el orden, la vista, el historial, el
scroll y el reloj, y `statuses`, `arrivals` y `now` se pasaban como inputs a `VenueCard`, `VenueMap`,
`Gallery` y `ScheduleStatus` en cada sitio donde se usan. Ahora tiene 266.

- [x] Servicio `Clock` ([clock.ts](src/app/clock.ts)): `now` cambia al empezar cada minuto, en vez del
      `setInterval` de 30 s. Se pone al día al volver a la página, porque con el móvil bloqueado los
      temporizadores se paran.
- [x] Servicio `TapasRoute` ([tapas-route.ts](src/app/tapas-route.ts)) con `data`, `venues`, `statuses`
      y `arrivals`, que cada componente inyecta. `ScheduleStatus` solo recibe el número del local.
- [x] Cambio sobre el plan: no se reutiliza el objeto de cada local, porque no serviría de nada.
      `minutes` cambia cada minuto: en 16 momentos de dos días distintos, con los datos reales, no
      sale igual ninguno de los 60. Lo que sí se repite es lo que se ve: de un minuto al siguiente no
      cambió ningún color y el texto, en 8–52 locales. Por eso el mapa depende de `kinds`, un
      `computed` con los colores, y `ScheduleStatus` compara su texto antes de actualizarse.
- [x] Componente `FiltersPanel` ([filters.ts](src/app/filters/filters.ts)) y un único `signal<Filters>`
      en `App`, porque el formulario desaparece en la vista de un local y los filtros se quedan.
      Signal Forms sustituye las nueve señales, el `computed` y `clearFilters()`.
- [x] Cambio sobre el plan: `OriginPanel` y el selector de orden también dejan `FormsModule`. Con las
      dos librerías a la vez, el bundle inicial subía de 340 a 376 kB (ahora, 356 kB: decisión 6).
- [ ] Quitar [legacy-storage.ts](src/app/legacy-storage.ts), con sus llamadas en `store.ts`, `theme.ts`
      y `app.ts`, cuando nadie pueda tener ya datos de una versión anterior. Pendiente a propósito: la
      migración es de esta misma semana y la ruta sigue hasta el 7 de noviembre, así que quien no haya
      abierto la app desde entonces perdería sus valoraciones.
- [ ] Probar en Safari, en el Mac y en el iPhone, los filtros (sobre todo el selector de hora, con la
      hora que se superpone cuando falta una) y la dirección de partida: Signal Forms solo escucha
      `input`, y de momento solo se ha probado en Chromium.

Cada vez que cambia la hora, en «Detalles» y dejando la página quieta 125 s:

|                                  | Antes                   | Ahora                               |
| -------------------------------- | ----------------------- | ----------------------------------- |
| Cuándo                           | cada 30 s, a destiempo  | a los 10–20 ms de empezar el minuto |
| Clases tocadas en los marcadores | 300 cada vez            | **0**                               |
| Pastillas que cambian de texto   | 31, una vez de cada dos | 31                                  |
| JavaScript en total              | 57,7 ms                 | **17,8 ms**                         |

**Comprobado.** 81 tests (13 nuevos); rompiendo a propósito cada comportamiento nuevo (8 casos), los
tests fallan. En Chromium, con teclado y ratón de verdad:

- El mismo guion en el build anterior y en este, con 30 observaciones (buscar, día, horas, selectores,
  casillas, recargar, orden, dirección, abrir un local y volver), sin errores en la consola. Solo
  cambiaba una: al borrar un trozo de una hora se mantenía la última válida. Se corrigió después, en
  «Horas de los filtros» (arreglos fuera del plan), para que una hora a medias no se use.
- Una bebida guardada se recupera al recargar, aunque sus opciones lleguen después, con los datos.
- Filtros, orden, cabecera del horario y galería, idénticos píxel a píxel a 1.280 y 390 px.

Un cambio pequeño: el mapa ya no espera medio segundo si se vacía la búsqueda a mano; antes, solo con
«Limpiar».

## Etapa 7 · Reutilización y estilos ✅

Sin cambios de comportamiento: lo que había repetido pasa a un solo sitio.

- [x] El número del local: la clase global `.venue-number`, y `.small` en la galería
      ([\_badges.scss](src/styles/_badges.scss)), como `.stars-pill`. Sin componente, para no añadir
      nada a las 60 fichas por una pastilla sin lógica.
- [x] El tiempo de llegada: el componente `ArrivalTime` y `createArrivalTime()` para los popups
      ([arrival-time.ts](src/app/arrival-time/arrival-time.ts)), el mismo patrón que `Icon` y
      `createIcon`. Cambio sobre el plan: no se llama `Arrival` porque ese nombre ya es el del tipo de
      datos. Con `distance`, la distancia va al lado (galería); sin él, en el tooltip (ficha). El
      `@if` sigue fuera, en quien lo usa: un host vacío contaría para el `gap` de la fila.
- [x] `store.stars(venue, tapa)`. Quedaba en dos sitios, no en tres: `TapaPhoto` ya había juntado los
      de la ficha y la galería. De paso, fuera un `tapaKey` que el visor no usaba.
- [x] `animateHeight()` ([animate-height.ts](src/app/animate-height.ts)), con los keyframes, las
      duraciones (400 ms al abrir, 300 ms al plegar) y la curva `SETTLE`, que también usan el visor y el
      corazón. Cambio sobre el plan: medir la altura de partida y cancelar lo que estuviera en marcha
      se queda en cada sitio, porque ocurre antes de cambiar el estado y el horario parte de 0 con el
      `<details>` cerrado.
- [x] `reducedMotion()`, `isDesktop()` e `isTouch()` en [media.ts](src/app/media.ts).
- [x] [\_media.scss](src/styles/_media.scss) con los mixins `desktop`, `below-desktop`, `touch`,
      `reduced-motion` e `if-dark`, y `includePaths` en [angular.json](angular.json): un componente
      solo escribe `@use 'media'`. Solo tiene mixins, así que no añade CSS a quien lo usa; por eso
      `if-dark` vive aquí y no con el tema. Las media queries que solo aparecen una vez (menos de 375
      px y `hover: hover`) se quedan donde están.
- [x] [styles.scss](src/styles.scss) repartido en [src/styles/](src/styles/): `_theme`, `_base`,
      `_controls`, `_badges`, `_leaflet` y `_popups`, en el mismo orden que antes. `_badges`, que no
      estaba en el plan, es para las piezas pequeñas que comparten varios componentes.
- [x] Tests: un fixture común, [testing/venue.ts](src/testing/venue.ts) (`testVenue`, `testTapa` y
      `week`; había tres versiones de `venue()`, no dos), y los polyfills de jsdom en
      [testing/setup.ts](src/testing/setup.ts), con `setupFiles` en `angular.json`.

**Comprobado.** 99 tests (4 nuevos, de `ArrivalTime`) y build en verde. El CSS global compilado antes y
después solo cambia en lo esperado: `.venue-number` y `.arrival-time` son nuevas y `.popup-arrival`
pasa a `.popup-status .arrival-time`, con los mismos valores. No se ha repetido `pnpm measure` ni se
ha probado en un navegador: no toca lo que mide la tabla.

## Etapa 8 · Herramientas y limpieza

- [ ] ESLint con angular-eslint (el devcontainer recomienda la extensión, pero no hay
      configuración) y `prettier --check` en el CI, antes de los tests.
- [ ] Quitar [app.routes.ts](src/app/app.routes.ts) y `@angular/router`, que no se usan (salvo que se
      elija el router, en las decisiones).
- [ ] [.vscode/launch.json](.vscode/launch.json): «ng test» apunta a Karma (puerto 9876), que con
      Vitest ya no existe.

## Etapa 9 · `content-visibility` (opcional, según lo que midamos tras la etapa 3)

`content-visibility: auto` con `contain-intrinsic-size: auto <alto típico>` en `app-local-card` y en
las tarjetas de la galería: el navegador no calcula ni pinta las que están fuera de la pantalla.

Riesgos que hay que probar:

- `scrollIntoView` hacia una ficha lejana (al pinchar un marcador,
  [app.ts](src/app/app.ts)) calcula con alturas estimadas y puede quedarse corto.
- Si el navegador no ajusta el scroll al cambiar la altura de lo que hay por encima (scroll
  anchoring; Safari no lo hacía, hay que comprobarlo en la versión actual), subir por fichas que
  nunca se han pintado puede dar saltos.
- El «Ver más» se mide al entrar cada ficha en pantalla.

## Etapa 10 · Service worker (opcional)

La app se puede instalar pero no tiene service worker: sin conexión no abre, y GitHub Pages sirve
las fotos y el JSON con 10 minutos de caché (no llevan hash en el nombre), así que se vuelven a
validar a menudo. `@angular/service-worker` guardaría la app, `venues.json` y las fotos. El riesgo
es quedarse con una versión vieja: habría que avisar cuando haya una nueva.

## Arreglos fuera del plan

- [x] **Dirección de partida en el portal exacto.** OpenStreetMap no tiene los portales de muchas
      calles de Castelló (Herrero, entre ellas): con «Herrero 49» devolvía el centro de uno de los
      tramos de la calle, y no siempre el mismo (antes caía cerca de Picó por suerte; ahora, en La
      Fola). Ahora, si la dirección lleva número, primero se busca el portal en CartoCiudad (el
      callejero oficial, el mismo que usa `scripts/geocode.swift` para los locales). Solo vale si
      coinciden el número y la calle; si no, se sigue como antes con OpenStreetMap
      ([user-location.ts](src/app/user-location.ts), con tests en
      [user-location.spec.ts](src/app/user-location.spec.ts)). Probado en Chromium con los servicios reales:
      «Herrero 49» cae en el cruce con Picó.

- [x] **Dirección de partida hasta unos 50 km alrededor de Castelló**, en vez de toda España
      ([user-location.ts](src/app/user-location.ts)). Con número, el portal en Castelló, o en otro pueblo si se
      escribe su nombre («Santo Tomás 20 Benicasim», «Trinidad 5 Almassora»). Sin número, un pueblo o
      un barrio de los alrededores gana a lo que se llame igual en Castelló («Sagunto» ya no es la
      calle Sagunto); si no, Castelló y luego alrededor. Si no se encuentra, lo dice, en vez de poner
      el punto en Cuenca. CartoCiudad a veces tarda o no responde: a los 5 s se sigue con
      OpenStreetMap.
- [x] **Todo el código en inglés.** Identificadores, clases y variables CSS, comentarios, tests,
      ficheros, carpetas y comandos (`pnpm measure`, `pnpm photos`, `data/venues.json`,
      `data/photos/`); solo siguen en español los textos que muestra la app. `tapa` se queda, que
      también es la palabra en inglés. Lo guardado en los dispositivos pasa a la versión 2 de la base
      de datos al abrir la app, en una sola transacción
      ([legacy-storage.ts](src/app/legacy-storage.ts)); el nombre de la base de datos, `ruta-tapas`,
      se queda porque IndexedDB no permite cambiarlo.
- [x] **Commits con commitizen.** `commitizen`, `cz-emoji`, `commitlint` y `husky`, con la misma
      configuración que en chess-pecker ([.czrc](.czrc), [.commitlintrc.mjs](.commitlintrc.mjs) y
      [.husky/](.husky/)): `git commit` sin mensaje, o con uno que no vale, abre el asistente.
- [x] **Horas de los filtros.** Con solo «Desde», el rango llega hasta las 00:00 de esa noche (antes,
      valía solo esa hora exacta). Con solo «Hasta», empieza ahora si es para hoy y esa hora aún no ha
      pasado; si no, con el día, porque un inicio posterior al final no tendría sentido. La hora que
      falta se ve en gris dentro del campo y, si es «ahora», sigue al reloj; la lista solo se filtra de
      nuevo cuando cambia (`timeRange()` en [venues.ts](src/app/venues.ts)). `<input type="time">` no
      admite `placeholder`, así que se superpone en [time-field.ts](src/app/filters/time-field.ts), un
      control propio para Signal Forms. Una hora a medias ya no se usa: cuenta como vacía, lo escrito
      sigue en el campo para terminarlo y «Limpiar» lo borra, que antes no lo hacía. «Abierto ahora»
      pone la misma hora en los dos extremos, que sigue significando esa hora exacta. Los campos
      deshabilitados tienen fondo propio: con solo la opacidad eran una caja blanca sobre blanco.
      95 tests (14 nuevos) y 15 de 15 roturas a propósito detectadas. En Chromium, con teclado de
      verdad y horas en las que cada regla da un número distinto: el lunes desde las 12:00 salen 21
      locales (8 con la regla anterior), hasta las 15:30, 12, y con «Hasta» a medias, otra vez 21 (12
      con la anterior). Con el reloj congelado, a 1.280 y 390 px, lo único que cambia píxel a píxel
      son los dos campos deshabilitados. El JS inicial sube 0,5 kB, a 97,4 kB transferidos.

---

## Decisiones que te tocan

1. ~~**Fotos** (etapa 5)~~: resuelta, script con `sharp` a mano, versiones en git y WebP.
2. ~~**Mapa en oscuro** (etapa 1)~~: resuelta, el `filter` no pesa y se mantiene.
3. **Zoom bloqueado**: `user-scalable=no` y el bloqueo de `gesturestart` impiden ampliar la página,
   algo que las pautas de accesibilidad (WCAG 1.4.4) piden permitir. ¿Se mantiene?
4. **Router**: con `@angular/router`, cada local tendría su URL (`/local/12`, para compartirla) y
   sustituiría el `pushState` a mano ([app.ts](src/app/app.ts)). En GitHub Pages
   hace falta un `404.html` que cargue la app. No mejora el rendimiento; es una funcionalidad.
5. **Etapas 9 y 10**: ¿entran o no?
6. ~~**Signal Forms** (etapa 6)~~: resuelta, se mantiene por usar lo que ofrece Angular, aunque el JS
   inicial suba 5 kB transferidos.
