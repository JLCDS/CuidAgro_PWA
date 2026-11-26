import { hoyBogota, ZONA_HORARIA } from '../../lib/registros.js';

const DIA_MS = 86_400_000;
const iso = (fecha) => fecha.toISOString().slice(0, 10);

/** Días completos entre dos fechas YYYY-MM-DD. */
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

/**
 * Edad actual del lote: la edad al ingreso más el tiempo en la finca.
 * Sin fecha de ingreso se usa la fecha de alta del registro (en Bogotá). `hoy` es YYYY-MM-DD.
 */
export function edadActual(lote, hoy = hoyBogota()) {
  const ingreso = lote.fechaIngreso
    ? iso(lote.fechaIngreso)
    : lote.createdAt.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });
  const dias = Math.max(0, diasEntre(ingreso, hoy));
  const semanasEnFinca = Math.floor(dias / 7);
  return {
    minSemanas: lote.edadMinSemanas + semanasEnFinca,
    maxSemanas: lote.edadMaxSemanas + semanasEnFinca,
    semanaVida: Math.floor((lote.edadMinSemanas * 7 + dias) / 7) + 1,
  };
}

/** `gramos` es la lista por semana (semana 1 en la posición 0); pasada la última se repite la última fila. */
export const gramosAveDia = (gramos, semana) => gramos[Math.min(Math.max(semana, 1), gramos.length) - 1];

export function racionSugerida(lote, gramos, hoy = hoyBogota()) {
  const { semanaVida } = edadActual(lote, hoy);
  const porAve = gramosAveDia(gramos, semanaVida);
  return { semanaVida, gramosAveDia: porAve, gramosDia: porAve * lote.cantidad };
}
