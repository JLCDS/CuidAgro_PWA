import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/tratamientos';
const bogota = (dias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

async function escenario() {
  const finca = await crearFinca('Finca A');
  const otraFinca = await crearFinca('Finca B');
  const admin = await sesionDe('ADMINISTRADOR');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  const ayudante = await sesionDe('AYUDANTE', [finca.id]);
  const ajeno = await sesionDe('VETERINARIO', [otraFinca.id]);
  const base = { fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId: admin.usuario.id };
  const vacuno = await prisma.vacuno.create({
    data: { ...base, fincaId: finca.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400 },
  });
  const otroVacuno = await prisma.vacuno.create({
    data: { ...base, fincaId: finca.id, nombre: 'Canelo', sexo: 'MACHO', raza: 'Brahman', edadMeses: 30, peso: 450 },
  });
  const vacunoAjeno = await prisma.vacuno.create({
    data: { ...base, fincaId: otraFinca.id, nombre: 'Ajeno', sexo: 'MACHO', raza: 'Brahman', edadMeses: 30, peso: 450 },
  });
  const lote = await prisma.loteOviparo.create({
    data: {
      fincaId: finca.id, nombre: 'Lote Uno', edadMinSemanas: 1, edadMaxSemanas: 10, cantidad: 100,
      proposito: 'PRODUCCION', creadoPorId: admin.usuario.id,
    },
  });
  return { finca, otraFinca, admin, vet, ayudante, ajeno, vacuno, otroVacuno, vacunoAjeno, lote, creadoPorId: admin.usuario.id };
}

const medicamento = (e, extra = {}, fincaId = e.finca.id) =>
  prisma.medicamento.create({
    data: {
      fincaId, nombre: `Med ${Math.random().toString(36).slice(2, 8)}`, tipo: 'ANTIBIOTICO', unidad: 'ML',
      stock: 100, stockMinimo: 10, diasRetiroCarne: 28, diasRetiroLeche: 4, creadoPorId: e.creadoPorId, ...extra,
    },
  });
const stockDe = async (id) => Number((await prisma.medicamento.findUniqueOrThrow({ where: { id } })).stock);
const caso = (e, extra = {}) =>
  prisma.casoSalud.create({
    data: {
      fincaId: e.finca.id, vacunoId: e.vacuno.id, diagnostico: 'Mastitis', fechaInicio: new Date(`${bogota(-3)}T00:00:00Z`),
      registradoPorId: e.creadoPorId, ...extra,
    },
  });

const crear = (s, cuerpo) => request(app).post(BASE).set(s.bearer).send(cuerpo);
const enVacuno = (e, m, extra = {}) => ({ vacunoId: e.vacuno.id, medicamentoId: m.id, dosis: 10, via: 'INTRAMUSCULAR', ...extra });
const enLote = (e, m, extra = {}) => ({ loteId: e.lote.id, medicamentoId: m.id, dosis: 10, via: 'EN_AGUA', ...extra });
const listar = async (s, query = '') => (await request(app).get(`${BASE}${query}`).set(s.bearer).expect(200)).body;

describe('tratamientos - permisos', () => {
  it('sin token responde 401', async () => {
    for (const [m, r] of [['get', BASE], ['get', `${BASE}/${UUID_INEXISTENTE}`], ['post', BASE], ['patch', `${BASE}/${UUID_INEXISTENTE}`], ['delete', `${BASE}/${UUID_INEXISTENTE}`]]) {
      expect((await request(app)[m](r)).status, r).toBe(401);
    }
  });

  it('el ayudante solo consulta; admin y veterinario registran', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    expect((await crear(e.ayudante, enVacuno(e, m))).status).toBe(403);
    const { body } = await crear(e.vet, enVacuno(e, m));
    expect((await crear(e.admin, enLote(e, m))).status).toBe(201);
    expect((await request(app).patch(`${BASE}/${body.id}`).set(e.ayudante.bearer).send({ dosis: 1 })).status).toBe(403);
    expect((await request(app).delete(`${BASE}/${body.id}`).set(e.ayudante.bearer)).status).toBe(403);
    expect((await request(app).get(BASE).set(e.ayudante.bearer)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${body.id}`).set(e.ayudante.bearer)).status).toBe(200);
    expect(await stockDe(m.id)).toBe(80);
  });
});

describe('tratamientos - alcance por finca', () => {
  it('un tratamiento ajeno responde 404 y el listado con fincaId ajena es []', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const { body } = await crear(e.vet, enVacuno(e, m)).expect(201);
    expect((await request(app).get(`${BASE}/${body.id}`).set(e.ajeno.bearer)).status).toBe(404);
    expect((await request(app).patch(`${BASE}/${body.id}`).set(e.ajeno.bearer).send({ dosis: 1 })).status).toBe(404);
    expect((await request(app).delete(`${BASE}/${body.id}`).set(e.ajeno.bearer)).status).toBe(404);
    expect(await listar(e.ajeno, `?fincaId=${e.finca.id}`)).toEqual([]);
    expect(await listar(e.ajeno)).toEqual([]);
    expect(await stockDe(m.id)).toBe(90);
  });

  it('crear con animal o medicamento ajeno responde 404 sin tocar el stock', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const mAjeno = await medicamento(e, {}, e.otraFinca.id);
    expect((await crear(e.vet, enVacuno(e, m, { vacunoId: e.vacunoAjeno.id }))).status).toBe(404);
    expect((await crear(e.vet, enVacuno(e, mAjeno))).status).toBe(404);
    expect((await crear(e.vet, enVacuno(e, m, { vacunoId: UUID_INEXISTENTE }))).status).toBe(404);
    expect((await crear(e.vet, enVacuno(e, m, { medicamentoId: UUID_INEXISTENTE }))).status).toBe(404);
    expect((await crear(e.vet, enVacuno(e, m, { casoSaludId: UUID_INEXISTENTE }))).status).toBe(404);
    expect(await stockDe(m.id)).toBe(100);
  });

  it('el administrador usa un medicamento de otra finca del animal solo si coincide (400)', async () => {
    const e = await escenario();
    const mOtra = await medicamento(e, {}, e.otraFinca.id);
    const res = await crear(e.admin, enVacuno(e, mOtra)).expect(400);
    expect(res.body.error.detalles[0].campo).toBe('medicamentoId');
    expect(await stockDe(mOtra.id)).toBe(100);
  });

  it('id mal formado responde 404', async () => {
    const e = await escenario();
    expect((await request(app).get(`${BASE}/xyz`).set(e.vet.bearer)).status).toBe(404);
  });
});

describe('tratamientos - crear', () => {
  it('en un vacuno: descuenta el stock y copia los días de retiro del medicamento', async () => {
    const e = await escenario();
    const m = await medicamento(e, { stock: 50, stockMinimo: 5 });
    const res = await crear(e.vet, enVacuno(e, m, { dosis: 12.5, observaciones: 'Cuarto trasero' })).expect(201);
    expect(res.body).toMatchObject({
      vacunoId: e.vacuno.id,
      loteId: null,
      casoSaludId: null,
      casoSalud: null,
      medicamentoId: m.id,
      dosis: 12.5,
      via: 'INTRAMUSCULAR',
      fecha: bogota(),
      diasRetiroCarne: 28,
      diasRetiroLeche: 4,
      finRetiroCarne: bogota(28),
      finRetiroLeche: bogota(4),
      enRetiro: true,
      observaciones: 'Cuarto trasero',
      vacuno: { id: e.vacuno.id, nombre: 'Lucero' },
      lote: null,
      finca: { id: e.finca.id, nombre: 'Finca A' },
      registradoPor: { id: e.vet.usuario.id },
      medicamento: { id: m.id, nombre: m.nombre, unidad: 'ML', stock: 37.5, bajoStock: false },
    });
    expect(await stockDe(m.id)).toBe(37.5);
  });

  it('en un lote', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const res = await crear(e.vet, enLote(e, m)).expect(201);
    expect(res.body).toMatchObject({ loteId: e.lote.id, vacunoId: null, lote: { id: e.lote.id, nombre: 'Lote Uno' }, vacuno: null });
  });

  it('días de retiro enviados pisan los del medicamento; null los anula', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const a = await crear(e.vet, enVacuno(e, m, { diasRetiroCarne: 5, diasRetiroLeche: null })).expect(201);
    expect(a.body).toMatchObject({ diasRetiroCarne: 5, diasRetiroLeche: null, finRetiroCarne: bogota(5), finRetiroLeche: null });
  });

  it('sin días de retiro en el medicamento: no hay retiro', async () => {
    const e = await escenario();
    const m = await medicamento(e, { diasRetiroCarne: null, diasRetiroLeche: null });
    const res = await crear(e.vet, enVacuno(e, m)).expect(201);
    expect(res.body).toMatchObject({ finRetiroCarne: null, finRetiroLeche: null, enRetiro: false });
  });

  it('retiro cumplido: enRetiro es falso; el último día cuenta como en retiro', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const viejo = await crear(e.vet, enVacuno(e, m, { fecha: bogota(-10), diasRetiroCarne: 5, diasRetiroLeche: 0 })).expect(201);
    expect(viejo.body.enRetiro).toBe(false);
    const limite = await crear(e.vet, enVacuno(e, m, { fecha: bogota(-5), diasRetiroCarne: 5, diasRetiroLeche: null })).expect(201);
    expect(limite.body).toMatchObject({ finRetiroCarne: bogota(), enRetiro: true });
  });

  it('stock negativo permitido y marcado como bajoStock', async () => {
    const e = await escenario();
    const m = await medicamento(e, { stock: 5, stockMinimo: 0 });
    const res = await crear(e.vet, enVacuno(e, m, { dosis: 8 })).expect(201);
    expect(res.body.medicamento).toMatchObject({ stock: -3, bajoStock: true });
    expect(await stockDe(m.id)).toBe(-3);
  });

  it('decimales: 0.1 + 0.2 queda en 0.3', async () => {
    const e = await escenario();
    const m = await medicamento(e, { stock: 1 });
    await crear(e.vet, enVacuno(e, m, { dosis: 0.1 })).expect(201);
    await crear(e.vet, enLote(e, m, { dosis: 0.2 })).expect(201);
    expect(await stockDe(m.id)).toBe(0.7);
  });

  it('casoSalud del mismo animal se vincula', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const c = await caso(e);
    const res = await crear(e.vet, enVacuno(e, m, { casoSaludId: c.id })).expect(201);
    expect(res.body).toMatchObject({ casoSaludId: c.id, casoSalud: { id: c.id, diagnostico: 'Mastitis' } });
  });

  it('casoSalud de otro animal o de un lote responde 400 en casoSaludId', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const deOtro = await caso(e, { vacunoId: e.otroVacuno.id });
    const deLote = await caso(e, { vacunoId: null, loteId: e.lote.id });
    for (const c of [deOtro, deLote]) {
      const res = await crear(e.vet, enVacuno(e, m, { casoSaludId: c.id })).expect(400);
      expect(res.body.error.detalles[0].campo).toBe('casoSaludId');
    }
    expect(await stockDe(m.id)).toBe(100);
  });

  it('animal o lote inactivo responde 400', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    await prisma.vacuno.update({ where: { id: e.vacuno.id }, data: { estado: 'INACTIVO' } });
    await prisma.loteOviparo.update({ where: { id: e.lote.id }, data: { estado: 'INACTIVO' } });
    expect((await crear(e.vet, enVacuno(e, m))).body.error.detalles[0].campo).toBe('vacunoId');
    expect((await crear(e.vet, enLote(e, m))).body.error.detalles[0].campo).toBe('loteId');
    expect(await stockDe(m.id)).toBe(100);
  });

  it('medicamento inactivo responde 400 en medicamentoId', async () => {
    const e = await escenario();
    const m = await medicamento(e, { estado: 'INACTIVO' });
    const res = await crear(e.vet, enVacuno(e, m)).expect(400);
    expect(res.body.error.detalles[0].campo).toBe('medicamentoId');
  });

  it('medicamento vencido responde 400 en medicamentoId; el que vence hoy se acepta', async () => {
    const e = await escenario();
    const vencido = await medicamento(e, { fechaVencimiento: new Date(`${bogota(-1)}T00:00:00Z`) });
    const hoy = await medicamento(e, { fechaVencimiento: new Date(`${bogota(0)}T00:00:00Z`) });
    const res = await crear(e.vet, enVacuno(e, vencido)).expect(400);
    expect(res.body.error.detalles[0]).toMatchObject({ campo: 'medicamentoId' });
    expect(await stockDe(vencido.id)).toBe(100);
    await crear(e.vet, enVacuno(e, hoy)).expect(201);
  });
});

describe('tratamientos - validaciones', () => {
  const casos = [
    ['sin animal ni lote', { vacunoId: undefined }],
    ['animal y lote a la vez', { loteId: 'a1b2c3d4-0000-4000-8000-000000000000' }],
    ['sin medicamento', { medicamentoId: undefined }],
    ['medicamento no uuid', { medicamentoId: 'x' }],
    ['sin dosis', { dosis: undefined }],
    ['dosis cero', { dosis: 0 }],
    ['dosis negativa', { dosis: -1 }],
    ['dosis excesiva', { dosis: 100_001 }],
    ['dosis con 3 decimales', { dosis: 1.234 }],
    ['dosis no numérica', { dosis: 'x' }],
    ['sin vía', { via: undefined }],
    ['vía inválida', { via: 'RECTAL' }],
    ['fecha futura', { fecha: bogota(2) }],
    ['fecha mal formada', { fecha: '01/01/2026' }],
    ['retiro carne negativo', { diasRetiroCarne: -1 }],
    ['retiro leche mayor a 365', { diasRetiroLeche: 366 }],
    ['retiro decimal', { diasRetiroCarne: 1.5 }],
    ['observaciones muy largas', { observaciones: 'x'.repeat(1001) }],
  ];
  it.each(casos)('400 VALIDACION: %s', async (_t, extra) => {
    const e = await escenario();
    const m = await medicamento(e);
    const res = await crear(e.vet, enVacuno(e, m, extra)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(await stockDe(m.id)).toBe(100);
  });

  it('el PATCH valida', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const { body } = await crear(e.vet, enVacuno(e, m)).expect(201);
    for (const cuerpo of [{ dosis: 0 }, { via: 'X' }, { fecha: bogota(1) }, { diasRetiroCarne: 400 }, { medicamentoId: 'x' }, { observaciones: 'x'.repeat(1001) }]) {
      const res = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });
});

describe('tratamientos - editar', () => {
  it('cambiar la dosis aplica la diferencia', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const { body } = await crear(e.vet, enVacuno(e, m, { dosis: 10 })).expect(201);
    const sube = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ dosis: 15.5 }).expect(200);
    expect(sube.body.dosis).toBe(15.5);
    expect(sube.body.medicamento.stock).toBe(84.5);
    expect(await stockDe(m.id)).toBe(84.5);
    await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ dosis: 4 }).expect(200);
    expect(await stockDe(m.id)).toBe(96);
  });

  it('editar otros campos no toca el stock ni los días de retiro', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const c = await caso(e);
    const { body } = await crear(e.vet, enVacuno(e, m)).expect(201);
    const res = await request(app)
      .patch(`${BASE}/${body.id}`)
      .set(e.vet.bearer)
      .send({ via: 'ORAL', fecha: bogota(-1), observaciones: 'Ajuste', casoSaludId: c.id })
      .expect(200);
    expect(res.body).toMatchObject({ via: 'ORAL', fecha: bogota(-1), observaciones: 'Ajuste', casoSaludId: c.id, diasRetiroCarne: 28, finRetiroCarne: bogota(27) });
    expect(await stockDe(m.id)).toBe(90);
    const sinCaso = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ casoSaludId: null }).expect(200);
    expect(sinCaso.body.casoSalud).toBeNull();
  });

  it('el animal no cambia aunque se envíe', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const { body } = await crear(e.vet, enVacuno(e, m)).expect(201);
    const res = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ vacunoId: e.otroVacuno.id, dosis: 11 }).expect(200);
    expect(res.body.vacunoId).toBe(e.vacuno.id);
  });

  it('cambiar de medicamento devuelve al anterior, descuenta al nuevo y toma sus días de retiro', async () => {
    const e = await escenario();
    const a = await medicamento(e);
    const b = await medicamento(e, { stock: 40, diasRetiroCarne: 7, diasRetiroLeche: null });
    const { body } = await crear(e.vet, enVacuno(e, a, { dosis: 10 })).expect(201);
    const res = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ medicamentoId: b.id, dosis: 6 }).expect(200);
    expect(res.body).toMatchObject({ medicamentoId: b.id, diasRetiroCarne: 7, diasRetiroLeche: null });
    expect(res.body.medicamento.stock).toBe(34);
    expect(await stockDe(a.id)).toBe(100);
    expect(await stockDe(b.id)).toBe(34);
  });

  it('cambiar a un medicamento vencido, inactivo, ajeno o inexistente falla sin tocar el stock', async () => {
    const e = await escenario();
    const a = await medicamento(e);
    const vencido = await medicamento(e, { fechaVencimiento: new Date(`${bogota(-1)}T00:00:00Z`) });
    const inactivo = await medicamento(e, { estado: 'INACTIVO' });
    const deOtra = await medicamento(e, {}, e.otraFinca.id);
    const { body } = await crear(e.vet, enVacuno(e, a)).expect(201);
    for (const m of [vencido, inactivo]) {
      const res = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ medicamentoId: m.id }).expect(400);
      expect(res.body.error.detalles[0].campo).toBe('medicamentoId');
    }
    await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ medicamentoId: deOtra.id }).expect(404);
    await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ medicamentoId: UUID_INEXISTENTE }).expect(404);
    expect(await stockDe(a.id)).toBe(90);
  });

  it('editar un tratamiento cuyo medicamento ya venció sigue permitido', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const { body } = await crear(e.vet, enVacuno(e, m)).expect(201);
    await prisma.medicamento.update({ where: { id: m.id }, data: { fechaVencimiento: new Date(`${bogota(-1)}T00:00:00Z`), estado: 'INACTIVO' } });
    await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ observaciones: 'Nota' }).expect(200);
  });

  it('casoSalud de otro animal responde 400 al editar', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const deOtro = await caso(e, { vacunoId: e.otroVacuno.id });
    const { body } = await crear(e.vet, enVacuno(e, m)).expect(201);
    const res = await request(app).patch(`${BASE}/${body.id}`).set(e.vet.bearer).send({ casoSaludId: deOtro.id }).expect(400);
    expect(res.body.error.detalles[0].campo).toBe('casoSaludId');
  });
});

describe('tratamientos - borrar', () => {
  it('devuelve la dosis al stock y responde 204', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const { body } = await crear(e.vet, enVacuno(e, m, { dosis: 12.34 })).expect(201);
    expect(await stockDe(m.id)).toBe(87.66);
    await request(app).delete(`${BASE}/${body.id}`).set(e.vet.bearer).expect(204);
    expect(await stockDe(m.id)).toBe(100);
    await request(app).get(`${BASE}/${body.id}`).set(e.vet.bearer).expect(404);
    await request(app).delete(`${BASE}/${body.id}`).set(e.vet.bearer).expect(404);
    expect(await stockDe(m.id)).toBe(100);
  });
});

describe('tratamientos - movimientos del medicamento', () => {
  it('incluye entradas y tratamientos con cantidad con signo', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    await crear(e.vet, enVacuno(e, m, { dosis: 5 })).expect(201);
    await request(app).post(`/api/medicamentos/${m.id}/entradas`).set(e.vet.bearer).send({ cantidad: 20 }).expect(201);
    const movs = (await request(app).get(`/api/medicamentos/${m.id}/movimientos`).set(e.vet.bearer).expect(200)).body;
    expect(movs).toHaveLength(2);
    expect(movs.find((x) => x.tipo === 'TRATAMIENTO')).toMatchObject({ cantidad: -5, detalle: 'Lucero', registradoPor: { id: e.vet.usuario.id } });
    expect(movs.find((x) => x.tipo === 'ENTRADA')).toMatchObject({ cantidad: 20 });
    expect(await stockDe(m.id)).toBe(115);
  });
});

describe('tratamientos - listado', () => {
  it('ordena por fecha descendente y luego por creación descendente', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const a = (await crear(e.vet, enVacuno(e, m, { fecha: bogota(-5) }))).body;
    const b = (await crear(e.vet, enVacuno(e, m, { fecha: bogota(-1) }))).body;
    const c = (await crear(e.vet, enLote(e, m, { fecha: bogota(-5) }))).body;
    expect((await listar(e.vet)).map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  it('filtra por vacuno, lote, caso, medicamento y rango de fechas', async () => {
    const e = await escenario();
    const m1 = await medicamento(e);
    const m2 = await medicamento(e);
    const c = await caso(e);
    const t1 = (await crear(e.vet, enVacuno(e, m1, { fecha: bogota(-10), casoSaludId: c.id }))).body;
    const t2 = (await crear(e.vet, enVacuno(e, m2, { vacunoId: e.otroVacuno.id, fecha: bogota(-5) }))).body;
    const t3 = (await crear(e.vet, enLote(e, m1, { fecha: bogota(-1) }))).body;
    const ids = async (q) => (await listar(e.vet, q)).map((t) => t.id).sort();
    expect(await ids(`?vacunoId=${e.vacuno.id}`)).toEqual([t1.id]);
    expect(await ids(`?loteId=${e.lote.id}`)).toEqual([t3.id]);
    expect(await ids(`?casoSaludId=${c.id}`)).toEqual([t1.id]);
    expect(await ids(`?medicamentoId=${m1.id}`)).toEqual([t1.id, t3.id].sort());
    expect(await ids(`?desde=${bogota(-6)}`)).toEqual([t2.id, t3.id].sort());
    expect(await ids(`?hasta=${bogota(-6)}`)).toEqual([t1.id]);
    expect(await ids(`?desde=${bogota(-10)}&hasta=${bogota(-5)}`)).toEqual([t1.id, t2.id].sort());
    expect(await ids(`?fincaId=${e.finca.id}`)).toHaveLength(3);
    await request(app).get(`${BASE}?desde=ayer`).set(e.vet.bearer).expect(400);
  });

  it('enRetiro=true deja solo los tratamientos con retiro vigente', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    const vigente = (await crear(e.vet, enVacuno(e, m, { fecha: bogota(-1) }))).body; // 28 y 4 días
    await crear(e.vet, enVacuno(e, m, { fecha: bogota(-40) })); // ya cumplido
    await crear(e.vet, enLote(e, m, { diasRetiroCarne: null, diasRetiroLeche: null })); // sin retiro
    const soloLeche = (await crear(e.vet, enLote(e, m, { fecha: bogota(-4), diasRetiroCarne: 1, diasRetiroLeche: 4 }))).body;
    const res = await listar(e.vet, '?enRetiro=true');
    expect(res.map((t) => t.id).sort()).toEqual([vigente.id, soloLeche.id].sort());
    expect(res.every((t) => t.enRetiro)).toBe(true);
    expect(await listar(e.vet)).toHaveLength(4);
  });

  it('limita a 500 resultados', async () => {
    const e = await escenario();
    const m = await medicamento(e);
    await prisma.tratamiento.createMany({
      data: Array.from({ length: 501 }, () => ({
        fincaId: e.finca.id, vacunoId: e.vacuno.id, medicamentoId: m.id, dosis: 1, via: 'ORAL',
        fecha: new Date(`${bogota(-1)}T00:00:00Z`), registradoPorId: e.creadoPorId,
      })),
    });
    expect(await listar(e.vet)).toHaveLength(500);
  });
});
