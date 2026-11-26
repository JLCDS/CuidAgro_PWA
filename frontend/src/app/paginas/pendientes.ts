import { Component, inject } from '@angular/core';
import { ColaOffline } from '../core/cola-offline';
import { Conexion } from '../core/conexion';
import { ElementoCola, ETIQUETAS_TIPO, sujetoDe } from '../core/offline-logica';
import { Sincronizador } from '../core/sincronizador';

/** Registros hechos sin conexión que aún no llegaron al servidor. */
@Component({
  selector: 'app-pendientes',
  template: `
    <div class="cabecera-pagina">
      <h1>Pendientes de envío</h1>
      <button type="button" class="btn btn-primario" [disabled]="sincronizando() || !enLinea() || elementos().length === 0" (click)="sincronizar()">
        {{ sincronizando() ? 'Sincronizando…' : 'Sincronizar ahora' }}
      </button>
    </div>
    <p class="suave">Estos registros se guardaron en este dispositivo y se envían solos cuando vuelve la señal.</p>

    @if (!enLinea()) {
      <p class="alerta alerta-aviso" role="status">Sin conexión: se enviarán cuando vuelva la señal.</p>
    }

    @if (elementos().length === 0) {
      <div class="vacio"><img class="vacio-escena vacio-cuadrada" src="img/vacio-pendientes.webp" alt="" width="320" height="320" loading="lazy" />Todo está sincronizado: no hay registros pendientes.</div>
    } @else {
      <table class="tabla">
        <thead>
          <tr>
            <th>Registro</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (e of elementos(); track e.clienteId) {
            <tr>
              <td>
                <strong>{{ tipo(e) }}</strong>
                <div>{{ sujeto(e) }}@if (e.resumen?.detalle) { · {{ e.resumen?.detalle }} }</div>
                @if (e.foto) {
                  <span class="suave">Con foto</span>
                }
              </td>
              <td data-etiqueta="Fecha">{{ fecha(e.creadoEn) }}</td>
              <td data-etiqueta="Estado">
                @if (e.estado === 'error') {
                  <span class="insignia insignia-inactivo">Con error</span>
                  <p class="error-campo" role="alert">{{ e.error }}</p>
                } @else if (e.estado === 'enviando') {
                  <span class="insignia insignia-alerta">Enviando</span>
                } @else {
                  <span class="insignia">Pendiente</span>
                }
              </td>
              <td>
                <div class="acciones">
                  @if (e.estado === 'error') {
                    <button type="button" class="btn" (click)="reintentar(e)">Reintentar</button>
                  }
                  <button type="button" class="btn btn-peligro" (click)="descartar(e)">Descartar</button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class Pendientes {
  private readonly cola = inject(ColaOffline);
  private readonly sincronizador = inject(Sincronizador);
  private readonly conexion = inject(Conexion);

  protected readonly elementos = this.cola.elementos;
  protected readonly sincronizando = this.sincronizador.sincronizando;
  protected readonly enLinea = this.conexion.enLinea;

  constructor() {
    // El service worker pudo enviar cosas con la app cerrada.
    void this.cola.refrescar();
  }

  protected tipo(e: ElementoCola): string {
    return ETIQUETAS_TIPO[e.tipo];
  }

  protected sujeto(e: ElementoCola): string {
    return sujetoDe(e);
  }

  protected fecha(iso: string): string {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso));
  }

  protected sincronizar(): void {
    void this.sincronizador.sincronizar();
  }

  protected reintentar(e: ElementoCola): void {
    void this.sincronizador.reintentar(e);
  }

  protected descartar(e: ElementoCola): void {
    if (!confirm(`¿Descartar este registro (${this.tipo(e)}: ${this.sujeto(e)})? No se enviará al servidor.`)) return;
    void this.cola.eliminar(e.clienteId);
  }
}
