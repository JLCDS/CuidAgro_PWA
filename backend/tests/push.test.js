import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { configurarEnviador, esperarEnvios, revisarVencimientos } from '../src/lib/push.js';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, crearUsuario, sesionDe } from './helpers.js';

const CLAVE_PUBLICA = 'BClavePublicaDePrueba';
const bogota = (dias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const fecha = (dias) => new Date(`${bogota(dias)}T00:00:00Z`);

const suscripcion = (n) => ({ endpoint: `https://push.ejemplo.test/envio/${n}`, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } });

let enviador;
let conVapid;

beforeAll(() => {
  conVapid = () => {
    env.VAPID_PUBLIC_KEY = CLAVE_PUBLICA;
    env.VAPID_PRIVATE_KEY = 'ClavePrivadaDePrueba';
  };
});

beforeEach(() => {
  conVapid();
  enviador = vi.fn(async () => {});
  configurarEnviador(enviador);
});

afterAll(() => {
  delete env.VAPID_PUBLIC_KEY;
  delete env.VAPID_PRIVATE_KEY;
  configurarEnviador(null);
});

// ---------------------------------------------------------------------------
// Rutas de suscripción
// ---------------------------------------------------------------------------

describe('rutas /api/push', () => {
  it('exigen sesión (401 sin token)', async () => {
    await request(app).get('/api/push/clave-publica').expect(401);
    await request(app).post('/api/push/suscripciones').send(suscripcion(1)).expect(401);
    await request(app).delete('/api/push/suscripciones').send({ endpoint: suscripcion(1).endpoint }).expect(401);
  });

  it('GET clave-publica: habilitado con claves y deshabilitado sin ellas', async () => {
    const s = await sesionDe('AYUDANTE', [(await crearFinca()).id]);
    const activo = await request(app).get('/api/push/clave-publica').set(s.bearer).expect(200);
    expect(activo.body).toEqual({ habilitado: true, clavePublica: CLAVE_PUBLICA });
    delete env.VAPID_PUBLIC_KEY;
    const inactivo = await request(app).get('/api/push/clave-publica').set(s.bearer).expect(200);
    expect(inactivo.body).toEqual({ habilitado: false, clavePublica: null });
  });

  it('POST crea la suscripción (201) y valida el cuerpo con el campo', async () => {
    const s = await sesionDe('AYUDANTE', [(await crearFinca()).id]);
    const ok = await request(app).post('/api/push/suscripciones').set(s.bearer).send(suscripcion(1));
    expect(ok.status).toBe(201);
    const fila = await prisma.suscripcionPush.findUniqueOrThrow({ where: { endpoint: suscripcion(1).endpoint } });
    expect(fila).toMatchObject({ usuarioId: s.usuario.id, p256dh: 'p256dh-1', auth: 'auth-1' });

    const casos = [
      [{ keys: suscripcion(2).keys }, 'endpoint'],
      [{ endpoint: 'http://inseguro.test/x', keys: suscripcion(2).keys }, 'endpoint'],
      [{ endpoint: 'no-es-url', keys: suscripcion(2).keys }, 'endpoint'],
      [{ endpoint: suscripcion(2).endpoint }, 'keys'],
      [{ endpoint: suscripcion(2).endpoint, keys: { auth: 'x' } }, 'keys.p256dh'],
      [{ endpoint: suscripcion(2).endpoint, keys: { p256dh: 'x' } }, 'keys.auth'],
    ];
    for (const [cuerpo, campo] of casos) {
      const res = await request(app).post('/api/push/suscripciones').set(s.bearer).send(cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
      expect(res.body.error.detalles).toEqual([expect.objectContaining({ campo })]);
    }
    expect(await prisma.suscripcionPush.count()).toBe(1);
  });

  it('POST repetido hace upsert por endpoint y lo reasigna al usuario actual', async () => {
    const f = await crearFinca();
    const a = await sesionDe('AYUDANTE', [f.id]);
    const b = await sesionDe('VETERINARIO', [f.id]);
    await request(app).post('/api/push/suscripciones').set(a.bearer).send(suscripcion(1)).expect(201);
    const nueva = { endpoint: suscripcion(1).endpoint, keys: { p256dh: 'nueva-p', auth: 'nueva-a' } };
    await request(app).post('/api/push/suscripciones').set(b.bearer).send(nueva).expect(201);
    const filas = await prisma.suscripcionPush.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ usuarioId: b.usuario.id, p256dh: 'nueva-p', auth: 'nueva-a' });
  });

  it('POST responde 409 PUSH_DESHABILITADO sin claves VAPID', async () => {
    const s = await sesionDe('AYUDANTE', [(await crearFinca()).id]);
    delete env.VAPID_PRIVATE_KEY;
    const res = await request(app).post('/api/push/suscripciones').set(s.bearer).send(suscripcion(1));
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('PUSH_DESHABILITADO');
    expect(await prisma.suscripcionPush.count()).toBe(0);
  });

  it('DELETE borra solo la del propio usuario y es idempotente (204)', async () => {
    const f = await crearFinca();
    const a = await sesionDe('AYUDANTE', [f.id]);
    const b = await sesionDe('AYUDANTE', [f.id]);
    await request(app).post('/api/push/suscripciones').set(a.bearer).send(suscripcion(1)).expect(201);

    await request(app).delete('/api/push/suscripciones').set(b.bearer).send({ endpoint: suscripcion(1).endpoint }).expect(204);
    expect(await prisma.suscripcionPush.count()).toBe(1);

    await request(app).delete('/api/push/suscripciones').set(a.bearer).send({ endpoint: suscripcion(1).endpoint }).expect(204);
    expect(await prisma.suscripcionPush.count()).toBe(0);
    await request(app).delete('/api/push/suscripciones').set(a.bearer).send({ endpoint: suscripcion(1).endpoint }).expect(204);
    await request(app).delete('/api/push/suscripciones').set(a.bearer).send({}).expect(400);
  });

  it('borrar un usuario borra sus suscripciones', async () => {
    const s = await sesionDe('AYUDANTE', [(await crearFinca()).id]);
    await request(app).post('/api/push/suscripciones').set(s.bearer).send(suscripcion(1)).expect(201);
    await prisma.refreshToken.deleteMany({ where: { usuarioId: s.usuario.id } });
    await prisma.usuario.delete({ where: { id: s.usuario.id } });
    expect(await prisma.suscripcionPush.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Envíos
// ---------------------------------------------------------------------------

/** Finca A con administrador, dos veterinarios, un ayudante y uno inactivo; veterinario de la finca B. Todos suscritos. */
async function escenario() {
  const fincaA = await crearFinca('Finca A');
  const fincaB = await crearFinca('Finca B');
  const admin = await sesionDe('ADMINISTRADOR');
  const vet = await sesionDe('VETERINARIO', [fincaA.id]);
  const vet2 = await sesionDe('VETERINARIO', [fincaA.id]);
  const ayudante = await sesionDe('AYUDANTE', [fincaA.id]);
  const vetB = await sesionDe('VETERINARIO', [fincaB.id]);
  const inactivo = await crearUsuario('VETERINARIO', [fincaA.id]);
  await prisma.usuario.update({ where: { id: inactivo.id }, data: { estado: 'INACTIVO' } });

  const sujetos = { admin, vet, vet2, ayudante, vetB, inactivo: { usuario: inactivo } };
  const endpoints = {};
  let n = 0;
  for (const [nombre, s] of Object.entries(sujetos)) {
    const sub = suscripcion(`${nombre}-${++n}`);
    endpoints[nombre] = sub.endpoint;
    await prisma.suscripcionPush.create({
      data: { usuarioId: s.usuario.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }
  const base = { fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId: admin.usuario.id };
  const vacuno = await prisma.vacuno.create({
    data: { ...base, fincaId: fincaA.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400 },
  });
  const lote = await prisma.loteOviparo.create({
    data: {
      fincaId: fincaA.id, nombre: 'Lote Uno', edadMinSemanas: 1, edadMaxSemanas: 10, cantidad: 100,
      proposito: 'PRODUCCION', creadoPorId: admin.usuario.id,
    },
  });
  return { fincaA, fincaB, ...sujetos, endpoints, vacuno, lote, creadoPorId: admin.usuario.id };
}

/** Nombres de los sujetos que recibieron un envío (ordenados). */
const receptores = (e) => {
  const porEndpoint = Object.fromEntries(Object.entries(e.endpoints).map(([nombre, ep]) => [ep, nombre]));
  return enviador.mock.calls.map(([sub]) => porEndpoint[sub.endpoint]).sort();
};
const cargas = () => enviador.mock.calls.map(([, carga]) => JSON.parse(carga));

describe('novedades de prioridad ALTA', () => {
  const nueva = (e, extra = {}) => ({ vacunoId: e.vacuno.id, tipo: 'ENFERMEDAD', descripcion: 'Cojera marcada', prioridad: 'ALTA', ...extra });

  it('avisa a quien gestiona novedades en la finca, excluye al autor, a los inactivos y a otras fincas', async () => {
    const e = await escenario();
    const res = await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e)).expect(201);
    await esperarEnvios();
    // admin (todas las fincas) y los dos veterinarios de la finca A; no el ayudante (autor y sin permiso),
    // ni el inactivo, ni el de la finca B.
    expect(receptores(e)).toEqual(['admin', 'vet', 'vet2']);
    expect(cargas()[0]).toMatchObject({ titulo: expect.any(String), cuerpo: expect.stringContaining('Lucero'), url: expect.any(String), etiqueta: `novedad-alta:${res.body.id}` });
    expect(await prisma.avisoEnviado.count({ where: { clave: `novedad-alta:${res.body.id}` } })).toBe(1);
  });

  it('el autor con permiso de gestión no recibe su propio aviso', async () => {
    const e = await escenario();
    await request(app).post('/api/novedades').set(e.vet.bearer).send(nueva(e)).expect(201);
    await esperarEnvios();
    expect(receptores(e)).toEqual(['admin', 'vet2']);
  });

  it('la prioridad MEDIA o BAJA no avisa', async () => {
    const e = await escenario();
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e, { prioridad: 'MEDIA' })).expect(201);
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e, { prioridad: 'BAJA' })).expect(201);
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send({ ...nueva(e), prioridad: undefined }).expect(201);
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();
  });

  it('sincronizar de nuevo la misma novedad (200) no repite el aviso', async () => {
    const e = await escenario();
    const clienteId = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e, { clienteId })).expect(201);
    await esperarEnvios();
    const primeros = enviador.mock.calls.length;
    expect(primeros).toBe(3);
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e, { clienteId })).expect(200);
    await esperarEnvios();
    expect(enviador.mock.calls.length).toBe(primeros);
  });

  it('una clave ya registrada no se vuelve a enviar (deduplicación)', async () => {
    const e = await escenario();
    const res = await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e)).expect(201);
    await esperarEnvios();
    expect(enviador).toHaveBeenCalledTimes(3);
    // Mismo aviso por otra vía: la clave ya existe, no hay envío nuevo.
    const { avisarNovedadAlta } = await import('../src/lib/push.js');
    const fila = await prisma.novedad.findUniqueOrThrow({ where: { id: res.body.id }, include: { vacuno: true, lote: true } });
    avisarNovedadAlta(fila, e.ayudante.usuario.id);
    await esperarEnvios();
    expect(enviador).toHaveBeenCalledTimes(3);
  });

  it('sin claves VAPID no se envía nada y la API responde igual', async () => {
    const e = await escenario();
    delete env.VAPID_PUBLIC_KEY;
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(nueva(e)).expect(201);
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();
  });
});

