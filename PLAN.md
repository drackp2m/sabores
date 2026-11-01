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

`pnpm medir` ([scripts/medir.mjs](scripts/medir.mjs)) compila la app y la abre en Chromium sin
ventana (1280×900), con los datos reales; `pnpm medir --cpu 4` hace lo mismo con la CPU cuatro veces
más lenta, más o menos como un móvil normal. Las teselas del mapa no se piden a OpenStreetMap. Los
tiempos varían alrededor de un 20 % de una vez a otra, y los fotogramas lentos, más aún (de 6 a 13
en tres pasadas iguales); los recuentos de elementos y de cambios, no.

Con `--cpu 4`:

|                                                                   | Base (cfd87cc)     | Etapa 1            | Etapa 2            | Etapa 3            |
| ----------------------------------------------------------------- | ------------------ | ------------------ | ------------------ | ------------------ |
| Primera ficha · LCP · bloqueo (≈ TBT)                             | 664 · 752 · 331 ms | 611 · 728 · 322 ms | 473 · 536 · 235 ms | 465 · 528 · 189 ms |
| Elementos en la página                                            | 8.287              | 8.287              | 8.288              | **3.508**          |
| Scroll de 52.000 px por la lista: trabajo (layouts)               | 2.162 ms (×112)    | 1.794 ms (×113)    | 1.711 ms (×112)    | 1.643 ms (×111)    |
| …de ello, JavaScript                                              | 63 ms              | 46 ms              | **24 ms**          | 26 ms              |
| …fotogramas de más de 25 ms                                       | 29                 | 14                 | 8                  | 6–13               |
| Favorito con un popup abierto: ¿sigue abierto? ¿se mueve el mapa? | no · sí            | **sí · no**        | sí · no            | sí · no            |
| …veces que se rehacen los marcadores                              | 1                  | **0**              | 0                  | 0                  |
| Escribir «queso»: cambios en los marcadores                       | 5                  | **1**              | 1                  | 1                  |

Los layouts que quedan en el scroll no son de la app, sino de las fotos diferidas al cargarse:
sin fotos, o en una segunda pasada con ellas ya cargadas, se quedan en 1–4. Cuestan medio
milisegundo cada uno.

La etapa 3 quita casi el 60 % de la página y baja el bloqueo del arranque, pero el scroll se queda
dentro del ruido: de esos 1.643 ms, solo 104 son JavaScript, estilos y layout. El resto es pintar,
que en este Chromium va por software, así que en un dispositivo real puede ser muy distinto.

---

## Etapa 0 · Red de seguridad y medición base ✅

- [x] `strict`, `strictTemplates` y `typeCheckHostBindings` en [tsconfig.json](tsconfig.json):
      comprobado que ya compilan sin errores, así que con esto basta para que siga siendo así.
- [x] El recuento del DOM, como script: al final, en vez de un spec en jsdom, es `pnpm medir` en
      Chromium (ver «Mediciones»), que además mide el arranque, el scroll, el favorito con un popup
      abierto y el buscador.
- [x] Medición base en Chrome: la columna «Base» de la tabla. Lighthouse no está en el contenedor;
      el script mide el LCP y el tiempo de bloqueo (lo mismo que el TBT de Lighthouse).
- [ ] **Te toca**: Safari en el Mac con trackpad, scroll rápido arriba y abajo (rebote), para
      comparar con la etapa 2.

## Etapa 1 · Mapa estable ✅

