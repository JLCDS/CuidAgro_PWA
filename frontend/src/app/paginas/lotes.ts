import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { BajaDialogo } from '../compartido/baja-dialogo';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { LotesApi } from '../core/lotes-api';
import { etiquetaDe, FiltroEstado, formatearFecha, Lote, PROPOSITOS_LOTE, PropositoLote } from '../core/modelos';
import { HistorialDialogo } from './historial-dialogo';
import { LoteForm } from './lote-form';

@Component({
  selector: 'app-lotes',
  imports: [RouterLink, LoteForm, BajaDialogo, HistorialDialogo],
  template: `
    <div class="cabecera-pagina">
      <h1>Lotes de aves</h1>
      @if (puedeGestionar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo lote</button>
      }
    </div>

    @if (!fincaId()) {
      <div class="vacio">
        Aún no hay una finca para trabajar.
        @if (puedeCrearFincas()) {
          <a routerLink="/fincas">Crea una finca</a> primero.
        }
      </div>
    } @else {
      <div class="filtros">
        <input class="input" type="search" placeholder="Buscar por identificador" aria-label="Buscar por identificador"
          [value]="q()" (input)="cambiarBusqueda($any($event.target).value)" />
        <select class="input" aria-label="Filtrar por propósito" [value]="proposito()" (change)="cambiarProposito($any($event.target).value)">
          <option value="">Todos los propósitos</option>
          @for (p of propositos; track p.valor) {
            <option [value]="p.valor">{{ p.etiqueta }}</option>
          }
        </select>
        <select class="input" aria-label="Filtrar por estado" [value]="estado()" (change)="cambiarEstadoFiltro($any($event.target).value)">
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Dados de baja</option>
          <option value="TODOS">Todos</option>
        </select>
      </div>

      @if (aviso(); as mensaje) {
        <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      @if (cargando()) {
        <p class="suave" role="status">Cargando…</p>
      } @else if (lotes().length === 0 && !error()) {
        <div class="vacio">No hay lotes que coincidan con la búsqueda.</div>
      } @else if (lotes().length > 0) {
        <table class="tabla">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Cantidad</th>
              <th>Edad</th>
              <th>Propósito</th>
              <th>Estado</th>
              @if (hayAcciones()) {
                <th><span class="sr-only">Acciones</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (l of lotes(); track l.id) {
              <tr>
                <td>
                  <strong>{{ l.nombre }}</strong>
                  @if (detalle(l); as texto) {
                    <br /><span class="suave">{{ texto }}</span>
                  }
                </td>
                <td data-etiqueta="Cantidad">{{ l.cantidad }} aves</td>
                <td data-etiqueta="Edad">{{ l.edadMinSemanas }} a {{ l.edadMaxSemanas }} semanas</td>
                <td data-etiqueta="Propósito">{{ etiqueta(propositos, l.proposito) }}</td>
                <td data-etiqueta="Estado">
                  <span class="insignia" [class.insignia-activo]="l.estado === 'ACTIVO'" [class.insignia-inactivo]="l.estado === 'INACTIVO'">
                    {{ l.estado === 'ACTIVO' ? 'Activo' : 'De baja' }}
                  </span>
                  @if (l.motivoBaja) {
                    <br /><span class="suave">Motivo: {{ l.motivoBaja }}</span>
                  }
                </td>
                @if (hayAcciones()) {
                  <td>
                    <div class="acciones">
                      @if (puedeHistorial()) {
                        <button type="button" class="btn" (click)="historialDe.set(l)">Historial</button>
                      }
                      @if (puedeGestionar()) {
                      <button type="button" class="btn" (click)="abrir(l)">Editar</button>
                      @if (l.estado === 'ACTIVO') {
                        <button type="button" class="btn btn-peligro" (click)="pedirBaja(l)">Dar de baja</button>
                      } @else {
                        <button type="button" class="btn" (click)="reactivar(l)">Reactivar</button>
                      }
                      }
                    </div>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      }
    }

    @if (formularioAbierto()) {
      @if (fincaId(); as id) {
        <app-lote-form [lote]="editando()" [fincaId]="id" (guardado)="alGuardar()" (cerrado)="formularioAbierto.set(false)" />
      }
    }

    @if (historialDe(); as h) {
      @if (fincaId(); as id) {
        <app-historial-dialogo tipo="lote" [animalId]="h.id" [nombre]="h.nombre" [fincaId]="id" (cerrado)="historialDe.set(null)" />
      }
    }

    @if (bajaDe(); as l) {
      <app-baja-dialogo
        titulo="Dar de baja lote"
        [descripcion]="'¿Dar de baja el lote ' + l.nombre + '? El registro se conserva y se puede reactivar.'"
        [trabajando]="dandoBaja()" [error]="errorBaja()"
        (confirmado)="darDeBaja(l, $event)" (cerrado)="bajaDe.set(null)" />
    }
  `,
})
export class Lotes {
  private readonly api = inject(LotesApi);
  private readonly auth = inject(Auth);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly busqueda$ = new Subject<void>();
  private readonly recarga$ = new Subject<void>();

