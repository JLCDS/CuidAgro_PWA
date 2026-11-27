# CuidAgro y los temas del curso Electiva III – Progressive Web Applications

Documento de apoyo para la sustentación. Relaciona cada sesión del curso con lo que hace CuidAgro, indica dónde está en el repositorio, cómo demostrarlo y qué falta por integrar. Las rutas son relativas a la raíz del repositorio. Las citas "(Sesión N, p. X)" apuntan a la página de las diapositivas o del taller.

## 1. Resumen

CuidAgro es una PWA para el cuidado de animales de granja (vacunos y lotes de aves): registro de animales, alimentación e inventario, novedades con foto y GPS, salud, medicamentos, reportes y notificaciones. Está desplegada con HTTPS en https://cuidagro.onrender.com. El frontend es Angular + TypeScript y el backend es Node/Express en JavaScript con PostgreSQL (Prisma); un solo servicio sirve la API en `/api` y el build de Angular en el mismo origen (`backend/src/app.js`, `servirFrontend`).

Del curso se aplican con código propio, sin librerías de PWA: un service worker escrito a mano (`frontend/public/sw.js`) con precaché, estrategias *cache-first* y *network-first*, Background Sync y push; un manifiesto instalable; una cola en IndexedDB para registrar consumos y novedades sin conexión, con reenvío idempotente; notificaciones push con VAPID; y una capa de seguridad (HTTPS, CSP con `helmet`, cookie `httpOnly`, validación con Zod, roles). Lo que más falta es lo que pide la Sesión 23: un informe de Lighthouse, la medición de Core Web Vitals y la prueba de instalación y push en dispositivos reales.

Estado global de la tabla maestra: 10 filas completas, 4 parciales (estrategias de caché, manifiesto, despliegue en dispositivos y seguridad) y 1 pendiente (mediciones de auditoría); el detalle está en la tabla maestra.

**Nota sobre las fuentes.** Los PDF de las sesiones 3, 9, 12, 13, el segundo PDF de la sesión 16 y el PDF sin número en el nombre (`Progressive Web Applications.pdf`) no tienen texto recuperable (fuentes sin mapa de caracteres). Por eso su contenido no se cita por página: los temas de esas sesiones se cubren con lo que enseñan las sesiones vecinas y los talleres legibles (4, 5, 7, 8, 10, 11, 14, 15, 16, 22 y 23), y las filas afectadas llevan la marca "no verificado contra el material". Conviene revisar esos PDF a mano antes de la sustentación.

## 2. Tabla maestra

