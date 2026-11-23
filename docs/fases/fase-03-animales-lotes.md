# Fase 3. Animales y lotes

**Estado:** terminada (2026-11-18), en revisión del equipo.
**Historias:** HU004 a HU007. Cubre las HU oficiales del Excel "Registrar vacuno" y "Registrar lote de ovíparo".

| HU | Alcance supuesto |
|---|---|
| HU004 | Registrar vacuno |
| HU005 | Consultar, editar y dar de baja / reactivar vacunos |
| HU006 | Registrar lote de ovíparos |
| HU007 | Consultar, editar y dar de baja / reactivar lotes |

## Contrato (fuente común para desarrollo, pruebas y datos)

### Modelo de datos (migración `20261118000000_animales_lotes`)

Enums:
- `Sexo`: `MACHO`, `HEMBRA`
- `PropositoVacuno`: `ALIMENTACION`, `PRODUCCION_LECHERA`, `ENGORDE`
- `PropositoLote`: `PRODUCCION`, `ALIMENTACION`
- `EstadoRegistro`: `ACTIVO`, `INACTIVO` (baja lógica, nunca se borra: la alimentación de la Fase 4 los referenciará)

`Vacuno` (tabla `vacunos`): `id` uuid, `fincaId`, `nombre` (2–80), `sexo`, `raza` (2–80), `edadMeses` entero 0–480, `peso` Decimal(7,2) en kg, > 0 y ≤ 2000, `fechaLlegada` fecha (`@db.Date`, no futura), `proposito`, `estado` (default ACTIVO), `motivoBaja` texto opcional ≤ 500, `observaciones` opcional ≤ 1000, `creadoPorId` (usuario, `onDelete: Restrict`), `createdAt`, `updatedAt`.
Nombre único por finca sin distinguir mayúsculas (índice único sobre `finca_id, lower(nombre)` en SQL de la migración + validación en el servicio con `mode: 'insensitive'`), porque la alimentación identifica al vacuno por nombre.

`LoteOviparo` (tabla `lotes_oviparos`): `id`, `fincaId`, `nombre` (identificador, 2–80, único por finca igual que vacunos), `tipoAve` opcional ≤ 80 (ej. gallinas ponedoras), `edadMinSemanas` y `edadMaxSemanas` enteros 0–520 con min ≤ max, `cantidad` entero 1–100000, `proposito`, `fechaIngreso` fecha opcional no futura, `estado`, `motivoBaja`, `observaciones`, `creadoPorId`, `createdAt`, `updatedAt`.

### Permisos (`backend/src/lib/roles.js` y tipo `Permiso` del frontend)

| Permiso | ADMINISTRADOR | VETERINARIO | AYUDANTE |
|---|---|---|---|
| `animales:consultar` | sí | sí | sí |
| `animales:gestionar` | sí | sí | no |

Alcance: el administrador ve todo; los demás solo sus fincas, y el ayudante ve toda su finca (decisión abierta, suposición recomendada). Un recurso de finca ajena responde **404**, igual que uno inexistente. Crear en finca ajena → 404 `Finca no encontrado`.

### API

Mismo patrón para `/api/vacunos` y `/api/lotes`:

| Método y ruta | Permiso | Notas |
|---|---|---|
| `GET /` | consultar | Query opcional: `fincaId`, `estado` (`ACTIVO` por defecto, `INACTIVO`, `TODOS`), `q` (busca en nombre, y raza en vacunos), `proposito`. Orden por nombre. Devuelve arreglo. |
| `GET /:id` | consultar | 404 si no existe, es ajeno o el id no es uuid |
| `POST /` | gestionar | 201. `fincaId` obligatorio |
| `PATCH /:id` | gestionar | Parcial. `fincaId` y `estado` no se cambian aquí |
| `PATCH /:id/estado` | gestionar | `{ estado, motivoBaja? }`. Al reactivar se limpia `motivoBaja` |

Respuesta: el registro con fechas `fechaLlegada`/`fechaIngreso` como `YYYY-MM-DD`, `peso` como número, y `finca: { id, nombre }`.

Errores: validación 400 `VALIDACION` (como el resto del proyecto), sin token 401, sin permiso 403, nombre duplicado en la finca 409 `DUPLICADO`.

### Frontend

