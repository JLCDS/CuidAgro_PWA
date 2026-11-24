import { z } from 'zod';

export const MAX_DIAS_RANGO = 366;
const DIA_MS = 86_400_000;

const fecha = (etiqueta) =>
  z
    .string({ error: `${etiqueta} es obligatoria` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'La fecha no es válida');

export const consumosQuerySchema = z
  .object({
    fincaId: z.uuid({ error: 'Selecciona una finca válida' }),
    desde: fecha('La fecha inicial'),
    hasta: fecha('La fecha final'),
    agrupacion: z.enum(['DIA', 'MES'], { error: 'Agrupación inválida' }).default('DIA'),
    sujeto: z.enum(['VACUNOS', 'LOTES', 'TODOS'], { error: 'Sujeto inválido' }).default('TODOS'),
    vacunoId: z.uuid({ error: 'Vacuno inválido' }).optional(),
    loteId: z.uuid({ error: 'Lote inválido' }).optional(),
    alimentoId: z.uuid({ error: 'Alimento inválido' }).optional(),
    desglose: z.enum(['SUJETO', 'ALIMENTO', 'NINGUNO'], { error: 'Desglose inválido' }).default('SUJETO'),
  })
  .superRefine((q, ctx) => {
    const dias = (Date.parse(`${q.hasta}T00:00:00Z`) - Date.parse(`${q.desde}T00:00:00Z`)) / DIA_MS + 1;
    if (dias < 1) ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha final no puede ser anterior a la inicial' });
    else if (dias > MAX_DIAS_RANGO) {
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: `El rango no puede superar ${MAX_DIAS_RANGO} días` });
    }
  });
