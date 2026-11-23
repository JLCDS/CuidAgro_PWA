import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { LotesApi } from '../core/lotes-api';
import { hoyBogota } from '../core/modelos';
import { CasoGuardar, SaludApi } from '../core/salud-api';
import { CasoSalud, erroresPorCampo, ESTADOS_CASO, EstadoCasoSalud } from '../core/salud-modelos';
import { VacunosApi } from '../core/vacunos-api';

/** Animal o lote ya conocido (al crear el caso desde una novedad o desde el historial). */
export interface SujetoCaso {
  tipo: 'vacuno' | 'lote';
  id: string;
  nombre: string;
  novedadId?: string;
}

const noFutura = (c: AbstractControl<string>): ValidationErrors | null => (c.value > hoyBogota() ? { futura: true } : null);

@Component({
  selector: 'app-caso-form',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [titulo]="caso() ? 'Editar caso de salud' : 'Nuevo caso de salud'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        @if (fijo(); as s) {
          <p class="suave">{{ s.tipo === 'lote' ? 'Lote' : 'Vacuno' }}: <strong>{{ s.nombre }}</strong></p>
        } @else {
          <div class="campo">
            <span class="etiqueta" id="k-sujeto-et">Sobre</span>
            <div class="segmentos" role="group" aria-labelledby="k-sujeto-et">
              <button type="button" class="btn segmento" [class.activo]="tipoElegido() === 'vacuno'" [attr.aria-pressed]="tipoElegido() === 'vacuno'" (click)="elegirTipo('vacuno')">Vacuno</button>
              <button type="button" class="btn segmento" [class.activo]="tipoElegido() === 'lote'" [attr.aria-pressed]="tipoElegido() === 'lote'" (click)="elegirTipo('lote')">Lote de ovíparos</button>
            </div>
          </div>
          <div class="campo">
            <label for="k-animal">{{ tipoElegido() === 'lote' ? 'Lote' : 'Vacuno' }}</label>
            <select id="k-animal" class="input" formControlName="animalId" [class.invalido]="invalido('animalId') || !!campo('vacunoId') || !!campo('loteId')">
              <option value="">{{ tipoElegido() === 'lote' ? 'Selecciona un lote' : 'Selecciona un vacuno' }}</option>
              @for (a of opciones(); track a.id) {
                <option [value]="a.id">{{ a.nombre }}</option>
              }
            </select>
            @if (invalido('animalId')) {
              <span class="error-campo">Selecciona {{ tipoElegido() === 'lote' ? 'un lote' : 'un vacuno' }}.</span>
            } @else if (campo('vacunoId') || campo('loteId'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        }

        <div class="campo">
          <label for="k-diag">Diagnóstico</label>
          <input id="k-diag" class="input" formControlName="diagnostico" maxlength="200" [class.invalido]="invalido('diagnostico') || !!campo('diagnostico')" />
          @if (invalido('diagnostico')) {
            <span class="error-campo">El diagnóstico debe tener entre 2 y 200 caracteres.</span>
          } @else if (campo('diagnostico'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="campo">
          <label for="k-sint">Síntomas (opcional)</label>
          <textarea id="k-sint" class="input" formControlName="sintomas" maxlength="2000" [class.invalido]="!!campo('sintomas')"></textarea>
          @if (campo('sintomas'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="campo">
          <label for="k-estado">Estado</label>
          <select id="k-estado" class="input" formControlName="estado" [class.invalido]="!!campo('estado')">
            @for (e of estados; track e.valor) {
              <option [value]="e.valor">{{ e.etiqueta }}</option>
            }
          </select>
          @if (campo('estado'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="dos">
          <div class="campo">
            <label for="k-inicio">Fecha de inicio</label>
            <input id="k-inicio" class="input" type="date" [max]="hoy" formControlName="fechaInicio" [class.invalido]="invalido('fechaInicio') || !!campo('fechaInicio')" />
            @if (invalido('fechaInicio')) {
              <span class="error-campo">Ingresa una fecha que no sea futura.</span>
            } @else if (campo('fechaInicio'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
          @if (cerrando()) {
            <div class="campo">
              <label for="k-fin">Fecha de cierre</label>
              <input id="k-fin" class="input" type="date" [max]="hoy" [min]="valores().fechaInicio" formControlName="fechaFin" [class.invalido]="finInvalida() || !!campo('fechaFin')" />
              @if (finInvalida()) {
                <span class="error-campo">Debe ser posterior al inicio y no futura.</span>
              } @else if (campo('fechaFin'); as e) {
                <span class="error-campo">{{ e }}</span>
              }
            </div>
          }
        </div>

        @if (sujetoTipo() === 'lote') {
          <div class="campo">
            <label for="k-afectados">Animales afectados (opcional)</label>
            <input id="k-afectados" class="input" type="number" inputmode="numeric" min="1" step="1" formControlName="animalesAfectados" [class.invalido]="!!campo('animalesAfectados')" />
            @if (campo('animalesAfectados'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        }

        <div class="campo">
          <label for="k-obs">Observaciones (opcional)</label>
          <textarea id="k-obs" class="input" formControlName="observaciones" maxlength="1000" [class.invalido]="!!campo('observaciones')"></textarea>
          @if (campo('observaciones'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : caso() ? 'Guardar cambios' : 'Crear caso' }}</button>
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
export class CasoForm implements OnInit {
  private readonly api = inject(SaludApi);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);

  readonly fincaId = input.required<string>();
  readonly caso = input<CasoSalud | null>(null);
  /** Animal o lote ya definido (desde una novedad o el historial). */
  readonly sujeto = input<SujetoCaso | null>(null);
  readonly guardado = output<CasoSalud>();
  readonly cerrado = output<void>();

  protected readonly estados = ESTADOS_CASO;
  protected readonly hoy = hoyBogota();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly tipoElegido = signal<'vacuno' | 'lote'>('vacuno');
  private readonly lotes = signal<{ id: string; nombre: string }[]>([]);
  private readonly vacunos = signal<{ id: string; nombre: string }[]>([]);
  protected readonly opciones = computed(() => (this.tipoElegido() === 'lote' ? this.lotes() : this.vacunos()));

  /** Sujeto fijo: el de la entrada o, al editar, el del caso. */
  protected readonly fijo = computed<SujetoCaso | null>(() => {
    const c = this.caso();
    if (c) {
      const s = c.vacuno ?? c.lote;
      return { tipo: c.vacuno ? 'vacuno' : 'lote', id: s!.id, nombre: s!.nombre };
    }
    return this.sujeto();
  });
  protected readonly sujetoTipo = computed(() => this.fijo()?.tipo ?? this.tipoElegido());

  protected readonly form = inject(NonNullableFormBuilder).group({
    animalId: ['', Validators.required],
    diagnostico: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    sintomas: [''],
    estado: ['EN_OBSERVACION' as EstadoCasoSalud],
    fechaInicio: [hoyBogota(), [Validators.required, noFutura]],
    fechaFin: [hoyBogota()],
    animalesAfectados: [null as number | null],
    observaciones: [''],
  });
  protected readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly cerrando = computed(() => ['RECUPERADO', 'FALLECIDO'].includes(this.valores().estado ?? ''));
  protected readonly finInvalida = computed(() => {
    const { fechaInicio, fechaFin } = this.valores();
    return this.cerrando() && (!fechaFin || fechaFin > this.hoy || (!!fechaInicio && fechaFin < fechaInicio));
  });

  ngOnInit(): void {
    const c = this.caso();
    if (c) {
      this.form.controls.animalId.clearValidators();
      this.form.controls.animalId.updateValueAndValidity();
      this.form.patchValue({
        diagnostico: c.diagnostico,
        sintomas: c.sintomas ?? '',
        estado: c.estado,
        fechaInicio: c.fechaInicio,
        fechaFin: c.fechaFin ?? hoyBogota(),
        animalesAfectados: c.animalesAfectados,
        observaciones: c.observaciones ?? '',
      });
      return;
    }
    if (this.sujeto()) {
      this.form.controls.animalId.clearValidators();
      this.form.controls.animalId.updateValueAndValidity();
      return;
    }
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

  protected campo(nombre: string): string | undefined {
    return this.errores()[nombre];
  }

  protected invalido(nombre: 'animalId' | 'diagnostico' | 'fechaInicio'): boolean {
    const c = this.form.controls[nombre];
    return c.invalid && c.touched;
  }

  protected elegirTipo(tipo: 'vacuno' | 'lote'): void {
    this.tipoElegido.set(tipo);
    this.form.controls.animalId.setValue('');
    this.form.controls.animalId.markAsUntouched();
  }

  protected guardar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.finInvalida()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.errores.set({});
    const v = this.form.getRawValue();
    const actual = this.caso();
    const fijo = this.fijo();
    const esLote = this.sujetoTipo() === 'lote';
    const datos: CasoGuardar = {
      diagnostico: v.diagnostico.trim(),
      sintomas: v.sintomas.trim(),
      estado: v.estado,
      fechaInicio: v.fechaInicio,
      fechaFin: this.cerrando() ? v.fechaFin : null,
      observaciones: v.observaciones.trim(),
    };
    if (esLote) datos.animalesAfectados = v.animalesAfectados ? Number(v.animalesAfectados) : null;
    let peticion;
    if (actual) {
      peticion = this.api.actualizar(actual.id, datos);
    } else {
      const sujeto = fijo ?? { tipo: this.tipoElegido(), id: v.animalId, nombre: '' };
      const nuevo: CasoGuardar = { ...datos, [sujeto.tipo === 'lote' ? 'loteId' : 'vacunoId']: sujeto.id };
      if (fijo?.novedadId) nuevo.novedadId = fijo.novedadId;
      if (!this.cerrando()) delete nuevo.fechaFin;
      if (nuevo.animalesAfectados == null) delete nuevo.animalesAfectados;
      peticion = this.api.crear(nuevo);
    }
    peticion.subscribe({
      next: (c) => {
        this.guardando.set(false);
        this.guardado.emit(c);
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
