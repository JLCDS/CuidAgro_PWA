# Fase 11. Auditoría de la PWA (Sesión 23), seguridad (Sesión 22) y ajustes pendientes

**Estado:** terminada, en revisión (2026-11-27). Informe: [../auditoria-pwa.md](../auditoria-pwa.md).
**Origen:** la Sesión 23 del curso ("Auditorías en PWA") define la auditoría como un proceso sistemático y documentado que verifica instalabilidad, service worker y uso sin conexión, rendimiento con Core Web Vitals, seguridad, accesibilidad y SEO, combinando listas de chequeo, pruebas de laboratorio (Lighthouse) y de campo, revisión experta y regresión automatizada. `docs/pwa-temas-del-curso.md` dejó estos puntos como pendientes o parciales. El usuario pidió además poder ver la contraseña al escribirla.

| Necesidad | Cómo se cubre |
|---|---|
| Pruebas de laboratorio | Lighthouse automatizado (`npm run auditoria`) con umbrales, informes guardados como evidencia |
| Pruebas de campo (Core Web Vitals reales) | La app mide LCP, INP, CLS, FCP y TTFB en los dispositivos reales y los envía al servidor; pantalla **Calidad** para el administrador |
| Seguridad (Sesión 22) | `Permissions-Policy`, CSP sin `'unsafe-inline'` en estilos (nonce por petición), revisión de encabezados |
| Manifiesto completo | `orientation`, `screenshots`, `shortcuts`, `id` |
| Estrategias de caché (Sesión 8) | Límite de entradas en la caché de la API |
| Sincronización (Sesión 15) | Aviso explícito "Se enviaron N registros pendientes" |
| Ver la contraseña | Botón mostrar/ocultar en todos los campos de contraseña |
| Informe | `docs/auditoria-pwa.md` con lista de chequeo, evidencia, antes y después |

## 1. Mostrar u ocultar la contraseña (frontend)

- Componente reutilizable (p. ej. `compartido/campo-password.ts` o directiva) usado en `paginas/login.ts` y `paginas/usuario-form.ts` (y cualquier otro campo `type="password"`).
- Botón de 48 × 48 px dentro del campo, a la derecha, con ícono de ojo / ojo tachado (SVG en línea), `type="button"`, `aria-label` "Mostrar contraseña" / "Ocultar contraseña" y `aria-pressed`. Alterna `type` entre `password` y `text` sin perder el foco ni el valor. Al enviar el formulario de login vuelve a `password`.
- `autocomplete` se conserva (`current-password` / `new-password`).

## 2. Medición de campo: Core Web Vitals (backend + frontend)

### Modelo (migración `20261127000000_metricas_web`)

Tabla `metricas_web` (modelo `MetricaWeb`), **sin datos personales** (no guarda usuario ni IP):

| Campo | Tipo | Regla |
|---|---|---|
| `id` | uuid | |
| `nombre` | enum `NombreMetrica` | `LCP`, `INP`, `CLS`, `FCP`, `TTFB` |
| `valor` | double | ms (CLS sin unidad); 0 a 600000 (CLS 0 a 100) |
| `calificacion` | enum `CalificacionMetrica` | `BUENA`, `MEJORABLE`, `MALA` (la calcula el **servidor** con los umbrales de abajo) |
| `ruta` | text | patrón de la ruta de Angular, no la URL concreta (`/vacunos`, `/lotes`, `/login`…); máx. 80; `^/[a-z0-9/-]*$` |
| `dispositivo` | enum | `MOVIL` (ancho < 720 px) o `ESCRITORIO` |
| `conexion` | text? | `navigator.connection.effectiveType` si existe (`4g`, `3g`…), máx. 10 |
| `version` | text? | versión del service worker activa, máx. 20 |
| `created_at` | timestamptz | índice `(nombre, created_at)` |

