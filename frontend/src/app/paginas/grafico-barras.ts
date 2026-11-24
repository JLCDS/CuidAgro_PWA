import { Component, computed, input } from '@angular/core';
import {
  etiquetaPeriodo,
  etiquetaPeriodoCorta,
  formatearPeso,
  maximoAmable,
  PuntoSerie,
  resumenSerie,
  saltoEtiquetas,
} from '../core/reportes-modelos';

const MARGEN_IZQ = 50;
const MARGEN_DER = 8;
const ALTO_AREA = 180;
const ALTO_TOTAL = 214;

/**
 * Gráfico de barras en SVG en línea (sin librerías). Con muchos periodos el SVG conserva un ancho mínimo
 * y el contenedor, no la página, se desplaza horizontalmente.
 */
@Component({
  selector: 'app-grafico-barras',
  template: `
    <div class="grafico" tabindex="0" role="region" [attr.aria-label]="'Gráfico: ' + titulo()">
      <svg
        role="img"
        [attr.aria-label]="resumen()"
        [attr.viewBox]="'0 0 ' + ancho() + ' ' + ALTO_TOTAL"
        [style.min-width.px]="ancho()"
        preserveAspectRatio="xMinYMid meet"
      >
        @for (t of ticks(); track t.valor) {
          <line class="rejilla" [attr.x1]="MARGEN_IZQ" [attr.x2]="ancho() - MARGEN_DER" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="eje" [attr.x]="MARGEN_IZQ - 6" [attr.y]="t.y + 4" text-anchor="end">{{ t.etiqueta }}</text>
        }
        @for (b of barras(); track b.periodo) {
          <rect class="barra" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.ancho" [attr.height]="b.alto" rx="2">
            <title>{{ b.titulo }}</title>
          </rect>
          @if (b.valorVisible) {
            <text class="valor" [attr.x]="b.x + b.ancho / 2" [attr.y]="b.y - 4" text-anchor="middle">{{ b.valorTexto }}</text>
          }
          @if (b.etiquetaVisible) {
            <text class="eje" [attr.x]="b.x + b.ancho / 2" [attr.y]="ALTO_AREA + 20" text-anchor="middle">{{ b.etiqueta }}</text>
          }
        }
      </svg>
    </div>
    <table class="sr-only">
      <caption>{{ titulo() }}</caption>
      <thead>
        <tr><th scope="col">Periodo</th><th scope="col">Cantidad</th></tr>
      </thead>
      <tbody>
        @for (p of serie(); track p.periodo) {
          <tr><th scope="row">{{ completa(p.periodo) }}</th><td>{{ peso(p.gramos) }}</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    /* min-width: 0 evita que, dentro de un grid, el SVG ancho ensanche la página: el desplazamiento queda en .grafico. */
    :host { display: block; min-width: 0; }
    .grafico { overflow-x: auto; max-width: 100%; padding-bottom: 4px; border-radius: 8px; }
    svg { display: block; width: 100%; height: auto; }
    .barra { fill: var(--verde-600); }
    .barra:hover { fill: var(--verde-900); }
    .rejilla { stroke: var(--borde); stroke-width: 1; }
    .eje { fill: var(--texto-suave); font-size: 11px; }
    .valor { fill: var(--texto); font-size: 11px; font-weight: 600; }
    @media print {
      .grafico { overflow: visible; }
      svg { min-width: 0 !important; }
    }
  `,
})
export class GraficoBarras {
  readonly serie = input.required<PuntoSerie[]>();
  readonly titulo = input('Consumo de alimento');
  /** Ancho (en px) reservado para cada barra. */
  readonly anchoPorBarra = input(44);

  protected readonly MARGEN_IZQ = MARGEN_IZQ;
  protected readonly MARGEN_DER = MARGEN_DER;
  protected readonly ALTO_AREA = ALTO_AREA;
  protected readonly ALTO_TOTAL = ALTO_TOTAL;
  protected readonly peso = formatearPeso;
  protected readonly completa = etiquetaPeriodo;

  protected readonly ancho = computed(() => MARGEN_IZQ + MARGEN_DER + this.serie().length * this.anchoPorBarra());
  protected readonly resumen = computed(() => resumenSerie(this.serie(), this.titulo()));
  private readonly maximo = computed(() => maximoAmable(Math.max(0, ...this.serie().map((p) => p.gramos))));

  protected readonly ticks = computed(() => {
    const max = this.maximo();
    return [0, 0.5, 1].map((f) => ({ valor: max * f, etiqueta: formatearPeso(max * f), y: 10 + ALTO_AREA - ALTO_AREA * f }));
  });

  protected readonly barras = computed(() => {
    const serie = this.serie();
    const slot = this.anchoPorBarra();
    const salto = saltoEtiquetas(slot, serie[0]?.periodo.length === 7 ? 60 : 32);
    const ancho = Math.max(2, slot - Math.min(10, slot * 0.25));
    const max = this.maximo();
    const conValores = slot >= 40 && serie.length <= 12;
    return serie.map((p, i) => {
      const alto = p.gramos > 0 ? Math.max(2, (p.gramos / max) * ALTO_AREA) : 0;
      return {
        periodo: p.periodo,
        x: MARGEN_IZQ + i * slot + (slot - ancho) / 2,
        y: 10 + ALTO_AREA - alto,
        ancho,
        alto,
        titulo: `${etiquetaPeriodo(p.periodo)}: ${formatearPeso(p.gramos)}`,
        etiqueta: etiquetaPeriodoCorta(p.periodo),
        etiquetaVisible: i % salto === 0,
        valorVisible: conValores && p.gramos > 0,
        valorTexto: formatearPeso(p.gramos),
      };
    });
  });
}
