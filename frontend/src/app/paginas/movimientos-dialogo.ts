import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { Modal } from '../compartido/modal';
import { AlimentosApi } from '../core/alimentos-api';
import { mensajeDeError } from '../core/errores';
import { Alimento, formatearFecha, formatearGramos, Movimiento } from '../core/modelos';

@Component({
  selector: 'app-movimientos-dialogo',
  imports: [Modal],
  template: `
    <app-modal [titulo]="'Movimientos: ' + alimento().nombre" (cerrado)="cerrado.emit()">
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
                  <strong>{{ titulo(m) }}</strong>
                  <span class="suave">{{ fecha(m.fecha) }} · {{ m.registradoPor.nombre }}</span>
                  @if (m.detalle) {
                    <span class="suave">{{ m.detalle }}</span>
                  }
                </div>
                <span class="cantidad" [class.salida]="m.cantidadGramos < 0">
                  {{ m.cantidadGramos > 0 ? '+' : '' }}{{ gramos(m.cantidadGramos) }}
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
export class MovimientosDialogo implements OnInit {
  private readonly api = inject(AlimentosApi);

  readonly alimento = input.required<Alimento>();
  readonly cerrado = output<void>();

  protected readonly gramos = formatearGramos;
  protected readonly fecha = formatearFecha;
  protected readonly movimientos = signal<Movimiento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.movimientos(this.alimento().id).subscribe({
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

  protected titulo(m: Movimiento): string {
    return m.tipo === 'ENTRADA' ? 'Entrada' : m.tipo === 'CONSUMO_VACUNO' ? 'Consumo de vacuno' : 'Consumo de lote';
  }
}
