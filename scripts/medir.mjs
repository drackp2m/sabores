// Mide la app compilada en Chromium sin ventana, con los datos reales, para comparar antes y después
// de cada cambio (PLAN.md): arranque, tamaño del DOM, un scroll largo por la lista y qué le pasa al
// mapa al marcar un favorito con un popup abierto y al escribir en el buscador.
//
//   pnpm medir              # compila y mide en escritorio (1280×900)
//   pnpm medir --cpu 4      # con la CPU 4 veces más lenta, como un móvil normal
//   pnpm medir --json       # el resultado en JSON
//
// Usa el navegador de la variable CHROME o el primer Chromium o Chrome que encuentre. Las teselas
// del mapa no se piden a OpenStreetMap: se responden aquí con una imagen gris.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import zlib from 'node:zlib';

const { values: opciones } = parseArgs({
  options: { cpu: { type: 'string', default: '1' }, json: { type: 'boolean', default: false } },
});
const RAIZ = path.join(import.meta.dirname, '..', 'dist', 'ruta-tapas', 'browser');
const ANCHO = 1280;
const ALTO = 900;
const BUSQUEDA = 'queso';

const TIPOS = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const NAVEGADORES = [
  process.env.CHROME,
  'chromium',
  'chromium-browser',
  'google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

if (!fs.existsSync(path.join(RAIZ, 'index.html'))) {
  console.error(
    '❌ Falta la app compilada en dist/: pnpm build (o pnpm medir, que compila antes).',
  );
  process.exit(1);
}
const navegador = buscarNavegador();
if (!navegador) {
  console.error('❌ No encuentro Chromium ni Chrome: indica cuál con CHROME=/ruta/al/navegador.');
  process.exit(1);
}

const servidor = await servir(RAIZ);
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'medir-'));
const chrome = spawn(navegador, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${perfil}`,
  `--window-size=${ANCHO},${ALTO}`,
  '--no-first-run',
  '--no-default-browser-check',
  // En el contenedor no hay espacios de nombres de usuario para el sandbox.
  ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
]);

try {
  const cdp = await conectar(await direccionDevtools(chrome));
  const resultado = await medir(cdp, `http://127.0.0.1:${servidor.address().port}/`);
  if (opciones.json) console.log(JSON.stringify(resultado, null, 2));
  else imprimir(resultado);
  cdp.cerrar();
} finally {
  // Hasta que no se cierra del todo sigue escribiendo en el perfil.
  const cerrado = new Promise((ok) => chrome.once('exit', ok));
  chrome.kill();
  if (chrome.exitCode === null) await cerrado;
  servidor.close();
  fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 3 });
}

