# Fase 10. Espacios del galpón, edad en semanas y ración sugerida

**Estado:** terminada, en revisión (2026-11-26).
**Origen:** pedido del equipo tras ver la demo en la finca. Amplía la HU oficial "Reportes: alimento consumido por día y mes, por animal o lote" con el consumo por **espacio** (cuadrante o zona del galpón).

| Necesidad | Cómo se cubre |
|---|---|
| El galpón está dividido: 4 cuadrantes de engorde (G1-C1 a G1-C4) y 2 zonas de ponedoras (G1-Z1, G1-Z2), cada uno con su identificador | Nueva entidad **Espacio** por finca, con código único |
| En cada cuadrante hay un lote de una sola edad; cuando sale (semana 7-8), entra otro lote nuevo | El lote tiene un espacio actual; un espacio solo puede tener **un lote activo**. Al dar de baja el lote, el espacio queda libre |
| A los pollos se les da comida según la edad en semanas | El lote calcula su **semana de vida actual** y la app **sugiere la ración** (g por ave y día × aves) según una tabla por semana editable |
| Reporte de alimento por cuadrante y por lote | Cada consumo guarda el espacio donde ocurrió; el reporte agrega el desglose **por espacio** y el filtro por espacio |

Decisiones tomadas con el usuario (2026-11-26): 300 pollos de engorde en 4 cuadrantes y 100 ponedoras en 2 zonas; rotación escalonada con salida en la semana 7-8; códigos `G1-C1…C4` y `G1-Z1, Z2`; sugerir la ración al registrar.

## Modelo de datos (migración `20261126000000_espacios_raciones`)

### Tabla `espacios` (modelo `Espacio`)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | uuid | |
| `finca_id` | uuid → fincas | obligatorio |
| `codigo` | text | obligatorio; se guarda en mayúsculas y sin espacios a los lados; `^[A-Z0-9][A-Z0-9-]{0,19}$`; **único por finca** (`@@unique([fincaId, codigo])`) |
| `nombre` | text? | descripción opcional, máx. 80 ("Cuadrante del fondo") |
| `tipo` | enum `TipoEspacio` | `CUADRANTE`, `ZONA`, `OTRO` |
| `capacidad` | int? | aves; 1 a 100000 |
| `estado` | `EstadoRegistro` | `ACTIVO` por defecto; con `motivo_baja` |
| `observaciones` | text? | máx. 1000 |
| `creado_por_id` | uuid → usuarios | |
| `created_at`, `updated_at` | | |

### Cambios en tablas existentes

- `lotes_oviparos.espacio_id` uuid? → espacios (`onDelete: Restrict`). **Índice único parcial** (SQL a mano en la migración): `CREATE UNIQUE INDEX lotes_espacio_activo_uq ON lotes_oviparos (espacio_id) WHERE estado = 'ACTIVO' AND espacio_id IS NOT NULL;`
- `consumos_lotes.espacio_id` uuid? → espacios. **Lo fija el servidor** al crear el consumo, copiando el espacio actual del lote (instantánea). No se cambia al editar el consumo ni al mover el lote. Índice `(espacio_id, fecha)`. Los consumos existentes quedan en `NULL`.

### Tabla `raciones_semanales` (modelo `RacionSemanal`)

| Campo | Tipo | Regla |
|---|---|---|
| `finca_id` | uuid → fincas | |
| `proposito` | `PropositoLote` | `ALIMENTACION` (engorde) o `PRODUCCION` (ponedoras) |
| `semana` | int | 1 a 104 |
| `gramos_ave_dia` | int | 1 a 400 |
| | | `@@id([fincaId, proposito, semana])` |

Si una finca no tiene filas para un propósito, se usa la **tabla por defecto** (constante en `backend/src/modules/raciones/raciones.defecto.js`, y la misma copia en el frontend para el modo sin conexión):

- `ALIMENTACION` (pollo de engorde), g/ave/día por semana 1 a 8: **25, 50, 85, 120, 150, 170, 185, 195**.
- `PRODUCCION` (gallina ponedora), semanas 1 a 19: **12, 20, 28, 35, 41, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 86, 90, 95, 110**.

