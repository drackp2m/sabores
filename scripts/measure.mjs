// Measures the built app in headless Chromium, with the real data, to compare before and after each
// change (PLAN.md): startup, DOM size, a long scroll through the list and what happens to the map
// when marking a favorite with a popup open and when typing in the search box.
//
//   pnpm measure              # builds and measures on desktop (1280×900)
//   pnpm measure --cpu 4      # with the CPU 4 times slower, like an average phone
//   pnpm measure --network    # on an average phone's network (Lighthouse's: 1.6 Mbps and 150 ms)
//   pnpm measure --json       # the result as JSON
//
// It uses the browser in the CHROME variable or the first Chromium or Chrome it finds. The map's style
// isn't requested from OpenFreeMap: it gets answered here with an empty one, so only the markers and
// popups count. Text files are served compressed, as on GitHub Pages.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import zlib from 'node:zlib';

const { values: options } = parseArgs({
  options: {
    cpu: { type: 'string', default: '1' },
    network: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});
const ROOT = path.join(import.meta.dirname, '..', 'dist', 'tapas-route', 'browser');
const WIDTH = 1280;
const HEIGHT = 900;
const SEARCH = 'queso';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const BROWSERS = [
  process.env.CHROME,
  'chromium',
  'chromium-browser',
  'google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(
    '❌ The built app is missing from dist/: pnpm build (or pnpm measure, which builds).',
  );
  process.exit(1);
}
const browser = findBrowser();
if (!browser) {
  console.error('❌ Chromium or Chrome not found: say which one with CHROME=/path/to/browser.');
  process.exit(1);
}

const server = await serve(ROOT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
const chrome = spawn(browser, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  '--no-first-run',
  '--no-default-browser-check',
  // In the container there are no user namespaces for the sandbox, and WebGL2 goes through its Mesa.
  ...(process.platform === 'linux'
    ? ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--ozone-platform=headless']
    : []),
]);

try {
  const cdp = await connect(await devtoolsAddress(chrome));
  const result = await measure(cdp, `http://127.0.0.1:${server.address().port}/`);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else report(result);
  cdp.close();
} finally {
  // Until it has fully closed it keeps writing to the profile.
  const closed = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  if (chrome.exitCode === null) await closed;
  server.close();
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}

