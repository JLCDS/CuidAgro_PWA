import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/medicamentos';
const bogota = (dias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const valido = (fincaId, extra = {}) => ({ fincaId, nombre: 'Oxitetraciclina', tipo: 'ANTIBIOTICO', unidad: 'ML', ...extra });

async function crear(bearer, fincaId, extra = {}) {
  const res = await request(app).post(BASE).set(bearer).send(valido(fincaId, extra)).expect(201);
  return res.body;
}
const obtener = async (bearer, id) => (await request(app).get(`${BASE}/${id}`).set(bearer).expect(200)).body;
const entrada = (bearer, id, cuerpo) => request(app).post(`${BASE}/${id}/entradas`).set(bearer).send(cuerpo);
const movimientos = async (bearer, id) => (await request(app).get(`${BASE}/${id}/movimientos`).set(bearer).expect(200)).body;
const listar = async (bearer, query = '') => (await request(app).get(`${BASE}${query}`).set(bearer).expect(200)).body;

async function vet(extraFincas = []) {
  const finca = await crearFinca('Finca A');
  const s = await sesionDe('VETERINARIO', [finca.id, ...extraFincas.map((f) => f.id)]);
  return { finca, ...s };
}

describe('medicamentos - permisos', () => {
  it('sin token responde 401', async () => {
    for (const [m, r] of [['get', BASE], ['get', `${BASE}/${UUID_INEXISTENTE}`], ['post', BASE], ['patch', `${BASE}/${UUID_INEXISTENTE}`], ['post', `${BASE}/${UUID_INEXISTENTE}/entradas`], ['get', `${BASE}/${UUID_INEXISTENTE}/movimientos`]]) {
      expect((await request(app)[m](r)).status, r).toBe(401);
    }
  });

  it('el ayudante solo consulta; admin y veterinario gestionan', async () => {
    const finca = await crearFinca();
    const ayudante = await sesionDe('AYUDANTE', [finca.id]);
    const vetS = await sesionDe('VETERINARIO', [finca.id]);
    const admin = await sesionDe('ADMINISTRADOR');
    const m = await crear(vetS.bearer, finca.id);
    await crear(admin.bearer, finca.id, { nombre: 'Ivermectina' });
    expect((await request(app).post(BASE).set(ayudante.bearer).send(valido(finca.id, { nombre: 'Otro' }))).status).toBe(403);
    expect((await request(app).patch(`${BASE}/${m.id}`).set(ayudante.bearer).send({ nombre: 'Z1' })).status).toBe(403);
    expect((await request(app).patch(`${BASE}/${m.id}/estado`).set(ayudante.bearer).send({ estado: 'INACTIVO' })).status).toBe(403);
    expect((await entrada(ayudante.bearer, m.id, { cantidad: 5 })).status).toBe(403);
    expect((await request(app).get(BASE).set(ayudante.bearer)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${m.id}`).set(ayudante.bearer)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${m.id}/movimientos`).set(ayudante.bearer)).status).toBe(200);
  });
});

describe('medicamentos - alcance por finca', () => {
  it('un medicamento ajeno responde 404 y el listado con fincaId ajena es []', async () => {
    const otra = await crearFinca('B');
    const ajeno = await sesionDe('VETERINARIO', [otra.id]);
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    expect((await request(app).get(`${BASE}/${m.id}`).set(ajeno.bearer)).status).toBe(404);
    expect((await request(app).get(`${BASE}/${m.id}/movimientos`).set(ajeno.bearer)).status).toBe(404);
    expect((await request(app).patch(`${BASE}/${m.id}`).set(ajeno.bearer).send({ nombre: 'Nuevo' })).status).toBe(404);
    expect((await request(app).patch(`${BASE}/${m.id}/estado`).set(ajeno.bearer).send({ estado: 'INACTIVO' })).status).toBe(404);
    expect((await entrada(ajeno.bearer, m.id, { cantidad: 5 })).status).toBe(404);
    expect(await listar(ajeno.bearer, `?fincaId=${finca.id}`)).toEqual([]);
    expect(await listar(ajeno.bearer)).toEqual([]);
    expect((await request(app).post(BASE).set(ajeno.bearer).send(valido(finca.id))).status).toBe(404);
  });

  it('id mal formado o inexistente responde 404', async () => {
    const { bearer } = await vet();
    expect((await request(app).get(`${BASE}/no-es-uuid`).set(bearer)).status).toBe(404);
    expect((await request(app).get(`${BASE}/${UUID_INEXISTENTE}`).set(bearer)).status).toBe(404);
  });

  it('el administrador ve todas las fincas', async () => {
    const a = await crearFinca('A');
    const b = await crearFinca('B');
    const admin = await sesionDe('ADMINISTRADOR');
    await crear(admin.bearer, a.id, { nombre: 'Uno' });
    await crear(admin.bearer, b.id, { nombre: 'Dos' });
    expect(await listar(admin.bearer)).toHaveLength(2);
    expect(await listar(admin.bearer, `?fincaId=${b.id}`)).toHaveLength(1);
  });
});

