import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'cuidagro';

export function firmarAccessToken(usuarioId) {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: usuarioId,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TTL_SEGUNDOS,
  });
}

/** Devuelve el id de usuario, o null si el token no es válido. */
export function verificarAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export const generarRefreshToken = () => randomBytes(32).toString('base64url');
export const hashRefreshToken = (token) => createHash('sha256').update(token).digest('hex');
