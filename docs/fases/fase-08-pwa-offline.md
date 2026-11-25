# Fase 8. PWA, uso sin conexión y notificaciones

**Estado:** terminada, en revisión (2026-11-24).
**Historias:** HU020 y HU021.

| HU | Alcance |
|---|---|
| HU020 | App instalable y usable sin conexión: manifiesto, `sw.js` escrito a mano con estrategias de caché, sesión sin conexión, consulta de los últimos datos y registro sin conexión de **consumos** (vacuno y lote) y **novedades** (con foto y GPS), con sincronización posterior sin duplicados |
| HU021 | Notificaciones push (web-push con VAPID): novedades de prioridad alta y alertas de inventario (alimentos con stock bajo; medicamentos con stock bajo, por vencer o vencidos) |

> Decidido con el usuario (2026-11-24): `sw.js` a mano como en los talleres del curso (no `@angular/service-worker`); sin conexión se registran consumos y novedades, no tratamientos; push para novedades urgentes y alertas de inventario. Las HU020/HU021 exactas no están en el repo: el reparto es suposición del coordinador.

## Contrato (fuente común para desarrollo, pruebas y datos)

### Modelo de datos (migración `20261124000000_pwa_offline_push`)

- `consumos_vacunos`, `consumos_lotes` y `novedades`: columna nueva `cliente_id uuid NULL` con índice **único** (Prisma `clienteId String? @unique @map("cliente_id") @db.Uuid`).
- Tabla `suscripciones_push`: `id uuid`, `usuario_id` (FK a usuarios, `onDelete: Cascade`), `endpoint text UNIQUE`, `p256dh text`, `auth text`, `created_at`, `updated_at`.
- Tabla `avisos_enviados`: `id uuid`, `clave text UNIQUE`, `created_at`. Sirve para no repetir un aviso.
- Añadir las tablas nuevas al `TRUNCATE` de `backend/tests/setup.js`.

### Idempotencia de registros creados sin conexión

- `POST /api/consumos/vacunos`, `POST /api/consumos/lotes` y `POST /api/novedades` (JSON y multipart) aceptan `clienteId` opcional (uuid; si no es uuid, 400 en `clienteId`).
- Si ya existe un registro con ese `clienteId` **del mismo usuario**, no se crea otro ni se vuelve a descontar stock: responde **200** con el registro existente (la creación normal sigue siendo 201). Si el `clienteId` existe pero es de otro usuario: 409 `DUPLICADO` en `clienteId`.
- Una carrera entre dos envíos con el mismo `clienteId` (violación del índice único) se resuelve igual: el segundo devuelve 200 con el existente.
- El frontend **siempre** envía `clienteId` al crear consumos y novedades, con o sin conexión.
- `fechaHora` de la novedad: el frontend envía la hora en que se capturó (ya se acepta en la API). La fecha del consumo es la elegida en el formulario.

### Push (HU021)

