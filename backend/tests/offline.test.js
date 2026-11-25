import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe } from './helpers.js';

// Idempotencia de los registros creados sin conexión (HU020): consumos y novedades con `clienteId`.

const bogotaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

async function escenario() {
  const finca = await crearFinca('Finca A');
  const admin = await sesionDe('ADMINISTRADOR');
  const ayudante = await sesionDe('AYUDANTE', [finca.id]);
  const otro = await sesionDe('AYUDANTE', [finca.id]);
  const vacuno = await prisma.vacuno.create({
    data: {
      fincaId: finca.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400,
      fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId: admin.usuario.id,
    },
  });
  const lote = await prisma.loteOviparo.create({
    data: {
      fincaId: finca.id, nombre: 'Lote Uno', edadMinSemanas: 1, edadMaxSemanas: 10, cantidad: 100,
      proposito: 'PRODUCCION', creadoPorId: admin.usuario.id,
    },
  });
  const alimento = await prisma.alimento.create({
    data: { fincaId: finca.id, nombre: 'Concentrado', tipo: 'CONCENTRADO', stockGramos: 100000, creadoPorId: admin.usuario.id },
  });
  return { finca, admin, ayudante, otro, vacuno, lote, alimento };
}

const stockDe = async (id) => (await prisma.alimento.findUniqueOrThrow({ where: { id } })).stockGramos;

const TIPOS = [
  { nombre: 'vacunos', ruta: '/api/consumos/vacunos', campo: 'vacunoId', sujeto: 'vacuno', tabla: 'consumoVacuno' },
  { nombre: 'lotes', ruta: '/api/consumos/lotes', campo: 'loteId', sujeto: 'lote', tabla: 'consumoLote' },
];

describe.each(TIPOS)('clienteId en consumos de $nombre', (T) => {
  const cuerpo = (e, extra = {}) => ({
    [T.campo]: e[T.sujeto].id, alimentoId: e.alimento.id, cantidadGramos: 1000, jornada: 'MANANA', fecha: bogotaHoy(), ...extra,
  });
  const enviar = (s, datos) => request(app).post(T.ruta).set(s.bearer).send(datos);

  it('201 la primera vez, 200 con el mismo registro la segunda y descuenta el stock una sola vez', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    const primera = await enviar(e.ayudante, cuerpo(e, { clienteId }));
    expect(primera.status).toBe(201);
    const segunda = await enviar(e.ayudante, cuerpo(e, { clienteId }));
    expect(segunda.status).toBe(200);
    expect(segunda.body.id).toBe(primera.body.id);
    expect(await prisma[T.tabla].count()).toBe(1);
    expect(await stockDe(e.alimento.id)).toBe(99000);
  });

  it('el reintento responde 200 aunque el cuerpo ya no sea válido (p. ej. el animal se dio de baja)', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    const primera = await enviar(e.ayudante, cuerpo(e, { clienteId }));
    expect(primera.status).toBe(201);
    const modelo = T.sujeto === 'vacuno' ? prisma.vacuno : prisma.loteOviparo;
    await modelo.update({ where: { id: e[T.sujeto].id }, data: { estado: 'INACTIVO' } });
    const segunda = await enviar(e.ayudante, cuerpo(e, { clienteId }));
    expect(segunda.status).toBe(200);
    expect(segunda.body.id).toBe(primera.body.id);
  });

  it('409 DUPLICADO en clienteId si lo usó otro usuario, sin crear ni descontar', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    await enviar(e.ayudante, cuerpo(e, { clienteId })).expect(201);
    const res = await enviar(e.otro, cuerpo(e, { clienteId, jornada: 'TARDE' }));
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('DUPLICADO');
    expect(res.body.error.detalles).toEqual([expect.objectContaining({ campo: 'clienteId' })]);
    expect(await prisma[T.tabla].count()).toBe(1);
    expect(await stockDe(e.alimento.id)).toBe(99000);
  });

  it('400 en clienteId si no es un uuid', async () => {
    const e = await escenario();
    const res = await enviar(e.ayudante, cuerpo(e, { clienteId: 'no-es-uuid' }));
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([expect.objectContaining({ campo: 'clienteId' })]);
  });

  it('sin clienteId todo sigue igual (201 cada vez que es distinto)', async () => {
    const e = await escenario();
    await enviar(e.ayudante, cuerpo(e)).expect(201);
    await enviar(e.ayudante, cuerpo(e, { jornada: 'TARDE' })).expect(201);
    expect(await stockDe(e.alimento.id)).toBe(98000);
  });

  it('envíos simultáneos con el mismo clienteId crean un solo registro y descuentan una vez', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => enviar(e.ayudante, cuerpo(e, { clienteId }))));
    const estados = respuestas.map((r) => r.status).sort();
    expect(estados.filter((s) => s === 201)).toHaveLength(1);
    expect(estados.filter((s) => s === 200)).toHaveLength(4);
    expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma[T.tabla].count()).toBe(1);
    expect(await stockDe(e.alimento.id)).toBe(99000);
  });

  it('no deja editar el clienteId con PATCH', async () => {
    const e = await escenario();
    const creado = await enviar(e.ayudante, cuerpo(e, { clienteId: randomUUID() })).expect(201);
    const nuevo = randomUUID();
    await request(app).patch(`${T.ruta}/${creado.body.id}`).set(e.ayudante.bearer).send({ clienteId: nuevo }).expect(200);
    const fila = await prisma[T.tabla].findUniqueOrThrow({ where: { id: creado.body.id } });
    expect(fila.clienteId).not.toBe(nuevo);
  });
});