describe('medicamentos - crear', () => {
  it('un nombre con byte NUL responde 400 en nombre, no 500', async () => {
    const { finca, bearer } = await vet();
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'Nul\u0000byte' })).expect(400);
    expect(res.body.error.detalles).toEqual([expect.objectContaining({ campo: 'nombre' })]);
  });

  it('crea sin stock inicial', async () => {
    const { finca, bearer } = await vet();
    const res = await request(app)
      .post(BASE)
      .set(bearer)
      .send(valido(finca.id, { laboratorio: 'Zoetis', diasRetiroCarne: 28, diasRetiroLeche: 4, observaciones: 'Frasco' }))
      .expect(201);
    expect(res.body).toMatchObject({
      nombre: 'Oxitetraciclina',
      tipo: 'ANTIBIOTICO',
      unidad: 'ML',
      stock: 0,
      stockMinimo: 0,
      estado: 'ACTIVO',
      laboratorio: 'Zoetis',
      diasRetiroCarne: 28,
      diasRetiroLeche: 4,
      fechaVencimiento: null,
      vencido: false,
      porVencer: false,
      bajoStock: true,
      finca: { id: finca.id, nombre: 'Finca A' },
    });
    expect(await movimientos(bearer, res.body.id)).toEqual([]);
  });

  it('con stock inicial hay una entrada "Stock inicial" y se admiten decimales', async () => {
    const { finca, bearer, usuario } = await vet();
    const m = await crear(bearer, finca.id, { stockInicial: 120.5, stockMinimo: 10.25 });
    expect(m.stock).toBe(120.5);
    expect(m.stockMinimo).toBe(10.25);
    expect(m.bajoStock).toBe(false);
    const movs = await movimientos(bearer, m.id);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: 'ENTRADA', cantidad: 120.5, detalle: 'Stock inicial', registradoPor: { id: usuario.id } });
  });

  it('stockInicial 0 no crea entrada', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id, { stockInicial: 0 });
    expect(await movimientos(bearer, m.id)).toEqual([]);
  });
});

