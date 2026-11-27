# Auditoría de CuidAgro como PWA (Fase 11)

Fecha: 2026-11-27. Alcance: la versión de la rama `desarrollo` con los cambios de la Fase 11, compilada y servida en modo producción en local (puerto 3190, base `cuidagro_qa`). La versión desplegada en https://cuidagro.onrender.com todavía no incluye los cambios de esta fase; se vuelve a medir al desplegar (hallazgo 1 de la sección 7).

## 1. Alcance, criterios y técnicas

La Sesión 23 define la auditoría como un proceso "sistemático, independiente y documentado" que obtiene evidencia objetiva para medir el cumplimiento de criterios definidos de antemano (Sesión 23, p. 4), y la aplica a las PWA: instalabilidad y manifiesto, service worker y comportamiento sin conexión, rendimiento y Core Web Vitals, seguridad, accesibilidad, SEO y compatibilidad (pp. 5-10). Se usan las cuatro técnicas que propone (pp. 12-16):

| Técnica (Sesión 23) | Cómo se aplicó |
|---|---|
| Lista de chequeo (p. 13) | Sección 2 de este informe, con estado y evidencia por ítem |
| Laboratorio frente a campo (p. 14) | Laboratorio: Lighthouse automatizado (`npm run auditoria`). Campo: la app mide LCP, INP, CLS, FCP y TTFB reales y los envía a `POST /api/metricas`; el administrador los ve en `/calidad` (sección 4) |
| Inspección manual y revisión experta (p. 15) | Revisión de encabezados con `curl -I`, prueba manual sin conexión en Chromium y revisión del código del service worker |
| Automatización y regresión (p. 16) | Suites de backend y frontend más el script de Lighthouse con umbrales (sección 6) |

**Criterios (umbrales del script).** Accesibilidad >= 95, buenas prácticas >= 95, SEO >= 90, rendimiento >= 85 en móvil y >= 90 en escritorio. Core Web Vitals en el percentil 75: LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1 (Sesión 23, pp. 23-24).

**Método de laboratorio.** Lighthouse 13.6.0 con el Chromium de Playwright (chromium-1255), perfil móvil (emulación por defecto: 4x de ralentización de CPU y red 4G lenta simulada) y perfil de escritorio. Páginas: `/login` sin sesión y `/`, `/consumos`, `/reportes`, `/espacios` con sesión (el script inicia sesión por la API y entrega la cookie de renovación a Lighthouse, que la app usa para restaurar la sesión). Para las mediciones "después" se hicieron 3 repeticiones por página y perfil y se conserva la mediana, porque el rendimiento oscila unos puntos entre corridas.

## 2. Lista de chequeo

Estados: Cumple, Parcial, Pendiente.

### Instalabilidad y manifiesto (Sesión 23, pp. 7 y 13)

| Ítem | Estado | Evidencia |
|---|---|---|
| Manifiesto válido, enlazado y del mismo origen | Cumple | `frontend/public/manifest.webmanifest`, `<link rel="manifest">` en `frontend/src/index.html` |
| `id`, `orientation`, `categories` | Cumple | `id: "/"`, `orientation: "portrait"`, `categories: ["productivity","business"]` en el manifiesto |
| Iconos 192, 512 y maskable | Cumple | `frontend/public/icons/` |
| `shortcuts` (Registrar consumo, Nueva novedad) con icono de 96 px | Cumple | manifiesto; `frontend/public/icons/icon-96.png` |
| `screenshots` móvil (1080x1920) y escritorio (1920x1080) | Cumple | `frontend/public/img/capturas/movil.webp` y `escritorio.webp`, tomadas de la app desplegada con los datos de demostración y entradas del manifiesto con `form_factor` `narrow` y `wide` |
| `start_url` responde y está en el precaché | Cumple | `frontend/scripts/sw-precache.mjs` (79 URL en el precaché, incluidas las capturas) |
| Instalación en un dispositivo real | Pendiente | Sin prueba en Android ni iOS (`docs/fases/fase-09-despliegue.md`) |

