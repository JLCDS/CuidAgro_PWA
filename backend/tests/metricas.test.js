import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { calificar } from '../src/modules/metricas/metricas.schemas.js';
import { app, sesionDe } from './helpers.js';

const metrica = (extra = {}) => ({ nombre: 'LCP', valor: 1800, ruta: '/vacunos', dispositivo: 'MOVIL', ...extra });
const enviar = (metricas) => request(app).post('/api/metricas').send({ metricas });

async function sembrar(nombre, valores, extra = {}) {
  await prisma.metricaWeb.createMany({
    data: valores.map((valor) => ({ nombre, valor, calificacion: calificar(nombre, valor), ruta: '/vacunos', dispositivo: 'MOVIL', ...extra })),
  });
}

describe('Fase 11 - POST /api/metricas', () => {
  it('guarda sin sesión (JSON) y responde 204; la calificación la calcula el servidor', async () => {
    await request(app)
      .post('/api/metricas')
      .send({ metricas: [metrica({ valor: 3000, conexion: '4g', version: 'v12' }), metrica({ nombre: 'CLS', valor: 0.3 }), metrica({ nombre: 'TTFB', valor: 100 })] })
      .expect(204);
    const filas = await prisma.metricaWeb.findMany();
    const por = Object.fromEntries(filas.map((f) => [f.nombre, f]));
    expect(por.LCP).toMatchObject({ calificacion: 'MEJORABLE', conexion: '4g', version: 'v12', ruta: '/vacunos', dispositivo: 'MOVIL' });
    expect(por.CLS.calificacion).toBe('MALA');
    expect(por.TTFB.calificacion).toBe('BUENA');
  });

  it('rechaza una calificación enviada por el cliente (no está en la lista blanca)', async () => {
    await enviar([{ ...metrica(), calificacion: 'BUENA' }]).expect(400);
    expect(await prisma.metricaWeb.count()).toBe(0);
  });

  it('acepta text/plain con JSON, como sendBeacon', async () => {
    await request(app)
      .post('/api/metricas')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(JSON.stringify({ metricas: [metrica({ nombre: 'FCP', valor: 900 })] }))
      .expect(204);
    expect(await prisma.metricaWeb.count({ where: { nombre: 'FCP' } })).toBe(1);
  });

  it.each([
    ['nombre inválido', metrica({ nombre: 'XYZ' })],
    ['valor negativo', metrica({ valor: -1 })],
    ['valor fuera de rango', metrica({ valor: 600001 })],
    ['CLS fuera de rango', metrica({ nombre: 'CLS', valor: 101 })],
    ['valor no numérico', metrica({ valor: '12' })],
    ['ruta sin barra inicial', metrica({ ruta: 'vacunos' })],
    ['ruta con mayúsculas', metrica({ ruta: '/Vacunos' })],
    ['ruta con parámetros', metrica({ ruta: '/vacunos?id=1' })],
    ['ruta demasiado larga', metrica({ ruta: `/${'a'.repeat(80)}` })],
    ['dispositivo inválido', metrica({ dispositivo: 'TABLET' })],
    ['conexión demasiado larga', metrica({ conexion: '12345678901' })],
    ['versión demasiado larga', metrica({ version: 'v'.repeat(21) })],
  ])('rechaza con 400 y no guarda nada: %s', async (_caso, mala) => {
    const res = await enviar([metrica(), mala]).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(await prisma.metricaWeb.count()).toBe(0);
  });

  it('rechaza lotes vacíos, de más de 10 métricas y cuerpos mal formados', async () => {
    await enviar([]).expect(400);
    await enviar(Array.from({ length: 11 }, () => metrica())).expect(400);
    await enviar(Array.from({ length: 10 }, () => metrica())).expect(204);
    await request(app).post('/api/metricas').set('Content-Type', 'text/plain').send('{no es json').expect(400);
    await request(app).post('/api/metricas').send({}).expect(400);
    await request(app).post('/api/metricas').set('Content-Type', 'text/plain').send('[]').expect(400);
  });

  it('rechaza cuerpos de más de 4 KB con 413', async () => {
    const grande = { metricas: [metrica({ version: 'x' })], relleno: 'a'.repeat(5000) };
    await request(app).post('/api/metricas').send(grande).expect(413);
    await request(app).post('/api/metricas').set('Content-Type', 'text/plain').send(JSON.stringify(grande)).expect(413);
    expect(await prisma.metricaWeb.count()).toBe(0);
  });

  it('limita los envíos por IP', async () => {
    const limitada = createApp({ metricasMaxEnvios: 3 });
    for (let i = 0; i < 3; i++) await request(limitada).post('/api/metricas').send({ metricas: [metrica()] }).expect(204);
    const res = await request(limitada).post('/api/metricas').send({ metricas: [metrica()] }).expect(429);
    expect(res.body.error.codigo).toBe('DEMASIADOS_ENVIOS');
  });

  it('no guarda usuario ni IP', async () => {
    await enviar([metrica()]).expect(204);
    const [fila] = await prisma.metricaWeb.findMany();
    expect(Object.keys(fila).sort()).toEqual(['calificacion', 'conexion', 'createdAt', 'dispositivo', 'id', 'nombre', 'ruta', 'valor', 'version']);
  });
});

