import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ConsumosApi } from '../core/consumos-api';
import { mensajeDeError } from '../core/errores';
import {
  Alimento,
  Consumo,
  formatearGramos,
  hoyBogota,
  Jornada,
  JORNADAS,
  jornadaActual,
  TipoConsumo,
} from '../core/modelos';

const MAX_GRAMOS: Record<TipoConsumo, number> = { vacunos: 200_000, lotes: 10_000_000 };

function noFutura(control: AbstractControl<string>): ValidationErrors | null {
  return control.value > hoyBogota() ? { futura: true } : null;
}

/** Formulario rápido de consumo, pensado para el celular. Sirve para crear (en línea) y para editar (en un modal). */
@Component({
  selector: 'app-consumo-form',
  imports: [ReactiveFormsModule],
  template: `
    <form class="pila" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      <div class="campo">
        <label for="c-animal">{{ tipo() === 'vacunos' ? 'Vacuno' : 'Lote' }}</label>
        @if (consumo(); as c) {
          <input id="c-animal" class="input" [value]="(c.vacuno ?? c.lote)?.nombre" readonly />
        } @else {
          <select id="c-animal" class="input" formControlName="animalId" [class.invalido]="invalido('animalId')">
            <option value="">{{ tipo() === 'vacunos' ? 'Selecciona un vacuno' : 'Selecciona un lote' }}</option>
            @for (a of animales(); track a.id) {
              <option [value]="a.id">{{ a.nombre }}</option>
            }
          </select>
          @if (invalido('animalId')) {
            <span class="error-campo">Selecciona {{ tipo() === 'vacunos' ? 'un vacuno' : 'un lote' }}.</span>
          } @else if (animales().length === 0) {
            <span class="ayuda">No hay {{ tipo() === 'vacunos' ? 'vacunos' : 'lotes' }} activos en esta finca.</span>
          }
        }
      </div>

      <div class="campo">
        <label for="c-alimento">Alimento</label>
        <select id="c-alimento" class="input" formControlName="alimentoId" [class.invalido]="invalido('alimentoId')">
          <option value="">Selecciona un alimento</option>
          @for (a of opcionesAlimento(); track a.id) {
            <option [value]="a.id">{{ a.nombre }} · stock {{ gramos(a.stockGramos) }}</option>
          }
        </select>
        @if (invalido('alimentoId')) {
          <span class="error-campo">Selecciona un alimento.</span>
        } @else if (opcionesAlimento().length === 0) {
          <span class="ayuda">No hay alimentos activos en esta finca.</span>
        }
      </div>

      <div class="campo">
        <label for="c-cantidad">Cantidad</label>
        <div class="cantidad">
          <input id="c-cantidad" class="input" type="number" inputmode="decimal" min="0" step="any"
            formControlName="cantidad" [class.invalido]="invalido('cantidad') || cantidadFueraDeRango()" />
          <select class="input" formControlName="unidad" aria-label="Unidad">
            <option value="g">g</option>
            <option value="kg">kg</option>
          </select>
        </div>
        @if (invalido('cantidad') || cantidadFueraDeRango()) {
          <span class="error-campo">Ingresa una cantidad mayor que 0 y hasta {{ gramos(maximo()) }}.</span>
        } @else if (gramosEscritos() > 0) {
          <span class="ayuda">Se registrarán {{ gramosEscritos() }} g ({{ gramos(gramosEscritos()) }}).</span>
        }
      </div>

      <div class="campo">
        <span class="etiqueta" id="c-jornada">Jornada</span>
        <div class="segmentos" role="group" aria-labelledby="c-jornada">
          @for (j of jornadas; track j.valor) {
            <button type="button" class="btn segmento" [class.activo]="jornadaElegida() === j.valor"
              [attr.aria-pressed]="jornadaElegida() === j.valor" (click)="elegirJornada(j.valor)">
              {{ j.etiqueta }}
            </button>
          }
        </div>
      </div>

      <div class="campo">
        <label for="c-fecha">Fecha</label>
        <input id="c-fecha" class="input" type="date" [max]="hoy" formControlName="fecha" [class.invalido]="invalido('fecha')" />
        @if (invalido('fecha')) {
          <span class="error-campo">Ingresa una fecha que no sea futura.</span>
        }
      </div>

      <div class="campo">
        <label for="c-obs">Observaciones (opcional)</label>
        <input id="c-obs" class="input" formControlName="observaciones" maxlength="500" />
      </div>

      <div class="acciones">
        @if (consumo()) {
          <button type="button" class="btn" (click)="cancelado.emit()">Cancelar</button>
        }
        <button type="submit" class="btn btn-primario boton-guardar" [disabled]="guardando()">
          {{ guardando() ? 'Guardando…' : consumo() ? 'Guardar cambios' : 'Registrar consumo' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .cantidad { display: grid; grid-template-columns: minmax(0, 1fr) 84px; gap: 8px; }
    .segmentos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .segmento { padding: 0 6px; }
    .segmento.activo { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
    .boton-guardar { flex: 1; min-height: 52px; }
  `,
})
export class ConsumoForm implements OnInit {
  private readonly api = inject(ConsumosApi);