describe('alimentos con stock bajo', () => {
  const crearAlimento = (e, extra = {}) =>
    prisma.alimento.create({
      data: { fincaId: e.fincaA.id, nombre: 'Concentrado', tipo: 'CONCENTRADO', stockGramos: 5000, stockMinimoGramos: 3000, creadoPorId: e.creadoPorId, ...extra },
    });
  const consumo = (e, s, alimento, jornada, gramos) =>
    request(app)
      .post('/api/consumos/vacunos')
      .set(s.bearer)
      .send({ vacunoId: e.vacuno.id, alimentoId: alimento.id, cantidadGramos: gramos, jornada, fecha: bogota() });

  it('avisa solo cuando el consumo cruza el mínimo y no repite mientras siga bajo', async () => {
    const e = await escenario();
    const alimento = await crearAlimento(e);
    await consumo(e, e.vet, alimento, 'MANANA', 1000).expect(201); // 4000: aún sobre el mínimo
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();

    await consumo(e, e.vet, alimento, 'TARDE', 1500).expect(201); // 2500: cruza
    await esperarEnvios();
    // admin y vet2 gestionan alimentos; el autor (vet) queda fuera; el ayudante no tiene el permiso.
    expect(receptores(e)).toEqual(['admin', 'vet2']);
    expect(cargas()[0]).toMatchObject({ cuerpo: expect.stringContaining('Concentrado') });
    expect(await prisma.avisoEnviado.count({ where: { clave: `alimento-stock:${alimento.id}:${bogota()}` } })).toBe(1);

    await consumo(e, e.vet, alimento, 'NOCHE', 500).expect(201); // ya estaba bajo
    await esperarEnvios();
    expect(enviador).toHaveBeenCalledTimes(2);
  });

  it('no repite el aviso del mismo día aunque vuelva a cruzar', async () => {
    const e = await escenario();
    const alimento = await crearAlimento(e);
    await prisma.avisoEnviado.create({ data: { clave: `alimento-stock:${alimento.id}:${bogota()}` } });
    await consumo(e, e.vet, alimento, 'MANANA', 2500).expect(201);
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();
  });

  it('avisa también al editar un consumo que hace cruzar el mínimo', async () => {
    const e = await escenario();
    const alimento = await crearAlimento(e);
    const creado = await consumo(e, e.vet, alimento, 'MANANA', 1000).expect(201);
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();
    await request(app).patch(`/api/consumos/vacunos/${creado.body.id}`).set(e.vet.bearer).send({ cantidadGramos: 3000 }).expect(200);
    await esperarEnvios();
    expect(receptores(e)).toEqual(['admin', 'vet2']);
  });
});

