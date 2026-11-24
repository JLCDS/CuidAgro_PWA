import { z } from 'zod';
import { fechaNoFuturaSchema, fincaIdSchema, textoOpcional } from '../../lib/registros.js';
import { decimal, diasRetiro } from '../medicamentos/medicamentos.schemas.js';

export const VIAS = ['ORAL', 'INTRAMUSCULAR', 'SUBCUTANEA', 'INTRAVENOSA', 'TOPICA', 'EN_AGUA', 'EN_ALIMENTO', 'OTRA'];

const fechaConsulta = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'La fecha no es válida');

const campos = {
  medicamentoId: z.uuid({ error: 'Selecciona un medicamento válido' }),
  casoSaludId: z.uuid({ error: 'Selecciona un caso de salud válido' }).nullable().optional(),
  dosis: decimal('La dosis', { min: 0, max: 100_000, exclusivo: true }),
  via: z.enum(VIAS, { error: 'Selecciona la vía de administración' }),
  fecha: fechaNoFuturaSchema.optional(),
  diasRetiroCarne: diasRetiro('Los días de retiro de carne'),
  diasRetiroLeche: diasRetiro('Los días de retiro de leche'),
  observaciones: textoOpcional(1000),
};

export const tratamientoCreateSchema = z
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
export const tratamientoUpdateSchema = z.object(campos).partial();

export const tratamientosQuerySchema = z.object({
  fincaId: fincaIdSchema.optional(),
  vacunoId: z.uuid().optional(),
  loteId: z.uuid().optional(),
  casoSaludId: z.uuid().optional(),
  medicamentoId: z.uuid().optional(),
  desde: fechaConsulta.optional(),
  hasta: fechaConsulta.optional(),
  enRetiro: z.enum(['true', 'false']).optional(),
});