- Servicio de **finca activa** (signal, recordada en `localStorage` con try/catch): selector en el layout cuando el usuario tiene más de una finca; el administrador elige entre todas. Listas y formularios usan esa finca.
- Páginas `/vacunos` y `/lotes` (guard `animales:consultar`), con menú según permiso: lista con búsqueda, filtro por propósito y estado, formulario en el modal existente para crear/editar, dar de baja con motivo y reactivar. Botones de gestión solo con `animales:gestionar`.
- Debe verse bien a 375 px sin scroll horizontal. Estado en `signal` (la app corre sin `zone.js`).

## Qué se construyó

| Capa | Archivos |
|---|---|
| Modelo | `schema.prisma` (enums y modelos `Vacuno`, `LoteOviparo`), migración `20261118000000_animales_lotes` |
| Backend | `modules/vacunos/`, `modules/lotes/`, utilidades comunes en `lib/registros.js`, serializadores `aVacuno`/`aLote`, helpers `duplicado()` y `validacion()` en `lib/errors.js` |
| Frontend | `core/finca-activa.ts`, `core/vacunos-api.ts`, `core/lotes-api.ts`, `compartido/baja-dialogo.ts`, `paginas/vacunos.ts`, `vacuno-form.ts`, `lotes.ts`, `lote-form.ts`, selector de finca y menú en `layout/shell.ts` |

## Decisiones y motivos

| Decisión | Motivo |
|---|---|
| Edad del vacuno en meses; rango de edad del lote en semanas | El Excel solo pide "edad numérica"; son las unidades usuales en ganado y aves. |
| Nombre único por finca sin distinguir mayúsculas, también para registros inactivos | La alimentación (Fase 4) identifica al animal por nombre; reutilizar un nombre confundiría el historial. |
| Baja lógica (`estado` + `motivoBaja`), nunca borrado | Los consumos y novedades futuros referencian al animal. |
| `motivoBaja` opcional en la API, obligatorio en la interfaz | La API no rechaza integraciones simples; el usuario siempre deja el motivo. |
| El ayudante consulta toda su finca pero no gestiona animales | Suposición recomendada de la Fase 2; registra alimentación y novedades en fases siguientes. |
| `GET /?fincaId=<ajena>` responde `[]` | Mismo efecto que 404 sin revelar nada; los recursos concretos sí responden 404. |
| `fincaId` y `estado` enviados en `PATCH /:id` se ignoran | Zod descarta claves desconocidas; la baja va por `PATCH /:id/estado`. |
| Orden de listados con `Intl.Collator('es', { sensitivity: 'base', numeric: true })` en JS | La collation de la BD (`en_US`) ponía la Ñ después de la Z y separaba mayúsculas. Las listas son por finca y pequeñas. |
| Unicidad verificada con SQL `lower()` y P2002 traducido a 409 | Coincide con el índice único y cubre la carrera entre dos altas simultáneas. |

## Cómo verificar

```bash
npm test                                     # 146 pruebas de backend (103 nuevas + 4 de orden)
npm test --prefix frontend -- --watch=false  # 8 pruebas de frontend
npm run build
```

Resultado al cerrar la fase: 146/146 y 8/8, build correcto (verificado por el coordinador).

Además se verificó con un entorno QA aislado (base `cuidagro_qa`, API en :3190, scripts fuera del repo):
- Inyección por API de 3 fincas, 5 usuarios, 25 vacunos y 8 lotes, y 153 comprobaciones de permisos, alcance y filtros.
- Recorrido en Chromium con Playwright a 1280 y 375 px con administrador, veterinario de 2 fincas y ayudante: crear, editar, duplicado, baja con motivo, reactivar, filtros, persistencia de la finca activa, sin errores de consola ni 5xx.

**No probado:** celular físico. La búsqueda no ignora tildes (`tizon` no encuentra "Tizón"); el contrato no lo exige.

## Particularidades técnicas

- Los índices únicos `(finca_id, lower(nombre))` están escritos a mano en la migración porque Prisma no los modela. Al generar migraciones futuras con `prisma migrate diff`, revisar que el SQL no los elimine.
- No correr dos `vitest` a la vez contra `cuidagro_test`: el `TRUNCATE` de `setup.js` hace fallar al otro proceso.
- "Hoy" se calcula en `America/Bogota` (`hoyBogota` en backend y frontend) para validar fechas no futuras.
- La finca activa se guarda en `localStorage`; si la finca guardada ya no es accesible, se toma la primera disponible.

## Pendientes para fases siguientes

- Fase 4: los consumos referencian `vacunoId` / `loteId` y solo deben aceptar registros `ACTIVO` de una finca accesible.
- Búsqueda sin tildes (extensión `unaccent`) si el equipo la quiere.
