import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { loteCreateSchema, loteEstadoSchema, lotesQuerySchema, loteUpdateSchema } from './lotes.schemas.js';
import { actualizarLote, cambiarEstadoLote, crearLote, listarLotes, obtenerLote } from './lotes.service.js';

const idLote = (valor) => idRecurso(valor, 'Lote');

export const lotesRouter = Router();
lotesRouter.use(requireAuth);

lotesRouter.get('/', requirePermiso('animales:consultar'), async (req, res) => {
  res.json(await listarLotes(req.actor, lotesQuerySchema.parse(req.query)));
});

lotesRouter.get('/:id', requirePermiso('animales:consultar'), async (req, res) => {
  res.json(await obtenerLote(req.actor, idLote(req.params.id)));
});

lotesRouter.post('/', requirePermiso('animales:gestionar'), async (req, res) => {
  res.status(201).json(await crearLote(req.actor, loteCreateSchema.parse(req.body)));
});

lotesRouter.patch('/:id/estado', requirePermiso('animales:gestionar'), async (req, res) => {
  res.json(await cambiarEstadoLote(req.actor, idLote(req.params.id), loteEstadoSchema.parse(req.body)));
});

lotesRouter.patch('/:id', requirePermiso('animales:gestionar'), async (req, res) => {
  res.json(await actualizarLote(req.actor, idLote(req.params.id), loteUpdateSchema.parse(req.body)));
});