describe('medicamentos', () => {
  const crearMedicamento = (e, extra = {}) =>
    prisma.medicamento.create({
      data: {
        fincaId: e.fincaA.id, nombre: 'Oxitetraciclina', tipo: 'ANTIBIOTICO', unidad: 'ML', stock: 15, stockMinimo: 10,
        creadoPorId: e.creadoPorId, ...extra,
      },
    });
  const tratar = (e, s, m, dosis) =>
    request(app).post('/api/tratamientos').set(s.bearer).send({ vacunoId: e.vacuno.id, medicamentoId: m.id, dosis, via: 'INTRAMUSCULAR' });

  it('avisa cuando un tratamiento deja el medicamento en stock bajo, sin repetir ni avisar al autor', async () => {
    const e = await escenario();
    const m = await crearMedicamento(e);
    await tratar(e, e.vet, m, 2).expect(201); // 13: sobre el mínimo
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();

    await tratar(e, e.vet, m, 5).expect(201); // 8: cruza
    await esperarEnvios();
    expect(receptores(e)).toEqual(['admin', 'vet2']);
    expect(cargas()[0]).toMatchObject({ cuerpo: expect.stringContaining('Oxitetraciclina') });

    await tratar(e, e.vet, m, 1).expect(201); // ya estaba bajo
    await esperarEnvios();
    expect(enviador).toHaveBeenCalledTimes(2);
  });
});

