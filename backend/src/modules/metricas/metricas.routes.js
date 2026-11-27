import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { MAX_BYTES_CUERPO, metricasEnvioSchema, resumenQuerySchema } from './metricas.schemas.js';
import { registrarMetricas, resumenMetricas } from './metricas.service.js';

// sendBeacon envía el JSON como text/plain; también se acepta application/json. El límite de 4 KB aplica a ambos.
const leerCuerpo = express.text({ type: ['text/plain', 'application/json'], limit: MAX_BYTES_CUERPO });

function parsearJson(req, _res, next) {
  if (typeof req.body !== 'string') throw new AppError(400, 'SOLICITUD_INVALIDA', 'La solicitud no es válida');
  try {
    req.body = JSON.parse(req.body);
  } catch {
    throw new AppError(400, 'SOLICITUD_INVALIDA', 'La solicitud no es válida');
  }
  next();
}

/** El envío es público (sin sesión); este router se monta antes del `express.json` global para aplicar su propio límite. */
export function metricasRouter({ maxEnviosPorMinuto = 60 } = {}) {
  const router = Router();

  const limitar = rateLimit({
    windowMs: 60 * 1000,
    limit: maxEnviosPorMinuto,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'DEMASIADOS_ENVIOS', 'Demasiados envíos. Espera un minuto.')),
  });

  router.post('/', limitar, leerCuerpo, parsearJson, async (req, res) => {
    await registrarMetricas(metricasEnvioSchema.parse(req.body).metricas);
    res.status(204).end();
  });

  router.get('/resumen', requireAuth, requirePermiso('calidad:consultar'), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await resumenMetricas(resumenQuerySchema.parse(req.query)));
  });

  return router;
}
