import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { EspaciosApi } from '../core/espacios-api';
import { mensajeDeError } from '../core/errores';
import { LoteGuardar, LotesApi } from '../core/lotes-api';
import { hoyBogota, Lote, PROPOSITOS_LOTE, PropositoLote } from '../core/modelos';

function noFutura(control: AbstractControl<string>): ValidationErrors | null {
  return control.value > hoyBogota() ? { futura: true } : null;
}

function rangoEdad(grupo: AbstractControl): ValidationErrors | null {
  const { edadMinSemanas: min, edadMaxSemanas: max } = grupo.getRawValue() as {
    edadMinSemanas: number | null;
    edadMaxSemanas: number | null;
  };
  return min !== null && max !== null && min > max ? { rangoEdad: true } : null;
}

type Campo = 'nombre' | 'edadMinSemanas' | 'edadMaxSemanas' | 'cantidad' | 'fechaIngreso';

@Component({
  selector: 'app-lote-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="lote() ? 'Editar lote' : 'Nuevo lote'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="l-nombre">Identificador del lote</label>
          <input id="l-nombre" class="input" formControlName="nombre" maxlength="80" [class.invalido]="invalido('nombre')" />
          @if (invalido('nombre')) {
            <span class="error-campo">El identificador debe tener al menos 2 caracteres.</span>
          }
        </div>

        <div class="campo">
          <label for="l-tipo">Tipo de ave (opcional)</label>
          <input id="l-tipo" class="input" formControlName="tipoAve" maxlength="80" placeholder="Ej. gallinas ponedoras" />
        </div>

        <div class="fila-campos">
          <div class="campo">
            <label for="l-min">Edad mínima (semanas)</label>
            <input id="l-min" class="input" type="number" inputmode="numeric" min="0" max="520" step="1"
              formControlName="edadMinSemanas" [class.invalido]="invalido('edadMinSemanas')" />
            @if (invalido('edadMinSemanas')) {
              <span class="error-campo">Ingresa un número entero entre 0 y 520.</span>
            }
          </div>
          <div class="campo">
            <label for="l-max">Edad máxima (semanas)</label>
            <input id="l-max" class="input" type="number" inputmode="numeric" min="0" max="520" step="1"
              formControlName="edadMaxSemanas" [class.invalido]="invalido('edadMaxSemanas')" />
            @if (invalido('edadMaxSemanas')) {
              <span class="error-campo">Ingresa un número entero entre 0 y 520.</span>
            }
          </div>
        </div>
        @if (form.hasError('rangoEdad')) {
          <span class="error-campo">La edad mínima no puede superar la máxima.</span>
        }

        <div class="fila-campos">
          <div class="campo">
            <label for="l-cantidad">Cantidad de aves</label>
            <input id="l-cantidad" class="input" type="number" inputmode="numeric" min="1" max="100000" step="1"
              formControlName="cantidad" [class.invalido]="invalido('cantidad')" />
            @if (invalido('cantidad')) {
              <span class="error-campo">Ingresa un número entero entre 1 y 100000.</span>
            }
          </div>
          <div class="campo">
            <label for="l-proposito">Propósito</label>
            <select id="l-proposito" class="input" formControlName="proposito">
              @for (p of propositos; track p.valor) {
                <option [value]="p.valor">{{ p.etiqueta }}</option>
              }
            </select>
          </div>
        </div>

        <div class="campo">
          <label for="l-espacio">Espacio</label>
          <select id="l-espacio" class="input" formControlName="espacioId">
            <option value="">Sin espacio</option>
            @for (e of opcionesEspacio(); track e.id) {
              <option [value]="e.id">{{ e.codigo }}{{ e.nombre ? ' · ' + e.nombre : '' }}</option>
            }
          </select>
          <span class="ayuda">Solo aparecen los espacios libres y el actual del lote.</span>
        </div>

        <div class="campo">
          <label for="l-fecha">Fecha de ingreso (opcional)</label>
          <input id="l-fecha" class="input" type="date" [max]="hoy" formControlName="fechaIngreso"
            [class.invalido]="invalido('fechaIngreso')" />
          @if (invalido('fechaIngreso')) {
            <span class="error-campo">La fecha de ingreso no puede ser futura.</span>
          }
        </div>

        <div class="campo">
          <label for="l-obs">Observaciones (opcional)</label>
          <textarea id="l-obs" class="input" formControlName="observaciones" maxlength="1000"></textarea>
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
export class LoteForm implements OnInit {
  private readonly api = inject(LotesApi);
  private readonly espacios = inject(EspaciosApi);

  readonly lote = input<Lote | null>(null);
  readonly fincaId = input.required<string>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly propositos = PROPOSITOS_LOTE;
  protected readonly hoy = hoyBogota();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
      tipoAve: [''],
      edadMinSemanas: [null as number | null, [Validators.required, Validators.min(0), Validators.max(520), Validators.pattern(/^\d+$/)]],
      edadMaxSemanas: [null as number | null, [Validators.required, Validators.min(0), Validators.max(520), Validators.pattern(/^\d+$/)]],
      cantidad: [null as number | null, [Validators.required, Validators.min(1), Validators.max(100000), Validators.pattern(/^\d+$/)]],
      proposito: ['PRODUCCION' as PropositoLote],
      fechaIngreso: ['', [noFutura]],
      espacioId: [''],
      observaciones: [''],
    },
    { validators: rangoEdad },
  );

  /** Espacios libres más el actual del lote. */
  protected readonly opcionesEspacio = signal<{ id: string; codigo: string; nombre: string | null }[]>([]);

  ngOnInit(): void {
    const l = this.lote();
    if (l) {
      this.form.patchValue({
        ...l,
        tipoAve: l.tipoAve ?? '',
        fechaIngreso: l.fechaIngreso ?? '',
        espacioId: l.espacio?.id ?? '',
        observaciones: l.observaciones ?? '',
      });
    }
    this.cargarEspacios(l);
  }

  private cargarEspacios(l: Lote | null): void {
    const actual = l?.espacio ? [{ id: l.espacio.id, codigo: l.espacio.codigo, nombre: null }] : [];
    this.opcionesEspacio.set(actual);
    this.espacios.listar({ fincaId: this.fincaId(), estado: 'ACTIVO' }).subscribe({
      next: ({ datos }) => {
        const libres = datos.filter((e) => !e.loteActual || e.loteActual.id === l?.id);
        const idsLibres = new Set(libres.map((e) => e.id));
        // El espacio actual se conserva aunque ya no aparezca (por ejemplo, si el lote está de baja).
        this.opcionesEspacio.set([...actual.filter((e) => !idsLibres.has(e.id)), ...libres]);
      },
      error: () => undefined,
    });
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
    const valores = this.form.getRawValue();
    const datos = {
      ...valores,
      fechaIngreso: valores.fechaIngreso || null,
      espacioId: valores.espacioId || null,
    } as LoteGuardar;
    const lote = this.lote();
    (lote ? this.api.actualizar(lote.id, datos) : this.api.crear(this.fincaId(), datos)).subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