describe('clienteId en novedades', () => {
  const cuerpo = (e, extra = {}) => ({ loteId: e.lote.id, tipo: 'LESION', descripcion: 'Ave con una pata herida', ...extra });
  const enviar = (s, datos) => request(app).post('/api/novedades').set(s.bearer).send(datos);

  it('201 la primera vez y 200 con la misma novedad después', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    const primera = await enviar(e.ayudante, cuerpo(e, { clienteId }));
    expect(primera.status).toBe(201);
    const segunda = await enviar(e.ayudante, cuerpo(e, { clienteId }));
    expect(segunda.status).toBe(200);
    expect(segunda.body.id).toBe(primera.body.id);
    expect(await prisma.novedad.count()).toBe(1);
  });

  it('409 si es de otro usuario y 400 si no es uuid', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    await enviar(e.ayudante, cuerpo(e, { clienteId })).expect(201);
    const ajeno = await enviar(e.otro, cuerpo(e, { clienteId }));
    expect(ajeno.status).toBe(409);
    expect(ajeno.body.error.detalles).toEqual([expect.objectContaining({ campo: 'clienteId' })]);
    const malo = await enviar(e.ayudante, cuerpo(e, { clienteId: '123' }));
    expect(malo.status).toBe(400);
    expect(malo.body.error.detalles).toEqual([expect.objectContaining({ campo: 'clienteId' })]);
    expect(await prisma.novedad.count()).toBe(1);
  });

  it('envíos simultáneos con el mismo clienteId crean una sola novedad', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => enviar(e.ayudante, cuerpo(e, { clienteId }))));
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(4);
    expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.novedad.count()).toBe(1);
  });

  it('multipart con clienteId, fechaHora y foto: idempotente y sin foto duplicada', async () => {
    const e = await escenario();
    const clienteId = randomUUID();
    const capturada = new Date(Date.now() - 3 * 3600_000).toISOString();
    const subir = () =>
      request(app)
        .post('/api/novedades')
        .set(e.ayudante.bearer)
        .field('loteId', e.lote.id)
        .field('tipo', 'LESION')
        .field('descripcion', 'Con foto adjunta')
        .field('clienteId', clienteId)
        .field('fechaHora', capturada)
        .field('latitud', '4.711')
        .field('longitud', '-74.072')
        .attach('foto', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    const primera = await subir();
    expect(primera.status).toBe(201);
    expect(primera.body).toMatchObject({ tieneFoto: true, fechaHora: capturada });
    const segunda = await subir();
    expect(segunda.status).toBe(200);
    expect(segunda.body.id).toBe(primera.body.id);
    expect(await prisma.novedad.count()).toBe(1);
  });

  it('multipart con clienteId que no es uuid responde 400', async () => {
    const e = await escenario();
    const res = await request(app)
      .post('/api/novedades')
      .set(e.ayudante.bearer)
      .field('loteId', e.lote.id)
      .field('tipo', 'LESION')
      .field('descripcion', 'Con foto adjunta')
      .field('clienteId', 'xyz')
      .attach('foto', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([expect.objectContaining({ campo: 'clienteId' })]);
  });
});
