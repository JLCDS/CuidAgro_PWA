# Fase 6. Medicamentos y tratamientos

**Estado:** terminada, en revisión (2026-11-24).
**Historias:** HU016 y HU017. No hay HU oficial del Excel para esta fase: es alcance del prompt ampliado. No debe romper las fases anteriores.

| HU | Alcance supuesto |
|---|---|
| HU016 | Inventario de medicamentos: registrar, editar, dar de baja, entradas de stock y alertas de stock bajo y vencimiento |
| HU017 | Registrar tratamientos (aplicación de un medicamento a un vacuno o lote, opcionalmente ligada a un caso de salud), con tiempo de retiro |

> Suposición del coordinador, porque la especificación de 21 HU no está en el repositorio. Pendiente de confirmar con el equipo.

## Contrato (fuente común para desarrollo, pruebas y datos)

### Modelo de datos (migración `20261123100000_medicamentos_tratamientos`)

Enums nuevos:
- `TipoMedicamento`: `ANTIBIOTICO`, `ANTIPARASITARIO`, `VACUNA`, `VITAMINA`, `ANTIINFLAMATORIO`, `HORMONAL`, `OTRO`
- `UnidadMedicamento`: `ML`, `G`, `UNIDAD`, `DOSIS`
- `ViaAdministracion`: `ORAL`, `INTRAMUSCULAR`, `SUBCUTANEA`, `INTRAVENOSA`, `TOPICA`, `EN_AGUA`, `EN_ALIMENTO`, `OTRA`

`Medicamento` (tabla `medicamentos`):
- `id`, `fincaId`, `nombre` (2–80, único por finca sin distinguir mayúsculas, con índice `lower()` escrito a mano como en alimentos), `tipo`, `unidad`.
- `stock` Decimal(12,2) (puede ser negativo), `stockMinimo` Decimal(12,2) ≥ 0 (por defecto 0).
- `fechaVencimiento?` Date, `laboratorio?` (≤ 80).
- `diasRetiroCarne?` y `diasRetiroLeche?`: Int 0–365, son los valores sugeridos.
- `estado` (`EstadoRegistro`), `motivoBaja`, `observaciones` (≤ 1000), `creadoPorId`, timestamps.

`EntradaMedicamento` (tabla `entradas_medicamento`): `id`, `medicamentoId`, `cantidad` Decimal(12,2) > 0 y ≤ 1 000 000, `fecha` Date no futura, `fechaVencimiento?` (si viene, actualiza la del medicamento), `nota` (≤ 500), `registradoPorId`, `createdAt`.

`Tratamiento` (tabla `tratamientos`):
- `id`, `fincaId`, `vacunoId?` / `loteId?` (exactamente uno, con `CHECK`), `casoSaludId?` (del mismo animal o lote, si no 400), `medicamentoId` (de la misma finca, si no 400).
- `dosis` Decimal(12,2) > 0 y ≤ 100 000, en la unidad del medicamento. `via`, `fecha` Date no futura.
- `diasRetiroCarne?`, `diasRetiroLeche?` (Int 0–365). Si no vienen, se copian del medicamento.
- `observaciones` (≤ 1000), `registradoPorId`, timestamps.

**Stock**, igual que el alimento de la Fase 4: cada entrada suma y cada tratamiento resta su `dosis`, en la misma transacción y con `FOR UPDATE`. Editar aplica la diferencia; si cambia el medicamento, devuelve al anterior. Borrar devuelve la dosis. El stock negativo está permitido, con alerta.

Valores derivados:
- `bajoStock = stock <= stockMinimo`.
- `vencido`: `fechaVencimiento` anterior a hoy en Bogotá. `porVencer`: vence en 30 días o menos y no está vencido.
- En el tratamiento: `finRetiroCarne = fecha + diasRetiroCarne` y `finRetiroLeche = fecha + diasRetiroLeche` (`YYYY-MM-DD` o `null`). `enRetiro` es verdadero si alguno de los dos es posterior o igual a hoy.

Para crear un tratamiento, el animal o lote y el medicamento deben estar `ACTIVO`. Aplicar un medicamento **vencido** se rechaza con 400 en `medicamentoId`.

