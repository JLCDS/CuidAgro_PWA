export class AppError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export const noAutenticado = (mensaje = 'Debes iniciar sesión') => new AppError(401, 'NO_AUTENTICADO', mensaje);
export const prohibido = () => new AppError(403, 'PROHIBIDO', 'No tienes permiso para realizar esta acción');
export const noEncontrado = (recurso) => new AppError(404, 'NO_ENCONTRADO', `${recurso} no encontrado`);
export const duplicado = (mensaje) => new AppError(409, 'DUPLICADO', mensaje);
/** 409 señalando el campo en `detalles`. */
export const duplicadoEn = (campo, mensaje) => Object.assign(duplicado(mensaje), { detalles: [{ campo, mensaje }] });
export const validacion = (campo, mensaje) =>
  Object.assign(new AppError(400, 'VALIDACION', 'Revisa los datos enviados'), { detalles: [{ campo, mensaje }] });
