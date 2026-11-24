import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { Modal } from '../compartido/modal';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { LotesApi } from '../core/lotes-api';
import { avisoStock, formatearCantidad, textoRetiro, Tratamiento, VIAS_ADMINISTRACION } from '../core/medicamentos-modelos';
import { etiquetaDe, formatearFecha } from '../core/modelos';
import { TratamientosApi } from '../core/tratamientos-api';
import { VacunosApi } from '../core/vacunos-api';
import { TratamientoForm } from './tratamiento-form';

@Component({
  selector: 'app-tratamientos',
  imports: [RouterLink, TratamientoForm, Modal],
  template: `
    <div class="cabecera-pagina">
      <h1>Tratamientos</h1>
      @if (puedeRegistrar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Registrar tratamiento</button>
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
      <div class="filtros-trat">
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
        <div class="fechas">
          <div class="campo">
            <label for="f-desde">Desde</label>
            <input id="f-desde" class="input" type="date" [max]="hasta() || undefined" [value]="desde()" (change)="cambiar(desde, $any($event.target).value)" />
          </div>
          <div class="campo">
            <label for="f-hasta">Hasta</label>
            <input id="f-hasta" class="input" type="date" [min]="desde() || undefined" [value]="hasta()" (change)="cambiar(hasta, $any($event.target).value)" />
          </div>
        </div>
      </div>
      <label class="opcion solo-retiro">
        <input type="checkbox" [checked]="soloRetiro()" (change)="cambiar(soloRetiro, $any($event.target).checked)" />
        Solo en periodo de retiro
      </label>

      @if (aviso(); as mensaje) {
        <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
      }
      @if (avisoStockBajo(); as mensaje) {
        <p class="alerta alerta-aviso" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      @if (cargando()) {
        <p class="suave" role="status">Cargando…</p>
      } @else if (tratamientos().length === 0 && !error()) {
        <div class="vacio">{{ soloRetiro() ? 'No hay animales ni lotes en periodo de retiro.' : 'No hay tratamientos con estos filtros.' }}</div>
      } @else if (tratamientos().length > 0) {
        <table class="tabla">
          <thead>
            <tr>
              <th>Animal o lote</th>
              <th>Medicamento</th>
              <th>Fecha</th>
              <th>Retiro</th>
              @if (puedeRegistrar()) {
                <th><span class="sr-only">Acciones</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (t of tratamientos(); track t.id) {
              <tr>
                <td>
                  <strong>{{ (t.vacuno ?? t.lote)?.nombre }}</strong><br />
                  <span class="suave">{{ t.vacuno ? 'Vacuno' : 'Lote' }}</span>
                  @if (t.casoSalud) {
                    <br /><span class="suave">Caso: {{ t.casoSalud.diagnostico }}</span>
                  }
                </td>
                <td data-etiqueta="Medicamento" class="largo">
                  {{ t.medicamento.nombre }}<br />
                  <span class="suave">{{ cantidad(t) }} · {{ etiqueta(vias, t.via) }}</span>
                  @if (t.observaciones) {
                    <br /><span class="suave">{{ t.observaciones }}</span>
                  }
                </td>
                <td data-etiqueta="Fecha">{{ fecha(t.fecha) }}</td>
                <td data-etiqueta="Retiro">
                  @if (retiro(t); as texto) {
                    <span class="insignia insignia-alerta">En retiro</span><br />
                    <span class="suave">{{ texto }}</span>
                  } @else {
                    <span class="suave">{{ t.finRetiroCarne || t.finRetiroLeche ? 'Cumplido' : 'Sin retiro' }}</span>
                  }
                </td>
                @if (puedeRegistrar()) {
                  <td>
                    <div class="acciones">
                      <button type="button" class="btn" (click)="abrir(t)">Editar</button>
                      <button type="button" class="btn btn-peligro" (click)="pedirBorrar(t)">Eliminar</button>
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
        <app-tratamiento-form [fincaId]="id" [tratamiento]="editando()" (guardado)="alGuardar($event)" (cerrado)="formAbierto.set(false)" />
      }
    }

    @if (borrarDe(); as t) {
      <app-modal titulo="Eliminar tratamiento" (cerrado)="borrarDe.set(null)">
        <div class="modal-cuerpo">
          <p>
            ¿Eliminar el tratamiento con {{ t.medicamento.nombre }} de {{ (t.vacuno ?? t.lote)?.nombre }}?
            La dosis ({{ cantidad(t) }}) se devuelve al stock del medicamento.
          </p>
          @if (errorBorrar(); as mensaje) {
            <p class="alerta" role="alert">{{ mensaje }}</p>
          }
          <div class="modal-pie">
            <button type="button" class="btn" (click)="borrarDe.set(null)">Cancelar</button>
            <button type="button" class="btn btn-peligro" [disabled]="borrando()" (click)="borrar(t)">
              {{ borrando() ? 'Eliminando…' : 'Eliminar' }}
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
  styles: `
    .filtros-trat { display: grid; gap: 10px; grid-template-columns: 1fr; margin-bottom: 12px; }
    .fechas { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (min-width: 720px) { .filtros-trat { grid-template-columns: 1fr 1fr; align-items: end; } }
    .solo-retiro { margin: 0 0 12px; }
    .largo { overflow-wrap: anywhere; }
  `,
})
export class Tratamientos {
  private readonly api = inject(TratamientosApi);
  private readonly auth = inject(Auth);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);
  private readonly recarga$ = new Subject<void>();

  protected readonly vias = VIAS_ADMINISTRACION;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fecha = formatearFecha;
  protected readonly retiro = (t: Tratamiento) => textoRetiro(t);
  protected readonly cantidad = (t: Tratamiento) => formatearCantidad(t.dosis, t.medicamento.unidad);

  protected readonly fincaId = inject(FincaActiva).id;
  protected readonly puedeRegistrar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('tratamientos:registrar');
  });
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  /** `vacuno:<id>` o `lote:<id>`. */
  protected readonly sujeto = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly soloRetiro = signal(false);
  protected readonly vacunos = signal<{ id: string; nombre: string }[]>([]);
  protected readonly lotes = signal<{ id: string; nombre: string }[]>([]);

  protected readonly tratamientos = signal<Tratamiento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly avisoStockBajo = signal<string | null>(null);

  protected readonly formAbierto = signal(false);
  protected readonly editando = signal<Tratamiento | null>(null);
  protected readonly borrarDe = signal<Tratamiento | null>(null);
  protected readonly borrando = signal(false);
  protected readonly errorBorrar = signal<string | null>(null);

  constructor() {
    this.recarga$
      .pipe(
        tap(() => this.error.set(null)),
        switchMap(() => {
          const [clase, id] = this.sujeto().split(':');
          return this.api
            .listar({
              fincaId: this.fincaId()!,
              ...(id ? { [clase === 'lote' ? 'loteId' : 'vacunoId']: id } : {}),
              desde: this.desde(),
              hasta: this.hasta(),
              enRetiro: this.soloRetiro(),
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
        this.tratamientos.set(lista);
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
          this.tratamientos.set([]);
          this.cargando.set(false);
        }
      });
    });
  }

  protected cambiar<T>(filtro: { set(valor: T): void }, valor: T): void {
    filtro.set(valor);
    this.recarga$.next();
  }

  protected abrir(tratamiento: Tratamiento | null): void {
    this.aviso.set(null);
    this.avisoStockBajo.set(null);
    this.editando.set(tratamiento);
    this.formAbierto.set(true);
  }

  protected alGuardar(t: Tratamiento): void {
    this.aviso.set(this.editando() ? 'Tratamiento actualizado.' : 'Tratamiento registrado.');
    this.avisoStockBajo.set(avisoStock(t));
    this.formAbierto.set(false);
    this.recarga$.next();
  }

  protected pedirBorrar(t: Tratamiento): void {
    this.errorBorrar.set(null);
    this.borrarDe.set(t);
  }

  protected borrar(t: Tratamiento): void {
    this.borrando.set(true);
    this.errorBorrar.set(null);
    this.api.eliminar(t.id).subscribe({
      next: () => {
        this.borrando.set(false);
        this.borrarDe.set(null);
        this.avisoStockBajo.set(null);
        this.aviso.set('Tratamiento eliminado. La dosis volvió al stock.');
        this.recarga$.next();
      },
      error: (e) => {
        this.borrando.set(false);
        this.errorBorrar.set(mensajeDeError(e));
      },
    });
  }
}
