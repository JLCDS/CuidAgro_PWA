import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/dashboard';
const bogota = (dias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const fecha = (dias = 0) => new Date(`${bogota(dias)}T00:00:00Z`);

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
  const lote = (nombre, cantidad, extra = {}, fincaId = finca.id) =>
    prisma.loteOviparo.create({
      data: { fincaId, nombre, edadMinSemanas: 1, edadMaxSemanas: 10, cantidad, proposito: 'PRODUCCION', creadoPorId, ...extra },
    });
  const alimento = (nombre, extra = {}, fincaId = finca.id) =>
    prisma.alimento.create({ data: { fincaId, nombre, tipo: 'CONCENTRADO', stockGramos: 1000, stockMinimoGramos: 100, creadoPorId, ...extra } });
  const medicamento = (nombre, extra = {}, fincaId = finca.id) =>
    prisma.medicamento.create({
      data: { fincaId, nombre, tipo: 'ANTIBIOTICO', unidad: 'ML', stock: 100, stockMinimo: 10, creadoPorId, ...extra },
    });
  const consumoV = (vacunoId, alimentoId, dias, gramos, jornada = 'MANANA') =>
    prisma.consumoVacuno.create({ data: { vacunoId, alimentoId, fecha: fecha(dias), cantidadGramos: gramos, jornada, registradoPorId: creadoPorId } });
  const consumoL = (loteId, alimentoId, dias, gramos, jornada = 'MANANA') =>
    prisma.consumoLote.create({ data: { loteId, alimentoId, fecha: fecha(dias), cantidadGramos: gramos, jornada, registradoPorId: creadoPorId } });
  return { finca, otraFinca, admin, vet, ayudante, ajeno, creadoPorId, vacuno, lote, alimento, medicamento, consumoV, consumoL };
}

const pedir = (s, fincaId) => request(app).get(BASE).set(s.bearer).query({ fincaId });

