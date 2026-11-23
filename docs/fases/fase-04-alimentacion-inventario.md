# Fase 4. Alimentación e inventario

**Estado:** en construcción (2026-11-18).
**Historias:** HU008 a HU011. Cubre las HU oficiales del Excel "Registrar alimento", "Registrar alimento consumido vacuno" y "Registrar alimento consumido ovíparo".

| HU | Alcance supuesto |
|---|---|
| HU008 | Registrar alimento (nombre, tipo, cantidad) y consultar el inventario |
| HU009 | Registrar entradas de inventario y ver movimientos; alerta de stock bajo |
| HU010 | Registrar alimento consumido por un vacuno (gramos, animal, jornada, fecha) |
| HU011 | Registrar alimento consumido por un lote de ovíparos (gramos, lote, jornada, fecha) |

Decisiones del usuario (2026-11-18): jornada `MANANA`, `TARDE`, `NOCHE`. El consumo descuenta inventario y **se permite stock negativo** con alerta (no se rechaza un registro de campo por falta de stock).

## Contrato (fuente común para desarrollo, pruebas y datos)

### Modelo de datos (migración `20261118100000_alimentacion_inventario`)

Todas las cantidades se guardan en **gramos enteros** (`Int`). La interfaz las muestra en kg cuando conviene.

Enums nuevos:
- `TipoAlimento`: `CONCENTRADO`, `FORRAJE`, `GRANO`, `SUPLEMENTO`, `SAL_MINERAL`, `OTRO`
- `Jornada`: `MANANA`, `TARDE`, `NOCHE`

`Alimento` (tabla `alimentos`): `id`, `fincaId`, `nombre` (2–80, único por finca sin distinguir mayúsculas con índice `(finca_id, lower(nombre))` escrito a mano, también para inactivos), `tipo`, `stockGramos` Int (puede ser negativo), `stockMinimoGramos` Int ≥ 0 (default 0), `estado` (`EstadoRegistro`), `motivoBaja`, `observaciones` ≤ 1000, `creadoPorId`, timestamps.

`EntradaAlimento` (tabla `entradas_alimento`): `id`, `alimentoId`, `cantidadGramos` 1–100 000 000, `fecha` Date no futura, `nota` ≤ 500 opcional, `registradoPorId`, `createdAt`.

`ConsumoVacuno` (tabla `consumos_vacunos`): `id`, `vacunoId`, `alimentoId`, `cantidadGramos` 1–200 000, `jornada`, `fecha` Date no futura, `observaciones` ≤ 500, `registradoPorId`, timestamps. Único `(vacuno_id, alimento_id, fecha, jornada)`.

`ConsumoLote` (tabla `consumos_lotes`): igual con `loteId` y `cantidadGramos` 1–10 000 000. Único `(lote_id, alimento_id, fecha, jornada)`.

La finca del consumo es la del animal/lote. Al crear, el animal/lote y el alimento deben estar `ACTIVO`, ser accesibles para el actor y pertenecer a la **misma finca** (si no: 400 `VALIDACION` con el campo correspondiente; si no existen o son ajenos: 404).

**Stock:** cada entrada suma y cada consumo resta, en la misma transacción que crea/edita/borra el registro (`increment`/`decrement`). Editar un consumo aplica la diferencia (y si cambia de alimento, devuelve al anterior y descuenta del nuevo). Borrar un consumo devuelve la cantidad. `bajoStock = stockGramos <= stockMinimoGramos`.

### Permisos

| Permiso | ADMIN | VETERINARIO | AYUDANTE |
|---|---|---|---|
| `alimentos:consultar` | sí | sí | sí |
| `alimentos:gestionar` (crear/editar alimento, baja, entradas) | sí | sí | no |
| `consumos:registrar` (crear y consultar consumos) | sí | sí | sí |
| `consumos:gestionar` (editar/borrar cualquier consumo) | sí | sí | no |

El ayudante puede editar o borrar **sus propios** consumos solo si `fecha` del registro es hoy (America/Bogota) y lo creó él; si no, 403. Alcance por finca como en la Fase 3 (ajeno → 404).

### API

`/api/alimentos`:

