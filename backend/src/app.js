import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { lotesRouter } from './modules/lotes/lotes.routes.js';
import { usuariosRouter } from './modules/usuarios/usuarios.routes.js';
import { vacunosRouter } from './modules/vacunos/vacunos.routes.js';

// Build de Angular. En el despliegue la API sirve también la app, así ambas comparten
// origen y la cookie de sesión (SameSite=Strict, ruta /api/auth) funciona sin CORS.
const DIR_FRONTEND = fileURLToPath(new URL('../../frontend/dist/frontend/browser/', import.meta.url));

/** Sirve el build de Angular si existe, con respaldo a index.html para las rutas de la SPA. */
function servirFrontend(app) {
  const indice = path.join(DIR_FRONTEND, 'index.html');
  if (!existsSync(indice)) return;
  app.use(
    express.static(DIR_FRONTEND, {
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
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  });
}

export function createApp({ loginMaxIntentos = env.LOGIN_MAX_INTENTOS } = {}) {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // La vista previa de la foto y las fotos autenticadas se muestran como blob:.
          'img-src': ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  );

  const origenes = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (origenes.length > 0) app.use(cors({ origin: origenes, credentials: true }));

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

  servirFrontend(app);

  app.use(errorHandler);
  return app;
}