  readonly tipo = input.required<TipoConsumo>();
  readonly animales = input<{ id: string; nombre: string }[]>([]);
  readonly alimentos = input<Alimento[]>([]);
  /** Si viene, se edita ese consumo; si no, se crea uno nuevo. */
  readonly consumo = input<Consumo | null>(null);
  readonly guardado = output<Consumo>();
  readonly cancelado = output<void>();

  protected readonly jornadas = JORNADAS;
  protected readonly gramos = formatearGramos;
  protected readonly hoy = hoyBogota();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    animalId: ['', Validators.required],
    alimentoId: ['', Validators.required],
    cantidad: [null as number | null, [Validators.required, Validators.min(0.001)]],
    unidad: ['g' as 'g' | 'kg'],
    jornada: [jornadaActual() as Jornada],
    fecha: [hoyBogota(), [Validators.required, noFutura]],
    observaciones: [''],
  });

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly jornadaElegida = computed(() => this.valores().jornada);
  protected readonly maximo = computed(() => MAX_GRAMOS[this.tipo()]);
  protected readonly gramosEscritos = computed(() => {
    const { cantidad, unidad } = this.valores();
    return cantidad ? Math.round(unidad === 'kg' ? cantidad * 1000 : cantidad) : 0;
  });
  protected readonly cantidadFueraDeRango = computed(() => {
    const { cantidad } = this.valores();
    const g = this.gramosEscritos();
    return !!cantidad && cantidad > 0 && (g < 1 || g > this.maximo());
  });
  /** Alimentos activos; al editar se conserva el actual aunque ya esté dado de baja. */
  protected readonly opcionesAlimento = computed<{ id: string; nombre: string; stockGramos: number }[]>(() => {
    const actual = this.consumo();
    const lista = this.alimentos();
    return actual && !lista.some((a) => a.id === actual.alimentoId) ? [actual.alimento, ...lista] : lista;
  });

  ngOnInit(): void {
    const c = this.consumo();
    if (c) {
      this.form.controls.animalId.clearValidators();
      this.form.controls.animalId.updateValueAndValidity();
      this.form.patchValue({
        alimentoId: c.alimentoId,
        cantidad: c.cantidadGramos,
        unidad: 'g',
        jornada: c.jornada,
        fecha: c.fecha,
        observaciones: c.observaciones ?? '',
      });
    }
  }

  protected invalido(campo: 'animalId' | 'alimentoId' | 'cantidad' | 'fecha'): boolean {
    const control = this.form.controls[campo];
    return control.invalid && control.touched;
  }

  protected elegirJornada(jornada: Jornada): void {
    this.form.controls.jornada.setValue(jornada);
  }

  protected guardar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.cantidadFueraDeRango()) return;
    this.guardando.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const datos = {
      alimentoId: v.alimentoId,
      cantidadGramos: this.gramosEscritos(),
      jornada: v.jornada,
      fecha: v.fecha,
      observaciones: v.observaciones,
    };
    const actual = this.consumo();
    (actual
      ? this.api.actualizar(this.tipo(), actual.id, datos)
      : this.api.crear(this.tipo(), v.animalId, datos)
    ).subscribe({
      next: (consumo) => {
        this.guardando.set(false);
        if (!actual) {
          // Se conservan alimento, jornada y fecha para registrar al siguiente animal sin reescribirlos.
          this.form.patchValue({ animalId: '', cantidad: null, observaciones: '' });
          this.form.markAsUntouched();
        }
        this.guardado.emit(consumo);
      },
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
