import { z } from 'zod';
import { fechaNoFuturaSchema, fincaIdSchema, textoOpcional } from '../../lib/registros.js';

export const ESTADOS_CASO = ['EN_OBSERVACION', 'EN_TRATAMIENTO', 'RECUPERADO', 'FALLECIDO'];

const diagnostico = z
  .string({ error: 'El diagnóstico es obligatorio' })
  .trim()
  .min(2, 'El diagnóstico debe tener al menos 2 caracteres')
  .max(200, 'El diagnóstico no puede superar 200 caracteres');

const estado = z.enum(ESTADOS_CASO, { error: 'Estado inválido' });

const animalesAfectados = z
  .number({ error: 'Debe ser un número' })
  .int('Debe ser un número entero')
  .min(1, 'Debe ser al menos 1');

const campos = {
  novedadId: z.uuid({ error: 'Selecciona una novedad válida' }).nullable().optional(),
  diagnostico,
  sintomas: textoOpcional(2000),
  estado: estado.optional(),
  fechaInicio: fechaNoFuturaSchema.optional(),
  fechaFin: fechaNoFuturaSchema.nullable().optional(),
  animalesAfectados: animalesAfectados.nullable().optional(),
  observaciones: textoOpcional(1000),
};

export const casoCreateSchema = z
  .object({
    vacunoId: z.uuid({ error: 'Selecciona un vacuno válido' }).optional(),
    loteId: z.uuid({ error: 'Selecciona un lote válido' }).optional(),
    ...campos,
  })
  .superRefine((datos, ctx) => {
    if (Boolean(datos.vacunoId) === Boolean(datos.loteId)) {
      ctx.addIssue({ code: 'custom', path: ['loteId'], message: 'Indica un lote o un vacuno, pero no ambos' });
    }
  });

// El animal o lote no cambia al editar.
export const casoUpdateSchema = z.object(campos).partial();

export const casosQuerySchema = z.object({
  fincaId: fincaIdSchema.optional(),
  vacunoId: z.uuid().optional(),
  loteId: z.uuid().optional(),
  estado: estado.optional(),
  activos: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
