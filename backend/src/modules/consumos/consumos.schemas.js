import { z } from 'zod';
import { clienteIdSchema, fechaNoFuturaSchema, fincaIdSchema, textoOpcional } from '../../lib/registros.js';

export const JORNADAS = ['MANANA', 'TARDE', 'NOCHE'];

const fechaConsulta = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'La fecha no es válida');

/** Esquemas de vacunos y lotes: solo cambian el campo del animal/lote y el máximo de gramos. */
export function esquemasConsumo({ campo, maxGramos }) {
  const create = z.object({
    [campo]: z.uuid({ error: 'Selecciona un valor válido' }),
    alimentoId: z.uuid({ error: 'Selecciona un alimento válido' }),
    cantidadGramos: z
      .number({ error: 'La cantidad es obligatoria' })
      .int('La cantidad debe ser un número entero de gramos')
      .min(1, 'La cantidad debe ser mayor que 0')
      .max(maxGramos, `La cantidad no puede superar ${maxGramos} g`),
    jornada: z.enum(JORNADAS, { error: 'Selecciona la jornada' }),
    fecha: fechaNoFuturaSchema,
    observaciones: textoOpcional(500),
    clienteId: clienteIdSchema,
  });
  const query = z.object({
    fincaId: fincaIdSchema.optional(),
    [campo]: z.uuid().optional(),
    alimentoId: z.uuid().optional(),
    jornada: z.enum(JORNADAS).optional(),
    desde: fechaConsulta.optional(),
    hasta: fechaConsulta.optional(),
  });
  // El animal o lote no cambia al editar.
  return { create, update: create.omit({ [campo]: true, clienteId: true }).partial(), query };
}
