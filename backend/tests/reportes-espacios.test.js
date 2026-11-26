import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe } from './helpers.js';

const BASE = '/api/reportes/consumos';

/**
 * Noviembre 2026:
 *  Lote 1 en G1-C1: 10-nov 4000, 12-nov 1000
 *  Lote 2 en G1-C2: 10-nov 2000
 *  Lote 3 sin espacio: 10-nov 300
 *  Vacuno: 10-nov 50
 *  Lote 1 pasó después a G1-C2: 15-nov 700 (la instantánea queda en C2)
 */
async function datos() {
  const finca = await crearFinca('Finca A');
  const otra = await crearFinca('Finca B');
  const admin = await sesionDe('ADMINISTRADOR');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  const creadoPorId = admin.usuario.id;
  const espacio = (codigo, fincaId = finca.id) => prisma.espacio.create({ data: { fincaId, codigo, tipo: 'CUADRANTE', creadoPorId } });
  const c1 = await espacio('G1-C1');
  const c2 = await espacio('G1-C2');
  const lote = (nombre, espacioId = null, fincaId = finca.id) =>
    prisma.loteOviparo.create({
      data: { fincaId, nombre, edadMinSemanas: 0, edadMaxSemanas: 0, cantidad: 10, proposito: 'ALIMENTACION', espacioId, creadoPorId },
    });
  const l1 = await lote('Lote 1', c1.id);
  const l2 = await lote('Lote 2', c2.id);
  const l3 = await lote('Lote 3');
  const alimento = await prisma.alimento.create({ data: { fincaId: finca.id, nombre: 'Concentrado', tipo: 'CONCENTRADO', stockGramos: 1000, creadoPorId } });
  const vacuno = await prisma.vacuno.create({
    data: {
      fincaId: finca.id, nombre: 'Bruno', sexo: 'MACHO', raza: 'Holstein', edadMeses: 24, peso: 400,
      fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId,
    },
  });
  const consumo = (loteId, espacioId, dia, gramos) =>
    prisma.consumoLote.create({
      data: { loteId, espacioId, alimentoId: alimento.id, fecha: new Date(`${dia}T00:00:00Z`), cantidadGramos: gramos, jornada: 'MANANA', registradoPorId: creadoPorId },
    });
  await consumo(l1.id, c1.id, '2026-11-10', 4000);
  await consumo(l1.id, c1.id, '2026-11-12', 1000);
  await consumo(l2.id, c2.id, '2026-11-10', 2000);
  await consumo(l3.id, null, '2026-11-10', 300);
  await consumo(l1.id, c2.id, '2026-11-15', 700);
  await prisma.consumoVacuno.create({
    data: { vacunoId: vacuno.id, alimentoId: alimento.id, fecha: new Date('2026-11-10T00:00:00Z'), cantidadGramos: 50, jornada: 'MANANA', registradoPorId: creadoPorId },
  });
  // Otra finca: nunca debe aparecer.
  const eAjeno = await espacio('G1-C1', otra.id);
  const lAjeno = await lote('Ajeno', eAjeno.id, otra.id);
  const aAjeno = await prisma.alimento.create({ data: { fincaId: otra.id, nombre: 'Ajeno', tipo: 'CONCENTRADO', stockGramos: 1000, creadoPorId } });
  await prisma.consumoLote.create({
    data: { loteId: lAjeno.id, espacioId: eAjeno.id, alimentoId: aAjeno.id, fecha: new Date('2026-11-10T00:00:00Z'), cantidadGramos: 99999, jornada: 'MANANA', registradoPorId: creadoPorId },
  });
  return { finca, otra, admin, vet, c1, c2, l1, l2, l3, eAjeno };
}

const nov = (e, extra = {}) => ({ fincaId: e.finca.id, desde: '2026-11-01', hasta: '2026-11-30', ...extra });
const pedir = (s, query) => request(app).get(BASE).set(s.bearer).query(query);

