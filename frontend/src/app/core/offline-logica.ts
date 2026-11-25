/**
 * Lógica pura (sin Angular ni navegador) del uso sin conexión: formato de la cola,
 * qué hacer con cada respuesta de sincronización y utilidades de push.
 *
 * FORMATO DE LA COLA (IndexedDB, base `cuidagro`, almacén `pendientes`, clave `clienteId`).
 * Es el mismo que lee y escribe `public/sw.js`; si se cambia aquí hay que cambiarlo allá.
 */
export type TipoPendiente = 'consumo-vacuno' | 'consumo-lote' | 'novedad';
export type EstadoPendiente = 'pendiente' | 'enviando' | 'error';

export interface ElementoCola {
  clienteId: string;
  usuarioId: string;
  tipo: TipoPendiente;
  /** Cuerpo exacto del POST (incluye `clienteId`). */
  datos: Record<string, string | number>;
  /** Solo novedades: se envía como multipart. */
  foto?: Blob;
  creadoEn: string;
  estado: EstadoPendiente;
  intentos: number;
  error?: string;
  /** Solo para mostrar en /pendientes (el SW no lo necesita). */
  resumen?: { sujeto: string; detalle: string };
}

export const RUTAS_ENVIO: Record<TipoPendiente, string> = {
  'consumo-vacuno': '/api/consumos/vacunos',
  'consumo-lote': '/api/consumos/lotes',
  novedad: '/api/novedades',
};

export const ETIQUETAS_TIPO: Record<TipoPendiente, string> = {
  'consumo-vacuno': 'Consumo de vacuno',
  'consumo-lote': 'Consumo de lote',
  novedad: 'Novedad',
};

/** Identificador generado en el cliente: hace idempotente el reenvío. */
export function nuevoClienteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Contextos sin randomUUID (HTTP en red local): uuid v4 con getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface NuevoPendiente {
  clienteId: string;
  usuarioId: string;
  tipo: TipoPendiente;
  datos: Record<string, string | number | undefined | null>;
  foto?: Blob | null;
  resumen?: { sujeto: string; detalle: string };
  ahora?: Date;
}

/** Forma el elemento de la cola: quita campos vacíos y garantiza `clienteId` en el cuerpo. */
export function formarElemento(n: NuevoPendiente): ElementoCola {
  const datos: Record<string, string | number> = {};
  for (const [clave, valor] of Object.entries(n.datos)) {
    if (valor !== undefined && valor !== null) datos[clave] = valor;
  }
  datos['clienteId'] = n.clienteId;
  return {
    clienteId: n.clienteId,
    usuarioId: n.usuarioId,
    tipo: n.tipo,
    datos,
    ...(n.foto ? { foto: n.foto } : {}),
    creadoEn: (n.ahora ?? new Date()).toISOString(),
    estado: 'pendiente',
    intentos: 0,
    ...(n.resumen ? { resumen: n.resumen } : {}),
  };
}

/** Qué hacer con el elemento según la respuesta del servidor. */
export type DecisionEnvio =
  | { accion: 'borrar' }
  | { accion: 'error' } // queda en la cola con el mensaje, sin reintentos automáticos
  | { accion: 'detener' }; // sigue pendiente y se corta la ronda (sin red, 401, 5xx...)

/** Reglas del contrato: 200/201 se borra; 400/403/404/409 es error definitivo; lo demás se reintenta después. */
export function decidirRespuesta(status: number): DecisionEnvio {
  if (status === 200 || status === 201) return { accion: 'borrar' };
  if ([400, 403, 404, 409].includes(status)) return { accion: 'error' };
  return { accion: 'detener' };
}

/** Los elementos que se envían: del usuario actual, no marcados como error, del más viejo al más nuevo. */
export function elementosPorEnviar(todos: ElementoCola[], usuarioId: string): ElementoCola[] {
  return todos
    .filter((e) => e.usuarioId === usuarioId && e.estado !== 'error')
    .sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0));
}

/** URL y campos del POST para un elemento (multipart si tiene foto). */
export function peticionDe(e: ElementoCola): { url: string; campos: Record<string, string | number>; foto?: Blob } {
  return { url: RUTAS_ENVIO[e.tipo], campos: e.datos, ...(e.foto ? { foto: e.foto } : {}) };
}

/** Lo que muestra la lista de pendientes en lugar de ids: usa el resumen guardado. */
export function sujetoDe(e: ElementoCola): string {
  return e.resumen?.sujeto ?? 'Sin nombre';
}

/** Convierte la clave pública VAPID (base64url) en los bytes que pide `pushManager.subscribe`. */
export function claveVapidABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
