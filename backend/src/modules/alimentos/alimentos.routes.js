import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import {
  alimentoCreateSchema,
  alimentoEstadoSchema,
  alimentosQuerySchema,
  alimentoUpdateSchema,
  entradaSchema,
} from './alimentos.schemas.js';
import {
  actualizarAlimento,
  cambiarEstadoAlimento,
  crearAlimento,
  listarAlimentos,
  listarMovimientos,
  obtenerAlimento,
  registrarEntrada,
} from './alimentos.service.js';

const idAlimento = (valor) => idRecurso(valor, 'Alimento');

export const alimentosRouter = Router();
alimentosRouter.use(requireAuth);

alimentosRouter.get('/', requirePermiso('alimentos:consultar'), async (req, res) => {
  res.json(await listarAlimentos(req.actor, alimentosQuerySchema.parse(req.query)));
});

alimentosRouter.get('/:id', requirePermiso('alimentos:consultar'), async (req, res) => {
  res.json(await obtenerAlimento(req.actor, idAlimento(req.params.id)));
});

alimentosRouter.get('/:id/movimientos', requirePermiso('alimentos:consultar'), async (req, res) => {
  res.json(await listarMovimientos(req.actor, idAlimento(req.params.id)));
});

alimentosRouter.post('/', requirePermiso('alimentos:gestionar'), async (req, res) => {
  res.status(201).json(await crearAlimento(req.actor, alimentoCreateSchema.parse(req.body)));
});

alimentosRouter.post('/:id/entradas', requirePermiso('alimentos:gestionar'), async (req, res) => {
  const id = idAlimento(req.params.id);
  res.status(201).json(await registrarEntrada(req.actor, id, entradaSchema.parse(req.body)));
});

alimentosRouter.patch('/:id/estado', requirePermiso('alimentos:gestionar'), async (req, res) => {
  res.json(await cambiarEstadoAlimento(req.actor, idAlimento(req.params.id), alimentoEstadoSchema.parse(req.body)));
});

alimentosRouter.patch('/:id', requirePermiso('alimentos:gestionar'), async (req, res) => {
  res.json(await actualizarAlimento(req.actor, idAlimento(req.params.id), alimentoUpdateSchema.parse(req.body)));
});