| Tema (sesión) | Qué enseña el curso | Cómo lo usa CuidAgro | Dónde está | Estado |
|---|---|---|---|---|
| JavaScript (S2) | Variables `const`/`let`, funciones flecha, arrays funcionales, objetos, DOM, eventos, ES6+ (S2, pp. 8-42) | Todo el código usa ES moderno: módulos, `const`/`let`, flechas, desestructuración, `?.` y `??`, plantillas de texto. El backend es JavaScript puro (ESM) y el frontend TypeScript | `backend/src/**`, `frontend/src/app/core/offline-logica.ts`, `frontend/src/app/core/pwa.ts` (`this.auth.usuario()?.id ?? null`) | Completo |
| Conceptos fundamentales de PWA I (S3 y PDF sin número) | Qué es una PWA y sus características (instalable, fiable, rápida). Contenido no legible | La app cumple los tres rasgos: instalable (manifiesto), fiable sin red (SW + cola) y servida por HTTPS | `frontend/public/manifest.webmanifest`, `frontend/public/sw.js`, `render.yaml` | Completo (no verificado contra el material) |
| Eventos, Fetch API y Navigator (S4, pp. 4-17) | Eventos y propagación, `fetch` con promesas y `Response.ok`, `navigator.onLine` y `navigator.serviceWorker` | El SW usa `fetch` y `caches`; la app escucha `online`/`offline` y `beforeinstallprompt`, y lee `navigator.onLine`, `navigator.geolocation` y `navigator.serviceWorker` | `frontend/public/sw.js` (`fetch` en líneas 132-151), `frontend/src/app/core/conexion.ts`, `frontend/src/app/core/pwa.ts` (`iniciar`), `frontend/src/app/paginas/novedad-form.ts` (`buscarUbicacion`) | Completo |
| Service Worker: registro, ciclo de vida y eventos (S4, pp. 18-52) | Descarga, instalación, *waiting*, activación, idle; eventos `install`, `activate`, `fetch`, `push`, `sync`; `skipWaiting`, alcance | SW propio con `install` (precaché), `activate` (limpia cachés viejas y `clients.claim()`), `fetch`, `message`, `sync`, `push` y `notificationclick`. La versión nueva queda en espera hasta que el usuario pulsa "Actualizar" | `frontend/public/sw.js` (líneas 92-119, 235-242), `frontend/src/app/core/pwa.ts` (`registrar`, `actualizar`), `frontend/src/app/compartido/banda-estado.ts` | Completo |
| Promesas y async/await (S5 y S6) | Callbacks, estados, `then`/`catch`/`finally`, `Promise.all`, `allSettled`, `race`, `any`, `async`/`await` | `async`/`await` en SW y servicios; `Promise.race` para el límite de 6 s de la red; `Promise.all` en `activate`; `Promise.allSettled` en el envío de push; `finally` en `lanzar` | `frontend/public/sw.js` (`redPrimeroApi`, línea 190; `activate`), `backend/src/lib/push.js` (`notificar`, `lanzar`), `frontend/src/app/core/sincronizador.ts` | Completo |
| Cache Storage (S7, pp. 18-43) | API `caches`: `open`, `has`, `delete`, `match`, `put`, `addAll`, `keys`; guardar el *app shell* al instalar | Dos cachés: `cuidagro-shell-<versión>` (precaché) y `cuidagro-api` (respuestas GET). Se usan `open`, `addAll`, `match`, `put`, `keys` y `delete` | `frontend/public/sw.js` (líneas 28-39, 92-119, 159-226), `frontend/scripts/sw-precache.mjs` | Completo |
| Estrategias de caché (S8; S9 no legible) | Cache Only, cache con respaldo de red, network con respaldo de caché, cachés estático/dinámico/inmutable y **limitar la caché** (S8, pp. 5-41) | *Cache-first* para el shell, *network-first* para navegación y `GET /api/**` (con límite de 6 s y cabecera `X-Desde-Cache`); POST/PATCH/DELETE y `/api/auth/**` no se tocan. Falta limitar el tamaño de la caché de la API | `frontend/public/sw.js` (`cachePrimero`, `redPrimeroNavegacion`, `redPrimeroApi`), `docs/contexto-proyecto.md` (tabla de estrategias) | Parcial |
| Manifiesto (S10, pp. 22-35) | `name`, `start_url`, `icons`, `background_color`, `theme_color`, `display`, `orientation`, `screenshots`; `description` y `scope` para instalar (S11, p. 10) | Manifiesto con nombre, descripción, idioma, `start_url`, `scope`, `display: standalone`, colores e iconos 192, 512 y *maskable*, enlazado en `index.html` junto con `theme-color` y `apple-touch-icon`. Faltan `screenshots` y `orientation` | `frontend/public/manifest.webmanifest`, `frontend/src/index.html` (líneas 8-12), `frontend/public/icons/` | Parcial |
| Despliegue en dispositivos (S10 y S11) | Publicar con HTTPS (GitHub Pages, *Enforce HTTPS*), instalar en Android, investigar iOS (S11, pp. 6-13) | Desplegada en Render con HTTPS en https://cuidagro.onrender.com (no en GitHub Pages porque solo sirve estáticos y la cookie de sesión no viajaría). Botón "Instalar app" con `beforeinstallprompt`. La prueba de instalación en un Android real sigue pendiente | `render.yaml`, `docs/fases/fase-09-despliegue.md`, `frontend/src/app/layout/shell.ts` (línea 147), `frontend/src/app/core/pwa.ts` (`instalar`) | Parcial |
| IndexedDB y sincronización offline (S12-S15; S12 y S13 no legibles) | API con ruta de mensajes, `GET` con *network-first*, guardar pendientes en IndexedDB/PouchDB, base de datos real, reenvío al volver la conexión (S14, pp. 6-17; S15, pp. 1-2) | Cola en IndexedDB nativo (base `cuidagro`, almacén `pendientes`) con foto como `Blob`; cada registro lleva un `clienteId` y la API lo trata como idempotente; datos reales en PostgreSQL; página `/pendientes` para reintentar o descartar | `frontend/src/app/core/cola-offline.ts`, `frontend/src/app/core/sincronizador.ts`, `frontend/src/app/core/offline-logica.ts`, `frontend/src/app/paginas/pendientes.ts`, `backend/src/modules/consumos/`, `backend/src/modules/novedades/` | Completo |
| Background Sync (S4, pp. 23-24; S14, p. 16; S15, pp. 1-2) | Guardar la acción y ejecutarla cuando vuelve la conexión, aunque la app esté cerrada | La app registra la etiqueta `cuidagro-sync`; el SW responde al evento `sync`: avisa a las pestañas o, si no hay, renueva el token con la cookie y envía la cola. Donde no hay Background Sync se sincroniza al abrir, al evento `online` o con el botón | `frontend/src/app/core/sincronizador.ts` (`registrarSyncEnSegundoPlano`), `frontend/public/sw.js` (líneas 260-325) | Completo |
| Notificaciones push (S16) | Permiso (granted/denied/default), claves VAPID, suscripción, evento `push` en el SW, mejor momento para pedir permiso (S16, pp. 2-16) | `web-push` con VAPID; suscripción por usuario en la base; el SW muestra el aviso y al tocarlo abre la página. Avisos: novedad de prioridad alta, stock bajo y vencimientos | `frontend/src/app/core/notificaciones-push.ts`, `frontend/public/sw.js` (líneas 393-430), `backend/src/lib/push.js`, `backend/src/modules/push/push.routes.js` | Completo |
| Seguridad (S22) | Autenticación y RBAC, HTTPS/TLS, XSS/CSRF, validación y saneamiento, CSP, HTTPS obligatorio (S22, pp. 4-46) | HTTPS en Render; `helmet` con CSP y HSTS; cookie `httpOnly`/`Secure`/`SameSite=Strict`; JWT de 15 minutos solo en memoria; Zod en el servidor; roles y alcance por finca; límite de intentos de login. Faltan CSP estricta con nonce, modo de solo informe, 2FA y Permissions-Policy | `backend/src/app.js`, `backend/src/modules/auth/auth.routes.js`, `backend/src/lib/roles.js`, `backend/src/middleware/auth.js` | Parcial |
| Auditorías y Web Vitals (S23) | Lista de chequeo, Lighthouse, LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1, laboratorio vs campo, automatización (S23, pp. 4-40) | Hay evidencia funcional (pruebas automáticas y QA con navegador) pero ninguna medición de rendimiento: no hay informe de Lighthouse ni de Core Web Vitals | `backend/tests/`, `frontend/src/app/core/*.spec.ts`, `docs/fases/fase-08-pwa-offline.md` (sección de verificación) | Pendiente (mediciones) |
| Herramientas de los talleres (S6, S11, S14, S15) | GitHub Pages, PouchDB, jQuery Toast, `importScripts`, Express con `body-parser`, MongoDB | Se cubre el mismo objetivo con otras piezas: Render en lugar de GitHub Pages, IndexedDB nativo en lugar de PouchDB, bandas de estado en lugar de toasts, PostgreSQL en lugar de MongoDB | `render.yaml`, `frontend/src/app/compartido/banda-estado.ts`, `backend/prisma/` | Completo (equivalente propio) |

## 3. Detalle por tema

### 3.1 JavaScript (Sesión 2)

**Qué pide el material.** Usar `const` por defecto y `let` solo al reasignar, nunca `var` (S2, p. 9); comparar con `===` (p. 14); funciones flecha (p. 22); `map`/`filter`/`reduce` (p. 24); `??` y `?.` (pp. 18-20); desestructuración y *spread* (pp. 40-41); manipular el DOM y los eventos (pp. 30-34).

**Cómo está implementado.** El backend está en JavaScript ESM (`backend/src/app.js` importa con `import ... from`), y el frontend en TypeScript, que es JavaScript tipado. Ejemplos concretos: `?.` y `??` en `frontend/src/app/core/pwa.ts` (`this.auth.usuario()?.id ?? null`), desestructuración en `frontend/public/sw.js` (`for (const [clave, valor] of Object.entries(...))` en `construirCuerpo`), plantillas de texto en `frontend/src/app/core/offline-logica.ts` (`nuevoClienteId`), `filter`/`sort` en `frontend/src/app/core/cola-offline.ts` (`elementos`). El DOM no se manipula a mano porque Angular lo hace desde las plantillas; sí se usan APIs del navegador directamente: `document.createElement('canvas')` en `frontend/src/app/core/imagen.ts` y `window.addEventListener('online', ...)` en `pwa.ts`.

**Cómo demostrarlo.** Abrir `frontend/public/sw.js` y mostrar el uso de `async`/`await`, `const` y funciones flecha; abrir `frontend/src/app/core/imagen.ts` para ver la reducción de la foto con `canvas` (1600 px, JPEG calidad 0,8).

