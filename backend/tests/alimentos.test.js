import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/alimentos';
const bogota = (desplazamientoDias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + desplazamientoDias);
  return d.toISOString().slice(0, 10);
};
const manana = () => bogota(2);

const valido = (fincaId, extra = {}) => ({ fincaId, nombre: 'Concentrado', tipo: 'CONCENTRADO', ...extra });

async function crear(bearer, fincaId, extra = {}) {
  const res = await request(app).post(BASE).set(bearer).send(valido(fincaId, extra)).expect(201);
  return res.body;
}
const obtener = async (bearer, id) => (await request(app).get(`${BASE}/${id}`).set(bearer).expect(200)).body;
const entrada = (bearer, id, cuerpo) => request(app).post(`${BASE}/${id}/entradas`).set(bearer).send(cuerpo);
const movimientos = async (bearer, id) => (await request(app).get(`${BASE}/${id}/movimientos`).set(bearer).expect(200)).body;

async function vet(extraFincas = []) {
  const finca = await crearFinca('Finca A');
  const s = await sesionDe('VETERINARIO', [finca.id, ...extraFincas.map((f) => f.id)]);
  return { finca, ...s };
}

describe('alimentos - crear', () => {
  it('crea sin stock inicial', async () => {
    const { finca, bearer } = await vet();
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { observaciones: 'Bulto' })).expect(201);
    expect(res.body).toMatchObject({
      nombre: 'Concentrado',
      tipo: 'CONCENTRADO',
      stockGramos: 0,
      stockMinimoGramos: 0,
      estado: 'ACTIVO',
      observaciones: 'Bulto',
      finca: { id: finca.id, nombre: 'Finca A' },
    });
    expect(res.body.bajoStock).toBe(true); // 0 <= 0
    expect(await movimientos(bearer, res.body.id)).toEqual([]);
  });

  it('con stock inicial: el stock queda igual y hay una entrada "Stock inicial"', async () => {
    const { finca, bearer, usuario } = await vet();
    const a = await crear(bearer, finca.id, { stockInicialGramos: 50000, stockMinimoGramos: 10000 });
    expect(a.stockGramos).toBe(50000);
    expect(a.stockMinimoGramos).toBe(10000);
    expect(a.bajoStock).toBe(false);
    const movs = await movimientos(bearer, a.id);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: 'ENTRADA', cantidadGramos: 50000, detalle: 'Stock inicial', registradoPor: { id: usuario.id } });
    expect(typeof movs[0].registradoPor.nombre).toBe('string');
    expect(movs[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('stockInicialGramos 0 no crea entrada', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { stockInicialGramos: 0 });
    expect(a.stockGramos).toBe(0);
    expect(await movimientos(bearer, a.id)).toEqual([]);
  });

  it('el administrador crea en cualquier finca', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crear(bearer, finca.id);
  });
});

