# Fase 5. Salud y novedades

**Estado:** en construcción (2026-11-23).
**Historias:** HU012 a HU015. Cubre la HU oficial del Excel "Registrar novedades: descripción, captura de foto, ubicación GPS, lote de ovíparo".

| HU | Alcance supuesto |
|---|---|
| HU012 | Registrar novedad con descripción, foto de la cámara y ubicación GPS, sobre un lote de ovíparos o un vacuno |
| HU013 | Consultar novedades, comentarlas y darles seguimiento (abierta, en seguimiento, cerrada) |
| HU014 | Registrar casos de salud (animal o lote enfermo): diagnóstico, síntomas, estado y cierre |
| HU015 | Consultar enfermos actuales e historial de salud de un vacuno o lote (casos y novedades) |

> La especificación técnica de 21 HU no está en el repositorio. Este alcance es una suposición del coordinador, basada en la HU del Excel y en el prompt ampliado, que pide novedades de animal o de lote, enfermos y comentarios. Pendiente de confirmar con el equipo. Las notificaciones push quedan para la Fase 8.

## Contrato (fuente común para desarrollo, pruebas y datos)

### Modelo de datos (migración `20261123000000_salud_novedades`)

Enums nuevos:
- `TipoNovedad`: `ENFERMEDAD`, `LESION`, `MUERTE`, `COMPORTAMIENTO`, `PRODUCCION`, `INFRAESTRUCTURA`, `OTRO`
- `PrioridadNovedad`: `BAJA`, `MEDIA`, `ALTA`
- `EstadoNovedad`: `ABIERTA`, `EN_SEGUIMIENTO`, `CERRADA`
- `EstadoCasoSalud`: `EN_OBSERVACION`, `EN_TRATAMIENTO`, `RECUPERADO`, `FALLECIDO`. Los dos primeros cuentan como **activos**.

`Novedad` (tabla `novedades`):
- `id`, `fincaId` (se toma del animal o lote), `vacunoId?`, `loteId?`. Debe haber **exactamente uno** de los dos: `CHECK` en el SQL de la migración y validación 400 en el servicio.
- `tipo`, `prioridad` (por defecto `MEDIA`), `descripcion` (5–2000), `fechaHora` (timestamptz; por defecto ahora; no más de 5 minutos en el futuro).
- `latitud` Decimal(9,6) entre -90 y 90, `longitud` Decimal(9,6) entre -180 y 180: opcionales, pero van juntas. `precisionMetros` Int 0–100 000, opcional.
- `fotoArchivo?` (nombre generado por el servidor), `fotoMime?`, `fotoBytes?`.
- `estado` (por defecto `ABIERTA`), `cerradaEn?`, `registradoPorId`, timestamps.
- Índices `(finca_id, fecha_hora)`, `vacuno_id`, `lote_id`.

`ComentarioNovedad` (tabla `comentarios_novedad`): `id`, `novedadId` (`onDelete: Cascade`), `autorId`, `texto` (1–1000), `createdAt`.

`CasoSalud` (tabla `casos_salud`):
- `id`, `fincaId`, `vacunoId?` / `loteId?` (exactamente uno, con `CHECK`), `novedadId?` (novedad de origen; debe ser del mismo animal o lote, si no 400).
- `diagnostico` (2–200), `sintomas` (≤ 2000, opcional), `estado` (por defecto `EN_OBSERVACION`).
- `fechaInicio` Date no futura, `fechaFin?` Date (≥ `fechaInicio`, no futura).
- `animalesAfectados?` Int: solo para lotes, entre 1 y `lote.cantidad`; en un vacuno debe ir vacío (400).
- `observaciones` (≤ 1000), `registradoPorId`, timestamps.
- Al pasar a `RECUPERADO` o `FALLECIDO`, `fechaFin` es obligatoria y por defecto toma hoy (Bogotá). Al volver a un estado activo se limpia `fechaFin`.
- Marcar `FALLECIDO` **no** da de baja al vacuno automáticamente: la interfaz lo ofrece después.

