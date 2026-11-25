import { Injectable, signal } from '@angular/core';

/** Estado de la red: si hay señal y si lo que se ve llegó de la caché del service worker. */
@Injectable({ providedIn: 'root' })
export class Conexion {
  private readonly _enLinea = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly _desdeCache = signal(false);

  readonly enLinea = this._enLinea.asReadonly();
  /** Verdadero si la última consulta GET a la API se respondió con la cabecera `X-Desde-Cache`. */
  readonly desdeCache = this._desdeCache.asReadonly();

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this._enLinea.set(true));
    window.addEventListener('offline', () => this._enLinea.set(false));
  }

  /** Lo llama el interceptor con cada respuesta de un GET a la API. */
  registrarRespuesta(desdeCache: boolean): void {
    this._desdeCache.set(desdeCache);
  }

}
