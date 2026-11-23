import { z } from 'zod';
import { fincaIdSchema } from '../../lib/registros.js';

export const TIPOS = ['ENFERMEDAD', 'LESION', 'MUERTE', 'COMPORTAMIENTO', 'PRODUCCION', 'INFRAESTRUCTURA', 'OTRO'];
export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'];
export const ESTADOS = ['ABIERTA', 'EN_SEGUIMIENTO', 'CERRADA'];

const MARGEN_FUTURO_MS = 5 * 60 * 1000;

const fechaConsulta = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'La fecha no es válida');

// En multipart los números llegan como texto; `null` (JSON) quita el valor.
const numero = (mensaje) => z.coerce.number({ error: mensaje });

const latitud = numero('La latitud debe ser un número')
  .min(-90, 'La latitud debe estar entre -90 y 90')
  .max(90, 'La latitud debe estar entre -90 y 90');
const longitud = numero('La longitud debe ser un número')
  .min(-180, 'La longitud debe estar entre -180 y 180')
  .max(180, 'La longitud debe estar entre -180 y 180');
const precision = numero('La precisión debe ser un número')
  .int('La precisión debe ser un número entero de metros')
  .min(0, 'La precisión no puede ser negativa')
  .max(100_000, 'La precisión no puede superar 100000 m');

const fechaHora = z.iso
  .datetime({ offset: true, error: 'Usa una fecha y hora ISO válida' })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() <= Date.now() + MARGEN_FUTURO_MS, 'La fecha y hora no pueden ser futuras');

const descripcion = z
  .string({ error: 'La descripción es obligatoria' })
  .trim()
  .min(5, 'La descripción debe tener al menos 5 caracteres')
  .max(2000, 'La descripción no puede superar 2000 caracteres');

const tipo = z.enum(TIPOS, { error: 'Selecciona el tipo de novedad' });
const prioridad = z.enum(PRIORIDADES, { error: 'Selecciona la prioridad' });

/** Latitud y longitud van juntas: ambas con valor o ambas vacías. */
function exigirParUbicacion(datos, ctx) {
  if (datos.latitud === undefined && datos.longitud === undefined) return;
  const sinLat = (datos.latitud ?? null) === null;
  const sinLon = (datos.longitud ?? null) === null;
  if (sinLat !== sinLon) {
    ctx.addIssue({
      code: 'custom',
      path: [sinLat ? 'latitud' : 'longitud'],
      message: 'La latitud y la longitud van juntas',
    });
  }
}

export const novedadCreateSchema = z
  .object({
    vacunoId: z.uuid({ error: 'Selecciona un vacuno válido' }).optional(),
    loteId: z.uuid({ error: 'Selecciona un lote válido' }).optional(),
    tipo,
    prioridad: prioridad.optional(),
    descripcion,
    fechaHora: fechaHora.optional(),
    latitud: latitud.nullable().optional(),
    longitud: longitud.nullable().optional(),
    precisionMetros: precision.nullable().optional(),
  })
  .superRefine((datos, ctx) => {
    if (Boolean(datos.vacunoId) === Boolean(datos.loteId)) {
      ctx.addIssue({ code: 'custom', path: ['loteId'], message: 'Indica un lote o un vacuno, pero no ambos' });
    }
    exigirParUbicacion(datos, ctx);
  });

export const novedadUpdateSchema = z
  .object({
    tipo,
    prioridad,
    descripcion,
    latitud: latitud.nullable(),
    longitud: longitud.nullable(),
    precisionMetros: precision.nullable(),
  })
  .partial()
  .superRefine(exigirParUbicacion);

export const novedadEstadoSchema = z.object({ estado: z.enum(ESTADOS, { error: 'Estado inválido' }) });

export const comentarioSchema = z.object({
  texto: z
    .string({ error: 'El comentario es obligatorio' })
    .trim()
    .min(1, 'El comentario es obligatorio')
    .max(1000, 'El comentario no puede superar 1000 caracteres'),
});

export const novedadesQuerySchema = z.object({
  fincaId: fincaIdSchema.optional(),
  vacunoId: z.uuid().optional(),
  loteId: z.uuid().optional(),
  tipo: z.enum(TIPOS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  estado: z.enum(ESTADOS).optional(),
  desde: fechaConsulta.optional(),
  hasta: fechaConsulta.optional(),
});
