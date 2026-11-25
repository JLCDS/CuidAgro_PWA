/*
 * CuidAgro: Service Worker escrito a mano (JavaScript plano, sin librerías).
 *
 * Un Service Worker es un script que el navegador ejecuta aparte de la página
 * (no tiene acceso al DOM). Se coloca entre la app y la red: cada petición que
 * hace la página pasa primero por el evento `fetch` de este archivo, y aquí
 * decidimos si respondemos desde la caché, desde la red o con una mezcla.
 * Eso es lo que permite abrir la app sin conexión.
 *
 * Ciclo de vida (eventos de este archivo):
 *   install            -> se guarda el "shell" de la app en caché (precaché).
 *   activate           -> se borran las cachés de versiones anteriores.
 *   fetch              -> estrategias de caché (ver más abajo).
 *   message            -> órdenes que envía la app (SKIP_WAITING, BORRAR_CACHE_API).
 *   sync               -> Background Sync: enviar lo registrado sin conexión.
 *   push               -> mostrar una notificación enviada por el servidor.
 *   notificationclick  -> qué pasa al tocar la notificación.
 *
 * Las dos constantes de abajo (VERSION y ARCHIVOS_PRECACHE) las reemplaza
 * `scripts/sw-precache.mjs` después de `ng build`, porque los archivos
 * compilados llevan un hash en el nombre (main-ABC123.js) que solo se conoce
 * al terminar la compilación. En desarrollo conservan sus valores por defecto.
 */

const VERSION = /*VERSION_INICIO*/ 'dev' /*VERSION_FIN*/;
const ARCHIVOS_PRECACHE = /*PRECACHE_INICIO*/ ['/', '/index.html'] /*PRECACHE_FIN*/;

// Caché del shell (HTML, JS, CSS, iconos). Lleva la versión en el nombre: cada
// build crea una caché nueva y `activate` borra las viejas.
const CACHE_SHELL = 'cuidagro-shell-' + VERSION;
// Caché de las respuestas GET de la API. Su nombre NO lleva versión: los datos
// del usuario deben sobrevivir a una actualización de la app. Se borra al
// cerrar sesión (mensaje BORRAR_CACHE_API) porque los datos son de un usuario.
const CACHE_API = 'cuidagro-api';
const PREFIJO_SHELL = 'cuidagro-shell-';

// Si la red tarda más que esto y hay una copia guardada, se muestra la copia
// (conexión "lie-fi": hay señal pero no llegan datos).
const ESPERA_RED_MS = 6000;

/* ------------------------------------------------------------------ */
/* Formato de la cola de envíos sin conexión (IndexedDB)               */
/* ------------------------------------------------------------------ */
/*
 * IMPORTANTE: este formato debe ser IDÉNTICO al que escribe la app Angular en
 * `src/app/core/cola-offline.ts` (tipos en `src/app/core/offline-logica.ts`).
 * Si se cambia en uno, hay que cambiarlo en el otro.
 *
 *   Base IndexedDB:  'cuidagro'  (versión 1)
 *   Almacén:         'pendientes'  (keyPath: 'clienteId')
 *   Elemento: {
 *     clienteId: string (uuid; también es la clave y sirve de idempotencia),
 *     usuarioId: string,
 *     tipo: 'consumo-vacuno' | 'consumo-lote' | 'novedad',
 *     datos: objeto JSON con el cuerpo exacto del POST (incluye clienteId),
 *     foto?: Blob (solo novedades; se envía como multipart),
 *     creadoEn: string ISO,
 *     estado: 'pendiente' | 'enviando' | 'error',
 *     intentos: number,
 *     error?: string,
 *     resumen?: { sujeto: string, detalle: string }  (solo para mostrar en /pendientes)
 *   }
 *
 * Qué se hace con la respuesta de cada envío:
 *   200 / 201            -> se borra de la cola (201 creado, 200 ya existía: idempotencia).
 *   400/403/404/409      -> estado 'error' con el mensaje; no se reintenta solo.
 *   sin red, 401, 5xx... -> se deja pendiente y se reintenta más tarde.
 */
