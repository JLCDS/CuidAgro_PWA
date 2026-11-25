import { sendNotification, setVapidDetails } from 'web-push';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { hoyBogota } from './registros.js';
import { ROLES, tienePermiso } from './roles.js';
import { estadoVencimiento } from './serializers.js';

// Notificaciones push (HU021). Todo el envío es "dispara y olvida": se llama DESPUÉS de confirmar
// la transacción y un fallo aquí nunca cambia la respuesta de la API.

/** Push solo funciona si hay par de claves VAPID. Sin ellas, nada se envía y nada falla. */
export const pushHabilitado = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

let vapidConfigurado = false;

/** Enviador real: envía una carga (texto JSON) a una suscripción con web-push. */
async function enviadorWebPush(suscripcion, carga) {
  if (!vapidConfigurado) {
    setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidConfigurado = true;
  }
  await sendNotification(suscripcion, carga, { TTL: 60 * 60 * 24 });
}

let enviador = enviadorWebPush;

/** Sustituye la función de envío (las pruebas lo usan para no llamar a un servicio real). Sin argumento, restaura la real. */
export function configurarEnviador(fn) {
  enviador = fn ?? enviadorWebPush;
}

// --- Seguimiento de envíos pendientes (para esperarlos de forma determinista en pruebas) ---

const pendientes = new Set();

function lanzar(tarea) {
  const promesa = Promise.resolve()
    .then(tarea)
    .catch((error) => {
      if (env.NODE_ENV !== 'test') console.error('Error al enviar notificaciones push:', error);
    })
    .finally(() => pendientes.delete(promesa));
  pendientes.add(promesa);
  return promesa;
}

/** Espera a que terminen los envíos lanzados hasta ahora (y los que ellos lancen). */
export async function esperarEnvios() {
  while (pendientes.size > 0) await Promise.allSettled([...pendientes]);
}

// --- Núcleo: destinatarios, deduplicación y envío ---

/** Usuarios activos con acceso a la finca y rol con el permiso, con sus suscripciones. */
async function destinatarios({ fincaId, permiso, excluirUsuarioId }) {
  const roles = ROLES.filter((rol) => tienePermiso(rol, permiso));
  return prisma.usuario.findMany({
    where: {
      estado: 'ACTIVO',
      ...(excluirUsuarioId ? { id: { not: excluirUsuarioId } } : {}),
      rol: { nombre: { in: roles } },
      OR: [{ rol: { nombre: 'ADMINISTRADOR' } }, { fincas: { some: { fincaId } } }],
      suscripcionesPush: { some: {} },
    },
    select: { id: true, suscripcionesPush: { select: { id: true, endpoint: true, p256dh: true, auth: true } } },
  });
}

/** Reserva la clave; devuelve false si el aviso ya se había enviado (o lo reservó otro proceso). */
async function reservarAviso(clave) {
  const { count } = await prisma.avisoEnviado.createMany({ data: [{ clave }], skipDuplicates: true });
  return count === 1;
}

async function enviarA(suscripcion, carga) {
  try {
    await enviador({ endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } }, carga);
  } catch (error) {
    // El servicio de push ya no reconoce la suscripción: se borra.
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await prisma.suscripcionPush.deleteMany({ where: { endpoint: suscripcion.endpoint } });
    } else if (env.NODE_ENV !== 'test') {
      console.error('Falló un envío push:', error?.message ?? error);
    }
  }
}

async function notificar({ fincaId, permiso, excluirUsuarioId, clave, aviso }) {
  if (!pushHabilitado()) return;
  const usuarios = await destinatarios({ fincaId, permiso, excluirUsuarioId });
  if (usuarios.length === 0) return;
  if (!(await reservarAviso(clave))) return;
  const carga = JSON.stringify({ ...aviso, etiqueta: aviso.etiqueta ?? clave });
  await Promise.allSettled(usuarios.flatMap((u) => u.suscripcionesPush.map((s) => enviarA(s, carga))));
}

// --- Eventos (cada uno es "dispara y olvida": devuelve sin esperar el envío) ---