**Qué pasa.** El efecto de [mapa.ts:357-361](src/app/mapa/mapa.ts#L357-L361) llama a `pintar()`,
que hace `clearLayers()` y `fitBounds()` ([mapa.ts:425-452](src/app/mapa/mapa.ts#L425-L452)), cada
vez que `locales` es un array nuevo. `visibles` cambia de referencia mucho más a menudo que de
contenido:

- `filtrados` lee siempre `almacen.favoritos()` y `almacen.valoraciones()`
  ([app.ts:137-142](src/app/app.ts#L137-L142)), aunque no se esté filtrando por ellos.
- Con el orden por cierre depende de `estados`, que depende del reloj
  ([app.ts:173-176](src/app/app.ts#L173-L176)).
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
      500 ms (`RETARDO_MAPA`, con un `textoMapa` aparte); «Limpiar» lo cambia al momento. Escribir
      una letra cuesta unos 30 ms (60 ms con la CPU ×4), así que el retardo no hacía falta para la
      lista: lo que se notaba era el mapa encuadrando con cada letra. Lo de guardar en IndexedDB con
      cada tecla se queda así (es una escritura pequeña y asíncrona).
- [x] Extra: buscar un número (solo cifras) busca el local con ese número, no las direcciones que lo
      llevan; el texto de cada local ya normalizado se guarda la primera vez que se busca.
- [x] Un `ResizeObserver` en el contenedor que llama a `invalidateSize()` (sustituye al de
      ampliar o reducir).
- [x] El modo oscuro: el `filter` de cinco funciones sobre las teselas
      ([styles.scss:366-370](src/styles.scss#L366-L370)) no pesa. Medido por ti en el Mac (DevTools,
      ⌘⇧P → «Show Rendering» → «Frame Rendering Stats»), arrastrando el mapa: de 57 a 59 fps tanto
      en claro como en oscuro. Se mantiene.

**Comprobado.** [mapa.spec.ts](src/app/mapa/mapa.spec.ts) (nuevo; tres de sus cuatro tests fallaban
con el `mapa.ts` de antes) y un test en [app.spec.ts](src/app/app.spec.ts): marcar un favorito o
valorar no encuadra el mapa; buscar, sí, medio segundo después. En `pnpm medir`, el popup sigue
abierto al marcar el corazón.

## Etapa 2 · Scroll y cabecera ✅ (falta que lo pruebes en Safari)

**Qué pasa.**

- En cada evento de scroll, [app.ts:198-225](src/app/app.ts#L198-L225) hace tres `querySelector`,
  dos `getBoundingClientRect` y un `offsetHeight`, en el documento y en `app-root`.
- Escritorio: sin `scrollbar-gutter`, al quedarse la lista más corta que la pantalla desaparece la
  barra de scroll (con barras clásicas: Windows, Linux o macOS con «mostrar siempre») y la cabecera y
  la página saltan de lado.
- Escritorio: sin `overscroll-behavior`, el rebote al llegar arriba o abajo desplaza la cabecera y el
  mapa sticky. En pantallas táctiles ya está en `none` ([styles.scss:124-136](src/styles.scss#L124-L136)).
- Móvil: el `(touchstart)` y el `(touchmove)` del mapa ([mapa.ts:81-83](src/app/mapa/mapa.ts#L81-L83))
  se registran como no pasivos (Angular no pone `passive`), así que, si el dedo empieza encima del
  mapa, el scroll puede tener que esperar al hilo principal. No llaman a `preventDefault`.
- El `(document:click)` del menú ([app.ts:71](src/app/app.ts#L71)) y el `(document:keydown)` del
  visor ([visor.ts:89-90](src/app/visor/visor.ts#L89-L90)) lanzan una detección de cambios con cada
  clic y cada tecla, en cualquier parte de la página.

**Cambios.**

- [x] El botón «Subir» con un `IntersectionObserver` sobre un elemento centinela (`.marca-subir`,
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
- [ ] **Te toca**: Safari en el Mac con el trackpad (rebote arriba y abajo) y con «Mostrar barras de
      desplazamiento: siempre», filtrando hasta que la lista quepa en la pantalla. La cabecera y el
      mapa no deberían moverse. Si siguen saltando, el culpable es otro y hay que buscarlo con
      Safari delante.

## Etapa 3 · Un DOM más ligero ✅ (falta que lo veas en Safari)

De 8.288 a 3.508 elementos y de 14.873 a 5.576 nodos, con las 60 fichas en «Detalles».

- [x] **Horario**: el `<dl>` con los siete días se crea la primera vez que se abre y ya se queda
      ([local-card.html](src/app/local-card/local-card.html)): esos 1.991 elementos solo existen en
      las fichas en las que se mira el horario. La animación es la de siempre, también la primera vez.
- [x] **Estrellas de las miniaturas**: un solo elemento con dos máscaras SVG, el relleno de las
      valoradas debajo del contorno de las cinco, en vez de 15 nodos y un componente por foto.
      [Estrellas](src/app/estrellas/estrellas.ts) se queda solo para valorar en el visor. La pastilla,
      compartida en [styles.scss](src/styles.scss) (`.pastilla-estrellas`): tienen que coincidir
      para que las del visor crezcan desde las de la miniatura.
- [x] **Componente `FotoTapa`** ([foto-tapa.ts](src/app/foto-tapa/foto-tapa.ts)): el botón, la foto,
      las estrellas, el `aria-label` y `ampliar()`, que estaban repetidos en las fichas y la galería,
      con sus estilos. Es el propio `<button appFotoTapa>`, sin un elemento más alrededor, y la foto
      lleva `decoding="async"`.
- [x] **Corazón**: la onda y las 8 chispas solo existen mientras late
      ([favorito.ts](src/app/favorito/favorito.ts)).
- [x] **Iconos**: un sprite SVG con un `<symbol>` por icono, una sola vez en la página, y en cada
      `app-icono` un `<use>` ([icono.ts](src/app/icono/icono.ts)). `--relleno-icono` y
      `--trazo-icono` siguen funcionando.
- [x] **«Ver más»**: un solo `ResizeObserver` para todos los textos
      ([plegable.ts](src/app/plegable/plegable.ts)).
- [ ] **Te toca**: las máscaras y los `<use>` no se han probado en Safari. Hay que mirar en el Mac y
      en el iPhone que se ven los iconos y las estrellas (sin valorar y valoradas), y que al ampliar
      una foto las estrellas crecen desde la miniatura.

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

## Etapa 4 · Arranque

**Qué pasa.** Ahora todo va en fila: se descarga el JS (125 kB), se abre IndexedDB (con hasta 2 s de
espera, [app.config.ts:16](src/app/app.config.ts#L16)), se crea `App` y solo entonces se pide
`locales.json` (132 kB).

- [ ] `<link rel="preload" href="data/locales.json" as="fetch" crossorigin>` en
      [index.html](src/index.html): los datos bajan a la vez que el JS. `HttpClient` usa `fetch` por
      defecto en Angular 22, así que debería aprovechar la precarga; hay que comprobar en Network
      que no se pide dos veces.
- [ ] Leaflet bajo demanda: `import('leaflet')` dentro de `Mapa`, con `import type` para los tipos.
      Saca 146,5 kB del bundle inicial, y en la vista «Fotos» no se descarga hasta abrir un local.
      Lo que hoy se crea en los campos de la clase (`FeatureGroup`, `CircleMarker`,
      [mapa.ts:266-276](src/app/mapa/mapa.ts#L266-L276)) pasa a crearse después de cargarlo. No uso
      `@defer` porque las fichas llaman a `mapa.enfocar()` a través de la referencia `#mapa`, que
      desde fuera del bloque diferido no se ve.
- [ ] `httpResource` (estable en Angular 22) en vez de `toSignal(http.get().pipe(catchError))`
      ([app.ts:97-104](src/app/app.ts#L97-L104)): `value()`, `error()` e `isLoading()`, sin tener que
      distinguir entre `undefined` y `null`.

**Cómo comprobarlo.** Lighthouse móvil antes y después; en Network, `locales.json` empieza a la vez
que `main.js`.

## Etapa 5 · Fotos

**Qué pasa.** Recorrer la lista entera descarga 11,2 MB, normalmente con datos móviles y en mitad de
la ruta. En las fichas las fotos ocupan entre 9 y 11 rem de ancho (144–176 px CSS, unos 350 px
reales en una pantalla 2×), pero siempre se descarga la de 690 px.

- [ ] Script que genere, por cada foto, versiones en AVIF o WebP a 360 y 690 px de ancho.
- [ ] `srcset` y `sizes` en `FotoTapa` y en los popups; la versión de 690 px para el visor.
- [ ] Medir el ahorro real al generarlas y anotarlo aquí.

La herramienta y el formato son decisión tuya (al final).

## Etapa 6 · Estado compartido y una `App` más pequeña

**Qué pasa.** `App` (318 líneas) se ocupa de los filtros, el orden, la vista, el historial, el scroll
y el reloj, y `estados`, `llegadas` y `ahora` se pasan como inputs a `LocalCard`, `Mapa`, `Galeria`
y `EstadoHorario` en cada sitio donde se usan.

- [ ] Servicio `Reloj` con un `ahora` que cambia al empezar cada minuto. Ahora es un `setInterval` de
      30 s ([app.ts:201](src/app/app.ts#L201)): el estado puede ir hasta 30 s tarde y se recalcula
      el doble de veces de lo necesario.
- [ ] Servicio con los datos de la ruta (`datos`, `estados`, `llegadas`) que cada componente inyecta,
      en vez de recibirlos por inputs.
- [ ] `estados`: reutilizar el objeto de un local si su estado no ha cambiado, para que no se
      actualicen las 60 pastillas y los marcadores cada minuto.
- [ ] Componente `Filtros` con el formulario ([app.html:92-173](src/app/app.html#L92-L173)) y un único
      `signal<Filtros>`. Signal Forms (`form()` de `@angular/forms/signals`, estable en 22) sustituye
      las nueve señales, el `computed` y `limpiar()`.
- [ ] Quitar la migración de la vista desde `localStorage` ([app.ts:59](src/app/app.ts#L59),
      [app.ts:339-346](src/app/app.ts#L339-L346)) cuando ya no haga falta.

## Etapa 7 · Reutilización y estilos

- [ ] El número del local (`.numero`), con los mismos estilos en
      [local-card.scss:37-50](src/app/local-card/local-card.scss#L37-L50) y
      [galeria.ts:182-196](src/app/galeria/galeria.ts#L182-L196) → un componente o una clase global
      con un tamaño pequeño.
- [ ] El tiempo de llegada (icono, duración y distancia) se monta en tres sitios: `textoLlegada` de la
      ficha ([local-card.ts:77](src/app/local-card/local-card.ts#L77)), la galería y el popup del
      mapa → un componente `Llegada` (y su versión DOM para el popup, junto a `crearIcono`).
- [ ] `almacen.estrellas(local, tapa)` en vez de `valoraciones().get(claveTapa(…)) ?? 0`, que se repite
      en la ficha, la galería y el visor.
- [ ] Animación de altura (abrir y cerrar, siguiendo desde donde iba si se pulsa a medias): el mismo
      patrón en [plegable.ts:100](src/app/plegable/plegable.ts#L100) y
      [local-card.ts:108](src/app/local-card/local-card.ts#L108) → una función `animarAltura()`.
- [ ] `movimientoReducido()` en vez de `matchMedia('(prefers-reduced-motion: reduce)')`, que aparece
      en siete sitios.
- [ ] Las media queries, en un solo sitio. Escritorio (960 px) está en
      [app.ts:53](src/app/app.ts#L53), [app.scss:371](src/app/app.scss#L371) y
      [mapa.ts:126](src/app/mapa/mapa.ts#L126) / [143](src/app/mapa/mapa.ts#L143); táctil, en
      [app.ts:55](src/app/app.ts#L55), [mapa.ts:36](src/app/mapa/mapa.ts#L36),
      [styles.scss:130](src/styles.scss#L130) y [app.scss:14](src/app/app.scss#L14) → `medios.ts` y
      un parcial `_medios.scss` con mixins (`stylePreprocessorOptions.includePaths` en
      `angular.json`).
- [ ] [styles.scss](src/styles.scss) (548 líneas) repartido en parciales: tema, base, controles,
      Leaflet y popups.
- [ ] Tests: hay dos versiones distintas de `local()` en [app.spec.ts](src/app/app.spec.ts) y
      [locales.spec.ts](src/app/locales.spec.ts) → un fixture común. Los polyfills de jsdom, a un
      fichero de `setupFiles` del builder de tests.

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
  [app.ts:310-317](src/app/app.ts#L310-L317)) calcula con alturas estimadas y puede quedarse corto.
- Si el navegador no ajusta el scroll al cambiar la altura de lo que hay por encima (scroll
  anchoring; Safari no lo hacía, hay que comprobarlo en la versión actual), subir por fichas que
  nunca se han pintado puede dar saltos.
- El «Ver más» se mide al entrar cada ficha en pantalla.

## Etapa 10 · Service worker (opcional)

La app se puede instalar pero no tiene service worker: sin conexión no abre, y GitHub Pages sirve
las fotos y el JSON con 10 minutos de caché (no llevan hash en el nombre), así que se vuelven a
validar a menudo. `@angular/service-worker` guardaría la app, `locales.json` y las fotos. El riesgo
es quedarse con una versión vieja: habría que avisar cuando haya una nueva.

## Arreglos fuera del plan

- [x] **Dirección de partida en el portal exacto.** OpenStreetMap no tiene los portales de muchas
      calles de Castelló (Herrero, entre ellas): con «Herrero 49» devolvía el centro de uno de los
      tramos de la calle, y no siempre el mismo (antes caía cerca de Picó por suerte; ahora, en La
      Fola). Ahora, si la dirección lleva número, primero se busca el portal en CartoCiudad (el
      callejero oficial, el mismo que usa `scripts/geocode.swift` para los locales). Solo vale si
      coinciden el número y la calle; si no, se sigue como antes con OpenStreetMap
      ([ubicacion.ts](src/app/ubicacion.ts), con tests en
      [ubicacion.spec.ts](src/app/ubicacion.spec.ts)). Probado en Chromium con los servicios reales:
      «Herrero 49» cae en el cruce con Picó.

---

## Decisiones que te tocan

1. **Fotos** (etapa 5): ¿script de Node con `sharp` que se ejecuta a mano y cuyas versiones se suben a
   git (lo que recomiendo, como el resto de `data/`), o generarlas en el CI? ¿AVIF (más pequeño) o
   WebP (más rápido de generar y de decodificar)?
2. ~~**Mapa en oscuro** (etapa 1)~~: resuelta, el `filter` no pesa y se mantiene.
3. **Zoom bloqueado**: `user-scalable=no` y el bloqueo de `gesturestart` impiden ampliar la página,
   algo que las pautas de accesibilidad (WCAG 1.4.4) piden permitir. ¿Se mantiene?
4. **Router**: con `@angular/router`, cada local tendría su URL (`/local/12`, para compartirla) y
   sustituiría el `pushState` a mano ([app.ts:320-337](src/app/app.ts#L320-L337)). En GitHub Pages
   hace falta un `404.html` que cargue la app. No mejora el rendimiento; es una funcionalidad.
5. **Etapas 9 y 10**: ¿entran o no?