### Service worker y sin conexión (pp. 8 y 13)

| Ítem | Estado | Evidencia |
|---|---|---|
| Service worker registrado y controlando la página | Cumple | `frontend/public/sw.js`; comprobado el 2026-11-27 con Playwright: `navigator.serviceWorker.controller` presente tras la segunda carga |
| Abre sin conexión | Cumple | Misma prueba: con la red apagada y la página recargada se dibuja la pantalla de entrada (`h1` "CuidAgro") |
| Copia en caché de `index.html` coherente con su CSP (nonce) | Cumple | `caches.match('/index.html')` devuelve la respuesta completa con su encabezado `Content-Security-Policy` (`style-src 'self' 'nonce-...'`) y no hubo violaciones de CSP en consola sin conexión |
| Límite de la caché de la API (Sesión 8, pp. 21 y 27-33) | Cumple | `MAX_ENTRADAS_API = 150` y `limitarCache` en `frontend/public/sw.js` |
| Fotos autenticadas fuera de la caché | Cumple | El service worker solo guarda GET de `/api/**` con respuesta 2xx y no toca `/api/auth/**`; las fotos se piden con `Authorization` desde la app |
| Cola sin conexión con reenvío idempotente | Cumple | `frontend/src/app/core/offline.spec.ts`, `backend/tests/offline.test.js` |
| Aviso "Se enviaron N registros pendientes" | Cumple | `frontend/src/app/core/auditoria.spec.ts`, bloque "aviso de sincronización" (3 pruebas) |
| Background Sync espontáneo en dispositivo real | Pendiente | Solo probado disparando el evento por CDP |

### Rendimiento y Core Web Vitals (pp. 9 y 23-24)

| Ítem | Estado | Evidencia |
|---|---|---|
| Rendimiento >= 90 en escritorio | Cumple | 99 a 100 en las cinco páginas (sección 3) |
| Rendimiento >= 85 en móvil | Parcial | `/login`, `/reportes` y `/espacios` cumplen (99, 90, 87); `/` (81) y `/consumos` (84) quedan por debajo (sección 3.3) |
| CLS <= 0,1 | Cumple | 0 en todas las páginas salvo `/consumos` (0,033 móvil y 0,02 escritorio) |
| LCP <= 2,5 s en laboratorio | Parcial | Escritorio y `/login`, `/consumos`, `/reportes` móvil cumplen (<= 0,9 s); `/` (3,6 s) y `/espacios` (3,0 s) en móvil superan 2,5 s con la CPU emulada 4x |
| Compresión y caché de estáticos | Cumple | `compression()` y `Cache-Control: immutable` en archivos con hash en `backend/src/app.js` |
| Imágenes con tamaño declarado y variantes | Cumple | Cabecera del inicio con `srcset` de 640, 800 y 1600 px (`frontend/public/img/cabecera-inicio-*.webp`) |
| Core Web Vitals reales (campo) | Parcial | Medición implementada y probada; sin datos reales todavía (sección 4) |

### Seguridad (Sesión 22 y Sesión 23, p. 10)

| Ítem | Estado | Evidencia |
|---|---|---|
| HTTPS y HSTS | Cumple | `strict-transport-security` en producción (sección 5); la redirección HTTP a HTTPS responde 301 |
| `Permissions-Policy` | Cumple en el código; pendiente de desplegar | `backend/tests/seguridad.test.js` ("envía Permissions-Policy en todas las respuestas") |
| CSP con `style-src` sin `'unsafe-inline'` y nonce por petición | Cumple en el código; pendiente de desplegar | `backend/tests/seguridad.test.js` (nonce distinto en cada petición y coherente con la CSP; otras rutas sin `unsafe-inline` ni nonce) |
| Cookie de renovación `HttpOnly`, `Secure`, `SameSite=Strict` | Cumple | `backend/src/modules/auth/auth.routes.js`; comprobada en la respuesta de `/api/auth/login` |
| Validación de entradas en el servidor | Cumple | Zod en `backend/src/modules/*/*.schemas.js`; `backend/tests/metricas.test.js` para la ruta pública nueva |
| Ruta pública acotada | Cumple | `POST /api/metricas`: 4 KB, 10 métricas, lista blanca, límite por IP, sin datos personales (`backend/tests/metricas.test.js`) |
| Pruebas de penetración básicas | Pendiente | Sin evidencia |
| Dos factores, informes de violación de CSP, Trusted Types | Pendiente | Fuera del alcance de la fase |

