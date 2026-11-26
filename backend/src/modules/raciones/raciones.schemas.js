import { z } from 'zod';
import { fincaIdSchema } from '../../lib/registros.js';
import { PROPOSITOS_RACION } from './raciones.defecto.js';

const proposito = z.enum(PROPOSITOS_RACION, { error: 'Selecciona el propósito' });

export const racionesQuerySchema = z.object({ fincaId: fincaIdSchema });

export const racionesDeleteQuerySchema = z.object({ fincaId: fincaIdSchema, proposito });

export const racionesPutSchema = z.object({
  fincaId: fincaIdSchema,
  proposito,
  semanas: z
    .array(
      z.object({
        semana: z.number({ error: 'La semana es obligatoria' }).int('La semana debe ser un número entero'),
        gramosAveDia: z
          .number({ error: 'Los gramos son obligatorios' })
          .int('Los gramos deben ser un número entero')
          .min(1, 'Los gramos deben ser al menos 1')
          .max(400, 'Los gramos no pueden superar 400'),
      }),
      { error: 'Envía la lista de semanas' },
    )
    .min(1, 'Envía al menos una semana')
    .max(104, 'No puede haber más de 104 semanas')
    .refine((filas) => filas.every((f, i) => f.semana === i + 1), 'Las semanas deben ser consecutivas desde la 1'),
});