### 3.2 Conceptos fundamentales, Service Worker y ciclo de vida (Sesiones 3 y 4)

**Qué pide el material.** El SW es un proceso en segundo plano que actúa como proxy de red y escucha `fetch`, `push` y `sync` (S4, pp. 19-24). Ciclo de vida: descarga cada 24 horas aproximadamente (p. 26), instalación si el archivo cambió byte a byte (p. 27), *worker in waiting* hasta que no queden pestañas con la versión anterior (p. 28), activación para limpiar cachés viejas (p. 29), estado activado que controla el `scope` (p. 30) y estado ocioso/terminado (p. 31). El registro se hace con `navigator.serviceWorker.register` y admite `scope` (pp. 37-38). Una página recién cargada no queda controlada hasta recargar (p. 43); `respondWith` permite sustituir la respuesta (p. 44). La Sesión 3 (conceptos fundamentales, parte I) no es legible.

**Cómo está implementado.**
- Registro: `Pwa.registrar()` en `frontend/src/app/core/pwa.ts` llama a `navigator.serviceWorker.register('/sw.js')` solo en producción (`isDevMode()` en falso), para no servir código viejo con `ng serve`.
- `install` (`frontend/public/sw.js`, líneas 92-98): descarga todo el shell con `cache.addAll` y `cache: 'reload'`; si un archivo falla, falla la instalación y se conserva el SW anterior (el mismo comportamiento que muestra S7, pp. 42-43).
- *Waiting* (líneas 88-91): no se llama a `skipWaiting()` en la instalación. La app detecta el SW en espera (`updatefound` y `statechange` en `Pwa.registrar`), muestra "Hay una versión nueva de CuidAgro" con el botón "Actualizar" (`compartido/banda-estado.ts`) y recién ahí envía `SKIP_WAITING` (líneas 235-238); al cambiar el controlador recarga la página.
- `activate` (líneas 109-119): borra las cachés `cuidagro-shell-*` de versiones anteriores y llama a `clients.claim()` para controlar las pestañas abiertas.
- Versión: `frontend/scripts/sw-precache.mjs` se ejecuta tras `ng build` (`npm run build` en `frontend/package.json`), calcula un hash de todos los archivos y lo escribe en `VERSION` y en la lista `ARCHIVOS_PRECACHE` de `dist/frontend/browser/sw.js`. Así el SW cambia solo cuando cambia la app.
- Descarga cada 24 horas (S4, p. 26): el servidor responde `sw.js`, `index.html` y el manifiesto con `Cache-Control: no-cache` (`backend/src/app.js`, líneas 39-41), y la app llama a `registro.update()` al volver a la pestaña (`visibilitychange`).

**Cómo demostrarlo en la presentación.**
1. Abrir https://cuidagro.onrender.com (despertar el servicio un minuto antes: el plan gratuito se duerme) y DevTools > Application > Service workers: se ve `sw.js` "activated and is running" con el origen y el *scope* `/`.
2. Application > Cache storage: aparecen `cuidagro-shell-<hash>` y, tras navegar con sesión, `cuidagro-api`.
3. En Network, filtrar por `sw.js` y mostrar la cabecera `cache-control: no-cache`.
4. Para el ciclo de vida: con la app abierta, publicar o compilar una versión nueva y recargar; en Application > Service workers se ve el nuevo SW "waiting to activate" (S4, p. 41) y en la app la banda "Hay una versión nueva". Pulsar "Actualizar" y observar cómo pasa a activo.
5. Comparar con los registros de consola de S4 (p. 40): el SW no escribe en consola, pero el estado de "installing/waiting/activated" se ve en el panel.

### 3.3 Eventos, Fetch API y Navigator (Sesión 4)

**Qué pide el material.** Registrar eventos con `addEventListener` (S4, p. 7), `fetch` basado en promesas que no rechaza ante un 404 o 500, por lo que hay que revisar `response.ok` (pp. 10-12), `navigator.onLine` y `navigator.serviceWorker` (pp. 15-17).

**Cómo está implementado.** `frontend/public/sw.js` usa `fetch` y comprueba `respuesta.ok` antes de guardar en caché (líneas 164 y 195). `frontend/src/app/core/conexion.ts` expone `enLinea` (inicializado con `navigator.onLine` y actualizado por los eventos `online` y `offline`) y `desdeCache`. `frontend/src/app/core/auth.interceptor.ts` marca `desdeCache` cuando la respuesta trae `X-Desde-Cache: 1`. La ubicación usa `navigator.geolocation.getCurrentPosition` (`paginas/novedad-form.ts`, `buscarUbicacion`) y la cámara el atributo `capture="environment"` del `<input type="file">` (línea 117 del mismo archivo).

**Cómo demostrarlo.** DevTools > Network > "Offline": aparece la banda "Sin conexión. Puedes seguir registrando consumos y novedades." (`banda-estado.ts`). Volver a "No throttling": la banda desaparece sin recargar.

### 3.4 Promesas y async/await (Sesiones 5 y 6)

**Qué pide el material.** Una promesa tiene estados *pending*, *fulfilled* y *rejected* (S5, p. 14); `then` devuelve una promesa nueva y permite encadenar (pp. 23-25); los errores se propagan hasta el `catch` (p. 27) y `finally` corre siempre (p. 28); `Promise.all` espera a todas (pp. 31-32), `allSettled` nunca rechaza (pp. 33-34), `Promise.resolve`/`reject` crean promesas ya resueltas (pp. 35-38) y `async`/`await` hace el código asíncrono legible como síncrono (p. 39). El taller en clase añade `race` y `any` (S6 en clase, p. 2).

**Cómo está implementado.**
- `Promise.race` entre la red y un temporizador de 6 s para devolver la copia guardada en redes "con señal pero sin datos" (`sw.js`, `redPrimeroApi`, líneas 190-215).
- `Promise.all` para borrar varias cachés en `activate` (líneas 113-115).
- `Promise.allSettled` para enviar a todos los dispositivos sin que uno que falle detenga a los demás, y `.catch`/`.finally` en `lanzar` para que un fallo de push nunca cambie la respuesta de la API (`backend/src/lib/push.js`, `notificar`, `lanzar`).
- `async`/`await` con `try`/`catch` en toda la cola: `Sincronizador.sincronizar` y `enviar` (`frontend/src/app/core/sincronizador.ts`) y las funciones de IndexedDB envueltas en promesas (`pedir`, `escribir`, `abrirBd` en `sw.js`, líneas 354-382, y `cola-offline.ts`).
- No se usa `Promise.any`.

**Cómo demostrarlo.** Mostrar `redPrimeroApi` en `sw.js`. En DevTools > Network poner "Slow 3G" o bloquear `/api/vacunos`: tras 6 s la lista aparece desde la copia guardada con la banda amarilla "Datos guardados, pueden no estar al día".