### Accesibilidad (p. 6)

| Ítem | Estado | Evidencia |
|---|---|---|
| Lighthouse de accesibilidad >= 95 | Cumple | 100 en las 10 mediciones (`docs/auditoria/2026-11-27/resumen.md`) |
| Botón mostrar/ocultar contraseña con nombre accesible y `aria-pressed` | Cumple | `frontend/src/app/compartido/campo-password.ts`; `auditoria.spec.ts`, bloque "campo de contraseña" |
| Recorrido solo con teclado y lector de pantalla | Pendiente | Lighthouse no lo cubre; falta revisión manual (Sesión 23, p. 15) |

### SEO (p. 6)

| Ítem | Estado | Evidencia |
|---|---|---|
| Lighthouse SEO >= 90 | Cumple | 100 en las 10 mediciones; antes 92 por `robots.txt` inválido |
| `title`, `meta description`, `lang="es"` | Cumple | `frontend/src/index.html` |
| `robots.txt` válido | Cumple | `frontend/public/robots.txt` (`Allow: /`, `Disallow: /api/`) |

### Compatibilidad y responsive (p. 6)

| Ítem | Estado | Evidencia |
|---|---|---|
| Móvil 360-412 px y escritorio 1350-1920 px | Cumple | Perfiles de Lighthouse y capturas del manifiesto; QA de fases anteriores a 375 y 1280 px sin scroll horizontal |
| Firefox y Safari | Pendiente | Solo se ha probado Chromium |

## 3. Resultados de laboratorio, antes y después

Informes HTML de cada página y perfil: `docs/auditoria/2026-11-26-antes/` (corrida única, antes de las correcciones) y `docs/auditoria/2026-11-27/` (mediana de 3 corridas, después). Cada carpeta tiene su `resumen.md`.

### 3.1 Puntajes (rendimiento / accesibilidad / buenas prácticas / SEO)

| Página | Perfil | Antes | Después |
|---|---|---|---|
| `/login` | Móvil | 99 / 100 / 96 / 92 | 99 / 100 / 96 / 100 |
| `/login` | Escritorio | 100 / 100 / 96 / 92 | 100 / 100 / 96 / 100 |
| `/` | Móvil | 69 / 100 / 100 / 92 | 81 / 100 / 100 / 100 |
| `/` | Escritorio | 75 / 100 / 100 / 92 | 99 / 100 / 100 / 100 |
| `/consumos` | Móvil | 74 / 100 / 100 / 92 | 84 / 100 / 100 / 100 |
| `/consumos` | Escritorio | 100 / 100 / 100 / 92 | 100 / 100 / 100 / 100 |
| `/reportes` | Móvil | 93 / 100 / 100 / 92 | 90 / 100 / 100 / 100 |
| `/reportes` | Escritorio | 100 / 100 / 100 / 92 | 100 / 100 / 100 / 100 |
| `/espacios` | Móvil | 72 / 100 / 100 / 92 | 87 / 100 / 100 / 100 |
| `/espacios` | Escritorio | 94 / 100 / 100 / 92 | 100 / 100 / 100 / 100 |

Las corridas individuales de rendimiento "después" (mínima / mediana / máxima): `/` móvil 75 / 81 / 81; `/consumos` móvil 82 / 84 / 90; `/reportes` móvil 87 / 90 / 91; `/espacios` móvil 86 / 87 / 88. Las oscilaciones son de unos pocos puntos entre corridas.

