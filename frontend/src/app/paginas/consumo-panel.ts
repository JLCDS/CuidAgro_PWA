import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, Observable, Subject, switchMap, tap } from 'rxjs';
import { Modal } from '../compartido/modal';
import { AlimentosApi } from '../core/alimentos-api';
import { Auth } from '../core/auth';
import { ConsumosApi } from '../core/consumos-api';
import { mensajeDeError } from '../core/errores';
import { LotesApi } from '../core/lotes-api';
import {
  Alimento,
  Consumo,
  etiquetaDe,
  formatearFecha,
  formatearGramos,
  hoyBogota,
  Jornada,
  JORNADAS,
  TipoConsumo,
} from '../core/modelos';
import { VacunosApi } from '../core/vacunos-api';
import { ConsumoForm } from './consumo-form';

/** Formulario rápido y lista de consumos de una finca para vacunos o para lotes. */
@Component({
  selector: 'app-consumo-panel',
  imports: [ConsumoForm, Modal],
  template: `
    <section class="tarjeta pila">
      <h2>Registrar consumo</h2>
      @if (alerta(); as a) {
        <p class="alerta" [class.alerta-exito]="a.tipo === 'ok'" [class.alerta-aviso]="a.tipo === 'bajo'" [attr.role]="a.tipo === 'ok' ? 'status' : 'alert'">
          {{ a.mensaje }}
        </p>
      }
      <app-consumo-form [tipo]="tipo()" [animales]="animales()" [alimentos]="alimentos()" (guardado)="alGuardar($event)" (encolado)="alEncolar()" />
    </section>

    <h2 class="titulo-lista">Consumos registrados</h2>
    <div class="filtros-consumos">
      <div class="campo">
        <label for="f-desde">Desde</label>
        <input id="f-desde" class="input" type="date" [max]="hoy" [value]="desde()" (change)="cambiarDesde($any($event.target).value)" />
      </div>
      <div class="campo">
        <label for="f-hasta">Hasta</label>
        <input id="f-hasta" class="input" type="date" [max]="hoy" [value]="hasta()" (change)="cambiarHasta($any($event.target).value)" />
      </div>
      <div class="campo">
        <label for="f-jornada">Jornada</label>
        <select id="f-jornada" class="input" [value]="jornada()" (change)="cambiarJornada($any($event.target).value)">
          <option value="">Todas</option>
          @for (j of jornadas; track j.valor) {
            <option [value]="j.valor">{{ j.etiqueta }}</option>
          }
        </select>
      </div>
      <div class="campo">
        <label for="f-animal">{{ tipo() === 'vacunos' ? 'Vacuno' : 'Lote' }}</label>
        <select id="f-animal" class="input" [value]="animalId()" (change)="cambiarAnimal($any($event.target).value)">
          <option value="">Todos</option>
          @for (a of animales(); track a.id) {
            <option [value]="a.id">{{ a.nombre }}</option>
          }
        </select>
      </div>
    </div>

    @if (error(); as mensaje) {
      <p class="alerta" role="alert">{{ mensaje }}</p>
    }

    @if (cargando()) {
      <p class="suave" role="status">Cargando…</p>
    } @else if (consumos().length === 0 && !error()) {
      <div class="vacio"><img class="vacio-objeto" src="img/vacio-alimentos.webp" alt="" width="320" height="320" loading="lazy" />No hay consumos en el período seleccionado.</div>
    } @else if (consumos().length > 0) {
      <table class="tabla">
        <thead>
          <tr>
            <th>{{ tipo() === 'vacunos' ? 'Vacuno' : 'Lote' }}</th>
            <th>Alimento</th>
            <th>Cantidad</th>
            <th>Jornada</th>
            <th>Registró</th>
            @if (hayAcciones()) {
              <th><span class="sr-only">Acciones</span></th>
            }
          </tr>
        </thead>
        <tbody>
          @for (c of consumos(); track c.id) {
            <tr>
              <td><strong>{{ nombreDe(c) }}</strong></td>
              <td data-etiqueta="Alimento">{{ c.alimento.nombre }}</td>
              <td data-etiqueta="Cantidad">{{ gramos(c.cantidadGramos) }}</td>
              <td data-etiqueta="Jornada">{{ etiqueta(jornadas, c.jornada) }} · {{ fecha(c.fecha) }}</td>
              <td data-etiqueta="Registró">{{ c.registradoPor.nombre }}</td>
              @if (hayAcciones()) {
                <td>
                  @if (puedeEditar(c)) {
                    <div class="acciones">
                      <button type="button" class="btn" (click)="editando.set(c)">Editar</button>
                      <button type="button" class="btn btn-peligro" (click)="borrar(c)">Borrar</button>
                    </div>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }

    @if (editando(); as c) {
      <app-modal titulo="Editar consumo" (cerrado)="editando.set(null)">
        <div class="modal-cuerpo">
          <app-consumo-form [tipo]="tipo()" [alimentos]="alimentos()" [consumo]="c"
            (guardado)="alEditar($event)" (cancelado)="editando.set(null)" />
        </div>
      </app-modal>
    }
  `,
  styles: `
    .titulo-lista { margin: 24px 0 12px; }
    .filtros-consumos { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 16px; }
    @media (min-width: 720px) { .filtros-consumos { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  `,
})
export class ConsumoPanel {
  private readonly api = inject(ConsumosApi);
  private readonly alimentosApi = inject(AlimentosApi);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);
  private readonly auth = inject(Auth);
  private readonly recarga$ = new Subject<void>();

  readonly tipo = input.required<TipoConsumo>();
  readonly fincaId = input.required<string>();

  protected readonly jornadas = JORNADAS;
  protected readonly etiqueta = etiquetaDe;
  protected readonly gramos = formatearGramos;
  protected readonly fecha = formatearFecha;
  protected readonly hoy = hoyBogota();

  protected readonly animales = signal<{ id: string; nombre: string }[]>([]);
  protected readonly alimentos = signal<Alimento[]>([]);

  protected readonly desde = signal(hoyBogota());
  protected readonly hasta = signal(hoyBogota());
  protected readonly jornada = signal<Jornada | ''>('');
  protected readonly animalId = signal('');

  protected readonly consumos = signal<Consumo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly alerta = signal<{ tipo: 'ok' | 'bajo' | 'negativo'; mensaje: string } | null>(null);
  protected readonly editando = signal<Consumo | null>(null);

  private readonly puedeGestionar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('consumos:gestionar');
  });
  protected readonly hayAcciones = computed(() => this.consumos().some((c) => this.puedeEditar(c)));

  constructor() {
    const destroyRef = inject(DestroyRef);

    // switchMap descarta respuestas de filtros anteriores que lleguen tarde.
    this.recarga$
      .pipe(
        tap(() => this.error.set(null)),
        switchMap(() =>
          this.api
            .listar(this.tipo(), {
              fincaId: this.fincaId(),
              animalId: this.animalId(),
              jornada: this.jornada(),
              desde: this.desde(),
              hasta: this.hasta(),
            })
            .pipe(
              catchError((error) => {
                this.error.set(mensajeDeError(error));
                this.cargando.set(false);
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((consumos) => {
        this.consumos.set(consumos);
        this.cargando.set(false);
      });

    // Al abrir y al cambiar de finca se recargan los catálogos y la lista.
    effect(() => {
      const fincaId = this.fincaId();
      const tipo = this.tipo();
      untracked(() => {
        this.animalId.set('');
        this.cargando.set(true);
        this.cargarCatalogos(fincaId, tipo);
        this.recarga$.next();
      });
    });
  }

  private cargarCatalogos(fincaId: string, tipo: TipoConsumo): void {
    const filtros = { fincaId, estado: 'ACTIVO' as const, q: '', proposito: '' as const };
    const animales$: Observable<{ id: string; nombre: string }[]> =
      tipo === 'vacunos' ? this.vacunosApi.listar(filtros) : this.lotesApi.listar(filtros);
    animales$.subscribe({
      next: (animales) => this.animales.set(animales),
      error: (error) => this.error.set(mensajeDeError(error)),
    });
    this.recargarAlimentos(fincaId);
  }

  private recargarAlimentos(fincaId: string): void {
    this.alimentosApi.listar({ fincaId, estado: 'ACTIVO', q: '', tipo: '', bajoStock: false }).subscribe({
      next: (alimentos) => this.alimentos.set(alimentos),
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }

  protected nombreDe(c: Consumo): string {
    return (c.vacuno ?? c.lote)?.nombre ?? '';
  }

  /** Igual que el backend: quien gestiona edita todo; el ayudante, solo lo suyo de hoy. */
  protected puedeEditar(c: Consumo): boolean {
    return this.puedeGestionar() || (c.registradoPor.id === this.auth.usuario()?.id && c.fecha === hoyBogota());
  }

  protected cambiarDesde(valor: string): void {
    this.desde.set(valor);
    this.recarga$.next();
  }

  protected cambiarHasta(valor: string): void {
    this.hasta.set(valor);
    this.recarga$.next();
  }

  protected cambiarJornada(valor: Jornada | ''): void {
    this.jornada.set(valor);
    this.recarga$.next();
  }

  protected cambiarAnimal(valor: string): void {
    this.animalId.set(valor);
    this.recarga$.next();
  }

  protected alGuardar(consumo: Consumo): void {
    this.alerta.set(this.alertaDe(consumo, 'registrado'));
    this.recargarAlimentos(this.fincaId());
    this.recarga$.next();
  }

  protected alEncolar(): void {
    this.alerta.set({ tipo: 'ok', mensaje: 'Guardado sin conexión. Se enviará cuando vuelva la señal.' });
  }

  protected alEditar(consumo: Consumo): void {
    this.alerta.set(this.alertaDe(consumo, 'actualizado'));
    this.editando.set(null);
    this.recargarAlimentos(this.fincaId());
    this.recarga$.next();
  }

  protected borrar(consumo: Consumo): void {
    if (!confirm(`¿Borrar el consumo de ${this.nombreDe(consumo)}? Se devolverá la cantidad al inventario.`)) return;
    this.alerta.set(null);
    this.api.eliminar(this.tipo(), consumo.id).subscribe({
      next: () => {
        this.alerta.set({ tipo: 'ok', mensaje: 'Consumo borrado y cantidad devuelta al inventario.' });
        this.recargarAlimentos(this.fincaId());
        this.recarga$.next();
      },
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }

  /** Avisa si el alimento quedó en stock bajo o negativo después de la operación. */
  private alertaDe(consumo: Consumo, accion: string) {
    const { nombre, stockGramos, bajoStock } = consumo.alimento;
    if (stockGramos < 0) {
      return {
        tipo: 'negativo' as const,
        mensaje: `Consumo ${accion}. "${nombre}" quedó en negativo (${formatearGramos(stockGramos)}): registra una entrada de inventario.`,
      };
    }
    if (bajoStock) {
      return {
        tipo: 'bajo' as const,
        mensaje: `Consumo ${accion}. "${nombre}" quedó con stock bajo (${formatearGramos(stockGramos)}).`,
      };
    }
    return { tipo: 'ok' as const, mensaje: `Consumo ${accion}.` };
  }
}
