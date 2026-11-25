import { noEncontrado, prohibido, validacion } from '../../lib/errors.js';
import { borrarFoto, guardarFoto, leerFoto } from '../../lib/fotos.js';
import { prisma } from '../../lib/prisma.js';
import { avisarNovedadAlta } from '../../lib/push.js';
import { filtroFincas, hoyBogota, idPorClienteId, ZONA_HORARIA } from '../../lib/registros.js';
import { tienePermiso } from '../../lib/roles.js';
import { aComentario, aNovedad, includeNovedad } from '../../lib/serializers.js';

const LIMITE = 200;

const includeDetalle = {
  ...includeNovedad,
  comentarios: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { autor: { select: { id: true, nombre: true } } },
  },
};

const diaBogota = (fecha) => fecha.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

/** Colombia no tiene horario de verano: el día siempre empieza a las 00:00 de UTC-5. */
const inicioDia = (dia) => new Date(`${dia}T00:00:00-05:00`);
const inicioDiaSiguiente = (dia) => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return inicioDia(d.toISOString().slice(0, 10));
};

async function buscar(db, actor, id, include = includeNovedad) {
  const novedad = await db.novedad.findFirst({ where: { id, ...filtroFincas(actor) }, include });
  if (!novedad) throw noEncontrado('Novedad');
  return novedad;
}

/** El ayudante solo toca sus novedades abiertas del día; quien gestiona, cualquiera. */
function exigirPermisoSobre(actor, novedad) {
  if (tienePermiso(actor.rol, 'novedades:gestionar')) return;
  if (novedad.registradoPorId !== actor.id || novedad.estado !== 'ABIERTA' || diaBogota(novedad.createdAt) !== hoyBogota()) {
    throw prohibido();
  }
}

const bloquear = (tx, id) => tx.$queryRaw`SELECT id FROM novedades WHERE id = ${id}::uuid FOR UPDATE`;

export async function listarNovedades(actor, q) {
  const { fincaId, vacunoId, loteId, tipo, prioridad, estado, desde, hasta } = q;
  const novedades = await prisma.novedad.findMany({
    where: {
      ...filtroFincas(actor, fincaId),
      ...(vacunoId ? { vacunoId } : {}),
      ...(loteId ? { loteId } : {}),
      ...(tipo ? { tipo } : {}),
      ...(prioridad ? { prioridad } : {}),
      ...(estado ? { estado } : {}),
      ...(desde || hasta
        ? {
            fechaHora: {
              ...(desde ? { gte: inicioDia(desde) } : {}),
              ...(hasta ? { lt: inicioDiaSiguiente(hasta) } : {}),
            },
          }
        : {}),
    },
    include: includeNovedad,
    orderBy: [{ fechaHora: 'desc' }, { id: 'asc' }],
    take: LIMITE,
  });
  return novedades.map(aNovedad);
}

export async function obtenerNovedad(actor, id) {
  return aNovedad(await buscar(prisma, actor, id, includeDetalle));
}

/** Devuelve `{ registro, creado }`: `creado` es false si el `clienteId` ya existía (reintento de un envío sin conexión). */
export async function crearNovedad(actor, datos, archivo) {
  const previo = await idPorClienteId('novedad', actor, datos.clienteId);
  if (previo) return { registro: aNovedad(await buscar(prisma, actor, previo)), creado: false };

  const esVacuno = Boolean(datos.vacunoId);
  const campo = esVacuno ? 'vacunoId' : 'loteId';
  const sujeto = await (esVacuno ? prisma.vacuno : prisma.loteOviparo).findFirst({
    where: { id: datos[campo], ...filtroFincas(actor) },
  });
  if (!sujeto) throw noEncontrado(esVacuno ? 'Vacuno' : 'Lote');
  if (sujeto.estado !== 'ACTIVO') throw validacion(campo, `${esVacuno ? 'El vacuno' : 'El lote'} está dado de baja`);

  const foto = archivo ? await guardarFoto(archivo.buffer) : {};
  try {
    const creada = await prisma.novedad.create({
      data: { ...datos, ...foto, fincaId: sujeto.fincaId, registradoPorId: actor.id },
    });
    const registro = await buscar(prisma, actor, creada.id);
    avisarNovedadAlta(registro, actor.id);
    return { registro: aNovedad(registro), creado: true };
  } catch (error) {
    await borrarFoto(foto.fotoArchivo);
    // Carrera: otro envío con el mismo clienteId ganó el índice único. Este responde con el existente.
    if (error?.code === 'P2002' && datos.clienteId) {
      const ganador = await idPorClienteId('novedad', actor, datos.clienteId);
      if (ganador) return { registro: aNovedad(await buscar(prisma, actor, ganador)), creado: false };
    }
    throw error;
  }
}

export async function actualizarNovedad(actor, id, datos) {
  exigirPermisoSobre(actor, await buscar(prisma, actor, id));
  await prisma.novedad.update({ where: { id }, data: datos });
  return aNovedad(await buscar(prisma, actor, id));
}

/** Reemplaza (con `archivo`) o quita (sin él) la foto y borra el archivo anterior del disco. */
export async function cambiarFoto(actor, id, archivo) {
  exigirPermisoSobre(actor, await buscar(prisma, actor, id));
  const foto = archivo ? await guardarFoto(archivo.buffer) : { fotoArchivo: null, fotoMime: null, fotoBytes: null };
  let anterior;
  try {
    anterior = await prisma.$transaction(async (tx) => {
      await bloquear(tx, id);
      const actual = await buscar(tx, actor, id);
      exigirPermisoSobre(actor, actual);
      await tx.novedad.update({ where: { id }, data: foto });
      return actual.fotoArchivo;
    });
  } catch (error) {
    await borrarFoto(foto.fotoArchivo);
    throw error;
  }
  await borrarFoto(anterior);
  return aNovedad(await buscar(prisma, actor, id));
}

export async function obtenerFoto(actor, id) {
  const novedad = await prisma.novedad.findFirst({
    where: { id, ...filtroFincas(actor) },
    select: { fotoArchivo: true, fotoMime: true },
  });
  if (!novedad) throw noEncontrado('Novedad');
  const bytes = novedad.fotoArchivo ? await leerFoto(novedad.fotoArchivo) : null;
  if (!bytes) throw noEncontrado('Foto');
  return { bytes, mime: novedad.fotoMime };
}

export async function cambiarEstadoNovedad(actor, id, { estado }) {
  const actual = await buscar(prisma, actor, id);
  const cerradaEn = estado === 'CERRADA' ? (actual.cerradaEn ?? new Date()) : null;
  await prisma.novedad.update({ where: { id }, data: { estado, cerradaEn } });
  return aNovedad(await buscar(prisma, actor, id));
}

export async function comentarNovedad(actor, id, { texto }) {
  await buscar(prisma, actor, id);
  const comentario = await prisma.comentarioNovedad.create({
    data: { novedadId: id, autorId: actor.id, texto },
    include: { autor: { select: { id: true, nombre: true } } },
  });
  return aComentario(comentario);
}
