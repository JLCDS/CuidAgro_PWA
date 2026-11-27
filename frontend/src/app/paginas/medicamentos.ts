import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { BajaDialogo } from '../compartido/baja-dialogo';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { MedicamentosApi } from '../core/medicamentos-api';
import {
  formatearCantidad,
  Medicamento,
  TipoMedicamento,
  TIPOS_MEDICAMENTO,
} from '../core/medicamentos-modelos';
import { etiquetaDe, FiltroEstado, formatearFecha } from '../core/modelos';
import { EntradaMedicamentoForm } from './entrada-medicamento-form';
import { MedicamentoForm } from './medicamento-form';
import { MovimientosMedicamentoDialogo } from './movimientos-medicamento-dialogo';

@Component({
  selector: 'app-medicamentos',
  imports: [RouterLink, MedicamentoForm, EntradaMedicamentoForm, MovimientosMedicamentoDialogo, BajaDialogo],
  template: `
    <div class="cabecera-pagina">
      <h1>Inventario de medicamentos</h1>
      @if (puedeGestionar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo medicamento</button>
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
      <label class="opcion solo-alerta">
        <input type="checkbox" [checked]="alerta()" (change)="cambiarAlerta($any($event.target).checked)" />
        Con alertas (stock bajo, vencido o por vencer)
      </label>

      @if (aviso(); as mensaje) {
        <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      @if (cargando()) {
        <p class="suave" role="status">Cargando…</p>
      } @else if (medicamentos().length === 0 && !error()) {
        <div class="vacio"><img class="vacio-objeto" src="img/vacio-salud.webp" alt="" width="320" height="320" loading="lazy" />No hay medicamentos que coincidan con la búsqueda.</div>
      } @else if (medicamentos().length > 0) {
        <table class="tabla">
          <thead>
            <tr>
              <th>Medicamento</th>
              <th>Stock</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (m of medicamentos(); track m.id) {
              <tr>
                <td>
                  <strong>{{ m.nombre }}</strong><br />
                  <span class="suave">{{ etiqueta(tipos, m.tipo) }}@if (m.laboratorio) { · {{ m.laboratorio }} }</span>
                </td>
                <td data-etiqueta="Stock">
                  {{ cantidad(m.stock, m) }}
                  @if (m.stock < 0) {
                    <span class="insignia insignia-inactivo">Negativo</span>
                  } @else if (m.bajoStock) {
                    <span class="insignia insignia-alerta">Stock bajo</span>
                  }
                  <br /><span class="suave">Mínimo: {{ cantidad(m.stockMinimo, m) }}</span>
                </td>
                <td data-etiqueta="Vencimiento">
                  @if (m.fechaVencimiento) {
                    {{ fecha(m.fechaVencimiento) }}
                    @if (m.vencido) {
                      <span class="insignia insignia-inactivo">Vencido</span>
                    } @else if (m.porVencer) {
                      <span class="insignia insignia-alerta">Por vencer</span>
                    }
                  } @else {
                    <span class="suave">Sin fecha</span>
                  }
                </td>
                <td data-etiqueta="Estado">
                  <span class="insignia" [class.insignia-activo]="m.estado === 'ACTIVO'" [class.insignia-inactivo]="m.estado === 'INACTIVO'">
                    {{ m.estado === 'ACTIVO' ? 'Activo' : 'De baja' }}
                  </span>
                  @if (m.motivoBaja) {
                    <br /><span class="suave">Motivo: {{ m.motivoBaja }}</span>
                  }
                </td>
                <td>
                  <div class="acciones">
                    @if (puedeGestionar()) {
                      @if (m.estado === 'ACTIVO') {
                        <button type="button" class="btn btn-primario" (click)="entradaDe.set(m)">Registrar entrada</button>
                      }
                      <button type="button" class="btn" (click)="abrir(m)">Editar</button>
                    }
                    <button type="button" class="btn" (click)="movimientosDe.set(m)">Movimientos</button>
                    @if (puedeGestionar()) {
                      @if (m.estado === 'ACTIVO') {
                        <button type="button" class="btn btn-peligro" (click)="pedirBaja(m)">Dar de baja</button>
                      } @else {
                        <button type="button" class="btn" (click)="reactivar(m)">Reactivar</button>
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
        <app-medicamento-form [medicamento]="editando()" [fincaId]="id" (guardado)="alGuardar()" (cerrado)="formularioAbierto.set(false)" />
      }
    }

    @if (entradaDe(); as m) {
      <app-entrada-medicamento-form [medicamento]="m" (guardado)="alRegistrarEntrada()" (cerrado)="entradaDe.set(null)" />
    }

    @if (movimientosDe(); as m) {
      <app-movimientos-medicamento-dialogo [medicamento]="m" (cerrado)="movimientosDe.set(null)" />
    }

    @if (bajaDe(); as m) {
      <app-baja-dialogo
        titulo="Dar de baja medicamento"
        [descripcion]="'¿Dar de baja ' + m.nombre + '? El registro y sus movimientos se conservan y se puede reactivar.'"
        [trabajando]="dandoBaja()" [error]="errorBaja()"
        (confirmado)="darDeBaja(m, $event)" (cerrado)="bajaDe.set(null)" />
    }
  `,
  styles: `
    .solo-alerta { margin: -6px 0 12px; }
    .insignia { margin-left: 6px; }
  `,
})
export class Medicamentos {
  private readonly api = inject(MedicamentosApi);
  private readonly auth = inject(Auth);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly busqueda$ = new Subject<void>();
  private readonly recarga$ = new Subject<void>();

