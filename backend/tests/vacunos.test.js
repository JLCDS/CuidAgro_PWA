import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/vacunos';
const manana = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const valido = (fincaId, extra = {}) => ({
  fincaId,
  nombre: 'Lucero',
  sexo: 'HEMBRA',
  raza: 'Holstein',
  edadMeses: 24,
  peso: 450.5,
  fechaLlegada: '2026-01-15',
  proposito: 'PRODUCCION_LECHERA',
  ...extra,
});

async function crear(bearer, fincaId, extra = {}) {
  const res = await request(app).post(BASE).set(bearer).send(valido(fincaId, extra)).expect(201);
  return res.body;
}

describe('vacunos - crear', () => {
  it('crea un vacuno válido con la forma esperada', async () => {
    const finca = await crearFinca('Finca A');
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { observaciones: 'Sana' })).expect(201);
    expect(res.body).toMatchObject({
      nombre: 'Lucero',
      sexo: 'HEMBRA',
      raza: 'Holstein',
      edadMeses: 24,
      proposito: 'PRODUCCION_LECHERA',
      estado: 'ACTIVO',
      fechaLlegada: '2026-01-15',
      observaciones: 'Sana',
      finca: { id: finca.id, nombre: 'Finca A' },
    });
    expect(typeof res.body.peso).toBe('number');
    expect(res.body.peso).toBe(450.5);
    expect(res.body.id).toBeTruthy();
  });

  it('el administrador puede crear en cualquier finca', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crear(bearer, finca.id);
  });

  it('acepta valores límite', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    await crear(bearer, finca.id, { nombre: 'Aa', edadMeses: 0, peso: 2000 });
    await crear(bearer, finca.id, { nombre: 'Bb', edadMeses: 480, peso: 0.01 });
  });

  it('acepta fechaLlegada de hoy', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const r = await crear(bearer, finca.id, { fechaLlegada: hoy });
    expect(r.fechaLlegada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('vacunos - validaciones', () => {
  const casos = [
    ['sin nombre', { nombre: undefined }],
    ['nombre corto', { nombre: 'A' }],
    ['nombre solo espacios', { nombre: '   ' }],
    ['nombre muy largo', { nombre: 'x'.repeat(81) }],
    ['sin sexo', { sexo: undefined }],
    ['sexo inválido', { sexo: 'OTRO' }],
    ['sin raza', { raza: undefined }],
    ['raza corta', { raza: 'H' }],
    ['sin edad', { edadMeses: undefined }],
    ['edad negativa', { edadMeses: -1 }],
    ['edad mayor a 480', { edadMeses: 481 }],
    ['edad decimal', { edadMeses: 2.5 }],
    ['sin peso', { peso: undefined }],
    ['peso cero', { peso: 0 }],
    ['peso negativo', { peso: -5 }],
    ['peso mayor a 2000', { peso: 2000.01 }],
    ['peso no numérico', { peso: 'abc' }],
    ['sin fecha de llegada', { fechaLlegada: undefined }],
    ['fecha futura', { fechaLlegada: manana() }],
    ['fecha malformada', { fechaLlegada: '15/01/2026' }],
    ['sin propósito', { proposito: undefined }],
    ['propósito inválido', { proposito: 'PRODUCCION' }],
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

describe('vacunos - duplicados', () => {
  it('409 DUPLICADO en la misma finca sin distinguir mayúsculas', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    await crear(bearer, finca.id, { nombre: 'Lucero' });
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'LUCERO' })).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
  });

  it('mismo nombre en otra finca es permitido', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('VETERINARIO', [a.id, b.id]);
    await crear(bearer, a.id, { nombre: 'Lucero' });
    await crear(bearer, b.id, { nombre: 'lucero' });
  });

  it('409 DUPLICADO al renombrar a un nombre existente', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    await crear(bearer, finca.id, { nombre: 'Lucero' });
    const otro = await crear(bearer, finca.id, { nombre: 'Estrella' });
    const res = await request(app).patch(`${BASE}/${otro.id}`).set(bearer).send({ nombre: 'lucero' }).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
  });

  it('permite conservar el propio nombre al editar (cambiando mayúsculas)', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id, { nombre: 'Lucero' });
    const res = await request(app).patch(`${BASE}/${v.id}`).set(bearer).send({ nombre: 'LUCERO' }).expect(200);
    expect(res.body.nombre).toBe('LUCERO');
  });

  it('un vacuno inactivo sigue reservando su nombre', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id, { nombre: 'Lucero' });
    await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'lucero' })).expect(409);
  });
});

