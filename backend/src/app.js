import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundApi } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { alimentosRouter } from './modules/alimentos/alimentos.routes.js';
import { consumosRouter } from './modules/consumos/consumos.routes.js';
import { novedadesRouter } from './modules/novedades/novedades.routes.js';
import { saludRouter } from './modules/salud/salud.routes.js';
import { medicamentosRouter } from './modules/medicamentos/medicamentos.routes.js';
import { tratamientosRouter } from './modules/tratamientos/tratamientos.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { pushRouter } from './modules/push/push.routes.js';
import { reportesRouter } from './modules/reportes/reportes.routes.js';
import { fincasRouter } from './modules/fincas/fincas.routes.js';
import { espaciosRouter } from './modules/espacios/espacios.routes.js';
import { metricasRouter } from './modules/metricas/metricas.routes.js';
import { racionesRouter } from './modules/raciones/raciones.routes.js';
import { lotesRouter } from './modules/lotes/lotes.routes.js';
import { usuariosRouter } from './modules/usuarios/usuarios.routes.js';
import { vacunosRouter } from './modules/vacunos/vacunos.routes.js';

// Build de Angular. En el despliegue la API sirve también la app, así ambas comparten
// origen y la cookie de sesión (SameSite=Strict, ruta /api/auth) funciona sin CORS.
const DIR_FRONTEND = fileURLToPath(new URL('../../frontend/dist/frontend/browser/', import.meta.url));

// Marcador que deja index.html en <app-root ngCspNonce="..."> y que cada respuesta reemplaza por su nonce.
const MARCADOR_NONCE = '__CSP_NONCE__';

const PERMISSIONS_POLICY =
  'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()';

/** Sirve el build de Angular si existe, con respaldo a index.html para las rutas de la SPA. */
function servirFrontend(app, dirFrontend) {
  const indice = path.join(dirFrontend, 'index.html');
  if (!existsSync(indice)) return;

  // El HTML se lee una vez; cada respuesta lleva su propio nonce, coherente con su CSP de estilos.
  const html = readFileSync(indice, 'utf8');
  const servirIndice = (_req, res) => {
    const nonce = randomBytes(16).toString('base64');
    const csp = res.getHeader('Content-Security-Policy');
    if (typeof csp === 'string') {
      res.setHeader('Content-Security-Policy', csp.replace(/style-src 'self'(?=;|$)/, `style-src 'self' 'nonce-${nonce}'`));
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html.replaceAll(MARCADOR_NONCE, nonce));
  };

  // Antes de express.static para que /index.html tampoco salga con el marcador sin reemplazar.
  app.get('/index.html', servirIndice);
  app.use(
    express.static(dirFrontend, {
      index: false,
      setHeaders(res, archivo) {
        // El navegador debe revisar sw.js, el HTML y el manifiesto en cada visita para detectar versiones nuevas.
        if (/(sw\.js|index\.html|\.webmanifest)$/.test(archivo)) res.setHeader('Cache-Control', 'no-cache');
        else if (/-[A-Za-z0-9]{8}\.(js|css)$/.test(archivo)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get(/.*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    servirIndice(req, res);
  });
}

export function createApp({ loginMaxIntentos = env.LOGIN_MAX_INTENTOS, metricasMaxEnvios = 60, dirFrontend = DIR_FRONTEND } = {}) {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // La vista previa de la foto y las fotos autenticadas se muestran como blob:.
          'img-src': ["'self'", 'data:', 'blob:'],
          // Sin 'unsafe-inline': solo la respuesta de index.html agrega un nonce (ver servirFrontend).
          'style-src': ["'self'"],
        },
      },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  });
  // Comprime HTML, JS, CSS y JSON; la API no usa respuestas en flujo continuo (no hay SSE).
  app.use(compression());

  const origenes = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (origenes.length > 0) app.use(cors({ origin: origenes, credentials: true }));

  // Antes del JSON global: tiene su propio límite (4 KB) y acepta el text/plain de sendBeacon.
  app.use('/api/metricas', metricasRouter({ maxEnviosPorMinuto: metricasMaxEnvios }));

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ estado: 'ok' });
  });
  app.use('/api/auth', authRouter({ loginMaxIntentos }));
  app.use('/api/usuarios', usuariosRouter);
  app.use('/api/fincas', fincasRouter);
  app.use('/api/vacunos', vacunosRouter);
  app.use('/api/lotes', lotesRouter);
  app.use('/api/espacios', espaciosRouter);
  app.use('/api/raciones', racionesRouter);
  app.use('/api/alimentos', alimentosRouter);
  app.use('/api/consumos', consumosRouter);
  app.use('/api/novedades', novedadesRouter);
  app.use('/api/salud', saludRouter);
  app.use('/api/medicamentos', medicamentosRouter);
  app.use('/api/tratamientos', tratamientosRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reportes', reportesRouter);
  app.use('/api/push', pushRouter);
  app.use('/api', notFoundApi);

  servirFrontend(app, dirFrontend);

  app.use(errorHandler);
  return app;
}