### 3.5 Cache Storage y estrategias de caché (Sesiones 7, 8 y 9)

**Qué pide el material.** Responder con HTML en texto plano no sirve y un `fetch` a una página offline falla (S7, pp. 10-16), por eso se usa Cache Storage: `caches.open`, `has`, `delete`, `match`, `put`, `addAll` y `keys` (S7, pp. 25-39); guardar el *app shell* al instalar (pp. 40-43). Estrategias: *Cache Only* para el shell estático (S8, pp. 8-14), *cache with network fallback* (pp. 16-23), *network with cache fallback* para contenido dinámico (pp. 35-41); separar cachés estático, dinámico e inmutable (pp. 24-26) y **limitar** la caché dinámica (`limitarCache`, pp. 21 y 27-33); cambiar la versión de la caché al cambiar el shell (pp. 30-33). La Sesión 9 no es legible; no verificado si cubre otras estrategias (por ejemplo *stale-while-revalidate*).

**Cómo está implementado.**

| Recurso | Estrategia en `sw.js` | Equivalente en el curso |
|---|---|---|
| Archivos del shell (JS, CSS, imágenes, iconos) | Precaché en `install` + `cachePrimero` (línea 159) | Cache Only / cache con respaldo de red (S8, pp. 8 y 16) |
| Navegación a rutas de la SPA | `redPrimeroNavegacion` (línea 174), con respaldo a `/index.html` | Network con respaldo de caché (S8, p. 35) |
| `GET /api/**` | `redPrimeroApi` (línea 190): red primero, guarda cada 2xx, límite de 6 s y respaldo con `X-Desde-Cache` | Network con respaldo de caché (S8, pp. 35-38) |
| POST, PATCH, DELETE, otros orígenes y `/api/auth/**` | No se interceptan (líneas 136-140) | Para tokens y cookies nunca se guarda nada |

Diferencias con el curso: en lugar de tres cachés (estática, dinámica, inmutable) hay dos con otra separación: `cuidagro-shell-<versión>` y `cuidagro-api` (líneas 28-35), la segunda sin versión para sobrevivir a una actualización y borrada al cerrar sesión (`BORRAR_CACHE_API`, líneas 239-241, enviado desde `auth.ts`, `borrarCacheDeLaApi`). No hay caché de recursos de otros orígenes, así que no aparecen las respuestas *opaque* de S10 (p. 18). No existe una página `offline.html` dedicada como la de S7 (p. 14): sin red se sirve el `index.html` precacheado y Angular dibuja la ruta. **Falta** limitar la cantidad de entradas de `cuidagro-api` (S8, pp. 21 y 27): cada URL con filtros distintos crea una entrada nueva.

La precarga de catálogos (`frontend/src/app/core/precarga.ts`) consulta vacunos, lotes, alimentos y raciones al iniciar sesión, cambiar de finca y volver la señal, con los mismos parámetros que usan los formularios (la caché se indexa por URL completa).

**Cómo demostrarlo.**
1. Application > Cache storage > `cuidagro-shell-<hash>`: mostrar los ~50 archivos precacheados y `cuidagro-api` con las respuestas de `/api/...`.
2. Iniciar sesión, visitar Vacunos y Alimentos; marcar "Offline" en Application > Service workers (o en Network) y recargar `/vacunos`: la app abre y muestra los datos guardados.
3. Eliminar un archivo del shell desde Cache storage (como en S8, p. 11) y recargar: se vuelve a descargar de la red al instalarse la versión siguiente.
4. En Network, columna "Size": las peticiones aparecen como "(ServiceWorker)" y las de `/api` traen la cabecera `x-desde-cache: 1` cuando se sirven offline.

### 3.6 Manifiesto (Sesión 10)

**Qué pide el material.** Un único manifiesto por aplicación, enlazado desde el HTML (S10, pp. 23 y 26); `start_url` distinto de `/` si el despliegue lo requiere (p. 27); `icons` con `src`, `sizes` y `type` (p. 28); `background_color` (p. 29), `theme_color` (p. 30), `display: standalone` y `orientation` (p. 31) y `screenshots` para la interfaz de instalación enriquecida (pp. 32-35). Para instalar en Android se pide `description` y `scope` (S11, p. 10).

**Cómo está implementado.** `frontend/public/manifest.webmanifest` define `name`, `short_name`, `description`, `lang: es`, `start_url: /`, `scope: /`, `display: standalone`, `background_color: #f7f3e9`, `theme_color: #24512f` y tres iconos (192, 512 y 512 *maskable*) en `frontend/public/icons/`. `frontend/src/index.html` lo enlaza (`<link rel="manifest">`, línea 11) y añade `theme-color` (línea 8), `apple-touch-icon` (línea 12; iOS no usa el manifiesto) y el favicon. Angular copia `public/` al build (`frontend/angular.json`, `assets`), y el servidor lo entrega con `no-cache` (`backend/src/app.js`, línea 40). **Faltan** `screenshots` (S10, pp. 32-35) y `orientation`; este último se dejó libre porque la app es responsive (decisión no documentada en las fases).

**Cómo demostrarlo.** DevTools > Application > Manifest: se ve el nombre, los colores, el `scope` y las tres imágenes (con la vista previa del icono *maskable*); en "Installability" no debe haber errores. En Chrome de escritorio aparece el icono de instalar en la barra de direcciones; en el menú de usuario de la app aparece "Instalar app" cuando el navegador dispara `beforeinstallprompt`.

### 3.7 Despliegue en dispositivos (Sesiones 10 y 11)

**Qué pide el material.** Publicar en un servidor con HTTPS (GitHub Pages con *Enforce HTTPS*, S11, pp. 6-8), comprobar el SW y las cachés desde las herramientas del navegador (p. 8), instalar en Android con "Agregar a la pantalla principal" (pp. 9-12) y, como investigación, instalar en iOS (p. 13).

**Cómo está implementado.** `render.yaml` define un servicio web y una base PostgreSQL gratuitos; el build compila Angular y la API sirve el resultado, por lo que el frontend y la API comparten origen (`docs/fases/fase-09-despliegue.md`). Se descartó GitHub Pages porque solo sirve estáticos y, con otro dominio, la cookie de sesión `SameSite=Strict` no viaja. HTTPS lo termina el proxy de Render; el servidor añade `Strict-Transport-Security` con `helmet` y `TRUST_PROXY=1` (`render.yaml`).

**Qué falta.** La prueba en un Android real (instalar, cámara, GPS, modo avión, push) figura como pendiente en `docs/fases/fase-09-despliegue.md` y `docs/contexto-proyecto.md`, y el taller de iOS no se ha hecho: solo existe `apple-touch-icon`.

