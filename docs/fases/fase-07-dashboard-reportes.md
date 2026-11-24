# Fase 7. Dashboard y reportes

**Estado:** terminada, en revisión (2026-11-24).
**Historias:** HU018 y HU019. Cubre la HU oficial del Excel "Reportes: alimento consumido por día y mes, por animal o lote".

| HU | Alcance supuesto |
|---|---|
| HU018 | Panel de inicio con los indicadores y alertas de la finca activa |
| HU019 | Reporte de alimento consumido por día o por mes, por animal o por lote, con gráfico y exportación a CSV e impresión |

> Suposición del coordinador, porque la especificación de 21 HU no está en el repositorio. La exportación sale del prompt ampliado.

## Contrato (fuente común para desarrollo, pruebas y datos)

No hay tablas nuevas: todo se calcula a partir de las tablas de las Fases 3 a 6. No hay migración.

### Permisos

| Permiso | ADMINISTRADOR | VETERINARIO | AYUDANTE |
|---|---|---|---|
| `dashboard:consultar` | sí | sí | sí |
| `reportes:consultar` | sí | sí | no |

El alcance por finca es el mismo de siempre. Si `fincaId` es ajena: 404 en el dashboard, y en el reporte una respuesta vacía con totales en 0.

### API

**`GET /api/dashboard?fincaId=<uuid>`** (`dashboard:consultar`; `fincaId` obligatorio y uuid, si no 400). Responde:

```json
{
  "finca": { "id": "", "nombre": "" },
  "hoy": "YYYY-MM-DD",
  "animales": { "vacunosActivos": 0, "lotesActivos": 0, "avesActivas": 0 },
  "alimentacion": {
    "consumoHoyGramos": 0,
    "registrosHoy": 0,
    "vacunosSinConsumoHoy": 0,
    "ultimos7Dias": [{ "fecha": "YYYY-MM-DD", "gramos": 0 }],
    "alimentosStockBajo": [{ "id": "", "nombre": "", "stockGramos": 0, "stockMinimoGramos": 0 }]
  },
  "salud": {
    "casosActivos": 0,
    "novedadesAbiertas": 0,
    "novedadesAltaAbiertas": 0,
    "ultimasNovedades": [{ "id": "", "tipo": "", "prioridad": "", "estado": "", "fechaHora": "", "sujeto": { "tipo": "VACUNO|LOTE", "id": "", "nombre": "" } }]
  },
  "medicamentos": {
    "conAlerta": [{ "id": "", "nombre": "", "bajoStock": false, "vencido": false, "porVencer": false }],
    "animalesEnRetiro": 0
  }
}
```

- `avesActivas` es la suma de `cantidad` de los lotes activos.
- `ultimos7Dias` trae siempre 7 elementos, de hoy-6 a hoy en Bogotá, incluidos los días sin consumo (con 0). Suma los consumos de vacunos y de lotes.
- `vacunosSinConsumoHoy` son los vacunos activos sin ningún consumo con fecha de hoy.
- `alimentosStockBajo` y `conAlerta` incluyen solo registros activos, ordenados por nombre, con un máximo de 10 cada uno.
- `novedadesAbiertas` cuenta los estados `ABIERTA` y `EN_SEGUIMIENTO`. `ultimasNovedades` trae las 5 más recientes no cerradas.
- `animalesEnRetiro` es el número de sujetos distintos (vacunos y lotes) con algún tratamiento en retiro.
- Para el ayudante, la respuesta es la misma: solo lee.

**`GET /api/reportes/consumos`** (`reportes:consultar`). Query:

| Parámetro | Valor |
|---|---|
| `fincaId` | Obligatorio |
| `desde`, `hasta` | `YYYY-MM-DD`, obligatorios, inclusivos, con `desde ≤ hasta` y un rango máximo de 366 días. Si no: 400 `VALIDACION` en el campo correspondiente |
| `agrupacion` | `DIA` (por defecto) o `MES` |
| `sujeto` | `VACUNOS`, `LOTES` o `TODOS` (por defecto) |
| `vacunoId`, `loteId` | Opcionales: filtran un animal o lote. Si es ajeno, la respuesta es vacía |
| `alimentoId` | Opcional |
| `desglose` | `SUJETO` (por defecto: una fila por periodo y animal o lote), `ALIMENTO` (una fila por periodo, animal o lote y alimento) o `NINGUNO` (una fila por periodo, con el total) |

Responde:

```json
{
  "parametros": { "fincaId": "", "desde": "", "hasta": "", "agrupacion": "DIA", "sujeto": "TODOS", "desglose": "SUJETO" },
  "filas": [{ "periodo": "2026-11-23", "sujeto": { "tipo": "VACUNO", "id": "", "nombre": "" }, "alimento": null, "gramos": 0, "registros": 0 }],
  "serie": [{ "periodo": "2026-11-23", "gramos": 0 }],
  "totales": { "gramos": 0, "registros": 0, "sujetos": 0, "promedioGramosPorPeriodo": 0 }
}
```

