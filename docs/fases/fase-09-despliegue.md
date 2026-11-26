# Fase 9. Pruebas finales y despliegue

**Estado:** en curso (2026-11-25). Código listo para Render; falta crear el servicio y probar en Android.

> Decidido con el usuario (2026-11-25): desplegar hoy en un servicio gratuito, probar en dispositivos Android. Se descartó GitHub Pages porque solo sirve archivos estáticos (no corre la API ni PostgreSQL) y, con el frontend en otro dominio, la cookie de sesión no viaja. Se eligió Render (plan gratuito) con un túnel de Cloudflare como plan B.

## Qué se cambió y por qué

| Cambio | Motivo |
|---|---|
| La API sirve el build de Angular (`backend/src/app.js`, `servirFrontend`) con respaldo a `index.html` | Frontend y API en el mismo origen: la cookie `SameSite=Strict` limitada a `/api/auth` funciona sin CORS. `sw.js`, `index.html` y el manifiesto van con `no-cache`; los archivos con hash, con caché de un año |
| Fotos de novedades en la tabla `fotos` (migración `20261125000000_fotos_en_bd`), ya no en disco. Se quitó `UPLOADS_DIR` | El disco del plan gratuito de Render se borra al reiniciar, redesplegar o dormir el servicio. `novedades.foto_archivo` sigue siendo la clave, así que el servicio de novedades no cambió (solo `lib/fotos.js`) |
| CSP de `helmet` con `img-src 'self' data: blob:` | Las fotos autenticadas y la vista previa se muestran como `blob:` |
| `inlineCritical: false` en el build de producción de Angular | El CSS crítico en línea agrega un `<script>` en línea que la CSP (`script-src 'self'`) bloquea: la app quedaba sin estilos |
| `render.yaml` (Blueprint) | Servicio web y PostgreSQL gratuitos en Virginia; migraciones y seed en cada arranque (ambos idempotentes) |

Las fotos que había en `backend/uploads/` en desarrollo local no se migran: esas novedades responden 404 al pedir la foto.

## Desplegar en Render

1. Subir el repositorio a GitHub con la rama `main` actualizada.
2. En Render: **New > Blueprint**, elegir el repositorio. Render lee `render.yaml` y pide los valores marcados `sync: false`:
   - `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD`: el primer administrador (la contraseña debe cumplir la política de `auth.schemas.js`).
   - `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: generarlas con `npx web-push generate-vapid-keys` en `backend/`. Si se dejan vacías, la app funciona sin push.
3. Esperar el build (instala backend y frontend, compila Angular y genera Prisma). Al arrancar aplica migraciones y crea roles y administrador.
4. Abrir `https://<servicio>.onrender.com` y entrar con el administrador.

Variables fijadas en `render.yaml`: `NODE_VERSION=24`, `NODE_ENV=production` (cookie `Secure`), `TRUST_PROXY=1` (proxy de Render, para la IP real en el límite de intentos), `DATABASE_URL` desde la base y `JWT_SECRET` generado por Render.

### Límites del plan gratuito

- El servicio se duerme tras 15 minutos sin tráfico y tarda alrededor de un minuto en despertar: abrir la app antes de la presentación.
- La base gratuita vence a los 30 días de creada.
- Mientras el servicio duerme no corre la revisión de vencimientos cada 6 horas; se hace al despertar.

## Plan B: túnel de Cloudflare desde un PC

Sirve si Render falla. La app corre en el PC y Cloudflare da una URL `https://` pública.

```bash
npm run db:up && npm run db:migrate && npm run db:seed
npm run build --prefix frontend
cd backend && NODE_ENV=production PORT=3000 node src/server.js
# en otra terminal (cloudflared instalado; no requiere cuenta):
cloudflared tunnel --url http://localhost:3000
```

La URL cambia cada vez que se reinicia el túnel: hay que reinstalar la app y reactivar las notificaciones en el celular.

## Cómo se verificó (2026-11-25)

- Suite completa del backend con las fotos en la base.
- Build de producción servido por Express en modo `production` contra `cuidagro_qa`, con Playwright a 375 px: estilos cargados, sin violaciones de CSP, login con cookie `HttpOnly; Secure; SameSite=Strict`, sesión restaurada al recargar una ruta profunda, novedad con foto guardada y leída desde la base sin cambios, service worker controlando la página, manifiesto, apertura sin conexión y sin scroll horizontal.

## Pendiente

- [ ] Crear el Blueprint en Render y verificar el despliegue.
- [ ] Probar en Android (Chrome): instalar, cámara, GPS, modo avión con registro y sincronización, y notificaciones.
- [ ] Pasar `desarrollo` a `main`.
