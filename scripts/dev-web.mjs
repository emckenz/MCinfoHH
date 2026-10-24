import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const expoPort = Number(process.env.MAISON_METRO_PORT ?? 8091);
const publicPort = Number(process.env.MAISON_WEB_PORT ?? 8081);

const expo = spawn('npx', ['expo', 'start', '--web', '--port', String(expoPort)], {
  stdio: 'inherit',
  env: { ...process.env, CI: process.env.CI ?? '1', EXPO_NO_TELEMETRY: '1' },
});

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: expoPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${expoPort}` },
    },
    (incoming) => {
      const headers = { ...incoming.headers };
      headers['cross-origin-embedder-policy'] = 'credentialless';
      headers['cross-origin-opener-policy'] = 'same-origin';
      res.writeHead(incoming.statusCode ?? 502, headers);
      incoming.on('error', () => res.destroy());
      incoming.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end('Metro démarre encore.');
    } else {
      res.destroy();
    }
  });
  res.on('error', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(expoPort, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

process.on('uncaughtException', (error) => {
  console.error(error);
});

server.listen(publicPort, '127.0.0.1', () => {
  console.log(`Maison web: http://127.0.0.1:${publicPort} (COOP/COEP pour SQLite)`);
});

function stop() {
  expo.kill('SIGTERM');
  server.close();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
expo.on('exit', (code) => {
  server.close();
  process.exit(code ?? 0);
});
