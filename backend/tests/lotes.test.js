import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/lotes';
const manana = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const valido = (fincaId, extra = {}) => ({
  fincaId,
  nombre: 'Lote 1',
  tipoAve: 'Gallinas ponedoras',
  edadMinSemanas: 18,
  edadMaxSemanas: 30,
  cantidad: 500,
  proposito: 'PRODUCCION',
  fechaIngreso: '2026-02-01',
  ...extra,
});

async function crear(bearer, fincaId, extra = {}) {
  const res = await request(app).post(BASE).set(bearer).send(valido(fincaId, extra)).expect(201);
  return res.body;
}

describe('lotes - crear', () => {
  it('crea un lote válido con la forma esperada', async () => {
    const finca = await crearFinca('Finca A');
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { observaciones: 'Nuevo' })).expect(201);
    expect(res.body).toMatchObject({
      nombre: 'Lote 1',
      tipoAve: 'Gallinas ponedoras',
      edadMinSemanas: 18,
      edadMaxSemanas: 30,
      cantidad: 500,
      proposito: 'PRODUCCION',
      estado: 'ACTIVO',
      fechaIngreso: '2026-02-01',
      observaciones: 'Nuevo',
      finca: { id: finca.id, nombre: 'Finca A' },
    });
    expect(res.body.id).toBeTruthy();
  });

  it('tipoAve y fechaIngreso son opcionales', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const r = await crear(bearer, finca.id, { tipoAve: undefined, fechaIngreso: undefined });
    expect(r.fechaIngreso ?? null).toBeNull();
    expect(r.tipoAve ?? null).toBeNull();
  });

  it('el administrador puede crear en cualquier finca', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crear(bearer, finca.id);
  });

  it('acepta valores límite', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    await crear(bearer, finca.id, { nombre: 'Aa', edadMinSemanas: 0, edadMaxSemanas: 0, cantidad: 1 });
    await crear(bearer, finca.id, { nombre: 'Bb', edadMinSemanas: 520, edadMaxSemanas: 520, cantidad: 100000 });
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const r = await crear(bearer, finca.id, { nombre: 'Cc', fechaIngreso: hoy });
    expect(r.fechaIngreso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('lotes - validaciones', () => {
  const casos = [
    ['sin nombre', { nombre: undefined }],
    ['nombre corto', { nombre: 'A' }],
    ['nombre solo espacios', { nombre: '   ' }],
    ['nombre muy largo', { nombre: 'x'.repeat(81) }],
    ['tipoAve muy largo', { tipoAve: 'x'.repeat(81) }],
    ['sin edadMinSemanas', { edadMinSemanas: undefined }],
    ['sin edadMaxSemanas', { edadMaxSemanas: undefined }],
    ['edadMin negativa', { edadMinSemanas: -1 }],
    ['edadMax mayor a 520', { edadMaxSemanas: 521 }],
    ['edadMin mayor a 520', { edadMinSemanas: 521, edadMaxSemanas: 521 }],
    ['edad decimal', { edadMinSemanas: 1.5 }],
    ['edadMin > edadMax', { edadMinSemanas: 31, edadMaxSemanas: 30 }],
    ['sin cantidad', { cantidad: undefined }],
    ['cantidad cero', { cantidad: 0 }],
    ['cantidad negativa', { cantidad: -3 }],
    ['cantidad mayor a 100000', { cantidad: 100001 }],
    ['cantidad decimal', { cantidad: 10.5 }],
    ['sin propósito', { proposito: undefined }],
    ['propósito inválido', { proposito: 'ENGORDE' }],
    ['fecha de ingreso futura', { fechaIngreso: manana() }],
    ['fecha de ingreso malformada', { fechaIngreso: '01/02/2026' }],
    ['observaciones muy largas', { observaciones: 'x'.repeat(1001) }],
  ];
  it.each(casos)('400 VALIDACION: %s', async (_t, extra) => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, extra)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('400 VALIDACION sin fincaId', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const res = await request(app).post(BASE).set(bearer).send(valido(undefined)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });
});

describe('lotes - duplicados', () => {
  it('409 DUPLICADO en la misma finca sin distinguir mayúsculas', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    await crear(bearer, finca.id, { nombre: 'Lote A' });
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'LOTE a' })).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
  });

  it('mismo nombre en otra finca es permitido', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('VETERINARIO', [a.id, b.id]);
    await crear(bearer, a.id, { nombre: 'Lote A' });
    await crear(bearer, b.id, { nombre: 'lote a' });
  });

  it('409 DUPLICADO al renombrar a un nombre existente', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    await crear(bearer, finca.id, { nombre: 'Lote A' });
    const otro = await crear(bearer, finca.id, { nombre: 'Lote B' });
    const res = await request(app).patch(`${BASE}/${otro.id}`).set(bearer).send({ nombre: 'lote a' }).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
  });

  it('permite conservar el propio nombre al editar (cambiando mayúsculas)', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id, { nombre: 'Lote A' });
    const res = await request(app).patch(`${BASE}/${l.id}`).set(bearer).send({ nombre: 'LOTE A' }).expect(200);
    expect(res.body.nombre).toBe('LOTE A');
  });

  it('un lote inactivo sigue reservando su nombre', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id, { nombre: 'Lote A' });
    await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'lote a' })).expect(409);
  });
});

