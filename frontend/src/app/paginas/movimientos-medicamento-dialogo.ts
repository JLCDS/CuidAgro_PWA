import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { MedicamentosApi } from '../core/medicamentos-api';
import { formatearCantidad, Medicamento, MovimientoMedicamento } from '../core/medicamentos-modelos';
import { formatearFecha } from '../core/modelos';

@Component({
  selector: 'app-movimientos-medicamento-dialogo',
  imports: [Modal],
  template: `
    <app-modal [titulo]="'Movimientos: ' + medicamento().nombre" (cerrado)="cerrado.emit()">
      <div class="modal-cuerpo">
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }
        @if (cargando()) {
          <p class="suave" role="status">Cargando…</p>
        } @else if (movimientos().length === 0 && !error()) {
          <div class="vacio">Aún no hay movimientos.</div>
        } @else {
          <ul class="lista">
            @for (m of movimientos(); track m.tipo + m.id) {
              <li>
                <div>
                  <strong>{{ m.tipo === 'ENTRADA' ? 'Entrada' : 'Tratamiento' }}</strong>
                  <span class="suave">{{ fecha(m.fecha) }} · {{ m.registradoPor.nombre }}</span>
                  @if (m.detalle) {
                    <span class="suave">{{ m.detalle }}</span>
                  }
                </div>
                <span class="cantidad" [class.salida]="m.cantidad < 0">
                  {{ m.cantidad > 0 ? '+' : '' }}{{ cantidad(m.cantidad) }}
                </span>
              </li>
            }
          </ul>
        }
        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cerrar</button>
        </div>
      </div>
    </app-modal>
  `,
  styles: `
    .lista { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; max-height: 55vh; overflow-y: auto; }
    li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--borde); }
    li div { display: grid; min-width: 0; overflow-wrap: anywhere; }
    .cantidad { font-weight: 700; white-space: nowrap; color: var(--verde-700); }
    .cantidad.salida { color: var(--peligro); }
  `,
})
export class MovimientosMedicamentoDialogo implements OnInit {
  private readonly api = inject(MedicamentosApi);

  readonly medicamento = input.required<Medicamento>();
  readonly cerrado = output<void>();

  protected readonly fecha = formatearFecha;
  protected readonly movimientos = signal<MovimientoMedicamento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.movimientos(this.medicamento().id).subscribe({
      next: (movimientos) => {
        this.movimientos.set(movimientos);
        this.cargando.set(false);
      },
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.cargando.set(false);
      },
    });
  }

  protected cantidad(valor: number): string {
    return formatearCantidad(valor, this.medicamento().unidad);
  }
}