async function measure(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? expression);
    return result.value;
  };
  const waitUntil = async (condition, ms = 15_000) => {
    const limit = Date.now() + ms;
    while (!(await evaluate(condition))) {
      if (Date.now() > limit) throw new Error(`Not met in time: ${condition}`);
      await pause(100);
    }
  };
  const metrics = async () => {
    const { metrics } = await page('Performance.getMetrics');
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  };
  const cost = (before, after) => ({
    workMs: ms(after.TaskDuration - before.TaskDuration),
    scriptMs: ms(after.ScriptDuration - before.ScriptDuration),
    styleMs: ms(after.RecalcStyleDuration - before.RecalcStyleDuration),
    layoutMs: ms(after.LayoutDuration - before.LayoutDuration),
    styleRecalcs: after.RecalcStyleCount - before.RecalcStyleCount,
    layouts: after.LayoutCount - before.LayoutCount,
  });

  await page('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const cpu = Number(options.cpu);
  if (cpu > 1) await page('Emulation.setCPUThrottlingRate', { rate: cpu });

  const style = JSON.stringify({ version: 8, sources: {}, layers: [] });
  cdp.onEvent('Fetch.requestPaused', ({ requestId }) =>
    page('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'content-type', value: 'application/json' },
        { name: 'access-control-allow-origin', value: '*' },
      ],
      body: Buffer.from(style).toString('base64'),
    }),
  );
  await page('Fetch.enable', { patterns: [{ urlPattern: '*tiles.openfreemap.org/styles/*' }] });
  if (options.network) {
    await page('Network.enable');
    await page('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    });
  }
  await page('Performance.enable');
  await page('Runtime.enable');
  await page('Page.enable');
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `(${observeStartup})()` });

  // Startup.
  await page('Page.navigate', { url });
  await waitUntil(
    `document.querySelectorAll('app-venue-card').length > 0 &&
     document.querySelectorAll('.venue-marker').length > 0`,
  );
  await evaluate(`new Promise((resolve) => requestIdleCallback(resolve, { timeout: 3000 }))`);
  const startup = await evaluate(`({
    cardsMs: Math.round(window.__measure.cards),
    markersMs: Math.round(window.__measure.markers),
    lcpMs: Math.round(window.__measure.lcp),
    blockingMs: Math.round(window.__measure.blocking),
    downloads: (${downloads})(),
  })`);

  const dom = await evaluate(`(${countDom})()`);

  // So it doesn't mix with what's left of startup.
  await pause(1000);

  // Scroll from top to bottom and back up with the wheel, over the list.
  const list = await evaluate(`(() => {
    const { left, width } = document.querySelector('.list').getBoundingClientRect();
    return { x: Math.round(left + width / 2), height: document.documentElement.scrollHeight - innerHeight };
  })()`);
  await evaluate(`window.__frames = (${countFrames})()`);
  const hasScrollTop = `!!document.querySelector('.scroll-top')`;
  const scrollTop = [await evaluate(hasScrollTop)];
  let before = await metrics();
  for (const direction of [-1, 1]) {
    await page('Input.synthesizeScrollGesture', {
      x: list.x,
      y: Math.round(HEIGHT * 0.6),
      yDistance: direction * list.height,
      speed: 6000,
      gestureSourceType: 'mouse',
    });
    await pause(1000); // How long the button takes to leave (animate.leave).
    scrollTop.push(await evaluate(hasScrollTop));
  }
  const scroll = {
    pixels: list.height * 2,
    ...cost(before, await metrics()),
    ...(await evaluate(`window.__frames.stop()`)),
    // Not there at the top, there at the bottom and gone again back at the top.
    scrollTopButton: scrollTop.join(' → '),
    photosKB: await evaluate(`(${photosSize})()`),
  };

  // Favorite with that venue's popup open.
  await evaluate(`scrollTo(0, 0)`);
  await pause(300);
  const marker = await evaluate(`(() => {
    const icon = document.querySelector('.venue-marker');
    const { left, top, width, height } = icon.getBoundingClientRect();
    return { number: parseInt(icon.title), x: left + width / 2, y: top + height / 2 };
  })()`);
  await click(page, marker);
  await waitUntil(`!!document.querySelector('.maplibregl-popup')`);
  await pause(1200); // How long the list takes to reach its card.
  const mapView = `(${mapSignature})()`;
  const viewBefore = await evaluate(mapView);
  await evaluate(`(${observeMap})()`);
  const heart = `document.querySelector('#venue-${marker.number} app-favorite button').click()`;
  before = await metrics();
  await evaluate(heart);
  await pause(800);
  const favorite = {
    popupStillOpen: await evaluate(`!!document.querySelector('.maplibregl-popup')`),
    mapStill: (await evaluate(mapView)) === viewBefore,
    markerChanges: await evaluate(`window.__markerChanges`),
    ...cost(before, await metrics()),
  };
  await evaluate(heart);
  await pause(800);

  // Typing in the search box letter by letter, as it gets typed.
  await evaluate(`scrollTo(0, 0); document.querySelector('.field.text input').focus()`);
  await pause(300);
  await evaluate(`(${observeMap})()`);
  before = await metrics();
  for (const letter of SEARCH) {
    await page('Input.insertText', { text: letter });
    await pause(120);
  }
  await pause(800);
  const search = {
    text: SEARCH,
    cards: await evaluate(`document.querySelectorAll('app-venue-card').length`),
    markerChanges: await evaluate(`window.__markerChanges`),
    ...cost(before, await metrics()),
  };

  const { network } = options;
  return {
    browser: path.basename(browser),
    cpu,
    network,
    startup,
    dom,
    scroll,
    favorite,
    search,
  };
}

/** In the page, before anything loads: when the cards and the map appear, LCP and blocking time. */
function observeStartup() {
  const measure = (window.__measure = { cards: NaN, markers: NaN, lcp: NaN, blocking: 0 });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) measure.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  // Like Lighthouse's TBT: how much long tasks go over 50 ms.
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) measure.blocking += Math.max(0, entry.duration - 50);
  }).observe({ type: 'longtask', buffered: true });
  new MutationObserver((_, observer) => {
    if (isNaN(measure.cards) && document.querySelector('app-venue-card')) {
      measure.cards = performance.now();
    }
    if (!document.querySelector('.venue-marker')) return;
    measure.markers = performance.now();
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
}

/** How much has been downloaded in photos, in kB. */
function photosSize() {
  const photos = performance
    .getEntriesByType('resource')
    .filter(({ name }) => /\/photos\//.test(name));
  return Math.round(photos.reduce((total, photo) => total + photo.encodedBodySize, 0) / 1000);
}

/** When each script and the data start and finish downloading. */
function downloads() {
  return performance
    .getEntriesByType('resource')
    .filter(({ name }) => /\.m?js(\?|$)|venues\.json$/.test(name))
    .map(({ name, startTime, responseEnd }) => ({
      file: name.split('/').pop(),
      fromMs: Math.round(startTime),
      toMs: Math.round(responseEnd),
    }));
}

function countDom() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ALL);
  let nodes = 1;
  let comments = 0;
  while (walker.nextNode()) {
    nodes++;
    if (walker.currentNode.nodeType === Node.COMMENT_NODE) comments++;
  }
  const count = (selector) => document.querySelectorAll(selector).length;
  const cards = count('app-venue-card');
  return {
    elements: count('*'),
    nodes,
    comments,
    cards,
    perCard: Math.round(count('app-venue-card *') / cards),
    stars: count('app-venue-card .stars-pill, app-venue-card .stars-pill *'),
    schedule: count('app-venue-card dl *'),
    sparks: count('app-favorite .spark'),
    icons: count('app-icon'),
    strokes: count('app-icon path'),
    collapsibles: count('app-collapsible'),
    map: count('app-map *'),
  };
}

