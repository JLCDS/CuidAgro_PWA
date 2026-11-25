import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const DIRECTORIO_BACKEND = fileURLToPath(new URL('../../', import.meta.url));

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TTL_SEGUNDOS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DIAS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default(''),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(10),
  // Notificaciones push (opcionales). Sin las dos claves VAPID el push queda deshabilitado.
  VAPID_PUBLIC_KEY: z.string().trim().optional(),
  VAPID_PRIVATE_KEY: z.string().trim().optional(),
  VAPID_SUBJECT: z.string().trim().min(1).default('mailto:admin@cuidagro.local'),
  // Fotos de novedades. Una ruta relativa se resuelve desde el directorio backend/.
  UPLOADS_DIR: z
    .string()
    .min(1)
    .default('uploads')
    .transform((ruta) => path.resolve(DIRECTORIO_BACKEND, ruta)),
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  console.error('Variables de entorno inválidas:', z.flattenError(resultado.error).fieldErrors);
  process.exit(1);
}

export const env = resultado.data;
mkdirSync(env.UPLOADS_DIR, { recursive: true });
