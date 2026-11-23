import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const responder = (res, status, error) => res.status(status).json({ error });

export function notFoundApi(_req, res) {
  responder(res, 404, { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'Recurso no encontrado' });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return responder(res, err.status, { codigo: err.codigo, mensaje: err.message, detalles: err.detalles });
  }
  if (err instanceof ZodError) {
    return responder(res, 400, {
      codigo: 'VALIDACION',
      mensaje: 'Revisa los datos enviados',
      detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }
  if (err?.code === 'P2034') {
    return responder(res, 409, { codigo: 'CONFLICTO', mensaje: 'Otra operación modificó estos datos. Intenta de nuevo.' });
  }
  // Errores de body-parser: JSON malformado o cuerpo demasiado grande.
  if (err?.status === 400) {
    return responder(res, 400, { codigo: 'SOLICITUD_INVALIDA', mensaje: 'La solicitud no es válida' });
  }
  if (err?.status === 413) {
    return responder(res, 413, { codigo: 'DEMASIADO_GRANDE', mensaje: 'La solicitud es demasiado grande' });
  }

  if (env.NODE_ENV !== 'test') console.error(err);
  return responder(res, 500, { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
}