const BD_NOMBRE = 'cuidagro';
const BD_VERSION = 1;
const ALMACEN = 'pendientes';
const ETIQUETA_SYNC = 'cuidagro-sync';
const RUTAS_ENVIO = {
  'consumo-vacuno': '/api/consumos/vacunos',
  'consumo-lote': '/api/consumos/lotes',
  novedad: '/api/novedades',
};

/* ------------------------------------------------------------------ */
/* install: precaché del shell                                         */
/* ------------------------------------------------------------------ */
/*
 * Se ejecuta una sola vez por versión del archivo. Descargamos y guardamos
 * todos los archivos de la app para poder arrancarla sin red. `cache: 'reload'`
 * evita que el navegador nos entregue una copia vieja de su caché HTTP.
 * Si un archivo falla, la instalación falla y se conserva el SW anterior.
 *
 * No llamamos a skipWaiting(): el SW nuevo queda "en espera" hasta que la app
 * muestre "Hay una versión nueva" y el usuario pulse Actualizar (mensaje
 * SKIP_WAITING). Así nunca cambia el código a mitad de un formulario.
 */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(ARCHIVOS_PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

/* ------------------------------------------------------------------ */
/* activate: limpiar cachés viejas                                     */
/* ------------------------------------------------------------------ */
/*
 * Se ejecuta cuando esta versión pasa a ser la activa. Borramos las cachés del
 * shell de versiones anteriores (el prefijo las identifica; la caché de la API
 * no se toca). `clients.claim()` hace que las pestañas ya abiertas (por ejemplo
 * en la primera visita) pasen a ser controladas por este SW sin recargar.
 */
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres.filter((n) => n.startsWith(PREFIJO_SHELL) && n !== CACHE_SHELL).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* fetch: estrategias de caché                                         */
/* ------------------------------------------------------------------ */
/*
 * Resumen:
 *   - No GET (POST, PATCH, DELETE...) y otros orígenes: no se tocan.
 *   - /api/auth/**: no se tocan (tokens y cookies nunca se guardan).
 *   - GET /api/**: NETWORK-FIRST con respaldo en caché + cabecera X-Desde-Cache.
 *   - Navegación (abrir una URL de la SPA): NETWORK-FIRST con respaldo a index.html.
 *   - Estáticos (js, css, fuentes, imágenes, iconos): CACHE-FIRST.
 */
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Si no llamamos a respondWith(), el navegador hace la petición normal.
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/auth/')) return;

  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(redPrimeroApi(peticion));
    return;
  }
  if (peticion.mode === 'navigate') {
    evento.respondWith(redPrimeroNavegacion(peticion));
    return;
  }
  evento.respondWith(cachePrimero(peticion));
});

/*
 * CACHE-FIRST (estáticos). Primero se busca en caché; si está, se responde al
 * instante sin red. Si no, se pide a la red y se guarda la copia. Sirve para
 * archivos con hash en el nombre: su contenido nunca cambia, así que la copia
 * guardada siempre es válida.
 */
async function cachePrimero(peticion) {
  const cache = await caches.open(CACHE_SHELL);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) cache.put(peticion, respuesta.clone());
  return respuesta;
}

/*
 * NETWORK-FIRST para navegación. La app es una SPA: todas las rutas
 * (/vacunos, /pendientes...) sirven el mismo index.html. Se intenta la red para
 * tener siempre el HTML más reciente; si no hay red se responde con el
 * index.html precacheado, y Angular dibuja la ruta que corresponda.
 */
async function redPrimeroNavegacion(peticion) {
  try {
    return await fetch(peticion);
  } catch {
    const cache = await caches.open(CACHE_SHELL);
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
  }
}

/*
 * NETWORK-FIRST para GET /api/**. Los datos cambian, así que se prefiere la
 * red. Cada respuesta correcta se guarda; si la red falla (o tarda demasiado)
 * se entrega la última copia guardada, marcada con `X-Desde-Cache: 1` para que
 * la app avise "Datos guardados, pueden no estar al día". Sin copia, el error
 * de red llega a la app tal cual.
 */