**Cómo demostrarlo.** En Chrome de Android abrir https://cuidagro.onrender.com, menú > "Instalar app"; mostrar el icono en la lista de aplicaciones y abrirla en modo `standalone` (sin barra del navegador). En Safari de iOS, Compartir > "Añadir a pantalla de inicio". Capturar pantallas como pide S11 (p. 13) para tener evidencia.

### 3.8 IndexedDB y sincronización offline (Sesiones 12 a 15)

**Qué pide el material.** Una API con `GET` y `POST` (S14, pp. 6-10), servir los mensajes con *network with cache fallback* (S14, pp. 13-17), guardar el `POST` pendiente en IndexedDB cuando no hay red (S14, p. 16), una base de datos real (S15, p. 1), un almacén `mensajes-offline` que se vacía al sincronizar (S15, pp. 1-2), evitar duplicados al refrescar (S15, p. 2) y avisar de pérdida y recuperación de la conexión y del resultado de la sincronización (S15, p. 2). Las sesiones 12 y 13 no son legibles.

**Cómo está implementado.**
- **Qué se registra sin conexión:** los consumos de vacunos y lotes y las novedades con foto y GPS (los tratamientos quedaron fuera por decisión del equipo, `docs/fases/fase-08-pwa-offline.md`).
- **Cola:** `frontend/src/app/core/cola-offline.ts` usa IndexedDB nativo: base `cuidagro`, almacén `pendientes`, clave `clienteId`; guarda la foto como `Blob`. El formato está en `frontend/src/app/core/offline-logica.ts` y debe coincidir con `sw.js` (comentario en líneas 44-68).
- **Idempotencia:** el formulario genera un `clienteId` (uuid v4) en cada envío, en línea o no; la API tiene una columna `cliente_id` única en `consumos_vacunos`, `consumos_lotes` y `novedades`, y si el id ya existe responde 200 con el registro existente en vez de duplicar o volver a descontar stock (`backend/tests/offline.test.js`).
- **Respuestas:** `decidirRespuesta` (`offline-logica.ts`): 200 y 201 borran el elemento; 400, 403, 404 y 409 lo dejan en `error` visible en `/pendientes`; sin red, 401 o 5xx lo dejan pendiente y cortan la ronda para conservar el orden.
- **Disparadores:** al abrir la app y al iniciar sesión (`effect` en `pwa.ts`), al evento `online`, por mensaje del SW, por Background Sync y con "Sincronizar ahora".
- **Sesión sin conexión:** al abrir sin red se entra con el usuario guardado en `localStorage` (sin tokens) (`frontend/src/app/core/auth.ts`, `restaurar`); al volver la señal se renueva con la cookie.
- **Avisos al usuario:** banda "Sin conexión" y "Datos guardados, pueden no estar al día" (`banda-estado.ts`), mensaje "Guardado sin conexión" en los formularios y contador de pendientes en el menú. No se encontró un aviso explícito de "sincronización exitosa" equivalente al toast de S15 (p. 2): la evidencia es que el contador y `/pendientes` quedan vacíos (no verificado como mensaje).

**Cómo demostrarlo.**
1. Iniciar sesión como ayudante, abrir Alimentación, DevTools > Network > "Offline".
2. Registrar un consumo y una novedad con foto: aparece "Guardado sin conexión".
3. DevTools > Application > IndexedDB > `cuidagro` > `pendientes`: se ven los dos elementos con `clienteId`, `estado: pendiente` y el `Blob` de la foto. Abrir `/pendientes`.
4. Volver a "No throttling": la cola se envía sola; el almacén queda vacío y los registros aparecen en la lista. Repetir el envío no duplica (la API responde 200).

### 3.9 Background Sync (Sesiones 4, 14 y 15)

**Qué pide el material.** Guardar la acción cuando no hay conexión y ejecutarla cuando vuelve, incluso con la aplicación cerrada, porque el SW sigue vivo (S4, pp. 23-24); el taller la usa para enviar mensajes pendientes (S14, p. 16; S15, pp. 1-2). Funciona sobre todo en Chrome.

**Cómo está implementado.** Al encolar, `Sincronizador.registrarSyncEnSegundoPlano` (`frontend/src/app/core/sincronizador.ts`) llama a `registro.sync.register('cuidagro-sync')`. En `frontend/public/sw.js` (líneas 260-325), el evento `sync` avisa a las pestañas abiertas con `SINCRONIZAR` o, si no hay ninguna, `sincronizarDesdeSW` pide un token con `POST /api/auth/refresh`, lee la cola y envía con las mismas reglas de respuesta; si hay un fallo temporal lanza el error para que el navegador reintente. En Safari y Firefox, que no tienen Background Sync, quedan los otros cuatro disparadores.

**Cómo demostrarlo.** Con la app instalada en Android: activar modo avión, registrar un consumo, cerrar la app, desactivar el modo avión y reabrir: el registro ya está en el servidor. En escritorio: Application > Service workers > Sync, escribir `cuidagro-sync` y pulsar "Sync" con la pestaña cerrada o con la cola llena. La QA lo probó disparando el evento por CDP; no se ha probado el disparo espontáneo del navegador (`docs/fases/fase-08-pwa-offline.md`, "No probado").

### 3.10 Notificaciones push (Sesión 16)

**Qué pide el material.** Estados de permiso *granted*, *denied* y *default* (S16, p. 2); pedir permiso en el momento oportuno y explicando el beneficio (pp. 2-3); flujo con clave pública y privada, suscripción guardada en el servidor (pp. 4-5); claves VAPID (p. 10); `solicitarPermisoNotificaciones` y suscripción (pp. 11-13); mostrar la notificación (pp. 14-16).

**Cómo está implementado.**
- **Claves:** `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` por variable de entorno (`backend/src/config/env.js`, líneas 14-17); sin ellas el push se deshabilita sin romper nada. Se declaran con `sync: false` en `render.yaml` (se cargan en el panel, no en el repositorio).
- **Suscripción:** `GET /api/push/clave-publica`, `POST` y `DELETE /api/push/suscripciones`, todas exigen sesión (`backend/src/modules/push/push.routes.js`). Se guarda por `endpoint` único en la tabla `suscripciones_push`.
- **Cliente:** `frontend/src/app/core/notificaciones-push.ts` (`activar`) pide el permiso con `Notification.requestPermission()` solo cuando el usuario pulsa "Activar notificaciones" en el menú de usuario (`layout/shell.ts`, línea 156), no al cargar la página; maneja *denied* como estado `bloqueado`. La opción solo aparece para quienes gestionan novedades, alimentos o medicamentos.
- **Envío:** `backend/src/lib/push.js` usa `web-push`, envía después de confirmar la transacción, elimina la suscripción si el servicio responde 404 o 410, evita repetir avisos con la tabla `avisos_enviados` y no avisa al autor de la acción.
- **SW:** eventos `push` y `notificationclick` (`sw.js`, líneas 393-430); al tocar, enfoca la pestaña abierta y navega con el mensaje `IR_A`, o abre una ventana.
- GPS: la ubicación se solicita al abrir el formulario de novedad (`novedad-form.ts`, línea 244, dentro de la inicialización del formulario), es decir, en el contexto donde se usa, y nunca bloquea el guardado.

