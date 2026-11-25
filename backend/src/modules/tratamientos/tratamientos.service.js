import { Prisma } from '@prisma/client';
import { noEncontrado, validacion } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { avisarStockMedicamento } from '../../lib/push.js';
import { filtroFincas, hoyBogota } from '../../lib/registros.js';
import { aTratamiento, estadoVencimiento, includeTratamiento } from '../../lib/serializers.js';

const LIMITE = 500;
const TABLA = Prisma.raw('tratamientos');
const MAX_DIAS_RETIRO = 365;
const redondear = (n) => Math.round(n * 100) / 100;

const sumarDias = (fecha, dias) => new Date(fecha.getTime() + dias * 86_400_000);

/** Un tratamiento de finca ajena responde igual que uno inexistente. */
async function buscar(db, actor, id) {
  const tratamiento = await db.tratamiento.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeTratamiento });
  if (!tratamiento) throw noEncontrado('Tratamiento');
  return tratamiento;
}

/** Bloquea la fila para que dos ediciones o borrados simultáneos no devuelvan el stock dos veces. */
const bloquear = (tx, id) => tx.$queryRaw`SELECT id FROM ${TABLA} WHERE id = ${id}::uuid FOR UPDATE`;

/** El medicamento debe existir para el actor, ser de la finca del sujeto, estar activo y no vencido. */
async function medicamentoAplicable(db, actor, medicamentoId, fincaId) {
  const medicamento = await db.medicamento.findFirst({ where: { id: medicamentoId, ...filtroFincas(actor) } });
  if (!medicamento) throw noEncontrado('Medicamento');
  return { medicamento, validar: () => validarMedicamento(medicamento, fincaId) };
}

function validarMedicamento(medicamento, fincaId) {
  if (medicamento.fincaId !== fincaId) throw validacion('medicamentoId', 'El medicamento pertenece a otra finca');
  if (medicamento.estado !== 'ACTIVO') throw validacion('medicamentoId', 'El medicamento está dado de baja');
  if (estadoVencimiento(medicamento.fechaVencimiento, hoyBogota()).vencido) {
    throw validacion('medicamentoId', 'El medicamento está vencido');
  }
}

/** El caso debe existir para el actor y ser del mismo animal o lote del tratamiento. */
async function exigirCaso(db, actor, casoSaludId, { vacunoId, loteId }) {
  const caso = await db.casoSalud.findFirst({ where: { id: casoSaludId, ...filtroFincas(actor) } });
  if (!caso) throw noEncontrado('Caso de salud');
  if (caso.vacunoId !== (vacunoId ?? null) || caso.loteId !== (loteId ?? null)) {
    throw validacion('casoSaludId', 'El caso de salud pertenece a otro animal o lote');
  }
}

export async function listarTratamientos(
  actor,
  { fincaId, vacunoId, loteId, casoSaludId, medicamentoId, desde, hasta, enRetiro },
) {
  const hoy = hoyBogota();
  const soloRetiro = enRetiro === 'true';
  const rango = {
    ...(desde ? { gte: desde } : {}),
    ...(hasta ? { lte: hasta } : {}),
    // Un retiro dura como mucho un año: acota la consulta antes de calcular el fin exacto.
    ...(soloRetiro ? { gte: sumarDias(new Date(`${hoy}T00:00:00Z`), -MAX_DIAS_RETIRO) } : {}),
  };
  if (soloRetiro && desde) rango.gte = new Date(Math.max(desde.getTime(), rango.gte.getTime()));
  const tratamientos = await prisma.tratamiento.findMany({
    where: {
      ...filtroFincas(actor, fincaId),
      ...(vacunoId ? { vacunoId } : {}),
      ...(loteId ? { loteId } : {}),
      ...(casoSaludId ? { casoSaludId } : {}),
      ...(medicamentoId ? { medicamentoId } : {}),
      ...(Object.keys(rango).length > 0 ? { fecha: rango } : {}),
      ...(soloRetiro ? { OR: [{ diasRetiroCarne: { not: null } }, { diasRetiroLeche: { not: null } }] } : {}),
    },
    include: includeTratamiento,
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    ...(soloRetiro ? {} : { take: LIMITE }),
  });
  const resultado = tratamientos.map((t) => aTratamiento(t, hoy));
  return (soloRetiro ? resultado.filter((t) => t.enRetiro) : resultado).slice(0, LIMITE);
}

export async function obtenerTratamiento(actor, id) {
  return aTratamiento(await buscar(prisma, actor, id), hoyBogota());
}

