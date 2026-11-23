import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { casoCreateSchema, casosQuerySchema, casoUpdateSchema } from './salud.schemas.js';
import { actualizarCaso, crearCaso, listarCasos, obtenerCaso } from './salud.service.js';

const idCaso = (valor) => idRecurso(valor, 'Caso de salud');
const consultar = requirePermiso('salud:consultar');
const gestionar = requirePermiso('salud:gestionar');

const casosRouter = Router();
casosRouter.get('/', consultar, async (req, res) => {
  res.json(await listarCasos(req.actor, casosQuerySchema.parse(req.query)));
});
casosRouter.get('/:id', consultar, async (req, res) => {
  res.json(await obtenerCaso(req.actor, idCaso(req.params.id)));
});
casosRouter.post('/', gestionar, async (req, res) => {
  res.status(201).json(await crearCaso(req.actor, casoCreateSchema.parse(req.body)));
});
casosRouter.patch('/:id', gestionar, async (req, res) => {
  res.json(await actualizarCaso(req.actor, idCaso(req.params.id), casoUpdateSchema.parse(req.body)));
});

export const saludRouter = Router();
saludRouter.use(requireAuth);
saludRouter.use('/casos', casosRouter);
