import { noEncontrado, validacion } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  conDuplicados,
  datosEstado,
  exigirFinca,
  exigirNombreLibre,
  filtroFincas,
  filtroListado,
  hoyBogota,
  ordenarPorNombre,
} from '../../lib/registros.js';
import { aEntradaMedicamento, aMedicamento, includeFinca } from '../../lib/serializers.js';

const MENSAJE_DUPLICADO = 'Ya existe un medicamento con ese nombre en la finca';
const LIMITE_MOVIMIENTOS = 100;
const hoy = () => new Date(`${hoyBogota()}T00:00:00Z`);

export async function listarMedicamentos(actor, { tipo, bajoStock, alerta, ...query }) {
  const medicamentos = await prisma.medicamento.findMany({
    where: { ...filtroListado(actor, query, ['nombre']), ...(tipo ? { tipo } : {}) },
    include: includeFinca,
  });
  const fecha = hoyBogota();
  let resultado = medicamentos.map((m) => aMedicamento(m, fecha));
  if (bajoStock === 'true') resultado = resultado.filter((m) => m.bajoStock);
  if (alerta === 'true') resultado = resultado.filter((m) => m.bajoStock || m.vencido || m.porVencer);
  return ordenarPorNombre(resultado);
}

/** Un medicamento de finca ajena responde igual que uno inexistente. */
async function buscar(actor, id) {
  const medicamento = await prisma.medicamento.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeFinca });
  if (!medicamento) throw noEncontrado('Medicamento');
  return medicamento;
}

export async function obtenerMedicamento(actor, id) {
  return aMedicamento(await buscar(actor, id), hoyBogota());
}

export async function crearMedicamento(actor, { stockInicial = 0, stockMinimo = 0, ...datos }) {
  await exigirFinca(actor, datos.fincaId);
  await exigirNombreLibre('medicamento', datos.fincaId, datos.nombre, MENSAJE_DUPLICADO);
  const medicamento = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.medicamento.create({
      data: {
        ...datos,
        stockMinimo,
        stock: stockInicial,
        creadoPorId: actor.id,
        ...(stockInicial > 0
          ? {
              entradas: {
                create: {
                  cantidad: stockInicial,
                  fecha: hoy(),
                  fechaVencimiento: datos.fechaVencimiento ?? null,
                  nota: 'Stock inicial',
                  registradoPorId: actor.id,
                },
              },
            }
          : {}),
      },
      include: includeFinca,
    }),
  );
  return aMedicamento(medicamento, hoyBogota());
}

export async function actualizarMedicamento(actor, id, datos) {
  const actual = await buscar(actor, id);
  if (datos.nombre !== undefined) {
    await exigirNombreLibre('medicamento', actual.fincaId, datos.nombre, MENSAJE_DUPLICADO, id);
  }
  const medicamento = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.medicamento.update({ where: { id }, data: datos, include: includeFinca }),
  );
  return aMedicamento(medicamento, hoyBogota());
}

export async function cambiarEstadoMedicamento(actor, id, cambio) {
  await buscar(actor, id);
  const medicamento = await prisma.medicamento.update({ where: { id }, data: datosEstado(cambio), include: includeFinca });
  return aMedicamento(medicamento, hoyBogota());
}

export async function registrarEntrada(actor, id, { cantidad, fecha, fechaVencimiento, nota }) {
  const actual = await buscar(actor, id);
  if (actual.estado !== 'ACTIVO') throw validacion('medicamentoId', 'El medicamento está dado de baja');
  const [entrada, medicamento] = await prisma.$transaction([
    prisma.entradaMedicamento.create({
      data: {
        medicamentoId: id,
        cantidad,
        fecha: fecha ?? hoy(),
        fechaVencimiento: fechaVencimiento ?? null,
        nota: nota ?? null,
        registradoPorId: actor.id,
      },
    }),
    prisma.medicamento.update({
      where: { id },
      data: { stock: { increment: cantidad }, ...(fechaVencimiento ? { fechaVencimiento } : {}) },
      include: includeFinca,
    }),
  ]);
  return { entrada: aEntradaMedicamento(entrada), medicamento: aMedicamento(medicamento, hoyBogota()) };
}

/** Entradas y tratamientos del medicamento, los más recientes primero. */
export async function listarMovimientos(actor, id) {
  await buscar(actor, id);
  const quien = { select: { id: true, nombre: true } };
  const tope = { take: LIMITE_MOVIMIENTOS, orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }] };
  const [entradas, tratamientos] = await Promise.all([
    prisma.entradaMedicamento.findMany({ where: { medicamentoId: id }, include: { registradoPor: quien }, ...tope }),
    prisma.tratamiento.findMany({
      where: { medicamentoId: id },
      include: { vacuno: quien, lote: quien, registradoPor: quien },
      ...tope,
    }),
  ]);
  const movimientos = [
    ...entradas.map((r) => ({ tipo: 'ENTRADA', r, cantidad: Number(r.cantidad), detalle: r.nota })),
    ...tratamientos.map((r) => ({
      tipo: 'TRATAMIENTO',
      r,
      cantidad: -Number(r.dosis),
      detalle: (r.vacuno ?? r.lote).nombre,
    })),
  ];
  return movimientos
    .sort((a, b) => b.r.fecha - a.r.fecha || b.r.createdAt - a.r.createdAt)
    .slice(0, LIMITE_MOVIMIENTOS)
    .map(({ tipo, r, cantidad, detalle }) => ({
      tipo,
      id: r.id,
      fecha: r.fecha.toISOString().slice(0, 10),
      cantidad,
      detalle,
      registradoPor: r.registradoPor,
    }));
}
