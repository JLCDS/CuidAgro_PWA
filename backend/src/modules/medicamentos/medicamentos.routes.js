import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import {
  entradaMedicamentoSchema,
  medicamentoCreateSchema,
  medicamentoEstadoSchema,
  medicamentosQuerySchema,
  medicamentoUpdateSchema,
} from './medicamentos.schemas.js';
import {
  actualizarMedicamento,
  cambiarEstadoMedicamento,
  crearMedicamento,
  listarMedicamentos,
  listarMovimientos,
  obtenerMedicamento,
  registrarEntrada,
} from './medicamentos.service.js';

const idMedicamento = (valor) => idRecurso(valor, 'Medicamento');
const consultar = requirePermiso('medicamentos:consultar');
const gestionar = requirePermiso('medicamentos:gestionar');

export const medicamentosRouter = Router();
medicamentosRouter.use(requireAuth);

medicamentosRouter.get('/', consultar, async (req, res) => {
  res.json(await listarMedicamentos(req.actor, medicamentosQuerySchema.parse(req.query)));
});

medicamentosRouter.get('/:id', consultar, async (req, res) => {
  res.json(await obtenerMedicamento(req.actor, idMedicamento(req.params.id)));
});

medicamentosRouter.get('/:id/movimientos', consultar, async (req, res) => {
  res.json(await listarMovimientos(req.actor, idMedicamento(req.params.id)));
});

medicamentosRouter.post('/', gestionar, async (req, res) => {
  res.status(201).json(await crearMedicamento(req.actor, medicamentoCreateSchema.parse(req.body)));
});

medicamentosRouter.post('/:id/entradas', gestionar, async (req, res) => {
  const id = idMedicamento(req.params.id);
  res.status(201).json(await registrarEntrada(req.actor, id, entradaMedicamentoSchema.parse(req.body)));
});

medicamentosRouter.patch('/:id/estado', gestionar, async (req, res) => {
  res.json(await cambiarEstadoMedicamento(req.actor, idMedicamento(req.params.id), medicamentoEstadoSchema.parse(req.body)));
});

medicamentosRouter.patch('/:id', gestionar, async (req, res) => {
  res.json(await actualizarMedicamento(req.actor, idMedicamento(req.params.id), medicamentoUpdateSchema.parse(req.body)));
});