/** Novedad de prioridad ALTA recién creada. `novedad` es la fila con `vacuno`/`lote` incluidos. */
export function avisarNovedadAlta(novedad, autorId) {
  if (novedad.prioridad !== 'ALTA') return;
  lanzar(() =>
    notificar({
      fincaId: novedad.fincaId,
      permiso: 'novedades:gestionar',
      excluirUsuarioId: autorId,
      clave: `novedad-alta:${novedad.id}`,
      aviso: {
        titulo: 'Novedad urgente',
        cuerpo: `${novedad.tipo.toLowerCase()} en ${novedad.vacuno?.nombre ?? novedad.lote?.nombre ?? 'la finca'}`,
        url: `/novedades`,
      },
    }),
  );
}

/** Un alimento cuyo stock bajó: avisa si cruzó el mínimo (antes estaba por encima, ahora no). Una vez por día. */
export function avisarStockAlimento({ alimento, stockAntes, autorId }) {
  const bajo = alimento.stockGramos <= alimento.stockMinimoGramos;
  if (!bajo || stockAntes <= alimento.stockMinimoGramos) return;
  lanzar(() =>
    notificar({
      fincaId: alimento.fincaId,
      permiso: 'alimentos:gestionar',
      excluirUsuarioId: autorId,
      clave: `alimento-stock:${alimento.id}:${hoyBogota()}`,
      aviso: { titulo: 'Alimento con stock bajo', cuerpo: `${alimento.nombre}: queda poco en inventario`, url: '/alimentos' },
    }),
  );
}

/** Igual que el de alimentos, para medicamentos (stock decimal). */
export function avisarStockMedicamento({ medicamento, stockAntes, autorId }) {
  const bajo = Number(medicamento.stock) <= Number(medicamento.stockMinimo);
  if (!bajo || Number(stockAntes) <= Number(medicamento.stockMinimo)) return;
  lanzar(() =>
    notificar({
      fincaId: medicamento.fincaId,
      permiso: 'medicamentos:gestionar',
      excluirUsuarioId: autorId,
      clave: `medicamento-stock:${medicamento.id}:${hoyBogota()}`,
      aviso: { titulo: 'Medicamento con stock bajo', cuerpo: `${medicamento.nombre}: queda poco en inventario`, url: '/medicamentos' },
    }),
  );
}

/**
 * Revisa los medicamentos activos por vencer (≤ 30 días) o vencidos y avisa una sola vez por
 * medicamento, estado y fecha de vencimiento. Se llama al arrancar y cada 6 horas.
 */
export async function revisarVencimientos() {
  if (!pushHabilitado()) return;
  const hoy = hoyBogota();
  const medicamentos = await prisma.medicamento.findMany({
    where: { estado: 'ACTIVO', fechaVencimiento: { not: null } },
    select: { id: true, nombre: true, fincaId: true, fechaVencimiento: true },
  });
  for (const m of medicamentos) {
    const { vencido, porVencer } = estadoVencimiento(m.fechaVencimiento, hoy);
    if (!vencido && !porVencer) continue;
    const estado = vencido ? 'vencido' : 'porVencer';
    const fecha = m.fechaVencimiento.toISOString().slice(0, 10);
    await lanzar(() =>
      notificar({
        fincaId: m.fincaId,
        permiso: 'medicamentos:gestionar',
        clave: `medicamento-vence:${m.id}:${estado}:${fecha}`,
        aviso: {
          titulo: vencido ? 'Medicamento vencido' : 'Medicamento por vencer',
          cuerpo: `${m.nombre} ${vencido ? 'venció' : 'vence'} el ${fecha}`,
          url: '/medicamentos',
        },
      }),
    );
  }
}

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

/** Programa la revisión periódica. No se llama con NODE_ENV=test. */
export function programarRevisionVencimientos() {
  if (env.NODE_ENV === 'test') return;
  const revisar = () => revisarVencimientos().catch((error) => console.error('Error al revisar vencimientos:', error));
  revisar();
  setInterval(revisar, SEIS_HORAS_MS).unref();
}
