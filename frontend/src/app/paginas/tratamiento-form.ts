import { Component, computed, DestroyRef, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { LotesApi } from '../core/lotes-api';
import { MedicamentosApi } from '../core/medicamentos-api';
import {
  formatearCantidad,
  Tratamiento,
  UnidadMedicamento,
  UNIDADES_MEDICAMENTO,
  ViaAdministracion,
  VIAS_ADMINISTRACION,
} from '../core/medicamentos-modelos';
import { etiquetaDe, hoyBogota } from '../core/modelos';
import { SaludApi } from '../core/salud-api';
import { CasoSalud, erroresPorCampo } from '../core/salud-modelos';
import { TratamientosApi } from '../core/tratamientos-api';
import { VacunosApi } from '../core/vacunos-api';

/** Animal o lote ya conocido (al registrar desde un caso de salud). */
export interface SujetoTratamiento {
  tipo: 'vacuno' | 'lote';
  id: string;
  nombre: string;
  casoSaludId?: string;
}

interface OpcionMedicamento {
  id: string;
  nombre: string;
  unidad: UnidadMedicamento;
  stock: number;
  diasRetiroCarne: number | null;
  diasRetiroLeche: number | null;
}

const noFutura = (c: AbstractControl<string>): ValidationErrors | null => (c.value > hoyBogota() ? { futura: true } : null);
const diasValidos = [Validators.min(0), Validators.max(365), Validators.pattern(/^\d*$/)];
const numeroONulo = (valor: number | string | null): number | null =>
  valor === null || valor === '' || Number.isNaN(Number(valor)) ? null : Number(valor);

@Component({
  selector: 'app-tratamiento-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="tratamiento() ? 'Editar tratamiento' : 'Registrar tratamiento'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        @if (fijo(); as s) {
          <p class="suave">{{ s.tipo === 'lote' ? 'Lote' : 'Vacuno' }}: <strong>{{ s.nombre }}</strong></p>
        } @else {
          <div class="campo">
            <span class="etiqueta" id="t-sujeto-et">Sobre</span>
            <div class="segmentos" role="group" aria-labelledby="t-sujeto-et">
              <button type="button" class="btn segmento" [class.activo]="tipoElegido() === 'vacuno'" [attr.aria-pressed]="tipoElegido() === 'vacuno'" (click)="elegirTipo('vacuno')">Vacuno</button>
              <button type="button" class="btn segmento" [class.activo]="tipoElegido() === 'lote'" [attr.aria-pressed]="tipoElegido() === 'lote'" (click)="elegirTipo('lote')">Lote de ovíparos</button>
            </div>
          </div>
          <div class="campo">
            <label for="t-animal">{{ tipoElegido() === 'lote' ? 'Lote' : 'Vacuno' }}</label>
            <select id="t-animal" class="input" formControlName="animalId" [class.invalido]="invalido('animalId') || !!servidor('vacunoId') || !!servidor('loteId')">
              <option value="">{{ tipoElegido() === 'lote' ? 'Selecciona un lote' : 'Selecciona un vacuno' }}</option>
              @for (a of opcionesAnimal(); track a.id) {
                <option [value]="a.id">{{ a.nombre }}</option>
              }
            </select>
            @if (invalido('animalId')) {
              <span class="error-campo">Selecciona {{ tipoElegido() === 'lote' ? 'un lote' : 'un vacuno' }}.</span>
            } @else if (servidor('vacunoId') || servidor('loteId'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        }

        <div class="campo">
          <label for="t-caso">Caso de salud (opcional)</label>
          <select id="t-caso" class="input" formControlName="casoSaludId" [class.invalido]="!!servidor('casoSaludId')">
            <option value="">Sin caso de salud</option>
            @for (c of casos(); track c.id) {
              <option [value]="c.id">{{ c.diagnostico }} ({{ c.activo ? 'activo' : 'cerrado' }})</option>
            }
          </select>
          @if (servidor('casoSaludId'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="campo">
          <label for="t-med">Medicamento</label>
          <select id="t-med" class="input" formControlName="medicamentoId" [class.invalido]="invalido('medicamentoId') || !!servidor('medicamentoId')">
            <option value="">Selecciona un medicamento</option>
            @for (m of medicamentos(); track m.id) {
              <option [value]="m.id">{{ m.nombre }} · stock {{ cantidad(m.stock, m.unidad) }}</option>
            }
          </select>
          @if (invalido('medicamentoId')) {
            <span class="error-campo">Selecciona un medicamento.</span>
          } @else if (servidor('medicamentoId'); as e) {
            <span class="error-campo">{{ e }}</span>
          } @else if (medicamentos().length === 0 && !cargandoMedicamentos()) {
            <span class="ayuda">No hay medicamentos activos y vigentes en esta finca.</span>
          }
        </div>

        <div class="dos">
          <div class="campo">
            <label for="t-dosis">Dosis{{ unidadElegida() ? ' (' + unidadElegida() + ')' : '' }}</label>
            <input id="t-dosis" class="input" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01"
              formControlName="dosis" [class.invalido]="invalido('dosis') || !!servidor('dosis')" />
            @if (invalido('dosis')) {
              <span class="error-campo">Ingresa una dosis mayor que 0 y hasta 100.000, con máximo 2 decimales.</span>
            } @else if (servidor('dosis'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
          <div class="campo">
            <label for="t-via">Vía</label>
            <select id="t-via" class="input" formControlName="via" [class.invalido]="!!servidor('via')">
              @for (v of vias; track v.valor) {
                <option [value]="v.valor">{{ v.etiqueta }}</option>
              }
            </select>
            @if (servidor('via'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        </div>

        <div class="campo">
          <label for="t-fecha">Fecha</label>
          <input id="t-fecha" class="input" type="date" [max]="hoy" formControlName="fecha" [class.invalido]="invalido('fecha') || !!servidor('fecha')" />
          @if (invalido('fecha')) {
            <span class="error-campo">Ingresa una fecha que no sea futura.</span>
          } @else if (servidor('fecha'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="dos">
          <div class="campo">
            <label for="t-carne">Retiro de carne (días)</label>
            <input id="t-carne" class="input" type="number" inputmode="numeric" min="0" max="365" step="1"
              formControlName="diasRetiroCarne" [class.invalido]="invalido('diasRetiroCarne') || !!servidor('diasRetiroCarne')" />
            @if (invalido('diasRetiroCarne') || servidor('diasRetiroCarne')) {
              <span class="error-campo">{{ servidor('diasRetiroCarne') ?? 'Ingresa un número entero entre 0 y 365.' }}</span>
            }
          </div>
          <div class="campo">
            <label for="t-leche">Retiro de leche (días)</label>
            <input id="t-leche" class="input" type="number" inputmode="numeric" min="0" max="365" step="1"
              formControlName="diasRetiroLeche" [class.invalido]="invalido('diasRetiroLeche') || !!servidor('diasRetiroLeche')" />
            @if (invalido('diasRetiroLeche') || servidor('diasRetiroLeche')) {
              <span class="error-campo">{{ servidor('diasRetiroLeche') ?? 'Ingresa un número entero entre 0 y 365.' }}</span>
            }
          </div>
        </div>
        <span class="ayuda">Se precargan desde el medicamento; puedes ajustarlos o dejarlos vacíos si no hay retiro.</span>

        <div class="campo">
          <label for="t-obs">Observaciones (opcional)</label>
          <textarea id="t-obs" class="input" formControlName="observaciones" maxlength="1000" [class.invalido]="!!servidor('observaciones')"></textarea>
          @if (servidor('observaciones'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : tratamiento() ? 'Guardar cambios' : 'Registrar' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .segmentos, .dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .segmento { padding: 0 6px; }
    .segmento.activo { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
    .modal-pie .btn { flex: 1; }
  `,
})
export class TratamientoForm implements OnInit {
  private readonly api = inject(TratamientosApi);
  private readonly medicamentosApi = inject(MedicamentosApi);
  private readonly saludApi = inject(SaludApi);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly fincaId = input.required<string>();
  readonly tratamiento = input<Tratamiento | null>(null);
  /** Animal o lote ya definido (desde un caso de salud). */
  readonly sujeto = input<SujetoTratamiento | null>(null);
  readonly guardado = output<Tratamiento>();
  readonly cerrado = output<void>();

  protected readonly vias = VIAS_ADMINISTRACION;
  protected readonly hoy = hoyBogota();
  protected readonly cantidad = formatearCantidad;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly tipoElegido = signal<'vacuno' | 'lote'>('vacuno');
  private readonly vacunos = signal<{ id: string; nombre: string }[]>([]);
  private readonly lotes = signal<{ id: string; nombre: string }[]>([]);
  protected readonly opcionesAnimal = computed(() => (this.tipoElegido() === 'lote' ? this.lotes() : this.vacunos()));
  protected readonly medicamentos = signal<OpcionMedicamento[]>([]);
  protected readonly cargandoMedicamentos = signal(true);
  protected readonly casos = signal<CasoSalud[]>([]);

  /** Sujeto fijo: el recibido o, al editar, el del tratamiento. */
  protected readonly fijo = computed<SujetoTratamiento | null>(() => {
    const t = this.tratamiento();
    if (t) {
      const s = t.vacuno ?? t.lote;
      return { tipo: t.vacuno ? 'vacuno' : 'lote', id: s!.id, nombre: s!.nombre };
    }
    return this.sujeto();
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    animalId: ['', Validators.required],
    casoSaludId: [''],
    medicamentoId: ['', Validators.required],
    dosis: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(100000)]],
    via: ['INTRAMUSCULAR' as ViaAdministracion],
    fecha: [hoyBogota(), [Validators.required, noFutura]],
    diasRetiroCarne: [null as number | null, diasValidos],
    diasRetiroLeche: [null as number | null, diasValidos],
    observaciones: [''],
  });
  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly unidadElegida = computed(() => {
    const m = this.medicamentos().find((o) => o.id === this.valores().medicamentoId);
    return m ? etiquetaDe(UNIDADES_MEDICAMENTO, m.unidad) : '';
  });

  /** Sujeto sobre el que se cargan los casos de salud. */
  private readonly sujetoActual = computed<{ tipo: 'vacuno' | 'lote'; id: string } | null>(() => {
    const f = this.fijo();
    if (f) return { tipo: f.tipo, id: f.id };
    const id = this.valores().animalId;
    return id ? { tipo: this.tipoElegido(), id } : null;
  });

  constructor() {
    effect(() => {
      const s = this.sujetoActual();
      untracked(() => this.cargarCasos(s));
    });
  }

  ngOnInit(): void {
    const t = this.tratamiento();
    const s = this.sujeto();
    if (t || s) {
      this.form.controls.animalId.clearValidators();
      this.form.controls.animalId.updateValueAndValidity();
    }
    if (t) {
      // La suscripción que precarga los días de retiro se crea después: no pisa los del tratamiento.
      this.form.patchValue(
        {
          casoSaludId: t.casoSaludId ?? '',
          medicamentoId: t.medicamentoId,
          dosis: t.dosis,
          via: t.via,
          fecha: t.fecha,
          diasRetiroCarne: t.diasRetiroCarne,
          diasRetiroLeche: t.diasRetiroLeche,
          observaciones: t.observaciones ?? '',
        },
      );
    } else if (s?.casoSaludId) {
      this.form.controls.casoSaludId.setValue(s.casoSaludId);
    }
    if (!t && !s) this.cargarAnimales();
    this.cargarMedicamentos(t);

    this.form.controls.medicamentoId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      const m = this.medicamentos().find((o) => o.id === id);
      if (m) this.form.patchValue({ diasRetiroCarne: m.diasRetiroCarne, diasRetiroLeche: m.diasRetiroLeche });
    });
  }

  private cargarAnimales(): void {
    const fincaId = this.fincaId();
    this.vacunosApi.listar({ fincaId, estado: 'ACTIVO', q: '', proposito: '' }).subscribe({
      next: (v) => this.vacunos.set(v.map(({ id, nombre }) => ({ id, nombre }))),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
    this.lotesApi.listar({ fincaId, estado: 'ACTIVO', q: '', proposito: '' }).subscribe({
      next: (l) => this.lotes.set(l.map(({ id, nombre }) => ({ id, nombre }))),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Solo activos y no vencidos; al editar se conserva el medicamento ya aplicado. */
  private cargarMedicamentos(actual: Tratamiento | null): void {
    this.medicamentosApi.listar({ fincaId: this.fincaId(), estado: 'ACTIVO', q: '', tipo: '', alerta: false }).subscribe({
      next: (lista) => {
        const opciones: OpcionMedicamento[] = lista
          .filter((m) => !m.vencido)
          .map(({ id, nombre, unidad, stock, diasRetiroCarne, diasRetiroLeche }) => ({ id, nombre, unidad, stock, diasRetiroCarne, diasRetiroLeche }));
        if (actual && !opciones.some((o) => o.id === actual.medicamentoId)) {
          const m = actual.medicamento;
          opciones.unshift({
            id: m.id,
            nombre: m.nombre,
            unidad: m.unidad,
            stock: m.stock,
            diasRetiroCarne: actual.diasRetiroCarne,
            diasRetiroLeche: actual.diasRetiroLeche,
          });
        }
        this.medicamentos.set(opciones);
        this.cargandoMedicamentos.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargandoMedicamentos.set(false);
      },
    });
  }

  private cargarCasos(s: { tipo: 'vacuno' | 'lote'; id: string } | null): void {
    if (!s) {
      this.casos.set([]);
      return;
    }
    this.saludApi.listar({ fincaId: this.fincaId(), [s.tipo === 'lote' ? 'loteId' : 'vacunoId']: s.id }).subscribe({
      next: (lista) => this.casos.set(lista),
      error: () => this.casos.set([]),
    });
  }

  protected servidor(campo: string): string | undefined {
    return this.errores()[campo];
  }

  protected invalido(campo: 'animalId' | 'medicamentoId' | 'dosis' | 'fecha' | 'diasRetiroCarne' | 'diasRetiroLeche'): boolean {
    const c = this.form.controls[campo];
    return c.invalid && c.touched;
  }

  protected elegirTipo(tipo: 'vacuno' | 'lote'): void {
    this.tipoElegido.set(tipo);
    this.form.controls.animalId.setValue('');
    this.form.controls.casoSaludId.setValue('');
    this.form.controls.animalId.markAsUntouched();
  }

  protected guardar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.guardando.set(true);
    this.error.set(null);
    this.errores.set({});
    const v = this.form.getRawValue();
    const datos = {
      medicamentoId: v.medicamentoId,
      casoSaludId: v.casoSaludId || null,
      dosis: Number(v.dosis),
      via: v.via,
      fecha: v.fecha,
      diasRetiroCarne: numeroONulo(v.diasRetiroCarne),
      diasRetiroLeche: numeroONulo(v.diasRetiroLeche),
      observaciones: v.observaciones.trim(),
    };
    const actual = this.tratamiento();
    let peticion;
    if (actual) {
      peticion = this.api.actualizar(actual.id, datos);
    } else {
      const sujeto = this.fijo() ?? { tipo: this.tipoElegido(), id: v.animalId };
      peticion = this.api.crear({ ...datos, [sujeto.tipo === 'lote' ? 'loteId' : 'vacunoId']: sujeto.id });
    }
    peticion.subscribe({
      next: (t) => {
        this.guardando.set(false);
        this.guardado.emit(t);
      },
      error: (e) => {
        const porCampo = erroresPorCampo(e);
        this.errores.set(porCampo);
        this.error.set(Object.keys(porCampo).length ? null : mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }
}