**Cómo demostrarlo.** Iniciar sesión como veterinario en un dispositivo, menú de usuario > "Activar notificaciones" y aceptar el permiso. En otro dispositivo, iniciar sesión como ayudante y registrar una novedad de prioridad alta: llega el aviso "Novedad urgente" y al tocarlo se abre `/novedades`. En DevTools > Application > Service workers se puede usar "Push" para simular el evento. Las claves VAPID están cargadas en Render: `GET /api/push/clave-publica` responde `habilitado: true` en https://cuidagro.onrender.com (verificado el 2026-11-26). Aún no se ha probado la recepción del aviso ni el clic en un dispositivo real.

### 3.11 Core Web Vitals y rendimiento (Sesión 23)

El detalle y la tabla de chequeo están en la sección 5. Resumen: la app aplica prácticas que ayudan a las métricas, pero no se ha medido nada. A favor de LCP y CLS: imágenes en WebP con `width` y `height` declarados y `loading="lazy"` (`frontend/src/app/paginas/alimentos.ts`, `inicio.ts`, `layout/shell.ts`), rutas con carga diferida (`loadComponent` en `frontend/src/app/app.routes.ts`), archivos con hash y `Cache-Control: max-age=31536000, immutable` (`backend/src/app.js`, línea 41), precaché del shell y presupuestos de tamaño del build (500 kB aviso y 1 MB error, `frontend/angular.json`). A favor de INP: Angular sin `zone.js` y estado con `signal`.

## 4. Seguridad (Sesión 22)

| Recomendación del material | Qué hace CuidAgro | Dónde | Estado |
|---|---|---|---|
| Autenticación con contraseñas seguras (S22, p. 4) | Mínimo de 8 y máximo de 128 caracteres, hash con `scrypt` (N=2^16, r=8, p=2) y sal aleatoria de 16 bytes; el login limita los intentos fallidos (ventana de 15 minutos) | `backend/src/modules/auth/auth.schemas.js`, `backend/src/lib/passwords.js`, `backend/src/modules/auth/auth.routes.js` (`rateLimit`) | Completo (la política no exige mayúsculas ni símbolos) |
| Autenticación de dos factores (p. 4) | No existe | — | Pendiente |
| Control de acceso basado en roles (RBAC) (p. 4) | Tres roles con permisos fijos; `requireAuth` consulta el usuario en cada petición (desactivarlo o cambiarle el rol surte efecto al instante); `requirePermiso` por ruta; alcance por finca (404 en registros ajenos); guards de ruta en el frontend, que solo mejoran la experiencia | `backend/src/lib/roles.js`, `backend/src/middleware/auth.js`, `frontend/src/app/core/auth.guards.ts` | Completo |
| HTTPS en todo el tráfico y certificado SSL/TLS (pp. 4 y 6) | Render termina TLS con certificado propio de `onrender.com`; la app responde `Strict-Transport-Security: max-age=31536000; includeSubDomains` (comprobado con `helmet` 8.3.0 y la configuración de `app.js`). La redirección de HTTP a HTTPS la hace Render, no el código (no hay redirección en `backend/src`) | `render.yaml`, `backend/src/app.js` (líneas 54-64) | Completo (la redirección es de la plataforma) |
| Probar las conexiones con regularidad, certificate pinning, protocolos y firewall actualizados (pp. 6-7) | Los gestiona la plataforma; no hay *pinning* ni pruebas periódicas propias | — | Pendiente (fuera del alcance en un servicio gestionado) |
| Contenido mixto y `upgrade-insecure-requests` (pp. 42-44) | La CSP de `helmet` incluye `upgrade-insecure-requests` por defecto; el SW ignora otros orígenes y no hay recursos externos propios salvo el enlace a OpenStreetMap | `backend/src/app.js`, `frontend/public/sw.js` (línea 139) | Completo |
| Protección contra XSS (p. 8) | Angular escapa las plantillas; no hay `innerHTML` ni `bypassSecurityTrust*` en `frontend/src/app` (búsqueda en el código); el CSV neutraliza fórmulas; las fotos se validan por firma binaria y se sirven con `X-Content-Type-Options: nosniff` | `frontend/src/app/**`, `backend/src/lib/fotos.js` (`FIRMAS`), `backend/src/modules/novedades/novedades.routes.js` (línea 72) | Completo |
| Protección contra CSRF (p. 8) | La cookie de renovación es `SameSite=Strict`, limitada a `/api/auth`; la API autoriza con cabecera `Authorization: Bearer`, que un sitio externo no puede enviar; no hay CORS (`CORS_ORIGIN` vacío) porque todo está en el mismo origen. No hay token CSRF propio | `backend/src/modules/auth/auth.routes.js` (líneas 9-16), `backend/src/config/env.js`, `backend/src/app.js` (líneas 66-67) | Completo |
| Validación del lado del cliente y del servidor (pp. 9-11) | Formularios validados en Angular, y **todas** las entradas validadas en el servidor con Zod 4.6.7 (`*.schemas.js` por módulo), con errores por campo; sin red solo se valida en el cliente y el servidor revalida al sincronizar | `backend/src/modules/*/*.schemas.js`, `backend/src/middleware/errorHandler.js` | Completo |
| Saneamiento e inyección SQL (pp. 5 y 12) | Prisma parametriza las consultas; las consultas crudas usan plantillas etiquetadas de `$queryRaw`, que parametrizan los valores | `backend/src/modules/reportes/reportes.service.js` (línea 146), `backend/src/lib/registros.js` (línea 137) | Completo |
| Cabecera `Content-Security-Policy` (pp. 14-16) | `helmet` envía `default-src 'self'; script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; font-src 'self' https: data:; style-src 'self' https: 'unsafe-inline'; img-src 'self' data: blob:; upgrade-insecure-requests` | `backend/src/app.js` (líneas 55-64) | Completo |
| CSP estricta con nonce o hash y `strict-dynamic` (pp. 24-37) | No se usa: `script-src 'self'` bloquea el JavaScript en línea (por eso `inlineCritical: false` en `frontend/angular.json`), pero `style-src` permite `'unsafe-inline'` y no hay nonce ni hash | `frontend/angular.json`, `backend/src/app.js` | Parcial |
| Evitar `unsafe-inline` y `unsafe-eval` en scripts (pp. 30-32) | `script-src` no los permite | `backend/src/app.js` | Completo |
| CSP en modo solo informe y `Reporting-Endpoints` (pp. 38-40) | No existe | — | Pendiente |
| Trusted Types (pp. 45-46) | No se usa | — | Pendiente |
| Otras cabeceras (S23, p. 10: `X-Frame-Options`) | `helmet` añade `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy`. No hay `Permissions-Policy` | `backend/src/app.js` | Parcial |
| Cookies con `Secure` y `HttpOnly` (S23, p. 10) | Cookie `cuidagro_rt`: `httpOnly`, `secure` solo con `NODE_ENV=production` (activo en Render), `sameSite: 'strict'`, `path: '/api/auth'`, rotación en cada renovación y detección de reutilización | `backend/src/modules/auth/auth.routes.js` (líneas 9-16), `render.yaml` (`NODE_ENV`) | Completo |
| Protección del almacenamiento local e IndexedDB (S23, p. 10) | El token de acceso (15 minutos) vive solo en memoria; en `localStorage` solo se guardan el usuario (sin tokens) y la finca activa; la cola de IndexedDB guarda los registros pendientes y la foto sin cifrar y se filtra por `usuarioId`. La caché de la API se borra al cerrar sesión | `frontend/src/app/core/auth.ts`, `frontend/src/app/core/finca-activa.ts`, `frontend/public/sw.js` (líneas 239-241) | Parcial (los pendientes no se cifran) |
| Alcance del service worker (S23, p. 10) | `scope: /` y el SW solo toca GET del mismo origen; excluye `/api/auth/**` y los métodos de escritura | `frontend/public/sw.js` (líneas 136-140) | Completo |
| Control de acceso a APIs privilegiadas (S23, p. 10) | Cámara por `<input capture>` y GPS por `getCurrentPosition` (el navegador pide permiso); las notificaciones se piden por acción del usuario. No hay cabecera `Permissions-Policy` que restrinja estas APIs | `frontend/src/app/paginas/novedad-form.ts`, `frontend/src/app/core/notificaciones-push.ts` | Parcial |
| Pruebas de penetración básicas (S23, p. 10) | No hay evidencia | — | Pendiente |

