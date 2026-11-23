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
import { aAlimento, aEntrada, includeFinca } from '../../lib/serializers.js';

const MENSAJE_DUPLICADO = 'Ya existe un alimento con ese nombre en la finca';
const LIMITE_MOVIMIENTOS = 100;
const hoy = () => new Date(`${hoyBogota()}T00:00:00Z`);

export async function listarAlimentos(actor, { tipo, bajoStock, ...query }) {
  const alimentos = await prisma.alimento.findMany({
    where: { ...filtroListado(actor, query, ['nombre']), ...(tipo ? { tipo } : {}) },
    include: includeFinca,
  });
  const visibles = bajoStock === 'true' ? alimentos.filter((a) => a.stockGramos <= a.stockMinimoGramos) : alimentos;
  return ordenarPorNombre(visibles).map(aAlimento);
}

/** Un alimento de finca ajena responde igual que uno inexistente. */
async function buscar(actor, id) {
  const alimento = await prisma.alimento.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeFinca });
  if (!alimento) throw noEncontrado('Alimento');
  return alimento;
}

export async function obtenerAlimento(actor, id) {
  return aAlimento(await buscar(actor, id));
}

export async function crearAlimento(actor, { stockInicialGramos = 0, stockMinimoGramos = 0, ...datos }) {
  await exigirFinca(actor, datos.fincaId);
  await exigirNombreLibre('alimento', datos.fincaId, datos.nombre, MENSAJE_DUPLICADO);
  const alimento = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.alimento.create({
      data: {
        ...datos,
        stockMinimoGramos,
        stockGramos: stockInicialGramos,
        creadoPorId: actor.id,
        ...(stockInicialGramos > 0
          ? {
              entradas: {
                create: {
                  cantidadGramos: stockInicialGramos,
                  fecha: hoy(),
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
  return aAlimento(alimento);
}

export async function actualizarAlimento(actor, id, datos) {
  const actual = await buscar(actor, id);
  if (datos.nombre !== undefined) {
    await exigirNombreLibre('alimento', actual.fincaId, datos.nombre, MENSAJE_DUPLICADO, id);
  }
  const alimento = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.alimento.update({ where: { id }, data: datos, include: includeFinca }),
  );
  return aAlimento(alimento);
}

export async function cambiarEstadoAlimento(actor, id, cambio) {
  await buscar(actor, id);
  return aAlimento(await prisma.alimento.update({ where: { id }, data: datosEstado(cambio), include: includeFinca }));
}

export async function registrarEntrada(actor, id, { cantidadGramos, fecha, nota }) {
  const actual = await buscar(actor, id);
  if (actual.estado !== 'ACTIVO') throw validacion('alimentoId', 'El alimento está dado de baja');
  const [entrada, alimento] = await prisma.$transaction([
    prisma.entradaAlimento.create({
      data: { alimentoId: id, cantidadGramos, fecha: fecha ?? hoy(), nota: nota ?? null, registradoPorId: actor.id },
    }),
    prisma.alimento.update({
      where: { id },
      data: { stockGramos: { increment: cantidadGramos } },
      include: includeFinca,
    }),
  ]);
  return { entrada: aEntrada(entrada), alimento: aAlimento(alimento) };
}

/** Entradas y consumos del alimento, los más recientes primero. */
export async function listarMovimientos(actor, id) {
  await buscar(actor, id);
  const quien = { select: { id: true, nombre: true } };
  const tope = { take: LIMITE_MOVIMIENTOS, orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }] };
  const [entradas, vacunos, lotes] = await Promise.all([
    prisma.entradaAlimento.findMany({ where: { alimentoId: id }, include: { registradoPor: quien }, ...tope }),
    prisma.consumoVacuno.findMany({ where: { alimentoId: id }, include: { vacuno: quien, registradoPor: quien }, ...tope }),
    prisma.consumoLote.findMany({ where: { alimentoId: id }, include: { lote: quien, registradoPor: quien }, ...tope }),
  ]);
  const movimientos = [
    ...entradas.map((r) => ({ tipo: 'ENTRADA', r, cantidadGramos: r.cantidadGramos, detalle: r.nota })),
    ...vacunos.map((r) => ({ tipo: 'CONSUMO_VACUNO', r, cantidadGramos: -r.cantidadGramos, detalle: r.vacuno.nombre })),
    ...lotes.map((r) => ({ tipo: 'CONSUMO_LOTE', r, cantidadGramos: -r.cantidadGramos, detalle: r.lote.nombre })),
  ];
  return movimientos
    .sort((a, b) => b.r.fecha - a.r.fecha || b.r.createdAt - a.r.createdAt)
    .slice(0, LIMITE_MOVIMIENTOS)
    .map(({ tipo, r, cantidadGramos, detalle }) => ({
      tipo,
      id: r.id,
      fecha: r.fecha.toISOString().slice(0, 10),
      cantidadGramos,
      detalle,
      registradoPor: r.registradoPor,
    }));
}
