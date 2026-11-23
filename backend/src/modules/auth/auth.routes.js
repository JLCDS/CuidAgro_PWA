import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginSchema } from './auth.schemas.js';
import { cerrarSesion, iniciarSesion, refreshTtlMs, renovarSesion } from './auth.service.js';

const COOKIE_REFRESH = 'cuidagro_rt';

const opcionesCookie = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
};

function responderSesion(res, { refreshToken, ...sesion }) {
  res.cookie(COOKIE_REFRESH, refreshToken, { ...opcionesCookie, maxAge: refreshTtlMs() });
  res.set('Cache-Control', 'no-store');
  res.json(sesion);
}

export function authRouter({ loginMaxIntentos }) {
  const router = Router();

  const limitarLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginMaxIntentos,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos.')),
  });

  router.post('/login', limitarLogin, async (req, res) => {
    const { correo, password } = loginSchema.parse(req.body);
    responderSesion(res, await iniciarSesion(correo, password));
  });

  router.post('/refresh', async (req, res) => {
    try {
      responderSesion(res, await renovarSesion(req.cookies?.[COOKIE_REFRESH]));
    } catch (error) {
      if (error instanceof AppError) res.clearCookie(COOKIE_REFRESH, opcionesCookie);
      throw error;
    }
  });

  router.post('/logout', async (req, res) => {
    await cerrarSesion(req.cookies?.[COOKIE_REFRESH]);
    res.clearCookie(COOKIE_REFRESH, opcionesCookie);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.actor);
  });

  return router;
}