describe('Fase 11 - calificar', () => {
  it.each([
    ['LCP', 2500, 'BUENA'], ['LCP', 2501, 'MEJORABLE'], ['LCP', 4000, 'MEJORABLE'], ['LCP', 4001, 'MALA'],
    ['INP', 200, 'BUENA'], ['INP', 500, 'MEJORABLE'], ['INP', 501, 'MALA'],
    ['CLS', 0.1, 'BUENA'], ['CLS', 0.25, 'MEJORABLE'], ['CLS', 0.26, 'MALA'],
    ['FCP', 1800, 'BUENA'], ['FCP', 3000, 'MEJORABLE'], ['FCP', 3001, 'MALA'],
    ['TTFB', 800, 'BUENA'], ['TTFB', 1800, 'MEJORABLE'], ['TTFB', 1801, 'MALA'],
  ])('%s %s es %s', (nombre, valor, esperado) => {
    expect(calificar(nombre, valor)).toBe(esperado);
  });
});

describe('Fase 11 - GET /api/metricas/resumen', () => {
  it('calcula p75, muestras y distribución, y ordena las rutas por muestras', async () => {
    // LCP en /vacunos (móvil): 1000..5000 -> p75 = 4000 (2 buenas, 2 mejorables, 1 mala); más 1 en /consumos.
    await sembrar('LCP', [1000, 2000, 3000, 4000, 5000]);
    await sembrar('INP', [100, 150], { ruta: '/consumos' });
    await sembrar('LCP', [1000], { ruta: '/consumos', dispositivo: 'ESCRITORIO' });
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const res = await request(app).get('/api/metricas/resumen').set(bearer).expect(200);

    expect(res.body.dias).toBe(7);
    expect(res.body.dispositivo).toBeNull();
    const lcp = res.body.general.find((m) => m.nombre === 'LCP');
    expect(lcp).toMatchObject({ p75: 3750, muestras: 6, calificacionP75: 'MEJORABLE' });
    expect(lcp.buenas).toBeCloseTo(0.5, 3);
    expect(lcp.mejorables).toBeCloseTo(0.333, 3);
    expect(lcp.malas).toBeCloseTo(0.167, 3);
    expect(res.body.general.map((m) => m.nombre)).toEqual(['LCP', 'INP']);
    expect(res.body.porRuta.map((r) => r.ruta)).toEqual(['/vacunos', '/consumos']);
    expect(res.body.porRuta[0].metricas).toEqual([{ nombre: 'LCP', p75: 4000, muestras: 5, calificacionP75: 'MEJORABLE' }]);
    expect(res.body.porRuta[1].metricas).toEqual([
      { nombre: 'LCP', p75: 1000, muestras: 1, calificacionP75: 'BUENA' },
      { nombre: 'INP', p75: 137.5, muestras: 2, calificacionP75: 'BUENA' },
    ]);
  });

  it('filtra por dispositivo y por periodo', async () => {
    await sembrar('LCP', [1000, 1000]);
    await sembrar('LCP', [5000], { dispositivo: 'ESCRITORIO' });
    await sembrar('LCP', [9000], { createdAt: new Date(Date.now() - 20 * 86_400_000) });
    const { bearer } = await sesionDe('ADMINISTRADOR');

    const movil = (await request(app).get('/api/metricas/resumen?dispositivo=MOVIL').set(bearer).expect(200)).body;
    expect(movil.dispositivo).toBe('MOVIL');
    expect(movil.general).toEqual([{ nombre: 'LCP', p75: 1000, muestras: 2, buenas: 1, mejorables: 0, malas: 0, calificacionP75: 'BUENA' }]);

    const escritorio = (await request(app).get('/api/metricas/resumen?dispositivo=ESCRITORIO').set(bearer).expect(200)).body;
    expect(escritorio.general[0]).toMatchObject({ p75: 5000, muestras: 1, calificacionP75: 'MALA' });

    const siete = (await request(app).get('/api/metricas/resumen?dias=7').set(bearer).expect(200)).body;
    expect(siete.general[0].muestras).toBe(3);
    const treinta = (await request(app).get('/api/metricas/resumen?dias=30').set(bearer).expect(200)).body;
    expect(treinta.dias).toBe(30);
    expect(treinta.general[0].muestras).toBe(4);
  });

  it('sin datos devuelve listas vacías', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const res = await request(app).get('/api/metricas/resumen').set(bearer).expect(200);
    expect(res.body).toEqual({ dias: 7, dispositivo: null, general: [], porRuta: [] });
  });

  it('valida los parámetros', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await request(app).get('/api/metricas/resumen?dias=15').set(bearer).expect(400);
    await request(app).get('/api/metricas/resumen?dispositivo=TABLET').set(bearer).expect(400);
  });

  it('solo el administrador tiene calidad:consultar', async () => {
    await request(app).get('/api/metricas/resumen').expect(401);
    const finca = await prisma.finca.create({ data: { nombre: 'F' } });
    for (const rol of ['VETERINARIO', 'AYUDANTE']) {
      const { bearer } = await sesionDe(rol, [finca.id]);
      await request(app).get('/api/metricas/resumen').set(bearer).expect(403);
    }
    const { cuerpo } = await sesionDe('ADMINISTRADOR');
    expect(cuerpo.usuario.permisos).toContain('calidad:consultar');
  });
});
