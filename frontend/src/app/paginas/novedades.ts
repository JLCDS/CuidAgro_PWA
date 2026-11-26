import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { FotoNovedad } from '../compartido/foto-novedad';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { LotesApi } from '../core/lotes-api';
import { etiquetaDe } from '../core/modelos';
import { NovedadesApi } from '../core/novedades-api';
import {
  EstadoNovedad,
  ESTADOS_NOVEDAD,
  formatearFechaHora,
  Novedad,
  PRIORIDADES_NOVEDAD,
  TIPOS_NOVEDAD,
  TipoNovedad,
} from '../core/salud-modelos';
import { VacunosApi } from '../core/vacunos-api';
import { CasoForm, SujetoCaso } from './caso-form';
import { NovedadDetalle } from './novedad-detalle';
import { NovedadForm } from './novedad-form';

@Component({
  selector: 'app-novedades',
  imports: [RouterLink, FotoNovedad, NovedadForm, NovedadDetalle, CasoForm],
  template: `
    <div class="cabecera-pagina">
      <h1>Novedades</h1>
      @if (fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrirForm(null)">Nueva novedad</button>
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
      <div class="filtros-nov">
        <select class="input" aria-label="Filtrar por estado" [value]="estado()" (change)="cambiar(estado, $any($event.target).value)">
          <option value="">Todos los estados</option>
          @for (e of estados; track e.valor) {
            <option [value]="e.valor">{{ e.etiqueta }}</option>
          }
        </select>
        <select class="input" aria-label="Filtrar por tipo" [value]="tipo()" (change)="cambiar(tipo, $any($event.target).value)">
          <option value="">Todos los tipos</option>
          @for (t of tipos; track t.valor) {
            <option [value]="t.valor">{{ t.etiqueta }}</option>
          }
        </select>
        <select class="input" aria-label="Filtrar por animal o lote" [value]="sujeto()" (change)="cambiar(sujeto, $any($event.target).value)">
          <option value="">Todos los animales y lotes</option>
          <optgroup label="Lotes de ovíparos">
            @for (l of lotes(); track l.id) {
              <option [value]="'lote:' + l.id">{{ l.nombre }}</option>
            }
          </optgroup>
          <optgroup label="Vacunos">
            @for (v of vacunos(); track v.id) {
              <option [value]="'vacuno:' + v.id">{{ v.nombre }}</option>
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
      } @else if (novedades().length === 0 && !error()) {
        <div class="vacio"><img class="vacio-objeto" src="img/vacio-novedades.webp" alt="" width="320" height="320" loading="lazy" />No hay novedades con estos filtros.</div>
      } @else {
        <ul class="tarjetas">
          @for (n of novedades(); track n.id) {
            <li>
              <button type="button" class="tarjeta-nov" (click)="detalleId.set(n.id)" [attr.aria-label]="'Abrir novedad: ' + etiqueta(tipos, n.tipo) + ', ' + (n.vacuno ?? n.lote)?.nombre">
                <span class="mini">
                  @if (n.tieneFoto) {
                    <app-foto-novedad [novedadId]="n.id" [version]="n.updatedAt" alt="Miniatura de la novedad" />
                  } @else {
                    <span class="sin-foto" aria-hidden="true">Sin foto</span>
                  }
                </span>
                <span class="info">
                  <span class="linea">
                    <strong>{{ etiqueta(tipos, n.tipo) }}</strong>
                    <span class="insignia" [class.insignia-inactivo]="n.prioridad === 'ALTA'" [class.insignia-alerta]="n.prioridad === 'MEDIA'">{{ etiqueta(prioridades, n.prioridad) }}</span>
                  </span>
                  <span class="nombre">{{ n.vacuno ? 'Vacuno' : 'Lote' }}: {{ (n.vacuno ?? n.lote)?.nombre }}</span>
                  <span class="resumen">{{ n.descripcion }}</span>
                  <span class="suave pie">
                    {{ fechaHora(n.fechaHora) }} · {{ etiqueta(estados, n.estado) }} · {{ n.totalComentarios }}
                    {{ n.totalComentarios === 1 ? 'comentario' : 'comentarios' }}
                  </span>
                </span>
              </button>
            </li>
          }
        </ul>
      }
    }

    @if (formAbierto()) {
      @if (fincaId(); as id) {
        <app-novedad-form [fincaId]="id" [novedad]="editando()" (guardado)="alGuardar()" (encolado)="alEncolar()" (cerrado)="formAbierto.set(false)" />
      }
    }

    @if (detalleId(); as id) {
      <app-novedad-detalle [novedadId]="id" (cambiada)="recarga$.next()" (editar)="abrirForm($event)" (crearCaso)="abrirCaso($event)" (cerrado)="detalleId.set(null)" />
    }

    @if (casoDe(); as s) {
      @if (fincaId(); as id) {
        <app-caso-form [fincaId]="id" [sujeto]="s" (guardado)="alGuardarCaso()" (cerrado)="casoDe.set(null)" />
      }
    }
  `,
  styles: `
    .filtros-nov { display: grid; gap: 10px; grid-template-columns: 1fr; margin-bottom: 16px; }
    @media (min-width: 720px) { .filtros-nov { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .tarjetas { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    @media (min-width: 720px) { .tarjetas { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .tarjeta-nov {
      display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; width: 100%; padding: 12px;
      border: 1px solid var(--borde); border-radius: var(--radio); background: var(--blanco); box-shadow: var(--sombra);
      color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .tarjeta-nov:hover { background: var(--crema); }
    .mini { width: 76px; height: 76px; }
    .sin-foto { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 8px; background: var(--tierra-200); color: var(--texto-suave); font-size: 0.75rem; }
    .info { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .linea { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .resumen { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .pie { font-size: 0.85rem; }
  `,
})
export class Novedades {
  private readonly api = inject(NovedadesApi);
  private readonly auth = inject(Auth);
  private readonly lotesApi = inject(LotesApi);
  private readonly vacunosApi = inject(VacunosApi);
  readonly recarga$ = new Subject<void>();

