import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { etiquetaDe, formatearFecha } from '../core/modelos';
import { NovedadesApi } from '../core/novedades-api';
import { SaludApi } from '../core/salud-api';
import {
  CasoSalud,
  ESTADOS_CASO,
  ESTADOS_NOVEDAD,
  formatearFechaHora,
  Novedad,
  TIPOS_NOVEDAD,
} from '../core/salud-modelos';

type Entrada = { clase: 'caso'; instante: number; caso: CasoSalud } | { clase: 'novedad'; instante: number; novedad: Novedad };

/** Une casos de salud y novedades, de la más reciente a la más antigua. */
export function ordenarHistorial(casos: CasoSalud[], novedades: Novedad[]): Entrada[] {
  const entradas: Entrada[] = [
    ...casos.map((caso) => ({ clase: 'caso' as const, instante: new Date(`${caso.fechaInicio}T00:00:00-05:00`).getTime(), caso })),
    ...novedades.map((novedad) => ({ clase: 'novedad' as const, instante: new Date(novedad.fechaHora).getTime(), novedad })),
  ];
  return entradas.sort((a, b) => b.instante - a.instante);
}

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
          <div class="vacio">Aún no hay casos de salud ni novedades.</div>
        } @else {
          <ul class="lista">
            @for (e of entradas(); track e.clase + (e.clase === 'caso' ? e.caso.id : e.novedad.id)) {
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

  readonly tipo = input.required<'vacuno' | 'lote'>();
  readonly animalId = input.required<string>();
  readonly nombre = input.required<string>();
  readonly fincaId = input.required<string>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_NOVEDAD;
  protected readonly estadosNovedad = ESTADOS_NOVEDAD;
  protected readonly estadosCaso = ESTADOS_CASO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fecha = formatearFecha;
  protected readonly fechaHora = formatearFechaHora;
  protected readonly entradas = signal<Entrada[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const filtro = { fincaId: this.fincaId(), [this.tipo() === 'vacuno' ? 'vacunoId' : 'loteId']: this.animalId() };
    forkJoin({ casos: this.salud.listar(filtro), novedades: this.novedadesApi.listar(filtro) }).subscribe({
      next: ({ casos, novedades }) => {
        this.entradas.set(ordenarHistorial(casos, novedades));
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }
}
