import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { PropositoLote } from '../core/modelos';
import { Raciones, RacionesApi } from '../core/raciones-api';
import { FilaRacion, MAX_SEMANAS_RACION, tablaDefecto } from '../core/raciones';

const PESTANAS: { valor: PropositoLote; etiqueta: string }[] = [
  { valor: 'ALIMENTACION', etiqueta: 'Engorde' },
  { valor: 'PRODUCCION', etiqueta: 'Ponedoras' },
];

/** Tabla de ración por semana de vida (g por ave y día), con pestañas por propósito. */
@Component({
  selector: 'app-raciones-tabla',
  template: `
    <section class="tarjeta pila" aria-labelledby="raciones-titulo">
      <h2 id="raciones-titulo">Ración por semana</h2>
      <p class="suave">Gramos de alimento por ave y por día según la semana de vida. Se usa para sugerir la cantidad al registrar el consumo de un lote.</p>

      <div class="pestanas" role="tablist" aria-label="Tipo de ave">
        @for (p of pestanas; track p.valor) {
          <button type="button" role="tab" class="btn" [class.activa]="proposito() === p.valor"
            [attr.aria-selected]="proposito() === p.valor" (click)="elegir(p.valor)">{{ p.etiqueta }}</button>
        }
      </div>

      @if (aviso(); as mensaje) {
        <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      <p>
        <span class="insignia" [class.insignia-activo]="personalizada()">{{ personalizada() ? 'Personalizada' : 'Por defecto' }}</span>
      </p>

      @if (cargando()) {
        <p class="suave" role="status">Cargando…</p>
      } @else {
        <ul class="semanas" aria-label="Gramos por ave y día">
          @for (f of filas(); track f.semana; let i = $index) {
            <li>
              <label [attr.for]="'rac-' + f.semana">Semana {{ f.semana }}</label>
              @if (puedeEditar()) {
                <span class="entrada">
                  <input [id]="'rac-' + f.semana" class="input" type="number" inputmode="numeric" min="1" max="400" step="1"
                    [value]="f.gramosAveDia" [class.invalido]="!valido(f.gramosAveDia)"
                    (input)="cambiar(i, $any($event.target).value)" />
                  <span class="unidad">g</span>
                </span>
              } @else {
                <strong [id]="'rac-' + f.semana">{{ f.gramosAveDia }} g</strong>
              }
            </li>
          }
        </ul>

        @if (puedeEditar()) {
          <div class="acciones">
            <button type="button" class="btn" [disabled]="filas().length >= maxSemanas" (click)="agregar()">Agregar semana</button>
            <button type="button" class="btn" [disabled]="filas().length <= 1" (click)="quitar()">Quitar última semana</button>
          </div>
          @if (hayInvalidas()) {
            <p class="error-campo">Cada semana debe tener un número entero entre 1 y 400 g.</p>
          }
          <div class="acciones">
            <button type="button" class="btn btn-primario" [disabled]="trabajando() || hayInvalidas() || !hayCambios()" (click)="guardar()">
              {{ trabajando() ? 'Guardando…' : 'Guardar ración' }}
            </button>
            @if (personalizada()) {
              <button type="button" class="btn" [disabled]="trabajando()" (click)="restaurar()">Volver a la tabla por defecto</button>
            }
          </div>
        }
      }
    </section>
  `,
  styles: `
    .pestanas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .pestanas .activa { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
    .semanas { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr); }
    .semanas li {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px;
      padding: 4px 12px; border: 1px solid var(--borde); border-radius: 10px; background: var(--crema);
    }
    .entrada { display: flex; align-items: center; gap: 6px; }
    .entrada .input { width: 96px; }
    .unidad { color: var(--texto-suave); }
    @media (min-width: 720px) { .semanas { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class RacionesTabla {
  private readonly api = inject(RacionesApi);
  private readonly auth = inject(Auth);

  readonly fincaId = input.required<string>();

  protected readonly pestanas = PESTANAS;
  protected readonly maxSemanas = MAX_SEMANAS_RACION;

  protected readonly proposito = signal<PropositoLote>('ALIMENTACION');
  private readonly datos = signal<Raciones | null>(null);
  /** Copia editable de la tabla visible. */
  protected readonly filas = signal<FilaRacion[]>([]);
  protected readonly cargando = signal(true);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly puedeEditar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('alimentos:gestionar');
  });
  protected readonly personalizada = computed(() => this.datos()?.tablas[this.proposito()]?.personalizada ?? false);
  protected readonly hayInvalidas = computed(() => this.filas().some((f) => !this.valido(f.gramosAveDia)));
  protected readonly hayCambios = computed(() => {
    const original = this.original();
    const actual = this.filas();
    return original.length !== actual.length || original.some((f, i) => f.gramosAveDia !== actual[i].gramosAveDia);
  });

  constructor() {
    effect(() => {
      const id = this.fincaId();
      untracked(() => this.cargar(id));
    });
  }

  private original(): FilaRacion[] {
    return this.datos()?.tablas[this.proposito()]?.semanas ?? tablaDefecto(this.proposito());
  }

  private cargar(fincaId: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.obtener(fincaId).subscribe({
      next: (r) => {
        this.datos.set(r);
        this.reiniciar();
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  private reiniciar(): void {
    this.filas.set(this.original().map((f) => ({ ...f })));
  }

  protected elegir(p: PropositoLote): void {
    this.proposito.set(p);
    this.aviso.set(null);
    this.error.set(null);
    this.reiniciar();
  }

  protected valido(g: number): boolean {
    return Number.isInteger(g) && g >= 1 && g <= 400;
  }

  protected cambiar(indice: number, texto: string): void {
    const valor = texto.trim() === '' ? NaN : Number(texto);
    this.filas.update((filas) => filas.map((f, i) => (i === indice ? { ...f, gramosAveDia: valor } : f)));
  }

  protected agregar(): void {
    this.filas.update((filas) => {
      const ultima = filas[filas.length - 1];
      return [...filas, { semana: filas.length + 1, gramosAveDia: ultima?.gramosAveDia ?? 100 }];
    });
  }

  protected quitar(): void {
    this.filas.update((filas) => filas.slice(0, -1));
  }

  protected guardar(): void {
    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    const semanas = this.filas().map((f, i) => ({ semana: i + 1, gramosAveDia: f.gramosAveDia }));
    this.api.guardar(this.fincaId(), this.proposito(), semanas).subscribe({
      next: (r) => {
        this.datos.set(r);
        this.reiniciar();
        this.trabajando.set(false);
        this.aviso.set('Ración guardada.');
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  protected restaurar(): void {
    if (!confirm('¿Volver a la tabla por defecto? Se pierden los valores personalizados de esta tabla.')) return;
    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.api.restaurar(this.fincaId(), this.proposito()).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.aviso.set('Se volvió a la tabla por defecto.');
        this.cargar(this.fincaId());
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }
}
