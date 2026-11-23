import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Usa <dialog> nativo: atrapa el foco y cierra con Esc sin código adicional. */
@Component({
  selector: 'app-modal',
  template: `
    <dialog #dialogo class="modal" [attr.aria-label]="titulo()" (close)="cerrado.emit()">
      <header class="modal-cabecera">
        <h2>{{ titulo() }}</h2>
        <button type="button" class="btn-icono" aria-label="Cerrar" (click)="dialogo.close()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <ng-content />
    </dialog>
  `,
})
export class Modal {
  readonly titulo = input.required<string>();
  readonly cerrado = output<void>();
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }
}