### Permisos

| Permiso | ADMINISTRADOR | VETERINARIO | AYUDANTE |
|---|---|---|---|
| `medicamentos:consultar` | sí | sí | sí |
| `medicamentos:gestionar` (crear, editar, baja, entradas) | sí | sí | no |
| `tratamientos:consultar` | sí | sí | sí |
| `tratamientos:registrar` (crear, editar, borrar) | sí | sí | no |

El alcance por finca es igual que en las fases anteriores: ajeno → 404, listado con `fincaId` ajena → `[]`.

### API

`/api/medicamentos`, con el mismo patrón que `/api/alimentos`:

| Ruta | Permiso | Notas |
|---|---|---|
| `GET /` | consultar | Query: `fincaId`, `estado` (ACTIVO por defecto, INACTIVO, TODOS), `q`, `tipo`, `bajoStock=true`, `alerta=true` (bajo stock, vencido o por vencer). Orden por nombre en español |
| `GET /:id` | consultar | |
| `POST /` | gestionar | `{ fincaId, nombre, tipo, unidad, stockInicial?, stockMinimo?, fechaVencimiento?, laboratorio?, diasRetiroCarne?, diasRetiroLeche?, observaciones? }`. Si `stockInicial` es mayor que 0, crea una entrada "Stock inicial". Responde 201 |
| `PATCH /:id` | gestionar | Todo menos stock, `fincaId` y estado |
| `PATCH /:id/estado` | gestionar | Igual que en la Fase 3 |
| `POST /:id/entradas` | gestionar | `{ cantidad, fecha?, fechaVencimiento?, nota? }`. Responde 201 con `{ entrada, medicamento }` |
| `GET /:id/movimientos` | consultar | Entradas y tratamientos, máximo 100, más recientes primero. Cada uno: `{ tipo: 'ENTRADA'\|'TRATAMIENTO', id, fecha, cantidad (con signo), detalle, registradoPor }` |

Respuesta de medicamento: los campos con decimales como número, más `bajoStock`, `vencido`, `porVencer` y `finca`.

`/api/tratamientos`:

| Ruta | Permiso | Notas |
|---|---|---|
| `GET /` | consultar | Query: `fincaId`, `vacunoId`, `loteId`, `casoSaludId`, `medicamentoId`, `desde`, `hasta`, `enRetiro=true`. Orden por fecha descendente y luego `createdAt` descendente, máximo 500 |
| `GET /:id` | consultar | |
| `POST /` | registrar | `{ vacunoId\|loteId, medicamentoId, casoSaludId?, dosis, via, fecha?, diasRetiroCarne?, diasRetiroLeche?, observaciones? }`. `fecha` es hoy por defecto. Responde 201 |
| `PATCH /:id` | registrar | `medicamentoId`, `casoSaludId`, `dosis`, `via`, `fecha`, días de retiro y observaciones. No cambia el animal ni el lote |
| `DELETE /:id` | registrar | Responde 204 y devuelve el stock |

Respuesta de tratamiento: los campos, más `vacuno`/`lote`, `medicamento {id,nombre,unidad,stock,bajoStock}` (con el estado **después** de la operación), `casoSalud {id,diagnostico}` o `null`, `finRetiroCarne`, `finRetiroLeche`, `enRetiro`, `finca` y `registradoPor`.

### Frontend

- **`/medicamentos`** (guard `medicamentos:consultar`): inventario de la finca activa con insignias de stock bajo, negativo, vencido y por vencer, y un filtro "Con alertas". Incluye crear, editar, baja, entradas y movimientos, reutilizando el patrón de `/alimentos`.
- **`/tratamientos`** (guard `tratamientos:consultar`): lista filtrable con una insignia "En retiro" que muestra hasta qué fecha. El formulario (con `tratamientos:registrar`) tiene:
  - el animal o lote;
  - el caso de salud, opcional, con los casos del sujeto elegido;
  - el medicamento: solo los activos y no vencidos, mostrando stock y unidad;
  - la dosis con su unidad;
  - la vía y la fecha;
  - los días de retiro, precargados desde el medicamento.
  
  Al guardar, avisa si el medicamento quedó en stock bajo o negativo.
