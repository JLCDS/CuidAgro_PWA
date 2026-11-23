import { z } from 'zod';
import { ESTADOS_USUARIO, rolRequiereFinca, ROLES } from '../../lib/roles.js';
import { correoSchema, passwordSchema } from '../auth/auth.schemas.js';

export const MENSAJE_REQUIERE_FINCA = 'Asigna al menos una finca a este usuario';

const nombreSchema = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(120, 'El nombre no puede superar 120 caracteres');

const rolSchema = z.enum(ROLES, { error: 'Selecciona un rol válido' });
const fincaIdsSchema = z.array(z.uuid('Finca inválida')).max(200);

export const usuarioCreateSchema = z
  .object({
    nombre: nombreSchema,
    correo: correoSchema,
    password: passwordSchema,
    rol: rolSchema,
    fincaIds: fincaIdsSchema.default([]),
  })
  .refine((u) => !rolRequiereFinca(u.rol) || u.fincaIds.length > 0, {
    path: ['fincaIds'],
    message: MENSAJE_REQUIERE_FINCA,
  });

export const usuarioUpdateSchema = z
  .object({
    nombre: nombreSchema,
    correo: correoSchema,
    password: passwordSchema,
    rol: rolSchema,
    fincaIds: fincaIdsSchema,
  })
  .partial();

export const usuarioEstadoSchema = z.object({
  estado: z.enum(ESTADOS_USUARIO, { error: 'Estado inválido' }),
});

export const usuariosQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  rol: z.enum(ROLES).optional(),
  estado: z.enum(ESTADOS_USUARIO).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
