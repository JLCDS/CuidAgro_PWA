import { z } from 'zod';
import {
  estadoCambioSchema,
  fechaNoFuturaSchema,
  fincaIdSchema,
  listadoQuerySchema,
  nombreSchema,
  textoOpcional,
} from '../../lib/registros.js';

export const SEXOS = ['MACHO', 'HEMBRA'];
export const PROPOSITOS = ['ALIMENTACION', 'PRODUCCION_LECHERA', 'ENGORDE'];

export const vacunoCreateSchema = z.object({
  fincaId: fincaIdSchema,
  nombre: nombreSchema,
  sexo: z.enum(SEXOS, { error: 'Selecciona el sexo' }),
  raza: z
    .string({ error: 'La raza es obligatoria' })
    .trim()
    .min(2, 'La raza debe tener al menos 2 caracteres')
    .max(80, 'La raza no puede superar 80 caracteres'),
  edadMeses: z
    .number({ error: 'La edad es obligatoria' })
    .int('La edad debe ser un número entero de meses')
    .min(0, 'La edad no puede ser negativa')
    .max(480, 'La edad no puede superar 480 meses'),
  peso: z
    .number({ error: 'El peso es obligatorio' })
    .gt(0, 'El peso debe ser mayor que 0')
    .max(2000, 'El peso no puede superar 2000 kg')
    .transform((v) => Math.round(v * 100) / 100),
  fechaLlegada: fechaNoFuturaSchema,
  proposito: z.enum(PROPOSITOS, { error: 'Selecciona el propósito' }),
  observaciones: textoOpcional(1000),
});

// La finca no se cambia al editar.
export const vacunoUpdateSchema = vacunoCreateSchema.omit({ fincaId: true }).partial();
export const vacunoEstadoSchema = estadoCambioSchema;
export const vacunosQuerySchema = listadoQuerySchema(PROPOSITOS);
