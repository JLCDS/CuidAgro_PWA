import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../../lib/errors.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { fincaCreateSchema, fincaUpdateSchema } from './fincas.schemas.js';
import { actualizarFinca, crearFinca, listarFincas, obtenerFinca } from './fincas.service.js';

function idFinca(valor) {
  const r = z.uuid().safeParse(valor);
  if (!r.success) throw noEncontrado('Finca');
  return r.data;
}

export const fincasRouter = Router();
fincasRouter.use(requireAuth);

fincasRouter.get('/', requirePermiso('fincas:consultar'), async (req, res) => {
  res.json(await listarFincas(req.actor));
});

fincasRouter.get('/:id', requirePermiso('fincas:consultar'), async (req, res) => {
  res.json(await obtenerFinca(req.actor, idFinca(req.params.id)));
});

fincasRouter.post('/', requirePermiso('fincas:gestionar'), async (req, res) => {
  res.status(201).json(await crearFinca(fincaCreateSchema.parse(req.body)));
});

fincasRouter.patch('/:id', requirePermiso('fincas:gestionar'), async (req, res) => {
  res.json(await actualizarFinca(idFinca(req.params.id), fincaUpdateSchema.parse(req.body)));
});
