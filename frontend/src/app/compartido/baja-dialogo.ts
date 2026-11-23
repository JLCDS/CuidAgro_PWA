import { Component, input, output, signal } from '@angular/core';
import { Modal } from './modal';

/** Pide el motivo antes de dar de baja un registro. */
@Component({
  selector: 'app-baja-dialogo',
  imports: [Modal],
  template: `
    <app-modal [titulo]="titulo()" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" (submit)="enviar($event)" novalidate>
        <p>{{ descripcion() }}</p>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }
        <div class="campo">
          <label for="baja-motivo">Motivo de la baja</label>
          <textarea id="baja-motivo" class="input" maxlength="500" [value]="motivo()"
            [class.invalido]="intento() && !valido()" (input)="motivo.set($any($event.target).value)"></textarea>
          @if (intento() && !valido()) {
            <span class="error-campo">Indica el motivo de la baja.</span>
          }
        </div>
        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-peligro" [disabled]="trabajando()">
            {{ trabajando() ? 'Guardando…' : 'Dar de baja' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class BajaDialogo {
  readonly titulo = input.required<string>();
  readonly descripcion = input.required<string>();
  readonly trabajando = input(false);
  readonly error = input<string | null>(null);
  readonly confirmado = output<string>();
  readonly cerrado = output<void>();

  protected readonly motivo = signal('');
  protected readonly intento = signal(false);

  protected valido(): boolean {
    return this.motivo().trim().length > 0;
  }

  protected enviar(evento: Event): void {
    evento.preventDefault();
    this.intento.set(true);
    if (this.valido()) this.confirmado.emit(this.motivo().trim());
  }
}