Umbrales (Google): LCP ≤ 2500 buena, ≤ 4000 mejorable; INP ≤ 200 / ≤ 500; CLS ≤ 0,1 / ≤ 0,25; FCP ≤ 1800 / ≤ 3000; TTFB ≤ 800 / ≤ 1800 (ms).

### API

- **`POST /api/metricas`** — **sin autenticación** (se envía con `navigator.sendBeacon`, que no lleva encabezados). Acepta `application/json` o `text/plain` con JSON (sendBeacon). Cuerpo `{ "metricas": [{ nombre, valor, ruta, dispositivo, conexion?, version? }] }`, 1 a 10 por envío, cuerpo ≤ 4 KB. Validación estricta con Zod (lista blanca de nombres y rangos). Límite de 60 envíos por minuto por IP (`express-rate-limit`, ya usado en login). Responde **204**. Datos inválidos → 400 (no se guarda nada). Al insertar, con probabilidad 1/100, borra las métricas de más de 90 días.
- **`GET /api/metricas/resumen?dias=7|30|90&dispositivo=MOVIL|ESCRITORIO`** — permiso nuevo **`calidad:consultar`** (solo `ADMINISTRADOR`). Responde:

```json
{
  "dias": 7, "dispositivo": null,
  "general": [{ "nombre": "LCP", "p75": 1820.5, "muestras": 140, "buenas": 0.91, "mejorables": 0.07, "malas": 0.02, "calificacionP75": "BUENA" }],
  "porRuta": [{ "ruta": "/consumos", "metricas": [{ "nombre": "LCP", "p75": 0, "muestras": 0, "calificacionP75": "BUENA" }] }]
}
```

p75 con `percentile_cont(0.75)` de PostgreSQL. Rutas ordenadas por número de muestras.

### Frontend

- Dependencia nueva permitida: **`web-vitals`** (biblioteca oficial de Google, versión 4.x o 5.x fijada). Se registra una vez al arrancar (`onLCP`, `onINP`, `onCLS`, `onFCP`, `onTTFB`), agrupa y envía con `sendBeacon('/api/metricas', blob)` al ocultarse la página (`visibilitychange` → `hidden`). Sin conexión no se envía nada (se descarta). No se mide en `ng serve`/desarrollo.
- La `ruta` es el patrón de la ruta activa del router (sin ids).
- **Página `/calidad`** (menú lateral y "Más", solo con `calidad:consultar`): selector de periodo (7, 30, 90 días) y dispositivo; una tarjeta por métrica con el p75, la calificación por color (verde, ámbar, rojo, con texto además del color), muestras y la distribución buena/mejorable/mala; tabla por ruta. Estado vacío con imagen si no hay muestras. Texto breve que explica cada métrica en lenguaje simple ("LCP: cuánto tarda en verse el contenido principal").

## 3. Seguridad (backend)

- Encabezado **`Permissions-Policy`** en todas las respuestas: `camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()`.
- **CSP sin `'unsafe-inline'` en `style-src`**: al servir `index.html`, el servidor genera un nonce aleatorio por petición (`crypto.randomBytes(16).toString('base64')`), lo escribe en el atributo `ngCspNonce` de `<app-root>` (en `frontend/src/index.html` el elemento queda exactamente `<app-root ngCspNonce="__CSP_NONCE__"></app-root>` y el servidor reemplaza `__CSP_NONCE__`; si el build de Angular reescribe ese atributo, el servidor busca el placeholder donde quede) y lo pone en la CSP de esa respuesta: `style-src 'self' 'nonce-<n>'`. El resto de respuestas mantiene `style-src 'self'`. Se elimina el único atributo `style="..."` del frontend (`paginas/no-encontrada.ts`) moviéndolo a estilos del componente. Las fuentes siguen siendo propias (`font-src 'self'`).
  - El service worker guarda la respuesta completa (encabezados y cuerpo) del `index.html`, así que el nonce de la copia en caché coincide con su CSP sin conexión. Verificarlo.
  - Si algún estilo dinámico de Angular quedara bloqueado y no hubiera forma limpia de resolverlo, se documenta y se deja `'unsafe-inline'` solo en `style-src-attr`, nunca en `style-src`.
