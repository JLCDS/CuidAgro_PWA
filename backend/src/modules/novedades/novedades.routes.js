import { Router } from 'express';
import { validacion } from '../../lib/errors.js';
import { leerMultipart, sinCamposVacios } from '../../lib/fotos.js';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import {
  comentarioSchema,
  novedadCreateSchema,
  novedadEstadoSchema,
  novedadesQuerySchema,
  novedadUpdateSchema,
} from './novedades.schemas.js';
import {
  actualizarNovedad,
  cambiarEstadoNovedad,
  cambiarFoto,
  comentarNovedad,
  crearNovedad,
  listarNovedades,
  obtenerFoto,
  obtenerNovedad,
} from './novedades.service.js';

const idNovedad = (valor) => idRecurso(valor, 'Novedad');
const registrar = requirePermiso('novedades:registrar');
const gestionar = requirePermiso('novedades:gestionar');

export const novedadesRouter = Router();
novedadesRouter.use(requireAuth);

novedadesRouter.get('/', registrar, async (req, res) => {
  res.json(await listarNovedades(req.actor, novedadesQuerySchema.parse(req.query)));
});

novedadesRouter.get('/:id', registrar, async (req, res) => {
  res.json(await obtenerNovedad(req.actor, idNovedad(req.params.id)));
});

novedadesRouter.post('/', registrar, async (req, res) => {
  let cuerpo = req.body;
  if (req.is('multipart/form-data')) {
    await leerMultipart(req, res);
    cuerpo = sinCamposVacios(req.body);
  }
  const datos = novedadCreateSchema.parse(cuerpo);
  const { registro, creado } = await crearNovedad(req.actor, datos, req.file);
  res.status(creado ? 201 : 200).json(registro);
});

novedadesRouter.patch('/:id', registrar, async (req, res) => {
  res.json(await actualizarNovedad(req.actor, idNovedad(req.params.id), novedadUpdateSchema.parse(req.body)));
});

novedadesRouter.put('/:id/foto', registrar, async (req, res) => {
  const id = idNovedad(req.params.id);
  if (!req.is('multipart/form-data')) throw validacion('foto', 'Envía la foto como multipart/form-data');
  await leerMultipart(req, res);
  if (!req.file) throw validacion('foto', 'Adjunta una imagen');
  res.json(await cambiarFoto(req.actor, id, req.file));
});

novedadesRouter.delete('/:id/foto', registrar, async (req, res) => {
  res.json(await cambiarFoto(req.actor, idNovedad(req.params.id), null));
});

novedadesRouter.get('/:id/foto', registrar, async (req, res) => {
  const { bytes, mime } = await obtenerFoto(req.actor, idNovedad(req.params.id));
  res.set({
    'Content-Type': mime,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(bytes);
});

novedadesRouter.patch('/:id/estado', gestionar, async (req, res) => {
  res.json(await cambiarEstadoNovedad(req.actor, idNovedad(req.params.id), novedadEstadoSchema.parse(req.body)));
});

novedadesRouter.post('/:id/comentarios', registrar, async (req, res) => {
  res.status(201).json(await comentarNovedad(req.actor, idNovedad(req.params.id), comentarioSchema.parse(req.body)));
});
