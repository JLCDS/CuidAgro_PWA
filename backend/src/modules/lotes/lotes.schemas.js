import { z } from 'zod';
import {
  estadoCambioSchema,
  fechaNoFuturaSchema,
  fincaIdSchema,
  listadoQuerySchema,
  nombreSchema,
  textoOpcional,
} from '../../lib/registros.js';

export const PROPOSITOS = ['PRODUCCION', 'ALIMENTACION'];
export const MENSAJE_RANGO_EDAD = 'La edad mínima no puede superar la máxima';

const semanas = (etiqueta) =>
  z
    .number({ error: `La edad ${etiqueta} es obligatoria` })
    .int('La edad debe ser un número entero de semanas')
    .min(0, 'La edad no puede ser negativa')
    .max(520, 'La edad no puede superar 520 semanas');

const campos = z.object({
  fincaId: fincaIdSchema,
  nombre: nombreSchema,
  tipoAve: textoOpcional(80),
  edadMinSemanas: semanas('mínima'),
  edadMaxSemanas: semanas('máxima'),
  cantidad: z
    .number({ error: 'La cantidad es obligatoria' })
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser al menos 1')
    .max(100000, 'La cantidad no puede superar 100000'),
  proposito: z.enum(PROPOSITOS, { error: 'Selecciona el propósito' }),
  fechaIngreso: fechaNoFuturaSchema.nullable().optional(),
  observaciones: textoOpcional(1000),
  espacioId: z.uuid({ error: 'Selecciona un espacio válido' }).nullable().optional(),
});

const rangoValido = (l) =>
  l.edadMinSemanas === undefined || l.edadMaxSemanas === undefined || l.edadMinSemanas <= l.edadMaxSemanas;
const rango = { path: ['edadMinSemanas'], message: MENSAJE_RANGO_EDAD };

export const loteCreateSchema = campos.refine(rangoValido, rango);
// La finca no se cambia al editar. Si solo llega un extremo del rango, el servicio lo valida contra el guardado.
export const loteUpdateSchema = campos.omit({ fincaId: true }).partial().refine(rangoValido, rango);
export const loteEstadoSchema = estadoCambioSchema;
export const lotesQuerySchema = listadoQuerySchema(PROPOSITOS).extend({ espacioId: z.uuid().optional() });