## 5. Auditorías (Sesión 23)

La lista sale de los objetivos y dimensiones de la Sesión 23 (pp. 6-10, 13-16 y 36-40). "Evidencia" es lo que ya existe en el repositorio o en los documentos de fase; cuando solo hay verificación manual o por QA se indica.

| Criterio de la lista de chequeo | Estado | Evidencia |
|---|---|---|
| Manifiesto válido, accesible y referenciado (S23, pp. 7 y 13) | Cumple por inspección; validación formal pendiente | `frontend/public/manifest.webmanifest`; la QA de la Fase 8 revisó manifiesto e iconos (109 de 109 comprobaciones por tamaño de pantalla, `docs/fases/fase-08-pwa-offline.md`). Sin informe de Lighthouse ni PWABuilder |
| Icono de tamaño adecuado y `start_url` que responde (p. 7) | Cumple | Iconos 192, 512 y *maskable*; `start_url: /` |
| Servido bajo el mismo origen y HTTPS (p. 7) | Cumple | https://cuidagro.onrender.com; la API sirve el build (`backend/src/app.js`) |
| Service worker registrado y funcional (p. 13) | Cumple | `frontend/public/sw.js`; QA: "service worker controlando la página" (`docs/fases/fase-09-despliegue.md`) |
| Comportamiento offline probado (pp. 6 y 13) | Cumple en navegador de escritorio; falta dispositivo | QA de la Fase 8: apertura sin red, registro sin red y sincronización sin duplicados (E2E con Playwright a 1280 y 375 px) |
| Instalabilidad en pantalla de inicio (pp. 6 y 16) | Parcial | Sin prueba de instalación real (`docs/fases/fase-08-pwa-offline.md`, "No probado"; Fase 9, pendiente Android) |
| Reconexión y recepción de push (p. 16) | Parcial | QA: sync del SW por CDP y push real con el servicio del navegador (FCM); clic en notificación sin probar |
| HTTPS, certificado válido, redirección y sin contenido mixto (p. 10) | Cumple (plataforma); sin herramienta externa | Render + HSTS + `upgrade-insecure-requests`; QA de la Fase 9: sin violaciones de CSP |
| Alcance del service worker (p. 10) | Cumple | `sw.js`, líneas 136-140 |
| Protección de IndexedDB y almacenamiento local (p. 10) | Parcial | Ver sección 4: token solo en memoria; pendientes sin cifrar |
| Cookies `Secure` y `HttpOnly` (p. 10) | Cumple | `backend/src/modules/auth/auth.routes.js` |
| Encabezados de seguridad (p. 10) | Cumple (revisión propia); sin análisis externo | `helmet` en `backend/src/app.js`; falta pasarlo por una herramienta de cabeceras |
| Autenticación y autorización en rutas críticas (p. 10) | Cumple | Pruebas de permisos por rol y alcance por finca en `backend/tests/` (suite de 604 pruebas al cierre de la Fase 10) |
| Pruebas de penetración básicas (p. 10) | Pendiente | Sin evidencia |
| Informe de Lighthouse (rendimiento, PWA, accesibilidad, buenas prácticas, SEO) (pp. 6, 9 y 35) | Pendiente | No hay informe en el repositorio ni en los documentos |
| LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 en el percentil 75 (pp. 23-24) | Pendiente | Sin mediciones. Prácticas que ayudan: imágenes WebP con tamaño declarado, carga diferida de rutas, sin `zone.js` |
| Datos de campo: CrUX, PageSpeed Insights, Search Console, RUM (pp. 30-34 y 37) | Pendiente | No medido. Con poco tráfico es probable que CrUX no tenga datos (S23, p. 32) |
| Pruebas de laboratorio frente a campo (p. 14) | Pendiente | Sin pruebas de laboratorio de rendimiento |
| Accesibilidad (p. 6) | Parcial | Buenas prácticas aplicadas sin auditoría: `lang="es"` (`frontend/src/index.html`), `:focus-visible` (`frontend/src/styles.css`, línea 63), etiquetas y `autocomplete` en el login, `aria-label` y `role` en 129 puntos de `frontend/src/app`, gráfico con `role="img"` y tabla equivalente (`docs/fases/fase-07-dashboard-reportes.md`), objetivos táctiles de 48 px (Fase 10). Sin axe ni Lighthouse de accesibilidad |
| SEO técnico (p. 6) | Parcial | `<title>` y `<meta name="description">` en `frontend/src/index.html`; título por ruta en `frontend/src/app/app.routes.ts`. No hay `robots.txt`, canonical ni datos estructurados (la app exige iniciar sesión, por lo que la indexación no es un objetivo) |
| Compatibilidad entre navegadores (p. 6) | Parcial | Solo Chromium; "No probado: Firefox, Safari (WebKit)" (`docs/contexto-proyecto.md`). Sin Background Sync en Safari y Firefox hay alternativa en código |
| Adaptación a distintas resoluciones (p. 6) | Cumple | QA a 1280 y 375 px sin scroll horizontal en todas las fases |
| Lista de chequeo documentada (p. 13) | Cumple | Este documento |
| Inspección manual y revisión experta (p. 15) | Parcial | Recorridos manuales en Chrome (Fase 2) y revisión de código crítico por fase; sin entrevistas a usuarios reales |
| Automatización de pruebas y regresión (p. 16) | Parcial | Backend: 604 pruebas en 19 archivos (Vitest + Supertest, PostgreSQL real); frontend: 54 pruebas (Vitest); E2E con Playwright ejecutados en cada QA, pero sus guiones no están en el repositorio y no hay integración continua (no existe `.github/`) |
| Lighthouse CI en cada despliegue (pp. 16 y 35) | Pendiente | Sin pipeline |
| Ciclo evaluar, depurar y supervisar (pp. 36-40) | Pendiente | Sin línea base ni monitoreo |