describe('medicamentos - validaciones', () => {
  const casos = [
    ['sin nombre', { nombre: undefined }],
    ['nombre corto', { nombre: 'A' }],
    ['nombre muy largo', { nombre: 'x'.repeat(81) }],
    ['sin tipo', { tipo: undefined }],
    ['tipo inválido', { tipo: 'MILAGRO' }],
    ['sin unidad', { unidad: undefined }],
    ['unidad inválida', { unidad: 'KG' }],
    ['stock inicial negativo', { stockInicial: -1 }],
    ['stock inicial con 3 decimales', { stockInicial: 1.005 }],
    ['stock inicial no numérico', { stockInicial: 'mucho' }],
    ['stock inicial excesivo', { stockInicial: 1_000_001 }],
    ['stock mínimo negativo', { stockMinimo: -1 }],
    ['fecha de vencimiento inválida', { fechaVencimiento: '31/12/2030' }],
    ['fecha de vencimiento imposible', { fechaVencimiento: '2030-02-31' }],
    ['laboratorio muy largo', { laboratorio: 'x'.repeat(81) }],
    ['retiro carne negativo', { diasRetiroCarne: -1 }],
    ['retiro carne mayor a 365', { diasRetiroCarne: 366 }],
    ['retiro leche decimal', { diasRetiroLeche: 1.5 }],
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

  it('las entradas validan cantidad, fecha, vencimiento y nota', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    const malos = [
      {},
      { cantidad: 0 },
      { cantidad: -5 },
      { cantidad: 1_000_001 },
      { cantidad: 1.001 },
      { cantidad: 'x' },
      { cantidad: 10, fecha: bogota(2) },
      { cantidad: 10, fecha: '01/01/2026' },
      { cantidad: 10, fechaVencimiento: 'mañana' },
      { cantidad: 10, nota: 'x'.repeat(501) },
    ];
    for (const cuerpo of malos) {
      const res = await entrada(bearer, m.id, cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
    expect((await obtener(bearer, m.id)).stock).toBe(0);
  });

  it('el PATCH valida', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    for (const cuerpo of [{ nombre: 'A' }, { tipo: 'X' }, { unidad: 'X' }, { stockMinimo: -1 }, { diasRetiroCarne: 400 }, { observaciones: 'x'.repeat(1001) }]) {
      const res = await request(app).patch(`${BASE}/${m.id}`).set(bearer).send(cuerpo).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    }
  });
});

describe('medicamentos - duplicados', () => {
  it('409 DUPLICADO en la misma finca sin distinguir mayúsculas', async () => {
    const { finca, bearer } = await vet();
    await crear(bearer, finca.id, { nombre: 'Penicilina' });
    const res = await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'PENICILINA' })).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
  });

  it('el mismo nombre en otra finca es permitido', async () => {
    const b = await crearFinca('B');
    const { finca, bearer } = await vet([b]);
    await crear(bearer, finca.id, { nombre: 'Penicilina' });
    await crear(bearer, b.id, { nombre: 'penicilina' });
  });

  it('409 al renombrar y se permite cambiar mayúsculas del propio nombre', async () => {
    const { finca, bearer } = await vet();
    await crear(bearer, finca.id, { nombre: 'Penicilina' });
    const otro = await crear(bearer, finca.id, { nombre: 'Vitamina' });
    await request(app).patch(`${BASE}/${otro.id}`).set(bearer).send({ nombre: 'penicilina' }).expect(409);
    await request(app).patch(`${BASE}/${otro.id}`).set(bearer).send({ nombre: 'VITAMINA' }).expect(200);
  });

  it('un medicamento inactivo sigue reservando su nombre', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id, { nombre: 'Penicilina' });
    await request(app).patch(`${BASE}/${m.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Retirado' }).expect(200);
    await request(app).post(BASE).set(bearer).send(valido(finca.id, { nombre: 'penicilina' })).expect(409);
  });
});

describe('medicamentos - editar y estado', () => {
  it('PATCH parcial cambia solo lo enviado y no toca el stock', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id, { stockInicial: 50 });
    const res = await request(app)
      .patch(`${BASE}/${m.id}`)
      .set(bearer)
      .send({ tipo: 'VACUNA', stockMinimo: 5, fechaVencimiento: bogota(200), diasRetiroCarne: null })
      .expect(200);
    expect(res.body).toMatchObject({ nombre: 'Oxitetraciclina', tipo: 'VACUNA', stockMinimo: 5, stock: 50, diasRetiroCarne: null });
    expect(res.body.fechaVencimiento).toBe(bogota(200));
  });

  it('el PATCH ignora stock, finca y estado', async () => {
    const b = await crearFinca('B');
    const { finca, bearer } = await vet([b]);
    const m = await crear(bearer, finca.id, { stockInicial: 50 });
    for (const cuerpo of [{ stock: 999 }, { stockInicial: 5 }, { fincaId: b.id }, { estado: 'INACTIVO' }]) {
      const r = await request(app).patch(`${BASE}/${m.id}`).set(bearer).send(cuerpo);
      expect([200, 400]).toContain(r.status);
    }
    expect(await obtener(bearer, m.id)).toMatchObject({ stock: 50, estado: 'ACTIVO', finca: { id: finca.id } });
    expect(await movimientos(bearer, m.id)).toHaveLength(1);
  });

  it('baja con motivo y reactivación limpia el motivo', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    const baja = await request(app).patch(`${BASE}/${m.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Vencido' }).expect(200);
    expect(baja.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Vencido' });
    const alta = await request(app).patch(`${BASE}/${m.id}/estado`).set(bearer).send({ estado: 'ACTIVO', motivoBaja: 'x' }).expect(200);
    expect(alta.body.estado).toBe('ACTIVO');
    expect(alta.body.motivoBaja ?? null).toBeNull();
  });

  it('valida el cuerpo de estado', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    for (const cuerpo of [{}, { estado: 'TODOS' }, { estado: 'INACTIVO', motivoBaja: 'x'.repeat(501) }]) {
      await request(app).patch(`${BASE}/${m.id}/estado`).set(bearer).send(cuerpo).expect(400);
    }
  });
});

