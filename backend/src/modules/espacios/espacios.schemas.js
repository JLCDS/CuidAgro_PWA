import { z } from 'zod';
import { estadoCambioSchema, fincaIdSchema, textoOpcional } from '../../lib/registros.js';

export const TIPOS_ESPACIO = ['CUADRANTE', 'ZONA', 'OTRO'];

const campos = z.object({
  fincaId: fincaIdSchema,
  codigo: z
    .string({ error: 'El código es obligatorio' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Usa letras, números y guiones (máx. 20), por ejemplo G1-C1'),
  nombre: textoOpcional(80),
  tipo: z.enum(TIPOS_ESPACIO, { error: 'Selecciona el tipo de espacio' }),
  capacidad: z
    .number({ error: 'La capacidad debe ser un número' })
    .int('La capacidad debe ser un número entero de aves')
    .min(1, 'La capacidad debe ser al menos 1')
    .max(100000, 'La capacidad no puede superar 100000')
    .nullable()
    .optional(),
  observaciones: textoOpcional(1000),
});

export const espacioCreateSchema = campos;
// La finca no se cambia al editar.
export const espacioUpdateSchema = campos.omit({ fincaId: true }).partial();
export const espacioEstadoSchema = estadoCambioSchema;
export const espaciosQuerySchema = z.object({
  fincaId: fincaIdSchema.optional(),
  estado: z.enum(['ACTIVO', 'INACTIVO', 'TODOS']).default('ACTIVO'),
  tipo: z.enum(TIPOS_ESPACIO).optional(),
});