### 3.2 Métricas de laboratorio (LCP / CLS / TBT)

| Página | Perfil | Antes | Después |
|---|---|---|---|
| `/` | Móvil | 3,9 s / 0,196 / 420 ms | 3,6 s / 0 / 380 ms |
| `/` | Escritorio | 0,9 s / 0,888 / 0 ms | 0,9 s / 0 / 0 ms |
| `/consumos` | Móvil | 3,6 s / 0,03 / 650 ms | 0,8 s / 0,033 / 660 ms |
| `/reportes` | Móvil | 0,8 s / 0 / 330 ms | 0,8 s / 0 / 400 ms |
| `/espacios` | Móvil | 3,4 s / 0,238 / 350 ms | 3,0 s / 0 / 330 ms |
| `/espacios` | Escritorio | 0,8 s / 0,141 / 0 ms | 0,7 s / 0 / 0 ms |

### 3.3 Umbrales no alcanzados

`/` móvil (81) y `/consumos` móvil (84) quedan por debajo de 85. La causa no es de contenido sino de coste de arranque del JavaScript con la CPU emulada 4x del perfil móvil: Angular y su enrutador suman unos 270 KB de JavaScript sin comprimir (dos archivos de 177 KB y 91 KB) que se evalúan en cada carga, y en el informe de `/consumos` el tiempo de bloqueo total (TBT) es de unos 660 ms, que pesa 30 % del puntaje. En escritorio, sin ralentización, las mismas páginas dan 99 y 100, y `/consumos` móvil llegó a 90 en una de las tres corridas. No se encontró una corrección razonable y de bajo riesgo para bajar ese costo sin reestructurar el arranque de la aplicación (ver hallazgo 3).

Buenas prácticas de `/login` queda en 96 (umbral 95): Lighthouse registra el error de consola `401` de `POST /api/auth/refresh`, que la app hace al arrancar sin sesión para intentar restaurarla con la cookie. Es el comportamiento diseñado y no se cambió.

### 3.4 Correcciones aplicadas

| Archivo | Motivo |
|---|---|
| `frontend/public/robots.txt` (nuevo) | SEO: sin él, `/robots.txt` devolvía el HTML de la aplicación y Lighthouse lo marcaba inválido (92 a 100) |
| `frontend/src/app/core/finca-activa.ts` (señal `cargada`) y las páginas `inicio`, `consumos`, `alimentos`, `lotes`, `vacunos`, `espacios`, `medicamentos`, `novedades`, `reportes`, `salud`, `tratamientos` | CLS y carga innecesaria: mientras llegaba la lista de fincas del administrador se dibujaba "Aún no hay una finca" con su imagen y luego se reemplazaba por el contenido; ahora ese aviso solo aparece cuando ya se sabe que no hay finca |
| `frontend/src/app/paginas/inicio.ts` | CLS: la tarjeta "Administración" se mostraba antes que el panel y se desplazaba al llegar los datos; ahora aparece debajo, al terminar de cargar. Además la imagen de portada usa `srcset` de 640, 800 y 1600 px y `fetchpriority="high"` (era una imagen de 146 KB para una caja de 380 px) |
| `frontend/public/img/cabecera-inicio-640.webp` y `cabecera-inicio-800.webp` (nuevos) | Rendimiento: variantes de 31 KB y 50 KB de la portada |
| `frontend/src/app/paginas/espacios.ts` | CLS (0,238 a 0): la tabla de raciones empujaba hacia abajo cuando aparecía la lista; ahora se muestra al terminar de cargar. La imagen del estado vacío ya no es `loading="lazy"` porque es lo primero que se ve (era el elemento de LCP) |
| `frontend/src/styles.css` | CLS en escritorio: `scrollbar-gutter: stable` reserva el ancho de la barra de desplazamiento y el contenido no se mueve cuando esta aparece |
| `frontend/public/img/capturas/*.webp` y recompilación | Manifiesto: capturas para la instalación enriquecida; entran al precaché |