## 6. Lo que falta integrar

Priorizado según el peso en la sustentación y el esfuerzo.

| Prioridad | Tema | Qué falta | Cómo cerrarlo |
|---|---|---|---|
| Alta | Informe de Lighthouse y Core Web Vitals (S23) | No hay ninguna medición | Ejecutar Lighthouse (móvil y escritorio, modo "Navigation") sobre https://cuidagro.onrender.com con el servicio despierto y guardar los informes en `docs/`; medir LCP, INP y CLS en DevTools > Performance (vista de métricas en vivo) y en PageSpeed Insights; registrar la línea base y corregir lo que salga bajo los umbrales (2,5 s, 200 ms, 0,1) |
| Alta | Prueba en dispositivo real (S10, S11, S16) | Instalación en Android, cámara, GPS, modo avión con sincronización, clic en notificación y push desde Render; iOS no probado | Seguir el guion de `docs/fases/fase-09-despliegue.md`, tomar capturas como pide S11 (p. 13) y añadir el resultado a ese documento; probar "Añadir a pantalla de inicio" en un iPhone y documentar las limitaciones |
| Alta | Revisar las sesiones sin texto legible | Las sesiones 3, 9, 12, 13, el segundo PDF de la sesión 16 y el PDF sin número no se pudieron leer | Abrirlos y completar las filas marcadas "no verificado" (en especial estrategias de la Sesión 9 e IndexedDB de las 12 y 13) |
| Alta | Limitar la caché de la API (S8, pp. 21 y 27-33) | `cuidagro-api` crece sin tope | Añadir una función `limitarCache('cuidagro-api', 60)` en `sw.js`, llamada tras cada `cache.put` en `redPrimeroApi`, como en `limitarCache` de S8 (p. 21) |
| Media | Manifiesto completo (S10, pp. 31-35) | Faltan `screenshots` (móvil y escritorio) y, opcionalmente, `orientation`, `id` y `shortcuts` | Tomar capturas con "Capture screenshot" del modo dispositivo (S10, p. 33), guardarlas en `frontend/public/` y declararlas con `form_factor` `narrow` y `wide`; añadir `shortcuts` hacia Alimentación y Novedades |
| Media | Evidencia de auditoría de seguridad (S22, S23) | Sin análisis de cabeceras ni pruebas básicas de penetración | Pasar el sitio por una herramienta de cabeceras de seguridad y por un análisis automático (por ejemplo, ZAP en modo básico); documentar los hallazgos |
| Media | Permissions-Policy y CSP en modo solo informe (S22, pp. 38-40; S23, p. 10) | No hay `Permissions-Policy` ni informes de violaciones | Añadir `Permissions-Policy: geolocation=(self), camera=(self), microphone=()` en `backend/src/app.js` y publicar primero una `Content-Security-Policy-Report-Only` más estricta con un endpoint de `Reporting-Endpoints` |
| Media | Pruebas E2E y Lighthouse en integración continua (S23, p. 16) | Los guiones de Playwright no están en el repositorio y no hay pipeline | Mover los guiones a `frontend/e2e/`, crear `.github/workflows` que corra pruebas del backend, del frontend y el E2E, y añadir Lighthouse CI sobre el build |
| Media | Auditoría de accesibilidad (S23, p. 6) | Sin medición | Correr el apartado de accesibilidad de Lighthouse y axe sobre login, inicio, consumos y novedades; probar el recorrido solo con teclado y con un lector de pantalla |
| Media | Compatibilidad entre navegadores (S23, p. 6) | Solo se probó Chromium | Ejecutar el E2E en Firefox y WebKit y registrar diferencias (sin Background Sync, sin `beforeinstallprompt` en Safari) |
| Baja | Página offline dedicada (S7, p. 14) | Sin red se sirve `index.html` y las rutas que nunca se abrieron con red no muestran datos | Añadir `offline.html` precacheado y usarlo como último respaldo de navegación, o un estado vacío con explicación en los listados |
| Baja | Aviso de sincronización exitosa (S15, p. 2) | Solo hay contador y lista vacía, no un mensaje al terminar | Mostrar un aviso breve cuando `Sincronizador.enviados` aumente y otro cuando falle |
| Baja | CSP estricta con nonce o hash (S22, pp. 24-37) | `style-src 'unsafe-inline'` | Generar un nonce por respuesta, inyectarlo en `index.html` y en la directiva (Angular lo admite con `ngCspNonce`), y quitar `'unsafe-inline'` |
| Baja | Cifrado de pendientes y autenticación de dos factores (S22, p. 4; S23, p. 10) | Los pendientes de IndexedDB no se cifran; no hay 2FA | Documentar el riesgo (el dispositivo es de uso personal); si se aborda, cifrar con Web Crypto usando una clave derivada de la sesión y añadir TOTP al login |
| Baja | Monitoreo de campo (S23, pp. 36-40) | Sin RUM | Medir LCP, INP y CLS reales con la librería `web-vitals` y enviarlos a un endpoint propio |
| Baja | Trusted Types y *certificate pinning* (S22, pp. 7 y 45-46) | No aplicados | Trusted Types solo tiene sentido tras la CSP estricta; el *pinning* es de la plataforma y debe quedar documentado como no aplicable en Render |
