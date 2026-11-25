// Servidor para probar el build de producción (y con él el service worker):
// archivos estáticos de dist/frontend/browser con respaldo a index.html (SPA)
// y proxy de /api hacia la API (por defecto http://127.0.0.1:3000).
// Variables: PUERTO (4200), API (http://127.0.0.1:3000).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(fileURLToPath(new URL('..', import.meta.url)), 'dist', 'frontend', 'browser');
const puerto = Number(process.env.PUERTO ?? 4200);
const api = new URL(process.env.API ?? 'http://127.0.0.1:3000');

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const ruta = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (ruta.startsWith('/api/')) {
    const proxy = request(
      { host: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } },
      (respuesta) => {
        res.writeHead(respuesta.statusCode ?? 502, respuesta.headers);
        respuesta.pipe(res);
      },
    );
    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { mensaje: 'La API no responde.' } }));
    });
    req.pipe(proxy);
    return;
  }

  let archivo = normalize(join(raiz, ruta));
  if (!archivo.startsWith(raiz) || !existsSync(archivo) || statSync(archivo).isDirectory()) {
    archivo = join(raiz, 'index.html'); // respaldo de la SPA
  }
  const cabeceras = { 'Content-Type': tipos[extname(archivo)] ?? 'application/octet-stream' };
  // El navegador debe revisar sw.js y el HTML en cada visita para detectar versiones nuevas.
  if (archivo.endsWith('sw.js') || archivo.endsWith('index.html')) cabeceras['Cache-Control'] = 'no-cache';
  res.writeHead(200, cabeceras);
  createReadStream(archivo).pipe(res);
}).listen(puerto, () => console.log(`CuidAgro (dist) en http://localhost:${puerto}, API en ${api.origin}`));
