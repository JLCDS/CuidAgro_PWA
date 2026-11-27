import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { BajaDialogo } from '../compartido/baja-dialogo';
import { AlimentosApi } from '../core/alimentos-api';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { Alimento, etiquetaDe, FiltroEstado, formatearGramos, TipoAlimento, TIPOS_ALIMENTO } from '../core/modelos';
import { AlimentoForm } from './alimento-form';
import { EntradaForm } from './entrada-form';
import { MovimientosDialogo } from './movimientos-dialogo';

@Component({
  selector: 'app-alimentos',
  imports: [RouterLink, AlimentoForm, EntradaForm, MovimientosDialogo, BajaDialogo],
  template: `
    <div class="cabecera-pagina">
      <h1>Inventario de alimentos</h1>
      @if (puedeGestionar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo alimento</button>
      }
    </div>

    @if (!fincaId()) {
      @if (fincasListas()) {
      <div class="vacio">
        <img class="vacio-escena" src="img/finca.webp" alt="" width="720" height="540" loading="lazy" />
        Aún no hay una finca para trabajar.
        @if (puedeCrearFincas()) {
          <a routerLink="/fincas">Crea una finca</a> primero.
        }
      </div>
      }
    } @else {
      <div class="filtros">
        <input class="input" type="search" placeholder="Buscar por nombre" aria-label="Buscar por nombre"
          [value]="q()" (input)="cambiarBusqueda($any($event.target).value)" />
        <select class="input" aria-label="Filtrar por tipo" [value]="tipo()" (change)="cambiarTipo($any($event.target).value)">
          <option value="">Todos los tipos</option>
          @for (t of tipos; track t.valor) {
            <option [value]="t.valor">{{ t.etiqueta }}</option>
          }
        </select>
        <select class="input" aria-label="Filtrar por estado" [value]="estado()" (change)="cambiarEstadoFiltro($any($event.target).value)">
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Dados de baja</option>
          <option value="TODOS">Todos</option>
        </select>
      </div>
      <label class="opcion solo-bajo">
        <input type="checkbox" [checked]="bajoStock()" (change)="cambiarBajoStock($any($event.target).checked)" />
        Solo con stock bajo
      </label>

      @if (aviso(); as mensaje) {
        <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      @if (cargando()) {
        <p class="suave" role="status">Cargando…</p>
      } @else if (alimentos().length === 0 && !error()) {
        <div class="vacio"><img class="vacio-objeto" src="img/vacio-alimentos.webp" alt="" width="320" height="320" loading="lazy" />No hay alimentos que coincidan con la búsqueda.</div>
      } @else if (alimentos().length > 0) {
        <table class="tabla">
          <thead>
            <tr>
              <th>Alimento</th>
              <th>Stock</th>
              <th>Mínimo</th>
              <th>Estado</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (a of alimentos(); track a.id) {
              <tr>
                <td>
                  <strong>{{ a.nombre }}</strong><br />
                  <span class="suave">{{ etiqueta(tipos, a.tipo) }}</span>
                </td>
                <td data-etiqueta="Stock">
                  {{ gramos(a.stockGramos) }}
                  @if (a.stockGramos < 0) {
                    <span class="insignia insignia-inactivo">Negativo</span>
                  } @else if (a.bajoStock) {
                    <span class="insignia insignia-alerta">Stock bajo</span>
                  }
                </td>
                <td data-etiqueta="Mínimo">{{ gramos(a.stockMinimoGramos) }}</td>
                <td data-etiqueta="Estado">
                  <span class="insignia" [class.insignia-activo]="a.estado === 'ACTIVO'" [class.insignia-inactivo]="a.estado === 'INACTIVO'">
                    {{ a.estado === 'ACTIVO' ? 'Activo' : 'De baja' }}
                  </span>
                  @if (a.motivoBaja) {
                    <br /><span class="suave">Motivo: {{ a.motivoBaja }}</span>
                  }
                </td>
                <td>
                  <div class="acciones">
                    @if (puedeGestionar()) {
                      @if (a.estado === 'ACTIVO') {
                        <button type="button" class="btn btn-primario" (click)="entradaDe.set(a)">Registrar entrada</button>
                      }
                      <button type="button" class="btn" (click)="abrir(a)">Editar</button>
                    }
                    <button type="button" class="btn" (click)="movimientosDe.set(a)">Movimientos</button>
                    @if (puedeGestionar()) {
                      @if (a.estado === 'ACTIVO') {
                        <button type="button" class="btn btn-peligro" (click)="pedirBaja(a)">Dar de baja</button>
                      } @else {
                        <button type="button" class="btn" (click)="reactivar(a)">Reactivar</button>
                      }
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    }

    @if (formularioAbierto()) {
      @if (fincaId(); as id) {
        <app-alimento-form [alimento]="editando()" [fincaId]="id" (guardado)="alGuardar()" (cerrado)="formularioAbierto.set(false)" />
      }
    }

    @if (entradaDe(); as a) {
      <app-entrada-form [alimento]="a" (guardado)="alRegistrarEntrada()" (cerrado)="entradaDe.set(null)" />
    }

    @if (movimientosDe(); as a) {
      <app-movimientos-dialogo [alimento]="a" (cerrado)="movimientosDe.set(null)" />
    }

    @if (bajaDe(); as a) {
      <app-baja-dialogo
        titulo="Dar de baja alimento"
        [descripcion]="'¿Dar de baja ' + a.nombre + '? El registro y sus movimientos se conservan y se puede reactivar.'"
        [trabajando]="dandoBaja()" [error]="errorBaja()"
        (confirmado)="darDeBaja(a, $event)" (cerrado)="bajaDe.set(null)" />
    }
  `,
  styles: `
    .solo-bajo { margin: -6px 0 12px; }
    .insignia { margin-left: 6px; }
  `,
})
export class Alimentos {
  private readonly api = inject(AlimentosApi);
  private readonly auth = inject(Auth);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly busqueda$ = new Subject<void>();
  private readonly recarga$ = new Subject<void>();

