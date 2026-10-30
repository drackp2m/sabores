// Sirve la app por HTTPS para abrirla en Safari (iPhone) desde la red local: un proxy TLS en el 4200
// que responde en HTTP/1.1 (Safari no se entiende con el HTTP/2 de `ng serve --ssl`) y, detrás,
// `ng serve` en HTTP en el puerto siguiente. El certificado es de mkcert, para que el iPhone (con la
// CA de mkcert instalada) se fíe de él: .cert/cert.pem y .cert/key.pem, fuera de git.
//
//   pnpm start:safari                # https://…:4200
//   pnpm start:safari --port 4300    # https://…:4300 (si el 4200 está ocupado en el Mac)
import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: opciones } = parseArgs({
  options: { port: { type: 'string', short: 'p', default: '4200' } },
});
// El 4200 lo reenvía VS Code (.devcontainer/devcontainer.json); otro, lo reenvía al detectarlo.
const PUERTO = Number(opciones.port);
const PUERTO_NG = PUERTO + 1;
const CARPETA = path.join(import.meta.dirname, '..', '.cert');

let cert, key;
try {
  cert = fs.readFileSync(path.join(CARPETA, 'cert.pem'));
  key = fs.readFileSync(path.join(CARPETA, 'key.pem'));
} catch {
  // En el Mac y no en el contenedor: scutil e ipconfig son de macOS, y la CA de mkcert en la que
  // confía el iPhone es la del Mac.
  console.error(`❌ Falta el certificado en .cert/. En una terminal del Mac (no en la del contenedor),
desde la carpeta del proyecto:

  mkdir -p .cert && mkcert -cert-file .cert/cert.pem -key-file .cert/key.pem \\
    "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost

(o copia aquí la carpeta .cert/ de chess-pecker).`);
  process.exit(1);
}

// Su salida pasa tal cual; cuando está listo, debajo, las direcciones del proxy (no la suya).
const ng = spawn('pnpm', ['ng', 'serve', '--host', '127.0.0.1', '--port', String(PUERTO_NG)], {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: { ...process.env, FORCE_COLOR: '1' },
});
let anunciado = false;
ng.stdout.on('data', (trozo) => {
  process.stdout.write(trozo);
  const texto = trozo.toString().replace(/\x1b\[[\d;]*m/g, ''); // Sin los códigos de color.
  if (!anunciado && texto.includes('Local:')) {
    anunciado = true;
    anunciar();
  }
});

const servidor = https.createServer({ cert, key }, (peticion, respuesta) => {
  const destino = http.request(
    {
      host: '127.0.0.1',
      port: PUERTO_NG,
      method: peticion.method,
      path: peticion.url,
      headers: peticion.headers,
    },
    (origen) => {
      respuesta.writeHead(origen.statusCode, origen.headers);
      origen.pipe(respuesta);
    },
  );
  destino.on('error', () => {
    if (!respuesta.headersSent) respuesta.writeHead(502);
    respuesta.end('ng serve todavía no responde');
  });
  peticion.pipe(destino);
});

// El WebSocket de la recarga automática: la petición tal cual y, a partir de ahí, los bytes en
// los dos sentidos.
servidor.on('upgrade', (peticion, socket, cabeza) => {
  const destino = net.connect(PUERTO_NG, '127.0.0.1', () => {
    const cabeceras = [];
    for (let i = 0; i < peticion.rawHeaders.length; i += 2) {
      cabeceras.push(`${peticion.rawHeaders[i]}: ${peticion.rawHeaders[i + 1]}`);
    }
    destino.write(
      `${peticion.method} ${peticion.url} HTTP/1.1\r\n${cabeceras.join('\r\n')}\r\n\r\n`,
    );
    destino.write(cabeza);
    socket.pipe(destino).pipe(socket);
  });
  destino.on('error', () => socket.destroy());
  socket.on('error', () => destino.destroy());
});

servidor.on('error', (error) => {
  console.error(
    `❌ No se puede abrir el puerto ${PUERTO} (¿está \`pnpm start\` en marcha?): ${error.message}`,
  );
  ng.kill();
});

servidor.listen(PUERTO, '0.0.0.0');

/** Las direcciones para las que vale el certificado: el nombre .local del Mac, su IP… */
function anunciar() {
  const nombres = new X509Certificate(cert).subjectAltName?.split(', ') ?? [];
  const hosts = new Set(nombres.map((n) => n.replace(/^(DNS|IP Address):/, '')));
  const red = [...hosts].filter((h) => !/^(localhost|127\.|\[?::1\]?$|fe80:)/i.test(h));
  console.log(`\n🔒 Por HTTPS en el ${PUERTO}. Abre en Safari:`);
  for (const host of red.length ? red : ['localhost']) console.log(`   https://${host}:${PUERTO}`);
  console.log();
}

const parar = () => {
  servidor.close();
  ng.kill();
};
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
ng.on('exit', (codigo) => {
  servidor.close();
  process.exit(codigo ?? 0);
});
