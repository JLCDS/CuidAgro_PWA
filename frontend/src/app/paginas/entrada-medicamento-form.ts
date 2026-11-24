import { Component, inject, input, output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { MedicamentosApi } from '../core/medicamentos-api';
import { formatearCantidad, Medicamento, UNIDADES_MEDICAMENTO } from '../core/medicamentos-modelos';
import { etiquetaDe, hoyBogota } from '../core/modelos';
import { erroresPorCampo } from '../core/salud-modelos';

const noFutura = (control: AbstractControl<string>): ValidationErrors | null => (control.value > hoyBogota() ? { futura: true } : null);

@Component({
  selector: 'app-entrada-medicamento-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="'Registrar entrada: ' + medicamento().nombre" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <p class="suave">Stock actual: {{ stock() }}</p>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="em-cantidad">Cantidad ({{ unidad() }})</label>
          <input id="em-cantidad" class="input" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01"
            formControlName="cantidad" [class.invalido]="(form.controls.cantidad.invalid && form.controls.cantidad.touched) || !!servidor('cantidad')" />
          @if (form.controls.cantidad.invalid && form.controls.cantidad.touched) {
            <span class="error-campo">Ingresa una cantidad mayor que 0 y hasta 1.000.000, con máximo 2 decimales.</span>
          } @else if (servidor('cantidad'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="campo">
          <label for="em-fecha">Fecha</label>
          <input id="em-fecha" class="input" type="date" [max]="hoy" formControlName="fecha"
            [class.invalido]="(form.controls.fecha.invalid && form.controls.fecha.touched) || !!servidor('fecha')" />
          @if (form.controls.fecha.invalid && form.controls.fecha.touched) {
            <span class="error-campo">Ingresa una fecha que no sea futura.</span>
          } @else if (servidor('fecha'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="campo">
          <label for="em-vence">Nuevo vencimiento (opcional)</label>
          <input id="em-vence" class="input" type="date" formControlName="fechaVencimiento" [class.invalido]="!!servidor('fechaVencimiento')" />
          @if (servidor('fechaVencimiento'); as e) {
            <span class="error-campo">{{ e }}</span>
          } @else {
            <span class="ayuda">Si lo indicas, reemplaza el vencimiento actual del medicamento.</span>
          }
        </div>

        <div class="campo">
          <label for="em-nota">Nota (opcional)</label>
          <input id="em-nota" class="input" formControlName="nota" maxlength="500" placeholder="Ej. compra en la veterinaria" />
        </div>

        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : 'Registrar entrada' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .modal-pie .btn { flex: 1; }
  `,
})
export class EntradaMedicamentoForm {
  private readonly api = inject(MedicamentosApi);

  readonly medicamento = input.required<Medicamento>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly hoy = hoyBogota();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly form = inject(NonNullableFormBuilder).group({
    cantidad: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(1_000_000)]],
    fecha: [hoyBogota(), [Validators.required, noFutura]],
    fechaVencimiento: [''],
    nota: [''],
  });

  protected stock(): string {
    return formatearCantidad(this.medicamento().stock, this.medicamento().unidad);
  }

  protected unidad(): string {
    return etiquetaDe(UNIDADES_MEDICAMENTO, this.medicamento().unidad);
  }

  protected servidor(campo: string): string | undefined {
    return this.errores()[campo];
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    this.errores.set({});
    const v = this.form.getRawValue();
    this.api
      .registrarEntrada(this.medicamento().id, {
        cantidad: Number(v.cantidad),
        fecha: v.fecha,
        ...(v.fechaVencimiento ? { fechaVencimiento: v.fechaVencimiento } : {}),
        nota: v.nota,
      })
      .subscribe({
        next: () => this.guardado.emit(),
        error: (e) => {
          const porCampo = erroresPorCampo(e);
          this.errores.set(porCampo);
          this.error.set(Object.keys(porCampo).length ? null : mensajeDeError(e));
          this.guardando.set(false);
        },
      });
  }
}