Para crear un registro, el animal o lote debe estar `ACTIVO` y ser accesible para quien lo crea; si no existe o es de otra finca, 404. Editar no cambia el animal ni el lote.

### Fotos

- Subida con `multipart/form-data` (`multer` con `memoryStorage`, campo `foto`), máximo 5 MB, un archivo.
- Solo JPEG, PNG o WebP, comprobando los **bytes mágicos** y no el `mimetype` declarado. Si no cumple: 400 `VALIDACION` con campo `foto`. Un archivo demasiado grande también responde 400 `VALIDACION`, nunca 500.
- Se guardan en el disco, en `env.UPLOADS_DIR` (nueva variable, por defecto `uploads` relativo a `backend/`). En las pruebas va a un directorio temporal. El nombre es `<uuid>.<ext>` generado en el servidor; nunca se usa el nombre que envía el cliente.
- Si falla la transacción, se borra el archivo escrito. Si se reemplaza o quita la foto, se borra el archivo anterior.
- `GET /api/novedades/:id/foto` exige autenticación y alcance. Responde con su `Content-Type`, `Cache-Control: private, max-age=86400` y `X-Content-Type-Options: nosniff`, o 404 si no hay foto. No hay ruta estática pública para los archivos subidos.
- El frontend reduce la imagen antes de subirla (lado mayor de 1600 px, JPEG con calidad 0,8, usando canvas) y la muestra pidiéndola como blob, porque `<img src>` no envía el token Bearer.

### Permisos (`backend/src/lib/roles.js` y tipo `Permiso` del frontend)

| Permiso | ADMINISTRADOR | VETERINARIO | AYUDANTE |
|---|---|---|---|
| `novedades:registrar` (crear, consultar, comentar) | sí | sí | sí |
| `novedades:gestionar` (editar cualquiera, cambiar estado) | sí | sí | no |
| `salud:consultar` | sí | sí | sí |
| `salud:gestionar` (crear y editar casos) | sí | sí | no |

El ayudante puede editar su propia novedad, y cambiar o quitar su foto, solo si está `ABIERTA` y la creó hoy (fecha de Bogotá de `createdAt`); si no, 403. No puede cambiar el estado. El alcance por finca es el de las Fases 3 y 4: un recurso ajeno responde 404, y un listado con `fincaId` ajena responde `[]`.

### API

`/api/novedades`:

| Ruta | Permiso | Notas |
|---|---|---|
| `GET /` | registrar | Query: `fincaId`, `vacunoId`, `loteId`, `tipo`, `prioridad`, `estado` (sin él, todas), `desde`, `hasta` (YYYY-MM-DD inclusive, días de Bogotá sobre `fechaHora`). Orden por `fechaHora` descendente, máximo 200 |
| `GET /:id` | registrar | Incluye `comentarios` en orden ascendente, cada uno con `autor {id,nombre}` |
| `POST /` | registrar | Multipart (campos + `foto` opcional) **o** JSON sin foto. Campos: `vacunoId`\|`loteId`, `tipo`, `prioridad?`, `descripcion`, `fechaHora?` (ISO), `latitud?`, `longitud?`, `precisionMetros?`. En multipart los números llegan como texto (usar `z.coerce`). Responde 201 |
| `PATCH /:id` | registrar + regla del ayudante | JSON: `tipo`, `prioridad`, `descripcion`, `latitud`, `longitud`, `precisionMetros` (se aceptan `null` para quitar la ubicación) |
| `PUT /:id/foto` | igual que PATCH | Multipart con `foto`; reemplaza. 200 con la novedad |
| `DELETE /:id/foto` | igual que PATCH | 200 con la novedad |
| `GET /:id/foto` | registrar | Bytes de la imagen |
| `PATCH /:id/estado` | gestionar | `{ estado }`. `CERRADA` fija `cerradaEn`; otro estado la limpia |
| `POST /:id/comentarios` | registrar | `{ texto }`. 201 con el comentario. Se puede comentar en cualquier estado |

