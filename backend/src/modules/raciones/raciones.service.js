import { prisma } from '../../lib/prisma.js';
import { exigirFinca } from '../../lib/registros.js';
import { RACIONES_DEFECTO } from './raciones.defecto.js';

/** Tablas de ración de una finca: la personalizada si tiene filas para el propósito; si no, la de por defecto. */
function armarTablas(filas) {
  const tablas = {};
  for (const proposito of Object.keys(RACIONES_DEFECTO)) {
    const propias = filas.filter((f) => f.proposito === proposito).sort((a, b) => a.semana - b.semana);
    const gramos = propias.length > 0 ? propias.map((f) => f.gramosAveDia) : RACIONES_DEFECTO[proposito];
    tablas[proposito] = { personalizada: propias.length > 0, gramos };
  }
  return tablas;
}

/** Mapa fincaId -> { ALIMENTACION: number[], PRODUCCION: number[] } para calcular raciones de varios lotes. */
export async function gramosPorFinca(fincaIds) {
  const filas = await prisma.racionSemanal.findMany({ where: { fincaId: { in: [...new Set(fincaIds)] } } });
  const mapa = new Map();
  for (const fincaId of new Set(fincaIds)) {
    const tablas = armarTablas(filas.filter((f) => f.fincaId === fincaId));
    mapa.set(fincaId, { ALIMENTACION: tablas.ALIMENTACION.gramos, PRODUCCION: tablas.PRODUCCION.gramos });
  }
  return mapa;
}

async function respuesta(fincaId) {
  const tablas = armarTablas(await prisma.racionSemanal.findMany({ where: { fincaId } }));
  return {
    fincaId,
    tablas: Object.fromEntries(
      Object.entries(tablas).map(([proposito, { personalizada, gramos }]) => [
        proposito,
        { personalizada, semanas: gramos.map((gramosAveDia, i) => ({ semana: i + 1, gramosAveDia })) },
      ]),
    ),
  };
}

export async function obtenerRaciones(actor, { fincaId }) {
  await exigirFinca(actor, fincaId);
  return respuesta(fincaId);
}

export async function reemplazarRaciones(actor, { fincaId, proposito, semanas }) {
  await exigirFinca(actor, fincaId);
  await prisma.$transaction([
    prisma.racionSemanal.deleteMany({ where: { fincaId, proposito } }),
    prisma.racionSemanal.createMany({
      data: semanas.map((s) => ({ fincaId, proposito, semana: s.semana, gramosAveDia: s.gramosAveDia })),
    }),
  ]);
  return respuesta(fincaId);
}

export async function restablecerRaciones(actor, { fincaId, proposito }) {
  await exigirFinca(actor, fincaId);
  await prisma.racionSemanal.deleteMany({ where: { fincaId, proposito } });
}