describe('lotes - permisos', () => {
  it('sin token responde 401', async () => {
    await request(app).get(BASE).expect(401);
    await request(app).post(BASE).send({}).expect(401);
    await request(app).get(`${BASE}/${UUID_INEXISTENTE}`).expect(401);
    await request(app).patch(`${BASE}/${UUID_INEXISTENTE}`).send({}).expect(401);
    await request(app).patch(`${BASE}/${UUID_INEXISTENTE}/estado`).send({}).expect(401);
  });

  it('el ayudante lista y consulta pero no gestiona', async () => {
    const finca = await crearFinca();
    const vet = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(vet.bearer, finca.id);
    const { bearer } = await sesionDe('AYUDANTE', [finca.id]);

    const lista = await request(app).get(BASE).set(bearer).expect(200);
    expect(lista.body.map((x) => x.id)).toEqual([l.id]);
    await request(app).get(`${BASE}/${l.id}`).set(bearer).expect(200);

    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'Nuevo' })).expect(403);
    await request(app).patch(`${BASE}/${l.id}`).set(bearer).send({ cantidad: 10 }).expect(403);
    await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(403);

    const intacto = await request(app).get(`${BASE}/${l.id}`).set(bearer).expect(200);
    expect(intacto.body).toMatchObject({ cantidad: 500, estado: 'ACTIVO' });
  });

  it('el veterinario gestiona en su finca', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id);
    await request(app).patch(`${BASE}/${l.id}`).set(bearer).send({ cantidad: 400 }).expect(200);
    await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
  });
});

describe('lotes - alcance por finca', () => {
  it('un usuario de la finca A no ve ni modifica recursos de la finca B', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const admin = await sesionDe('ADMINISTRADOR');
    const ajeno = await crear(admin.bearer, b.id, { nombre: 'Ajeno' });
    const propio = await crear(admin.bearer, a.id, { nombre: 'Propio' });
    const { bearer } = await sesionDe('VETERINARIO', [a.id]);

    const lista = await request(app).get(BASE).set(bearer).expect(200);
    expect(lista.body.map((x) => x.id)).toEqual([propio.id]);
    const filtrada = await request(app).get(`${BASE}?fincaId=${b.id}`).set(bearer);
    expect([200, 404]).toContain(filtrada.status);
    if (filtrada.status === 200) expect(filtrada.body).toEqual([]);

    const inexistente = await request(app).get(`${BASE}/${UUID_INEXISTENTE}`).set(bearer).expect(404);
    const get = await request(app).get(`${BASE}/${ajeno.id}`).set(bearer).expect(404);
    expect(get.body).toEqual(inexistente.body);
    await request(app).patch(`${BASE}/${ajeno.id}`).set(bearer).send({ cantidad: 1 }).expect(404);
    await request(app).patch(`${BASE}/${ajeno.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(404);

    const intacto = await request(app).get(`${BASE}/${ajeno.id}`).set(admin.bearer).expect(200);
    expect(intacto.body).toMatchObject({ cantidad: 500, estado: 'ACTIVO' });
  });

  it('no se puede crear en finca ajena ni inexistente (404)', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('VETERINARIO', [a.id]);
    await request(app).post(BASE).set(bearer).send(valido(b.id)).expect(404);
    await request(app).post(BASE).set(bearer).send(valido(UUID_INEXISTENTE)).expect(404);
  });

  it('el administrador ve todo', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crear(bearer, a.id, { nombre: 'Uno' });
    const dos = await crear(bearer, b.id, { nombre: 'Dos' });
    const lista = await request(app).get(BASE).set(bearer).expect(200);
    expect(lista.body).toHaveLength(2);
    await request(app).get(`${BASE}/${dos.id}`).set(bearer).expect(200);
  });

  it('id no uuid responde 404', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await request(app).get(`${BASE}/no-es-uuid`).set(bearer).expect(404);
    await request(app).patch(`${BASE}/no-es-uuid`).set(bearer).send({ cantidad: 5 }).expect(404);
    await request(app).patch(`${BASE}/no-es-uuid/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(404);
  });
});

