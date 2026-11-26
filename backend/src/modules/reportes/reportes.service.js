import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { compararNombres, filtroFincas } from '../../lib/registros.js';

const DIA_MS = 86_400_000;

/** Todos los periodos del rango (días o meses), también los que no tienen consumo. */
function periodosDe(desde, hasta, agrupacion) {
  const periodos = [];
  if (agrupacion === 'DIA') {
    for (let t = Date.parse(`${desde}T00:00:00Z`); t <= Date.parse(`${hasta}T00:00:00Z`); t += DIA_MS) {
      periodos.push(new Date(t).toISOString().slice(0, 10));
    }
    return periodos;
  }
  let [anio, mes] = desde.slice(0, 7).split('-').map(Number);
  const [anioFin, mesFin] = hasta.slice(0, 7).split('-').map(Number);
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    periodos.push(`${anio}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return periodos;
}

const ORIGEN_VACUNOS = {
  tipo: 'VACUNO',
  filtro: 'vacunoId',
  tabla: Prisma.raw('consumos_vacunos'),
  campo: Prisma.raw('vacuno_id'),
  tablaSujeto: Prisma.raw('vacunos'),
  espacio: Prisma.sql`NULL::uuid AS espacio_id, NULL::text AS espacio_codigo`,
  unirEspacio: Prisma.empty,
  filtroEspacio: () => Prisma.empty,
};
const ORIGEN_LOTES = {
  tipo: 'LOTE',
  filtro: 'loteId',
  tabla: Prisma.raw('consumos_lotes'),
  campo: Prisma.raw('lote_id'),
  tablaSujeto: Prisma.raw('lotes_oviparos'),
  espacio: Prisma.sql`c.espacio_id, e.codigo AS espacio_codigo`,
  unirEspacio: Prisma.sql`LEFT JOIN espacios e ON e.id = c.espacio_id`,
  filtroEspacio: (espacioId) => Prisma.sql`AND (${espacioId}::uuid IS NULL OR c.espacio_id = ${espacioId}::uuid)`,
};

/** Consumos crudos de un tipo de sujeto, limitados a finca, rango y filtros (los valores siempre van parametrizados). */
function origen({ tipo, filtro, tabla, campo, tablaSujeto, espacio, unirEspacio, filtroEspacio }, q) {
  const sujetoId = q[filtro] ?? null;
  const alimentoId = q.alimentoId ?? null;
  const espacioId = q.espacioId ?? null;
  return Prisma.sql`
    SELECT c.fecha, ${tipo}::text AS tipo, s.id AS sujeto_id, s.nombre AS sujeto_nombre,
           a.id AS alimento_id, a.nombre AS alimento_nombre, c.cantidad_gramos AS gramos,
           ${espacio}
      FROM ${tabla} c
      JOIN ${tablaSujeto} s ON s.id = c.${campo}
      JOIN alimentos a ON a.id = c.alimento_id
      ${unirEspacio}
     WHERE s.finca_id = ${q.fincaId}::uuid
       AND c.fecha BETWEEN ${q.desde}::date AND ${q.hasta}::date
       AND (${alimentoId}::uuid IS NULL OR c.alimento_id = ${alimentoId}::uuid)
       AND (${sujetoId}::uuid IS NULL OR s.id = ${sujetoId}::uuid)
       ${filtroEspacio(espacioId)}`;
}

/** Qué tipos de sujeto entran: `sujeto` y los filtros por animal o lote se combinan. */
function origenesDe({ sujeto, vacunoId, loteId, espacioId }) {
  const hayFiltro = Boolean(vacunoId || loteId);
  const lista = [];
  // El espacio solo existe en los lotes: con ese filtro no entran vacunos.
  if (sujeto !== 'LOTES' && !espacioId && (!hayFiltro || vacunoId)) lista.push(ORIGEN_VACUNOS);
  if (sujeto !== 'VACUNOS' && (!hayFiltro || loteId)) lista.push(ORIGEN_LOTES);
  return lista;
}

// Fragmentos fijos elegidos desde listas blancas (nunca texto del usuario).
const PERIODO = {
  DIA: Prisma.raw(`to_char(t.fecha, 'YYYY-MM-DD')`),
  MES: Prisma.raw(`to_char(t.fecha, 'YYYY-MM')`),
};

const DESGLOSES = {
  SUJETO: {
    columnas: Prisma.raw('t.tipo, t.sujeto_id, t.sujeto_nombre, NULL::uuid AS alimento_id, NULL::text AS alimento_nombre'),
    agrupar: Prisma.raw(', t.tipo, t.sujeto_id, t.sujeto_nombre'),
  },
  ALIMENTO: {
    columnas: Prisma.raw('t.tipo, t.sujeto_id, t.sujeto_nombre, t.alimento_id, t.alimento_nombre'),
    agrupar: Prisma.raw(', t.tipo, t.sujeto_id, t.sujeto_nombre, t.alimento_id, t.alimento_nombre'),
  },
  ESPACIO: {
    columnas: Prisma.raw("'ESPACIO'::text AS tipo, t.espacio_id AS sujeto_id, COALESCE(t.espacio_codigo, 'Sin espacio') AS sujeto_nombre, NULL::uuid AS alimento_id, NULL::text AS alimento_nombre"),
    agrupar: Prisma.raw(', t.espacio_id, t.espacio_codigo'),
  },
  NINGUNO: {
    columnas: Prisma.raw('NULL::text AS tipo, NULL::uuid AS sujeto_id, NULL::text AS sujeto_nombre, NULL::uuid AS alimento_id, NULL::text AS alimento_nombre'),
    agrupar: Prisma.empty,
  },
};

const ordenTipo = (tipo) => (tipo === 'VACUNO' ? 0 : 1);
// La fila "Sin espacio" (id nulo) va al final de su periodo.
const ordenSinId = (sujeto) => (sujeto.id === null ? 1 : 0);

export async function reporteConsumos(actor, q) {
  const parametros = {
    fincaId: q.fincaId,
    desde: q.desde,
    hasta: q.hasta,
    agrupacion: q.agrupacion,
    sujeto: q.sujeto,
    desglose: q.desglose,
  };
  const periodos = periodosDe(q.desde, q.hasta, q.agrupacion);

  // Finca ajena (o filtros que excluyen todo): respuesta vacía, igual que una finca sin consumos.
  const origenes = origenesDe(q);
  if (filtroFincas(actor, q.fincaId).id || origenes.length === 0) {
    return {
      parametros,
      filas: [],
      serie: periodos.map((periodo) => ({ periodo, gramos: 0 })),
      totales: { gramos: 0, registros: 0, sujetos: 0, promedioGramosPorPeriodo: 0 },
    };
  }

  const consulta = {
    ...q,
    desde: new Date(`${q.desde}T00:00:00Z`),
    hasta: new Date(`${q.hasta}T00:00:00Z`),
  };
  const union = Prisma.join(
    origenes.map((o) => origen(o, consulta)),
    ' UNION ALL ',
  );
  const { columnas, agrupar } = DESGLOSES[q.desglose];
  const periodo = PERIODO[q.agrupacion];
  // Con el desglose por espacio, "sujetos" son los espacios reales (sin contar "Sin espacio").
  const sujetosDistintos = q.desglose === 'ESPACIO' ? Prisma.sql`COUNT(DISTINCT t.espacio_id)` : Prisma.sql`COUNT(DISTINCT (t.tipo, t.sujeto_id))`;

  const [filasSql, totalSql] = await Promise.all([
    prisma.$queryRaw`
      SELECT ${periodo} AS periodo, ${columnas},
             SUM(t.gramos)::bigint AS gramos, COUNT(*)::bigint AS registros
        FROM (${union}) t
       GROUP BY ${periodo}${agrupar}`,
    prisma.$queryRaw`
      SELECT COALESCE(SUM(t.gramos), 0)::bigint AS gramos, COUNT(*)::bigint AS registros,
             ${sujetosDistintos}::bigint AS sujetos
        FROM (${union}) t`,
  ]);

  const filas = filasSql
    .map((f) => ({
      periodo: f.periodo,
      sujeto: f.tipo ? { tipo: f.tipo, id: f.sujeto_id, nombre: f.sujeto_nombre } : null,
      alimento: f.alimento_id ? { id: f.alimento_id, nombre: f.alimento_nombre } : null,
      gramos: Number(f.gramos),
      registros: Number(f.registros),
    }))
    .sort(
      (a, b) =>
        a.periodo.localeCompare(b.periodo) ||
        (a.sujeto ? ordenTipo(a.sujeto.tipo) - ordenTipo(b.sujeto.tipo) : 0) ||
        (a.sujeto
          ? ordenSinId(a.sujeto) - ordenSinId(b.sujeto) ||
            compararNombres(a.sujeto.nombre, b.sujeto.nombre) ||
            (a.sujeto.id ?? '').localeCompare(b.sujeto.id ?? '')
          : 0) ||
        (a.alimento ? compararNombres(a.alimento.nombre, b.alimento.nombre) || a.alimento.id.localeCompare(b.alimento.id) : 0),
    );

  const porPeriodo = new Map(periodos.map((p) => [p, 0]));
  for (const f of filas) porPeriodo.set(f.periodo, porPeriodo.get(f.periodo) + f.gramos);
  const gramos = Number(totalSql[0].gramos);

  return {
    parametros,
    filas,
    serie: periodos.map((p) => ({ periodo: p, gramos: porPeriodo.get(p) })),
    totales: {
      gramos,
      registros: Number(totalSql[0].registros),
      sujetos: Number(totalSql[0].sujetos),
      promedioGramosPorPeriodo: Math.round(gramos / periodos.length),
    },
  };
}
