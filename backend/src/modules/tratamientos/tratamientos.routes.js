import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { tratamientoCreateSchema, tratamientosQuerySchema, tratamientoUpdateSchema } from './tratamientos.schemas.js';
import {
  actualizarTratamiento,
  crearTratamiento,
  eliminarTratamiento,
  listarTratamientos,
  obtenerTratamiento,
} from './tratamientos.service.js';

const idTratamiento = (valor) => idRecurso(valor, 'Tratamiento');
const consultar = requirePermiso('tratamientos:consultar');
const registrar = requirePermiso('tratamientos:registrar');

export const tratamientosRouter = Router();
tratamientosRouter.use(requireAuth);

tratamientosRouter.get('/', consultar, async (req, res) => {
  res.json(await listarTratamientos(req.actor, tratamientosQuerySchema.parse(req.query)));
});
tratamientosRouter.get('/:id', consultar, async (req, res) => {
  res.json(await obtenerTratamiento(req.actor, idTratamiento(req.params.id)));
});
tratamientosRouter.post('/', registrar, async (req, res) => {
  res.status(201).json(await crearTratamiento(req.actor, tratamientoCreateSchema.parse(req.body)));
});
tratamientosRouter.patch('/:id', registrar, async (req, res) => {
  res.json(await actualizarTratamiento(req.actor, idTratamiento(req.params.id), tratamientoUpdateSchema.parse(req.body)));
});
tratamientosRouter.delete('/:id', registrar, async (req, res) => {
  await eliminarTratamiento(req.actor, idTratamiento(req.params.id));
  res.status(204).end();
});
