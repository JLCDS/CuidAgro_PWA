import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundApi } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { alimentosRouter } from './modules/alimentos/alimentos.routes.js';
import { consumosRouter } from './modules/consumos/consumos.routes.js';
import { fincasRouter } from './modules/fincas/fincas.routes.js';
import { lotesRouter } from './modules/lotes/lotes.routes.js';
import { usuariosRouter } from './modules/usuarios/usuarios.routes.js';
import { vacunosRouter } from './modules/vacunos/vacunos.routes.js';

export function createApp({ loginMaxIntentos = env.LOGIN_MAX_INTENTOS } = {}) {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());

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
  app.use('/api', notFoundApi);

  app.use(errorHandler);
  return app;
}
