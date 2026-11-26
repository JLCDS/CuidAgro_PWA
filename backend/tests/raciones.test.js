import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const BASE = '/api/raciones';
const POR_DEFECTO = {
  ALIMENTACION: [25, 50, 85, 120, 150, 170, 185, 195],
  PRODUCCION: [12, 20, 28, 35, 41, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 86, 90, 95, 110],
};
const filas = (gramos) => gramos.map((gramosAveDia, i) => ({ semana: i + 1, gramosAveDia }));

async function base() {
  const finca = await crearFinca('Finca A');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  return { finca, vet, bearer: vet.bearer };
}

describe('raciones - consultar', () => {
  it('devuelve las tablas por defecto cuando la finca no tiene filas', async () => {
    const { finca, bearer } = await base();
    const res = await request(app).get(BASE).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(res.body).toEqual({
      fincaId: finca.id,
      tablas: {
        ALIMENTACION: { personalizada: false, semanas: filas(POR_DEFECTO.ALIMENTACION) },
        PRODUCCION: { personalizada: false, semanas: filas(POR_DEFECTO.PRODUCCION) },
      },
    });
  });

  it('el ayudante puede consultar', async () => {
    const { finca } = await base();
    const ayudante = await sesionDe('AYUDANTE', [finca.id]);
    await request(app).get(BASE).set(ayudante.bearer).query({ fincaId: finca.id }).expect(200);
  });

  it('400 sin fincaId o con uno mal formado; 404 con finca ajena o inexistente; 401 sin sesión', async () => {
    const { bearer } = await base();
    const otra = await crearFinca('B');
    await request(app).get(BASE).set(bearer).expect(400);
    await request(app).get(BASE).set(bearer).query({ fincaId: 'x' }).expect(400);
    await request(app).get(BASE).set(bearer).query({ fincaId: otra.id }).expect(404);
    await request(app).get(BASE).set(bearer).query({ fincaId: UUID_INEXISTENTE }).expect(404);
    await request(app).get(BASE).expect(401);
  });
});

