import { Router } from 'express';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { dashboardQuerySchema } from './dashboard.schemas.js';
import { obtenerDashboard } from './dashboard.service.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get('/', requirePermiso('dashboard:consultar'), async (req, res) => {
  res.json(await obtenerDashboard(req.actor, dashboardQuerySchema.parse(req.query)));
});
