import { noEncontrado, validacion } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  conDuplicados,
  datosEstado,
  exigirFinca,
  exigirNombreLibre,
  filtroFincas,
  filtroListado,
  ordenarPorNombre,
} from '../../lib/registros.js';
import { aLote, includeFinca } from '../../lib/serializers.js';
import { MENSAJE_RANGO_EDAD } from './lotes.schemas.js';

const MENSAJE_DUPLICADO = 'Ya existe un lote con ese nombre en la finca';

export async function listarLotes(actor, query) {
  const lotes = await prisma.loteOviparo.findMany({
    where: filtroListado(actor, query, ['nombre']),
    include: includeFinca,
  });
  return ordenarPorNombre(lotes).map(aLote);
}

/** Un lote de finca ajena responde igual que uno inexistente. */
async function buscar(actor, id) {
  const lote = await prisma.loteOviparo.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeFinca });
  if (!lote) throw noEncontrado('Lote');
  return lote;
}

export async function obtenerLote(actor, id) {
  return aLote(await buscar(actor, id));
}

export async function crearLote(actor, datos) {
  await exigirFinca(actor, datos.fincaId);
  await exigirNombreLibre('loteOviparo', datos.fincaId, datos.nombre, MENSAJE_DUPLICADO);
  const lote = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.loteOviparo.create({ data: { ...datos, creadoPorId: actor.id }, include: includeFinca }),
  );
  return aLote(lote);
}

export async function actualizarLote(actor, id, datos) {
  const actual = await buscar(actor, id);
  const min = datos.edadMinSemanas ?? actual.edadMinSemanas;
  const max = datos.edadMaxSemanas ?? actual.edadMaxSemanas;
  if (min > max) throw validacion('edadMinSemanas', MENSAJE_RANGO_EDAD);
  if (datos.nombre !== undefined) {
    await exigirNombreLibre('loteOviparo', actual.fincaId, datos.nombre, MENSAJE_DUPLICADO, id);
  }
  const lote = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.loteOviparo.update({ where: { id }, data: datos, include: includeFinca }),
  );
  return aLote(lote);
}

export async function cambiarEstadoLote(actor, id, cambio) {
  await buscar(actor, id);
  return aLote(await prisma.loteOviparo.update({ where: { id }, data: datosEstado(cambio), include: includeFinca }));
}
