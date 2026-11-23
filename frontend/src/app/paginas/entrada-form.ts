import { Component, inject, input, output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { AlimentosApi } from '../core/alimentos-api';
import { mensajeDeError } from '../core/errores';
import { Alimento, formatearGramos, hoyBogota } from '../core/modelos';

function noFutura(control: AbstractControl<string>): ValidationErrors | null {
  return control.value > hoyBogota() ? { futura: true } : null;
}

@Component({
  selector: 'app-entrada-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="'Registrar entrada: ' + alimento().nombre" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <p class="suave">Stock actual: {{ stock(alimento().stockGramos) }}</p>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="e-cantidad">Cantidad (kg)</label>
          <input id="e-cantidad" class="input" type="number" inputmode="decimal" min="0.001" max="100000" step="0.001"
            formControlName="cantidadKg" [class.invalido]="form.controls.cantidadKg.invalid && form.controls.cantidadKg.touched" />
          @if (form.controls.cantidadKg.invalid && form.controls.cantidadKg.touched) {
            <span class="error-campo">Ingresa una cantidad mayor que 0 y hasta 100000 kg.</span>
          }
        </div>

        <div class="campo">
          <label for="e-fecha">Fecha</label>
          <input id="e-fecha" class="input" type="date" [max]="hoy" formControlName="fecha"
            [class.invalido]="form.controls.fecha.invalid && form.controls.fecha.touched" />
          @if (form.controls.fecha.invalid && form.controls.fecha.touched) {
            <span class="error-campo">Ingresa una fecha que no sea futura.</span>
          }
        </div>

        <div class="campo">
          <label for="e-nota">Nota (opcional)</label>
          <input id="e-nota" class="input" formControlName="nota" maxlength="500" placeholder="Ej. compra en la cooperativa" />
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
})
export class EntradaForm {
  private readonly api = inject(AlimentosApi);

  readonly alimento = input.required<Alimento>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly stock = formatearGramos;
  protected readonly hoy = hoyBogota();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    cantidadKg: [null as number | null, [Validators.required, Validators.min(0.001), Validators.max(100000)]],
    fecha: [hoyBogota(), [Validators.required, noFutura]],
    nota: [''],
  });

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.api
      .registrarEntrada(this.alimento().id, {
        cantidadGramos: Math.round((v.cantidadKg ?? 0) * 1000),
        fecha: v.fecha,
        nota: v.nota,
      })
      .subscribe({
        next: () => this.guardado.emit(),
        error: (error) => {
          this.error.set(mensajeDeError(error));
          this.guardando.set(false);
        },
      });
  }
}