describe('revisarVencimientos', () => {
  it('avisa de los por vencer y vencidos activos una sola vez, también al autor, y no repite', async () => {
    const e = await escenario();
    const med = (nombre, extra) =>
      prisma.medicamento.create({
        data: { fincaId: e.fincaA.id, nombre, tipo: 'VITAMINA', unidad: 'ML', stock: 50, stockMinimo: 1, creadoPorId: e.creadoPorId, ...extra },
      });
    const porVencer = await med('Por vencer', { fechaVencimiento: fecha(10) });
    const vencido = await med('Vencido', { fechaVencimiento: fecha(-1) });
    await med('Sano', { fechaVencimiento: fecha(60) });
    await med('Sin fecha', {});
    await med('Dado de baja', { fechaVencimiento: fecha(5), estado: 'INACTIVO' });

    await revisarVencimientos();
    await esperarEnvios();
    // Dos medicamentos x tres destinatarios con permiso en la finca A (admin, vet, vet2).
    expect(enviador).toHaveBeenCalledTimes(6);
    expect(cargas().map((c) => c.cuerpo).sort()).toEqual(
      expect.arrayContaining([expect.stringContaining('Por vencer'), expect.stringContaining('Vencido')]),
    );
    const claves = (await prisma.avisoEnviado.findMany({ select: { clave: true } })).map((a) => a.clave).sort();
    expect(claves).toEqual(
      [
        `medicamento-vence:${porVencer.id}:porVencer:${bogota(10)}`,
        `medicamento-vence:${vencido.id}:vencido:${bogota(-1)}`,
      ].sort(),
    );

    await revisarVencimientos();
    await esperarEnvios();
    expect(enviador).toHaveBeenCalledTimes(6);
  });

  it('sin claves VAPID no hace nada', async () => {
    const e = await escenario();
    await prisma.medicamento.create({
      data: { fincaId: e.fincaA.id, nombre: 'X', tipo: 'VITAMINA', unidad: 'ML', stock: 5, stockMinimo: 1, fechaVencimiento: fecha(-3), creadoPorId: e.creadoPorId },
    });
    delete env.VAPID_PUBLIC_KEY;
    await revisarVencimientos();
    expect(enviador).not.toHaveBeenCalled();
    expect(await prisma.avisoEnviado.count()).toBe(0);
  });
});