describe('vacunos - permisos', () => {
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
    const v = await crear(vet.bearer, finca.id);
    const { bearer } = await sesionDe('AYUDANTE', [finca.id]);

    const lista = await request(app).get(BASE).set(bearer).expect(200);
    expect(lista.body.map((x) => x.id)).toEqual([v.id]);
    await request(app).get(`${BASE}/${v.id}`).set(bearer).expect(200);

    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'Nuevo' })).expect(403);
    await request(app).patch(`${BASE}/${v.id}`).set(bearer).send({ raza: 'Jersey' }).expect(403);
    await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(403);

    const intacto = await request(app).get(`${BASE}/${v.id}`).set(bearer).expect(200);
    expect(intacto.body).toMatchObject({ raza: 'Holstein', estado: 'ACTIVO' });
  });

  it('el veterinario gestiona en su finca', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id);
    await request(app).patch(`${BASE}/${v.id}`).set(bearer).send({ raza: 'Jersey' }).expect(200);
    await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
  });
});

describe('vacunos - alcance por finca', () => {
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
    await request(app).patch(`${BASE}/${ajeno.id}`).set(bearer).send({ raza: 'X1' }).expect(404);
    await request(app).patch(`${BASE}/${ajeno.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(404);

    const intacto = await request(app).get(`${BASE}/${ajeno.id}`).set(admin.bearer).expect(200);
    expect(intacto.body).toMatchObject({ raza: 'Holstein', estado: 'ACTIVO' });
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
    await request(app).patch(`${BASE}/no-es-uuid`).set(bearer).send({ raza: 'Jersey' }).expect(404);
    await request(app).patch(`${BASE}/no-es-uuid/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(404);
  });
});