export async function crearTratamiento(actor, datos) {
  const esVacuno = Boolean(datos.vacunoId);
  const campo = esVacuno ? 'vacunoId' : 'loteId';
  const sujeto = await (esVacuno ? prisma.vacuno : prisma.loteOviparo).findFirst({
    where: { id: datos[campo], ...filtroFincas(actor) },
  });
  if (!sujeto) throw noEncontrado(esVacuno ? 'Vacuno' : 'Lote');
  // Primero los 404 (ajeno o inexistente) y después las reglas de estado.
  const { medicamento, validar } = await medicamentoAplicable(prisma, actor, datos.medicamentoId, sujeto.fincaId);
  if (datos.casoSaludId) await exigirCaso(prisma, actor, datos.casoSaludId, datos);
  if (sujeto.estado !== 'ACTIVO') throw validacion(campo, `${esVacuno ? 'El vacuno' : 'El lote'} está dado de baja`);
  validar();

  let medicamentoActual;
  const id = await prisma.$transaction(async (tx) => {
    const creado = await tx.tratamiento.create({
      data: {
        ...datos,
        fecha: datos.fecha ?? new Date(`${hoyBogota()}T00:00:00Z`),
        diasRetiroCarne: datos.diasRetiroCarne === undefined ? medicamento.diasRetiroCarne : datos.diasRetiroCarne,
        diasRetiroLeche: datos.diasRetiroLeche === undefined ? medicamento.diasRetiroLeche : datos.diasRetiroLeche,
        fincaId: sujeto.fincaId,
        registradoPorId: actor.id,
      },
    });
    medicamentoActual = await tx.medicamento.update({ where: { id: medicamento.id }, data: { stock: { decrement: datos.dosis } } });
    return creado.id;
  });
  avisarStockMedicamento({
    medicamento: medicamentoActual,
    stockAntes: redondear(Number(medicamentoActual.stock) + datos.dosis),
    autorId: actor.id,
  });
  return aTratamiento(await buscar(prisma, actor, id), hoyBogota());
}

export async function actualizarTratamiento(actor, id, datos) {
  await buscar(prisma, actor, id);
  const bajas = [];
  await prisma.$transaction(async (tx) => {
    bajas.length = 0;
    await bloquear(tx, id);
    const actual = await buscar(tx, actor, id);

    const medicamentoId = datos.medicamentoId ?? actual.medicamentoId;
    const cambiaMedicamento = medicamentoId !== actual.medicamentoId;
    let nuevo = null;
    if (cambiaMedicamento) {
      const { medicamento, validar } = await medicamentoAplicable(tx, actor, medicamentoId, actual.fincaId);
      validar();
      nuevo = medicamento;
    }
    if (datos.casoSaludId) await exigirCaso(tx, actor, datos.casoSaludId, actual);

    const dosis = datos.dosis ?? Number(actual.dosis);
    const dosisActual = Number(actual.dosis);
    const data = { ...datos };
    // Al cambiar de medicamento, los días de retiro no enviados se toman del nuevo.
    if (nuevo) {
      if (datos.diasRetiroCarne === undefined) data.diasRetiroCarne = nuevo.diasRetiroCarne;
      if (datos.diasRetiroLeche === undefined) data.diasRetiroLeche = nuevo.diasRetiroLeche;
    }
    await tx.tratamiento.update({ where: { id }, data });

    if (cambiaMedicamento) {
      await tx.medicamento.update({ where: { id: actual.medicamentoId }, data: { stock: { increment: dosisActual } } });
      const nuevoMed = await tx.medicamento.update({ where: { id: medicamentoId }, data: { stock: { decrement: dosis } } });
      bajas.push({ medicamento: nuevoMed, descuento: dosis });
    } else if (dosis !== dosisActual) {
      const descuento = redondear(dosis - dosisActual);
      const nuevoMed = await tx.medicamento.update({ where: { id: medicamentoId }, data: { stock: { decrement: descuento } } });
      if (descuento > 0) bajas.push({ medicamento: nuevoMed, descuento });
    }
  });
  for (const { medicamento, descuento } of bajas) {
    avisarStockMedicamento({ medicamento, stockAntes: redondear(Number(medicamento.stock) + descuento), autorId: actor.id });
  }
  return aTratamiento(await buscar(prisma, actor, id), hoyBogota());
}

export async function eliminarTratamiento(actor, id) {
  await buscar(prisma, actor, id);
  await prisma.$transaction(async (tx) => {
    await bloquear(tx, id);
    const actual = await buscar(tx, actor, id);
    await tx.tratamiento.delete({ where: { id } });
    await tx.medicamento.update({ where: { id: actual.medicamentoId }, data: { stock: { increment: actual.dosis } } });
  });
}
