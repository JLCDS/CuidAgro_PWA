import { z } from 'zod';
import {
  estadoCambioSchema,
  fechaNoFuturaSchema,
  fincaIdSchema,
  listadoQuerySchema,
  nombreSchema,
  textoOpcional,
} from '../../lib/registros.js';

export const TIPOS = ['CONCENTRADO', 'FORRAJE', 'GRANO', 'SUPLEMENTO', 'SAL_MINERAL', 'OTRO'];
const MAX_GRAMOS = 100_000_000;

const gramos = (etiqueta, min) =>
  z
    .number({ error: `${etiqueta} es obligatoria` })
    .int(`${etiqueta} debe ser un número entero de gramos`)
    .min(min, min === 0 ? `${etiqueta} no puede ser negativa` : `${etiqueta} debe ser mayor que 0`)
    .max(MAX_GRAMOS, `${etiqueta} no puede superar ${MAX_GRAMOS} g`);

export const alimentoCreateSchema = z.object({
  fincaId: fincaIdSchema,
  nombre: nombreSchema,
  tipo: z.enum(TIPOS, { error: 'Selecciona el tipo de alimento' }),
  stockInicialGramos: gramos('La cantidad inicial', 0).optional(),
  stockMinimoGramos: gramos('El stock mínimo', 0).optional(),
  observaciones: textoOpcional(1000),
});

// El stock nunca se edita directo, y la finca no cambia.
export const alimentoUpdateSchema = alimentoCreateSchema.omit({ fincaId: true, stockInicialGramos: true }).partial();
export const alimentoEstadoSchema = estadoCambioSchema;

export const alimentosQuerySchema = listadoQuerySchema(TIPOS)
  .omit({ proposito: true })
  .extend({
    tipo: z.enum(TIPOS).optional(),
    bajoStock: z.enum(['true', 'false']).optional(),
  });

export const entradaSchema = z.object({
  cantidadGramos: gramos('La cantidad', 1),
  fecha: fechaNoFuturaSchema.optional(),
  nota: textoOpcional(500),
});