describe('vacunos - listado', () => {
  async function escenario() {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const zeta = await crear(bearer, a.id, { nombre: 'Zeta', raza: 'Brahman', proposito: 'ENGORDE', sexo: 'MACHO' });
    const alfa = await crear(bearer, a.id, { nombre: 'Alfa', raza: 'Holstein', proposito: 'PRODUCCION_LECHERA' });
    const medio = await crear(bearer, a.id, { nombre: 'Medio', raza: 'Jersey', proposito: 'ALIMENTACION' });
    const otra = await crear(bearer, b.id, { nombre: 'Otra', raza: 'Holstein', proposito: 'ENGORDE' });
    return { a, b, bearer, zeta, alfa, medio, otra };
  }
  const ids = (res) => res.body.map((x) => x.id);

  it('ordena por nombre', async () => {
    const { bearer, a, zeta, alfa, medio } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(ids(res)).toEqual([alfa.id, medio.id, zeta.id]);
  });

  it('filtra por fincaId', async () => {
    const { bearer, b, otra } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${b.id}`).set(bearer).expect(200);
    expect(ids(res)).toEqual([otra.id]);
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

  it('q busca en nombre y raza sin distinguir mayúsculas', async () => {
    const { bearer, a, zeta, alfa, medio, otra } = await escenario();
    const porNombre = await request(app).get(`${BASE}?fincaId=${a.id}&q=ZET`).set(bearer).expect(200);
    expect(ids(porNombre)).toEqual([zeta.id]);
    const porRaza = await request(app).get(`${BASE}?q=holstein`).set(bearer).expect(200);
    expect(ids(porRaza)).toEqual([alfa.id, otra.id]);
    const porRaza2 = await request(app).get(`${BASE}?fincaId=${a.id}&q=jers`).set(bearer).expect(200);
    expect(ids(porRaza2)).toEqual([medio.id]);
    const nada = await request(app).get(`${BASE}?q=zzzz`).set(bearer).expect(200);
    expect(nada.body).toEqual([]);
  });

  it('filtra por proposito', async () => {
    const { bearer, a, zeta } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}&proposito=ENGORDE`).set(bearer).expect(200);
    expect(ids(res)).toEqual([zeta.id]);
  });

  it('el listado trae la forma completa', async () => {
    const { bearer, a } = await escenario();
    const res = await request(app).get(`${BASE}?fincaId=${a.id}`).set(bearer).expect(200);
    expect(res.body[0]).toMatchObject({ finca: { id: a.id, nombre: 'A' }, estado: 'ACTIVO' });
    expect(typeof res.body[0].peso).toBe('number');
    expect(res.body[0].fechaLlegada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('vacunos - editar', () => {
  it('PATCH parcial solo cambia lo enviado', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id);
    const res = await request(app).patch(`${BASE}/${v.id}`).set(bearer).send({ peso: 500, edadMeses: 30 }).expect(200);
    expect(res.body).toMatchObject({
      nombre: 'Lucero',
      raza: 'Holstein',
      peso: 500,
      edadMeses: 30,
      fechaLlegada: '2026-01-15',
      proposito: 'PRODUCCION_LECHERA',
      finca: { id: finca.id },
    });
    const get = await request(app).get(`${BASE}/${v.id}`).set(bearer).expect(200);
    expect(get.body.peso).toBe(500);
  });

  it('el PATCH valida rangos', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id);
    const malos = [{ peso: 0 }, { peso: 2001 }, { edadMeses: 481 }, { nombre: 'A' }, { fechaLlegada: manana() }, { sexo: 'X' }, { proposito: 'X' }];
    for (const cuerpo of malos) {
      const res = await request(app).patch(`${BASE}/${v.id}`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });

  it('fincaId y estado en el PATCH normal nunca mueven el recurso', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('VETERINARIO', [a.id, b.id]);
    const v = await crear(bearer, a.id);
    const r1 = await request(app).patch(`${BASE}/${v.id}`).set(bearer).send({ fincaId: b.id });
    expect([200, 400]).toContain(r1.status);
    const r2 = await request(app).patch(`${BASE}/${v.id}`).set(bearer).send({ estado: 'INACTIVO' });
    expect([200, 400]).toContain(r2.status);
    const get = await request(app).get(`${BASE}/${v.id}`).set(bearer).expect(200);
    expect(get.body.finca.id).toBe(a.id);
    expect(get.body.estado).toBe('ACTIVO');
  });
});

describe('vacunos - estado', () => {
  it('da de baja con motivo y reactiva limpiando el motivo', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id);
    const baja = await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vendido' }).expect(200);
    expect(baja.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Vendido' });
    const get = await request(app).get(`${BASE}/${v.id}`).set(bearer).expect(200);
    expect(get.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Vendido' });

    const alta = await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send({ estado: 'ACTIVO', motivoBaja: 'ignorado' }).expect(200);
    expect(alta.body.estado).toBe('ACTIVO');
    expect(alta.body.motivoBaja ?? null).toBeNull();
    const get2 = await request(app).get(`${BASE}/${v.id}`).set(bearer).expect(200);
    expect(get2.body.motivoBaja ?? null).toBeNull();
  });

  it('valida estado y longitud del motivo', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id);
    const malos = [{}, { estado: 'TODOS' }, { estado: 'BORRADO' }, { estado: 'INACTIVO', motivoBaja: 'x'.repeat(501) }];
    for (const cuerpo of malos) {
      const res = await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });

  it('el motivo de baja es opcional', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('VETERINARIO', [finca.id]);
    const v = await crear(bearer, finca.id);
    await request(app).patch(`${BASE}/${v.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
  });
});

describe('vacunos - orden', () => {
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
