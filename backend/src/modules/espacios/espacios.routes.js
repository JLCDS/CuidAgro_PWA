import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { espacioCreateSchema, espacioEstadoSchema, espaciosQuerySchema, espacioUpdateSchema } from './espacios.schemas.js';
import { actualizarEspacio, cambiarEstadoEspacio, crearEspacio, listarEspacios, obtenerEspacio } from './espacios.service.js';

const idEspacio = (valor) => idRecurso(valor, 'Espacio');

export const espaciosRouter = Router();
espaciosRouter.use(requireAuth);

espaciosRouter.get('/', requirePermiso('animales:consultar'), async (req, res) => {
  res.json({ datos: await listarEspacios(req.actor, espaciosQuerySchema.parse(req.query)) });
});

espaciosRouter.get('/:id', requirePermiso('animales:consultar'), async (req, res) => {
  res.json(await obtenerEspacio(req.actor, idEspacio(req.params.id)));
});

espaciosRouter.post('/', requirePermiso('animales:gestionar'), async (req, res) => {
  res.status(201).json(await crearEspacio(req.actor, espacioCreateSchema.parse(req.body)));
});

espaciosRouter.patch('/:id/estado', requirePermiso('animales:gestionar'), async (req, res) => {
  res.json(await cambiarEstadoEspacio(req.actor, idEspacio(req.params.id), espacioEstadoSchema.parse(req.body)));
});

espaciosRouter.patch('/:id', requirePermiso('animales:gestionar'), async (req, res) => {
  res.json(await actualizarEspacio(req.actor, idEspacio(req.params.id), espacioUpdateSchema.parse(req.body)));
});