describe('fallos del servicio de push', () => {
  const alta = (e) => ({ vacunoId: e.vacuno.id, tipo: 'ENFERMEDAD', descripcion: 'Cojera marcada', prioridad: 'ALTA' });

  it.each([404, 410])('un %i borra la suscripción y deja las demás', async (statusCode) => {
    const e = await escenario();
    configurarEnviador(
      vi.fn(async (sub) => {
        if (sub.endpoint === e.endpoints.vet) throw Object.assign(new Error('gone'), { statusCode });
      }),
    );
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(alta(e)).expect(201);
    await esperarEnvios();
    const quedan = (await prisma.suscripcionPush.findMany({ select: { endpoint: true } })).map((s) => s.endpoint);
    expect(quedan).not.toContain(e.endpoints.vet);
    expect(quedan).toContain(e.endpoints.vet2);
    expect(quedan).toContain(e.endpoints.admin);
  });

  it('un error cualquiera del enviador no cambia la respuesta de la API ni borra la suscripción', async () => {
    const e = await escenario();
    configurarEnviador(vi.fn(async () => { throw Object.assign(new Error('falla'), { statusCode: 500 }); }));
    const res = await request(app).post('/api/novedades').set(e.ayudante.bearer).send(alta(e));
    expect(res.status).toBe(201);
    await esperarEnvios();
    expect(await prisma.suscripcionPush.count()).toBe(6);
    expect(await prisma.novedad.count()).toBe(1);
  });

  it('un enviador que lanza de forma síncrona tampoco rompe nada', async () => {
    const e = await escenario();
    configurarEnviador(() => { throw new Error('síncrono'); });
    await request(app).post('/api/novedades').set(e.ayudante.bearer).send(alta(e)).expect(201);
    await esperarEnvios();
    expect(await prisma.suscripcionPush.count()).toBe(6);
  });
});

describe('sesión de otra cuenta', () => {
  it('un usuario sin suscripciones no genera envíos ni consume la clave del aviso', async () => {
    const f = await crearFinca();
    const admin = await sesionDe('ADMINISTRADOR');
    const vet = await sesionDe('VETERINARIO', [f.id]);
    const vacuno = await prisma.vacuno.create({
      data: {
        fincaId: f.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400,
        fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId: admin.usuario.id,
      },
    });
    await request(app).post('/api/novedades').set(vet.bearer).send({ vacunoId: vacuno.id, tipo: 'MUERTE', descripcion: 'Hallado sin vida', prioridad: 'ALTA' }).expect(201);
    await esperarEnvios();
    expect(enviador).not.toHaveBeenCalled();
    expect(await prisma.avisoEnviado.count()).toBe(0);
  });
});