describe('raciones - reemplazar (PUT)', () => {
  const put = (bearer, cuerpo) => request(app).put(BASE).set(bearer).send(cuerpo);

  it('reemplaza la tabla de un propósito y marca personalizada; el otro propósito sigue por defecto', async () => {
    const { finca, bearer } = await base();
    const res = await put(bearer, { fincaId: finca.id, proposito: 'ALIMENTACION', semanas: filas([30, 60, 90]) }).expect(200);
    expect(res.body.tablas.ALIMENTACION).toEqual({ personalizada: true, semanas: filas([30, 60, 90]) });
    expect(res.body.tablas.PRODUCCION.personalizada).toBe(false);
    const otra = await put(bearer, { fincaId: finca.id, proposito: 'ALIMENTACION', semanas: filas([40, 70]) }).expect(200);
    expect(otra.body.tablas.ALIMENTACION.semanas).toEqual(filas([40, 70]));
    const get = await request(app).get(BASE).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(get.body.tablas.ALIMENTACION.semanas).toEqual(filas([40, 70]));
  });

  it('acepta los límites: 1 fila, 104 filas, 1 y 400 g', async () => {
    const { finca, bearer } = await base();
    await put(bearer, { fincaId: finca.id, proposito: 'PRODUCCION', semanas: filas([1]) }).expect(200);
    await put(bearer, { fincaId: finca.id, proposito: 'PRODUCCION', semanas: filas(Array(104).fill(400)) }).expect(200);
  });

  const invalidos = [
    ['sin semanas', (f) => ({ fincaId: f, proposito: 'ALIMENTACION' })],
    ['lista vacía', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [] })],
    ['105 filas', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: filas(Array(105).fill(10)) })],
    ['no empieza en 1', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 2, gramosAveDia: 10 }] })],
    ['semanas con hueco', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 10 }, { semana: 3, gramosAveDia: 10 }] })],
    ['semanas repetidas', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 10 }, { semana: 1, gramosAveDia: 10 }] })],
    ['gramos cero', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 0 }] })],
    ['gramos 401', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 401 }] })],
    ['gramos decimales', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 10.5 }] })],
    ['semana decimal', (f) => ({ fincaId: f, proposito: 'ALIMENTACION', semanas: [{ semana: 1.5, gramosAveDia: 10 }] })],
    ['propósito inválido', (f) => ({ fincaId: f, proposito: 'ENGORDE', semanas: filas([10]) })],
    ['sin propósito', (f) => ({ fincaId: f, semanas: filas([10]) })],
    ['sin fincaId', () => ({ proposito: 'ALIMENTACION', semanas: filas([10]) })],
  ];
  it.each(invalidos)('400 VALIDACION: %s', async (_t, armar) => {
    const { finca, bearer } = await base();
    const res = await put(bearer, armar(finca.id)).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('una petición inválida no altera la tabla guardada', async () => {
    const { finca, bearer } = await base();
    await put(bearer, { fincaId: finca.id, proposito: 'ALIMENTACION', semanas: filas([30, 60]) }).expect(200);
    await put(bearer, { fincaId: finca.id, proposito: 'ALIMENTACION', semanas: [{ semana: 1, gramosAveDia: 999 }] }).expect(400);
    const get = await request(app).get(BASE).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(get.body.tablas.ALIMENTACION.semanas).toEqual(filas([30, 60]));
  });

  it('403 al ayudante y 404 en finca ajena', async () => {
    const { finca, bearer } = await base();
    const otra = await crearFinca('B');
    const ayudante = await sesionDe('AYUDANTE', [finca.id]);
    await put(ayudante.bearer, { fincaId: finca.id, proposito: 'ALIMENTACION', semanas: filas([10]) }).expect(403);
    await put(bearer, { fincaId: otra.id, proposito: 'ALIMENTACION', semanas: filas([10]) }).expect(404);
  });

  it('las tablas de una finca no afectan a otra', async () => {
    const { finca, bearer } = await base();
    const otra = await crearFinca('B');
    const admin = await sesionDe('ADMINISTRADOR');
    await put(bearer, { fincaId: finca.id, proposito: 'ALIMENTACION', semanas: filas([30]) }).expect(200);
    const res = await request(app).get(BASE).set(admin.bearer).query({ fincaId: otra.id }).expect(200);
    expect(res.body.tablas.ALIMENTACION.personalizada).toBe(false);
  });
});

describe('raciones - volver a la tabla por defecto (DELETE)', () => {
  it('204 y la tabla vuelve a ser la de por defecto', async () => {
    const { finca, bearer } = await base();
    await request(app).put(BASE).set(bearer).send({ fincaId: finca.id, proposito: 'ALIMENTACION', semanas: filas([30]) }).expect(200);
    await request(app).put(BASE).set(bearer).send({ fincaId: finca.id, proposito: 'PRODUCCION', semanas: filas([5]) }).expect(200);
    await request(app).delete(BASE).set(bearer).query({ fincaId: finca.id, proposito: 'ALIMENTACION' }).expect(204);
    const get = await request(app).get(BASE).set(bearer).query({ fincaId: finca.id }).expect(200);
    expect(get.body.tablas.ALIMENTACION).toEqual({ personalizada: false, semanas: filas(POR_DEFECTO.ALIMENTACION) });
    expect(get.body.tablas.PRODUCCION.personalizada).toBe(true);
  });

  it('es idempotente y valida los parámetros y permisos', async () => {
    const { finca, bearer } = await base();
    const otra = await crearFinca('B');
    await request(app).delete(BASE).set(bearer).query({ fincaId: finca.id, proposito: 'ALIMENTACION' }).expect(204);
    await request(app).delete(BASE).set(bearer).query({ fincaId: finca.id }).expect(400);
    await request(app).delete(BASE).set(bearer).query({ fincaId: finca.id, proposito: 'X' }).expect(400);
    await request(app).delete(BASE).set(bearer).query({ fincaId: otra.id, proposito: 'ALIMENTACION' }).expect(404);
    const ayudante = await sesionDe('AYUDANTE', [finca.id]);
    await request(app).delete(BASE).set(ayudante.bearer).query({ fincaId: finca.id, proposito: 'ALIMENTACION' }).expect(403);
  });
});
