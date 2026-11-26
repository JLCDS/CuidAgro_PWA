import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { BajaDialogo } from '../compartido/baja-dialogo';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import {
  etiquetaDe,
  FiltroEstado,
  formatearEdadMeses,
  formatearFecha,
  PROPOSITOS_VACUNO,
  PropositoVacuno,
  SEXOS,
  Vacuno,
} from '../core/modelos';
import { VacunosApi } from '../core/vacunos-api';
import { HistorialDialogo } from './historial-dialogo';
import { VacunoForm } from './vacuno-form';

@Component({
  selector: 'app-vacunos',
  imports: [RouterLink, VacunoForm, BajaDialogo, HistorialDialogo],
  template: `
    <div class="cabecera-pagina">
      <h1>Vacunos</h1>
      @if (puedeGestionar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo vacuno</button>
      }
    </div>

    @if (!fincaId()) {
      <div class="vacio">
        <img class="vacio-escena" src="img/finca.webp" alt="" width="720" height="540" loading="lazy" />
        Aún no hay una finca para trabajar.
        @if (puedeCrearFincas()) {
          <a routerLink="/fincas">Crea una finca</a> primero.
        }
      </div>
    } @else {
      <div class="filtros">
        <input class="input" type="search" placeholder="Buscar por nombre o raza" aria-label="Buscar por nombre o raza"
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
      } @else if (vacunos().length === 0 && !error()) {
        <div class="vacio"><img class="vacio-objeto" src="img/vacio-vacunos.webp" alt="" width="320" height="320" loading="lazy" />No hay vacunos que coincidan con la búsqueda.</div>
      } @else if (vacunos().length > 0) {
        <table class="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Sexo</th>
              <th>Edad</th>
              <th>Peso</th>
              <th>Propósito</th>
              <th>Estado</th>
              @if (hayAcciones()) {
                <th><span class="sr-only">Acciones</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (v of vacunos(); track v.id) {
              <tr>
                <td>
                  <strong>{{ v.nombre }}</strong><br />
                  <span class="suave">{{ v.raza }} · llegó el {{ fecha(v.fechaLlegada) }}</span>
                </td>
                <td data-etiqueta="Sexo">{{ etiqueta(sexos, v.sexo) }}</td>
                <td data-etiqueta="Edad">{{ edad(v.edadMeses) }}</td>
                <td data-etiqueta="Peso">{{ v.peso }} kg</td>
                <td data-etiqueta="Propósito">{{ etiqueta(propositos, v.proposito) }}</td>
                <td data-etiqueta="Estado">
                  <span class="insignia" [class.insignia-activo]="v.estado === 'ACTIVO'" [class.insignia-inactivo]="v.estado === 'INACTIVO'">
                    {{ v.estado === 'ACTIVO' ? 'Activo' : 'De baja' }}
                  </span>
                  @if (v.motivoBaja) {
                    <br /><span class="suave">Motivo: {{ v.motivoBaja }}</span>
                  }
                </td>
                @if (hayAcciones()) {
                  <td>
                    <div class="acciones">
                      @if (puedeHistorial()) {
                        <button type="button" class="btn" (click)="historialDe.set(v)">Historial</button>
                      }
                      @if (puedeGestionar()) {
                      <button type="button" class="btn" (click)="abrir(v)">Editar</button>
                      @if (v.estado === 'ACTIVO') {
                        <button type="button" class="btn btn-peligro" (click)="pedirBaja(v)">Dar de baja</button>
                      } @else {
                        <button type="button" class="btn" (click)="reactivar(v)">Reactivar</button>
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
        <app-vacuno-form [vacuno]="editando()" [fincaId]="id" (guardado)="alGuardar()" (cerrado)="formularioAbierto.set(false)" />
      }
    }

    @if (historialDe(); as h) {
      @if (fincaId(); as id) {
        <app-historial-dialogo tipo="vacuno" [animalId]="h.id" [nombre]="h.nombre" [fincaId]="id" (cerrado)="historialDe.set(null)" />
      }
    }

    @if (bajaDe(); as v) {
      <app-baja-dialogo
        titulo="Dar de baja vacuno"
        [descripcion]="'¿Dar de baja a ' + v.nombre + '? El registro se conserva y se puede reactivar.'"
        [trabajando]="dandoBaja()" [error]="errorBaja()"
        (confirmado)="darDeBaja(v, $event)" (cerrado)="bajaDe.set(null)" />
    }
  `,
})
export class Vacunos {
  private readonly api = inject(VacunosApi);
  private readonly auth = inject(Auth);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly busqueda$ = new Subject<void>();
  private readonly recarga$ = new Subject<void>();

  protected readonly sexos = SEXOS;
  protected readonly propositos = PROPOSITOS_VACUNO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly edad = formatearEdadMeses;
  protected readonly fecha = formatearFecha;

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
  protected readonly proposito = signal<PropositoVacuno | ''>('');
  protected readonly estado = signal<FiltroEstado>('ACTIVO');

  protected readonly vacunos = signal<Vacuno[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<Vacuno | null>(null);
  protected readonly bajaDe = signal<Vacuno | null>(null);
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
      .subscribe((vacunos) => {
        this.vacunos.set(vacunos);
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
        this.vacunos.set([]);
        this.cargando.set(false);
      }
    });
  }

  protected cambiarBusqueda(valor: string): void {
    this.q.set(valor);
    this.busqueda$.next();
  }

  protected cambiarProposito(valor: PropositoVacuno | ''): void {
    this.proposito.set(valor);
    this.recarga$.next();
  }

  protected cambiarEstadoFiltro(valor: FiltroEstado): void {
    this.estado.set(valor);
    this.recarga$.next();
  }

  protected abrir(vacuno: Vacuno | null): void {
    this.aviso.set(null);
    this.editando.set(vacuno);
    this.formularioAbierto.set(true);
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Vacuno actualizado.' : 'Vacuno registrado.');
    this.formularioAbierto.set(false);
    this.recarga$.next();
  }

  protected pedirBaja(vacuno: Vacuno): void {
    this.errorBaja.set(null);
    this.bajaDe.set(vacuno);
  }

  protected darDeBaja(vacuno: Vacuno, motivo: string): void {
    this.dandoBaja.set(true);
    this.errorBaja.set(null);
    this.api.cambiarEstado(vacuno.id, 'INACTIVO', motivo).subscribe({
      next: () => {
        this.dandoBaja.set(false);
        this.bajaDe.set(null);
        this.aviso.set('Vacuno dado de baja.');
        this.recarga$.next();
      },
      error: (error) => {
        this.dandoBaja.set(false);
        this.errorBaja.set(mensajeDeError(error));
      },
    });
  }

  protected reactivar(vacuno: Vacuno): void {
    this.aviso.set(null);
    this.api.cambiarEstado(vacuno.id, 'ACTIVO').subscribe({
      next: () => {
        this.aviso.set('Vacuno reactivado.');
        this.recarga$.next();
      },
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }
}
