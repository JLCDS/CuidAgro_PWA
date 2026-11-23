import { noEncontrado, validacion } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { filtroFincas, hoyBogota } from '../../lib/registros.js';
import { aCasoSalud, ESTADOS_CASO_ACTIVOS, includeCaso } from '../../lib/serializers.js';

const LIMITE = 500;

const esActivo = (estado) => ESTADOS_CASO_ACTIVOS.includes(estado);

async function buscar(actor, id) {
  const caso = await prisma.casoSalud.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeCaso });
  if (!caso) throw noEncontrado('Caso de salud');
  return caso;
}

/** La novedad de origen debe existir para el actor y ser del mismo animal o lote del caso. */
async function exigirNovedad(actor, novedadId, { vacunoId, loteId }) {
  const novedad = await prisma.novedad.findFirst({ where: { id: novedadId, ...filtroFincas(actor) } });
  if (!novedad) throw noEncontrado('Novedad');
  if (novedad.vacunoId !== (vacunoId ?? null) || novedad.loteId !== (loteId ?? null)) {
    throw validacion('novedadId', 'La novedad pertenece a otro animal o lote');
  }
}

/** `animalesAfectados` solo aplica a lotes y no puede superar su cantidad. */
function exigirAnimalesAfectados(valor, lote) {
  if (valor === null || valor === undefined) return;
  if (!lote) throw validacion('animalesAfectados', 'Solo aplica a lotes de ovíparos');
  if (valor > lote.cantidad) {
    throw validacion('animalesAfectados', `No puede superar la cantidad del lote (${lote.cantidad})`);
  }
}

/** Resuelve `fechaFin` según el estado resultante: activo la limpia; final la exige (hoy por defecto). */
function resolverFechaFin(estado, fechaInicio, propuesta) {
  if (esActivo(estado)) return null;
  const fin = propuesta ?? new Date(`${hoyBogota()}T00:00:00Z`);
  if (fin < fechaInicio) throw validacion('fechaFin', 'La fecha de fin no puede ser anterior al inicio');
  return fin;
}

export async function listarCasos(actor, { fincaId, vacunoId, loteId, estado, activos }) {
  const condiciones = [];
  if (estado) condiciones.push({ estado });
  if (activos !== undefined) {
    condiciones.push({ estado: activos ? { in: ESTADOS_CASO_ACTIVOS } : { notIn: ESTADOS_CASO_ACTIVOS } });
  }
  const casos = await prisma.casoSalud.findMany({
    where: {
      ...filtroFincas(actor, fincaId),
      ...(vacunoId ? { vacunoId } : {}),
      ...(loteId ? { loteId } : {}),
      ...(condiciones.length > 0 ? { AND: condiciones } : {}),
    },
    include: includeCaso,
    orderBy: [{ fechaInicio: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    take: LIMITE,
  });
  return casos.map(aCasoSalud);
}

export async function obtenerCaso(actor, id) {
  return aCasoSalud(await buscar(actor, id));
}

export async function crearCaso(actor, datos) {
  const esVacuno = Boolean(datos.vacunoId);
  const campo = esVacuno ? 'vacunoId' : 'loteId';
  const sujeto = await (esVacuno ? prisma.vacuno : prisma.loteOviparo).findFirst({
    where: { id: datos[campo], ...filtroFincas(actor) },
  });
  if (!sujeto) throw noEncontrado(esVacuno ? 'Vacuno' : 'Lote');
  if (sujeto.estado !== 'ACTIVO') throw validacion(campo, `${esVacuno ? 'El vacuno' : 'El lote'} está dado de baja`);

  exigirAnimalesAfectados(datos.animalesAfectados, esVacuno ? null : sujeto);
  if (datos.novedadId) await exigirNovedad(actor, datos.novedadId, datos);

  const estado = datos.estado ?? 'EN_OBSERVACION';
  const fechaInicio = datos.fechaInicio ?? new Date(`${hoyBogota()}T00:00:00Z`);
  const fechaFin = resolverFechaFin(estado, fechaInicio, datos.fechaFin);

  const creado = await prisma.casoSalud.create({
    data: { ...datos, estado, fechaInicio, fechaFin, fincaId: sujeto.fincaId, registradoPorId: actor.id },
  });
  return aCasoSalud(await buscar(actor, creado.id));
}

export async function actualizarCaso(actor, id, datos) {
  const actual = await buscar(actor, id);
  const sujeto = { vacunoId: actual.vacunoId, loteId: actual.loteId };

  if (datos.animalesAfectados !== undefined) {
    const lote = actual.loteId ? await prisma.loteOviparo.findUnique({ where: { id: actual.loteId } }) : null;
    exigirAnimalesAfectados(datos.animalesAfectados, lote);
  }
  if (datos.novedadId) await exigirNovedad(actor, datos.novedadId, sujeto);

  const estado = datos.estado ?? actual.estado;
  const fechaInicio = datos.fechaInicio ?? actual.fechaInicio;
  const fechaFin = resolverFechaFin(estado, fechaInicio, datos.fechaFin ?? actual.fechaFin);

  await prisma.casoSalud.update({ where: { id }, data: { ...datos, estado, fechaInicio, fechaFin } });
  return aCasoSalud(await buscar(actor, id));
}
