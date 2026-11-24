import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/reportes/consumos';

async function escenario() {
  const finca = await crearFinca('Finca A');
  const otraFinca = await crearFinca('Finca B');
  const admin = await sesionDe('ADMINISTRADOR');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  const ayudante = await sesionDe('AYUDANTE', [finca.id]);
  const ajeno = await sesionDe('VETERINARIO', [otraFinca.id]);
  const creadoPorId = admin.usuario.id;
  const vacuno = (nombre, extra = {}, fincaId = finca.id) =>
    prisma.vacuno.create({
      data: {
        fincaId, nombre, sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400,
        fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId, ...extra,
      },
    });
  const lote = (nombre, extra = {}, fincaId = finca.id) =>
    prisma.loteOviparo.create({
      data: { fincaId, nombre, edadMinSemanas: 1, edadMaxSemanas: 10, cantidad: 10, proposito: 'PRODUCCION', creadoPorId, ...extra },
    });
  const alimento = (nombre, fincaId = finca.id) =>
    prisma.alimento.create({ data: { fincaId, nombre, tipo: 'CONCENTRADO', stockGramos: 1000, creadoPorId } });
  const consumoV = (vacunoId, alimentoId, dia, gramos, jornada = 'MANANA') =>
    prisma.consumoVacuno.create({ data: { vacunoId, alimentoId, fecha: new Date(`${dia}T00:00:00Z`), cantidadGramos: gramos, jornada, registradoPorId: creadoPorId } });
  const consumoL = (loteId, alimentoId, dia, gramos, jornada = 'MANANA') =>
    prisma.consumoLote.create({ data: { loteId, alimentoId, fecha: new Date(`${dia}T00:00:00Z`), cantidadGramos: gramos, jornada, registradoPorId: creadoPorId } });
  return { finca, otraFinca, admin, vet, ayudante, ajeno, vacuno, lote, alimento, consumoV, consumoL };
}

const pedir = (s, query) => request(app).get(BASE).set(s.bearer).query(query);

/**
 * Escenario con datos conocidos (noviembre 2026 y un consumo en octubre):
 *  Bruno (vacuno, inactivo): Concentrado 10-nov 3000, 10-nov tarde 1000, 11-nov 2000
 *  Álvaro (vacuno): Forraje 10-nov 500, Concentrado 12-nov 700
 *  Ñandú (vacuno): Concentrado 10-nov 100
 *  Lote Z (lote): Concentrado 10-nov 4000, 12-nov 1000
 *  Álvaro octubre: Forraje 31-oct 900
 */
async function datos() {
  const e = await escenario();
  const bruno = await e.vacuno('Bruno', { estado: 'INACTIVO', motivoBaja: 'Vendido' });
  const alvaro = await e.vacuno('Álvaro');
  const nandu = await e.vacuno('Ñandú');
  const loteZ = await e.lote('Lote Z');
  const conc = await e.alimento('Concentrado');
  const forr = await e.alimento('Forraje');
  await e.consumoV(bruno.id, conc.id, '2026-11-10', 3000);
  await e.consumoV(bruno.id, conc.id, '2026-11-10', 1000, 'TARDE');
  await e.consumoV(bruno.id, conc.id, '2026-11-11', 2000);
  await e.consumoV(alvaro.id, forr.id, '2026-11-10', 500);
  await e.consumoV(alvaro.id, conc.id, '2026-11-12', 700);
  await e.consumoV(nandu.id, conc.id, '2026-11-10', 100);
  await e.consumoL(loteZ.id, conc.id, '2026-11-10', 4000);
  await e.consumoL(loteZ.id, conc.id, '2026-11-12', 1000);
  await e.consumoV(alvaro.id, forr.id, '2026-10-31', 900);
  // Otra finca: nunca debe aparecer.
  const vAjeno = await e.vacuno('Ajeno', {}, e.otraFinca.id);
  const aAjeno = await e.alimento('Ajeno', e.otraFinca.id);
  await e.consumoV(vAjeno.id, aAjeno.id, '2026-11-10', 99999);
  return { ...e, bruno, alvaro, nandu, loteZ, conc, forr };
}

const nov = (e, extra = {}) => ({ fincaId: e.finca.id, desde: '2026-11-01', hasta: '2026-11-30', ...extra });