- **Integraciones:**
  - En `/salud`, cada caso tiene "Registrar tratamiento", que precarga el caso y el sujeto, y muestra sus tratamientos.
  - El diálogo "Historial" de vacunos y lotes incluye los tratamientos.
- **Menú:** "Medicamentos" y "Tratamientos", según permiso. El menú móvil ya agrupa lo que no cabe en "Más".
- **Reglas de las fases anteriores:** 375 px sin scroll horizontal, `signal`, errores bajo cada campo y acciones solo cuando las hay.

## Decisiones y motivos

- **Stock decimal:** Decimal(12,2) en la base y números con máximo 2 decimales en la API. Las diferencias al editar se redondean a centésimas para evitar errores de coma flotante.
- **Editar un tratamiento:** si cambia el medicamento, se valida el nuevo (activo, de la misma finca, no vencido), se devuelve la dosis al anterior y se descuenta del nuevo; los días de retiro no enviados se toman del nuevo medicamento. Si el medicamento no cambia, no se vuelve a exigir que esté vigente (el tratamiento ya se aplicó).
- **Caso de salud ajeno o inexistente:** 404 (igual que la novedad en la Fase 5); de otro animal o lote: 400 en `casoSaludId`.
- **Días de retiro:** si no vienen en el cuerpo se copian del medicamento; un `null` explícito significa "sin retiro".
- **Vencimiento:** un medicamento que vence hoy aún es aplicable; vencido es estrictamente anterior a hoy (Bogotá).
- **Historial y `/salud`:** los tratamientos son un complemento; si su carga falla, el resto se muestra igual.

## Cómo verificar

- Backend: `npm test --prefix backend` (incluye `medicamentos.test.js` y `tratamientos.test.js`).
- Frontend: `npm run build --prefix frontend` y `npm test --prefix frontend -- --watch=false`.
- Manual: crear un medicamento con stock y vencimiento, registrar un tratamiento desde `/salud`, comprobar el stock, la insignia "En retiro" en `/tratamientos` y el Historial del animal; revisar a 375 px que no hay scroll horizontal.

Resultado al cerrar la fase (2026-11-24): backend 473/473 (suite completa, incluida la Fase 7) y frontend 34/34, con build correcto (verificado por el coordinador).

QA en un entorno aislado (`cuidagro_qa`, API congelada en :3190, Angular compilado en :4290):
- **API: 260 de 262 comprobaciones aprobadas.** Las 2 fallas eran un solo defecto, ya corregido (ver abajo). Se cubrieron permisos de los tres roles, alcance por finca, validaciones, alertas de stock y vencimiento (incluido el que vence hoy), tratamientos a vacuno y lote, ligados a casos, edición con cambio de medicamento, borrado, retiro y concurrencia (DELETE y altas simultáneas sin descuadre de stock).
- **E2E con Playwright** (1280 y 375 px; administrador, veterinario y ayudante): `/medicamentos`, `/tratamientos`, registro desde `/salud`, historial con "En retiro", menú "Más" y regresión de las páginas anteriores. Sin fallos reales, sin 5xx ni errores de JavaScript, sin scroll horizontal.

Corregido tras la QA:
- Un nombre con byte NUL daba 500 (PostgreSQL no admite `\u0000` en texto). Era heredado y afectaba a todo lo que usa `nombreSchema`; ahora responde 400 en `nombre`, con prueba en `medicamentos.test.js`.
- El 409 por nombre duplicado de medicamento salía en la alerta general; ahora sale bajo el campo `nombre`.

**No probado:** Firefox, WebKit y dispositivos reales; el "vence hoy" en la medianoche de Bogotá (solo por API); formularios de lote, alimento, consumo y novedad en el navegador (solo por API).

## Pendientes para fases siguientes

- Fase 8: registrar tratamientos sin conexión (cola) y avisos de vencimiento o stock bajo.
- El formulario de alimentos (y quizá otros de fases anteriores) también muestra el 409 de duplicado en la alerta general; se dejó así porque no lo pide esta fase.