| Ruta | Permiso | Notas |
|---|---|---|
| `GET /` | consultar | Query: `fincaId`, `estado` (ACTIVO por defecto, INACTIVO, TODOS), `q`, `tipo`, `bajoStock=true`. Orden por nombre en español (reusar el collator de `lib/registros.js`). |
| `GET /:id` | consultar | |
| `POST /` | gestionar | `{ fincaId, nombre, tipo, stockInicialGramos?, stockMinimoGramos?, observaciones? }`. `stockInicialGramos` > 0 crea una `EntradaAlimento` con nota "Stock inicial" (es la "cantidad" del Excel). 201 |
| `PATCH /:id` | gestionar | `nombre`, `tipo`, `stockMinimoGramos`, `observaciones`. El stock nunca se edita directo |
| `PATCH /:id/estado` | gestionar | Igual que Fase 3 |
| `POST /:id/entradas` | gestionar | `{ cantidadGramos, fecha?, nota? }` (fecha por defecto hoy). Solo alimentos ACTIVO. 201 con `{ entrada, alimento }` |
| `GET /:id/movimientos` | consultar | Entradas y consumos (vacunos y lotes) del alimento, más recientes primero, máximo 100: `{ tipo: 'ENTRADA'|'CONSUMO_VACUNO'|'CONSUMO_LOTE', id, fecha, cantidadGramos (positiva en entradas, negativa en consumos), detalle (nota o nombre del animal/lote), registradoPor: {id,nombre} }` |

Respuesta de alimento: campos del modelo + `bajoStock` + `finca {id,nombre}`.

`/api/consumos/vacunos` y `/api/consumos/lotes`:

| Ruta | Permiso | Notas |
|---|---|---|
| `GET /` | registrar | Query: `fincaId`, `vacunoId`/`loteId`, `alimentoId`, `jornada`, `desde`, `hasta` (YYYY-MM-DD, inclusive). Orden: fecha desc, jornada (NOCHE, TARDE, MANANA), nombre. Máximo 500. |
| `GET /:id` | registrar | |
| `POST /` | registrar | `{ vacunoId|loteId, alimentoId, cantidadGramos, jornada, fecha, observaciones? }`. 201. Duplicado (mismo animal, alimento, fecha y jornada) → 409 `DUPLICADO` |
| `PATCH /:id` | registrar + regla de ayudante | `alimentoId`, `cantidadGramos`, `jornada`, `fecha`, `observaciones`. No cambia el animal/lote |
| `DELETE /:id` | registrar + regla de ayudante | 204, devuelve el stock |

Respuesta de consumo: campos + `vacuno {id,nombre}` o `lote {id,nombre}`, `alimento {id,nombre,stockGramos,bajoStock}` (estado **después** de la operación), `finca {id,nombre}`, `registradoPor {id,nombre}`, fecha `YYYY-MM-DD`.

Errores como en la Fase 3: 400 `VALIDACION`, 401, 403, 404, 409 `DUPLICADO`.

### Frontend

- `/alimentos` (guard `alimentos:consultar`): inventario de la finca activa con stock en kg (y g), insignia de stock bajo y negativo, filtros, crear/editar/baja (con `alimentos:gestionar`), registrar entrada (modal) y ver movimientos.
- `/consumos` (guard `consumos:registrar`): pensada para el celular del ayudante. Pestañas Vacunos / Lotes. Formulario rápido: animal o lote (solo activos), alimento (solo activos, mostrando stock), cantidad en gramos con atajo para escribir kg, jornada preseleccionada según la hora en Bogotá (antes de 12 mañana, antes de 18 tarde, si no noche), fecha hoy por defecto. Al guardar, aviso visible si el alimento quedó en stock bajo o negativo. Debajo, lista de consumos filtrable (por defecto hoy) con editar/borrar según la regla de permisos.
- Menú: "Inventario" y "Alimentación" según permiso. 375 px sin scroll horizontal, estado en `signal`, columnas de acción solo si hay acciones (lección de la Fase 3).

## Decisiones y motivos

Se completa al cerrar la fase.

## Cómo verificar

Se completa al cerrar la fase.