La accesibilidad ya estaba en 100 antes de las correcciones (trabajo de fases anteriores y de esta), por lo que no hubo que corregir contraste, etiquetas ni tamaños de toque.

### 3.5 Resultados en producción (después del despliegue)

Medido el 2026-11-27 contra https://cuidagro.onrender.com, con el servicio despierto, la sesión de un usuario veterinario de la demo y `--repeticiones 3` (mediana). Informes en `docs/auditoria/2026-11-27-produccion/`.

| Página | Perfil | Rendimiento (corridas) | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|---|
| `/login` | Móvil | 98 (98 / 98 / 99) | 100 | 96 | 100 |
| `/login` | Escritorio | 100 (100 / 100 / 100) | 100 | 96 | 100 |
| `/` | Móvil | 95 (92 / 95 / 96) | 100 | 100 | 100 |
| `/` | Escritorio | 99 | 100 | 100 | 100 |
| `/consumos` | Móvil | 93 (93 / 93 / 96) | 100 | 100 | 100 |
| `/consumos` | Escritorio | 99 (98 / 99 / 100) | 100 | 100 | 100 |
| `/reportes` | Móvil | **81** (75 / 81 / 97) | 100 | 100 | 100 |
| `/reportes` | Escritorio | 100 (99 / 100 / 100) | 100 | 100 | 100 |
| `/espacios` | Móvil | **83** (81 / 83 / 99) | 100 | 100 | 100 |
| `/espacios` | Escritorio | **88** (88 / 100) | 100 | 100 | 100 |

Lectura de los resultados:

- En producción `/` y `/consumos` en móvil **sí cumplen** (95 y 93), al contrario que en local (81 y 84): el servidor de Render entrega los archivos comprimidos y con caché, y LCP de `/` móvil baja a 2,1 s.
- Las tres mediciones que no cumplen tienen **mucha variación entre corridas** (de 75 a 97 en `/reportes` móvil y de 81 a 99 en `/espacios` móvil), y en todas el LCP está por debajo de 1 s y el CLS en 0. Lo que baja el puntaje es el tiempo de bloqueo (TBT de 690 a 780 ms en las corridas malas), que depende de la carga del equipo que mide y del arranque de JavaScript, no de la red. Es el mismo hallazgo de la sección 3.3.
- Accesibilidad y SEO quedan en 100 en las 10 mediciones; buenas prácticas en 100 salvo `/login` (96, por el `401` esperado del intento de restaurar sesión).

Encabezados confirmados en producción después del despliegue:

```
content-security-policy: default-src 'self'; … ;img-src 'self' data: blob:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' 'nonce-<valor por petición>';upgrade-insecure-requests
permissions-policy: camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()
GET /robots.txt → 200 text/plain
```

## 4. Pruebas de campo

**Cómo se recogen.** Con la biblioteca `web-vitals` la app registra LCP, INP, CLS, FCP y TTFB una sola vez al arrancar, los agrupa (hasta 10 por envío) y los manda con `navigator.sendBeacon` a `POST /api/metricas` cuando la página se oculta. No se envía nada sin conexión ni en desarrollo. Cada muestra lleva solo la métrica, el valor, el patrón de la ruta (sin identificadores), el tipo de dispositivo (ancho menor de 720 px es móvil), la conexión efectiva y la versión del service worker; no se guardan usuario ni dirección IP. El servidor valida con Zod (lista blanca de nombres, rangos, 4 KB, límite por IP), calcula la calificación y borra lo que tenga más de 90 días.

**Umbrales (calificación del servidor y de la pantalla).**

| Métrica | Buena | Mejorable | Mala |
|---|---|---|---|
| LCP | <= 2500 ms | <= 4000 ms | mayor |
| INP | <= 200 ms | <= 500 ms | mayor |
| CLS | <= 0,1 | <= 0,25 | mayor |
| FCP | <= 1800 ms | <= 3000 ms | mayor |
| TTFB | <= 800 ms | <= 1800 ms | mayor |

