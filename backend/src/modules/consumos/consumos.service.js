import { Prisma } from '@prisma/client';
import { noEncontrado, prohibido, validacion } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { avisarStockAlimento } from '../../lib/push.js';
import { compararNombres, conDuplicados, filtroFincas, hoyBogota, idPorClienteId } from '../../lib/registros.js';
import { tienePermiso } from '../../lib/roles.js';
import { aConsumo } from '../../lib/serializers.js';

const LIMITE = 500;
const ORDEN_JORNADA = { NOCHE: 0, TARDE: 1, MANANA: 2 };
const MENSAJE_DUPLICADO = 'Ya hay un consumo de ese alimento en esa fecha y jornada';

/** Cada tipo de consumo (vacunos, lotes) comparte la misma lógica; solo cambian estos nombres. */
export const CONFIG_VACUNOS = {
  relacion: 'vacuno',
  campo: 'vacunoId',
  modeloConsumo: 'consumoVacuno',
  modeloAnimal: 'vacuno',
  tabla: Prisma.raw('consumos_vacunos'),
  etiqueta: 'Vacuno',
  maxGramos: 200_000,
};

export const CONFIG_LOTES = {
  relacion: 'lote',
  campo: 'loteId',
  modeloConsumo: 'consumoLote',
  modeloAnimal: 'loteOviparo',
  tabla: Prisma.raw('consumos_lotes'),
  etiqueta: 'Lote',
  maxGramos: 10_000_000,
};

const iso = (fecha) => fecha.toISOString().slice(0, 10);