Para semanas mayores que la última fila se usa el valor de la **última** fila.

## Edad actual y semana de vida (regla única, backend y frontend)

- `edadMinSemanas` y `edadMaxSemanas` del lote son la edad **al ingreso**.
- `diasEnFinca = hoyBogota − fechaIngreso` (si `fechaIngreso` es `null`, se usa la fecha de `createdAt` en Bogotá); nunca negativo.
- `edadActual = { minSemanas: edadMinSemanas + ⌊diasEnFinca / 7⌋, maxSemanas: edadMaxSemanas + ⌊diasEnFinca / 7⌋, semanaVida: ⌊(edadMinSemanas × 7 + diasEnFinca) / 7⌋ + 1 }`.
  Ejemplo: pollitos de un día (`edadMinSemanas = 0`) ingresados hace 23 días → `minSemanas 3`, `semanaVida 4`.
- **Ración sugerida** = `gramosAveDia(proposito, semanaVida) × cantidad`. Se muestra por día y "por comida si se dan 2 comidas" (la mitad, redondeada a 50 g).

## Permisos

No hay permisos nuevos.

| Acción | Permiso |
|---|---|
| Ver espacios y raciones | `animales:consultar` (los tres roles) |
| Crear, editar y dar de baja espacios; asignar o mover el espacio de un lote | `animales:gestionar` (administrador y veterinario) |
| Editar la tabla de raciones | `alimentos:gestionar` (administrador y veterinario) |

El alcance por finca es el de siempre (`filtroFincas`): recursos de otra finca responden 404.

## API

### Espacios

**`GET /api/espacios?fincaId=&estado=ACTIVO|INACTIVO&tipo=`** → `200 { "datos": [Espacio] }` ordenados por `codigo` (orden natural: `G1-C2` antes de `G1-C10`). Sin `estado` devuelve solo los activos.

```json
{
  "id": "", "fincaId": "", "codigo": "G1-C1", "nombre": "Cuadrante 1", "tipo": "CUADRANTE",
  "capacidad": 80, "estado": "ACTIVO", "motivoBaja": null, "observaciones": null,
  "loteActual": { "id": "", "nombre": "", "cantidad": 75, "proposito": "ALIMENTACION",
                  "fechaIngreso": "YYYY-MM-DD", "edadActual": { "minSemanas": 3, "maxSemanas": 3, "semanaVida": 4 } } ,
  "createdAt": "", "updatedAt": ""
}
```

`loteActual` es `null` si el espacio está libre.

- **`GET /api/espacios/:id`** → `200 Espacio`.
- **`POST /api/espacios`** `{ fincaId, codigo, nombre?, tipo, capacidad?, observaciones? }` → `201 Espacio`. Código repetido en la finca → **409** con `campo: "codigo"`, mensaje `"Ya existe un espacio con el código G1-C1 en esta finca"`.
- **`PATCH /api/espacios/:id`** campos parciales (no `fincaId`) → `200`. Mismo 409.
- **`PATCH /api/espacios/:id/estado`** `{ estado, motivoBaja? }` → `200`. Dar de baja un espacio **ocupado** → **409** `"El espacio G1-C1 tiene el lote activo X; muévelo o dalo de baja primero"`.

### Lotes (cambios)

- `POST /api/lotes` y `PATCH /api/lotes/:id` aceptan `espacioId: uuid | null`.
  - Espacio de otra finca o inexistente → 400 `campo: "espacioId"` ("Selecciona un espacio válido").
  - Espacio dado de baja → 400 ("El espacio está dado de baja").
  - Espacio ocupado por **otro** lote activo → **409** `campo: "espacioId"`, `"El espacio G1-C1 ya tiene el lote X"` (también si choca el índice único por una carrera).
- Reactivar un lote cuyo espacio quedó ocupado → 409 con el mismo mensaje.
- Todas las respuestas de lote incluyen `espacio: { id, codigo } | null`, `edadActual` (regla de arriba) y `racionSugerida: { semanaVida, gramosAveDia, gramosDia }`.
- `GET /api/lotes` acepta `espacioId` como filtro.

### Consumos de lotes (cambios)

