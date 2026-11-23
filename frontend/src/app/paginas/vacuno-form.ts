import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { hoyBogota, PROPOSITOS_VACUNO, PropositoVacuno, Sexo, SEXOS, Vacuno } from '../core/modelos';
import { VacunoGuardar, VacunosApi } from '../core/vacunos-api';

function noFutura(control: AbstractControl<string>): ValidationErrors | null {
  return control.value > hoyBogota() ? { futura: true } : null;
}

type Campo = 'nombre' | 'sexo' | 'raza' | 'edadMeses' | 'peso' | 'fechaLlegada' | 'proposito';

@Component({
  selector: 'app-vacuno-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="vacuno() ? 'Editar vacuno' : 'Nuevo vacuno'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="v-nombre">Nombre o identificador</label>
          <input id="v-nombre" class="input" formControlName="nombre" maxlength="80" [class.invalido]="invalido('nombre')" />
          @if (invalido('nombre')) {
            <span class="error-campo">El nombre debe tener al menos 2 caracteres.</span>
          }
        </div>

        <div class="fila-campos">
          <div class="campo">
            <label for="v-sexo">Sexo</label>
            <select id="v-sexo" class="input" formControlName="sexo">
              @for (s of sexos; track s.valor) {
                <option [value]="s.valor">{{ s.etiqueta }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="v-proposito">Propósito</label>
            <select id="v-proposito" class="input" formControlName="proposito">
              @for (p of propositos; track p.valor) {
                <option [value]="p.valor">{{ p.etiqueta }}</option>
              }
            </select>
          </div>
        </div>

        <div class="campo">
          <label for="v-raza">Raza</label>
          <input id="v-raza" class="input" formControlName="raza" maxlength="80" [class.invalido]="invalido('raza')" />
          @if (invalido('raza')) {
            <span class="error-campo">La raza debe tener al menos 2 caracteres.</span>
          }
        </div>

        <div class="fila-campos">
          <div class="campo">
            <label for="v-edad">Edad (meses)</label>
            <input id="v-edad" class="input" type="number" inputmode="numeric" min="0" max="480" step="1"
              formControlName="edadMeses" [class.invalido]="invalido('edadMeses')" />
            @if (invalido('edadMeses')) {
              <span class="error-campo">Ingresa un número entero entre 0 y 480.</span>
            }
          </div>
          <div class="campo">
            <label for="v-peso">Peso (kg)</label>
            <input id="v-peso" class="input" type="number" inputmode="decimal" min="0" max="2000" step="0.01"
              formControlName="peso" [class.invalido]="invalido('peso')" />
            @if (invalido('peso')) {
              <span class="error-campo">El peso debe ser mayor que 0 y hasta 2000 kg.</span>
            }
          </div>
        </div>

        <div class="campo">
          <label for="v-fecha">Fecha de llegada</label>
          <input id="v-fecha" class="input" type="date" [max]="hoy" formControlName="fechaLlegada"
            [class.invalido]="invalido('fechaLlegada')" />
          @if (invalido('fechaLlegada')) {
            <span class="error-campo">Ingresa una fecha de llegada que no sea futura.</span>
          }
        </div>

        <div class="campo">
          <label for="v-obs">Observaciones (opcional)</label>
          <textarea id="v-obs" class="input" formControlName="observaciones" maxlength="1000"></textarea>
        </div>

        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .fila-campos { display: grid; gap: 14px; grid-template-columns: 1fr; }
    @media (min-width: 480px) { .fila-campos { grid-template-columns: 1fr 1fr; } }
  `,
})
export class VacunoForm implements OnInit {
  private readonly api = inject(VacunosApi);

  readonly vacuno = input<Vacuno | null>(null);
  readonly fincaId = input.required<string>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly sexos = SEXOS;
  protected readonly propositos = PROPOSITOS_VACUNO;
  protected readonly hoy = hoyBogota();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    sexo: ['HEMBRA' as Sexo],
    raza: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    edadMeses: [null as number | null, [Validators.required, Validators.min(0), Validators.max(480), Validators.pattern(/^\d+$/)]],
    peso: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(2000)]],
    fechaLlegada: ['', [Validators.required, noFutura]],
    proposito: ['PRODUCCION_LECHERA' as PropositoVacuno],
    observaciones: [''],
  });

  ngOnInit(): void {
    const v = this.vacuno();
    if (v) this.form.patchValue({ ...v, observaciones: v.observaciones ?? '' });
  }

  protected invalido(campo: Campo): boolean {
    const control = this.form.controls[campo];
    return control.invalid && control.touched;
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const datos = this.form.getRawValue() as VacunoGuardar;
    const vacuno = this.vacuno();
    (vacuno ? this.api.actualizar(vacuno.id, datos) : this.api.crear(this.fincaId(), datos)).subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