describe('medicamentos - entradas y stock', () => {
  it('la entrada suma con decimales y queda en los movimientos', async () => {
    const { finca, bearer, usuario } = await vet();
    const m = await crear(bearer, finca.id, { stockInicial: 10.1 });
    const res = await entrada(bearer, m.id, { cantidad: 0.2, nota: 'Reposición' }).expect(201);
    expect(res.body.entrada).toMatchObject({ medicamentoId: m.id, cantidad: 0.2, nota: 'Reposición', fecha: bogota(), registradoPorId: usuario.id });
    expect(res.body.medicamento.stock).toBe(10.3);
    expect((await obtener(bearer, m.id)).stock).toBe(10.3);
    const movs = await movimientos(bearer, m.id);
    expect(movs).toHaveLength(2);
    expect(movs.map((x) => x.tipo)).toEqual(['ENTRADA', 'ENTRADA']);
  });

  it('una entrada con fechaVencimiento actualiza la del medicamento', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id, { fechaVencimiento: bogota(10) });
    const res = await entrada(bearer, m.id, { cantidad: 5, fechaVencimiento: bogota(400) }).expect(201);
    expect(res.body.entrada.fechaVencimiento).toBe(bogota(400));
    expect(res.body.medicamento.fechaVencimiento).toBe(bogota(400));
    expect(res.body.medicamento.porVencer).toBe(false);
    // Sin fechaVencimiento se conserva la actual.
    const sin = await entrada(bearer, m.id, { cantidad: 1 }).expect(201);
    expect(sin.body.medicamento.fechaVencimiento).toBe(bogota(400));
  });

  it('una entrada con fecha pasada se acepta', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    const res = await entrada(bearer, m.id, { cantidad: 3, fecha: bogota(-5) }).expect(201);
    expect(res.body.entrada.fecha).toBe(bogota(-5));
  });

  it('un medicamento inactivo no admite entradas', async () => {
    const { finca, bearer } = await vet();
    const m = await crear(bearer, finca.id);
    await request(app).patch(`${BASE}/${m.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
    const res = await entrada(bearer, m.id, { cantidad: 5 }).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });
});

describe('medicamentos - vencimiento y alertas', () => {
  it('calcula vencido y porVencer con el día de Bogotá', async () => {
    const { finca, bearer } = await vet();
    const caso = async (nombre, dias) => crear(bearer, finca.id, { nombre, stockInicial: 100, fechaVencimiento: bogota(dias) });
    const ayer = await caso('Ayer', -1);
    const hoy = await caso('Hoy', 0);
    const en30 = await caso('En treinta', 30);
    const en31 = await caso('En treinta y uno', 31);
    const sin = await crear(bearer, finca.id, { nombre: 'Sin fecha', stockInicial: 100 });
    expect([ayer.vencido, ayer.porVencer]).toEqual([true, false]);
    expect([hoy.vencido, hoy.porVencer]).toEqual([false, true]);
    expect([en30.vencido, en30.porVencer]).toEqual([false, true]);
    expect([en31.vencido, en31.porVencer]).toEqual([false, false]);
    expect([sin.vencido, sin.porVencer]).toEqual([false, false]);
  });

  it('filtro alerta: bajo stock, vencido o por vencer', async () => {
    const { finca, bearer } = await vet();
    await crear(bearer, finca.id, { nombre: 'Normal', stockInicial: 100, stockMinimo: 10, fechaVencimiento: bogota(200) });
    await crear(bearer, finca.id, { nombre: 'Bajo', stockInicial: 5, stockMinimo: 10 });
    await crear(bearer, finca.id, { nombre: 'Vencido', stockInicial: 100, fechaVencimiento: bogota(-3) });
    await crear(bearer, finca.id, { nombre: 'Por vencer', stockInicial: 100, fechaVencimiento: bogota(10) });
    const nombres = (await listar(bearer, '?alerta=true')).map((m) => m.nombre);
    expect(nombres).toEqual(['Bajo', 'Por vencer', 'Vencido']);
    expect((await listar(bearer, '?bajoStock=true')).map((m) => m.nombre)).toEqual(['Bajo']);
  });
});

describe('medicamentos - listado', () => {
  it('filtra por estado, q y tipo, y ordena por nombre en español', async () => {
    const { finca, bearer } = await vet();
    await crear(bearer, finca.id, { nombre: 'Zinc', tipo: 'VITAMINA', stockInicial: 5 });
    await crear(bearer, finca.id, { nombre: 'Ñandú vit', tipo: 'VITAMINA', stockInicial: 5 });
    await crear(bearer, finca.id, { nombre: 'Nistatina', tipo: 'ANTIBIOTICO', stockInicial: 5 });
    const baja = await crear(bearer, finca.id, { nombre: 'Amoxicilina', tipo: 'ANTIBIOTICO', stockInicial: 5 });
    await request(app).patch(`${BASE}/${baja.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);

    expect((await listar(bearer)).map((m) => m.nombre)).toEqual(['Nistatina', 'Ñandú vit', 'Zinc']);
    expect((await listar(bearer, '?estado=INACTIVO')).map((m) => m.nombre)).toEqual(['Amoxicilina']);
    expect(await listar(bearer, '?estado=TODOS')).toHaveLength(4);
    expect((await listar(bearer, '?q=nist')).map((m) => m.nombre)).toEqual(['Nistatina']);
    expect((await listar(bearer, '?tipo=VITAMINA')).map((m) => m.nombre)).toEqual(['Ñandú vit', 'Zinc']);
    await request(app).get(`${BASE}?tipo=X`).set(bearer).expect(400);
  });
});