- `POST /api/consumos/lotes` guarda `espacio_id` desde el lote. El cliente **no** lo envía (si lo envía, se ignora).
- Las respuestas de consumo de lote incluyen `espacio: { id, codigo } | null`.

### Raciones

- **`GET /api/raciones?fincaId=`** (`animales:consultar`) → `200 { "fincaId": "", "tablas": { "ALIMENTACION": { "personalizada": false, "semanas": [{ "semana": 1, "gramosAveDia": 25 }] }, "PRODUCCION": { ... } } }`.
- **`PUT /api/raciones`** (`alimentos:gestionar`) `{ fincaId, proposito, semanas: [{ semana, gramosAveDia }] }` → reemplaza la tabla de ese propósito (transacción). Reglas: 1 a 104 filas, semanas **consecutivas desde 1**, gramos enteros 1 a 400. Responde como el GET.
- **`DELETE /api/raciones?fincaId=&proposito=`** (`alimentos:gestionar`) → vuelve a la tabla por defecto. `204`.

### Reporte de consumos (cambios en `GET /api/reportes/consumos`)

- Nuevo filtro `espacioId` (uuid): solo consumos de lotes cuya instantánea `espacio_id` es ese espacio. Implica `sujeto = LOTES` (si llega con `sujeto = VACUNOS` → 400 `campo: "espacioId"`).
- Nuevo `desglose = ESPACIO`: agrupa por periodo y espacio de la instantánea. Solo con `sujeto = LOTES` (si no → 400 `campo: "desglose"`, "El desglose por espacio solo aplica a lotes"). Cada fila: `sujeto: { tipo: "ESPACIO", id, nombre: "<código>" }`; los consumos sin espacio forman la fila `sujeto: { tipo: "ESPACIO", id: null, nombre: "Sin espacio" }`.
- `totales.sujetos` cuenta espacios distintos con ese desglose.
- El resto del contrato de la Fase 7 no cambia.

## Frontend

- **Página `/espacios`** (menú "Más" y lateral, ícono propio; visible con `animales:consultar`). Tarjetas por espacio ordenadas por código: código grande, tipo, capacidad, y el lote actual con aves y una insignia **"Semana N"**; si está libre, "Libre". Acciones con `animales:gestionar`: nuevo espacio, editar, dar de baja. Estado vacío con imagen como el resto de la app.
- En la misma página, sección **"Ración por semana"** con dos pestañas (Engorde, Ponedoras): tabla semana → g/ave/día; con `alimentos:gestionar` se edita y se guarda, y se puede "Volver a la tabla por defecto". Etiqueta "Personalizada" o "Por defecto".
- **Lotes:** el formulario tiene un selector "Espacio" (opción "Sin espacio"; solo espacios libres más el actual del lote). La lista muestra el código del espacio y "Semana N" (de `edadActual.semanaVida`).
- **Registrar consumo (pestaña Lotes de aves):** al elegir el lote se muestra un recuadro: `G1-C2 · Semana 4 · 120 g por ave × 75 aves = 9 kg al día (4,5 kg por comida si das 2)` con el botón **"Usar 4,5 kg"** que llena la cantidad. Funciona sin conexión: usa los datos del lote en caché y las raciones en caché; si no hay raciones en caché, usa la tabla por defecto del frontend.
- **Reportes:** con sujeto "Lotes de aves" aparecen el filtro "Espacio" y la opción de desglose "Por espacio (cuadrante o zona)". La tabla, el gráfico y el CSV muestran el código del espacio.
- 375 px sin scroll horizontal; objetivos táctiles de 48 px; textos en español.

## Pruebas exigidas

- Backend (Vitest, `cuidagro_test`): CRUD de espacios (validación de código, mayúsculas, 409 duplicado, 404 otra finca, baja de espacio ocupado → 409); asignar, mover y liberar lotes (409 por ocupado; baja del lote libera el espacio; reactivar con espacio ocupado → 409); instantánea de espacio en consumos (mover el lote no cambia consumos pasados); `edadActual` y `racionSugerida` con fechas controladas; raciones GET por defecto, PUT con validaciones (consecutivas, rangos), DELETE; reporte con `desglose=ESPACIO`, fila "Sin espacio", filtro `espacioId` y los 400 de combinaciones inválidas; permisos por rol (AYUDANTE no crea espacios ni edita raciones).
- Frontend: pruebas unitarias del cálculo de semana de vida y de la ración sugerida (incluida la regla de "última fila"), y del redondeo por comida.
- Suites completas en verde: backend y frontend; `ng build` sin errores.