- En `MES`, `periodo` va como `YYYY-MM`.
- `filas` se ordena por periodo ascendente, luego por tipo (VACUNO antes que LOTE), luego por nombre en español y, si hay desglose, por alimento.
- `sujeto` va en `null` con `desglose=NINGUNO`. `alimento` es `{id,nombre}` solo con `ALIMENTO`.
- `serie` incluye **todos** los periodos del rango, también los que quedan en 0, para la gráfica.
- `promedioGramosPorPeriodo` es el total dividido entre los periodos del rango, redondeado a entero.
- La agregación se hace en SQL (`GROUP BY` sobre la columna `fecha`, que ya es Date, con `to_char` para el mes). Puede ser `$queryRaw` parametrizado; **nunca** se concatenan valores del usuario.
- Los registros de animales inactivos sí cuentan: es histórico.

### Frontend

- **Inicio (`/`):** se reemplaza el contenido actual por el panel de la finca activa, con `dashboard:consultar`.
  - Tarjetas de indicadores: vacunos, lotes y aves, consumo de hoy en kg, casos activos y novedades abiertas, con las de prioridad alta resaltadas.
  - Gráfico de barras de los últimos 7 días, en **SVG en línea y sin librerías**, accesible: `role="img"`, `aria-label` con el resumen y una tabla equivalente oculta visualmente.
  - Listas de alertas (stock bajo, medicamentos y últimas novedades) con enlaces a su página.
  - Accesos rápidos según permiso: "Registrar consumo" y "Nueva novedad".
  - El administrador conserva los enlaces a fincas y usuarios. Sin finca activa (administrador sin fincas), muestra un mensaje para crear una.
  - Los indicadores enlazan a su página.
- **`/reportes`** (guard `reportes:consultar`, en el menú como "Reportes"):
  - Filtros: rango con atajos "Este mes", "Mes anterior", "Últimos 30 días" y "Este año"; agrupación día o mes; sujeto, animal o lote, alimento y desglose.
  - Gráfico de barras SVG de la `serie`, que con muchos periodos debe seguir siendo legible: etiquetas espaciadas y desplazamiento horizontal **dentro del contenedor del gráfico**, sin scroll de página.
  - Tabla de filas con totales y cantidades en kg (y en g bajo 1 kg).
  - Botón **"Exportar CSV"**, generado en el cliente:
    - separador `;` y BOM UTF-8, para que Excel en español lo abra bien;
    - columnas Periodo, Tipo, Animal/Lote, Alimento, Gramos, Kg y Registros;
    - nombre del archivo `consumo-<finca>-<desde>-<hasta>.csv`.
  - Botón **"Imprimir"** con `window.print()` y estilos `@media print` que ocultan menú, filtros y botones.
- Reglas de siempre: 375 px sin scroll horizontal, `signal` y errores bajo el campo.

## Decisiones y motivos

- **Finca ajena en el reporte:** responde 200 vacío (`filas: []`, totales en 0), como pide el contrato. La `serie` conserva todos los periodos con 0 para no cambiar la forma de la respuesta. Una finca inexistente consultada por el administrador se comporta igual. En el dashboard, ajena o inexistente da 404.
- **Filtros de animal y lote:** `vacunoId` y `loteId` se combinan con `sujeto`. Si se envía alguno, solo entran los tipos de sujeto filtrados (con ambos entran los dos). Un filtro contradictorio (p. ej. `sujeto=LOTES` con `vacunoId`) devuelve vacío.
- **Errores del rango:** `desde > hasta` y rango mayor a 366 días se reportan en el campo `hasta`; formato inválido, en el campo afectado. Se valida que la fecha exista (no 2026-02-30). 366 días inclusivos es válido; 367, no.
- **Agregación:** una consulta `UNION ALL` de consumos de vacunos y lotes (`$queryRaw` con tagged template; los fragmentos fijos de SQL salen de listas blancas, nunca de valores del usuario) y `GROUP BY` según el desglose. Los totales (incluidos los sujetos distintos) salen de una segunda consulta sobre el mismo origen, porque con `NINGUNO` las filas no traen sujeto. Las sumas se convierten a bigint y luego a número.
- **Orden:** se aplica en JavaScript con el `Intl.Collator` en español ya usado en la API (Ñ entre N y O, sin distinguir tildes); el desempate es el id.
- **Retiro vigente:** igual que `enRetiro` de tratamientos: fin de retiro (fecha + días) mayor o igual que hoy en Bogotá. Se consultan solo tratamientos del último año y se cuentan sujetos distintos.
- **Alertas de medicamentos:** reutilizan `estadoVencimiento` y `bajoStockMedicamento` (por vencer = 30 días o menos). Stock bajo de alimentos: stock menor o igual al mínimo, como `bajoStock`.
- **`ultimasNovedades.sujeto`:** toda novedad tiene vacuno o lote (restricción de la base), así que en la práctica nunca es null; el tipo del frontend lo admite por seguridad.
- **Permisos:** `dashboard:consultar` para los tres roles y `reportes:consultar` para administrador y veterinario. El ayudante no ve "Reportes" y recibe 403 en la API.
- **Gráfico SVG:** componente propio `grafico-barras` sin librerías. `role="img"` con `aria-label` resumen, tabla equivalente `sr-only`, y contenedor con `overflow-x: auto` (enfocable con teclado) para que el desplazamiento ocurra dentro del gráfico. Etiquetas espaciadas según el ancho de barra (44 px por día y 72 px por mes en el reporte; 34 px en el panel, que cabe a 375 px). Al imprimir, el SVG se escala al ancho de la hoja.
- **CSV:** generado en el cliente con BOM, separador `;`, saltos CRLF y kilos con coma decimal. Los textos que empiezan por `=`, `+`, `-` o `@` se prefijan con `'` para evitar inyección de fórmulas en Excel. Con desglose `NINGUNO`, Tipo y Animal/Lote llevan "Todos".
- **Reporte en pantalla:** consulta automática al abrir (este mes) y al cambiar de finca; los atajos consultan al instante. Los animales y lotes dados de baja aparecen en los filtros porque su historial cuenta. La tabla no se pagina.
- **Impresión:** reglas `@media print` globales ocultan barra, menú, filtros y botones (`.no-imprimir`, `.btn`).

