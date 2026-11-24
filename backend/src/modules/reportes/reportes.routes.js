import { Router } from 'express';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { consumosQuerySchema } from './reportes.schemas.js';
import { reporteConsumos } from './reportes.service.js';

export const reportesRouter = Router();
reportesRouter.use(requireAuth);
reportesRouter.get('/consumos', requirePermiso('reportes:consultar'), async (req, res) => {
  res.json(await reporteConsumos(req.actor, consumosQuerySchema.parse(req.query)));
});
