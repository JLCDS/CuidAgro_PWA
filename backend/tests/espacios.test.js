import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { edadActual, gramosAveDia, racionSugerida } from '../src/modules/raciones/raciones.calculo.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const ESPACIOS = '/api/espacios';
const LOTES = '/api/lotes';

const bogota = (desplazamientoDias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + desplazamientoDias);
  return d.toISOString().slice(0, 10);
};

const espacioValido = (fincaId, extra = {}) => ({ fincaId, codigo: 'G1-C1', nombre: 'Cuadrante 1', tipo: 'CUADRANTE', capacidad: 80, ...extra });
const loteValido = (fincaId, extra = {}) => ({
  fincaId, nombre: 'Lote 1', edadMinSemanas: 0, edadMaxSemanas: 0, cantidad: 75, proposito: 'ALIMENTACION', ...extra,
});

async function crearEspacio(bearer, fincaId, extra = {}) {
  return (await request(app).post(ESPACIOS).set(bearer).send(espacioValido(fincaId, extra)).expect(201)).body;
}
async function crearLote(bearer, fincaId, extra = {}) {
  return (await request(app).post(LOTES).set(bearer).send(loteValido(fincaId, extra)).expect(201)).body;
}

async function base() {
  const finca = await crearFinca('Finca A');
  const otra = await crearFinca('Finca B');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  return { finca, otra, vet, bearer: vet.bearer };
}