describe('alimentos - validaciones', () => {
  const casos = [
    ['sin nombre', { nombre: undefined }],
    ['nombre corto', { nombre: 'A' }],
    ['nombre solo espacios', { nombre: '   ' }],
    ['nombre muy largo', { nombre: 'x'.repeat(81) }],
    ['sin tipo', { tipo: undefined }],
    ['tipo inválido', { tipo: 'FRUTA' }],
    ['stock inicial negativo', { stockInicialGramos: -1 }],
    ['stock inicial decimal', { stockInicialGramos: 10.5 }],
    ['stock inicial no numérico', { stockInicialGramos: 'mucho' }],
    ['stock mínimo negativo', { stockMinimoGramos: -1 }],
    ['stock mínimo decimal', { stockMinimoGramos: 1.5 }],
    ['observaciones muy largas', { observaciones: 'x'.repeat(1001) }],
  ];
  it.each(casos)('400 VALIDACION: %s', async (_t, extra) => {
    const { finca, bearer } = await vet();
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, extra)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('400 VALIDACION sin fincaId', async () => {
    const { bearer } = await vet();
    const res = await request(app).post(BASE).set(bearer).send(valido(undefined)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('las entradas validan cantidad, fecha y nota', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id);
    const malos = [
      {},
      { cantidadGramos: 0 },
      { cantidadGramos: -5 },
      { cantidadGramos: 100000001 },
      { cantidadGramos: 10.5 },
      { cantidadGramos: 'x' },
      { cantidadGramos: 100, fecha: manana() },
      { cantidadGramos: 100, fecha: '01/01/2026' },
      { cantidadGramos: 100, nota: 'x'.repeat(501) },
    ];
    for (const cuerpo of malos) {
      const res = await entrada(bearer, a.id, cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
    expect((await obtener(bearer, a.id)).stockGramos).toBe(0);
  });

  it('el PATCH valida', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id);
    for (const cuerpo of [{ nombre: 'A' }, { tipo: 'X' }, { stockMinimoGramos: -1 }, { observaciones: 'x'.repeat(1001) }]) {
      const res = await request(app).patch(`${BASE}/${a.id}`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });
});

describe('alimentos - duplicados', () => {
  it('409 DUPLICADO en la misma finca sin distinguir mayúsculas', async () => {
    const { finca, bearer } = await vet();
    await crear(bearer, finca.id, { nombre: 'Heno' });
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'HENO' })).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
  });

  it('mismo nombre en otra finca es permitido', async () => {
    const b = await crearFinca('B');
    const { finca, bearer } = await vet([b]);
    await crear(bearer, finca.id, { nombre: 'Heno' });
    await crear(bearer, b.id, { nombre: 'heno' });
  });

  it('409 al renombrar y se permite cambiar mayúsculas del propio nombre', async () => {
    const { finca, bearer } = await vet();
    await crear(bearer, finca.id, { nombre: 'Heno' });
    const otro = await crear(bearer, finca.id, { nombre: 'Sal' });
    const res = await request(app).patch(`${BASE}/${otro.id}`).set(bearer).send({ nombre: 'heno' }).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
    await request(app).patch(`${BASE}/${otro.id}`).set(bearer).send({ nombre: 'SAL' }).expect(200);
  });

  it('un alimento inactivo sigue reservando su nombre', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { nombre: 'Heno' });
    await request(app).patch(`${BASE}/${a.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Ya no se usa' }).expect(200);
    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'heno' })).expect(409);
  });
});

describe('alimentos - editar y estado', () => {
  it('PATCH parcial cambia solo lo enviado', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { stockInicialGramos: 1000 });
    const res = await request(app).patch(`${BASE}/${a.id}`).set(bearer).send({ tipo: 'FORRAJE', stockMinimoGramos: 300 }).expect(200);
    expect(res.body).toMatchObject({ nombre: 'Concentrado', tipo: 'FORRAJE', stockMinimoGramos: 300, stockGramos: 1000 });
  });

  it('el PATCH no puede tocar el stock, la finca ni el estado', async () => {
    const b = await crearFinca('B');
    const { finca, bearer } = await vet([b]);
    const a = await crear(bearer, finca.id, { stockInicialGramos: 1000 });
    for (const cuerpo of [{ stockGramos: 999999 }, { stockInicialGramos: 5 }, { fincaId: b.id }, { estado: 'INACTIVO' }]) {
      const r = await request(app).patch(`${BASE}/${a.id}`).set(bearer).send(cuerpo);
      expect([200, 400]).toContain(r.status);
    }
    const despues = await obtener(bearer, a.id);
    expect(despues).toMatchObject({ stockGramos: 1000, estado: 'ACTIVO', finca: { id: finca.id } });
    expect(await movimientos(bearer, a.id)).toHaveLength(1);
  });

  it('baja con motivo y reactivación limpia el motivo', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id);
    const baja = await request(app).patch(`${BASE}/${a.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vencido' }).expect(200);
    expect(baja.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Vencido' });
    const alta = await request(app).patch(`${BASE}/${a.id}/estado`).set(bearer).send({ estado: 'ACTIVO', motivoBaja: 'x' }).expect(200);
    expect(alta.body.estado).toBe('ACTIVO');
    expect(alta.body.motivoBaja ?? null).toBeNull();
    expect((await obtener(bearer, a.id)).motivoBaja ?? null).toBeNull();
  });

  it('valida el cuerpo de estado', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id);
    for (const cuerpo of [{}, { estado: 'TODOS' }, { estado: 'X' }, { estado: 'INACTIVO', motivoBaja: 'x'.repeat(501) }]) {
      const res = await request(app).patch(`${BASE}/${a.id}/estado`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });
});

describe('alimentos - entradas', () => {
  it('una entrada suma stock y devuelve { entrada, alimento }', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { stockInicialGramos: 1000, stockMinimoGramos: 5000 });
    expect(a.bajoStock).toBe(true);
    const res = await entrada(bearer, a.id, { cantidadGramos: 20000, fecha: bogota(-3), nota: 'Compra' }).expect(201);
    expect(res.body.entrada).toMatchObject({ cantidadGramos: 20000, nota: 'Compra' });
    expect(res.body.entrada.fecha).toMatch(/^2\d{3}-\d{2}-\d{2}/);
    expect(res.body.alimento).toMatchObject({ id: a.id, stockGramos: 21000, bajoStock: false });
    expect((await obtener(bearer, a.id)).stockGramos).toBe(21000);
  });

  it('la fecha por defecto es hoy (Bogotá) y se acepta hoy', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id);
    const res = await entrada(bearer, a.id, { cantidadGramos: 100 }).expect(201);
    expect(String(res.body.entrada.fecha).slice(0, 10)).toBe(bogota());
    await entrada(bearer, a.id, { cantidadGramos: 100, fecha: bogota() }).expect(201);
  });

  it('no se puede registrar entrada en un alimento inactivo', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { stockInicialGramos: 500 });
    await request(app).patch(`${BASE}/${a.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(200);
    const res = await entrada(bearer, a.id, { cantidadGramos: 100 });
    expect([400, 409]).toContain(res.status);
    expect((await obtener(bearer, a.id)).stockGramos).toBe(500);
  });

  it('entrada en alimento inexistente, ajeno o con id no uuid da 404', async () => {
    const b = await crearFinca('B');
    const { bearer } = await vet();
    const ajeno = await crear((await sesionDe('ADMINISTRADOR')).bearer, b.id);
    await entrada(bearer, UUID_INEXISTENTE, { cantidadGramos: 1 }).expect(404);
    await entrada(bearer, ajeno.id, { cantidadGramos: 1 }).expect(404);
    await entrada(bearer, 'no-uuid', { cantidadGramos: 1 }).expect(404);
  });
});

describe('alimentos - listado', () => {
  async function escenario() {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const zanahoria = await crear(bearer, a.id, { nombre: 'Zanahoria', tipo: 'OTRO', stockInicialGramos: 5000, stockMinimoGramos: 1000 });
    const alfalfa = await crear(bearer, a.id, { nombre: 'Alfalfa', tipo: 'FORRAJE', stockInicialGramos: 100, stockMinimoGramos: 500 });
    const maiz = await crear(bearer, a.id, { nombre: 'Maíz', tipo: 'GRANO', stockInicialGramos: 500, stockMinimoGramos: 500 });
    const sal = await crear(bearer, b.id, { nombre: 'Sal mineral', tipo: 'SAL_MINERAL', stockInicialGramos: 900, stockMinimoGramos: 100 });
    return { a, b, bearer, zanahoria, alfalfa, maiz, sal };
  }
  const ids = (res) => res.body.map((x) => x.id);

  it('ordena por nombre y filtra por fincaId', async () => {
    const { bearer, a, b, zanahoria, alfalfa, maiz, sal } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(ids(res)).toEqual([alfalfa.id, maiz.id, zanahoria.id]);
    const rb = await request(app).get(`${BASE}?fincaId=${b.id}`).set(bearer).expect(200);
    expect(ids(rb)).toEqual([sal.id]);
    const todos = await request(app).get(BASE).set(bearer).expect(200);
    expect(todos.body).toHaveLength(4);
  });

  it('estado: ACTIVO por defecto, INACTIVO y TODOS', async () => {
    const { bearer, a, zanahoria, alfalfa, maiz } = await escenario();
    await request(app).patch(`${BASE}/${zanahoria.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(200);
    expect(ids(await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer))).toEqual([alfalfa.id, maiz.id]);
    expect(ids(await request(app).get(`${BASE}?fincaId=${a.id}&estado=INACTIVO`).set(bearer))).toEqual([zanahoria.id]);
    expect(ids(await request(app).get(`${BASE}?fincaId=${a.id}&estado=TODOS`).set(bearer))).toEqual([alfalfa.id, maiz.id, zanahoria.id]);
  });

  it('filtra por tipo y por q (sin distinguir mayúsculas)', async () => {
    const { bearer, a, alfalfa, maiz, sal } = await escenario();
    expect(ids(await request(app).get(`${BASE}?fincaId=${a.id}&tipo=FORRAJE`).set(bearer))).toEqual([alfalfa.id]);
    expect(ids(await request(app).get(`${BASE}?q=ALFA`).set(bearer))).toEqual([alfalfa.id]);
    expect(ids(await request(app).get(`${BASE}?q=mineral`).set(bearer))).toEqual([sal.id]);
    expect(ids(await request(app).get(`${BASE}?q=ma`).set(bearer))).toContain(maiz.id);
    expect((await request(app).get(`${BASE}?q=zzzz`).set(bearer).expect(200)).body).toEqual([]);
  });

  it('bajoStock=true incluye el límite (stock == mínimo) y excluye el resto', async () => {
    const { bearer, a, alfalfa, maiz } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}&bajoStock=true`).set(bearer).expect(200);
    expect(ids(res)).toEqual([alfalfa.id, maiz.id]);
    expect(res.body.every((x) => x.bajoStock === true)).toBe(true);
    const todos = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(todos.body.map((x) => [x.nombre, x.bajoStock])).toEqual([['Alfalfa', true], ['Maíz', true], ['Zanahoria', false]]);
  });

  it('bajoStock cambia al pasar justo por encima del mínimo', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { stockInicialGramos: 500, stockMinimoGramos: 500 });
    expect(a.bajoStock).toBe(true);
    const r = await entrada(bearer, a.id, { cantidadGramos: 1 }).expect(201);
    expect(r.body.alimento.bajoStock).toBe(false);
  });
});

describe('alimentos - movimientos', () => {
  it('ordena por más reciente, con signo y detalle de entradas y consumos', async () => {
    const { finca, bearer } = await vet();
    const a = await crear(bearer, finca.id, { nombre: 'Maíz', stockInicialGramos: 10000 });
    await entrada(bearer, a.id, { cantidadGramos: 2000, fecha: bogota(-5), nota: 'Compra vieja' }).expect(201);
    const v = (await request(app).post('/api/vacunos').set(bearer).send({
      fincaId: finca.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400, fechaLlegada: '2026-01-01', proposito: 'ENGORDE',
    }).expect(201)).body;
    const l = (await request(app).post('/api/lotes').set(bearer).send({
      fincaId: finca.id, nombre: 'Lote Uno', edadMinSemanas: 1, edadMaxSemanas: 5, cantidad: 50, proposito: 'PRODUCCION',
    }).expect(201)).body;
    await request(app).post('/api/consumos/vacunos').set(bearer).send({
      vacunoId: v.id, alimentoId: a.id, cantidadGramos: 3000, jornada: 'MANANA', fecha: bogota(-1),
    }).expect(201);
    await request(app).post('/api/consumos/lotes').set(bearer).send({
      loteId: l.id, alimentoId: a.id, cantidadGramos: 1500, jornada: 'TARDE', fecha: bogota(-2),
    }).expect(201);

    const movs = await movimientos(bearer, a.id);
    expect(movs.map((m) => m.tipo)).toEqual(['ENTRADA', 'CONSUMO_VACUNO', 'CONSUMO_LOTE', 'ENTRADA']);
    expect(movs[0]).toMatchObject({ cantidadGramos: 10000, detalle: 'Stock inicial' });
    expect(movs[1]).toMatchObject({ cantidadGramos: -3000, detalle: 'Lucero' });
    expect(movs[2]).toMatchObject({ cantidadGramos: -1500, detalle: 'Lote Uno' });
    expect(movs[3]).toMatchObject({ cantidadGramos: 2000, detalle: 'Compra vieja' });
    for (const m of movs) {
      expect(m.id).toBeTruthy();
      expect(String(m.fecha)).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(m.registradoPor).toMatchObject({ id: expect.any(String), nombre: expect.any(String) });
    }
    const fechas = movs.map((m) => String(m.fecha).slice(0, 10));
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it('devuelve como máximo 100 movimientos', async () => {
    const { finca, bearer, usuario } = await vet();
    const a = await crear(bearer, finca.id);
    await prisma.entradaAlimento.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        alimentoId: a.id,
        cantidadGramos: 10 + i,
        fecha: new Date(`2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
        registradoPorId: usuario.id,
      })),
    });
    const movs = await movimientos(bearer, a.id);
    expect(movs).toHaveLength(100);
  });

  it('movimientos de un alimento ajeno o inexistente dan 404', async () => {
    const b = await crearFinca('B');
    const { bearer } = await vet();
    const ajeno = await crear((await sesionDe('ADMINISTRADOR')).bearer, b.id);
    await request(app).get(`${BASE}/${ajeno.id}/movimientos`).set(bearer).expect(404);
    await request(app).get(`${BASE}/${UUID_INEXISTENTE}/movimientos`).set(bearer).expect(404);
  });
});