describe('GET /api/reportes/consumos: permisos y validación', () => {
  it('exige sesión', async () => {
    await request(app).get(BASE).expect(401);
  });

  it('administrador y veterinario pueden; el ayudante recibe 403', async () => {
    const e = await escenario();
    await pedir(e.admin, nov(e)).expect(200);
    await pedir(e.vet, nov(e)).expect(200);
    await pedir(e.ayudante, nov(e)).expect(403);
  });

  it.each([
    ['fincaId falta', { desde: '2026-11-01', hasta: '2026-11-30' }, 'fincaId'],
    ['fincaId no es uuid', { fincaId: 'x', desde: '2026-11-01', hasta: '2026-11-30' }, 'fincaId'],
    ['desde falta', (e) => ({ fincaId: e.finca.id, hasta: '2026-11-30' }), 'desde'],
    ['hasta falta', (e) => ({ fincaId: e.finca.id, desde: '2026-11-01' }), 'hasta'],
    ['desde con formato malo', (e) => nov(e, { desde: '01/11/2026' }), 'desde'],
    ['hasta con fecha inexistente', (e) => nov(e, { hasta: '2026-02-30' }), 'hasta'],
    ['desde posterior a hasta', (e) => nov(e, { desde: '2026-12-01' }), 'hasta'],
    ['rango de 367 días', (e) => nov(e, { desde: '2025-11-01', hasta: '2026-11-02' }), 'hasta'],
    ['agrupacion inválida', (e) => nov(e, { agrupacion: 'SEMANA' }), 'agrupacion'],
    ['sujeto inválido', (e) => nov(e, { sujeto: 'AVES' }), 'sujeto'],
    ['desglose inválido', (e) => nov(e, { desglose: 'X' }), 'desglose'],
    ['vacunoId no es uuid', (e) => nov(e, { vacunoId: 'x' }), 'vacunoId'],
    ['loteId no es uuid', (e) => nov(e, { loteId: 'x' }), 'loteId'],
    ['alimentoId no es uuid', (e) => nov(e, { alimentoId: 'x' }), 'alimentoId'],
  ])('400 VALIDACION: %s', async (_nombre, query, campo) => {
    const e = await escenario();
    const res = await pedir(e.vet, typeof query === 'function' ? query(e) : { ...query }).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(res.body.error.detalles.map((d) => d.campo)).toContain(campo);
  });

  it('el rango de 366 días exactos es válido y devuelve 366 periodos; 1 día también', async () => {
    const e = await escenario();
    const largo = await pedir(e.vet, nov(e, { desde: '2025-11-01', hasta: '2026-11-01' })).expect(200);
    expect(largo.body.serie).toHaveLength(366);
    const uno = await pedir(e.vet, nov(e, { desde: '2026-11-05', hasta: '2026-11-05' })).expect(200);
    expect(uno.body.serie).toEqual([{ periodo: '2026-11-05', gramos: 0 }]);
  });

  it('finca ajena o inexistente: respuesta vacía con totales en 0 (no 404)', async () => {
    const e = await datos();
    for (const [s, fincaId] of [[e.ajeno, e.finca.id], [e.admin, UUID_INEXISTENTE]]) {
      const { body } = await pedir(s, nov(e, { fincaId })).expect(200);
      expect(body.filas).toEqual([]);
      expect(body.serie).toHaveLength(30);
      expect(body.serie.every((p) => p.gramos === 0)).toBe(true);
      expect(body.totales).toEqual({ gramos: 0, registros: 0, sujetos: 0, promedioGramosPorPeriodo: 0 });
    }
  });
});