- Revisar y documentar el resto de encabezados de `helmet` (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `X-Frame-Options`/`frame-ancestors`).

## 4. PWA (frontend)

- **Manifiesto:** `id: "/"`, `orientation: "portrait"`, `categories: ["productivity", "business"]`, **`shortcuts`** ("Registrar consumo" → `/consumos`, "Nueva novedad" → `/novedades`, con íconos 96 px) y **`screenshots`** (al menos una `narrow` 1080 × 1920 y una `wide` 1920 × 1080, WebP, en `public/img/capturas/`, tomadas de la app real con datos de demo).
- **Service worker:** la caché `cuidagro-api` se limita a **150 entradas**; al superar el límite borra las más antiguas (orden de inserción), como `limitarCache` de la Sesión 8. Las fotos de las novedades se guardan en esa misma caché, igual que el resto de datos del usuario (se ven sin conexión y se borran al cerrar sesión).
- **Aviso de sincronización:** cuando la cola de pendientes se vacía con al menos un envío exitoso, se muestra un aviso `role="status"` durante 5 s: "Se enviaron N registros pendientes." (singular/plural). Si algunos fallan: "Se enviaron N; M quedan pendientes."

## 5. Auditoría de laboratorio automatizada (Lighthouse)

- `scripts/auditoria.mjs` en la raíz y `npm run auditoria -- --url <base> [--correo --password]` (devDependencies en el `package.json` raíz: `lighthouse` y `chrome-launcher`; Chromium vía `CHROME_PATH` o el de Playwright en `%LOCALAPPDATA%\ms-playwright\chromium-*\chrome-win64\chrome.exe`).
- Páginas: `/login` sin sesión, y `/`, `/consumos`, `/reportes`, `/espacios` con sesión. Para las páginas con sesión, el script hace `POST /api/auth/login`, toma la cookie de refresh y la pasa a Lighthouse con `extraHeaders: { Cookie }` (la app restaura la sesión sola).
- Perfiles **móvil** (emulación por defecto de Lighthouse) y **escritorio**.
- Categorías: rendimiento, accesibilidad, buenas prácticas y SEO. **Umbrales**: accesibilidad ≥ 95, buenas prácticas ≥ 95, SEO ≥ 90, rendimiento ≥ 85 en móvil y ≥ 90 en escritorio. El comando termina con código distinto de 0 si alguna página no los cumple.
- Salida en `docs/auditoria/<AAAA-MM-DD>/`: un HTML por página y perfil, y `resumen.md` con la tabla de puntajes y las métricas de laboratorio (LCP, CLS, TBT, FCP, Speed Index).
- Se corre primero contra el build de producción local (para corregir) y al final contra https://cuidagro.onrender.com (con el servicio despierto).

## 6. Correcciones

Todo lo que Lighthouse marque en accesibilidad, buenas prácticas y SEO se corrige (contraste, etiquetas, `lang`, `meta description`, nombres accesibles, tamaños de toque, `robots.txt`, imágenes con tamaño explícito, etc.). En rendimiento se atienden las oportunidades razonables (imágenes, carga diferida, compresión `compression` en Express si no está, caché de estáticos). Cada corrección se anota en el informe.

## 7. Informe `docs/auditoria-pwa.md`

1. Alcance, criterios y técnicas (según la Sesión 23).
2. **Lista de chequeo** por dimensión (instalabilidad y manifiesto, service worker y offline, rendimiento y Core Web Vitals, seguridad, accesibilidad, SEO, compatibilidad y responsive) con estado y **evidencia** (archivo, prueba automática, informe de Lighthouse o captura).
3. Resultados de laboratorio **antes y después** (tablas de puntajes).
4. Pruebas de campo: cómo se recogen, umbrales y primeros datos de la pantalla Calidad (si hay).
5. Seguridad: encabezados reales de producción (`curl -I`) y revisión de la Sesión 22.
6. Regresión automatizada: suites existentes (backend, frontend) y `npm run auditoria`.
7. Hallazgos que quedan abiertos, priorizados.

