// Serves the app over HTTPS to open it in Safari (iPhone) from the local network: a TLS proxy on 4200
// that answers in HTTP/1.1 (Safari doesn't get along with the HTTP/2 of `ng serve --ssl`) and, behind
// it, `ng serve` over HTTP on the next port. The certificate is from mkcert, so the iPhone (with
// mkcert's CA installed) trusts it: .cert/cert.pem and .cert/key.pem, out of git.
//
//   pnpm start:safari                # https://…:4200
//   pnpm start:safari --port 4300    # https://…:4300 (if 4200 is taken on the Mac)
import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: { port: { type: 'string', short: 'p', default: '4200' } },
});
// VS Code forwards 4200 (.devcontainer/devcontainer.json); any other, it forwards on detecting it.
const PORT = Number(options.port);
const NG_PORT = PORT + 1;
const FOLDER = path.join(import.meta.dirname, '..', '.cert');

let cert, key;
try {
  cert = fs.readFileSync(path.join(FOLDER, 'cert.pem'));
  key = fs.readFileSync(path.join(FOLDER, 'key.pem'));
} catch {
  // On the Mac and not in the container: scutil and ipconfig are macOS tools, and the mkcert CA the
  // iPhone trusts is the Mac's.
  console.error(`❌ The certificate is missing from .cert/. In a Mac terminal (not the container's),
from the project folder:

  mkdir -p .cert && mkcert -cert-file .cert/cert.pem -key-file .cert/key.pem \\
    "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost

(or copy the .cert/ folder from chess-pecker here).`);
  process.exit(1);
}

// Its output goes straight through; once it's ready, below, the proxy's addresses (not its own).
const ng = spawn('pnpm', ['ng', 'serve', '--host', '127.0.0.1', '--port', String(NG_PORT)], {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: { ...process.env, FORCE_COLOR: '1' },
});
let announced = false;
ng.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  const text = chunk.toString().replace(/\x1b\[[\d;]*m/g, ''); // Without the color codes.
  if (!announced && text.includes('Local:')) {
    announced = true;
    announce();
  }
});

const server = https.createServer({ cert, key }, (request, response) => {
  const target = http.request(
    {
      host: '127.0.0.1',
      port: NG_PORT,
      method: request.method,
      path: request.url,
      headers: request.headers,
    },
    (origin) => {
      response.writeHead(origin.statusCode, origin.headers);
      origin.pipe(response);
    },
  );
  target.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end('ng serve is not answering yet');
  });
  request.pipe(target);
});

// The live reload WebSocket: the request as it is and, from then on, the bytes in both directions.
server.on('upgrade', (request, socket, head) => {
  const target = net.connect(NG_PORT, '127.0.0.1', () => {
    const headers = [];
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      headers.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}`);
    }
    target.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`);
    target.write(head);
    socket.pipe(target).pipe(socket);
  });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
});

server.on('error', (error) => {
  console.error(`❌ Can't open port ${PORT} (is \`pnpm start\` running?): ${error.message}`);
  ng.kill();
});

server.listen(PORT, '0.0.0.0');

/** The addresses the certificate is valid for: the Mac's .local name, its IP… */
function announce() {
  const names = new X509Certificate(cert).subjectAltName?.split(', ') ?? [];
  const hosts = new Set(names.map((n) => n.replace(/^(DNS|IP Address):/, '')));
  const network = [...hosts].filter((h) => !/^(localhost|127\.|\[?::1\]?$|fe80:)/i.test(h));
  console.log(`\n🔒 Over HTTPS on ${PORT}. Open in Safari:`);
  for (const host of network.length ? network : ['localhost']) {
    console.log(`   https://${host}:${PORT}`);
  }
  console.log();
}

const stop = () => {
  server.close();
  ng.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
ng.on('exit', (code) => {
  server.close();
  process.exit(code ?? 0);
});
