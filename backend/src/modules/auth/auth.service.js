import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError, noAutenticado } from '../../lib/errors.js';
import { verificarSenuelo, verifyPassword } from '../../lib/passwords.js';
import { prisma } from '../../lib/prisma.js';
import { aUsuarioSesion, includeUsuario } from '../../lib/serializers.js';
import { firmarAccessToken, generarRefreshToken, hashRefreshToken } from '../../lib/tokens.js';

/**
 * Margen tras rotar un refresh token en el que el anterior sigue sirviendo.
 * Cubre pestañas simultáneas y respuestas perdidas por mala señal en el campo.
 */
export const GRACIA_ROTACION_MS = 30_000;

export const refreshTtlMs = () => env.REFRESH_TTL_DIAS * 24 * 60 * 60 * 1000;

const credencialesInvalidas = () => new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
const sesionInvalida = () => noAutenticado('Tu sesión expiró. Inicia sesión de nuevo.');

async function emitirSesion(usuario, familiaId) {
  const refreshToken = generarRefreshToken();
  await prisma.refreshToken.create({
    data: {
      usuarioId: usuario.id,
      familiaId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlMs()),
    },
  });
  return { accessToken: firmarAccessToken(usuario.id), refreshToken, usuario: aUsuarioSesion(usuario) };
}

async function revocarFamilia(familiaId) {
  await prisma.refreshToken.updateMany({ where: { familiaId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function iniciarSesion(correo, password) {
  const usuario = await prisma.usuario.findUnique({ where: { correo }, include: includeUsuario });
  if (!usuario) {
    await verificarSenuelo(password);
    throw credencialesInvalidas();
  }
  if (!(await verifyPassword(password, usuario.passwordHash))) throw credencialesInvalidas();

  // Solo se revela después de comprobar la contraseña.
  if (usuario.estado !== 'ACTIVO') {
    throw new AppError(403, 'CUENTA_DESACTIVADA', 'Tu cuenta está desactivada. Contacta al administrador.');
  }

  await prisma.refreshToken.deleteMany({ where: { usuarioId: usuario.id, expiresAt: { lt: new Date() } } });
  return emitirSesion(usuario, randomUUID());
}

export async function renovarSesion(tokenPlano) {
  if (!tokenPlano) throw sesionInvalida();

  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(tokenPlano) } });
  if (!token || token.revokedAt || token.expiresAt <= new Date()) throw sesionInvalida();

  if (token.reemplazadoAt && Date.now() - token.reemplazadoAt.getTime() > GRACIA_ROTACION_MS) {
    // Un token ya rotado reaparece fuera del margen: se asume robado y se cierra esa sesión.
    await revocarFamilia(token.familiaId);
    throw sesionInvalida();
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: token.usuarioId }, include: includeUsuario });
  if (!usuario || usuario.estado !== 'ACTIVO') throw sesionInvalida();

  await prisma.refreshToken.updateMany({
    where: { id: token.id, reemplazadoAt: null },
    data: { reemplazadoAt: new Date() },
  });
  return emitirSesion(usuario, token.familiaId);
}

export async function cerrarSesion(tokenPlano) {
  if (!tokenPlano) return;
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(tokenPlano) } });
  if (token) await revocarFamilia(token.familiaId);
}
