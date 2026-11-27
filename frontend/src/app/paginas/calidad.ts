import { Component, computed, effect, inject, signal } from '@angular/core';
import { CalidadApi } from '../core/calidad-api';
import {
  Calificacion,
  DISPOSITIVOS,
  ETIQUETA_CALIFICACION,
  EXPLICACION_METRICA,
  FiltroDispositivo,
  formatearPorcentaje,
  formatearValor,
  MetricaGeneral,
  ordenarMetricas,
  PERIODOS,
  Periodo,
  ResumenMetricas,
  SIMBOLO_CALIFICACION,
  totalMuestras,
} from '../core/calidad';
import { mensajeDeError } from '../core/errores';
import { NombreMetrica } from '../core/metricas';

@Component({
  selector: 'app-calidad',
  template: `
    <div class="cabecera-pagina">
      <h1>Calidad de la app</h1>
    </div>
    <p class="suave intro">
      Así de rápida se siente CuidAgro en los dispositivos reales. Cada cifra es el valor que alcanza o mejora el 75 % de las visitas.
    </p>

    <div class="filtros-calidad">
      <label class="campo">
        <span>Periodo</span>
        <select class="input" [value]="dias()" (change)="cambiarDias($any($event.target).value)">
          @for (p of periodos; track p.valor) {
            <option [value]="p.valor">{{ p.etiqueta }}</option>
          }
        </select>
      </label>
      <label class="campo">
        <span>Dispositivo</span>
        <select class="input" [value]="dispositivo()" (change)="dispositivo.set($any($event.target).value)">
          @for (d of dispositivos; track d.valor) {
            <option [value]="d.valor">{{ d.etiqueta }}</option>
          }
        </select>
      </label>
    </div>

    @if (error(); as mensaje) {
      <p class="alerta" role="alert">{{ mensaje }}</p>
    }

    @if (cargando()) {
      <p class="suave" role="status">Cargando…</p>
    } @else if (resumen(); as r) {
      @if (muestras() === 0) {
        <div class="vacio">
          <img class="vacio-objeto" src="img/vacio-reportes.webp" alt="" width="320" height="320" loading="lazy" />
          Aún no hay mediciones en este periodo. Aparecen cuando la gente usa la app instalada o en el navegador.
        </div>
      } @else {
        <ul class="rejilla-metricas">
          @for (m of general(); track m.nombre) {
            <li class="tarjeta metrica">
              <div class="metrica-cabeza">
                <h2>{{ m.nombre }}</h2>
                <span class="cal" [class]="clase(m.calificacionP75)">
                  <span aria-hidden="true">{{ simbolo[m.calificacionP75] }}</span>
                  {{ etiquetaCal[m.calificacionP75] }}
                </span>
              </div>
              <p class="explica">{{ explicacion[m.nombre] }}</p>
              <p class="valor">{{ valor(m.nombre, m.p75) }}</p>
              <div class="barra" aria-hidden="true">
                <span class="tramo tramo-buena" [style.width.%]="m.buenas * 100"></span>
                <span class="tramo tramo-mejorable" [style.width.%]="m.mejorables * 100"></span>
                <span class="tramo tramo-mala" [style.width.%]="m.malas * 100"></span>
              </div>
              <p class="suave detalle">
                {{ pct(m.buenas) }} buenas · {{ pct(m.mejorables) }} mejorables · {{ pct(m.malas) }} malas
              </p>
              <p class="suave detalle">{{ m.muestras }} {{ m.muestras === 1 ? 'muestra' : 'muestras' }}</p>
            </li>
          }
        </ul>

        <h2 class="subtitulo">Por pantalla</h2>
        @if (r.porRuta.length === 0) {
          <p class="suave">No hay detalle por pantalla en este periodo.</p>
        } @else {
          <table class="tabla tabla-rutas">
            <caption class="solo-lectores">Valor p75 de cada métrica por pantalla</caption>
            <thead>
              <tr>
                <th scope="col">Pantalla</th>
                @for (n of nombres; track n) {
                  <th scope="col">{{ n }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (fila of r.porRuta; track fila.ruta) {
                <tr>
                  <th scope="row" class="ruta">{{ fila.ruta }}</th>
                  @for (n of nombres; track n) {
                    <td [attr.data-etiqueta]="n">
                      @if (celda(fila.metricas, n); as c) {
                        <span class="valor-celda">{{ valor(n, c.p75) }}</span>
                        <span class="cal cal-chica" [class]="clase(c.calificacionP75)">
                          <span aria-hidden="true">{{ simbolo[c.calificacionP75] }}</span>
                          {{ etiquetaCal[c.calificacionP75] }}
                        </span>
                      } @else {
                        <span class="suave">Sin datos</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      }
    }
  `,
  styles: `
    .intro { margin-bottom: 16px; }
    .filtros-calidad { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); margin-bottom: 16px; }
    .rejilla-metricas { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
    .metrica { display: flex; flex-direction: column; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
    .metrica-cabeza { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .metrica h2 { font-size: 1.3rem; }
    .explica { font-size: 0.95rem; }
    .valor { font-size: 2rem; font-weight: 700; line-height: 1.1; color: var(--verde-900); }
    .detalle { font-size: 0.9rem; }
    .cal {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
      font-size: 0.9rem; font-weight: 700; border: 1px solid currentColor;
    }
    .cal-chica { padding: 2px 8px; font-size: 0.8rem; }
    .cal-buena { background: #e1ecdc; color: #1c3f25; }
    .cal-mejorable { background: #f6e8b8; color: #5a4300; }
    .cal-mala { background: #f9e6df; color: #8a2a14; }
    .barra { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--tierra-200); }
    .tramo { display: block; height: 100%; }
    .tramo-buena { background: #2f6b3f; }
    .tramo-mejorable { background: #c99a1c; }
    .tramo-mala { background: #a63d24; }
    .subtitulo { margin: 8px 0 12px; font-size: 1.2rem; }
    .ruta { font-weight: 700; text-align: left; }
    .valor-celda { margin-right: 8px; font-weight: 600; }
    .solo-lectores { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @media (max-width: 719px) {
      .tabla-rutas th.ruta { display: block; padding: 0 0 6px; font-size: 1.05rem; border: 0; }
      .tabla-rutas td { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-height: 32px; }
      .tabla-rutas td[data-etiqueta]::before { min-width: 48px; font-weight: 600; }
    }
    @media (min-width: 600px) {
      .filtros-calidad { grid-template-columns: repeat(2, minmax(0, 260px)); }
      .rejilla-metricas { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (min-width: 960px) { .rejilla-metricas { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class Calidad {
  private readonly api = inject(CalidadApi);

  protected readonly periodos = PERIODOS;
  protected readonly dispositivos = DISPOSITIVOS;
  protected readonly explicacion = EXPLICACION_METRICA;
  protected readonly etiquetaCal = ETIQUETA_CALIFICACION;
  protected readonly simbolo = SIMBOLO_CALIFICACION;
  protected readonly nombres: NombreMetrica[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
  protected readonly valor = formatearValor;
  protected readonly pct = formatearPorcentaje;

  protected readonly dias = signal<Periodo>(7);
  protected readonly dispositivo = signal<FiltroDispositivo>('');
  protected readonly resumen = signal<ResumenMetricas | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly muestras = computed(() => totalMuestras(this.resumen()));
  protected readonly general = computed<MetricaGeneral[]>(() => ordenarMetricas(this.resumen()?.general ?? []));

  private solicitud = 0;

  constructor() {
    effect((alLimpiar) => {
      const numero = ++this.solicitud;
      this.cargando.set(true);
      this.error.set(null);
      const sub = this.api.resumen(this.dias(), this.dispositivo()).subscribe({
        next: (r) => {
          if (numero !== this.solicitud) return;
          this.resumen.set(r);
          this.cargando.set(false);
        },
        error: (e) => {
          if (numero !== this.solicitud) return;
          this.resumen.set(null);
          this.error.set(mensajeDeError(e));
          this.cargando.set(false);
        },
      });
      alLimpiar(() => sub.unsubscribe());
    });
  }

  protected cambiarDias(valor: string): void {
    this.dias.set(Number(valor) as Periodo);
  }

  protected clase(calificacion: Calificacion): string {
    return `cal-${calificacion.toLowerCase()}`;
  }

  protected celda<T extends { nombre: NombreMetrica }>(metricas: T[], nombre: NombreMetrica): T | undefined {
    return metricas.find((m) => m.nombre === nombre);
  }
}