describe('espacios - crear y validar', () => {
  it('crea un espacio con la forma esperada y lo guarda en mayúsculas', async () => {
    const { finca, bearer } = await base();
    const res = await request(app).post(ESPACIOS).set(bearer).send(espacioValido(finca.id, { codigo: '  g1-c1 ', observaciones: 'Fondo' })).expect(201);
    expect(res.body).toMatchObject({
      fincaId: finca.id, codigo: 'G1-C1', nombre: 'Cuadrante 1', tipo: 'CUADRANTE', capacidad: 80,
      estado: 'ACTIVO', motivoBaja: null, observaciones: 'Fondo', loteActual: null,
    });
    expect(res.body.id).toBeTruthy();
  });

  it('nombre, capacidad y observaciones son opcionales', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id, { nombre: undefined, capacidad: undefined });
    expect(e.nombre).toBeNull();
    expect(e.capacidad).toBeNull();
  });

  it('el administrador puede crear en cualquier finca', async () => {
    const finca = await crearFinca();
    const admin = await sesionDe('ADMINISTRADOR');
    await crearEspacio(admin.bearer, finca.id);
  });

  const invalidos = [
    ['sin código', { codigo: undefined }],
    ['código vacío', { codigo: '   ' }],
    ['código con espacios internos', { codigo: 'G1 C1' }],
    ['código con símbolos', { codigo: 'G1_C1' }],
    ['código que empieza con guion', { codigo: '-G1' }],
    ['código de 21 caracteres', { codigo: 'A'.repeat(21) }],
    ['sin tipo', { tipo: undefined }],
    ['tipo inválido', { tipo: 'GALPON' }],
    ['capacidad cero', { capacidad: 0 }],
    ['capacidad mayor a 100000', { capacidad: 100001 }],
    ['capacidad decimal', { capacidad: 10.5 }],
    ['nombre de 81 caracteres', { nombre: 'x'.repeat(81) }],
    ['observaciones de 1001 caracteres', { observaciones: 'x'.repeat(1001) }],
  ];
  it.each(invalidos)('400 VALIDACION: %s', async (_t, extra) => {
    const { finca, bearer } = await base();
    const res = await request(app).post(ESPACIOS).set(bearer).send(espacioValido(finca.id, extra)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('acepta códigos de 1 y 20 caracteres', async () => {
    const { finca, bearer } = await base();
    await crearEspacio(bearer, finca.id, { codigo: 'A' });
    await crearEspacio(bearer, finca.id, { codigo: 'Z'.repeat(20) });
  });

  it('409 con campo codigo si el código se repite en la finca (sin distinguir mayúsculas)', async () => {
    const { finca, bearer } = await base();
    await crearEspacio(bearer, finca.id);
    const res = await request(app).post(ESPACIOS).set(bearer).send(espacioValido(finca.id, { codigo: 'g1-c1' })).expect(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
    expect(res.body.error.mensaje).toBe('Ya existe un espacio con el código G1-C1 en esta finca');
    expect(res.body.error.detalles).toEqual([{ campo: 'codigo', mensaje: 'Ya existe un espacio con el código G1-C1 en esta finca' }]);
  });

  it('el mismo código en otra finca es permitido', async () => {
    const finca = await crearFinca('A');
    const otra = await crearFinca('B');
    const { bearer } = await sesionDe('VETERINARIO', [finca.id, otra.id]);
    await crearEspacio(bearer, finca.id);
    await crearEspacio(bearer, otra.id);
  });

  it('404 al crear en una finca ajena o inexistente', async () => {
    const { otra, bearer } = await base();
    await request(app).post(ESPACIOS).set(bearer).send(espacioValido(otra.id)).expect(404);
    await request(app).post(ESPACIOS).set(bearer).send(espacioValido(UUID_INEXISTENTE)).expect(404);
  });
});

describe('espacios - consultar, editar y baja', () => {
  it('lista solo los activos por defecto, ordenados por código en orden natural', async () => {
    const { finca, bearer } = await base();
    for (const codigo of ['G1-C10', 'G1-C2', 'G1-C1']) await crearEspacio(bearer, finca.id, { codigo });
    const baja = await crearEspacio(bearer, finca.id, { codigo: 'G1-Z1', tipo: 'ZONA' });
    await request(app).patch(`${ESPACIOS}/${baja.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Cerrado' }).expect(200);

    const res = await request(app).get(ESPACIOS).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(res.body.datos.map((e) => e.codigo)).toEqual(['G1-C1', 'G1-C2', 'G1-C10']);

    const inactivos = await request(app).get(ESPACIOS).set(bearer).query({ fincaId: finca.id, estado: 'INACTIVO' }).expect(200);
    expect(inactivos.body.datos.map((e) => e.codigo)).toEqual(['G1-Z1']);
    expect(inactivos.body.datos[0].motivoBaja).toBe('Cerrado');

    const zonas = await request(app).get(ESPACIOS).set(bearer).query({ fincaId: finca.id, estado: 'TODOS', tipo: 'ZONA' }).expect(200);
    expect(zonas.body.datos.map((e) => e.codigo)).toEqual(['G1-Z1']);
  });

  it('el listado sin fincaId solo trae las fincas del usuario', async () => {
    const { finca, otra, bearer } = await base();
    await crearEspacio(bearer, finca.id);
    const admin = await sesionDe('ADMINISTRADOR');
    await crearEspacio(admin.bearer, otra.id, { codigo: 'X1' });
    const res = await request(app).get(ESPACIOS).set(bearer).expect(200);
    expect(res.body.datos.map((e) => e.codigo)).toEqual(['G1-C1']);
  });

  it('GET por id: 200, 404 inexistente, 404 id mal formado y 404 de otra finca', async () => {
    const { finca, otra, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    await request(app).get(`${ESPACIOS}/${e.id}`).set(bearer).expect(200);
    await request(app).get(`${ESPACIOS}/${UUID_INEXISTENTE}`).set(bearer).expect(404);
    await request(app).get(`${ESPACIOS}/abc`).set(bearer).expect(404);
    const admin = await sesionDe('ADMINISTRADOR');
    const ajeno = await crearEspacio(admin.bearer, otra.id, { codigo: 'X1' });
    await request(app).get(`${ESPACIOS}/${ajeno.id}`).set(bearer).expect(404);
    await request(app).patch(`${ESPACIOS}/${ajeno.id}`).set(bearer).send({ nombre: 'Hack' }).expect(404);
    await request(app).patch(`${ESPACIOS}/${ajeno.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(404);
  });

  it('PATCH edita campos parciales, normaliza el código y no cambia la finca', async () => {
    const { finca, otra, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const res = await request(app).patch(`${ESPACIOS}/${e.id}`).set(bearer).send({ codigo: 'g1-c9', capacidad: null, fincaId: otra.id }).expect(200);
    expect(res.body).toMatchObject({ codigo: 'G1-C9', capacidad: null, fincaId: finca.id, nombre: 'Cuadrante 1' });
  });

  it('PATCH con un código ya usado responde 409 y conservar el propio código es válido', async () => {
    const { finca, bearer } = await base();
    await crearEspacio(bearer, finca.id, { codigo: 'G1-C1' });
    const otro = await crearEspacio(bearer, finca.id, { codigo: 'G1-C2' });
    const res = await request(app).patch(`${ESPACIOS}/${otro.id}`).set(bearer).send({ codigo: 'g1-c1' }).expect(409);
    expect(res.body.error.detalles[0].campo).toBe('codigo');
    await request(app).patch(`${ESPACIOS}/${otro.id}`).set(bearer).send({ codigo: 'g1-c2' }).expect(200);
  });

  it('dar de baja y reactivar un espacio libre', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const baja = await request(app).patch(`${ESPACIOS}/${e.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Reparación' }).expect(200);
    expect(baja.body).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'Reparación' });
    const alta = await request(app).patch(`${ESPACIOS}/${e.id}/estado`).set(bearer).send({ estado: 'ACTIVO' }).expect(200);
    expect(alta.body).toMatchObject({ estado: 'ACTIVO', motivoBaja: null });
    await request(app).patch(`${ESPACIOS}/${e.id}/estado`).set(bearer).send({ estado: 'OTRO' }).expect(400);
  });

  it('no deja dar de baja un espacio ocupado (409) y sí cuando el lote sale', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const lote = await crearLote(bearer, finca.id, { nombre: 'Lote X', espacioId: e.id });
    const res = await request(app).patch(`${ESPACIOS}/${e.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(409);
    expect(res.body.error.mensaje).toBe('El espacio G1-C1 tiene el lote activo Lote X; muévelo o dalo de baja primero');
    await request(app).patch(`${LOTES}/${lote.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
    await request(app).patch(`${ESPACIOS}/${e.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
  });

  it('muestra el lote actual con su edad', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    await crearLote(bearer, finca.id, { espacioId: e.id, fechaIngreso: bogota(-23) });
    const res = await request(app).get(`${ESPACIOS}/${e.id}`).set(bearer).expect(200);
    expect(res.body.loteActual).toMatchObject({
      nombre: 'Lote 1', cantidad: 75, proposito: 'ALIMENTACION', fechaIngreso: bogota(-23),
      edadActual: { minSemanas: 3, maxSemanas: 3, semanaVida: 4 },
    });
  });
});

describe('espacios - permisos', () => {
  it('el ayudante consulta pero no crea, edita ni da de baja', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const ayudante = await sesionDe('AYUDANTE', [finca.id]);
    await request(app).get(ESPACIOS).set(ayudante.bearer).query({ fincaId: finca.id }).expect(200);
    await request(app).get(`${ESPACIOS}/${e.id}`).set(ayudante.bearer).expect(200);
    await request(app).post(ESPACIOS).set(ayudante.bearer).send(espacioValido(finca.id, { codigo: 'Z9' })).expect(403);
    await request(app).patch(`${ESPACIOS}/${e.id}`).set(ayudante.bearer).send({ nombre: 'x' }).expect(403);
    await request(app).patch(`${ESPACIOS}/${e.id}/estado`).set(ayudante.bearer).send({ estado: 'INACTIVO' }).expect(403);
  });

  it('401 sin sesión', async () => {
    await request(app).get(ESPACIOS).expect(401);
  });
});

describe('espacios - lotes: asignar, mover y liberar', () => {
  it('crea un lote con espacio y devuelve espacio, edadActual y racionSugerida', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const lote = await crearLote(bearer, finca.id, { espacioId: e.id, fechaIngreso: bogota(-23) });
    expect(lote.espacio).toEqual({ id: e.id, codigo: 'G1-C1' });
    expect(lote.edadActual).toEqual({ minSemanas: 3, maxSemanas: 3, semanaVida: 4 });
    expect(lote.racionSugerida).toEqual({ semanaVida: 4, gramosAveDia: 120, gramosDia: 9000 });
  });

  it('sin espacio: espacio es null; la ración usa la tabla de ponedoras para PRODUCCION', async () => {
    const { finca, bearer } = await base();
    const lote = await crearLote(bearer, finca.id, { proposito: 'PRODUCCION', edadMinSemanas: 18, edadMaxSemanas: 20, cantidad: 100, fechaIngreso: bogota() });
    expect(lote.espacio).toBeNull();
    expect(lote.edadActual).toEqual({ minSemanas: 18, maxSemanas: 20, semanaVida: 19 });
    expect(lote.racionSugerida).toEqual({ semanaVida: 19, gramosAveDia: 110, gramosDia: 11000 });
  });

  it('pasada la última semana usa la última fila', async () => {
    const { finca, bearer } = await base();
    const lote = await crearLote(bearer, finca.id, { edadMinSemanas: 30, edadMaxSemanas: 30, cantidad: 10 });
    expect(lote.racionSugerida).toEqual({ semanaVida: 31, gramosAveDia: 195, gramosDia: 1950 });
  });

  it('usa la tabla personalizada de la finca si existe', async () => {
    const { finca, bearer } = await base();
    await request(app).put('/api/raciones').set(bearer).send({
      fincaId: finca.id, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 30 }, { semana: 2, gramosAveDia: 60 }],
    }).expect(200);
    const lote = await crearLote(bearer, finca.id, { edadMinSemanas: 0, edadMaxSemanas: 0, cantidad: 10, fechaIngreso: bogota(-8) });
    expect(lote.racionSugerida).toEqual({ semanaVida: 2, gramosAveDia: 60, gramosDia: 600 });
    const larga = await crearLote(bearer, finca.id, { nombre: 'Lote 2', edadMinSemanas: 9, edadMaxSemanas: 9, cantidad: 10 });
    expect(larga.racionSugerida.gramosAveDia).toBe(60);
  });

  it('sin fechaIngreso la semana de vida parte de la fecha de alta', async () => {
    const { finca, bearer } = await base();
    const lote = await crearLote(bearer, finca.id, { edadMinSemanas: 2, edadMaxSemanas: 3 });
    expect(lote.edadActual).toEqual({ minSemanas: 2, maxSemanas: 3, semanaVida: 3 });
  });

  it('400 con espacio de otra finca, inexistente o dado de baja', async () => {
    const { finca, otra, bearer } = await base();
    const admin = await sesionDe('ADMINISTRADOR');
    const ajeno = await crearEspacio(admin.bearer, otra.id, { codigo: 'X1' });
    for (const espacioId of [ajeno.id, UUID_INEXISTENTE]) {
      const res = await request(app).post(LOTES).set(bearer).send(loteValido(finca.id, { espacioId })).expect(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'espacioId', mensaje: 'Selecciona un espacio válido' }]);
    }
    const baja = await crearEspacio(bearer, finca.id, { codigo: 'B1' });
    await request(app).patch(`${ESPACIOS}/${baja.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
    const res = await request(app).post(LOTES).set(bearer).send(loteValido(finca.id, { espacioId: baja.id })).expect(400);
    expect(res.body.error.detalles[0]).toEqual({ campo: 'espacioId', mensaje: 'El espacio está dado de baja' });
    await request(app).post(LOTES).set(bearer).send(loteValido(finca.id, { espacioId: 'no-uuid' })).expect(400);
  });

  it('409 si el espacio ya tiene otro lote activo', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    await crearLote(bearer, finca.id, { nombre: 'Lote A', espacioId: e.id });
    const res = await request(app).post(LOTES).set(bearer).send(loteValido(finca.id, { nombre: 'Lote B', espacioId: e.id })).expect(409);
    expect(res.body.error.detalles).toEqual([{ campo: 'espacioId', mensaje: 'El espacio G1-C1 ya tiene el lote Lote A' }]);
  });

  it('mover un lote libera el espacio anterior y ocupa el nuevo', async () => {
    const { finca, bearer } = await base();
    const c1 = await crearEspacio(bearer, finca.id, { codigo: 'G1-C1' });
    const c2 = await crearEspacio(bearer, finca.id, { codigo: 'G1-C2' });
    const lote = await crearLote(bearer, finca.id, { espacioId: c1.id });
    await crearLote(bearer, finca.id, { nombre: 'Lote 2', espacioId: c2.id });

    const choque = await request(app).patch(`${LOTES}/${lote.id}`).set(bearer).send({ espacioId: c2.id }).expect(409);
    expect(choque.body.error.detalles[0].campo).toBe('espacioId');

    await request(app).patch(`${LOTES}/${lote.id}`).set(bearer).send({ espacioId: null }).expect(200);
    const libre = await request(app).get(`${ESPACIOS}/${c1.id}`).set(bearer).expect(200);
    expect(libre.body.loteActual).toBeNull();

    const movido = await request(app).patch(`${LOTES}/${lote.id}`).set(bearer).send({ espacioId: c1.id }).expect(200);
    expect(movido.body.espacio).toEqual({ id: c1.id, codigo: 'G1-C1' });
  });

  it('PATCH con el mismo espacio no choca consigo mismo', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const lote = await crearLote(bearer, finca.id, { espacioId: e.id });
    await request(app).patch(`${LOTES}/${lote.id}`).set(bearer).send({ espacioId: e.id, cantidad: 70 }).expect(200);
  });

  it('un espacio de otra finca no se puede asignar al editar (400)', async () => {
    const { finca, otra, bearer } = await base();
    const admin = await sesionDe('ADMINISTRADOR');
    const ajeno = await crearEspacio(admin.bearer, otra.id, { codigo: 'X1' });
    const lote = await crearLote(bearer, finca.id);
    await request(app).patch(`${LOTES}/${lote.id}`).set(bearer).send({ espacioId: ajeno.id }).expect(400);
  });

  it('la baja del lote libera el espacio y otro lote puede entrar', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const viejo = await crearLote(bearer, finca.id, { nombre: 'Viejo', espacioId: e.id });
    await request(app).patch(`${LOTES}/${viejo.id}/estado`).set(bearer).send({ estado: 'INACTIVO', motivoBaja: 'Salida' }).expect(200);
    const libre = await request(app).get(`${ESPACIOS}/${e.id}`).set(bearer).expect(200);
    expect(libre.body.loteActual).toBeNull();
    const nuevo = await crearLote(bearer, finca.id, { nombre: 'Nuevo', espacioId: e.id });
    expect(nuevo.espacio.codigo).toBe('G1-C1');
  });

  it('reactivar un lote cuyo espacio quedó ocupado responde 409; con el espacio libre, 200', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const viejo = await crearLote(bearer, finca.id, { nombre: 'Viejo', espacioId: e.id });
    await request(app).patch(`${LOTES}/${viejo.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
    const nuevo = await crearLote(bearer, finca.id, { nombre: 'Nuevo', espacioId: e.id });
    const res = await request(app).patch(`${LOTES}/${viejo.id}/estado`).set(bearer).send({ estado: 'ACTIVO' }).expect(409);
    expect(res.body.error.detalles).toEqual([{ campo: 'espacioId', mensaje: 'El espacio G1-C1 ya tiene el lote Nuevo' }]);
    await request(app).patch(`${LOTES}/${nuevo.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
    await request(app).patch(`${LOTES}/${viejo.id}/estado`).set(bearer).send({ estado: 'ACTIVO' }).expect(200);
  });

  it('el índice único parcial frena la carrera: dos lotes activos en el mismo espacio', async () => {
    const { finca, bearer, vet } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const data = (nombre) => ({
      fincaId: finca.id, nombre, edadMinSemanas: 0, edadMaxSemanas: 0, cantidad: 5, proposito: 'ALIMENTACION',
      espacioId: e.id, creadoPorId: vet.usuario.id,
    });
    await prisma.loteOviparo.create({ data: data('A') });
    await expect(prisma.loteOviparo.create({ data: data('B') })).rejects.toMatchObject({ code: 'P2002' });
    // Un lote inactivo no cuenta.
    await prisma.loteOviparo.create({ data: { ...data('C'), estado: 'INACTIVO' } });
  });

  it('GET /api/lotes filtra por espacioId', async () => {
    const { finca, bearer } = await base();
    const c1 = await crearEspacio(bearer, finca.id, { codigo: 'G1-C1' });
    const c2 = await crearEspacio(bearer, finca.id, { codigo: 'G1-C2' });
    await crearLote(bearer, finca.id, { nombre: 'En C1', espacioId: c1.id });
    await crearLote(bearer, finca.id, { nombre: 'En C2', espacioId: c2.id });
    await crearLote(bearer, finca.id, { nombre: 'Sin espacio' });
    const res = await request(app).get(LOTES).set(bearer).query({ fincaId: finca.id, espacioId: c2.id }).expect(200);
    expect(res.body.map((l) => l.nombre)).toEqual(['En C2']);
    await request(app).get(LOTES).set(bearer).query({ espacioId: 'x' }).expect(400);
  });

  it('el ayudante no asigna espacios (403) pero ve la ración sugerida', async () => {
    const { finca, bearer } = await base();
    const e = await crearEspacio(bearer, finca.id);
    const lote = await crearLote(bearer, finca.id);
    const ayudante = await sesionDe('AYUDANTE', [finca.id]);
    await request(app).patch(`${LOTES}/${lote.id}`).set(ayudante.bearer).send({ espacioId: e.id }).expect(403);
    const lista = await request(app).get(LOTES).set(ayudante.bearer).query({ fincaId: finca.id }).expect(200);
    expect(lista.body[0]).toHaveProperty('racionSugerida');
  });
});

describe('espacios - consumos de lotes: instantánea del espacio', () => {
  async function alimento(bearer, fincaId) {
    return (await request(app).post('/api/alimentos').set(bearer).send({ fincaId, nombre: 'Concentrado', tipo: 'CONCENTRADO', stockInicialGramos: 100000 }).expect(201)).body;
  }

  it('guarda el espacio del lote, ignora el que envíe el cliente y no cambia al mover el lote', async () => {
    const { finca, bearer } = await base();
    const c1 = await crearEspacio(bearer, finca.id, { codigo: 'G1-C1' });
    const c2 = await crearEspacio(bearer, finca.id, { codigo: 'G1-C2' });
    const lote = await crearLote(bearer, finca.id, { espacioId: c1.id });
    const al = await alimento(bearer, finca.id);

    const creado = await request(app).post('/api/consumos/lotes').set(bearer).send({
      loteId: lote.id, alimentoId: al.id, cantidadGramos: 9000, jornada: 'MANANA', fecha: bogota(), espacioId: c2.id,
    }).expect(201);
    expect(creado.body.espacio).toEqual({ id: c1.id, codigo: 'G1-C1' });

    await request(app).patch(`${LOTES}/${lote.id}`).set(bearer).send({ espacioId: c2.id }).expect(200);
    const nuevo = await request(app).post('/api/consumos/lotes').set(bearer).send({
      loteId: lote.id, alimentoId: al.id, cantidadGramos: 8000, jornada: 'TARDE', fecha: bogota(),
    }).expect(201);
    expect(nuevo.body.espacio.codigo).toBe('G1-C2');

    const viejo = await request(app).get(`/api/consumos/lotes/${creado.body.id}`).set(bearer).expect(200);
    expect(viejo.body.espacio.codigo).toBe('G1-C1');
    const editado = await request(app).patch(`/api/consumos/lotes/${creado.body.id}`).set(bearer).send({ cantidadGramos: 9500 }).expect(200);
    expect(editado.body.espacio.codigo).toBe('G1-C1');
    const lista = await request(app).get('/api/consumos/lotes').set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(lista.body.map((c) => c.espacio.codigo).sort()).toEqual(['G1-C1', 'G1-C2']);
  });

  it('un lote sin espacio produce consumos con espacio null', async () => {
    const { finca, bearer } = await base();
    const lote = await crearLote(bearer, finca.id);
    const al = await alimento(bearer, finca.id);
    const res = await request(app).post('/api/consumos/lotes').set(bearer).send({
      loteId: lote.id, alimentoId: al.id, cantidadGramos: 100, jornada: 'MANANA', fecha: bogota(),
    }).expect(201);
    expect(res.body.espacio).toBeNull();
  });

  it('los consumos de vacunos no llevan espacio', async () => {
    const { finca, bearer } = await base();
    const v = (await request(app).post('/api/vacunos').set(bearer).send({
      fincaId: finca.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400, fechaLlegada: '2026-01-01', proposito: 'ENGORDE',
    }).expect(201)).body;
    const al = await alimento(bearer, finca.id);
    const res = await request(app).post('/api/consumos/vacunos').set(bearer).send({
      vacunoId: v.id, alimentoId: al.id, cantidadGramos: 100, jornada: 'MANANA', fecha: bogota(),
    }).expect(201);
    expect(res.body).not.toHaveProperty('espacio');
  });
});

describe('espacios - cálculo de edad y ración con fechas controladas', () => {
  const lote = (extra = {}) => ({
    edadMinSemanas: 0, edadMaxSemanas: 0, cantidad: 100, fechaIngreso: new Date('2026-11-03T00:00:00Z'), createdAt: new Date('2026-11-03T15:00:00Z'), ...extra,
  });

  it('pollitos de un día ingresados hace 23 días: mínima 3 y semana 4', () => {
    expect(edadActual(lote(), '2026-11-26')).toEqual({ minSemanas: 3, maxSemanas: 3, semanaVida: 4 });
  });

  it('el día del ingreso es la semana 1 y a los 7 días empieza la 2', () => {
    expect(edadActual(lote(), '2026-11-03').semanaVida).toBe(1);
    expect(edadActual(lote(), '2026-11-09').semanaVida).toBe(1);
    expect(edadActual(lote(), '2026-11-10').semanaVida).toBe(2);
  });

  it('suma la edad al ingreso y no es negativa con fechas futuras', () => {
    expect(edadActual(lote({ edadMinSemanas: 18, edadMaxSemanas: 20 }), '2026-11-24')).toEqual({ minSemanas: 21, maxSemanas: 23, semanaVida: 22 });
    expect(edadActual(lote(), '2026-10-01')).toEqual({ minSemanas: 0, maxSemanas: 0, semanaVida: 1 });
  });

  it('sin fechaIngreso usa la fecha de alta en Bogotá (en la noche de Bogotá ya es otro día en UTC)', () => {
    const l = lote({ fechaIngreso: null, createdAt: new Date('2026-11-04T03:00:00Z') });
    expect(edadActual(l, '2026-11-09').semanaVida).toBe(1);
    expect(edadActual(l, '2026-11-10').semanaVida).toBe(2);
  });

  it('gramosAveDia repite la última fila y racionSugerida multiplica por las aves', () => {
    expect(gramosAveDia([25, 50], 1)).toBe(25);
    expect(gramosAveDia([25, 50], 2)).toBe(50);
    expect(gramosAveDia([25, 50], 99)).toBe(50);
    expect(racionSugerida(lote({ cantidad: 75 }), [25, 50, 85, 120], '2026-11-26')).toEqual({
      semanaVida: 4, gramosAveDia: 120, gramosDia: 9000,
    });
  });
});
