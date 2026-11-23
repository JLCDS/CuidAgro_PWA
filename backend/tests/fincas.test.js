import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

describe('fincas y aislamiento (regla 11)', () => {
  it('el administrador crea, edita y ve todas', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const res = await request(app)
      .post('/api/fincas')
      .set(bearer)
      .send({ nombre: 'La Esperanza', ubicacion: 'Tunja' })
      .expect(201);
    await request(app).patch(`/api/fincas/${res.body.id}`).set(bearer).send({ descripcion: 'Doble propósito' }).expect(200);
    await crearFinca('Otra');

    const lista = await request(app).get('/api/fincas').set(bearer).expect(200);
    expect(lista.body).toHaveLength(2);
    expect(lista.body[0]).toMatchObject({ nombre: 'La Esperanza', ubicacion: 'Tunja', descripcion: 'Doble propósito' });
  });

  it('valida el nombre en el backend', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await request(app).post('/api/fincas').set(bearer).send({ nombre: ' ' }).expect(400);
  });

  it('cada usuario solo ve sus fincas', async () => {
    const mia = await crearFinca('Mía');
    await crearFinca('Ajena');
    const { bearer } = await sesionDe('VETERINARIO', [mia.id]);
    const lista = await request(app).get('/api/fincas').set(bearer).expect(200);
    expect(lista.body.map((f) => f.id)).toEqual([mia.id]);
    await request(app).get(`/api/fincas/${mia.id}`).set(bearer).expect(200);
  });

  it('una finca ajena responde 404, igual que una inexistente', async () => {
    const [mia, ajena] = [await crearFinca('Mía'), await crearFinca('Ajena')];
    const { bearer } = await sesionDe('AYUDANTE', [mia.id]);
    const res = await request(app).get(`/api/fincas/${ajena.id}`).set(bearer).expect(404);
    const nada = await request(app).get(`/api/fincas/${UUID_INEXISTENTE}`).set(bearer).expect(404);
    expect(res.body).toEqual(nada.body);
  });
});
