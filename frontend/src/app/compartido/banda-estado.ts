import { Component, inject } from '@angular/core';
import { Conexion } from '../core/conexion';
import { Pwa } from '../core/pwa';
import { Sincronizador } from '../core/sincronizador';

/** Bandas de estado de la PWA: sin conexión, datos desde la caché y versión nueva. */
@Component({
  selector: 'app-banda-estado',
  template: `
    @if (pwa.actualizacionLista()) {
      <div class="banda banda-version" role="status">
        <span>Hay una versión nueva de CuidAgro.</span>
        <button type="button" class="btn" (click)="pwa.actualizar()">Actualizar</button>
      </div>
    }
    @if (sincronizador.aviso(); as mensaje) {
      <div class="banda banda-envio" role="status">{{ mensaje }}</div>
    }
    @if (!conexion.enLinea()) {
      <div class="banda banda-sin-red" role="status">Sin conexión. Puedes seguir registrando consumos y novedades.</div>
    } @else if (conexion.desdeCache()) {
      <div class="banda banda-cache" role="status">Datos guardados, pueden no estar al día.</div>
    }
  `,
  styles: `
    .banda {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;
      padding: 8px 16px; font-size: 0.95rem; font-weight: 600; text-align: center;
    }
    .banda-sin-red { background: #3d3a33; color: #fff; }
    .banda-cache { background: #f3e3b3; color: #5a4300; }
    .banda-envio { background: var(--exito-fondo); color: var(--verde-900); }
    .banda-version { background: var(--verde-100); color: var(--verde-900); }
    .banda .btn { min-height: 36px; }
  `,
})
export class BandaEstado {
  protected readonly conexion = inject(Conexion);
  protected readonly pwa = inject(Pwa);
  protected readonly sincronizador = inject(Sincronizador);
}
