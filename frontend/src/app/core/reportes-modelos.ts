import { formatearFecha } from './modelos';

// ---- Dashboard ----

export interface ResumenFinca {
  id: string;
  nombre: string;
}

export interface NovedadReciente {
  id: string;
  tipo: string;
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA';
  estado: string;
  fechaHora: string;
  sujeto: { tipo: 'VACUNO' | 'LOTE'; id: string; nombre: string } | null;
}

export interface Dashboard {
  finca: ResumenFinca;
  hoy: string;
  animales: { vacunosActivos: number; lotesActivos: number; avesActivas: number };
  alimentacion: {
    consumoHoyGramos: number;
    registrosHoy: number;
    vacunosSinConsumoHoy: number;
    ultimos7Dias: { fecha: string; gramos: number }[];
    alimentosStockBajo: { id: string; nombre: string; stockGramos: number; stockMinimoGramos: number }[];
  };
  salud: {
    casosActivos: number;
    novedadesAbiertas: number;
    novedadesAltaAbiertas: number;
    ultimasNovedades: NovedadReciente[];
  };
  medicamentos: {
    conAlerta: { id: string; nombre: string; bajoStock: boolean; vencido: boolean; porVencer: boolean }[];
    animalesEnRetiro: number;
  };
}

// ---- Reporte de consumos ----

export type Agrupacion = 'DIA' | 'MES';
export type SujetoReporte = 'VACUNOS' | 'LOTES' | 'TODOS';
export type Desglose = 'SUJETO' | 'ALIMENTO' | 'ESPACIO' | 'NINGUNO';

export interface FiltrosReporte {
  fincaId: string;
  desde: string;
  hasta: string;
  agrupacion: Agrupacion;
  sujeto: SujetoReporte;
  vacunoId: string;
  loteId: string;
  espacioId: string;
  alimentoId: string;
  desglose: Desglose;
}

export interface FilaReporte {
  periodo: string;
  sujeto: { tipo: 'VACUNO' | 'LOTE' | 'ESPACIO'; id: string | null; nombre: string } | null;
  alimento: { id: string; nombre: string } | null;
  gramos: number;
  registros: number;
}

export interface PuntoSerie {
  periodo: string;
  gramos: number;
}

export interface ReporteConsumos {
  parametros: {
    fincaId: string;
    desde: string;
    hasta: string;
    agrupacion: Agrupacion;
    sujeto: SujetoReporte;
    desglose: Desglose;
  };
  filas: FilaReporte[];
  serie: PuntoSerie[];
  totales: { gramos: number; registros: number; sujetos: number; promedioGramosPorPeriodo: number };
}

export const MAX_DIAS_RANGO = 366;

// ---- Cantidades ----

const formatoNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Cantidad legible: en gramos bajo 1 kg ("750 g") y en kilos desde ahí ("1,5 kg"). */
export function formatearPeso(gramos: number): string {
  if (Math.abs(gramos) < 1000) return `${formatoNumero.format(gramos)} g`;
  return `${formatoNumero.format(gramos / 1000)} kg`;
}

/** Kilos como texto con coma decimal y sin separador de miles, para el CSV ("1,5"). */
export function kilosParaCsv(gramos: number): string {
  return String(Number((gramos / 1000).toFixed(3))).replace('.', ',');
}

// ---- Fechas y rangos ----

const aIso = (fecha: Date): string => fecha.toISOString().slice(0, 10);
const aFecha = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function sumarDias(iso: string, dias: number): string {
  const fecha = aFecha(iso);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return aIso(fecha);
}

export type AtajoRango = 'ESTE_MES' | 'MES_ANTERIOR' | 'ULTIMOS_30' | 'ESTE_ANIO';

export const ATAJOS_RANGO: { valor: AtajoRango; etiqueta: string }[] = [
  { valor: 'ESTE_MES', etiqueta: 'Este mes' },
  { valor: 'MES_ANTERIOR', etiqueta: 'Mes anterior' },
  { valor: 'ULTIMOS_30', etiqueta: 'Últimos 30 días' },
  { valor: 'ESTE_ANIO', etiqueta: 'Este año' },
];

/** Rango (inclusivo) de un atajo, calculado a partir de `hoy` (YYYY-MM-DD, hora de Bogotá). */
export function rangoDeAtajo(atajo: AtajoRango, hoy: string): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split('-');
  switch (atajo) {
    case 'ESTE_MES':
      return { desde: `${anio}-${mes}-01`, hasta: hoy };
    case 'MES_ANTERIOR': {
      const primero = `${anio}-${mes}-01`;
      const ultimoAnterior = sumarDias(primero, -1);
      return { desde: `${ultimoAnterior.slice(0, 7)}-01`, hasta: ultimoAnterior };
    }
    case 'ULTIMOS_30':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'ESTE_ANIO':
      return { desde: `${anio}-01-01`, hasta: hoy };
  }
}

