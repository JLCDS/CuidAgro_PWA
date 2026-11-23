import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../../lib/errors.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import {
  usuarioCreateSchema,
  usuarioEstadoSchema,
  usuariosQuerySchema,
  usuarioUpdateSchema,
} from './usuarios.schemas.js';
import {
  actualizarUsuario,
  cambiarEstadoUsuario,
  crearUsuario,
  listarUsuarios,
  obtenerUsuario,
} from './usuarios.service.js';

/** Un id mal formado se trata como inexistente. */
function idUsuario(valor) {
  const r = z.uuid().safeParse(valor);
  if (!r.success) throw noEncontrado('Usuario');
  return r.data;
}

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth, requirePermiso('usuarios:gestionar'));

usuariosRouter.get('/', async (req, res) => {
  res.json(await listarUsuarios(usuariosQuerySchema.parse(req.query)));
});

usuariosRouter.post('/', async (req, res) => {
  res.status(201).json(await crearUsuario(usuarioCreateSchema.parse(req.body)));
});

usuariosRouter.get('/:id', async (req, res) => {
  res.json(await obtenerUsuario(idUsuario(req.params.id)));
});

usuariosRouter.patch('/:id', async (req, res) => {
  res.json(await actualizarUsuario(idUsuario(req.params.id), usuarioUpdateSchema.parse(req.body)));
});

usuariosRouter.patch('/:id/estado', async (req, res) => {
  const { estado } = usuarioEstadoSchema.parse(req.body);
  res.json(await cambiarEstadoUsuario(idUsuario(req.params.id), estado));
});
