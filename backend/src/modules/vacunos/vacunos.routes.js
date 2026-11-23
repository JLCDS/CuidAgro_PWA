import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { vacunoCreateSchema, vacunoEstadoSchema, vacunosQuerySchema, vacunoUpdateSchema } from './vacunos.schemas.js';
import {
  actualizarVacuno,
  cambiarEstadoVacuno,
  crearVacuno,
  listarVacunos,
  obtenerVacuno,
} from './vacunos.service.js';

const idVacuno = (valor) => idRecurso(valor, 'Vacuno');

export const vacunosRouter = Router();
vacunosRouter.use(requireAuth);

vacunosRouter.get('/', requirePermiso('animales:consultar'), async (req, res) => {
  res.json(await listarVacunos(req.actor, vacunosQuerySchema.parse(req.query)));
});

vacunosRouter.get('/:id', requirePermiso('animales:consultar'), async (req, res) => {
  res.json(await obtenerVacuno(req.actor, idVacuno(req.params.id)));
});

vacunosRouter.post('/', requirePermiso('animales:gestionar'), async (req, res) => {
  res.status(201).json(await crearVacuno(req.actor, vacunoCreateSchema.parse(req.body)));
});

vacunosRouter.patch('/:id/estado', requirePermiso('animales:gestionar'), async (req, res) => {
  res.json(await cambiarEstadoVacuno(req.actor, idVacuno(req.params.id), vacunoEstadoSchema.parse(req.body)));
});

vacunosRouter.patch('/:id', requirePermiso('animales:gestionar'), async (req, res) => {
  res.json(await actualizarVacuno(req.actor, idVacuno(req.params.id), vacunoUpdateSchema.parse(req.body)));
});
