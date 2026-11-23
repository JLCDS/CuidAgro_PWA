import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { AlimentosApi } from '../core/alimentos-api';
import { mensajeDeError } from '../core/errores';
import { Alimento, TipoAlimento, TIPOS_ALIMENTO } from '../core/modelos';

type Campo = 'nombre' | 'stockInicialKg' | 'stockMinimoKg';

/** Las cantidades se escriben en kg y viajan en gramos enteros. */
const aGramos = (kg: number | null): number => Math.round((kg ?? 0) * 1000);

@Component({
  selector: 'app-alimento-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="alimento() ? 'Editar alimento' : 'Nuevo alimento'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="a-nombre">Nombre</label>
          <input id="a-nombre" class="input" formControlName="nombre" maxlength="80" [class.invalido]="invalido('nombre')" />
          @if (invalido('nombre')) {
            <span class="error-campo">El nombre debe tener al menos 2 caracteres.</span>
          }
        </div>

        <div class="campo">
          <label for="a-tipo">Tipo</label>
          <select id="a-tipo" class="input" formControlName="tipo">
            @for (t of tipos; track t.valor) {
              <option [value]="t.valor">{{ t.etiqueta }}</option>
            }
          </select>
        </div>

        @if (!alimento()) {
          <div class="campo">
            <label for="a-inicial">Cantidad inicial (kg)</label>
            <input id="a-inicial" class="input" type="number" inputmode="decimal" min="0" max="100000" step="0.001"
              formControlName="stockInicialKg" [class.invalido]="invalido('stockInicialKg')" />
            @if (invalido('stockInicialKg')) {
              <span class="error-campo">Ingresa una cantidad entre 0 y 100000 kg.</span>
            } @else {
              <span class="ayuda">Queda registrada como la primera entrada del inventario.</span>
            }
          </div>
        }

        <div class="campo">
          <label for="a-minimo">Stock mínimo (kg)</label>
          <input id="a-minimo" class="input" type="number" inputmode="decimal" min="0" max="100000" step="0.001"
            formControlName="stockMinimoKg" [class.invalido]="invalido('stockMinimoKg')" />
          @if (invalido('stockMinimoKg')) {
            <span class="error-campo">Ingresa una cantidad entre 0 y 100000 kg.</span>
          } @else {
            <span class="ayuda">Se avisa cuando el stock llega a este valor o menos.</span>
          }
        </div>

        <div class="campo">
          <label for="a-obs">Observaciones (opcional)</label>
          <textarea id="a-obs" class="input" formControlName="observaciones" maxlength="1000"></textarea>
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
})
export class AlimentoForm implements OnInit {
  private readonly api = inject(AlimentosApi);

  readonly alimento = input<Alimento | null>(null);
  readonly fincaId = input.required<string>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_ALIMENTO;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    tipo: ['CONCENTRADO' as TipoAlimento],
    stockInicialKg: [0 as number | null, [Validators.min(0), Validators.max(100000)]],
    stockMinimoKg: [0 as number | null, [Validators.min(0), Validators.max(100000)]],
    observaciones: [''],
  });

  ngOnInit(): void {
    const a = this.alimento();
    if (a) {
      this.form.patchValue({
        nombre: a.nombre,
        tipo: a.tipo,
        stockMinimoKg: a.stockMinimoGramos / 1000,
        observaciones: a.observaciones ?? '',
      });
    }
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
    const v = this.form.getRawValue();
    const datos = {
      nombre: v.nombre,
      tipo: v.tipo,
      stockMinimoGramos: aGramos(v.stockMinimoKg),
      observaciones: v.observaciones,
    };
    const alimento = this.alimento();
    (alimento
      ? this.api.actualizar(alimento.id, datos)
      : this.api.crear(this.fincaId(), { ...datos, stockInicialGramos: aGramos(v.stockInicialKg) })
    ).subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