## Cómo verificar

1. Backend (desde `backend/`): `npx vitest run tests/dashboard.test.js tests/reportes.test.js` y luego `npm test` completo (base `cuidagro_test`; no ejecutar dos veces a la vez).
2. Frontend (desde `frontend/`): `npm run build` y `npm test -- --watch=false` (incluye `reportes.spec.ts`: kg/g, atajos, CSV, nombre de archivo, ejes del gráfico).
3. A mano, con la API y `ng serve`:
   - Inicio como administrador, veterinario y ayudante: tarjetas, gráfico de 7 días, listas de alertas y accesos rápidos; el administrador conserva los enlaces a fincas y usuarios; sin fincas aparece el aviso para crear una.
   - `/reportes` como veterinario: atajos de rango, día/mes, desgloses y filtros; el ayudante no ve el menú y `/reportes` lo lleva a "Sin permiso".
   - "Exportar CSV": abrir en Excel en español (acentos correctos, columnas separadas) y revisar el nombre `consumo-<finca>-<desde>-<hasta>.csv`.
   - "Imprimir": la vista previa no muestra menú, filtros ni botones.
   - A 375 px no hay scroll horizontal de la página; con un rango largo en días, el gráfico se desplaza dentro de su contenedor.

Resultado al cerrar la fase (2026-11-24): backend 473/473 y frontend 34/34, con build correcto (verificado por el coordinador).

QA en un entorno aislado (`cuidagro_qa`, API congelada en :3190, Angular compilado en :4290, 1.223 consumos sembrados en cinco fincas):
- **API: 180 de 180 comprobaciones aprobadas.** Cada campo del dashboard y cada fila del reporte (DIA y MES, los tres sujetos y desgloses, filtros por animal, lote y alimento, bordes de mes, 1 y 366 días) coinciden con un cálculo independiente en JS y en SQL. Validaciones con el campo correcto, permisos de los tres roles y 7 cadenas de inyección SQL en 9 parámetros: todas 400, sin 5xx.
- **E2E con Playwright** (1280 y 375 px; administrador, veterinario y ayudante): 86 de 87 por viewport. El único marcado es un criterio arbitrario del script (máximo de etiquetas en el eje), no un defecto.
  - Panel de inicio con tarjetas, gráfico accesible, alertas, accesos rápidos y aviso sin fincas.
  - `/reportes` con atajos, filtros, errores bajo el campo, kg/g, CSV (BOM, `;`, CRLF, columnas, nombre de archivo, sumas, protección de fórmulas) e impresión con `media=print`.
  - Sin scroll horizontal de página, ni con 366 días (el gráfico se desplaza dentro de su contenedor).
- **HU oficial del Excel** cumplida de punta a punta: el veterinario consulta y exporta el consumo por día y por mes de un vacuno y de un lote.

Corregido tras la QA: el gráfico ensanchaba la página porque su `:host` era ítem de un grid con `min-width: auto`; se añadió `min-width: 0` en `grafico-barras.ts`.

**No probado:** el borde de medianoche en Bogotá, que Excel real abra el CSV, la vista previa de impresión del navegador (solo `media=print` emulado) y volúmenes grandes de datos.

## Pendientes para fases siguientes

- Fase 8: el panel y los reportes sin conexión (última respuesta en caché).
- La tabla del reporte no se pagina; con muchos animales y un rango largo puede ser extensa.