describe('reportes - desglose por espacio', () => {
  it('agrupa por periodo y espacio de la instantánea, con la fila "Sin espacio" al final', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { sujeto: 'LOTES', desglose: 'ESPACIO' })).expect(200);
    expect(res.body.filas).toEqual([
      { periodo: '2026-11-10', sujeto: { tipo: 'ESPACIO', id: e.c1.id, nombre: 'G1-C1' }, alimento: null, gramos: 4000, registros: 1 },
      { periodo: '2026-11-10', sujeto: { tipo: 'ESPACIO', id: e.c2.id, nombre: 'G1-C2' }, alimento: null, gramos: 2000, registros: 1 },
      { periodo: '2026-11-10', sujeto: { tipo: 'ESPACIO', id: null, nombre: 'Sin espacio' }, alimento: null, gramos: 300, registros: 1 },
      { periodo: '2026-11-12', sujeto: { tipo: 'ESPACIO', id: e.c1.id, nombre: 'G1-C1' }, alimento: null, gramos: 1000, registros: 1 },
      { periodo: '2026-11-15', sujeto: { tipo: 'ESPACIO', id: e.c2.id, nombre: 'G1-C2' }, alimento: null, gramos: 700, registros: 1 },
    ]);
    expect(res.body.parametros.desglose).toBe('ESPACIO');
    expect(res.body.totales).toMatchObject({ gramos: 8000, registros: 5, sujetos: 2 });
    expect(res.body.serie.find((s) => s.periodo === '2026-11-10').gramos).toBe(6300);
  });

  it('agrupación mensual suma por espacio', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { sujeto: 'LOTES', desglose: 'ESPACIO', agrupacion: 'MES' })).expect(200);
    expect(res.body.filas.map((f) => [f.periodo, f.sujeto.nombre, f.gramos])).toEqual([
      ['2026-11', 'G1-C1', 5000],
      ['2026-11', 'G1-C2', 2700],
      ['2026-11', 'Sin espacio', 300],
    ]);
  });

  it('400 con desglose ESPACIO si el sujeto no es LOTES (VACUNOS, TODOS o por defecto)', async () => {
    const e = await datos();
    for (const extra of [{ sujeto: 'VACUNOS' }, { sujeto: 'TODOS' }, {}]) {
      const res = await pedir(e.vet, nov(e, { desglose: 'ESPACIO', ...extra })).expect(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'desglose', mensaje: 'El desglose por espacio solo aplica a lotes' }]);
    }
  });
});

describe('reportes - filtro por espacio', () => {
  it('solo trae consumos cuya instantánea es ese espacio (no los del lote actual)', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { espacioId: e.c2.id, desglose: 'SUJETO' })).expect(200);
    expect(res.body.filas.map((f) => [f.periodo, f.sujeto.nombre, f.gramos])).toEqual([
      ['2026-11-10', 'Lote 2', 2000],
      ['2026-11-15', 'Lote 1', 700],
    ]);
    expect(res.body.totales).toMatchObject({ gramos: 2700, registros: 2, sujetos: 2 });
  });

  it('implica lotes aunque el sujeto sea TODOS: no entran vacunos', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { espacioId: e.c1.id, sujeto: 'TODOS', desglose: 'NINGUNO' })).expect(200);
    expect(res.body.totales).toMatchObject({ gramos: 5000, registros: 2 });
  });

  it('se combina con el desglose por espacio y con loteId', async () => {
    const e = await datos();
    const a = await pedir(e.vet, nov(e, { espacioId: e.c1.id, sujeto: 'LOTES', desglose: 'ESPACIO' })).expect(200);
    expect(a.body.filas.map((f) => f.sujeto.nombre)).toEqual(['G1-C1', 'G1-C1']);
    const b = await pedir(e.vet, nov(e, { espacioId: e.c2.id, loteId: e.l1.id, desglose: 'NINGUNO' })).expect(200);
    expect(b.body.totales).toMatchObject({ gramos: 700, registros: 1 });
  });

  it('400 campo espacioId con sujeto VACUNOS o con vacunoId', async () => {
    const e = await datos();
    for (const extra of [{ sujeto: 'VACUNOS' }, { vacunoId: e.l1.id }]) {
      const res = await pedir(e.vet, nov(e, { espacioId: e.c1.id, ...extra })).expect(400);
      expect(res.body.error.detalles[0].campo).toBe('espacioId');
    }
    await pedir(e.vet, nov(e, { espacioId: 'no-uuid' })).expect(400);
  });

  it('un espacio de otra finca devuelve el reporte vacío', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { espacioId: e.eAjeno.id })).expect(200);
    expect(res.body.filas).toEqual([]);
    expect(res.body.totales.gramos).toBe(0);
  });

  it('el reporte sin espacio sigue igual: vacunos y lotes por sujeto', async () => {
    const e = await datos();
    const res = await pedir(e.vet, nov(e, { desglose: 'NINGUNO' })).expect(200);
    expect(res.body.totales).toMatchObject({ gramos: 8050, registros: 6 });
  });

  it('el ayudante no consulta reportes (403)', async () => {
    const e = await datos();
    const ayudante = await sesionDe('AYUDANTE', [e.finca.id]);
    await pedir(ayudante, nov(e, { sujeto: 'LOTES', desglose: 'ESPACIO' })).expect(403);
  });
});
