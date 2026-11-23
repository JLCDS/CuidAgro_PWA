# CuidAgro

PWA para el monitoreo y cuidado de animales de granja: vacunos individuales y lotes de aves.

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22 + TypeScript |
| Backend | Node.js 24 + Express 5 en JavaScript |
| Base de datos | PostgreSQL 17 + Prisma 7 |
| Autenticación | JWT de acceso + refresh token rotativo en cookie `httpOnly` |

## Estado del desarrollo

| Fase | Historias | Estado |
|---|---|---|
| Autenticación y usuarios | HU001, HU002, HU003 | Implementada |
| Animales y lotes | HU004 a HU007 | Implementada |
| Alimentación e inventario | HU008 a HU011 | Implementada |
| Salud y novedades | HU012 a HU015 | Pendiente |
| Medicamentos y tratamientos | HU016, HU017 | Pendiente |
| Dashboard y reportes | HU018, HU019 | Pendiente |
| PWA y offline | HU020, HU021 | Pendiente |

El contexto y las decisiones de cada fase están en [docs/fases](docs/fases/README.md).

## Requisitos

- Node.js 24.11 o superior
- Docker Desktop encendido (ejecuta PostgreSQL)

## Puesta en marcha

```bash
npm run instalar
cp backend/.env.example backend/.env
```

En `backend/.env` define `JWT_SECRET` (mínimo 32 caracteres) y `SEED_ADMIN_PASSWORD` (mínimo 8). Luego:

```bash
npm run db:up        # inicia PostgreSQL
npm run db:migrate   # crea las tablas
npm run db:seed      # crea los roles y el primer administrador
npm run dev          # API en :3000 y app en http://localhost:4200
```

Entra con `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD`. El orden de uso es: crear una finca y después los usuarios que trabajan en ella.

## Pruebas

```bash
npm test                          # backend, contra la base cuidagro_test
npm test --prefix frontend -- --watch=false
```

Las pruebas del backend necesitan la base de datos encendida. Si creaste el contenedor antes de que existiera `docker/init-test-db.sql`, recrea el volumen con `docker compose down -v`.

## Estructura

```
backend/
  prisma/           modelo, migraciones y seed
  src/config        variables de entorno validadas
  src/lib           contraseñas, tokens, roles y permisos
  src/middleware    autenticación, permisos y errores
  src/modules       auth, usuarios, fincas, vacunos, lotes, alimentos, consumos
  tests/            pruebas de integración
frontend/src/app/
  core/             sesión, interceptor, guards y clientes de la API
  compartido/       componentes reutilizables
  layout/           estructura con menú
  paginas/          login, inicio, usuarios, fincas, vacunos, lotes, inventario y consumos
```

## API

Todas las rutas usan el prefijo `/api`. Los errores responden `{ "error": { "codigo", "mensaje", "detalles?" } }`.

| Método y ruta | Acceso |
|---|---|
| `POST /auth/login` | Público, con límite de intentos fallidos |
| `POST /auth/refresh`, `POST /auth/logout` | Cookie de sesión |
| `GET /auth/me` | Autenticado |
| `GET /fincas`, `GET /fincas/:id` | Autenticado, solo sus fincas (el administrador ve todas) |
| `POST /fincas`, `PATCH /fincas/:id` | Administrador |
| `GET /usuarios`, `GET /usuarios/:id` | Administrador |
| `POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/estado` | Administrador |
| `GET /vacunos`, `GET /vacunos/:id` | `animales:consultar`, solo sus fincas. Filtros: `fincaId`, `estado` (`ACTIVO`, `INACTIVO`, `TODOS`), `q`, `proposito` |
| `POST /vacunos`, `PATCH /vacunos/:id`, `PATCH /vacunos/:id/estado` | `animales:gestionar` (administrador y veterinario). El estado da de baja o reactiva |
| `GET /lotes`, `GET /lotes/:id` | `animales:consultar`, solo sus fincas. Mismos filtros que vacunos |
| `POST /lotes`, `PATCH /lotes/:id`, `PATCH /lotes/:id/estado` | `animales:gestionar` (administrador y veterinario) |
| `GET /alimentos`, `GET /alimentos/:id`, `GET /alimentos/:id/movimientos` | `alimentos:consultar`, solo sus fincas. Filtros: `fincaId`, `estado`, `q`, `tipo`, `bajoStock=true` |
| `POST /alimentos`, `PATCH /alimentos/:id`, `PATCH /alimentos/:id/estado`, `POST /alimentos/:id/entradas` | `alimentos:gestionar` (administrador y veterinario). El stock solo cambia con entradas y consumos |
| `GET /consumos/vacunos`, `GET /consumos/lotes` y `GET /:id` de cada uno | `consumos:registrar` (todos los roles), solo sus fincas. Filtros: `fincaId`, `vacunoId`/`loteId`, `alimentoId`, `jornada`, `desde`, `hasta` |
| `POST /consumos/vacunos`, `POST /consumos/lotes` | `consumos:registrar`. Descuenta el inventario (puede quedar negativo, con alerta) |
| `PATCH /consumos/{vacunos,lotes}/:id`, `DELETE /consumos/{vacunos,lotes}/:id` | Administrador y veterinario sobre cualquiera; el ayudante solo sobre los suyos del día. Ajustan o devuelven el stock |

## Permisos

Los permisos son fijos por rol y se definen en `backend/src/lib/roles.js`. La API los envía al frontend con la sesión; el frontend solo los usa para mostrar u ocultar opciones, y la autorización real ocurre en el backend en cada petición.

- **Administrador:** alcance global, sin fincas asignadas.
- **Veterinario y ayudante:** necesitan al menos una finca y solo acceden a las suyas.
- Siempre debe quedar un administrador activo.
