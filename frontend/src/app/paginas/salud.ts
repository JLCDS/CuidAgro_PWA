import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { BajaDialogo } from '../compartido/baja-dialogo';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { LotesApi } from '../core/lotes-api';
import { etiquetaDe, formatearFecha } from '../core/modelos';
import { SaludApi } from '../core/salud-api';
import { CasoSalud, EstadoCasoSalud, ESTADOS_CASO } from '../core/salud-modelos';
import { VacunosApi } from '../core/vacunos-api';
import { CasoForm } from './caso-form';

@Component({
  selector: 'app-salud',
  imports: [RouterLink, CasoForm, BajaDialogo],
  template: `
    <div class="cabecera-pagina">
      <h1>{{ filtroEstado() === 'ACTIVOS' ? 'Enfermos actuales' : 'Casos de salud' }}</h1>
      @if (puedeGestionar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo caso</button>
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
      <div class="filtros-salud">
        <select class="input" aria-label="Filtrar por estado" [value]="filtroEstado()" (change)="cambiar(filtroEstado, $any($event.target).value)">
          <option value="ACTIVOS">Enfermos actuales (activos)</option>
          <option value="TODOS">Todos los casos</option>
          @for (e of estados; track e.valor) {
            <option [value]="e.valor">{{ e.etiqueta }}</option>
          }
        </select>
        <select class="input" aria-label="Filtrar por animal o lote" [value]="sujeto()" (change)="cambiar(sujeto, $any($event.target).value)">
          <option value="">Todos los animales y lotes</option>
          <optgroup label="Vacunos">
            @for (v of vacunos(); track v.id) {
              <option [value]="'vacuno:' + v.id">{{ v.nombre }}</option>
            }
          </optgroup>
          <optgroup label="Lotes de ovíparos">
            @for (l of lotes(); track l.id) {
              <option [value]="'lote:' + l.id">{{ l.nombre }}</option>
            }
          </optgroup>
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
      } @else if (casos().length === 0 && !error()) {
        <div class="vacio">{{ filtroEstado() === 'ACTIVOS' ? 'No hay animales ni lotes enfermos en este momento.' : 'No hay casos con estos filtros.' }}</div>
      } @else if (casos().length > 0) {
        <table class="tabla">
          <thead>
            <tr>
              <th>Animal o lote</th>
              <th>Diagnóstico</th>
              <th>Estado</th>
              <th>Fechas</th>
              @if (puedeGestionar()) {
                <th><span class="sr-only">Acciones</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (c of casos(); track c.id) {
              <tr>
                <td>
                  <strong>{{ (c.vacuno ?? c.lote)?.nombre }}</strong><br />
                  <span class="suave">{{ c.vacuno ? 'Vacuno' : 'Lote' }}@if (c.animalesAfectados) { · {{ c.animalesAfectados }} afectados }</span>
                </td>
                <td data-etiqueta="Diagnóstico" class="largo">
                  {{ c.diagnostico }}
                  @if (c.sintomas) {
                    <br /><span class="suave">{{ c.sintomas }}</span>
                  }
                </td>
                <td data-etiqueta="Estado">
                  <span class="insignia" [class.insignia-inactivo]="c.activo" [class.insignia-activo]="c.estado === 'RECUPERADO'">{{ etiqueta(estados, c.estado) }}</span>
                </td>
                <td data-etiqueta="Fechas">
                  {{ fecha(c.fechaInicio) }}@if (c.fechaFin) { a {{ fecha(c.fechaFin) }} }
                </td>
                @if (puedeGestionar()) {
                  <td>
                    <div class="acciones">
                      <button type="button" class="btn" (click)="abrir(c)">Editar</button>
                    </div>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      }
    }

    @if (formAbierto()) {
      @if (fincaId(); as id) {
        <app-caso-form [fincaId]="id" [caso]="editando()" (guardado)="alGuardar($event)" (cerrado)="formAbierto.set(false)" />
      }
    }

    @if (bajaDe(); as v) {
      <app-baja-dialogo
        titulo="Dar de baja al vacuno"
        [descripcion]="'El caso de ' + v.nombre + ' quedó como fallecido. ¿Quieres dar de baja al vacuno? El registro se conserva y se puede reactivar.'"
        [trabajando]="dandoBaja()" [error]="errorBaja()"
        (confirmado)="darDeBaja(v.id, $event)" (cerrado)="bajaDe.set(null)" />
    }
  `,
  styles: `
    .filtros-salud { display: grid; gap: 10px; grid-template-columns: 1fr; margin-bottom: 16px; }
    @media (min-width: 720px) { .filtros-salud { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .largo { overflow-wrap: anywhere; }
  `,
})
export class Salud {
  private readonly api = inject(SaludApi);
  private readonly auth = inject(Auth);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);
  private readonly recarga$ = new Subject<void>();

  protected readonly estados = ESTADOS_CASO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fecha = formatearFecha;

  protected readonly fincaId = inject(FincaActiva).id;
  protected readonly puedeGestionar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('salud:gestionar');
  });
  protected readonly puedeDarBaja = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('animales:gestionar');
  });
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  protected readonly filtroEstado = signal<EstadoCasoSalud | 'ACTIVOS' | 'TODOS'>('ACTIVOS');
  /** `vacuno:<id>` o `lote:<id>`. */
  protected readonly sujeto = signal('');
  protected readonly vacunos = signal<{ id: string; nombre: string }[]>([]);
  protected readonly lotes = signal<{ id: string; nombre: string }[]>([]);

  protected readonly casos = signal<CasoSalud[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formAbierto = signal(false);
  protected readonly editando = signal<CasoSalud | null>(null);
  protected readonly bajaDe = signal<{ id: string; nombre: string } | null>(null);
  protected readonly dandoBaja = signal(false);
  protected readonly errorBaja = signal<string | null>(null);

  constructor() {
    this.recarga$
      .pipe(
        tap(() => this.error.set(null)),
        switchMap(() => {
          const [clase, id] = this.sujeto().split(':');
          const e = this.filtroEstado();
          return this.api
            .listar({
              fincaId: this.fincaId()!,
              ...(e === 'ACTIVOS' ? { activos: true } : e === 'TODOS' ? {} : { estado: e }),
              ...(id ? { [clase === 'lote' ? 'loteId' : 'vacunoId']: id } : {}),
            })
            .pipe(
              catchError((err) => {
                this.error.set(mensajeDeError(err));
                this.cargando.set(false);
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((lista) => {
        this.casos.set(lista);
        this.cargando.set(false);
      });

    effect(() => {
      const id = this.fincaId();
      untracked(() => {
        if (id) {
          this.sujeto.set('');
          this.cargando.set(true);
          this.recarga$.next();
          this.vacunosApi.listar({ fincaId: id, estado: 'TODOS', q: '', proposito: '' }).subscribe({
            next: (v) => this.vacunos.set(v.map(({ id, nombre }) => ({ id, nombre }))),
            error: () => undefined,
          });
          this.lotesApi.listar({ fincaId: id, estado: 'TODOS', q: '', proposito: '' }).subscribe({
            next: (l) => this.lotes.set(l.map(({ id, nombre }) => ({ id, nombre }))),
            error: () => undefined,
          });
        } else {
          this.casos.set([]);
          this.cargando.set(false);
        }
      });
    });
  }

  protected cambiar<T>(filtro: { set(valor: T): void }, valor: T): void {
    filtro.set(valor);
    this.recarga$.next();
  }

  protected abrir(caso: CasoSalud | null): void {
    this.aviso.set(null);
    this.editando.set(caso);
    this.formAbierto.set(true);
  }

  protected alGuardar(caso: CasoSalud): void {
    const anterior = this.editando();
    this.formAbierto.set(false);
    this.aviso.set(anterior ? 'Caso actualizado.' : 'Caso registrado.');
    this.recarga$.next();
    // Marcar fallecido no da de baja al vacuno: se ofrece, solo si el usuario puede hacerlo.
    if (caso.estado === 'FALLECIDO' && anterior?.estado !== 'FALLECIDO' && caso.vacuno && this.puedeDarBaja()) {
      this.errorBaja.set(null);
      this.bajaDe.set({ id: caso.vacuno.id, nombre: caso.vacuno.nombre });
    }
  }

  protected darDeBaja(vacunoId: string, motivo: string): void {
    this.dandoBaja.set(true);
    this.errorBaja.set(null);
    this.vacunosApi.cambiarEstado(vacunoId, 'INACTIVO', motivo).subscribe({
      next: () => {
        this.dandoBaja.set(false);
        this.bajaDe.set(null);
        this.aviso.set('Vacuno dado de baja.');
      },
      error: (e) => {
        this.dandoBaja.set(false);
        this.errorBaja.set(mensajeDeError(e));
      },
    });
  }
}