  protected readonly tipos = TIPOS_MEDICAMENTO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fecha = formatearFecha;

  protected readonly fincaId = this.fincaActiva.id;
  protected readonly fincasListas = this.fincaActiva.cargada;
  protected readonly puedeGestionar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('medicamentos:gestionar');
  });
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  protected readonly q = signal('');
  protected readonly tipo = signal<TipoMedicamento | ''>('');
  protected readonly estado = signal<FiltroEstado>('ACTIVO');
  protected readonly alerta = signal(false);

  protected readonly medicamentos = signal<Medicamento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<Medicamento | null>(null);
  protected readonly entradaDe = signal<Medicamento | null>(null);
  protected readonly movimientosDe = signal<Medicamento | null>(null);
  protected readonly bajaDe = signal<Medicamento | null>(null);
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
              alerta: this.alerta(),
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
      .subscribe((medicamentos) => {
        this.medicamentos.set(medicamentos);
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
        this.medicamentos.set([]);
        this.cargando.set(false);
      }
    });
  }

  protected cantidad(valor: number, m: Medicamento): string {
    return formatearCantidad(valor, m.unidad);
  }

  protected cambiarBusqueda(valor: string): void {
    this.q.set(valor);
    this.busqueda$.next();
  }

  protected cambiarTipo(valor: TipoMedicamento | ''): void {
    this.tipo.set(valor);
    this.recarga$.next();
  }

  protected cambiarEstadoFiltro(valor: FiltroEstado): void {
    this.estado.set(valor);
    this.recarga$.next();
  }

  protected cambiarAlerta(valor: boolean): void {
    this.alerta.set(valor);
    this.recarga$.next();
  }

  protected abrir(medicamento: Medicamento | null): void {
    this.aviso.set(null);
    this.editando.set(medicamento);
    this.formularioAbierto.set(true);
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Medicamento actualizado.' : 'Medicamento registrado.');
    this.formularioAbierto.set(false);
    this.recarga$.next();
  }

  protected alRegistrarEntrada(): void {
    this.aviso.set('Entrada registrada.');
    this.entradaDe.set(null);
    this.recarga$.next();
  }

  protected pedirBaja(medicamento: Medicamento): void {
    this.errorBaja.set(null);
    this.bajaDe.set(medicamento);
  }

  protected darDeBaja(medicamento: Medicamento, motivo: string): void {
    this.dandoBaja.set(true);
    this.errorBaja.set(null);
    this.api.cambiarEstado(medicamento.id, 'INACTIVO', motivo).subscribe({
      next: () => {
        this.dandoBaja.set(false);
        this.bajaDe.set(null);
        this.aviso.set('Medicamento dado de baja.');
        this.recarga$.next();
      },
      error: (error) => {
        this.dandoBaja.set(false);
        this.errorBaja.set(mensajeDeError(error));
      },
    });
  }

  protected reactivar(medicamento: Medicamento): void {
    this.aviso.set(null);
    this.api.cambiarEstado(medicamento.id, 'ACTIVO').subscribe({
      next: () => {
        this.aviso.set('Medicamento reactivado.');
        this.recarga$.next();
      },
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }
}