**Cómo se leen.** La pantalla `/calidad` (solo administrador, permiso `calidad:consultar`) muestra el percentil 75 por métrica y por ruta, con filtros de periodo (7, 30 o 90 días) y de dispositivo. El percentil 75 es el criterio de la Sesión 23 (p. 24): una página aprueba si cumple los tres umbrales en ese percentil.

**Primeros datos.** Todavía no hay muestras reales, porque la versión con la medición no está desplegada. Cuando haya tráfico habrá que comparar estos datos con el laboratorio (Sesión 23, p. 14): se espera que el móvil real en redes lentas se parezca más a la emulación móvil que al escritorio. Con poco tráfico CrUX no tendrá datos (Sesión 23, p. 32), por eso la medición propia.

## 5. Seguridad (Sesión 22)

### 5.1 Encabezados reales de producción antes del despliegue

Tomados el 2026-11-27 con `curl -I` de la versión desplegada, que aún no incluye los cambios de esta fase.

`GET https://cuidagro.onrender.com/` (200) y `GET https://cuidagro.onrender.com/api/health` (200) devuelven los mismos encabezados de seguridad:

```
content-security-policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data: blob:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
referrer-policy: no-referrer
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
origin-agent-cluster: ?1
x-dns-prefetch-control: off
x-download-options: noopen
x-permitted-cross-domain-policies: none
x-xss-protection: 0
```

`/` y `/sw.js` llevan `Cache-Control: no-cache`; `http://cuidagro.onrender.com/` responde `301` hacia HTTPS (lo hace la plataforma). `GET /robots.txt` responde el HTML de la aplicación (se corrige con `robots.txt`). Diferencias con lo que trae esta fase: falta `Permissions-Policy` y `style-src` todavía permite `https:` y `'unsafe-inline'`.

### 5.2 Encabezados de la versión local de esta fase

Comprobados en `POST /api/auth/login` de la versión local (`NODE_ENV=production`):

```
content-security-policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data: blob:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self';upgrade-insecure-requests
permissions-policy: camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()
strict-transport-security: max-age=31536000; includeSubDomains
```

(Los demás encabezados de `helmet` son los mismos de la sección anterior.) Solo la respuesta de `index.html` cambia su `style-src` a `'self' 'nonce-<valor>'`, con un valor nuevo en cada petición que el servidor escribe también en `<app-root ngCspNonce>`. Esa es la CSP estricta con nonce que recomienda la Sesión 22 (pp. 24-37): el servidor genera un valor aleatorio por respuesta y solo acepta lo que lo lleve; `style-src` ya no usa `'unsafe-inline'`. Las pantallas se probaron con esa CSP en el navegador (Lighthouse no marcó errores de consola por CSP en ninguna de las 10 mediciones, y la prueba sin conexión tampoco).

### 5.3 Revisión frente a la Sesión 22

| Recomendación | Resultado |
|---|---|
| HTTPS en todo el tráfico y HSTS (pp. 4 y 6) | Cumple; la plataforma redirige y la app envía HSTS |
| Cabecera CSP, sin `unsafe-inline` ni `unsafe-eval` en scripts (pp. 14-16 y 30-32) | Cumple |
| CSP con nonce (pp. 24-37) | Cumple para estilos; scripts con `'self'` y sin JavaScript en línea. Desplegado y verificado en producción (sección 3.5) |
| `Permissions-Policy` y control de APIs privilegiadas (Sesión 23, p. 10) | Cumple: cámara y geolocalización solo del propio origen, el resto desactivado. Desplegado y verificado en producción |
| Otros encabezados (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, COOP) | Cumple (`helmet`) |
| Cookies seguras | Cumple (`HttpOnly`, `Secure`, `SameSite=Strict`, ruta `/api/auth`) |
| Validación en el cliente y el servidor, RBAC | Cumple; permiso nuevo `calidad:consultar` solo para el administrador (`backend/tests/metricas.test.js`) |
| CSP en modo solo informe y `Reporting-Endpoints` (pp. 38-40), Trusted Types (pp. 45-46), 2FA (p. 4) | Pendiente |