describe('alimentos - permisos y alcance', () => {
  it('sin token responde 401', async () => {
    await request(app).get(BASE).expect(401);
    await request(app).post(BASE).send({}).expect(401);
    await request(app).get(`${BASE}/${UUID_INEXISTENTE}`).expect(401);
    await request(app).patch(`${BASE}/${UUID_INEXISTENTE}`).send({}).expect(401);
    await request(app).patch(`${BASE}/${UUID_INEXISTENTE}/estado`).send({}).expect(401);
    await request(app).post(`${BASE}/${UUID_INEXISTENTE}/entradas`).send({}).expect(401);
    await request(app).get(`${BASE}/${UUID_INEXISTENTE}/movimientos`).expect(401);
  });

  it('el ayudante consulta pero no gestiona', async () => {
    const { finca, bearer: bv } = await vet();
    const a = await crear(bv, finca.id, { stockInicialGramos: 1000 });
    const { bearer } = await sesionDe('AYUDANTE', [finca.id]);

    expect((await request(app).get(BASE).set(bearer).expect(200)).body.map((x) => x.id)).toEqual([a.id]);
    await request(app).get(`${BASE}/${a.id}`).set(bearer).expect(200);
    await request(app).get(`${BASE}/${a.id}/movimientos`).set(bearer).expect(200);

    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'Nuevo' })).expect(403);
    await request(app).patch(`${BASE}/${a.id}`).set(bearer).send({ tipo: 'GRANO' }).expect(403);
    await request(app).patch(`${BASE}/${a.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(403);
    await entrada(bearer, a.id, { cantidadGramos: 100 }).expect(403);
    expect(await obtener(bv, a.id)).toMatchObject({ stockGramos: 1000, estado: 'ACTIVO', tipo: 'CONCENTRADO' });
  });

  it('el usuario de la finca A no ve ni modifica alimentos de la finca B', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const admin = await sesionDe('ADMINISTRADOR');
    const ajeno = await crear(admin.bearer, b.id, { nombre: 'Ajeno', stockInicialGramos: 100 });
    const propio = await crear(admin.bearer, a.id, { nombre: 'Propio' });
    const { bearer } = await sesionDe('VETERINARIO', [a.id]);

    expect((await request(app).get(BASE).set(bearer).expect(200)).body.map((x) => x.id)).toEqual([propio.id]);
    const inexistente = await request(app).get(`${BASE}/${UUID_INEXISTENTE}`).set(bearer).expect(404);
    const get = await request(app).get(`${BASE}/${ajeno.id}`).set(bearer).expect(404);
    expect(get.body).toEqual(inexistente.body);
    await request(app).patch(`${BASE}/${ajeno.id}`).set(bearer).send({ tipo: 'GRANO' }).expect(404);
    await request(app).patch(`${BASE}/${ajeno.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(404);
    await request(app).post(BASE).set(bearer).send(valido(b.id, { nombre: 'Colado' })).expect(404);
    expect(await obtener(admin.bearer, ajeno.id)).toMatchObject({ tipo: 'CONCENTRADO', estado: 'ACTIVO', stockGramos: 100 });
  });

  it('el administrador ve todo e id no uuid da 404', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crear(bearer, a.id, { nombre: 'Uno' });
    const dos = await crear(bearer, b.id, { nombre: 'Dos' });
    expect((await request(app).get(BASE).set(bearer).expect(200)).body).toHaveLength(2);
    await request(app).get(`${BASE}/${dos.id}`).set(bearer).expect(200);
    await request(app).get(`${BASE}/no-es-uuid`).set(bearer).expect(404);
    await request(app).patch(`${BASE}/no-es-uuid`).set(bearer).send({ tipo: 'GRANO' }).expect(404);
    await request(app).patch(`${BASE}/no-es-uuid/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(404);
  });
});
