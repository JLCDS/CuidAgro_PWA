import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Alimento, formatearFecha, hoyBogota, Lote, Vacuno } from '../core/modelos';
import { AlimentosApi } from '../core/alimentos-api';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { LotesApi } from '../core/lotes-api';
import { ReportesApi } from '../core/reportes-api';
import {
  Agrupacion,
  ATAJOS_RANGO,
  AtajoRango,
  Desglose,
  etiquetaPeriodo,
  FiltrosReporte,
  formatearPeso,
  generarCsv,
  nombreArchivoCsv,
  rangoDeAtajo,
  ReporteConsumos,
  SujetoReporte,
  validarRango,
} from '../core/reportes-modelos';
import { VacunosApi } from '../core/vacunos-api';
import { GraficoBarras } from './grafico-barras';

type Campo = 'desde' | 'hasta' | 'agrupacion' | 'sujeto' | 'vacunoId' | 'loteId' | 'alimentoId' | 'desglose';

@Component({
  selector: 'app-reportes',
  imports: [RouterLink, GraficoBarras],
  template: `
    <div class="cabecera-pagina">
      <h1>Reporte de alimento consumido</h1>
      <div class="acciones no-imprimir">
        <button type="button" class="btn" [disabled]="!reporte() || reporte()!.filas.length === 0" (click)="exportar()">Exportar CSV</button>
        <button type="button" class="btn" [disabled]="!reporte()" (click)="imprimir()">Imprimir</button>
      </div>
    </div>

    @if (!fincaId()) {
      <div class="vacio">
        <img class="vacio-escena" src="img/finca.webp" alt="" width="720" height="540" loading="lazy" /> Aún no hay una finca para trabajar. <a routerLink="/fincas">Crea una finca</a> primero.</div>
    } @else {
      <form class="tarjeta pila no-imprimir" (submit)="consultar($event)" novalidate>
        <div class="atajos" role="group" aria-label="Atajos de rango">
          @for (a of atajos; track a.valor) {
            <button type="button" class="btn" (click)="aplicarAtajo(a.valor)">{{ a.etiqueta }}</button>
          }
        </div>
        <div class="rejilla-filtros">
          <div class="campo">
            <label for="rep-desde">Desde</label>
            <input id="rep-desde" class="input" type="date" [class.invalido]="errores().desde" [value]="desde()"
              [attr.aria-invalid]="errores().desde ? 'true' : null" [attr.aria-describedby]="errores().desde ? 'rep-desde-error' : null"
              (input)="desde.set($any($event.target).value)" />
            @if (errores().desde; as m) { <span class="error-campo" id="rep-desde-error">{{ m }}</span> }
          </div>
          <div class="campo">
            <label for="rep-hasta">Hasta</label>
            <input id="rep-hasta" class="input" type="date" [class.invalido]="errores().hasta" [value]="hasta()"
              [attr.aria-invalid]="errores().hasta ? 'true' : null" [attr.aria-describedby]="errores().hasta ? 'rep-hasta-error' : null"
              (input)="hasta.set($any($event.target).value)" />
            @if (errores().hasta; as m) { <span class="error-campo" id="rep-hasta-error">{{ m }}</span> }
          </div>
          <div class="campo">
            <label for="rep-agrupacion">Agrupar por</label>
            <select id="rep-agrupacion" class="input" [value]="agrupacion()" (change)="agrupacion.set($any($event.target).value)">
              <option value="DIA">Día</option>
              <option value="MES">Mes</option>
            </select>
            @if (errores().agrupacion; as m) { <span class="error-campo">{{ m }}</span> }
          </div>
          <div class="campo">
            <label for="rep-sujeto">Sujeto</label>
            <select id="rep-sujeto" class="input" [value]="sujeto()" (change)="cambiarSujeto($any($event.target).value)">
              <option value="TODOS">Vacunos y lotes</option>
              <option value="VACUNOS">Solo vacunos</option>
              <option value="LOTES">Solo lotes</option>
            </select>
          </div>
          @if (sujeto() !== 'LOTES') {
            <div class="campo">
              <label for="rep-vacuno">Vacuno</label>
              <select id="rep-vacuno" class="input" [value]="vacunoId()" (change)="vacunoId.set($any($event.target).value)">
                <option value="">Todos</option>
                @for (v of vacunos(); track v.id) {
                  <option [value]="v.id" [selected]="v.id === vacunoId()">{{ v.nombre }}@if (v.estado === 'INACTIVO') { (de baja) }</option>
                }
              </select>
              @if (errores().vacunoId; as m) { <span class="error-campo">{{ m }}</span> }
            </div>
          }
          @if (sujeto() !== 'VACUNOS') {
            <div class="campo">
              <label for="rep-lote">Lote</label>
              <select id="rep-lote" class="input" [value]="loteId()" (change)="loteId.set($any($event.target).value)">
                <option value="">Todos</option>
                @for (l of lotes(); track l.id) {
                  <option [value]="l.id" [selected]="l.id === loteId()">{{ l.nombre }}@if (l.estado === 'INACTIVO') { (de baja) }</option>
                }
              </select>
              @if (errores().loteId; as m) { <span class="error-campo">{{ m }}</span> }
            </div>
          }
          <div class="campo">
            <label for="rep-alimento">Alimento</label>
            <select id="rep-alimento" class="input" [value]="alimentoId()" (change)="alimentoId.set($any($event.target).value)">
              <option value="">Todos</option>
              @for (a of alimentos(); track a.id) {
                <option [value]="a.id" [selected]="a.id === alimentoId()">{{ a.nombre }}</option>
              }
            </select>
            @if (errores().alimentoId; as m) { <span class="error-campo">{{ m }}</span> }
          </div>
          <div class="campo">
            <label for="rep-desglose">Detalle</label>
            <select id="rep-desglose" class="input" [value]="desglose()" (change)="desglose.set($any($event.target).value)">
              <option value="SUJETO">Por animal o lote</option>
              <option value="ALIMENTO">Por animal o lote y alimento</option>
              <option value="NINGUNO">Solo el total del periodo</option>
            </select>
            @if (errores().desglose; as m) { <span class="error-campo">{{ m }}</span> }
          </div>
        </div>
        <p class="ayuda">Si eliges un vacuno o un lote concreto, solo se incluye lo elegido. Los animales dados de baja también cuentan.</p>
        <div class="acciones">
          <button type="submit" class="btn btn-primario" [disabled]="cargando()">{{ cargando() ? 'Consultando…' : 'Consultar' }}</button>
        </div>
      </form>

      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      @if (reporte(); as r) {
        <p class="suave solo-impresion">
          {{ fincaNombre() }} · {{ fecha(r.parametros.desde) }} a {{ fecha(r.parametros.hasta) }}
        </p>
        <section class="resumen" aria-label="Totales">
          <div class="tarjeta"><span class="cifra">{{ peso(r.totales.gramos) }}</span><span class="etiqueta">Total consumido</span></div>
          <div class="tarjeta"><span class="cifra">{{ r.totales.registros }}</span><span class="etiqueta">Registros</span></div>
          <div class="tarjeta"><span class="cifra">{{ r.totales.sujetos }}</span><span class="etiqueta">Animales o lotes</span></div>
          <div class="tarjeta">
            <span class="cifra">{{ peso(r.totales.promedioGramosPorPeriodo) }}</span>
            <span class="etiqueta">Promedio por {{ r.parametros.agrupacion === 'MES' ? 'mes' : 'día' }}</span>
          </div>
        </section>

        <section class="tarjeta pila">
          <h2>Consumo por {{ r.parametros.agrupacion === 'MES' ? 'mes' : 'día' }}</h2>
          <app-grafico-barras
            [serie]="r.serie"
            [titulo]="'Consumo de alimento por ' + (r.parametros.agrupacion === 'MES' ? 'mes' : 'día')"
            [anchoPorBarra]="r.parametros.agrupacion === 'MES' ? 72 : 44" />
        </section>

        @if (r.filas.length === 0) {
          <div class="vacio"><img class="vacio-objeto" src="img/vacio-reportes.webp" alt="" width="320" height="320" loading="lazy" />No hay consumos registrados con estos filtros.</div>
        } @else {
          <table class="tabla">
            <thead>
              <tr>
                <th>Periodo</th>
                @if (r.parametros.desglose !== 'NINGUNO') { <th>Animal o lote</th> }
                @if (r.parametros.desglose === 'ALIMENTO') { <th>Alimento</th> }
                <th>Cantidad</th>
                <th>Registros</th>
              </tr>
            </thead>
            <tbody>
              @for (f of r.filas; track $index) {
                <tr>
                  <td data-etiqueta="Periodo">{{ periodo(f.periodo) }}</td>
                  @if (r.parametros.desglose !== 'NINGUNO') {
                    <td data-etiqueta="Animal o lote">{{ f.sujeto?.nombre }} <span class="suave">({{ f.sujeto?.tipo === 'LOTE' ? 'lote' : 'vacuno' }})</span></td>
                  }
                  @if (r.parametros.desglose === 'ALIMENTO') { <td data-etiqueta="Alimento">{{ f.alimento?.nombre }}</td> }
                  <td data-etiqueta="Cantidad">{{ peso(f.gramos) }}</td>
                  <td data-etiqueta="Registros">{{ f.registros }}</td>
                </tr>
              }
              <tr class="total">
                <td [attr.colspan]="columnasTotal()"><strong>Total</strong></td>
                <td data-etiqueta="Cantidad"><strong>{{ peso(r.totales.gramos) }}</strong></td>
                <td data-etiqueta="Registros"><strong>{{ r.totales.registros }}</strong></td>
              </tr>
            </tbody>
          </table>
        }
      }
    }
  `,
  styles: `
    .atajos, .rejilla-filtros { display: grid; gap: 10px; }
    .atajos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rejilla-filtros { grid-template-columns: minmax(0, 1fr); }
    .resumen { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .resumen .tarjeta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .cifra { font-size: 1.4rem; font-weight: 700; color: var(--verde-900); overflow-wrap: anywhere; }
    .etiqueta { color: var(--texto-suave); font-size: 0.9rem; }
    .tarjeta h2 { margin: 0; }
    .tabla { margin-top: 16px; }
    .total td { background: var(--crema); }
    .solo-impresion { display: none; }
    @media (min-width: 720px) {
      .atajos { display: flex; flex-wrap: wrap; }
      .rejilla-filtros { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .resumen { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    @media print { .solo-impresion { display: block; } }
  `,
})
export class Reportes {
  private readonly api = inject(ReportesApi);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);
  private readonly alimentosApi = inject(AlimentosApi);

  protected readonly atajos = ATAJOS_RANGO;
  protected readonly peso = formatearPeso;
  protected readonly periodo = etiquetaPeriodo;
  protected readonly fecha = formatearFecha;

  protected readonly fincaId = this.fincaActiva.id;
  protected readonly fincaNombre = computed(() => this.fincaActiva.fincas().find((f) => f.id === this.fincaId())?.nombre ?? '');

  protected readonly desde = signal(rangoDeAtajo('ESTE_MES', hoyBogota()).desde);
  protected readonly hasta = signal(hoyBogota());
  protected readonly agrupacion = signal<Agrupacion>('DIA');
  protected readonly sujeto = signal<SujetoReporte>('TODOS');
  protected readonly vacunoId = signal('');
  protected readonly loteId = signal('');
  protected readonly alimentoId = signal('');
  protected readonly desglose = signal<Desglose>('SUJETO');

  protected readonly vacunos = signal<Vacuno[]>([]);
  protected readonly lotes = signal<Lote[]>([]);
  protected readonly alimentos = signal<Alimento[]>([]);

  protected readonly reporte = signal<ReporteConsumos | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly erroresServidor = signal<Partial<Record<Campo, string>>>({});
  protected readonly intentado = signal(false);

  protected readonly errores = computed<Partial<Record<Campo, string>>>(() => ({
    ...(this.intentado() ? validarRango(this.desde(), this.hasta()) : {}),
    ...this.erroresServidor(),
  }));
  protected readonly columnasTotal = computed(() => {
    const d = this.reporte()?.parametros.desglose;
    return d === 'ALIMENTO' ? 3 : d === 'NINGUNO' ? 1 : 2;
  });

  private solicitud = 0;

  constructor() {
    // Al abrir y al cambiar la finca: carga las listas de los filtros y el reporte del mes.
    effect(() => {
      const id = this.fincaId();
      untracked(() => {
        this.reporte.set(null);
        this.vacunoId.set('');
        this.loteId.set('');
        this.alimentoId.set('');
        if (!id) return;
        this.vacunosApi.listar({ fincaId: id, estado: 'TODOS', q: '', proposito: '' }).subscribe({ next: (l) => this.vacunos.set(l), error: () => undefined });
        this.lotesApi.listar({ fincaId: id, estado: 'TODOS', q: '', proposito: '' }).subscribe({ next: (l) => this.lotes.set(l), error: () => undefined });
        this.alimentosApi.listar({ fincaId: id, estado: 'TODOS', q: '', tipo: '', bajoStock: false }).subscribe({ next: (l) => this.alimentos.set(l), error: () => undefined });
        this.ejecutar();
      });
    });
  }

  protected aplicarAtajo(atajo: AtajoRango): void {
    const r = rangoDeAtajo(atajo, hoyBogota());
    this.desde.set(r.desde);
    this.hasta.set(r.hasta);
    this.ejecutar();
  }

  protected cambiarSujeto(valor: SujetoReporte): void {
    this.sujeto.set(valor);
    if (valor === 'LOTES') this.vacunoId.set('');
    if (valor === 'VACUNOS') this.loteId.set('');
  }

  protected consultar(evento: Event): void {
    evento.preventDefault();
    this.ejecutar();
  }

  private ejecutar(): void {
    const fincaId = this.fincaId();
    if (!fincaId) return;
    this.intentado.set(true);
    this.erroresServidor.set({});
    this.error.set(null);
    if (Object.keys(validarRango(this.desde(), this.hasta())).length > 0) return;

    const filtros: FiltrosReporte = {
      fincaId,
      desde: this.desde(),
      hasta: this.hasta(),
      agrupacion: this.agrupacion(),
      sujeto: this.sujeto(),
      vacunoId: this.vacunoId(),
      loteId: this.loteId(),
      alimentoId: this.alimentoId(),
      desglose: this.desglose(),
    };
    const numero = ++this.solicitud;
    this.cargando.set(true);
    this.api.consumos(filtros).subscribe({
      next: (r) => {
        if (numero !== this.solicitud) return;
        this.reporte.set(r);
        this.cargando.set(false);
      },
      error: (e) => {
        if (numero !== this.solicitud) return;
        this.cargando.set(false);
        const detalle = e instanceof HttpErrorResponse ? e.error?.error?.detalles?.[0] : null;
        if (detalle?.campo) this.erroresServidor.set({ [detalle.campo as Campo]: detalle.mensaje });
        else this.error.set(mensajeDeError(e));
      },
    });
  }

  protected exportar(): void {
    const r = this.reporte();
    if (!r) return;
    const blob = new Blob([generarCsv(r.filas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivoCsv(this.fincaNombre(), r.parametros.desde, r.parametros.hasta);
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  }

  protected imprimir(): void {
    window.print();
  }
}