Respuesta de novedad: los campos del modelo sin `fotoArchivo`, más `latitud` y `longitud` como número o `null`, `tieneFoto` (boolean), `fotoUrl` (`/api/novedades/:id/foto` o `null`), `totalComentarios`, `vacuno {id,nombre}` o `lote {id,nombre}` (el otro en `null`), `finca {id,nombre}` y `registradoPor {id,nombre}`. `fechaHora` va en ISO.

`/api/salud/casos`:

| Ruta | Permiso | Notas |
|---|---|---|
| `GET /` | consultar | Query: `fincaId`, `vacunoId`, `loteId`, `estado`, `activos=true` (`EN_OBSERVACION` y `EN_TRATAMIENTO`). Orden por `fechaInicio` descendente y luego `createdAt` descendente, máximo 500 |
| `GET /:id` | consultar | |
| `POST /` | gestionar | `{ vacunoId\|loteId, novedadId?, diagnostico, sintomas?, estado?, fechaInicio?, fechaFin?, animalesAfectados?, observaciones? }`. `fechaInicio` es hoy por defecto. Responde 201 |
| `PATCH /:id` | gestionar | Parcial; aplica las reglas de `fechaFin` y de estado anteriores |

Respuesta de caso: los campos, con fechas `YYYY-MM-DD`, más `activo` (boolean), `vacuno`/`lote`, `finca`, `novedad {id,tipo,fechaHora}` o `null`, y `registradoPor`.

Los errores siguen el resto del proyecto: 400 `VALIDACION` (con `detalles` por campo), 401, 403 y 404.

### Frontend

- **`/novedades`** (guard `novedades:registrar`), pensada para el celular del ayudante:
  - Botón "Nueva novedad" que abre el formulario.
    - Selector Lote de ovíparos / Vacuno (por defecto **lote**, como en el Excel), con el animal o lote entre los activos de la finca activa.
    - Tipo, prioridad y descripción.
    - Foto con `<input type="file" accept="image/*" capture="environment">`, vista previa y opción de quitarla.
    - Ubicación: se pide con `navigator.geolocation` al abrir el formulario (con `enableHighAccuracy` y un tiempo límite de 15 s), muestra la precisión y tiene "Reintentar". Si se niega el permiso o falla, el formulario se guarda igual, sin ubicación, y se explica el motivo.
  - Lista en tarjetas: miniatura, tipo, prioridad, animal o lote, fecha, estado y número de comentarios. Filtros por estado, tipo y sujeto.
  - Detalle en un modal: foto en grande, enlace "Ver en mapa" a OpenStreetMap (`https://www.openstreetmap.org/?mlat=..&mlon=..#map=17/../..`, en pestaña nueva, sin mapa incrustado), comentarios con un campo para agregar, cambio de estado (con `novedades:gestionar`) y "Crear caso de salud" desde la novedad (con `salud:gestionar`, que precarga el animal o lote y `novedadId`).
- **`/salud`** (guard `salud:consultar`): por defecto, los casos activos ("Enfermos actuales") de la finca activa, con filtro de estado y sujeto. Crear y editar casos (con `salud:gestionar`). Al cerrar un caso de un vacuno como `FALLECIDO`, ofrece dar de baja al vacuno usando el diálogo de baja existente.
- **Historial:** un botón "Historial" en las filas de `/vacunos` y `/lotes` abre un diálogo con los casos de salud y las novedades de ese animal o lote, en orden cronológico descendente.
- **Menú:** "Novedades" y "Salud", según permiso.
- **Reglas de la Fase 3:** a 375 px sin scroll horizontal, estado en `signal` (la app no usa `zone.js`) y columnas de acción solo cuando hay acciones.

## Decisiones y motivos

Se completa al cerrar la fase.

## Cómo verificar

Se completa al cerrar la fase.
