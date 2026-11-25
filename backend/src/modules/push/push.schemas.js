import { z } from 'zod';

const texto = (mensaje) => z.string({ error: mensaje }).trim().min(1, mensaje).max(512, 'El valor es demasiado largo');

const endpoint = z
  .string({ error: 'El endpoint es obligatorio' })
  .trim()
  .max(2048, 'El endpoint es demasiado largo')
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'El endpoint debe ser una URL https');

export const suscripcionSchema = z.object({
  endpoint,
  keys: z.object(
    { p256dh: texto('La clave p256dh es obligatoria'), auth: texto('La clave auth es obligatoria') },
    { error: 'Las claves de la suscripción son obligatorias' },
  ),
});

export const borrarSuscripcionSchema = z.object({ endpoint: z.string({ error: 'El endpoint es obligatorio' }).trim().min(1, 'El endpoint es obligatorio').max(2048) });