  protected readonly tipos = TIPOS_NOVEDAD;
  protected readonly prioridades = PRIORIDADES_NOVEDAD;
  protected readonly estados = ESTADOS_NOVEDAD;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fechaHora = formatearFechaHora;

  protected readonly fincaId = inject(FincaActiva).id;
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  protected readonly estado = signal<EstadoNovedad | ''>('');
  protected readonly tipo = signal<TipoNovedad | ''>('');
  /** `lote:<id>` o `vacuno:<id>`. */
  protected readonly sujeto = signal('');
  protected readonly lotes = signal<{ id: string; nombre: string }[]>([]);
  protected readonly vacunos = signal<{ id: string; nombre: string }[]>([]);

  protected readonly novedades = signal<Novedad[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formAbierto = signal(false);
  protected readonly editando = signal<Novedad | null>(null);
  protected readonly detalleId = signal<string | null>(null);
  protected readonly casoDe = signal<SujetoCaso | null>(null);

  constructor() {
    this.recarga$
      .pipe(
        tap(() => this.error.set(null)),
        switchMap(() => {
          const [claseSujeto, idSujeto] = this.sujeto().split(':');
          return this.api
            .listar({
              fincaId: this.fincaId()!,
              estado: this.estado(),
              tipo: this.tipo(),
              ...(idSujeto ? { [claseSujeto === 'lote' ? 'loteId' : 'vacunoId']: idSujeto } : {}),
            })
            .pipe(
              catchError((e) => {
                this.error.set(mensajeDeError(e));
                this.cargando.set(false);
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((lista) => {
        this.novedades.set(lista);
        this.cargando.set(false);
      });

    effect(() => {
      const id = this.fincaId();
      untracked(() => {
        if (id) {
          this.sujeto.set('');
          this.cargando.set(true);
          this.recarga$.next();
          this.lotesApi.listar({ fincaId: id, estado: 'TODOS', q: '', proposito: '' }).subscribe({
            next: (l) => this.lotes.set(l.map(({ id, nombre }) => ({ id, nombre }))),
            error: () => undefined,
          });
          this.vacunosApi.listar({ fincaId: id, estado: 'TODOS', q: '', proposito: '' }).subscribe({
            next: (v) => this.vacunos.set(v.map(({ id, nombre }) => ({ id, nombre }))),
            error: () => undefined,
          });
        } else {
          this.novedades.set([]);
          this.cargando.set(false);
        }
      });
    });
  }

  protected cambiar<T>(filtro: { set(valor: T): void }, valor: T): void {
    filtro.set(valor);
    this.recarga$.next();
  }

  protected abrirForm(n: Novedad | null): void {
    this.aviso.set(null);
    this.detalleId.set(null);
    this.editando.set(n);
    this.formAbierto.set(true);
  }

  protected alEncolar(): void {
    this.formAbierto.set(false);
    this.aviso.set('Guardado sin conexión. Se enviará cuando vuelva la señal.');
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Novedad actualizada.' : 'Novedad registrada.');
    this.formAbierto.set(false);
    this.recarga$.next();
  }

  protected abrirCaso(n: Novedad): void {
    const s = n.vacuno ?? n.lote;
    if (!s) return;
    this.aviso.set(null);
    this.detalleId.set(null);
    this.casoDe.set({ tipo: n.vacuno ? 'vacuno' : 'lote', id: s.id, nombre: s.nombre, novedadId: n.id });
  }

  protected alGuardarCaso(): void {
    this.casoDe.set(null);
    this.aviso.set('Caso de salud creado. Lo encuentras en Salud.');
  }
}