async function redPrimeroApi(peticion) {
  const cache = await caches.open(CACHE_API);

  const red = fetch(peticion).then((respuesta) => {
    // Solo se guardan respuestas correctas: nunca un 401 ni un 500.
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  });
  // Si la petición pierde la carrera contra el temporizador y falla después,
  // el error ya está atendido aquí y no queda como "promesa rechazada sin capturar".
  red.catch(() => undefined);

  // Temporizador: si la red se demora y hay copia, gana la copia.
  const limite = new Promise((resolver) => setTimeout(() => resolver(null), ESPERA_RED_MS));

  try {
    const primera = await Promise.race([red, limite]);
    if (primera) return primera;
    const guardada = await cache.match(peticion, { ignoreVary: true });
    return guardada ? marcarDesdeCache(guardada) : await red;
  } catch {
    const guardada = await cache.match(peticion, { ignoreVary: true });
    if (guardada) return marcarDesdeCache(guardada);
    throw new TypeError('Sin conexión y sin copia guardada');
  }
}

/* Devuelve una copia de la respuesta con la cabecera X-Desde-Cache. */
async function marcarDesdeCache(respuesta) {
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set('X-Desde-Cache', '1');
  return new Response(await respuesta.blob(), {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras,
  });
}

/* ------------------------------------------------------------------ */
/* message: órdenes de la app                                          */
/* ------------------------------------------------------------------ */
/*
 *   SKIP_WAITING      La app pide activar ya la versión nueva (botón "Actualizar").
 *   BORRAR_CACHE_API  Al cerrar sesión: los datos guardados eran de ese usuario.
 */
self.addEventListener('message', (evento) => {
  const tipo = evento.data && evento.data.tipo;
  if (tipo === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (tipo === 'BORRAR_CACHE_API') {
    evento.waitUntil(caches.delete(CACHE_API));
  }
});

/* ------------------------------------------------------------------ */
/* sync: Background Sync                                               */
/* ------------------------------------------------------------------ */
/*
 * Cuando la app guarda algo en la cola sin conexión, registra la etiqueta
 * 'cuidagro-sync'. El navegador dispara este evento cuando vuelve la señal,
 * incluso con la app cerrada (donde esté disponible: Chrome/Edge/Android).
 *
 *   - Si hay una pestaña abierta, le avisamos y es la app quien sincroniza
 *     (ya tiene su sesión y sus mensajes de estado).
 *   - Si no hay ninguna, sincronizamos aquí: renovamos el token con
 *     POST /api/auth/refresh (el navegador manda la cookie httpOnly) y enviamos
 *     la cola leyendo la misma base IndexedDB.
 *
 * Si la promesa de waitUntil falla, el navegador reintenta el evento más tarde.
 */
self.addEventListener('sync', (evento) => {
  if (evento.tag !== ETIQUETA_SYNC) return;
  evento.waitUntil(manejarSync());
});

async function manejarSync() {
  const pestanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (pestanas.length > 0) {
    for (const p of pestanas) p.postMessage({ tipo: 'SINCRONIZAR' });
    return;
  }
  await sincronizarDesdeSW();
}

async function sincronizarDesdeSW() {
  // 1. Token nuevo. Si la sesión ya no vale (401), no hay nada que hacer: la
  //    cola espera a que el usuario abra la app. Un fallo de red lanza error
  //    y el navegador reintenta.
  const refresco = await fetch('/api/auth/refresh', { method: 'POST' });
  if (refresco.status === 401) return;
  if (!refresco.ok) throw new Error('No se pudo renovar la sesión');
  const sesion = await refresco.json();
  const token = sesion.accessToken;
  const usuarioId = sesion.usuario.id;

  // 2. Solo los elementos de este usuario, en orden de creación.
  const bd = await abrirBd();
  const todos = await pedir(bd.transaction(ALMACEN).objectStore(ALMACEN).getAll());
  const lista = todos
    .filter((e) => e.usuarioId === usuarioId && e.estado !== 'error')
    .sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : 1));

  // 3. De a uno. Ante un fallo temporal se detiene y se lanza el error para
  //    que el navegador reintente; el resto sigue pendiente.
  let fallo = null;
  for (const elemento of lista) {
    let respuesta;
    try {
      respuesta = await fetch(RUTAS_ENVIO[elemento.tipo], {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, ...(elemento.foto ? {} : { 'Content-Type': 'application/json' }) },
        body: construirCuerpo(elemento),
      });
    } catch (e) {
      fallo = e;
      break;
    }
    if (respuesta.status === 200 || respuesta.status === 201) {
      await escribir(bd, (almacen) => almacen.delete(elemento.clienteId));
    } else if ([400, 403, 404, 409].includes(respuesta.status)) {
      const mensaje = await mensajeDe(respuesta);
      await escribir(bd, (almacen) =>
        almacen.put({ ...elemento, estado: 'error', error: mensaje, intentos: (elemento.intentos || 0) + 1 }),
      );
    } else {
      fallo = new Error('Respuesta ' + respuesta.status);
      break;
    }
  }
  bd.close();

  // 4. Si alguna pestaña se abrió mientras tanto, que refresque su contador.
  const ahora = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const p of ahora) p.postMessage({ tipo: 'COLA_CAMBIO' });
  if (fallo) throw fallo;
}

