import { z } from 'zod';
import {
  estadoCambioSchema,
  fechaNoFuturaSchema,
  fincaIdSchema,
  listadoQuerySchema,
  nombreSchema,
  textoOpcional,
} from '../../lib/registros.js';

export const TIPOS = ['ANTIBIOTICO', 'ANTIPARASITARIO', 'VACUNA', 'VITAMINA', 'ANTIINFLAMATORIO', 'HORMONAL', 'OTRO'];
export const UNIDADES = ['ML', 'G', 'UNIDAD', 'DOSIS'];

/** Número con máximo dos decimales (columnas Decimal(12,2)). */
export const decimal = (etiqueta, { min, max, exclusivo = false }) =>
  z
    .number({ error: `${etiqueta} es obligatoria` })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${etiqueta} admite máximo 2 decimales`)
    .refine((v) => (exclusivo ? v > min : v >= min), exclusivo ? `${etiqueta} debe ser mayor que ${min}` : `${etiqueta} no puede ser negativa`)
    .refine((v) => v <= max, `${etiqueta} no puede superar ${max}`);

export const diasRetiro = (etiqueta) =>
  z
    .number({ error: `${etiqueta} debe ser un número` })
    .int(`${etiqueta} debe ser un número entero`)
    .min(0, `${etiqueta} no puede ser negativo`)
    .max(365, `${etiqueta} no puede superar 365`)
    .nullable()
    .optional();

/** Fecha real YYYY-MM-DD (puede ser futura, p. ej. un vencimiento); devuelve un Date a medianoche UTC. */
export const fechaSchema = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'La fecha no es válida')
  .transform((s) => new Date(`${s}T00:00:00Z`));

export const medicamentoCreateSchema = z.object({
  fincaId: fincaIdSchema,
  nombre: nombreSchema,
  tipo: z.enum(TIPOS, { error: 'Selecciona el tipo de medicamento' }),
  unidad: z.enum(UNIDADES, { error: 'Selecciona la unidad' }),
  stockInicial: decimal('La cantidad inicial', { min: 0, max: 1_000_000 }).optional(),
  stockMinimo: decimal('El stock mínimo', { min: 0, max: 1_000_000 }).optional(),
  fechaVencimiento: fechaSchema.nullable().optional(),
  laboratorio: textoOpcional(80),
  diasRetiroCarne: diasRetiro('Los días de retiro de carne'),
  diasRetiroLeche: diasRetiro('Los días de retiro de leche'),
  observaciones: textoOpcional(1000),
});

// El stock nunca se edita directo, y la finca no cambia.
export const medicamentoUpdateSchema = medicamentoCreateSchema.omit({ fincaId: true, stockInicial: true }).partial();
export const medicamentoEstadoSchema = estadoCambioSchema;

export const medicamentosQuerySchema = listadoQuerySchema(TIPOS)
  .omit({ proposito: true })
  .extend({
    tipo: z.enum(TIPOS).optional(),
    bajoStock: z.enum(['true', 'false']).optional(),
    alerta: z.enum(['true', 'false']).optional(),
  });

export const entradaMedicamentoSchema = z.object({
  cantidad: decimal('La cantidad', { min: 0, max: 1_000_000, exclusivo: true }),
  fecha: fechaNoFuturaSchema.optional(),
  fechaVencimiento: fechaSchema.nullable().optional(),
  nota: textoOpcional(500),
});
