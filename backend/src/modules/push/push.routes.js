import { Router } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { pushHabilitado } from '../../lib/push.js';
import { requireAuth } from '../../middleware/auth.js';
import { borrarSuscripcionSchema, suscripcionSchema } from './push.schemas.js';

export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.get('/clave-publica', (_req, res) => {
  const habilitado = pushHabilitado();
  res.json({ habilitado, clavePublica: habilitado ? env.VAPID_PUBLIC_KEY : null });
});

pushRouter.post('/suscripciones', async (req, res) => {
  const { endpoint, keys } = suscripcionSchema.parse(req.body);
  if (!pushHabilitado()) throw new AppError(409, 'PUSH_DESHABILITADO', 'Las notificaciones push no están habilitadas en el servidor');
  // Un navegador que cambia de cuenta conserva el endpoint: la suscripción pasa al usuario actual.
  const datos = { usuarioId: req.actor.id, p256dh: keys.p256dh, auth: keys.auth };
  const suscripcion = await prisma.suscripcionPush.upsert({
    where: { endpoint },
    update: datos,
    create: { endpoint, ...datos },
  });
  res.status(201).json({ id: suscripcion.id, endpoint: suscripcion.endpoint });
});

pushRouter.delete('/suscripciones', async (req, res) => {
  const { endpoint } = borrarSuscripcionSchema.parse(req.body ?? {});
  await prisma.suscripcionPush.deleteMany({ where: { endpoint, usuarioId: req.actor.id } });
  res.status(204).end();
});
