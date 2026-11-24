import { noEncontrado } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { exigirFinca, compararNombres, hoyBogota } from '../../lib/registros.js';
import { bajoStockMedicamento, ESTADOS_CASO_ACTIVOS, estadoVencimiento } from '../../lib/serializers.js';

const LIMITE_ALERTAS = 10;
const LIMITE_NOVEDADES = 5;
const MAX_DIAS_RETIRO = 365;
const DIA_MS = 86_400_000;

const sumarDias = (fecha, dias) => new Date(fecha.getTime() + dias * DIA_MS);
const iso = (fecha) => fecha.toISOString().slice(0, 10);
const porNombre = (a, b) => compararNombres(a.nombre, b.nombre) || a.id.localeCompare(b.id);

/** Gramos y registros por fecha (vacunos + lotes) de los últimos 7 días; SQL parametrizado. */
async function consumosPorDia(fincaId, desde, hasta) {
  const filas = await prisma.$queryRaw`
    SELECT fecha, SUM(gramos)::bigint AS gramos, SUM(registros)::bigint AS registros FROM (
      SELECT c.fecha, c.cantidad_gramos AS gramos, 1 AS registros
        FROM consumos_vacunos c JOIN vacunos v ON v.id = c.vacuno_id
       WHERE v.finca_id = ${fincaId}::uuid AND c.fecha BETWEEN ${desde}::date AND ${hasta}::date
      UNION ALL
      SELECT c.fecha, c.cantidad_gramos AS gramos, 1 AS registros
        FROM consumos_lotes c JOIN lotes_oviparos l ON l.id = c.lote_id
       WHERE l.finca_id = ${fincaId}::uuid AND c.fecha BETWEEN ${desde}::date AND ${hasta}::date
    ) t
    GROUP BY fecha`;
  return new Map(filas.map((f) => [iso(f.fecha), { gramos: Number(f.gramos), registros: Number(f.registros) }]));
}

/** Sujetos distintos con algún tratamiento cuyo retiro (carne o leche) aún no termina. */
async function animalesEnRetiro(fincaId, hoy) {
  const tratamientos = await prisma.tratamiento.findMany({
    where: {
      fincaId,
      fecha: { gte: sumarDias(new Date(`${hoy}T00:00:00Z`), -MAX_DIAS_RETIRO) },
      OR: [{ diasRetiroCarne: { not: null } }, { diasRetiroLeche: { not: null } }],
    },
    select: { vacunoId: true, loteId: true, fecha: true, diasRetiroCarne: true, diasRetiroLeche: true },
  });
  const sujetos = new Set();
  for (const t of tratamientos) {
    const enRetiro = [t.diasRetiroCarne, t.diasRetiroLeche].some(
      (dias) => dias !== null && iso(sumarDias(t.fecha, dias)) >= hoy,
    );
    if (enRetiro) sujetos.add(t.vacunoId ? `V${t.vacunoId}` : `L${t.loteId}`);
  }
  return sujetos.size;
}

export async function obtenerDashboard(actor, { fincaId }) {
  await exigirFinca(actor, fincaId);
  const hoy = hoyBogota();
  const hoyFecha = new Date(`${hoy}T00:00:00Z`);
  const inicio = sumarDias(hoyFecha, -6);

  const [
    finca, vacunosActivos, lotes, vacunosSinConsumoHoy, porDia, alimentos, casosActivos,
    novedadesAbiertas, novedadesAltaAbiertas, ultimas, medicamentos, enRetiro,
  ] = await Promise.all([
    prisma.finca.findUnique({ where: { id: fincaId }, select: { id: true, nombre: true } }),
    prisma.vacuno.count({ where: { fincaId, estado: 'ACTIVO' } }),
    prisma.loteOviparo.findMany({ where: { fincaId, estado: 'ACTIVO' }, select: { cantidad: true } }),
    prisma.vacuno.count({ where: { fincaId, estado: 'ACTIVO', consumos: { none: { fecha: hoyFecha } } } }),
    consumosPorDia(fincaId, inicio, hoyFecha),
    prisma.alimento.findMany({ where: { fincaId, estado: 'ACTIVO' }, select: { id: true, nombre: true, stockGramos: true, stockMinimoGramos: true } }),
    prisma.casoSalud.count({ where: { fincaId, estado: { in: ESTADOS_CASO_ACTIVOS } } }),
    prisma.novedad.count({ where: { fincaId, estado: { not: 'CERRADA' } } }),
    prisma.novedad.count({ where: { fincaId, estado: { not: 'CERRADA' }, prioridad: 'ALTA' } }),
    prisma.novedad.findMany({
      where: { fincaId, estado: { not: 'CERRADA' } },
      orderBy: [{ fechaHora: 'desc' }, { id: 'asc' }],
      take: LIMITE_NOVEDADES,
      include: { vacuno: { select: { id: true, nombre: true } }, lote: { select: { id: true, nombre: true } } },
    }),
    prisma.medicamento.findMany({ where: { fincaId, estado: 'ACTIVO' } }),
    animalesEnRetiro(fincaId, hoy),
  ]);
  if (!finca) throw noEncontrado('Finca');

  const ultimos7Dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = iso(sumarDias(inicio, i));
    return { fecha, gramos: porDia.get(fecha)?.gramos ?? 0 };
  });

  return {
    finca,
    hoy,
    animales: {
      vacunosActivos,
      lotesActivos: lotes.length,
      avesActivas: lotes.reduce((suma, l) => suma + l.cantidad, 0),
    },
    alimentacion: {
      consumoHoyGramos: porDia.get(hoy)?.gramos ?? 0,
      registrosHoy: porDia.get(hoy)?.registros ?? 0,
      vacunosSinConsumoHoy,
      ultimos7Dias,
      alimentosStockBajo: alimentos
        .filter((a) => a.stockGramos <= a.stockMinimoGramos)
        .sort(porNombre)
        .slice(0, LIMITE_ALERTAS)
        .map((a) => ({ id: a.id, nombre: a.nombre, stockGramos: a.stockGramos, stockMinimoGramos: a.stockMinimoGramos })),
    },
    salud: {
      casosActivos,
      novedadesAbiertas,
      novedadesAltaAbiertas,
      ultimasNovedades: ultimas.map((n) => ({
        id: n.id,
        tipo: n.tipo,
        prioridad: n.prioridad,
        estado: n.estado,
        fechaHora: n.fechaHora.toISOString(),
        sujeto: n.vacuno
          ? { tipo: 'VACUNO', id: n.vacuno.id, nombre: n.vacuno.nombre }
          : n.lote
            ? { tipo: 'LOTE', id: n.lote.id, nombre: n.lote.nombre }
            : null,
      })),
    },
    medicamentos: {
      conAlerta: medicamentos
        .map((m) => ({
          id: m.id,
          nombre: m.nombre,
          bajoStock: bajoStockMedicamento(m),
          ...estadoVencimiento(m.fechaVencimiento, hoy),
        }))
        .filter((m) => m.bajoStock || m.vencido || m.porVencer)
        .sort(porNombre)
        .slice(0, LIMITE_ALERTAS),
      animalesEnRetiro: enRetiro,
    },
  };
}
