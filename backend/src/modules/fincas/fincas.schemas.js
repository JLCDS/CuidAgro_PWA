import { z } from 'zod';

const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const fincaCreateSchema = z.object({
  nombre: z
    .string({ error: 'El nombre es obligatorio' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  ubicacion: textoOpcional(200),
  descripcion: textoOpcional(1000),
});

export const fincaUpdateSchema = fincaCreateSchema.partial();
