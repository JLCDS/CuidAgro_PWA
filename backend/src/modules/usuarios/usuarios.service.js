import { AppError, noEncontrado } from '../../lib/errors.js';
import { hashPassword } from '../../lib/passwords.js';
import { prisma } from '../../lib/prisma.js';
import { rolRequiereFinca } from '../../lib/roles.js';
import { aUsuarioDetalle, includeUsuario } from '../../lib/serializers.js';
import { MENSAJE_REQUIERE_FINCA } from './usuarios.schemas.js';

const SERIALIZABLE = { isolationLevel: 'Serializable' };

function traducirCorreoDuplicado(error) {
  if (error?.code === 'P2002') return new AppError(409, 'CORREO_EN_USO', 'Ya existe un usuario con ese correo');
  return error;
}

async function buscarRolId(tx, nombre) {
  const rol = await tx.rol.findUniqueOrThrow({ where: { nombre } });
  return rol.id;
}

async function validarFincas(tx, fincaIds) {
  const existentes = await tx.finca.count({ where: { id: { in: fincaIds } } });
  if (existentes !== fincaIds.length) throw new AppError(422, 'FINCA_INVALIDA', 'Alguna finca seleccionada no existe');
}

/** Debe ejecutarse en una transacción Serializable para resistir bajas simultáneas. */
async function exigirOtroAdminActivo(tx, usuarioId) {
  const otros = await tx.usuario.count({
    where: { id: { not: usuarioId }, estado: 'ACTIVO', rol: { nombre: 'ADMINISTRADOR' } },
  });
  if (otros === 0) throw new AppError(422, 'ULTIMO_ADMINISTRADOR', 'Debe quedar al menos un administrador activo');
}

const revocarSesiones = (tx, usuarioId) =>
  tx.refreshToken.updateMany({ where: { usuarioId, revokedAt: null }, data: { revokedAt: new Date() } });

export async function listarUsuarios({ q, rol, estado, page, pageSize }) {
  const where = {
    ...(estado && { estado }),
    ...(rol && { rol: { nombre: rol } }),
    ...(q && {
      OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { correo: { contains: q, mode: 'insensitive' } }],
    }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.usuario.findMany({
      where,
      include: includeUsuario,
      orderBy: { nombre: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.usuario.count({ where }),
  ]);
  return { items: items.map(aUsuarioDetalle), total, page, pageSize };
}

export async function obtenerUsuario(id) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, include: includeUsuario });
  if (!usuario) throw noEncontrado('Usuario');
  return aUsuarioDetalle(usuario);
}

export async function crearUsuario(datos) {
  const fincaIds = datos.rol === 'ADMINISTRADOR' ? [] : [...new Set(datos.fincaIds)];
  const passwordHash = await hashPassword(datos.password);
  try {
    const usuario = await prisma.$transaction(async (tx) => {
      await validarFincas(tx, fincaIds);
      return tx.usuario.create({
        data: {
          nombre: datos.nombre,
          correo: datos.correo,
          passwordHash,
          rolId: await buscarRolId(tx, datos.rol),
          fincas: { create: fincaIds.map((fincaId) => ({ fincaId })) },
        },
        include: includeUsuario,
      });
    });
    return aUsuarioDetalle(usuario);
  } catch (error) {
    throw traducirCorreoDuplicado(error);
  }
}

export async function actualizarUsuario(id, datos) {
  const passwordHash = datos.password ? await hashPassword(datos.password) : undefined;
  try {
    const usuario = await prisma.$transaction(async (tx) => {
      const actual = await tx.usuario.findUnique({ where: { id }, include: includeUsuario });
      if (!actual) throw noEncontrado('Usuario');

      const rolActual = actual.rol.nombre;
      const rolFinal = datos.rol ?? rolActual;
      if (rolActual === 'ADMINISTRADOR' && rolFinal !== 'ADMINISTRADOR' && actual.estado === 'ACTIVO') {
        await exigirOtroAdminActivo(tx, id);
      }

      const fincaIdsFinal =
        rolFinal === 'ADMINISTRADOR' ? [] : [...new Set(datos.fincaIds ?? actual.fincas.map((f) => f.fincaId))];
      if (rolRequiereFinca(rolFinal) && fincaIdsFinal.length === 0) {
        throw new AppError(422, 'FINCA_REQUERIDA', MENSAJE_REQUIERE_FINCA);
      }
      await validarFincas(tx, fincaIdsFinal);

      if (passwordHash) await revocarSesiones(tx, id);

      return tx.usuario.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          correo: datos.correo,
          passwordHash,
          rolId: datos.rol ? await buscarRolId(tx, datos.rol) : undefined,
          fincas: { deleteMany: {}, create: fincaIdsFinal.map((fincaId) => ({ fincaId })) },
        },
        include: includeUsuario,
      });
    }, SERIALIZABLE);
    return aUsuarioDetalle(usuario);
  } catch (error) {
    throw traducirCorreoDuplicado(error);
  }
}

export async function cambiarEstadoUsuario(id, estado) {
  const usuario = await prisma.$transaction(async (tx) => {
    const actual = await tx.usuario.findUnique({ where: { id }, include: { rol: true } });
    if (!actual) throw noEncontrado('Usuario');

    if (estado === 'INACTIVO') {
      if (actual.rol.nombre === 'ADMINISTRADOR' && actual.estado === 'ACTIVO') {
        await exigirOtroAdminActivo(tx, id);
      }
      await revocarSesiones(tx, id);
    }
    return tx.usuario.update({ where: { id }, data: { estado }, include: includeUsuario });
  }, SERIALIZABLE);
  return aUsuarioDetalle(usuario);
}
