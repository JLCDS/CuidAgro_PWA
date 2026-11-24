import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { MedicamentosApi } from '../core/medicamentos-api';
import {
  Medicamento,
  TipoMedicamento,
  TIPOS_MEDICAMENTO,
  UnidadMedicamento,
  UNIDADES_MEDICAMENTO,
} from '../core/medicamentos-modelos';
import { erroresPorCampo } from '../core/salud-modelos';

type Campo = 'nombre' | 'stockInicial' | 'stockMinimo' | 'diasRetiroCarne' | 'diasRetiroLeche';

/** Un campo numérico vacío se envía como null. */
const numeroONulo = (valor: number | string | null): number | null =>
  valor === null || valor === '' || Number.isNaN(Number(valor)) ? null : Number(valor);

const MAXIMO_STOCK = 1_000_000;
const diasValidos = [Validators.min(0), Validators.max(365), Validators.pattern(/^\d*$/)];

@Component({
  selector: 'app-medicamento-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="medicamento() ? 'Editar medicamento' : 'Nuevo medicamento'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="m-nombre">Nombre</label>
          <input id="m-nombre" class="input" formControlName="nombre" maxlength="80" [class.invalido]="invalido('nombre') || !!servidor('nombre')" />
          @if (invalido('nombre')) {
            <span class="error-campo">El nombre debe tener al menos 2 caracteres.</span>
          } @else if (servidor('nombre'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="dos">
          <div class="campo">
            <label for="m-tipo">Tipo</label>
            <select id="m-tipo" class="input" formControlName="tipo">
              @for (t of tipos; track t.valor) {
                <option [value]="t.valor">{{ t.etiqueta }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="m-unidad">Unidad</label>
            <select id="m-unidad" class="input" formControlName="unidad">
              @for (u of unidades; track u.valor) {
                <option [value]="u.valor">{{ u.etiqueta }}</option>
              }
            </select>
          </div>
        </div>

        <div class="dos">
          @if (!medicamento()) {
            <div class="campo">
              <label for="m-inicial">Cantidad inicial</label>
              <input id="m-inicial" class="input" type="number" inputmode="decimal" min="0" [max]="maximo" step="0.01"
                formControlName="stockInicial" [class.invalido]="invalido('stockInicial') || !!servidor('stockInicial')" />
              @if (invalido('stockInicial') || servidor('stockInicial')) {
                <span class="error-campo">{{ servidor('stockInicial') ?? 'Ingresa una cantidad entre 0 y 1.000.000, con máximo 2 decimales.' }}</span>
              }
            </div>
          }
          <div class="campo">
            <label for="m-minimo">Stock mínimo</label>
            <input id="m-minimo" class="input" type="number" inputmode="decimal" min="0" [max]="maximo" step="0.01"
              formControlName="stockMinimo" [class.invalido]="invalido('stockMinimo') || !!servidor('stockMinimo')" />
            @if (invalido('stockMinimo') || servidor('stockMinimo')) {
              <span class="error-campo">{{ servidor('stockMinimo') ?? 'Ingresa una cantidad entre 0 y 1.000.000, con máximo 2 decimales.' }}</span>
            }
          </div>
        </div>
        @if (!medicamento()) {
          <span class="ayuda">La cantidad inicial queda registrada como la primera entrada.</span>
        }

        <div class="dos">
          <div class="campo">
            <label for="m-vence">Vencimiento (opcional)</label>
            <input id="m-vence" class="input" type="date" formControlName="fechaVencimiento" [class.invalido]="!!servidor('fechaVencimiento')" />
            @if (servidor('fechaVencimiento'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
          <div class="campo">
            <label for="m-lab">Laboratorio (opcional)</label>
            <input id="m-lab" class="input" formControlName="laboratorio" maxlength="80" [class.invalido]="!!servidor('laboratorio')" />
            @if (servidor('laboratorio'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        </div>

        <div class="dos">
          <div class="campo">
            <label for="m-carne">Retiro de carne (días)</label>
            <input id="m-carne" class="input" type="number" inputmode="numeric" min="0" max="365" step="1"
              formControlName="diasRetiroCarne" [class.invalido]="invalido('diasRetiroCarne') || !!servidor('diasRetiroCarne')" />
            @if (invalido('diasRetiroCarne') || servidor('diasRetiroCarne')) {
              <span class="error-campo">{{ servidor('diasRetiroCarne') ?? 'Ingresa un número entero entre 0 y 365.' }}</span>
            }
          </div>
          <div class="campo">
            <label for="m-leche">Retiro de leche (días)</label>
            <input id="m-leche" class="input" type="number" inputmode="numeric" min="0" max="365" step="1"
              formControlName="diasRetiroLeche" [class.invalido]="invalido('diasRetiroLeche') || !!servidor('diasRetiroLeche')" />
            @if (invalido('diasRetiroLeche') || servidor('diasRetiroLeche')) {
              <span class="error-campo">{{ servidor('diasRetiroLeche') ?? 'Ingresa un número entero entre 0 y 365.' }}</span>
            }
          </div>
        </div>
        <span class="ayuda">Son los valores sugeridos al registrar un tratamiento.</span>

        <div class="campo">
          <label for="m-obs">Observaciones (opcional)</label>
          <textarea id="m-obs" class="input" formControlName="observaciones" maxlength="1000"></textarea>
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
    .dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .modal-pie .btn { flex: 1; }
  `,
})
export class MedicamentoForm implements OnInit {
  private readonly api = inject(MedicamentosApi);

  readonly medicamento = input<Medicamento | null>(null);
  readonly fincaId = input.required<string>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_MEDICAMENTO;
  protected readonly unidades = UNIDADES_MEDICAMENTO;
  protected readonly maximo = MAXIMO_STOCK;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly form = inject(NonNullableFormBuilder).group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    tipo: ['ANTIBIOTICO' as TipoMedicamento],
    unidad: ['ML' as UnidadMedicamento],
    stockInicial: [0 as number | null, [Validators.min(0), Validators.max(MAXIMO_STOCK)]],
    stockMinimo: [0 as number | null, [Validators.min(0), Validators.max(MAXIMO_STOCK)]],
    fechaVencimiento: [''],
    laboratorio: [''],
    diasRetiroCarne: [null as number | null, diasValidos],
    diasRetiroLeche: [null as number | null, diasValidos],
    observaciones: [''],
  });

  ngOnInit(): void {
    const m = this.medicamento();
    if (m) {
      this.form.patchValue({
        nombre: m.nombre,
        tipo: m.tipo,
        unidad: m.unidad,
        stockMinimo: m.stockMinimo,
        fechaVencimiento: m.fechaVencimiento ?? '',
        laboratorio: m.laboratorio ?? '',
        diasRetiroCarne: m.diasRetiroCarne,
        diasRetiroLeche: m.diasRetiroLeche,
        observaciones: m.observaciones ?? '',
      });
    }
  }

  protected servidor(campo: string): string | undefined {
    return this.errores()[campo];
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
    this.errores.set({});
    const v = this.form.getRawValue();
    const datos = {
      nombre: v.nombre.trim(),
      tipo: v.tipo,
      unidad: v.unidad,
      stockMinimo: numeroONulo(v.stockMinimo) ?? 0,
      fechaVencimiento: v.fechaVencimiento || null,
      laboratorio: v.laboratorio.trim(),
      diasRetiroCarne: numeroONulo(v.diasRetiroCarne),
      diasRetiroLeche: numeroONulo(v.diasRetiroLeche),
      observaciones: v.observaciones.trim(),
    };
    const medicamento = this.medicamento();
    (medicamento
      ? this.api.actualizar(medicamento.id, datos)
      : this.api.crear(this.fincaId(), { ...datos, stockInicial: numeroONulo(v.stockInicial) ?? 0 })
    ).subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        const porCampo = erroresPorCampo(error);
        // El 409 de nombre duplicado no trae campo: se muestra bajo "nombre".
        if (error?.status === 409 && error?.error?.error?.codigo === 'DUPLICADO') porCampo['nombre'] = mensajeDeError(error);
        this.errores.set(porCampo);
        this.error.set(Object.keys(porCampo).length ? null : mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
