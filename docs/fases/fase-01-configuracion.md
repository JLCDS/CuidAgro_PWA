# Fase 1. Análisis y configuración

**Estado:** terminada (2026-11-09), construida junto con la Fase 2.

## Objetivo y alcance

Partir de una carpeta vacía y dejar la base mínima del proyecto: backend, frontend, base de datos y variables de entorno.

## Punto de partida

- La carpeta del proyecto estaba vacía.
- Los proyectos del curso en `Documents/PWA` usan Express, JavaScript sin framework, jQuery, `sw.js` escrito a mano, PouchDB, Background Sync y `web-push`. Ninguno usa Angular.
- Alcance oficial del curso: 7 historias en el Excel del grupo 3. La especificación técnica de 21 HU lo amplía.

## Qué se construyó

| Elemento | Ubicación |
|---|---|
| Scripts raíz (`instalar`, `dev`, `db:*`, `test`, `build`) | `package.json` |
| PostgreSQL 17 en `127.0.0.1:5433`, con base de pruebas `cuidagro_test` | `docker-compose.yml`, `docker/init-test-db.sql` |
| API Express 5 con helmet, errores uniformes y `GET /api/health` | `backend/src/app.js` |
| Variables de entorno validadas con Zod al arrancar | `backend/src/config/env.js`, `backend/.env.example` |
| Prisma 7 con adaptador `pg` | `backend/prisma/`, `backend/src/lib/prisma.js` |
| Pruebas de integración con Vitest y Supertest | `backend/tests/` |
| Angular 22 sin `zone.js`, con proxy `/api` hacia `:3000` | `frontend/`, `frontend/proxy.conf.json` |
| Tema visual (verde, tierra, crema) y estilos globales | `frontend/src/styles.css` |

## Decisiones y motivos

| Decisión | Motivo |
|---|---|
| Angular + TypeScript en el frontend | Elección del equipo. Angular exige TypeScript. |
| Express en JavaScript | Es lo visto en clase. |
| PostgreSQL + Prisma | Sugerido por la especificación; el dominio es relacional. |
| Carpetas `backend/` y `frontend/` independientes | Usan lenguajes distintos, así que un monorepo con paquete compartido no aporta. |
| Sin matriz de permisos duplicada | La API envía los permisos del usuario junto con la sesión. |
| CSS propio, sin Tailwind | Evita una dependencia y cubre lo necesario. |

## Cómo verificar

```bash
npm run db:up
npm run db:migrate
npm run dev        # http://localhost:4200
```

## Particularidades técnicas

- El puerto 5433 evita conflictos con un PostgreSQL local.
- `init-test-db.sql` solo corre al crear el volumen. Si falta `cuidagro_test`, usar `docker compose down -v`, lo que borra también los datos locales.
- Prisma usa el generador `prisma-client-js`: el generador nuevo `prisma-client` produce TypeScript y el backend es JavaScript.
- Prisma está fijado en 7.10.1, porque la etiqueta `latest` de `prisma` en npm apuntaba a una RC de la 8.
- npm muestra avisos de `allow-scripts` al instalar. Generar el cliente, migrar y compilar funcionaron sin aprobar esos scripts.

## Pendientes

- No se configuró ESLint en el backend.
- `git init` está hecho, sin ningún commit.
- El icono actual es solo el favicon; los iconos de PWA van en la Fase 8.
