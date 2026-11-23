import { FincaResumen, hoyBogota } from './modelos';

export type TipoNovedad = 'ENFERMEDAD' | 'LESION' | 'MUERTE' | 'COMPORTAMIENTO' | 'PRODUCCION' | 'INFRAESTRUCTURA' | 'OTRO';
export type PrioridadNovedad = 'BAJA' | 'MEDIA' | 'ALTA';
export type EstadoNovedad = 'ABIERTA' | 'EN_SEGUIMIENTO' | 'CERRADA';
export type EstadoCasoSalud = 'EN_OBSERVACION' | 'EN_TRATAMIENTO' | 'RECUPERADO' | 'FALLECIDO';

export const TIPOS_NOVEDAD: { valor: TipoNovedad; etiqueta: string }[] = [
  { valor: 'ENFERMEDAD', etiqueta: 'Enfermedad' },
  { valor: 'LESION', etiqueta: 'Lesión' },
  { valor: 'MUERTE', etiqueta: 'Muerte' },
  { valor: 'COMPORTAMIENTO', etiqueta: 'Comportamiento' },
  { valor: 'PRODUCCION', etiqueta: 'Producción' },
  { valor: 'INFRAESTRUCTURA', etiqueta: 'Infraestructura' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const PRIORIDADES_NOVEDAD: { valor: PrioridadNovedad; etiqueta: string }[] = [
  { valor: 'BAJA', etiqueta: 'Baja' },
  { valor: 'MEDIA', etiqueta: 'Media' },
  { valor: 'ALTA', etiqueta: 'Alta' },
];

export const ESTADOS_NOVEDAD: { valor: EstadoNovedad; etiqueta: string }[] = [
  { valor: 'ABIERTA', etiqueta: 'Abierta' },
  { valor: 'EN_SEGUIMIENTO', etiqueta: 'En seguimiento' },
  { valor: 'CERRADA', etiqueta: 'Cerrada' },
];

export const ESTADOS_CASO: { valor: EstadoCasoSalud; etiqueta: string }[] = [
  { valor: 'EN_OBSERVACION', etiqueta: 'En observación' },
  { valor: 'EN_TRATAMIENTO', etiqueta: 'En tratamiento' },
  { valor: 'RECUPERADO', etiqueta: 'Recuperado' },
  { valor: 'FALLECIDO', etiqueta: 'Fallecido' },
];

export interface ComentarioNovedad {
  id: string;
  novedadId: string;
  texto: string;
  createdAt: string;
  autor: FincaResumen;
}

export interface Novedad {
  id: string;
  fincaId: string;
  vacunoId: string | null;
  loteId: string | null;
  vacuno: FincaResumen | null;
  lote: FincaResumen | null;
  finca: FincaResumen;
  tipo: TipoNovedad;
  prioridad: PrioridadNovedad;
  descripcion: string;
  fechaHora: string;
  latitud: number | null;
  longitud: number | null;
  precisionMetros: number | null;
  tieneFoto: boolean;
  fotoUrl: string | null;
  estado: EstadoNovedad;
  cerradaEn: string | null;
  registradoPor: FincaResumen;
  totalComentarios: number;
  createdAt: string;
  updatedAt: string;
  comentarios?: ComentarioNovedad[];
}

export interface CasoSalud {
  id: string;
  fincaId: string;
  vacunoId: string | null;
  loteId: string | null;
  vacuno: FincaResumen | null;
  lote: FincaResumen | null;
  finca: FincaResumen;
  novedadId: string | null;
  novedad: { id: string; tipo: TipoNovedad; fechaHora: string } | null;
  diagnostico: string;
  sintomas: string | null;
  estado: EstadoCasoSalud;
  activo: boolean;
  fechaInicio: string;
  fechaFin: string | null;
  animalesAfectados: number | null;
  observaciones: string | null;
  registradoPor: FincaResumen;
  createdAt: string;
  updatedAt: string;
}

/** Fecha (YYYY-MM-DD) en Bogotá de un instante ISO. */
export const diaBogota = (iso: string): string => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** Quien gestiona edita cualquiera; el ayudante solo la suya, abierta y creada hoy en Bogotá. */
export function puedeEditarNovedad(
  n: Pick<Novedad, 'estado' | 'createdAt' | 'registradoPor'>,
  usuarioId: string,
  gestiona: boolean,
  hoy: string = hoyBogota(),
): boolean {
  if (gestiona) return true;
  return n.registradoPor.id === usuarioId && n.estado === 'ABIERTA' && diaBogota(n.createdAt) === hoy;
}

export function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function enlaceMapa(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

/** Errores de validación por campo de la API (`error.detalles`). */
export function erroresPorCampo(error: unknown): Record<string, string> {
  const detalles = (error as { error?: { error?: { detalles?: { campo?: string; mensaje: string }[] } } })?.error?.error?.detalles;
  const mapa: Record<string, string> = {};
  for (const d of detalles ?? []) if (d.campo && !mapa[d.campo]) mapa[d.campo] = d.mensaje;
  return mapa;
}