describe('GET /api/reportes/consumos: contenido', () => {
  it('valores por defecto y parámetros devueltos', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e)).expect(200);
    expect(body.parametros).toEqual({
      fincaId: e.finca.id, desde: '2026-11-01', hasta: '2026-11-30', agrupacion: 'DIA', sujeto: 'TODOS', desglose: 'SUJETO',
    });
  });

  it('desglose SUJETO por día: orden por periodo, tipo (vacuno antes que lote) y nombre en español; incluye inactivos', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e)).expect(200);
    const resumen = body.filas.map((f) => [f.periodo, f.sujeto.tipo, f.sujeto.nombre, f.gramos, f.registros]);
    expect(resumen).toEqual([
      ['2026-11-10', 'VACUNO', 'Álvaro', 500, 1],
      ['2026-11-10', 'VACUNO', 'Bruno', 4000, 2],
      ['2026-11-10', 'VACUNO', 'Ñandú', 100, 1],
      ['2026-11-10', 'LOTE', 'Lote Z', 4000, 1],
      ['2026-11-11', 'VACUNO', 'Bruno', 2000, 1],
      ['2026-11-12', 'VACUNO', 'Álvaro', 700, 1],
      ['2026-11-12', 'LOTE', 'Lote Z', 1000, 1],
    ]);
    expect(body.filas.every((f) => f.alimento === null)).toBe(true);
    expect(body.filas[0].sujeto.id).toBe(e.alvaro.id);
    expect(body.totales).toEqual({ gramos: 12300, registros: 8, sujetos: 4, promedioGramosPorPeriodo: 410 });
  });

  it('serie con todos los periodos del rango, también los de cero', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e)).expect(200);
    expect(body.serie).toHaveLength(30);
    expect(body.serie[0]).toEqual({ periodo: '2026-11-01', gramos: 0 });
    expect(body.serie[9]).toEqual({ periodo: '2026-11-10', gramos: 8600 });
    expect(body.serie[10]).toEqual({ periodo: '2026-11-11', gramos: 2000 });
    expect(body.serie[11]).toEqual({ periodo: '2026-11-12', gramos: 1700 });
    expect(body.serie[29]).toEqual({ periodo: '2026-11-30', gramos: 0 });
    expect(body.serie.reduce((s, p) => s + p.gramos, 0)).toBe(body.totales.gramos);
  });

  it('promedio: total entre los periodos del rango, redondeado a entero', async () => {
    const e = await datos();
    // 12300 / 3 días (10 al 12) = 4100 exacto
    const a = await pedir(e.vet, nov(e, { desde: '2026-11-10', hasta: '2026-11-12' })).expect(200);
    expect(a.body.totales.promedioGramosPorPeriodo).toBe(4100);
    // 12300 / 7 = 1757.14 -> 1757
    const b = await pedir(e.vet, nov(e, { desde: '2026-11-10', hasta: '2026-11-16' })).expect(200);
    expect(b.body.totales.promedioGramosPorPeriodo).toBe(1757);
    // 12300 / 8 = 1537.5 -> 1538
    const c = await pedir(e.vet, nov(e, { desde: '2026-11-10', hasta: '2026-11-17' })).expect(200);
    expect(c.body.totales.promedioGramosPorPeriodo).toBe(1538);
  });

  it('agrupación MES: periodo YYYY-MM, serie con todos los meses y rango que cruza el año', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e, { desde: '2026-10-15', hasta: '2027-01-10', agrupacion: 'MES', desglose: 'NINGUNO' })).expect(200);
    expect(body.serie).toEqual([
      { periodo: '2026-10', gramos: 900 },
      { periodo: '2026-11', gramos: 12300 },
      { periodo: '2026-12', gramos: 0 },
      { periodo: '2027-01', gramos: 0 },
    ]);
    expect(body.filas.map((f) => [f.periodo, f.gramos, f.registros])).toEqual([
      ['2026-10', 900, 1],
      ['2026-11', 12300, 8],
    ]);
    expect(body.totales.promedioGramosPorPeriodo).toBe(3300);
  });

  it('MES con desglose SUJETO suma los días del mes por animal', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e, { agrupacion: 'MES', sujeto: 'VACUNOS' })).expect(200);
    expect(body.filas.map((f) => [f.periodo, f.sujeto.nombre, f.gramos, f.registros])).toEqual([
      ['2026-11', 'Álvaro', 1200, 2],
      ['2026-11', 'Bruno', 6000, 3],
      ['2026-11', 'Ñandú', 100, 1],
    ]);
    expect(body.serie).toEqual([{ periodo: '2026-11', gramos: 7300 }]);
  });

  it('desglose ALIMENTO: una fila por periodo, sujeto y alimento, ordenada por nombre de alimento', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e, { desglose: 'ALIMENTO', desde: '2026-11-10', hasta: '2026-11-10', sujeto: 'VACUNOS' })).expect(200);
    expect(body.filas.map((f) => [f.sujeto.nombre, f.alimento.nombre, f.gramos])).toEqual([
      ['Álvaro', 'Forraje', 500],
      ['Bruno', 'Concentrado', 4000],
      ['Ñandú', 'Concentrado', 100],
    ]);
    expect(body.filas[0].alimento).toEqual({ id: e.forr.id, nombre: 'Forraje' });
  });

  it('desglose ALIMENTO separa varios alimentos del mismo animal', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e, { desglose: 'ALIMENTO', agrupacion: 'MES', vacunoId: e.alvaro.id })).expect(200);
    expect(body.filas.map((f) => [f.periodo, f.alimento.nombre, f.gramos])).toEqual([
      ['2026-11', 'Concentrado', 700],
      ['2026-11', 'Forraje', 500],
    ]);
  });

  it('desglose NINGUNO: una fila por periodo con el total y sujeto en null', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e, { desglose: 'NINGUNO' })).expect(200);
    expect(body.filas).toEqual([
      { periodo: '2026-11-10', sujeto: null, alimento: null, gramos: 8600, registros: 5 },
      { periodo: '2026-11-11', sujeto: null, alimento: null, gramos: 2000, registros: 1 },
      { periodo: '2026-11-12', sujeto: null, alimento: null, gramos: 1700, registros: 2 },
    ]);
    expect(body.totales.sujetos).toBe(4);
  });

  it('filtro sujeto VACUNOS y LOTES', async () => {
    const e = await datos();
    const v = await pedir(e.vet, nov(e, { sujeto: 'VACUNOS', desglose: 'NINGUNO' })).expect(200);
    expect(v.body.totales).toMatchObject({ gramos: 7300, registros: 6, sujetos: 3 });
    const l = await pedir(e.vet, nov(e, { sujeto: 'LOTES' })).expect(200);
    expect(l.body.filas.map((f) => [f.periodo, f.sujeto.tipo, f.gramos])).toEqual([
      ['2026-11-10', 'LOTE', 4000],
      ['2026-11-12', 'LOTE', 1000],
    ]);
    expect(l.body.totales).toEqual({ gramos: 5000, registros: 2, sujetos: 1, promedioGramosPorPeriodo: 167 });
  });

  it('filtros vacunoId, loteId y alimentoId', async () => {
    const e = await datos();
    const porVacuno = await pedir(e.vet, nov(e, { vacunoId: e.bruno.id })).expect(200);
    expect(porVacuno.body.totales).toMatchObject({ gramos: 6000, registros: 3, sujetos: 1 });
    const porLote = await pedir(e.vet, nov(e, { loteId: e.loteZ.id })).expect(200);
    expect(porLote.body.totales).toMatchObject({ gramos: 5000, registros: 2, sujetos: 1 });
    const ambos = await pedir(e.vet, nov(e, { vacunoId: e.bruno.id, loteId: e.loteZ.id })).expect(200);
    expect(ambos.body.totales).toMatchObject({ gramos: 11000, sujetos: 2 });
    const porAlimento = await pedir(e.vet, nov(e, { alimentoId: e.forr.id })).expect(200);
    expect(porAlimento.body.totales).toMatchObject({ gramos: 500, registros: 1, sujetos: 1 });
    const combinado = await pedir(e.vet, nov(e, { alimentoId: e.conc.id, vacunoId: e.alvaro.id })).expect(200);
    expect(combinado.body.totales).toMatchObject({ gramos: 700, registros: 1 });
  });

  it('vacuno o lote ajeno o inexistente: respuesta vacía', async () => {
    const e = await datos();
    const vAjeno = await prisma.vacuno.findFirstOrThrow({ where: { fincaId: e.otraFinca.id } });
    for (const filtro of [{ vacunoId: vAjeno.id }, { vacunoId: UUID_INEXISTENTE }, { loteId: UUID_INEXISTENTE }]) {
      const { body } = await pedir(e.vet, nov(e, filtro)).expect(200);
      expect(body.filas).toEqual([]);
      expect(body.totales).toEqual({ gramos: 0, registros: 0, sujetos: 0, promedioGramosPorPeriodo: 0 });
      expect(body.serie).toHaveLength(30);
    }
    // vacuno ajeno + sujeto LOTES: no hay nada que consultar
    const vacio = await pedir(e.vet, nov(e, { sujeto: 'LOTES', vacunoId: e.bruno.id })).expect(200);
    expect(vacio.body.filas).toEqual([]);
  });

  it('los extremos del rango son inclusivos', async () => {
    const e = await datos();
    const { body } = await pedir(e.vet, nov(e, { desde: '2026-10-31', hasta: '2026-11-10', desglose: 'NINGUNO' })).expect(200);
    expect(body.filas.map((f) => [f.periodo, f.gramos])).toEqual([['2026-10-31', 900], ['2026-11-10', 8600]]);
  });

  it('nunca incluye consumos de otra finca', async () => {
    const e = await datos();
    const { body } = await pedir(e.admin, nov(e, { desglose: 'NINGUNO' })).expect(200);
    expect(body.totales.gramos).toBe(12300);
    const otra = await pedir(e.ajeno, nov(e, { fincaId: e.otraFinca.id, desglose: 'NINGUNO' })).expect(200);
    expect(otra.body.totales.gramos).toBe(99999);
  });

  it('un valor con comillas o SQL en un uuid se rechaza sin llegar a la base', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { alimentoId: "' OR 1=1 --" })).expect(400);
    expect(res.body.error.detalles[0].campo).toBe('alimentoId');
  });
});