## Decisiones y motivos

| Decisión | Motivo |
|---|---|
| Un espacio admite un solo lote **activo**, garantizado por el índice único parcial además de la validación | Dos registros simultáneos no pueden ocupar el mismo cuadrante; la carrera responde 409 |
| Dar de baja un lote conserva su `espacioId`; reactivarlo con el espacio ya ocupado responde 409 | Se guarda dónde estuvo el lote sin bloquear el cuadrante para el lote siguiente |
| Mantener en un PATCH el mismo `espacioId` no se vuelve a validar | Editar otros datos de un lote no debe fallar porque su espacio se dio de baja después |
| El consumo guarda una **instantánea** del espacio | El reporte por cuadrante no se mezcla cuando los lotes rotan o se mueven |
| `GET /api/espacios` acepta también `estado=TODOS` | La página permite ver activos, de baja o todos |
| `GET` y `DELETE /api/raciones` exigen `fincaId`; finca ajena → 404 | Mismo alcance por finca que el resto de recursos |
| Reporte: `desglose=ESPACIO` o `espacioId` con vacunos → 400; `espacioId` con `sujeto=TODOS` toma solo lotes; `espacioId` de otra finca → reporte vacío | Combinaciones sin sentido se rechazan; finca ajena igual que en la Fase 7 |
| `totales.sujetos` con desglose por espacio cuenta solo espacios reales (no "Sin espacio") | "Espacios distintos" del contrato |
| La semana de vida y la ración se calculan **en el cliente** con la fecha de hoy en Bogotá | Un lote guardado en caché hace días sigue mostrando la semana correcta sin conexión |
| "Usar X kg" llena la cantidad **por comida** (la mitad del día, redondeada a 50 g) y solo aparece al crear | En la finca se da de comer mañana y tarde; al editar no se sugiere para no pisar lo registrado |
| La tabla de raciones se edita agregando o quitando la última semana | Mantiene las semanas consecutivas que exige la API |
| El CSV mantiene la cabecera `Animal/Lote` y usa el tipo "Espacio" | No romper el formato de la Fase 7 |
| Espacios va al final del menú (en "Más" en el celular) | No desplaza Inventario ni Alimentación de la barra inferior |

## Cómo se verificó (2026-11-26)

- Backend: suite completa **604 pruebas en 19 archivos** en verde (86 nuevas: espacios, raciones y reporte por espacio; las 518 anteriores sin cambios).
- Frontend: **54 pruebas** en verde (6 nuevas del cálculo de semana y ración) y `ng build` sin errores ni advertencias.
- QA aislada sobre `cuidagro_qa`, API en el puerto 3190 en modo producción, Playwright a 375 y 1280 px con los tres roles: 141 comprobaciones de API (los 3 desvíos fueron del propio script o de interpretación ya resuelta arriba) y unas 173 de E2E. Totales del reporte por espacio comprobados contra una suma propia, carrera de dos asignaciones al mismo espacio (201 y 409), consumo sin conexión con ración sugerida y sincronización con el espacio correcto, sin scroll horizontal, sin errores de consola ni violaciones de CSP. Regresión de las fases anteriores sin fallos.
- Corregido después de la QA: la tarjeta de totales del reporte dice "Espacios" con el desglose por espacio.

## Pendientes

- Recargar la demo de producción con el galpón G1 (C1 a C4 con lotes de engorde escalonados que salen en la semana 7-8, Z1 y Z2 con ponedoras). Requiere borrar las aves de la demo anterior con acceso directo a la base.
- "Volver a la tabla por defecto" usa el `confirm` nativo del navegador; se puede cambiar por el modal de la app.
- No se probó en un celular real ni con notificaciones push en esta fase.