/** Frames painted and those taking over 25 ms (at 60 Hz, one every 16.7 ms). */
function countFrames() {
  let total = 0;
  let slow = 0;
  let previous = performance.now();
  let running = true;
  const frame = (now) => {
    total++;
    if (now - previous > 25) slow++;
    previous = now;
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return { stop: () => ((running = false), { frames: total, slowFrames: slow }) };
}

/** Where the map is (where it leaves a marker) and which popup it has open. */
function mapSignature() {
  const marker = document.querySelector('.venue-marker')?.style.transform ?? '';
  const popup = document.querySelector('.maplibregl-popup strong')?.textContent ?? '';
  return [marker, popup].join(' | ');
}

/** Counts the times markers get removed or added. */
function observeMap() {
  window.__markerChanges = 0;
  window.__mapObserver?.disconnect();
  const isMarker = (node) => node.classList?.contains('venue-marker');
  window.__mapObserver = new MutationObserver((changes) => {
    if (changes.some((c) => [...c.addedNodes, ...c.removedNodes].some(isMarker))) {
      window.__markerChanges++;
    }
  });
  window.__mapObserver.observe(document.querySelector('.maplibregl-canvas-container'), {
    childList: true,
  });
}

async function click(page, { x, y }) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

function report({ browser, cpu, network, startup, dom, scroll, favorite, search }) {
  const yesNo = (value) => (value ? 'yes' : 'no');
  const costText = (c) =>
    `${c.workMs} ms of work (script ${c.scriptMs}, style ${c.styleMs} ×${c.styleRecalcs}, ` +
    `layout ${c.layoutMs} ×${c.layouts})`;
  const downloads = startup.downloads
    .map(({ file, fromMs, toMs }) => `${file} ${fromMs}–${toMs} ms`)
    .join(' · ');
  console.log(`${browser}, ${WIDTH}×${HEIGHT}${cpu > 1 ? `, CPU ×${cpu} slower` : ''}${network ? ', slow network' : ''}

Startup      first card ${startup.cardsMs} ms · markers ${startup.markersMs} ms · LCP ${startup.lcpMs} ms · blocking ${startup.blockingMs} ms
             ${downloads}
DOM          ${dom.elements} elements, ${dom.nodes} nodes (${dom.comments} comments)
             ${dom.cards} cards of ${dom.perCard} elements · stars ${dom.stars} · schedule ${dom.schedule}
             sparks ${dom.sparks} · ${dom.icons} icons with ${dom.strokes} strokes · ${dom.collapsibles} collapsibles · map ${dom.map}
Scroll       ${scroll.pixels} px: ${costText(scroll)}
             ${scroll.frames} frames, ${scroll.slowFrames} over 25 ms · scroll-to-top at top, bottom, top: ${scroll.scrollTopButton}
             ${scroll.photosKB} kB of photos
Favorite     popup open: ${yesNo(favorite.popupStillOpen)} · map still: ${yesNo(favorite.mapStill)} · marker changes: ${favorite.markerChanges}
             ${costText(favorite)}
Search       «${search.text}» letter by letter → ${search.cards} cards · marker changes: ${search.markerChanges}
             ${costText(search)}`);
}

function ms(seconds) {
  return Math.round(seconds * 1000);
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBrowser() {
  const folders = (process.env.PATH ?? '').split(path.delimiter);
  for (const candidate of BROWSERS.filter(Boolean)) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    const found = folders
      .map((folder) => path.join(folder, candidate))
      .find((file) => fs.existsSync(file));
    if (found) return found;
  }
  return null;
}

/** The app's files; any other path, index.html (like GitHub Pages with the app). */
function serve(root) {
  const server = http.createServer((request, response) => {
    let file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      file = path.join(root, 'index.html');
    }
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const compress = /text|javascript|json|svg/.test(type);
    response.writeHead(200, {
      'content-type': type,
      ...(compress && { 'content-encoding': 'gzip' }),
    });
    const content = fs.createReadStream(file);
    (compress ? content.pipe(zlib.createGzip()) : content).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function devtoolsAddress(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(output);
      if (found) resolve(found[1]);
    });
    child.on('exit', (code) => reject(new Error(`The browser has closed (${code}):\n${output}`)));
  });
}

/** Minimal DevTools protocol client, with flat sessions (a single WebSocket). */
function connect(address) {
  const socket = new WebSocket(address);
  const pending = new Map();
  const listeners = new Map();
  let last = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
    } else {
      listeners.get(message.method)?.(message.params);
    }
  };
  const client = {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++last;
        pending.set(id, { resolve, reject, method });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      }),
    onEvent: (method, listener) => listeners.set(method, listener),
    close: () => socket.close(),
  };
  return new Promise((resolve, reject) => {
    socket.onopen = () => resolve(client);
    socket.onerror = () => reject(new Error(`Can't connect to ${address}`));
  });
}