## Permisos

| Permiso | ADMINISTRADOR | VETERINARIO | AYUDANTE |
|---|---|---|---|
| `calidad:consultar` (nuevo) | sí | no | no |

## Pruebas exigidas

- Backend: `POST /api/metricas` (204, JSON y `text/plain`, 400 por nombre/valor/ruta inválidos, más de 10 métricas, cuerpo grande, límite por IP, la calificación la calcula el servidor); `GET /api/metricas/resumen` (p75 y distribución comprobados con datos sembrados, filtros, 403 para VETERINARIO y AYUDANTE, 401 sin sesión); encabezado `Permissions-Policy`; `index.html` con nonce distinto en cada petición y coherente con su CSP; el resto de rutas sin `'unsafe-inline'` en `style-src`.
- Frontend: componente de contraseña (alterna tipo, `aria-pressed`, conserva valor); cálculo del aviso de sincronización; envío de métricas (agrupa, usa `sendBeacon`, no envía sin conexión); límite de la caché si la lógica es probable fuera del SW.
- Suites completas en verde y `ng build` sin errores.
- E2E (QA): login con el botón de contraseña, pantalla Calidad con datos, aviso de sincronización tras volver la conexión, sin violaciones de CSP en ninguna pantalla (incluidos modales y gráficos), 375 px sin scroll horizontal.

## Decisiones y motivos

| Decisión | Motivo |
|---|---|
| `POST /api/metricas` sin sesión, con esquema estricto, 4 KB y 60 envíos por minuto por IP; la calificación la calcula el servidor | `sendBeacon` no envía encabezados; no se guardan usuario ni IP |
| Se reemplazan todas las apariciones de `__CSP_NONCE__` | El build de Angular copia el nonce en `ngcspnonce`, los `modulepreload`, la hoja de estilos y el script |
| El build falla si `sw.js` tiene un error de sintaxis (`frontend/scripts/sw-precache.mjs`) | El service worker no pasa por el compilador; un comentario con `*/` dentro rompió el archivo durante el desarrollo |
| Las fotos de las novedades sí se guardan en la caché de la API | Se ven sin conexión; se borran al cerrar sesión como el resto de datos del usuario |
| El aviso de sincronización solo aparece cuando sincroniza la app | Si sincroniza el service worker sin pestañas abiertas no hay dónde mostrarlo |
| Los valores de métricas fuera de rango se ajustan al límite en el cliente | Un dato atípico no hace rechazar todo el envío |
| `robots.txt` propio, portada de Inicio con `srcset` y `scrollbar-gutter: stable` | Correcciones de la auditoría: SEO 92 → 100 y CLS de hasta 0,888 → 0 |
| El aviso "Aún no hay una finca" espera a que cargue la lista de fincas | Se dibujaba y desaparecía al cargar, con desplazamiento del contenido |

## Cómo se verificó (2026-11-27)

- Backend: suite completa; 2 pruebas antiguas que calculaban "hoy" en UTC se corrigieron para usar la fecha de Bogotá.
- Frontend: 72 pruebas en 7 archivos y `ng build` sin errores ni advertencias.
- Lighthouse en local (modo producción): tablas antes y después en `docs/auditoria-pwa.md` e informes HTML en `docs/auditoria/`.

## Pendientes

- Rendimiento móvil de `/` (81) y `/consumos` (84) por debajo del umbral de 85, por el coste de arranque de JavaScript con la CPU emulada; en escritorio dan 99 y 100.
- Medir con `npm run auditoria` contra https://cuidagro.onrender.com después del despliegue.
- Datos de campo reales en la pantalla Calidad (llegan con el uso).
- Pruebas en dispositivo real (instalación, cámara, GPS, push), con teclado y lector de pantalla, y en Firefox y Safari.
