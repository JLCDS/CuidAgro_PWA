import { noAutenticado, prohibido } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { tienePermiso } from '../lib/roles.js';
import { aUsuarioSesion, includeUsuario } from '../lib/serializers.js';
import { verificarAccessToken } from '../lib/tokens.js';

/** Consulta el usuario en cada petición para que desactivarlo o cambiar su rol surta efecto de inmediato. */
export async function requireAuth(req, _res, next) {
  const [esquema, token] = req.headers.authorization?.split(' ') ?? [];
  const usuarioId = esquema === 'Bearer' && token ? verificarAccessToken(token) : null;
  if (!usuarioId) throw noAutenticado();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: includeUsuario });
  if (!usuario || usuario.estado !== 'ACTIVO') throw noAutenticado();

  req.actor = aUsuarioSesion(usuario);
  next();
}

export function requirePermiso(permiso) {
  return (req, _res, next) => {
    if (!tienePermiso(req.actor.rol, permiso)) throw prohibido();
    next();
  };
}

/** El administrador tiene alcance global; el resto solo sus fincas asignadas. */
export function puedeAccederFinca(actor, fincaId) {
  return actor.rol === 'ADMINISTRADOR' || actor.fincas.some((f) => f.id === fincaId);
}
