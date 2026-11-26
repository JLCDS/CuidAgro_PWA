import { PropositoLote } from './modelos';

/** Ración por semana de vida: gramos de alimento por ave y por día. */
export interface FilaRacion {
  semana: number;
  gramosAveDia: number;
}

/** Tabla por defecto del contrato (la misma que el servidor). Sirve sin conexión y cuando la finca no tiene tabla propia. */
export const RACIONES_DEFECTO: Record<PropositoLote, number[]> = {
  ALIMENTACION: [25, 50, 85, 120, 150, 170, 185, 195],
  PRODUCCION: [12, 20, 28, 35, 41, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 86, 90, 95, 110],
};

export const MAX_SEMANAS_RACION = 104;

export function tablaDefecto(proposito: PropositoLote): FilaRacion[] {
  return RACIONES_DEFECTO[proposito].map((gramosAveDia, i) => ({ semana: i + 1, gramosAveDia }));
}

const DIA_MS = 86_400_000;
const aDia = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DIA_MS;

/** Fecha (YYYY-MM-DD) en Bogotá de un instante ISO. */
export const fechaBogota = (instante: string): string =>
  new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** Días desde el ingreso (o desde la creación si no hay fecha de ingreso); nunca negativo. */
export function diasEnFinca(fechaIngreso: string | null | undefined, creadoEn: string | undefined, hoy: string): number {
  const inicio = fechaIngreso ?? (creadoEn ? fechaBogota(creadoEn) : hoy);
  return Math.max(0, Math.round(aDia(hoy) - aDia(inicio)));
}

/** Semana de vida actual del lote (la primera semana es la 1). */
export function semanaDeVida(
  edadMinSemanas: number,
  fechaIngreso: string | null | undefined,
  creadoEn: string | undefined,
  hoy: string,
): number {
  return Math.floor((edadMinSemanas * 7 + diasEnFinca(fechaIngreso, creadoEn, hoy)) / 7) + 1;
}

/** g por ave y día de una semana; pasada la última fila se usa el valor de la última. */
export function gramosAveDia(tabla: FilaRacion[], semana: number): number {
  if (tabla.length === 0) return 0;
  const ordenada = [...tabla].sort((a, b) => a.semana - b.semana);
  const ultima = ordenada[ordenada.length - 1];
  if (semana >= ultima.semana) return ultima.gramosAveDia;
  return (ordenada.find((f) => f.semana === semana) ?? ordenada[0]).gramosAveDia;
}

/** Mitad de la ración diaria, redondeada a 50 g, para cuando se dan 2 comidas. */
export const gramosPorComida = (gramosDia: number): number => Math.round(gramosDia / 2 / 50) * 50;

export interface RacionCalculada {
  semanaVida: number;
  gramosAveDia: number;
  gramosDia: number;
  gramosPorComida: number;
}

export interface LoteParaRacion {
  cantidad: number;
  edadMinSemanas: number;
  fechaIngreso: string | null;
  createdAt?: string;
}

/** Ración sugerida de un lote para hoy. `tabla` es la de su propósito (la de la finca o la de por defecto). */
export function racionDeLote(lote: LoteParaRacion, tabla: FilaRacion[], hoy: string): RacionCalculada {
  const semana = semanaDeVida(lote.edadMinSemanas, lote.fechaIngreso, lote.createdAt, hoy);
  const g = gramosAveDia(tabla, semana);
  const gramosDia = g * lote.cantidad;
  return { semanaVida: semana, gramosAveDia: g, gramosDia, gramosPorComida: gramosPorComida(gramosDia) };
}