/** Cantidad de días del rango, contando ambos extremos. */
export const diasDelRango = (desde: string, hasta: string): number =>
  Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000) + 1;

/** Mensajes de validación del rango; vacío si es válido. */
export function validarRango(desde: string, hasta: string): { desde?: string; hasta?: string } {
  const errores: { desde?: string; hasta?: string } = {};
  if (!desde) errores.desde = 'La fecha inicial es obligatoria';
  if (!hasta) errores.hasta = 'La fecha final es obligatoria';
  if (desde && hasta) {
    const dias = diasDelRango(desde, hasta);
    if (dias < 1) errores.hasta = 'La fecha final no puede ser anterior a la inicial';
    else if (dias > MAX_DIAS_RANGO) errores.hasta = `El rango no puede superar ${MAX_DIAS_RANGO} días`;
  }
  return errores;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Etiqueta corta para el eje: "23/11" para un día y "nov 2026" para un mes. */
export function etiquetaPeriodoCorta(periodo: string): string {
  if (periodo.length === 7) {
    const [anio, mes] = periodo.split('-');
    return `${MESES[Number(mes) - 1]} ${anio}`;
  }
  const [, mes, dia] = periodo.split('-');
  return `${dia}/${mes}`;
}

/** Etiqueta completa: "23/11/2026" para un día y "nov 2026" para un mes. */
export const etiquetaPeriodo = (periodo: string): string =>
  periodo.length === 7 ? etiquetaPeriodoCorta(periodo) : formatearFecha(periodo);

// ---- Gráfico ----

/** Máximo "redondo" (1, 2, 5 o 10 por una potencia de 10) para que el eje quede legible. */
export function maximoAmable(valor: number): number {
  if (valor <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const mantisa = valor / potencia;
  const paso = mantisa <= 1 ? 1 : mantisa <= 2 ? 2 : mantisa <= 5 ? 5 : 10;
  return paso * potencia;
}

/** Cada cuántas barras se escribe una etiqueta para que no se encimen. */
export const saltoEtiquetas = (anchoPorBarra: number, anchoEtiqueta = 32): number =>
  Math.max(1, Math.ceil(anchoEtiqueta / anchoPorBarra));

/** Resumen en texto del gráfico, para `aria-label`. */
export function resumenSerie(serie: PuntoSerie[], titulo: string): string {
  if (serie.length === 0) return `${titulo}: sin datos.`;
  const total = serie.reduce((suma, p) => suma + p.gramos, 0);
  if (total === 0) return `${titulo}: ${serie.length} periodos sin consumo registrado.`;
  const mayor = serie.reduce((a, b) => (b.gramos > a.gramos ? b : a));
  return `${titulo}: ${serie.length} periodos, total ${formatearPeso(total)}. El mayor es ${etiquetaPeriodo(mayor.periodo)} con ${formatearPeso(mayor.gramos)}.`;
}

// ---- CSV ----

/** Texto de usuario en una celda: se entrecomilla si hace falta y se neutraliza la inyección de fórmulas de Excel. */
function celdaTexto(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export const CABECERA_CSV = ['Periodo', 'Tipo', 'Animal/Lote', 'Alimento', 'Gramos', 'Kg', 'Registros'];

/** CSV para Excel en español: separador `;`, saltos CRLF y BOM UTF-8 al inicio. */
export function generarCsv(filas: FilaReporte[]): string {
  const lineas = [CABECERA_CSV.join(';')];
  for (const f of filas) {
    lineas.push(
      [
        celdaTexto(f.periodo),
        f.sujeto ? (f.sujeto.tipo === 'VACUNO' ? 'Vacuno' : f.sujeto.tipo === 'ESPACIO' ? 'Espacio' : 'Lote') : 'Todos',
        celdaTexto(f.sujeto?.nombre ?? 'Todos'),
        celdaTexto(f.alimento?.nombre ?? ''),
        String(f.gramos),
        kilosParaCsv(f.gramos),
        String(f.registros),
      ].join(';'),
    );
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}

/** `consumo-<finca>-<desde>-<hasta>.csv`, con el nombre de la finca sin tildes ni símbolos. */
export function nombreArchivoCsv(finca: string, desde: string, hasta: string): string {
  const slug =
    finca
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'finca';
  return `consumo-${slug}-${desde}-${hasta}.csv`;
}
