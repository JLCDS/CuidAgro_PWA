import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { formatearCantidad, textoRetiro, Tratamiento, VIAS_ADMINISTRACION } from '../core/medicamentos-modelos';
import { etiquetaDe, formatearFecha } from '../core/modelos';
import { NovedadesApi } from '../core/novedades-api';
import { SaludApi } from '../core/salud-api';
import { TratamientosApi } from '../core/tratamientos-api';
import {
  CasoSalud,
  ESTADOS_CASO,
  ESTADOS_NOVEDAD,
  formatearFechaHora,
  Novedad,
  TIPOS_NOVEDAD,
} from '../core/salud-modelos';

type Entrada =
  | { clase: 'caso'; instante: number; caso: CasoSalud }
  | { clase: 'novedad'; instante: number; novedad: Novedad }
  | { clase: 'tratamiento'; instante: number; tratamiento: Tratamiento };

/** Une casos de salud, novedades y tratamientos, de lo más reciente a lo más antiguo. */
export function ordenarHistorial(casos: CasoSalud[], novedades: Novedad[], tratamientos: Tratamiento[] = []): Entrada[] {
  const entradas: Entrada[] = [
    ...casos.map((caso) => ({ clase: 'caso' as const, instante: new Date(`${caso.fechaInicio}T00:00:00-05:00`).getTime(), caso })),
    ...novedades.map((novedad) => ({ clase: 'novedad' as const, instante: new Date(novedad.fechaHora).getTime(), novedad })),
    ...tratamientos.map((tratamiento) => ({
      clase: 'tratamiento' as const,
      instante: new Date(`${tratamiento.fecha}T00:00:00-05:00`).getTime(),
      tratamiento,
    })),
  ];
  return entradas.sort((a, b) => b.instante - a.instante);
}

/** Identificador del registro que representa la entrada. */
export const idEntrada = (e: Entrada): string => (e.clase === 'caso' ? e.caso.id : e.clase === 'novedad' ? e.novedad.id : e.tratamiento.id);

@Component({
  selector: 'app-historial-dialogo',
  imports: [Modal],
  template: `
    <app-modal [titulo]="'Historial: ' + nombre()" (cerrado)="cerrado.emit()">
      <div class="modal-cuerpo">
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }
        @if (cargando()) {
          <p class="suave" role="status">Cargando…</p>
        } @else if (entradas().length === 0 && !error()) {
          <div class="vacio">Aún no hay casos de salud, novedades ni tratamientos.</div>
        } @else {
          <ul class="lista">
            @for (e of entradas(); track e.clase + idDe(e)) {
              <li>
                @if (e.clase === 'caso') {
                  <span class="insignia" [class.insignia-inactivo]="e.caso.activo" [class.insignia-activo]="!e.caso.activo">Caso de salud</span>
                  <strong>{{ e.caso.diagnostico }}</strong>
                  <span class="suave">
                    {{ etiqueta(estadosCaso, e.caso.estado) }} · desde {{ fecha(e.caso.fechaInicio) }}
                    @if (e.caso.fechaFin) {
                      hasta {{ fecha(e.caso.fechaFin) }}
                    }
                  </span>
                  @if (e.caso.sintomas) {
                    <span class="suave">{{ e.caso.sintomas }}</span>
                  }
                } @else if (e.clase === 'tratamiento') {
                  <span class="insignia insignia-activo">Tratamiento</span>
                  <strong>{{ e.tratamiento.medicamento.nombre }} · {{ cantidad(e.tratamiento) }}</strong>
                  <span class="suave">
                    {{ etiqueta(vias, e.tratamiento.via) }} · {{ fecha(e.tratamiento.fecha) }}
                    @if (e.tratamiento.casoSalud) {
                      · Caso: {{ e.tratamiento.casoSalud.diagnostico }}
                    }
                  </span>
                  @if (retiro(e.tratamiento); as texto) {
                    <span class="insignia insignia-alerta">En retiro</span>
                    <span class="suave">{{ texto }}</span>
                  }
                } @else {
                  <span class="insignia">Novedad</span>
                  <strong>{{ etiqueta(tipos, e.novedad.tipo) }} · {{ etiqueta(estadosNovedad, e.novedad.estado) }}</strong>
                  <span>{{ e.novedad.descripcion }}</span>
                  <span class="suave">{{ fechaHora(e.novedad.fechaHora) }} · {{ e.novedad.registradoPor.nombre }}</span>
                }
              </li>
            }
          </ul>
        }
        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cerrar</button>
        </div>
      </div>
    </app-modal>
  `,
  styles: `
    .lista { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; max-height: 60vh; overflow-y: auto; }
    li { display: grid; gap: 2px; justify-items: start; padding: 8px 0; border-bottom: 1px solid var(--borde); overflow-wrap: anywhere; }
  `,
})
export class HistorialDialogo implements OnInit {
  private readonly salud = inject(SaludApi);
  private readonly novedadesApi = inject(NovedadesApi);
  private readonly tratamientosApi = inject(TratamientosApi);

  readonly tipo = input.required<'vacuno' | 'lote'>();
  readonly animalId = input.required<string>();
  readonly nombre = input.required<string>();
  readonly fincaId = input.required<string>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_NOVEDAD;
  protected readonly estadosNovedad = ESTADOS_NOVEDAD;
  protected readonly estadosCaso = ESTADOS_CASO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly vias = VIAS_ADMINISTRACION;
  protected readonly retiro = (t: Tratamiento) => textoRetiro(t);
  protected readonly cantidad = (t: Tratamiento) => formatearCantidad(t.dosis, t.medicamento.unidad);
  protected readonly fecha = formatearFecha;
  protected readonly fechaHora = formatearFechaHora;
  protected readonly entradas = signal<Entrada[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly idDe = idEntrada;

  ngOnInit(): void {
    const filtro = { fincaId: this.fincaId(), [this.tipo() === 'vacuno' ? 'vacunoId' : 'loteId']: this.animalId() };
    forkJoin({
      casos: this.salud.listar(filtro),
      novedades: this.novedadesApi.listar(filtro),
      // Los tratamientos son un complemento: si fallan, el resto del historial igual se muestra.
      tratamientos: this.tratamientosApi.listar(filtro).pipe(catchError(() => of([] as Tratamiento[]))),
    }).subscribe({
      next: ({ casos, novedades, tratamientos }) => {
        this.entradas.set(ordenarHistorial(casos, novedades, tratamientos));
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }
}
