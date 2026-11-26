import { duplicadoEn, noEncontrado, validacion } from '../../lib/errors.js';
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
import { aLote, includeLote } from '../../lib/serializers.js';
import { gramosPorFinca } from '../raciones/raciones.service.js';
import { MENSAJE_RANGO_EDAD } from './lotes.schemas.js';

const MENSAJE_DUPLICADO = 'Ya existe un lote con ese nombre en la finca';

/** Serializa lotes con la tabla de ración de su finca (una sola consulta para todos). */
async function serializar(lotes) {
  const tablas = await gramosPorFinca(lotes.map((l) => l.fincaId));
  return lotes.map((l) => aLote(l, tablas.get(l.fincaId)));
}

export async function listarLotes(actor, query) {
  const lotes = await prisma.loteOviparo.findMany({
    where: { ...filtroListado(actor, query, ['nombre']), ...(query.espacioId ? { espacioId: query.espacioId } : {}) },
    include: includeLote,
  });
  return serializar(ordenarPorNombre(lotes));
}

/** Un lote de finca ajena responde igual que uno inexistente. */
async function buscar(actor, id) {
  const lote = await prisma.loteOviparo.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeLote });
  if (!lote) throw noEncontrado('Lote');
  return lote;
}

async function responder(lote) {
  return (await serializar([lote]))[0];
}

export async function obtenerLote(actor, id) {
  return responder(await buscar(actor, id));
}

/** Otro lote activo que ocupa el espacio, o null. */
const ocupante = (espacioId, excluirId) =>
  prisma.loteOviparo.findFirst({
    where: { espacioId, estado: 'ACTIVO', ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { nombre: true, espacio: { select: { codigo: true } } },
  });

const errorOcupado = (o) => duplicadoEn('espacioId', `El espacio ${o.espacio.codigo} ya tiene el lote ${o.nombre}`);

/** El espacio debe existir en la finca del lote y estar activo; si el lote está activo, además debe estar libre. */
async function exigirEspacioUtil(fincaId, espacioId, { loteActivo, excluirId }) {
  const espacio = await prisma.espacio.findFirst({ where: { id: espacioId, fincaId } });
  if (!espacio) throw validacion('espacioId', 'Selecciona un espacio válido');
  if (espacio.estado !== 'ACTIVO') throw validacion('espacioId', 'El espacio está dado de baja');
  if (loteActivo) {
    const otro = await ocupante(espacioId, excluirId);
    if (otro) throw errorOcupado(otro);
  }
}

/** Escritura que traduce el choque de un índice único: por espacio ocupado (carrera) o por nombre repetido. */
async function escribir(espacioId, excluirId, operacion) {
  try {
    return await conDuplicados(MENSAJE_DUPLICADO, operacion);
  } catch (error) {
    if (error?.status === 409 && espacioId) {
      const otro = await ocupante(espacioId, excluirId);
      if (otro) throw errorOcupado(otro);
    }
    throw error;
  }
}

export async function crearLote(actor, datos) {
  await exigirFinca(actor, datos.fincaId);
  await exigirNombreLibre('loteOviparo', datos.fincaId, datos.nombre, MENSAJE_DUPLICADO);
  if (datos.espacioId) await exigirEspacioUtil(datos.fincaId, datos.espacioId, { loteActivo: true });
  const lote = await escribir(datos.espacioId, null, () =>
    prisma.loteOviparo.create({ data: { ...datos, creadoPorId: actor.id }, include: includeLote }),
  );
  return responder(lote);
}

export async function actualizarLote(actor, id, datos) {
  const actual = await buscar(actor, id);
  const min = datos.edadMinSemanas ?? actual.edadMinSemanas;
  const max = datos.edadMaxSemanas ?? actual.edadMaxSemanas;
  if (min > max) throw validacion('edadMinSemanas', MENSAJE_RANGO_EDAD);
  if (datos.nombre !== undefined) {
    await exigirNombreLibre('loteOviparo', actual.fincaId, datos.nombre, MENSAJE_DUPLICADO, id);
  }
  // Mantener el espacio actual no se vuelve a validar (puede haberse dado de baja después).
  if (datos.espacioId && datos.espacioId !== actual.espacioId) {
    await exigirEspacioUtil(actual.fincaId, datos.espacioId, { loteActivo: actual.estado === 'ACTIVO', excluirId: id });
  }
  const lote = await escribir(datos.espacioId, id, () =>
    prisma.loteOviparo.update({ where: { id }, data: datos, include: includeLote }),
  );
  return responder(lote);
}

export async function cambiarEstadoLote(actor, id, cambio) {
  const actual = await buscar(actor, id);
  if (cambio.estado === 'ACTIVO' && actual.estado !== 'ACTIVO' && actual.espacioId) {
    const otro = await ocupante(actual.espacioId, id);
    if (otro) throw errorOcupado(otro);
  }
  const lote = await escribir(cambio.estado === 'ACTIVO' ? actual.espacioId : null, id, () =>
    prisma.loteOviparo.update({ where: { id }, data: datosEstado(cambio), include: includeLote }),
  );
  return responder(lote);
}
