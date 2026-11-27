import { NombreMetrica } from './metricas';

export type Calificacion = 'BUENA' | 'MEJORABLE' | 'MALA';
export type Periodo = 7 | 30 | 90;
export type FiltroDispositivo = '' | 'MOVIL' | 'ESCRITORIO';

export const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: 7, etiqueta: 'Últimos 7 días' },
  { valor: 30, etiqueta: 'Últimos 30 días' },
  { valor: 90, etiqueta: 'Últimos 90 días' },
];

export const DISPOSITIVOS: { valor: FiltroDispositivo; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos los dispositivos' },
  { valor: 'MOVIL', etiqueta: 'Celular' },
  { valor: 'ESCRITORIO', etiqueta: 'Computador' },
];

export interface MetricaGeneral {
  nombre: NombreMetrica;
  p75: number;
  muestras: number;
  buenas: number;
  mejorables: number;
  malas: number;
  calificacionP75: Calificacion;
}

export interface MetricaRuta {
  nombre: NombreMetrica;
  p75: number;
  muestras: number;
  calificacionP75: Calificacion;
}

export interface RutaMetricas {
  ruta: string;
  metricas: MetricaRuta[];
}

export interface ResumenMetricas {
  dias: number;
  dispositivo: string | null;
  general: MetricaGeneral[];
  porRuta: RutaMetricas[];
}

export const ORDEN_METRICAS: NombreMetrica[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

export const EXPLICACION_METRICA: Record<NombreMetrica, string> = {
  LCP: 'Cuánto tarda en verse el contenido principal.',
  INP: 'Cuánto tarda la pantalla en responder a un toque.',
  CLS: 'Cuánto se mueve el contenido mientras carga.',
  FCP: 'Cuánto tarda en aparecer lo primero en pantalla.',
  TTFB: 'Cuánto tarda el servidor en empezar a responder.',
};

export const ETIQUETA_CALIFICACION: Record<Calificacion, string> = {
  BUENA: 'Buena',
  MEJORABLE: 'Mejorable',
  MALA: 'Mala',
};

/** Símbolo que acompaña al color para que la calificación no dependa solo de él. */
export const SIMBOLO_CALIFICACION: Record<Calificacion, string> = { BUENA: '✓', MEJORABLE: '!', MALA: '✕' };

const numero = (valor: number, decimales: number) =>
  valor.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimales });

/** CLS no tiene unidad; el resto son milisegundos (desde 1 s se muestra en segundos). */
export function formatearValor(nombre: NombreMetrica, valor: number): string {
  if (nombre === 'CLS') return numero(valor, 3);
  if (valor >= 1000) return `${numero(valor / 1000, 2)} s`;
  return `${numero(valor, 0)} ms`;
}

/** Fracción (0 a 1) como porcentaje entero. */
export function formatearPorcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 100)} %`;
}

export function ordenarMetricas<T extends { nombre: NombreMetrica }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => ORDEN_METRICAS.indexOf(a.nombre) - ORDEN_METRICAS.indexOf(b.nombre));
}

export function totalMuestras(resumen: ResumenMetricas | null): number {
  return resumen?.general.reduce((suma, m) => suma + m.muestras, 0) ?? 0;
}