describe('lotes - listado', () => {
  async function escenario() {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const zeta = await crear(bearer, a.id, { nombre: 'Zeta', proposito: 'ALIMENTACION', tipoAve: 'Pollos de engorde' });
    const alfa = await crear(bearer, a.id, { nombre: 'Alfa', proposito: 'PRODUCCION' });
    const medio = await crear(bearer, a.id, { nombre: 'Medio', proposito: 'PRODUCCION' });
    const otro = await crear(bearer, b.id, { nombre: 'Otro', proposito: 'ALIMENTACION' });
    return { a, b, bearer, zeta, alfa, medio, otro };
  }
  const ids = (res) => res.body.map((x) => x.id);

  it('ordena por nombre', async () => {
    const { bearer, a, zeta, alfa, medio } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(ids(res)).toEqual([alfa.id, medio.id, zeta.id]);
  });

  it('filtra por fincaId', async () => {
    const { bearer, b, otro } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${b.id}`).set(bearer).expect(200);
    expect(ids(res)).toEqual([otro.id]);
  });

  it('estado: ACTIVO por defecto, INACTIVO y TODOS', async () => {
    const { bearer, a, zeta, alfa, medio } = await escenario();
    await request(app).patch(`${BASE}/${zeta.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
    const def = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(ids(def)).toEqual([alfa.id, medio.id]);
    const act = await request(app).get(`${BASE}?fincaId=${a.id}&estado=ACTIVO`).set(bearer).expect(200);
    expect(ids(act)).toEqual([alfa.id, medio.id]);
    const ina = await request(app).get(`${BASE}?fincaId=${a.id}&estado=INACTIVO`).set(bearer).expect(200);
    expect(ids(ina)).toEqual([zeta.id]);
    const todos = await request(app).get(`${BASE}?fincaId=${a.id}&estado=TODOS`).set(bearer).expect(200);
    expect(ids(todos)).toEqual([alfa.id, medio.id, zeta.id]);
  });

  it('q busca en el nombre sin distinguir mayúsculas', async () => {
    const { bearer, a, zeta, medio } = await escenario();
    const porNombre = await request(app).get(`${BASE}?fincaId=${a.id}&q=ZET`).set(bearer).expect(200);
    expect(ids(porNombre)).toEqual([zeta.id]);
    const parcial = await request(app).get(`${BASE}?fincaId=${a.id}&q=edi`).set(bearer).expect(200);
    expect(ids(parcial)).toEqual([medio.id]);
    const nada = await request(app).get(`${BASE}?q=zzzz`).set(bearer).expect(200);
    expect(nada.body).toEqual([]);
  });

  it('filtra por proposito', async () => {
    const { bearer, a, zeta } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}&proposito=ALIMENTACION`).set(bearer).expect(200);
    expect(ids(res)).toEqual([zeta.id]);
  });

  it('el listado trae la forma completa', async () => {
    const { bearer, a } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(res.body[0]).toMatchObject({ finca: { id: a.id, nombre: 'A' }, estado: 'ACTIVO' });
    expect(res.body[0].fechaIngreso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('lotes - editar', () => {
  it('PATCH parcial solo cambia lo enviado', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id);
    const res = await request(app).patch(`${BASE}/${l.id}`).set(bearer).send({ cantidad: 450 }).expect(200);
    expect(res.body).toMatchObject({
      nombre: 'Lote 1',
      cantidad: 450,
      edadMinSemanas: 18,
      edadMaxSemanas: 30,
      proposito: 'PRODUCCION',
      fechaIngreso: '2026-02-01',
      finca: { id: finca.id },
    });
    const get = await request(app).get(`${BASE}/${l.id}`).set(bearer).expect(200);
    expect(get.body.cantidad).toBe(450);
  });

  it('el PATCH valida rangos y la relación min/max', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id);
    const malos = [
      { cantidad: 0 },
      { cantidad: 100001 },
      { edadMaxSemanas: 521 },
      { nombre: 'A' },
      { fechaIngreso: manana() },
      { proposito: 'X' },
      { edadMinSemanas: 40 },
      { edadMaxSemanas: 10 },
      { edadMinSemanas: 50, edadMaxSemanas: 40 },
    ];
    for (const cuerpo of malos) {
      const res = await request(app).patch(`${BASE}/${l.id}`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });

  it('fincaId y estado en el PATCH normal nunca mueven el recurso', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('VETERINARIO', [a.id, b.id]);
    const l = await crear(bearer, a.id);
    const r1 = await request(app).patch(`${BASE}/${l.id}`).set(bearer).send({ fincaId: b.id });
    expect([200, 400]).toContain(r1.status);
    const r2 = await request(app).patch(`${BASE}/${l.id}`).set(bearer).send({ estado: 'INACTIVO' });
    expect([200, 400]).toContain(r2.status);
    const get = await request(app).get(`${BASE}/${l.id}`).set(bearer).expect(200);
    expect(get.body.finca.id).toBe(a.id);
    expect(get.body.estado).toBe('ACTIVO');
  });
});

describe('lotes - estado', () => {
  it('da de baja con motivo y reactiva limpiando el motivo', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id);
    const baja = await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
    expect(baja.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Vendido' });
    const get = await request(app).get(`${BASE}/${l.id}`).set(bearer).expect(200);
    expect(get.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Vendido' });

    const alta = await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send({ estado: 'ACTIVO', motivoBaja: 'ignorado' }).expect(200);
    expect(alta.body.estado).toBe('ACTIVO');
    expect(alta.body.motivoBaja ?? null).toBeNull();
    const get2 = await request(app).get(`${BASE}/${l.id}`).set(bearer).expect(200);
    expect(get2.body.motivoBaja ?? null).toBeNull();
  });

  it('valida estado y longitud del motivo', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id);
    const malos = [{}, { estado: 'TODOS' }, { estado: 'BORRADO' }, { estado: 'INACTIVO', motivoBaja: 'x'.repeat(501) }];
    for (const cuerpo of malos) {
      const res = await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });

  it('el motivo de baja es opcional', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const l = await crear(bearer, finca.id);
    await request(app).patch(`${BASE}/${l.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
  });
});

describe('lotes - orden', () => {
  it('ordena en español: sin distinguir mayúsculas y con la Ñ entre N y O', async () => {
    const finca = await crearFinca('Finca A');
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    for (const nombre of ['Zeta', 'Oro', 'Ñandú', 'alfa', 'Nube', 'Medio']) await crear(bearer, finca.id, { nombre });
    const res = await request(app).get(BASE).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(res.body.map((r) => r.nombre)).toEqual(['alfa', 'Medio', 'Nube', 'Ñandú', 'Oro', 'Zeta']);
  });

  it('ordena los números por valor', async () => {
    const finca = await crearFinca('Finca A');
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    for (const nombre of ['Galpón 10', 'Galpón 2']) await crear(bearer, finca.id, { nombre });
    const res = await request(app).get(BASE).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(res.body.map((r) => r.nombre)).toEqual(['Galpón 2', 'Galpón 10']);
  });
});