describe('GET /api/dashboard', () => {
  it('exige sesión', async () => {
    await request(app).get(BASE).expect(401);
  });

  it('los tres roles pueden consultar y reciben lo mismo', async () => {
    const e = await escenario();
    await e.vacuno('Lucero');
    const [a, v, y] = await Promise.all(
      [e.admin, e.vet, e.ayudante].map((s) => pedir(s, e.finca.id).expect(200)),
    );
    expect(v.body).toEqual(a.body);
    expect(y.body).toEqual(a.body);
    expect(a.body.finca).toEqual({ id: e.finca.id, nombre: 'Finca A' });
    expect(a.body.hoy).toBe(bogota());
  });

  it('400 si fincaId falta o no es uuid, con el campo', async () => {
    const e = await escenario();
    for (const query of [{}, { fincaId: 'abc' }]) {
      const res = await request(app).get(BASE).set(e.vet.bearer).query(query).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
      expect(res.body.error.detalles[0].campo).toBe('fincaId');
    }
  });

  it('404 con finca ajena o inexistente, también para el administrador si no existe', async () => {
    const e = await escenario();
    await pedir(e.vet, e.otraFinca.id).expect(404);
    await pedir(e.ayudante, e.otraFinca.id).expect(404);
    await pedir(e.admin, UUID_INEXISTENTE).expect(404);
    await pedir(e.admin, e.otraFinca.id).expect(200);
  });

  it('finca vacía: todo en cero, 7 días con ceros y listas vacías', async () => {
    const e = await escenario();
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    expect(body.animales).toEqual({ vacunosActivos: 0, lotesActivos: 0, avesActivas: 0 });
    expect(body.alimentacion.consumoHoyGramos).toBe(0);
    expect(body.alimentacion.registrosHoy).toBe(0);
    expect(body.alimentacion.vacunosSinConsumoHoy).toBe(0);
    expect(body.alimentacion.alimentosStockBajo).toEqual([]);
    expect(body.alimentacion.ultimos7Dias).toEqual(
      Array.from({ length: 7 }, (_, i) => ({ fecha: bogota(i - 6), gramos: 0 })),
    );
    expect(body.salud).toEqual({ casosActivos: 0, novedadesAbiertas: 0, novedadesAltaAbiertas: 0, ultimasNovedades: [] });
    expect(body.medicamentos).toEqual({ conAlerta: [], animalesEnRetiro: 0 });
  });

  it('cuenta solo activos y suma las aves de los lotes activos', async () => {
    const e = await escenario();
    await e.vacuno('Uno');
    await e.vacuno('Dos');
    await e.vacuno('Baja', { estado: 'INACTIVO' });
    await e.vacuno('Ajeno', {}, e.otraFinca.id);
    await e.lote('L1', 100);
    await e.lote('L2', 50);
    await e.lote('L3', 999, { estado: 'INACTIVO' });
    await e.lote('Ajeno', 70, {}, e.otraFinca.id);
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    expect(body.animales).toEqual({ vacunosActivos: 2, lotesActivos: 2, avesActivas: 150 });
  });

  it('consumo de hoy, registros y 7 días mezclando vacunos y lotes (con ceros y sin salirse del rango)', async () => {
    const e = await escenario();
    const v = await e.vacuno('Lucero');
    const l = await e.lote('L1', 10);
    const a = await e.alimento('Concentrado');
    const ajenoV = await e.vacuno('Otro', {}, e.otraFinca.id);
    const aAjeno = await e.alimento('Ajeno', {}, e.otraFinca.id);
    await e.consumoV(v.id, a.id, 0, 5000);
    await e.consumoV(v.id, a.id, 0, 1000, 'TARDE');
    await e.consumoL(l.id, a.id, 0, 2000);
    await e.consumoV(v.id, a.id, -2, 3000);
    await e.consumoL(l.id, a.id, -6, 4000);
    await e.consumoV(v.id, a.id, -7, 9999); // fuera de los 7 días
    await e.consumoV(ajenoV.id, aAjeno.id, 0, 7777); // otra finca
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    const al = body.alimentacion;
    expect(al.consumoHoyGramos).toBe(8000);
    expect(al.registrosHoy).toBe(3);
    expect(al.ultimos7Dias).toHaveLength(7);
    expect(al.ultimos7Dias[0]).toEqual({ fecha: bogota(-6), gramos: 4000 });
    expect(al.ultimos7Dias[4]).toEqual({ fecha: bogota(-2), gramos: 3000 });
    expect(al.ultimos7Dias[6]).toEqual({ fecha: bogota(), gramos: 8000 });
    expect(al.ultimos7Dias.filter((d) => d.gramos === 0)).toHaveLength(4);
  });

  it('vacunosSinConsumoHoy: activos sin ningún consumo de hoy', async () => {
    const e = await escenario();
    const con = await e.vacuno('Con');
    await e.vacuno('Sin1');
    await e.vacuno('Sin2');
    await e.vacuno('Baja', { estado: 'INACTIVO' });
    const ayer = await e.vacuno('Solo ayer');
    const a = await e.alimento('Concentrado');
    await e.consumoV(con.id, a.id, 0, 100);
    await e.consumoV(ayer.id, a.id, -1, 100);
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    expect(body.alimentacion.vacunosSinConsumoHoy).toBe(3);
  });

  it('alimentosStockBajo: solo activos, stock <= mínimo, por nombre y máximo 10', async () => {
    const e = await escenario();
    await e.alimento('Alto', { stockGramos: 5000, stockMinimoGramos: 100 });
    await e.alimento('Igual', { stockGramos: 100, stockMinimoGramos: 100 });
    await e.alimento('Baja', { stockGramos: 0, stockMinimoGramos: 100, estado: 'INACTIVO' });
    await e.alimento('Ajeno', { stockGramos: 0 }, e.otraFinca.id);
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    expect(body.alimentacion.alimentosStockBajo).toEqual([
      { id: expect.any(String), nombre: 'Igual', stockGramos: 100, stockMinimoGramos: 100 },
    ]);

    for (let i = 0; i < 12; i++) await e.alimento(`Bajo ${String(i).padStart(2, '0')}`, { stockGramos: 0 });
    const lleno = (await pedir(e.vet, e.finca.id).expect(200)).body.alimentacion.alimentosStockBajo;
    expect(lleno).toHaveLength(10);
    expect(lleno.map((a) => a.nombre)).toEqual(
      ['Bajo 00', 'Bajo 01', 'Bajo 02', 'Bajo 03', 'Bajo 04', 'Bajo 05', 'Bajo 06', 'Bajo 07', 'Bajo 08', 'Bajo 09'],
    );
  });

  it('salud: casos activos y novedades abiertas, con alta resaltada y las 5 más recientes no cerradas', async () => {
    const e = await escenario();
    const v = await e.vacuno('Lucero');
    const l = await e.lote('L1', 10);
    const caso = (estado, vacunoId) =>
      prisma.casoSalud.create({
        data: { fincaId: e.finca.id, vacunoId, diagnostico: 'X', estado, fechaInicio: fecha(), registradoPorId: e.creadoPorId },
      });
    await caso('EN_OBSERVACION', v.id);
    await caso('EN_TRATAMIENTO', v.id);
    await caso('RECUPERADO', v.id);
    await caso('FALLECIDO', v.id);
    const nov = (extra) =>
      prisma.novedad.create({
        data: { fincaId: e.finca.id, tipo: 'ENFERMEDAD', descripcion: 'd', registradoPorId: e.creadoPorId, ...extra },
      });
    const hora = (min) => new Date(Date.UTC(2026, 10, 20, 12, 0) + min * 60_000);
    await nov({ vacunoId: v.id, prioridad: 'ALTA', estado: 'ABIERTA', fechaHora: hora(1) });
    await nov({ loteId: l.id, prioridad: 'MEDIA', estado: 'EN_SEGUIMIENTO', fechaHora: hora(2) });
    await nov({ vacunoId: v.id, prioridad: 'ALTA', estado: 'EN_SEGUIMIENTO', fechaHora: hora(3) });
    await nov({ vacunoId: v.id, prioridad: 'BAJA', estado: 'ABIERTA', fechaHora: hora(4) });
    await nov({ vacunoId: v.id, prioridad: 'BAJA', estado: 'ABIERTA', fechaHora: hora(5) });
    await nov({ vacunoId: v.id, prioridad: 'BAJA', estado: 'ABIERTA', fechaHora: hora(6) });
    await nov({ vacunoId: v.id, prioridad: 'ALTA', estado: 'CERRADA', fechaHora: hora(100), cerradaEn: hora(101) });
    const { body } = await pedir(e.ayudante, e.finca.id).expect(200);
    expect(body.salud.casosActivos).toBe(2);
    expect(body.salud.novedadesAbiertas).toBe(6);
    expect(body.salud.novedadesAltaAbiertas).toBe(2);
    const ultimas = body.salud.ultimasNovedades;
    expect(ultimas).toHaveLength(5);
    expect(ultimas.every((n) => n.estado !== 'CERRADA')).toBe(true);
    expect(ultimas.map((n) => n.fechaHora)).toEqual([6, 5, 4, 3, 2].map((m) => hora(m).toISOString()));
    expect(ultimas[0].sujeto).toEqual({ tipo: 'VACUNO', id: v.id, nombre: 'Lucero' });
    expect(ultimas[1].sujeto).toEqual({ tipo: 'VACUNO', id: v.id, nombre: 'Lucero' });
    expect(ultimas[3].sujeto).toEqual({ tipo: 'VACUNO', id: v.id, nombre: 'Lucero' });
    expect(ultimas[4].sujeto).toEqual({ tipo: 'LOTE', id: l.id, nombre: 'L1' });
    expect(Object.keys(ultimas[0]).sort()).toEqual(['estado', 'fechaHora', 'id', 'prioridad', 'sujeto', 'tipo']);
  });

  it('medicamentos con alerta: bajo stock, vencido y por vencer; sin inactivos; por nombre; máximo 10', async () => {
    const e = await escenario();
    await e.medicamento('A normal');
    await e.medicamento('B bajo', { stock: 5, stockMinimo: 10 });
    await e.medicamento('C vencido', { fechaVencimiento: fecha(-1) });
    await e.medicamento('D por vencer', { fechaVencimiento: fecha(30) });
    await e.medicamento('E lejano', { fechaVencimiento: fecha(31) });
    await e.medicamento('F baja', { stock: 0, estado: 'INACTIVO' });
    await e.medicamento('G ajeno', { stock: 0 }, e.otraFinca.id);
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    expect(body.medicamentos.conAlerta).toEqual([
      { id: expect.any(String), nombre: 'B bajo', bajoStock: true, vencido: false, porVencer: false },
      { id: expect.any(String), nombre: 'C vencido', bajoStock: false, vencido: true, porVencer: false },
      { id: expect.any(String), nombre: 'D por vencer', bajoStock: false, vencido: false, porVencer: true },
    ]);

    for (let i = 0; i < 12; i++) await e.medicamento(`Alerta ${String(i).padStart(2, '0')}`, { stock: 0 });
    const lleno = (await pedir(e.vet, e.finca.id).expect(200)).body.medicamentos.conAlerta;
    expect(lleno).toHaveLength(10);
    expect(lleno[0].nombre).toBe('Alerta 00');
  });

  it('animalesEnRetiro cuenta sujetos distintos (vacunos y lotes) con retiro vigente', async () => {
    const e = await escenario();
    const v1 = await e.vacuno('V1');
    const v2 = await e.vacuno('V2');
    const v3 = await e.vacuno('V3');
    const l = await e.lote('L1', 10);
    const med = await e.medicamento('Med');
    const trat = (extra) =>
      prisma.tratamiento.create({
        data: { fincaId: e.finca.id, medicamentoId: med.id, dosis: 1, via: 'ORAL', registradoPorId: e.creadoPorId, ...extra },
      });
    await trat({ vacunoId: v1.id, fecha: fecha(-2), diasRetiroCarne: 5 }); // vigente
    await trat({ vacunoId: v1.id, fecha: fecha(-1), diasRetiroLeche: 3 }); // mismo vacuno: cuenta una vez
    await trat({ vacunoId: v2.id, fecha: fecha(-5), diasRetiroCarne: 5 }); // termina hoy: vigente
    await trat({ vacunoId: v3.id, fecha: fecha(-10), diasRetiroCarne: 5 }); // ya terminó
    await trat({ loteId: l.id, fecha: fecha(), diasRetiroCarne: 1 }); // vigente
    await trat({ vacunoId: v3.id, fecha: fecha(), observaciones: 'sin retiro' });
    const { body } = await pedir(e.vet, e.finca.id).expect(200);
    expect(body.medicamentos.animalesEnRetiro).toBe(3);
  });
});