  protected readonly propositos = PROPOSITOS_LOTE;
  protected readonly etiqueta = etiquetaDe;

  protected readonly fincaId = this.fincaActiva.id;
  protected readonly puedeGestionar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('animales:gestionar');
  });
  protected readonly puedeHistorial = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('salud:consultar');
  });
  protected readonly hayAcciones = computed(() => this.puedeGestionar() || this.puedeHistorial());
  protected readonly historialDe = signal<{ id: string; nombre: string } | null>(null);
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  protected readonly q = signal('');
  protected readonly proposito = signal<PropositoLote | ''>('');
  protected readonly estado = signal<FiltroEstado>('ACTIVO');

  protected readonly lotes = signal<Lote[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<Lote | null>(null);
  protected readonly bajaDe = signal<Lote | null>(null);
  protected readonly dandoBaja = signal(false);
  protected readonly errorBaja = signal<string | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.busqueda$.pipe(debounceTime(300), takeUntilDestroyed(destroyRef)).subscribe(() => this.recarga$.next());

    // switchMap descarta respuestas de filtros anteriores que lleguen tarde.
    this.recarga$
      .pipe(
        tap(() => this.error.set(null)),
        switchMap(() =>
          this.api
            .listar({ fincaId: this.fincaId()!, estado: this.estado(), q: this.q(), proposito: this.proposito() })
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
      .subscribe((lotes) => {
        this.lotes.set(lotes);
        this.cargando.set(false);
      });

    // Recarga al abrir la página y cada vez que cambia la finca activa.
    effect(() => {
      if (this.fincaId()) {
        untracked(() => {
          this.cargando.set(true);
          this.recarga$.next();
        });
      } else {
        this.lotes.set([]);
        this.cargando.set(false);
      }
    });
  }

  protected detalle(lote: Lote): string {
    const ingreso = lote.fechaIngreso ? `ingresó el ${formatearFecha(lote.fechaIngreso)}` : '';
    return [lote.tipoAve, ingreso].filter(Boolean).join(' · ');
  }

  protected cambiarBusqueda(valor: string): void {
    this.q.set(valor);
    this.busqueda$.next();
  }

  protected cambiarProposito(valor: PropositoLote | ''): void {
    this.proposito.set(valor);
    this.recarga$.next();
  }

  protected cambiarEstadoFiltro(valor: FiltroEstado): void {
    this.estado.set(valor);
    this.recarga$.next();
  }

  protected abrir(lote: Lote | null): void {
    this.aviso.set(null);
    this.editando.set(lote);
    this.formularioAbierto.set(true);
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Lote actualizado.' : 'Lote registrado.');
    this.formularioAbierto.set(false);
    this.recarga$.next();
  }

  protected pedirBaja(lote: Lote): void {
    this.errorBaja.set(null);
    this.bajaDe.set(lote);
  }

  protected darDeBaja(lote: Lote, motivo: string): void {
    this.dandoBaja.set(true);
    this.errorBaja.set(null);
    this.api.cambiarEstado(lote.id, 'INACTIVO', motivo).subscribe({
      next: () => {
        this.dandoBaja.set(false);
        this.bajaDe.set(null);
        this.aviso.set('Lote dado de baja.');
        this.recarga$.next();
      },
      error: (error) => {
        this.dandoBaja.set(false);
        this.errorBaja.set(mensajeDeError(error));
      },
    });
  }

  protected reactivar(lote: Lote): void {
    this.aviso.set(null);
    this.api.cambiarEstado(lote.id, 'ACTIVO').subscribe({
      next: () => {
        this.aviso.set('Lote reactivado.');
        this.recarga$.next();
      },
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }
}