## 6. Regresión automatizada

| Capa | Qué la cubre |
|---|---|
| Backend (Vitest y Supertest, PostgreSQL real) | `backend/tests/seguridad.test.js` (4 pruebas: `Permissions-Policy`, `style-src` sin `unsafe-inline`, nonce por petición coherente, API sin HTML) y `backend/tests/metricas.test.js` (envío, validación, límites, p75, filtros, permisos). Las suites existentes siguen en `backend/tests/`. La suite completa la corre el coordinador al cierre de la fase |
| Frontend (Vitest de Angular) | `frontend/src/app/core/auditoria.spec.ts`: campo de contraseña, aviso de sincronización, envío de métricas, ruta, formato de la pantalla Calidad; más las especificaciones de `auth`, `offline`, `salud`, `reportes`, etc. |
| Laboratorio (Lighthouse) | `npm run auditoria -- --url <base> --correo <correo> --password <clave>` (o `AUDITORIA_URL`, `AUDITORIA_CORREO`, `AUDITORIA_PASSWORD`). Código de salida distinto de 0 si alguna página no cumple los umbrales; escribe un HTML por página y perfil y `resumen.md` en `docs/auditoria/<AAAA-MM-DD>/`. Opciones: `--repeticiones <n>` (mediana), `--paginas`, `--perfiles`, `--carpeta`. Usa `CHROME_PATH` o el Chromium de Playwright |
| Integración continua | Pendiente: no hay `.github/workflows`. El script está listo para ejecutarse en el pipeline contra el build servido (Sesión 23, pp. 16 y 35) |

## 7. Hallazgos abiertos, priorizados

| Prioridad | Hallazgo | Siguiente paso |
|---|---|---|
| Resuelto | La versión desplegada no tenía `Permissions-Policy`, el nonce de estilos ni `robots.txt` | Desplegado el 2026-11-27 y medido en producción (sección 3.5) |
| Alta | Prueba en dispositivo real: instalación, atajos y capturas del manifiesto, cámara, GPS, modo avión, push | Seguir el guion de `docs/fases/fase-09-despliegue.md` |
| Media | Rendimiento móvil variable por el tiempo de bloqueo del arranque de JavaScript: en local `/` (81) y `/consumos` (84); en producción `/reportes` (81) y `/espacios` (83 móvil, 88 escritorio), con corridas de hasta 97-100 | Reducir el JavaScript inicial: revisar qué entra en los dos archivos grandes, precargar la ruta de inicio y evaluar dividir lo que no se usa en la primera pantalla; medir de nuevo con `--repeticiones 3` |
| Media | LCP móvil de `/` (3,6 s) y `/espacios` (3,0 s) sobre 2,5 s en laboratorio | Mismo trabajo anterior; confirmar con datos de campo en `/calidad` antes de invertir más |
| Media | Sin datos de campo | Esperar tráfico real y revisar `/calidad` (p75 por ruta y dispositivo) |
| Media | Sin integración continua | Crear `.github/workflows` con pruebas de backend y frontend y `npm run auditoria` |
| Media | Accesibilidad manual (teclado y lector de pantalla) y Firefox/Safari sin probar | Recorridos manuales en 4 pantallas clave; ejecutar el E2E en otros navegadores |
| Baja | En pantallas de 1920 px, el gráfico de barras del inicio se ve muy alto (la captura de escritorio lo muestra ocupando casi toda la altura) | Limitar la altura del gráfico en escritorio |
| Baja | Error de consola `401` al arrancar sin sesión (buenas prácticas de `/login` en 96) | Dejarlo, o evitar la petición cuando no hay usuario guardado y no se espera una cookie |
| Baja | Sin pruebas de penetración, informes de violación de CSP, Trusted Types ni 2FA | Documentado como fuera del alcance actual |