Dependencia `web-push`. Variables de entorno opcionales `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (por defecto `mailto:admin@cuidagro.local`), documentadas en `backend/.env.example` con el comando para generarlas (`npx web-push generate-vapid-keys`). Sin claves, el push queda deshabilitado y nada falla.

| Ruta | Permiso | Comportamiento |
|---|---|---|
| `GET /api/push/clave-publica` | autenticado | `{ habilitado: boolean, clavePublica: string \| null }` |
| `POST /api/push/suscripciones` | autenticado | Cuerpo `{ endpoint (URL https), keys: { p256dh, auth } }`. Upsert por `endpoint` y se asigna al usuario actual. 201. Validación: 400 con el campo. Push deshabilitado: 409 `PUSH_DESHABILITADO` |
| `DELETE /api/push/suscripciones` | autenticado | Cuerpo `{ endpoint }`. Borra solo si es del usuario actual. 204 siempre (idempotente) |

Envío:
- Módulo `backend/src/lib/push.js` con una función de envío sustituible en pruebas (p. ej. `configurarEnviador(fn)`), para que vitest nunca llame a un servicio real.
- Los envíos son "dispara y olvida" **después** de confirmar la transacción: un fallo de push nunca cambia la respuesta de la API. Si el servicio de push responde 404 o 410, se borra la suscripción.
- Carga útil JSON: `{ titulo, cuerpo, url, etiqueta }`, sin datos sensibles más allá del nombre del animal o insumo.
- Destinatarios: usuarios **activos** con acceso a la finca (el administrador tiene acceso a todas) cuyo rol tenga el permiso indicado. El autor de la acción no recibe su propio aviso.

| Evento | Permiso del destinatario | Clave en `avisos_enviados` | Disparo |
|---|---|---|---|
| Se crea una novedad con prioridad `ALTA` (también al sincronizarla) | `novedades:gestionar` | `novedad-alta:<id>` | Al crear |
| Un alimento pasa a stock ≤ mínimo | `alimentos:gestionar` | `alimento-stock:<id>:<YYYY-MM-DD Bogotá>` | Tras crear o editar un consumo |
| Un medicamento pasa a stock bajo | `medicamentos:gestionar` | `medicamento-stock:<id>:<YYYY-MM-DD Bogotá>` | Tras crear o editar un tratamiento |
| Un medicamento activo está por vencer (≤ 30 días) o vencido | `medicamentos:gestionar` | `medicamento-vence:<id>:<porVencer\|vencido>:<fechaVencimiento>` | Revisión periódica |

- La revisión periódica es una función exportada (`revisarVencimientos()`), llamada al arrancar el servidor y cada 6 horas. **No** se programa con `NODE_ENV=test`; las pruebas la llaman directamente.
- Un aviso de stock va como mucho una vez por insumo y día.

### Frontend: PWA (HU020)

- **Manifiesto** `public/manifest.webmanifest`: `name` "CuidAgro", `short_name`, `lang: es`, `start_url: /`, `scope: /`, `display: standalone`, colores del tema e iconos PNG 192 y 512 (más uno `maskable`) generados a partir de `public/icono.svg`. Enlazado en `index.html` junto con `theme-color` y `apple-touch-icon`.
- **`public/sw.js` escrito a mano, en JavaScript plano**, con comentarios que expliquen cada estrategia (es material de sustentación):
  - Precaché del shell de la app al instalar. Los nombres con hash los inyecta un script posterior al build, `frontend/scripts/sw-precache.mjs`, que reemplaza la lista y la versión de la caché en `dist/.../sw.js`. `npm run build` lo ejecuta (`ng build && node scripts/sw-precache.mjs`).
  - Navegación: *network-first* con respaldo al `index.html` en caché (SPA).
  - Estáticos (js, css, fuentes, iconos): *cache-first*.
  - `GET /api/**` (salvo `/api/auth/**`): *network-first* con respaldo en caché, y la cabecera `X-Desde-Cache: 1` en la respuesta servida desde caché, para que la interfaz avise de que los datos pueden no estar al día.
  - Peticiones que no son GET: pasan sin tocar.
  - `activate` borra las cachés de versiones anteriores. El SW nuevo espera hasta que la app le pida `SKIP_WAITING`.
  - Al cerrar sesión, la app pide al SW borrar la caché de la API (los datos son de un usuario).
  - `sync` (Background Sync, etiqueta `cuidagro-sync`): avisa a las pestañas abiertas para que sincronicen. Si no hay ninguna, el SW sincroniza por su cuenta (obtiene un token con `POST /api/auth/refresh`, que manda la cookie).
  - `push`: `showNotification` con la carga útil. `notificationclick`: enfoca una pestaña abierta o abre `url`.
- El SW se registra solo en el build de producción (no con `ng serve`, para no servir código viejo mientras se desarrolla). Para probarlo: `npm run build` y `npm run preview` (nuevo script `frontend/scripts/servir-dist.mjs`: estático con respaldo a `index.html` y proxy de `/api` a `:3000`, puerto configurable).
- **Sesión sin conexión:** al iniciar o renovar la sesión se guarda el usuario (sin tokens) en el navegador. Si `restaurar()` falla por red (status 0), la app entra con ese usuario en modo sin conexión. Al volver la señal se renueva la sesión; un 401 la cierra. El logout borra el usuario guardado y la caché de la API.
- **Cola de envíos** en IndexedDB (base `cuidagro`, almacén `pendientes`), servicio `core/cola-offline.ts`:
  - Cada elemento: `{ clienteId, usuarioId, tipo: 'consumo-vacuno'|'consumo-lote'|'novedad', datos, foto?: Blob, creadoEn, estado: 'pendiente'|'enviando'|'error', intentos, error? }`.
  - Los formularios de consumo y de novedad: si no hay conexión o la petición falla por red, guardan en la cola y avisan "Guardado sin conexión. Se enviará cuando vuelva la señal." Sin red no se puede validar contra el servidor; solo se valida en el cliente.
  - Se sincroniza al volver la conexión (`online`), al abrir la app, por Background Sync donde exista y con el botón "Sincronizar ahora". Se envía en orden, de a uno. Respuesta 200/201: se borra de la cola. Error de red: sigue pendiente. 401: se renueva la sesión y se reintenta. 400/403/404/409: queda en `error` con el mensaje, sin reintentos automáticos.
  - Solo se sincronizan los elementos del usuario actual. Si al cerrar sesión hay pendientes, se avisa antes de salir.
- **Página `/pendientes`** (visible para quien registra consumos o novedades): lista con tipo, sujeto, fecha, estado y error, y botones "Reintentar" y "Descartar" (con confirmación). En el menú, un contador de pendientes.
- **Indicadores:** banda "Sin conexión" cuando `navigator.onLine` es falso; aviso "Datos guardados, pueden no estar al día" si la respuesta llegó con `X-Desde-Cache`; banda "Hay una versión nueva" con botón "Actualizar"; botón "Instalar app" con `beforeinstallprompt` cuando el navegador lo ofrece.
- **Datos para trabajar sin conexión:** al iniciar sesión, al cambiar de finca y al volver la señal, la app consulta los catálogos que usan los formularios (vacunos y lotes activos y alimentos activos de la finca activa) para que queden en la caché del SW.
- **Notificaciones (HU021):** para quien tenga `novedades:gestionar`, `alimentos:gestionar` o `medicamentos:gestionar`, opción "Activar notificaciones" en el menú de usuario. Pide permiso al navegador, se suscribe con la clave pública y envía la suscripción. "Desactivar" la borra. Si el push está deshabilitado en el servidor o el navegador no lo soporta, la opción no aparece. El logout borra la suscripción del dispositivo.
- Reglas de siempre: 375 px sin scroll horizontal, `signal`, errores bajo el campo, textos en español.

## Decisiones y motivos

- Backend: la idempotencia usa la columna `cliente_id` con índice único, no una tabla aparte. Así la base misma impide el duplicado y el chequeo previo (`idPorClienteId`) solo evita trabajo y devuelve el existente.
- Backend: la comprobación del `clienteId` va antes de las validaciones de negocio. Un reintento de algo ya guardado responde 200 aunque el animal o el alimento se hayan dado de baja entre tanto; si no, la cola sin conexión se quedaría en error por algo que el servidor ya aceptó.
- Backend: la carrera entre dos envíos simultáneos se resuelve capturando la violación del índice único (P2002 o el 409 de `conDuplicados`) y buscando por `clienteId`. La transacción perdedora se revierte entera, así que el stock se descuenta una sola vez. Un `clienteId` de otro usuario es 409 `DUPLICADO` en `clienteId`.
- Backend: `clienteId` solo se acepta al crear. Los PATCH de consumos lo omiten del esquema, porque es la identidad del envío.
- Backend: los servicios `crear` de consumos y `crearNovedad` devuelven `{ registro, creado }` y la ruta elige 201 o 200.
- Backend: el envío push vive en `src/lib/push.js` con el enviador sustituible (`configurarEnviador`) y `esperarEnvios()`, que las pruebas usan en lugar de sleeps. Se llama después de confirmar la transacción y el trabajo corre en una promesa que captura todo error, de modo que un fallo de push no altera la respuesta.
- Backend: los avisos de stock se disparan solo al **cruzar** el mínimo (antes por encima, ahora igual o por debajo), calculado con el stock devuelto por la propia transacción. Además la clave diaria `alimento-stock:<id>:<día Bogotá>` limita a uno por día. Al editar un consumo o tratamiento solo cuenta el aumento de descuento; devolver stock nunca avisa.
- Backend: la clave en `avisos_enviados` se reserva con `createMany(skipDuplicates)` solo cuando hay destinatarios con suscripción. Así dos procesos no envían el mismo aviso y un aviso sin destinatarios no se "gasta" antes de que alguien se suscriba.
- Backend: los destinatarios son usuarios activos cuyo rol tiene el permiso (`tienePermiso`) y que son administradores o están asignados a la finca, menos el autor. La revisión de vencimientos no excluye a nadie porque no tiene autor.
- Backend: `revisarVencimientos()` incluye el estado y la fecha de vencimiento en la clave; si se repone el medicamento con otra fecha, el aviso vuelve a ser posible. Se programa en `server.js` (al arrancar y cada 6 h, con `unref`) y no con `NODE_ENV=test`.
- Backend: sin `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` el push queda deshabilitado: la clave pública responde `habilitado: false`, el alta de suscripción 409 `PUSH_DESHABILITADO` y los envíos no hacen nada. `DELETE` sigue funcionando para poder limpiar. Las pruebas ponen claves falsas en `env` y nunca llaman a un servicio real.
- Backend: la suscripción es por endpoint (único): al suscribirse desde un navegador que cambió de cuenta, el endpoint pasa al usuario actual (upsert). Las suscripciones se borran en cascada con el usuario y cuando el servicio responde 404 o 410.
- Backend: `web-push` se instaló con versión exacta (4.0.0), como el resto de dependencias del `package.json`.
- Frontend: el service worker es `public/sw.js` en JavaScript plano, comentado evento por evento para poder explicarlo. `scripts/sw-precache.mjs` (encadenado en `npm run build`) reemplaza dos marcadores del `sw.js` ya compilado: la lista de archivos con hash y una versión que es el hash del contenido. Así la caché cambia solo cuando cambia la app y el evento `activate` borra las anteriores.
- Frontend: estrategias separadas por tipo de recurso. Estáticos *cache-first* (tienen hash, su contenido no cambia); navegación *network-first* con respaldo a `index.html` (la SPA arranca sin red); `GET /api/**` *network-first* con copia y cabecera `X-Desde-Cache`, más un límite de 6 s para quedarse con la copia en redes "con señal pero sin datos". `/api/auth/**` y los métodos que no son GET nunca se tocan, para que tokens y cookies no pasen por la caché. La caché de la API no lleva versión (sobrevive a una actualización) y se borra al cerrar sesión o al caducar la sesión, porque los datos son de un usuario.
- Frontend: el SW nuevo no usa `skipWaiting()` solo: queda en espera y la app muestra "Hay una versión nueva" con botón Actualizar, que envía `SKIP_WAITING` y recarga al cambiar el controlador. Así el código no cambia a mitad de un formulario. El registro solo ocurre con `isDevMode()` en falso, para que `ng serve` no sirva código viejo.
- Frontend: la sesión sin conexión guarda en `localStorage` solo el usuario (sin tokens; el de acceso sigue solo en memoria y el de renovación en cookie httpOnly). Si `restaurar()` falla con status 0 se entra con ese usuario (`Auth.sinConexion`); un 401 (cookie vencida o revocada) cierra la sesión y borra el usuario guardado. Al volver la señal el sincronizador renueva el token antes de enviar y, si responde 401, manda a `/login`. Esto es una comodidad de lectura y registro local: la API sigue autorizando cada petición.
- Frontend: la cola usa IndexedDB nativo, sin librerías, porque guarda el `Blob` de la foto sin convertirlo. Cada elemento lleva el cuerpo exacto del POST (con `clienteId`), así el servicio Angular y el SW lo envían igual. El formato está documentado en `core/offline-logica.ts` y en `sw.js`; el campo extra `resumen` es solo para mostrar el sujeto en `/pendientes`. La clave del almacén es `clienteId`: encolar dos veces el mismo registro lo sobrescribe.
- Frontend: `clienteId` (uuid v4) se genera al enviar el formulario y se manda siempre en los POST de consumo y novedad, también en línea. Si la petición falla con status 0 (se cayó la red después de salir) el mismo `clienteId` va a la cola, y si el servidor ya lo había guardado el reenvío devuelve 200 sin duplicar. La novedad envía además `fechaHora` con el instante de captura, no el del envío.
- Frontend: reglas de sincronización en una función pura (`decidirRespuesta`): 200 y 201 borran; 400, 403, 404 y 409 dejan el elemento en `error` con el mensaje del servidor y sin reintento automático; sin red, 401 o 5xx lo dejan pendiente y cortan la ronda para conservar el orden. El 401 lo resuelve antes el interceptor (renueva y repite); si aun así falla, queda pendiente. Se envía de a uno, solo lo del usuario actual.
- Frontend: la sincronización la hace la app al abrir, al evento `online`, por el mensaje `SINCRONIZAR` del SW y con el botón "Sincronizar ahora". El SW la hace en su evento `sync` (Background Sync) solo si no hay pestañas: pide un token con `POST /api/auth/refresh`, lee la misma base y envía. Con pestañas abiertas deja el trabajo a la app, que ya tiene sesión y puede mostrar el resultado. Donde no hay Background Sync (Safari, Firefox) quedan los otros cuatro disparadores.
- Frontend: sin conexión solo se valida en el cliente; los errores del servidor (stock, animal dado de baja) aparecen después en `/pendientes`, donde el usuario puede reintentar o descartar con confirmación. Al cerrar sesión con pendientes se pregunta antes; los elementos quedan en el dispositivo asignados a su `usuarioId` y no los envía otro usuario.
- Frontend: los catálogos para trabajar sin red los consulta el servicio `Precarga` con exactamente los mismos parámetros que usan los formularios, porque la caché se indexa por URL completa. Se repite al iniciar sesión, al cambiar de finca y al volver la señal.
- Frontend: las notificaciones se activan desde el menú de usuario (icono de cuenta), no en el menú principal, y solo aparecen si el usuario tiene `novedades:gestionar`, `alimentos:gestionar` o `medicamentos:gestionar`, el navegador soporta push, hay un SW registrado y `/api/push/clave-publica` responde `habilitado`. Al cerrar sesión se borra la suscripción del dispositivo en el servidor y en el navegador (antes de perder el token); si no hay red, el servidor la elimina solo cuando el servicio de push responda 404 o 410. Al tocar una notificación el SW enfoca la pestaña abierta y le manda `IR_A` para navegar sin recargar, o abre una ventana.
- Frontend: los iconos PNG (192, 512 y maskable con la hoja dentro de la zona segura) salen de `public/icono.svg` renderizado con Playwright; el script no se guarda en el repo. `apple-touch-icon` se genera aparte porque iOS no usa el manifiesto.

## Cómo verificar

1. Backend (desde `backend/`): `npx prisma migrate deploy` y `npm test` (incluye `offline.test.js`, `push.test.js` y `push-real.test.js`, que arranca Node sin Vitest para detectar errores de importación).
2. Frontend (desde `frontend/`): `npm run build` (debe imprimir la versión y las URL inyectadas en `sw.js`) y `npm test -- --watch=false`.
3. Sin conexión, con la API en :3000: `npm run preview` en `frontend/` y abrir la URL en `localhost` (el SW exige origen seguro). Con las DevTools (Application, Service workers y Network en "Offline"):
   - recargar: la app abre con la sesión guardada y la banda "Sin conexión";
   - registrar un consumo y una novedad con foto y GPS: aparecen en `/pendientes`;
   - volver a "Online": se envían solos y la cola queda vacía.
4. Push: generar claves con `npx web-push generate-vapid-keys`, ponerlas en `backend/.env`, reiniciar la API y activar "Notificaciones" en el menú de usuario como veterinario; una novedad de prioridad alta registrada por otro usuario muestra el aviso.

Resultado al cerrar la fase (2026-11-24): backend 518/518 y frontend 47/47, con build correcto (verificado por el coordinador).

QA en un entorno aislado (`cuidagro_qa`, API congelada en :3190 con VAPID, frontend compilado en :4290):
- **API: 80 de 80.** Idempotencia por `clienteId` en consumos y novedades (JSON y multipart, 8 envíos simultáneos dan una fila y un solo descuento), rutas push, avisos reales cifrados recibidos en un receptor HTTPS local (destinatarios, autor excluido, deduplicación, vencimientos al arrancar) y limpieza de suscripciones con 404/410.
- **E2E con Playwright** (1280 y 375 px): 109 de 109 por viewport, más 13 de 13 de la re-verificación.
  - Manifiesto, iconos, SW y cachés.
  - Navegación y registro sin red de las HU oficiales (consumo de vacuno, consumo de lote y novedad con foto y GPS) con sincronización sin duplicados.
  - Errores 409 y 400 con "Reintentar" y "Descartar"; cortes, recargas y dos pestañas sin duplicados; sync del SW sin pestañas (evento por CDP).
  - Logout con pendientes, cambio de usuario y sesión revocada.
  - Push real a través del servicio del navegador (FCM), activar y desactivar.
  - Banda de versión nueva y activación del SW nuevo.
  - Regresión de todas las páginas con el SW activo, sin scroll horizontal.

Corregido tras la QA: al volver a iniciar sesión sin recargar, los pendientes no se enviaban hasta otro disparo. Ahora `core/pwa.ts` sincroniza cada vez que entra un usuario, con un `effect` que sigue solo el id (no se relanza al renovar el token ni al terminar una sincronización; verificado sin bucle). Antes, durante el desarrollo del frontend se detectó que `web-push` 4.0.0 no tiene export por defecto y el servidor no arrancaba; se corrigió y `push-real.test.js` lo cubre.

**No probado:** instalación real en un dispositivo ("Instalar app"), el disparo de Background Sync por el propio navegador (headless lo desactiva; se probó el evento por CDP), el clic en una notificación, iOS/Safari y Firefox.

## Pendientes para fases siguientes

- Fase 9: despliegue con HTTPS (obligatorio para el SW y push fuera de `localhost`) y claves VAPID de producción.
- Las listas que nunca se abrieron con red no están disponibles sin conexión; los catálogos de los formularios sí se precargan.
- Tratamientos sin conexión quedaron fuera por decisión del usuario.