export function servicioConsumos(cfg) {
  const { relacion, campo, modeloConsumo, modeloAnimal, tabla, etiqueta } = cfg;
  const include = {
    [relacion]: { select: { id: true, nombre: true, fincaId: true, finca: { select: { id: true, nombre: true } } } },
    alimento: { select: { id: true, nombre: true, stockGramos: true, stockMinimoGramos: true } },
    registradoPor: { select: { id: true, nombre: true } },
  };

  /** Un consumo de finca ajena responde igual que uno inexistente. */
  async function buscar(db, actor, id) {
    const consumo = await db[modeloConsumo].findFirst({ where: { id, [relacion]: filtroFincas(actor) }, include });
    if (!consumo) throw noEncontrado('Consumo');
    return consumo;
  }

  /** El alimento debe existir para el actor, estar activo (si se pide) y ser de la finca del animal/lote. */
  async function alimentoValido(db, actor, alimentoId, fincaId, { exigirActivo }) {
    const alimento = await db.alimento.findFirst({ where: { id: alimentoId, ...filtroFincas(actor) } });
    if (!alimento) throw noEncontrado('Alimento');
    if (alimento.fincaId !== fincaId) throw validacion('alimentoId', 'El alimento pertenece a otra finca');
    if (exigirActivo && alimento.estado !== 'ACTIVO') throw validacion('alimentoId', 'El alimento está dado de baja');
    return alimento;
  }

  /** Bloquea la fila para que dos ediciones o borrados simultáneos no devuelvan el stock dos veces. */
  const bloquear = (tx, id) => tx.$queryRaw`SELECT id FROM ${tabla} WHERE id = ${id}::uuid FOR UPDATE`;

  /** El ayudante solo toca sus consumos del día; quien gestiona, cualquiera. */
  function exigirPermisoSobre(actor, consumo) {
    if (tienePermiso(actor.rol, 'consumos:gestionar')) return;
    if (consumo.registradoPorId !== actor.id || iso(consumo.fecha) !== hoyBogota()) throw prohibido();
  }

  async function listar(actor, { fincaId, alimentoId, jornada, desde, hasta, ...resto }) {
    const consumos = await prisma[modeloConsumo].findMany({
      where: {
        [relacion]: filtroFincas(actor, fincaId),
        ...(resto[campo] ? { [campo]: resto[campo] } : {}),
        ...(alimentoId ? { alimentoId } : {}),
        ...(jornada ? { jornada } : {}),
        ...(desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      },
      include,
      orderBy: [{ fecha: 'desc' }, { jornada: 'desc' }],
      take: LIMITE,
    });
    return consumos
      .sort(
        (a, b) =>
          b.fecha - a.fecha ||
          ORDEN_JORNADA[a.jornada] - ORDEN_JORNADA[b.jornada] ||
          compararNombres(a[relacion].nombre, b[relacion].nombre) ||
          a.id.localeCompare(b.id),
      )
      .map((c) => aConsumo(c, relacion));
  }

  async function obtener(actor, id) {
    return aConsumo(await buscar(prisma, actor, id), relacion);
  }

  /** Devuelve `{ registro, creado }`: `creado` es false si el `clienteId` ya existía (reintento de un envío sin conexión). */
  async function crear(actor, datos) {
    const previo = await idPorClienteId(modeloConsumo, actor, datos.clienteId);
    if (previo) return { registro: await obtener(actor, previo), creado: false };

    const animal = await prisma[modeloAnimal].findFirst({
      where: { id: datos[campo], ...filtroFincas(actor) },
    });
    if (!animal) throw noEncontrado(etiqueta);
    // Primero los 404 (ajeno o inexistente) y después las reglas de estado.
    const alimento = await alimentoValido(prisma, actor, datos.alimentoId, animal.fincaId, { exigirActivo: false });
    if (animal.estado !== 'ACTIVO') throw validacion(campo, `${etiqueta === 'Lote' ? 'El lote' : 'El vacuno'} está dado de baja`);
    if (alimento.estado !== 'ACTIVO') throw validacion('alimentoId', 'El alimento está dado de baja');

    let id;
    let alimentoActual;
    try {
      ({ id, alimentoActual } = await conDuplicados(MENSAJE_DUPLICADO, () =>
        prisma.$transaction(async (tx) => {
          const creado = await tx[modeloConsumo].create({ data: { ...datos, registradoPorId: actor.id } });
          const actualizado = await tx.alimento.update({
            where: { id: datos.alimentoId },
            data: { stockGramos: { decrement: datos.cantidadGramos } },
          });
          return { id: creado.id, alimentoActual: actualizado };
        }),
      ));
    } catch (error) {
      // Carrera: otro envío con el mismo clienteId ganó el índice único. Este responde con el existente.
      const ganador = error?.status === 409 ? await idPorClienteId(modeloConsumo, actor, datos.clienteId) : null;
      if (!ganador) throw error;
      return { registro: await obtener(actor, ganador), creado: false };
    }
    avisarStockAlimento({ alimento: alimentoActual, stockAntes: alimentoActual.stockGramos + datos.cantidadGramos, autorId: actor.id });
    return { registro: aConsumo(await buscar(prisma, actor, id), relacion), creado: true };
  }

  async function actualizar(actor, id, datos) {
    await buscar(prisma, actor, id);
    const bajas = [];
    await conDuplicados(MENSAJE_DUPLICADO, () =>
      prisma.$transaction(async (tx) => {
        bajas.length = 0;
        await bloquear(tx, id);
        const actual = await buscar(tx, actor, id);
        exigirPermisoSobre(actor, actual);
        if (datos.fecha && !tienePermiso(actor.rol, 'consumos:gestionar') && iso(datos.fecha) !== hoyBogota()) {
          throw prohibido();
        }

        const alimentoId = datos.alimentoId ?? actual.alimentoId;
        const cambiaAlimento = alimentoId !== actual.alimentoId;
        if (cambiaAlimento) {
          await alimentoValido(tx, actor, alimentoId, actual[relacion].fincaId, { exigirActivo: true });
        }
        const cantidad = datos.cantidadGramos ?? actual.cantidadGramos;

        await tx[modeloConsumo].update({ where: { id }, data: datos });
        if (cambiaAlimento) {
          await tx.alimento.update({ where: { id: actual.alimentoId }, data: { stockGramos: { increment: actual.cantidadGramos } } });
          const nuevo = await tx.alimento.update({ where: { id: alimentoId }, data: { stockGramos: { decrement: cantidad } } });
          bajas.push({ alimento: nuevo, descuento: cantidad });
        } else if (cantidad !== actual.cantidadGramos) {
          const descuento = cantidad - actual.cantidadGramos;
          const nuevo = await tx.alimento.update({ where: { id: alimentoId }, data: { stockGramos: { decrement: descuento } } });
          if (descuento > 0) bajas.push({ alimento: nuevo, descuento });
        }
      }),
    );
    for (const { alimento, descuento } of bajas) {
      avisarStockAlimento({ alimento, stockAntes: alimento.stockGramos + descuento, autorId: actor.id });
    }
    return aConsumo(await buscar(prisma, actor, id), relacion);
  }

  async function eliminar(actor, id) {
    await buscar(prisma, actor, id);
    await prisma.$transaction(async (tx) => {
      await bloquear(tx, id);
      const actual = await buscar(tx, actor, id);
      exigirPermisoSobre(actor, actual);
      await tx[modeloConsumo].delete({ where: { id } });
      await tx.alimento.update({
        where: { id: actual.alimentoId },
        data: { stockGramos: { increment: actual.cantidadGramos } },
      });
    });
  }

  return { listar, obtener, crear, actualizar, eliminar };
}