  protected readonly tipos = TIPOS_ALIMENTO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly gramos = formatearGramos;

  protected readonly fincaId = this.fincaActiva.id;
  protected readonly fincasListas = this.fincaActiva.cargada;
  protected readonly puedeGestionar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('alimentos:gestionar');
  });
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  protected readonly q = signal('');
  protected readonly tipo = signal<TipoAlimento | ''>('');
  protected readonly estado = signal<FiltroEstado>('ACTIVO');
  protected readonly bajoStock = signal(false);

  protected readonly alimentos = signal<Alimento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<Alimento | null>(null);
  protected readonly entradaDe = signal<Alimento | null>(null);
  protected readonly movimientosDe = signal<Alimento | null>(null);
  protected readonly bajaDe = signal<Alimento | null>(null);
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
            .listar({
              fincaId: this.fincaId()!,
              estado: this.estado(),
              q: this.q(),
              tipo: this.tipo(),
              bajoStock: this.bajoStock(),
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
      .subscribe((alimentos) => {
        this.alimentos.set(alimentos);
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
        this.alimentos.set([]);
        this.cargando.set(false);
      }
    });
  }

  protected cambiarBusqueda(valor: string): void {
    this.q.set(valor);
    this.busqueda$.next();
  }

  protected cambiarTipo(valor: TipoAlimento | ''): void {
    this.tipo.set(valor);
    this.recarga$.next();
  }

  protected cambiarEstadoFiltro(valor: FiltroEstado): void {
    this.estado.set(valor);
    this.recarga$.next();
  }

  protected cambiarBajoStock(valor: boolean): void {
    this.bajoStock.set(valor);
    this.recarga$.next();
  }

  protected abrir(alimento: Alimento | null): void {
    this.aviso.set(null);
    this.editando.set(alimento);
    this.formularioAbierto.set(true);
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Alimento actualizado.' : 'Alimento registrado.');
    this.formularioAbierto.set(false);
    this.recarga$.next();
  }

  protected alRegistrarEntrada(): void {
    this.aviso.set('Entrada registrada.');
    this.entradaDe.set(null);
    this.recarga$.next();
  }

  protected pedirBaja(alimento: Alimento): void {
    this.errorBaja.set(null);
    this.bajaDe.set(alimento);
  }

  protected darDeBaja(alimento: Alimento, motivo: string): void {
    this.dandoBaja.set(true);
    this.errorBaja.set(null);
    this.api.cambiarEstado(alimento.id, 'INACTIVO', motivo).subscribe({
      next: () => {
        this.dandoBaja.set(false);
        this.bajaDe.set(null);
        this.aviso.set('Alimento dado de baja.');
        this.recarga$.next();
      },
      error: (error) => {
        this.dandoBaja.set(false);
        this.errorBaja.set(mensajeDeError(error));
      },
    });
  }

  protected reactivar(alimento: Alimento): void {
    this.aviso.set(null);
    this.api.cambiarEstado(alimento.id, 'ACTIVO').subscribe({
      next: () => {
        this.aviso.set('Alimento reactivado.');
        this.recarga$.next();
      },
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }
}
