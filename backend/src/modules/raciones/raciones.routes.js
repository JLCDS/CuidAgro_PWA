import { Router } from 'express';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { racionesDeleteQuerySchema, racionesPutSchema, racionesQuerySchema } from './raciones.schemas.js';
import { obtenerRaciones, reemplazarRaciones, restablecerRaciones } from './raciones.service.js';

export const racionesRouter = Router();
racionesRouter.use(requireAuth);

racionesRouter.get('/', requirePermiso('animales:consultar'), async (req, res) => {
  res.json(await obtenerRaciones(req.actor, racionesQuerySchema.parse(req.query)));
});

racionesRouter.put('/', requirePermiso('alimentos:gestionar'), async (req, res) => {
  res.json(await reemplazarRaciones(req.actor, racionesPutSchema.parse(req.body)));
});

racionesRouter.delete('/', requirePermiso('alimentos:gestionar'), async (req, res) => {
  await restablecerRaciones(req.actor, racionesDeleteQuerySchema.parse(req.query));
  res.status(204).end();
});
