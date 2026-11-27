import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { calificar, NOMBRES } from './metricas.schemas.js';

const RETENCION_DIAS = 90;

/** Guarda el lote de métricas; la calificación la calcula el servidor. Con probabilidad 1/100 purga las antiguas. */
export async function registrarMetricas(metricas) {
  await prisma.metricaWeb.createMany({
    data: metricas.map((m) => ({
      nombre: m.nombre,
      valor: m.valor,
      calificacion: calificar(m.nombre, m.valor),
      ruta: m.ruta,
      dispositivo: m.dispositivo,
      conexion: m.conexion ?? null,
      version: m.version ?? null,
    })),
  });
  if (Math.random() < 0.01) {
    await prisma.metricaWeb.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENCION_DIAS * 86_400_000) } } });
  }
}

const orden = (nombre) => NOMBRES.indexOf(nombre);

export async function resumenMetricas({ dias, dispositivo }) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const filtroDispositivo = dispositivo ? Prisma.sql`AND dispositivo = ${dispositivo}::"DispositivoMetrica"` : Prisma.empty;

  const [general, porRuta] = await Promise.all([
    prisma.$queryRaw`
      SELECT nombre::text AS nombre,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY valor) AS p75,
             COUNT(*)::int AS muestras,
             COUNT(*) FILTER (WHERE calificacion = 'BUENA')::int AS buenas,
             COUNT(*) FILTER (WHERE calificacion = 'MEJORABLE')::int AS mejorables,
             COUNT(*) FILTER (WHERE calificacion = 'MALA')::int AS malas
      FROM metricas_web
      WHERE created_at >= ${desde} ${filtroDispositivo}
      GROUP BY nombre`,
    prisma.$queryRaw`
      SELECT ruta, nombre::text AS nombre,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY valor) AS p75,
             COUNT(*)::int AS muestras
      FROM metricas_web
      WHERE created_at >= ${desde} ${filtroDispositivo}
      GROUP BY ruta, nombre`,
  ]);

  const redondear = (n) => Math.round(Number(n) * 1000) / 1000;
  const proporcion = (n, total) => Math.round((n / total) * 1000) / 1000;

  const rutas = new Map();
  for (const f of porRuta) {
    const entrada = rutas.get(f.ruta) ?? { ruta: f.ruta, muestras: 0, metricas: [] };
    const p75 = redondear(f.p75);
    entrada.muestras += f.muestras;
    entrada.metricas.push({ nombre: f.nombre, p75, muestras: f.muestras, calificacionP75: calificar(f.nombre, p75) });
    rutas.set(f.ruta, entrada);
  }

  return {
    dias,
    dispositivo: dispositivo ?? null,
    general: general
      .sort((a, b) => orden(a.nombre) - orden(b.nombre))
      .map((f) => {
        const p75 = redondear(f.p75);
        return {
          nombre: f.nombre,
          p75,
          muestras: f.muestras,
          buenas: proporcion(f.buenas, f.muestras),
          mejorables: proporcion(f.mejorables, f.muestras),
          malas: proporcion(f.malas, f.muestras),
          calificacionP75: calificar(f.nombre, p75),
        };
      }),
    porRuta: [...rutas.values()]
      .sort((a, b) => b.muestras - a.muestras || a.ruta.localeCompare(b.ruta))
      .map(({ ruta, metricas }) => ({ ruta, metricas: metricas.sort((a, b) => orden(a.nombre) - orden(b.nombre)) })),
  };
}
