import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { EspacioGuardar, EspaciosApi } from '../core/espacios-api';
import { Espacio, TIPOS_ESPACIO, TipoEspacio } from '../core/modelos';

type Campo = 'codigo' | 'nombre' | 'capacidad';

@Component({
  selector: 'app-espacio-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="espacio() ? 'Editar espacio' : 'Nuevo espacio'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="e-codigo">Código</label>
          <input id="e-codigo" class="input" formControlName="codigo" maxlength="20" autocapitalize="characters"
            placeholder="Ej. G1-C1" [class.invalido]="invalido('codigo')" />
          @if (invalido('codigo')) {
            <span class="error-campo">Usa letras, números y guiones, hasta 20 caracteres (ej. G1-C1).</span>
          } @else {
            <span class="ayuda">Se guarda en mayúsculas y no se puede repetir en la finca.</span>
          }
        </div>

        <div class="campo">
          <label for="e-nombre">Descripción (opcional)</label>
          <input id="e-nombre" class="input" formControlName="nombre" maxlength="80" placeholder="Ej. Cuadrante del fondo"
            [class.invalido]="invalido('nombre')" />
        </div>

        <div class="fila-campos">
          <div class="campo">
            <label for="e-tipo">Tipo</label>
            <select id="e-tipo" class="input" formControlName="tipo">
              @for (t of tipos; track t.valor) {
                <option [value]="t.valor">{{ t.etiqueta }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="e-capacidad">Capacidad en aves (opcional)</label>
            <input id="e-capacidad" class="input" type="number" inputmode="numeric" min="1" max="100000" step="1"
              formControlName="capacidad" [class.invalido]="invalido('capacidad')" />
            @if (invalido('capacidad')) {
              <span class="error-campo">Ingresa un número entero entre 1 y 100000.</span>
            }
          </div>
        </div>

        <div class="campo">
          <label for="e-obs">Observaciones (opcional)</label>
          <textarea id="e-obs" class="input" formControlName="observaciones" maxlength="1000"></textarea>
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
export class EspacioForm implements OnInit {
  private readonly api = inject(EspaciosApi);

  readonly espacio = input<Espacio | null>(null);
  readonly fincaId = input.required<string>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_ESPACIO;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    codigo: ['', [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9][A-Za-z0-9-]{0,19}\s*$/)]],
    nombre: [''],
    tipo: ['CUADRANTE' as TipoEspacio],
    capacidad: [null as number | null, [Validators.min(1), Validators.max(100000), Validators.pattern(/^\d+$/)]],
    observaciones: [''],
  });

  ngOnInit(): void {
    const e = this.espacio();
    if (e) {
      this.form.patchValue({
        codigo: e.codigo,
        nombre: e.nombre ?? '',
        tipo: e.tipo,
        capacidad: e.capacidad,
        observaciones: e.observaciones ?? '',
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
    const datos: EspacioGuardar = {
      codigo: v.codigo.trim().toUpperCase(),
      nombre: v.nombre.trim(),
      tipo: v.tipo,
      capacidad: v.capacidad === null || (v.capacidad as unknown) === '' ? null : Number(v.capacidad),
      observaciones: v.observaciones.trim(),
    };
    const espacio = this.espacio();
    (espacio ? this.api.actualizar(espacio.id, datos) : this.api.crear(this.fincaId(), datos)).subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
