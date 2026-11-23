import { HttpErrorResponse } from '@angular/common/http';

export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No hay conexión con el servidor. Intenta de nuevo.';
    const cuerpo = error.error?.error;
    const detalle = cuerpo?.detalles?.[0]?.mensaje;
    if (detalle) return detalle;
    if (cuerpo?.mensaje) return cuerpo.mensaje;
  }
  return 'Ocurrió un error inesperado.';
}