async function medir(cdp, url) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  const pagina = (metodo, params) => cdp.enviar(metodo, params, sessionId);
  const evaluar = async (expresion) => {
    const { result, exceptionDetails } = await pagina('Runtime.evaluate', {
      expression: expresion,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? expresion);
    return result.value;
  };
  const esperarA = async (condicion, ms = 15_000) => {
    const limite = Date.now() + ms;
    while (!(await evaluar(condicion))) {
      if (Date.now() > limite) throw new Error(`No se ha cumplido a tiempo: ${condicion}`);
      await pausa(100);
    }
  };
  const metricas = async () => {
    const { metrics } = await pagina('Performance.getMetrics');
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  };
  const coste = (antes, despues) => ({
    trabajoMs: ms(despues.TaskDuration - antes.TaskDuration),
    scriptMs: ms(despues.ScriptDuration - antes.ScriptDuration),
    estilosMs: ms(despues.RecalcStyleDuration - antes.RecalcStyleDuration),
    layoutMs: ms(despues.LayoutDuration - antes.LayoutDuration),
    recalculosEstilo: despues.RecalcStyleCount - antes.RecalcStyleCount,
    layouts: despues.LayoutCount - antes.LayoutCount,
  });

  await pagina('Emulation.setDeviceMetricsOverride', {
    width: ANCHO,
    height: ALTO,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const cpu = Number(opciones.cpu);
  if (cpu > 1) await pagina('Emulation.setCPUThrottlingRate', { rate: cpu });

  const tesela = pngGris();
  cdp.alRecibir('Fetch.requestPaused', ({ requestId }) =>
    pagina('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'image/png' }],
      body: tesela,
    }),
  );
  await pagina('Fetch.enable', { patterns: [{ urlPattern: '*tile.openstreetmap.org*' }] });
  await pagina('Performance.enable');
  await pagina('Runtime.enable');
  await pagina('Page.enable');
  await pagina('Page.addScriptToEvaluateOnNewDocument', { source: `(${observarArranque})()` });

  // Arranque.
  await pagina('Page.navigate', { url });
  await esperarA(
    `document.querySelectorAll('app-local-card').length > 0 &&
     document.querySelectorAll('.leaflet-marker-icon').length > 0`,
  );
  await evaluar(`new Promise((ok) => requestIdleCallback(ok, { timeout: 3000 }))`);
  const arranque = await evaluar(`({
    fichasMs: Math.round(window.__medida.fichas),
    lcpMs: Math.round(window.__medida.lcp),
    bloqueoMs: Math.round(window.__medida.bloqueo),
  })`);

  const dom = await evaluar(`(${contarDom})()`);

  // Scroll de arriba abajo y de vuelta arriba con la rueda, encima de la lista.
  const lista = await evaluar(`(() => {
    const { left, width } = document.querySelector('.lista').getBoundingClientRect();
    return { x: Math.round(left + width / 2), alto: document.documentElement.scrollHeight - innerHeight };
  })()`);
  await evaluar(`window.__fotogramas = (${contarFotogramas})()`);
  const verSubir = `!!document.querySelector('.subir')`;
  const subir = [await evaluar(verSubir)];
  let antes = await metricas();
  for (const sentido of [-1, 1]) {
    await pagina('Input.synthesizeScrollGesture', {
      x: lista.x,
      y: Math.round(ALTO * 0.6),
      yDistance: sentido * lista.alto,
      speed: 6000,
      gestureSourceType: 'mouse',
    });
    await pausa(1000); // Lo que tarda en irse el botón (animate.leave).
    subir.push(await evaluar(verSubir));
  }
  const scroll = {
    pixeles: lista.alto * 2,
    ...coste(antes, await metricas()),
    ...(await evaluar(`window.__fotogramas.parar()`)),
    // Arriba no está, abajo sí y al volver arriba ya no.
    botonSubir: subir.join(' → '),
  };

  // Favorito con el popup de ese local abierto.
  await evaluar(`scrollTo(0, 0)`);
  await pausa(300);
  const marcador = await evaluar(`(() => {
    const icono = document.querySelector('.leaflet-marker-icon');
    const { left, top, width, height } = icono.getBoundingClientRect();
    return { numero: parseInt(icono.title), x: left + width / 2, y: top + height / 2 };
  })()`);
  await clicar(pagina, marcador);
  await esperarA(`!!document.querySelector('.leaflet-popup')`);
  await pausa(1200); // Lo que tarda en bajar la lista hasta su ficha.
  const vistaMapa = `(${firmaMapa})()`;
  const vistaAntes = await evaluar(vistaMapa);
  await evaluar(`(${observarMapa})()`);
  const corazon = `document.querySelector('#local-${marcador.numero} app-favorito button').click()`;
  antes = await metricas();
  await evaluar(corazon);
  await pausa(800);
  const favorito = {
    popupSigueAbierto: await evaluar(`!!document.querySelector('.leaflet-popup')`),
    mapaQuieto: (await evaluar(vistaMapa)) === vistaAntes,
    cambiosMarcadores: await evaluar(`window.__cambiosMarcadores`),
    ...coste(antes, await metricas()),
  };
  await evaluar(corazon);
  await pausa(800);

  // Escribir en el buscador letra a letra, como se teclea.
  await evaluar(`scrollTo(0, 0); document.querySelector('.campo.texto input').focus()`);
  await pausa(300);
  await evaluar(`(${observarMapa})()`);
  antes = await metricas();
  for (const letra of BUSQUEDA) {
    await pagina('Input.insertText', { text: letra });
    await pausa(120);
  }
  await pausa(800);
  const busqueda = {
    texto: BUSQUEDA,
    fichas: await evaluar(`document.querySelectorAll('app-local-card').length`),
    cambiosMarcadores: await evaluar(`window.__cambiosMarcadores`),
    ...coste(antes, await metricas()),
  };

  return { navegador: path.basename(navegador), cpu, arranque, dom, scroll, favorito, busqueda };
}

/** En la página, antes de que cargue nada: cuándo aparece la primera ficha, LCP y bloqueo. */
function observarArranque() {
  const medida = (window.__medida = { fichas: NaN, lcp: NaN, bloqueo: 0 });
  new PerformanceObserver((lista) => {
    for (const entrada of lista.getEntries()) medida.lcp = entrada.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  // Como el TBT de Lighthouse: lo que pasan de 50 ms las tareas largas.
  new PerformanceObserver((lista) => {
    for (const entrada of lista.getEntries()) medida.bloqueo += Math.max(0, entrada.duration - 50);
  }).observe({ type: 'longtask', buffered: true });
  new MutationObserver((_, observador) => {
    if (!document.querySelector('app-local-card')) return;
    medida.fichas = performance.now();
    observador.disconnect();
  }).observe(document, { childList: true, subtree: true });
}

function contarDom() {
  const recorrido = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ALL);
  let nodos = 1;
  let comentarios = 0;
  while (recorrido.nextNode()) {
    nodos++;
    if (recorrido.currentNode.nodeType === Node.COMMENT_NODE) comentarios++;
  }
  const cuantos = (selector) => document.querySelectorAll(selector).length;
  const fichas = cuantos('app-local-card');
  return {
    elementos: cuantos('*'),
    nodos,
    comentarios,
    fichas,
    porFicha: Math.round(cuantos('app-local-card *') / fichas),
    estrellas: cuantos('app-local-card .pastilla-estrellas, app-local-card .pastilla-estrellas *'),
    horario: cuantos('app-local-card dl *'),
    chispas: cuantos('app-favorito .chispa'),
    iconos: cuantos('app-icono'),
    trazos: cuantos('app-icono path'),
    plegables: cuantos('app-plegable'),
    mapa: cuantos('app-mapa *'),
  };
}

/** Fotogramas pintados y los que tardan más de 25 ms (a 60 Hz, uno cada 16,7 ms). */
function contarFotogramas() {
  let total = 0;
  let lentos = 0;
  let anterior = performance.now();
  let seguir = true;
  const fotograma = (ahora) => {
    total++;
    if (ahora - anterior > 25) lentos++;
    anterior = ahora;
    if (seguir) requestAnimationFrame(fotograma);
  };
  requestAnimationFrame(fotograma);
  return { parar: () => ((seguir = false), { fotogramas: total, fotogramasLentos: lentos }) };
}

/** Dónde está el mapa (desplazamiento y zoom) y qué popup tiene abierto. */
function firmaMapa() {
  const estilo = (selector) => document.querySelector(selector)?.style.transform ?? '';
  const popup = document.querySelector('.leaflet-popup strong')?.textContent ?? '';
  return [estilo('.leaflet-map-pane'), estilo('.leaflet-proxy'), popup].join(' | ');
}

/** Cuenta las veces que se quitan o se añaden marcadores. */
function observarMapa() {
  window.__cambiosMarcadores = 0;
  window.__observadorMapa?.disconnect();
  window.__observadorMapa = new MutationObserver((cambios) => {
    if (cambios.some((c) => c.addedNodes.length || c.removedNodes.length)) {
      window.__cambiosMarcadores++;
    }
  });
  window.__observadorMapa.observe(document.querySelector('.leaflet-marker-pane'), {
    childList: true,
  });
}

async function clicar(pagina, { x, y }) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await pagina('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

function imprimir({ navegador, cpu, arranque, dom, scroll, favorito, busqueda }) {
  const si = (valor) => (valor ? 'sí' : 'no');
  const costeTexto = (c) =>
    `${c.trabajoMs} ms de trabajo (script ${c.scriptMs}, estilos ${c.estilosMs} ×${c.recalculosEstilo}, ` +
    `layout ${c.layoutMs} ×${c.layouts})`;
  console.log(`${navegador}, ${ANCHO}×${ALTO}${cpu > 1 ? `, CPU ×${cpu} más lenta` : ''}

Arranque     primera ficha ${arranque.fichasMs} ms · LCP ${arranque.lcpMs} ms · bloqueo ${arranque.bloqueoMs} ms
DOM          ${dom.elementos} elementos, ${dom.nodos} nodos (${dom.comentarios} comentarios)
             ${dom.fichas} fichas de ${dom.porFicha} elementos · estrellas ${dom.estrellas} · horario ${dom.horario}
             chispas ${dom.chispas} · ${dom.iconos} iconos con ${dom.trazos} trazos · ${dom.plegables} plegables · mapa ${dom.mapa}
Scroll       ${scroll.pixeles} px: ${costeTexto(scroll)}
             ${scroll.fotogramas} fotogramas, ${scroll.fotogramasLentos} de más de 25 ms · «Subir» arriba, abajo, arriba: ${scroll.botonSubir}
Favorito     popup abierto: ${si(favorito.popupSigueAbierto)} · mapa quieto: ${si(favorito.mapaQuieto)} · cambios de marcadores: ${favorito.cambiosMarcadores}
             ${costeTexto(favorito)}
Buscar       «${busqueda.texto}» letra a letra → ${busqueda.fichas} fichas · cambios de marcadores: ${busqueda.cambiosMarcadores}
             ${costeTexto(busqueda)}`);
}

function ms(segundos) {
  return Math.round(segundos * 1000);
}

function pausa(ms) {
  return new Promise((ok) => setTimeout(ok, ms));
}

function buscarNavegador() {
  const carpetas = (process.env.PATH ?? '').split(path.delimiter);
  for (const candidato of NAVEGADORES.filter(Boolean)) {
    if (path.isAbsolute(candidato)) {
      if (fs.existsSync(candidato)) return candidato;
      continue;
    }
    const encontrado = carpetas
      .map((carpeta) => path.join(carpeta, candidato))
      .find((ruta) => fs.existsSync(ruta));
    if (encontrado) return encontrado;
  }
  return null;
}

/** Los ficheros de la app; cualquier otra ruta, index.html (como GitHub Pages con la app). */
function servir(raiz) {
  const servidor = http.createServer((peticion, respuesta) => {
    let fichero = path.join(raiz, decodeURIComponent(new URL(peticion.url, 'http://x').pathname));
    if (!fichero.startsWith(raiz) || !fs.statSync(fichero, { throwIfNoEntry: false })?.isFile()) {
      fichero = path.join(raiz, 'index.html');
    }
    respuesta.writeHead(200, {
      'content-type': TIPOS[path.extname(fichero)] ?? 'application/octet-stream',
    });
    fs.createReadStream(fichero).pipe(respuesta);
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(servidor)));
}

function direccionDevtools(proceso) {
  return new Promise((ok, ko) => {
    let salida = '';
    proceso.stderr.on('data', (trozo) => {
      salida += trozo;
      const encontrada = /DevTools listening on (ws:\/\/\S+)/.exec(salida);
      if (encontrada) ok(encontrada[1]);
    });
    proceso.on('exit', (codigo) =>
      ko(new Error(`El navegador se ha cerrado (${codigo}):\n${salida}`)),
    );
  });
}

/** Cliente mínimo del protocolo de DevTools, con sesiones planas (un solo WebSocket). */
function conectar(direccion) {
  const socket = new WebSocket(direccion);
  const pendientes = new Map();
  const oyentes = new Map();
  let ultimo = 0;
  socket.onmessage = ({ data }) => {
    const mensaje = JSON.parse(data);
    const pendiente = pendientes.get(mensaje.id);
    if (pendiente) {
      pendientes.delete(mensaje.id);
      if (mensaje.error) pendiente.ko(new Error(`${pendiente.metodo}: ${mensaje.error.message}`));
      else pendiente.ok(mensaje.result);
    } else {
      oyentes.get(mensaje.method)?.(mensaje.params);
    }
  };
  const cliente = {
    enviar: (metodo, params = {}, sessionId) =>
      new Promise((ok, ko) => {
        const id = ++ultimo;
        pendientes.set(id, { ok, ko, metodo });
        socket.send(JSON.stringify({ id, method: metodo, params, sessionId }));
      }),
    alRecibir: (metodo, oyente) => oyentes.set(metodo, oyente),
    cerrar: () => socket.close(),
  };
  return new Promise((ok, ko) => {
    socket.onopen = () => ok(cliente);
    socket.onerror = () => ko(new Error(`No se puede conectar con ${direccion}`));
  });
}

/** Una imagen PNG de 1×1 de un gris claro, que Leaflet estira a 256×256. */
function pngGris() {
  const bloque = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  // 1×1, 8 bits por canal, en gris (tipo de color 0).
  const cabecera = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', zlib.deflateSync(Buffer.from([0, 0xe0]))),
    bloque('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}