/* Cuerpo del POST: JSON, o multipart si la novedad lleva foto. */
function construirCuerpo(elemento) {
  if (!elemento.foto) return JSON.stringify(elemento.datos);
  const cuerpo = new FormData();
  for (const [clave, valor] of Object.entries(elemento.datos)) {
    if (valor !== undefined && valor !== null) cuerpo.append(clave, String(valor));
  }
  cuerpo.append('foto', elemento.foto, 'foto.jpg');
  return cuerpo;
}

/* Mensaje de error de la API ({ error: { mensaje, detalles: [{ mensaje }] } }). */
async function mensajeDe(respuesta) {
  try {
    const cuerpo = await respuesta.json();
    const e = cuerpo && cuerpo.error;
    return (
      (e && e.detalles && e.detalles[0] && e.detalles[0].mensaje) ||
      (e && e.mensaje) ||
      'El servidor rechazó el registro.'
    );
  } catch {
    return 'El servidor rechazó el registro.';
  }
}

/* --- IndexedDB con promesas (la API nativa usa callbacks) --- */
function abrirBd() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD_NOMBRE, BD_VERSION);
    // Solo se ejecuta si la app aún no creó la base (mismo esquema que cola-offline.ts).
    peticion.onupgradeneeded = () => {
      if (!peticion.result.objectStoreNames.contains(ALMACEN)) {
        peticion.result.createObjectStore(ALMACEN, { keyPath: 'clienteId' });
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function pedir(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function escribir(bd, operacion) {
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(ALMACEN, 'readwrite');
    operacion(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
  });
}

/* ------------------------------------------------------------------ */
/* push: notificaciones                                                */
/* ------------------------------------------------------------------ */
/*
 * El servidor envía (web-push) un JSON { titulo, cuerpo, url, etiqueta }. Aquí
 * se muestra la notificación del sistema, incluso con la app cerrada. `tag`
 * hace que una notificación con la misma etiqueta reemplace a la anterior en
 * vez de apilarse.
 */
self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'CuidAgro', {
      body: datos.cuerpo || '',
      tag: datos.etiqueta || undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: datos.url || '/' },
    }),
  );
});

/*
 * Al tocar la notificación: si la app está abierta se enfoca esa pestaña y se
 * le pide ir a la ruta (mensaje IR_A); si no, se abre una ventana nueva.
 */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/';
  evento.waitUntil(
    (async () => {
      const pestanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (pestanas.length > 0) {
        const pestana = pestanas[0];
        await pestana.focus();
        pestana.postMessage({ tipo: 'IR_A', url: destino });
        return;
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
