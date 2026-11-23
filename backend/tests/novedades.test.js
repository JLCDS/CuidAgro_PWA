import { readdirSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(16, 3)]);
const FALSO = Buffer.from('esto es texto plano que finge ser una imagen, no tiene bytes mágicos');

const archivosEnDisco = () => readdirSync(env.UPLOADS_DIR);

async function escenario() {
  const finca = await crearFinca('Finca A');
  const otraFinca = await crearFinca('Finca B');
  const admin = await sesionDe('ADMINISTRADOR');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  const ayudante = await sesionDe('AYUDANTE', [finca.id]);
  const otroAyudante = await sesionDe('AYUDANTE', [finca.id]);
  const ajeno = await sesionDe('AYUDANTE', [otraFinca.id]);
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
  return { finca, otraFinca, admin, vet, ayudante, otroAyudante, ajeno, vacuno, lote };
}

const base = (e) => ({ loteId: e.lote.id, tipo: 'ENFERMEDAD', descripcion: 'Aves con plumas erizadas' });
const crear = (sesion, cuerpo) => request(app).post('/api/novedades').set(sesion.bearer).send(cuerpo);

describe('Permisos', () => {
  it('sin token responde 401 en cada ruta', async () => {
    const rutas = [
      ['get', '/api/novedades'],
      ['get', `/api/novedades/${UUID_INEXISTENTE}`],
      ['post', '/api/novedades'],
      ['patch', `/api/novedades/${UUID_INEXISTENTE}`],
      ['put', `/api/novedades/${UUID_INEXISTENTE}/foto`],
      ['delete', `/api/novedades/${UUID_INEXISTENTE}/foto`],
      ['get', `/api/novedades/${UUID_INEXISTENTE}/foto`],
      ['patch', `/api/novedades/${UUID_INEXISTENTE}/estado`],
      ['post', `/api/novedades/${UUID_INEXISTENTE}/comentarios`],
    ];
    for (const [metodo, ruta] of rutas) {
      expect((await request(app)[metodo](ruta)).status, `${metodo} ${ruta}`).toBe(401);
    }
  });

  it('los tres roles registran, consultan y comentan; solo admin y veterinario cambian el estado', async () => {
    const e = await escenario();
    for (const s of [e.admin, e.vet, e.ayudante]) {
      const res = await crear(s, base(e));
      expect(res.status).toBe(201);
      expect((await request(app).get('/api/novedades').set(s.bearer)).status).toBe(200);
      expect((await request(app).post(`/api/novedades/${res.body.id}/comentarios`).set(s.bearer).send({ texto: 'Hola' })).status).toBe(201);
    }
    const { body } = await crear(e.ayudante, base(e));
    const url = `/api/novedades/${body.id}/estado`;
    expect((await request(app).patch(url).set(e.ayudante.bearer).send({ estado: 'CERRADA' })).status).toBe(403);
    expect((await request(app).patch(url).set(e.vet.bearer).send({ estado: 'EN_SEGUIMIENTO' })).status).toBe(200);
    expect((await request(app).patch(url).set(e.admin.bearer).send({ estado: 'ABIERTA' })).status).toBe(200);
  });
});

describe('POST /api/novedades', () => {
  it('crea sobre un lote con valores por defecto y respuesta completa', async () => {
    const e = await escenario();
    const res = await crear(e.ayudante, { ...base(e), latitud: 4.711, longitud: -74.0721, precisionMetros: 12 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      loteId: e.lote.id, vacunoId: null, tipo: 'ENFERMEDAD', prioridad: 'MEDIA', estado: 'ABIERTA', cerradaEn: null,
      latitud: 4.711, longitud: -74.0721, precisionMetros: 12, tieneFoto: false, fotoUrl: null, totalComentarios: 0,
      lote: { id: e.lote.id, nombre: 'Lote Uno' }, vacuno: null, finca: { id: e.finca.id, nombre: 'Finca A' },
      registradoPor: { id: e.ayudante.usuario.id },
    });
    expect(res.body).not.toHaveProperty('fotoArchivo');
    expect(new Date(res.body.fechaHora).getTime()).toBeGreaterThan(Date.now() - 10_000);
  });

  it('crea sobre un vacuno', async () => {
    const e = await escenario();
    const res = await crear(e.vet, { vacunoId: e.vacuno.id, tipo: 'LESION', prioridad: 'ALTA', descripcion: 'Cojera pata trasera' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vacunoId: e.vacuno.id, loteId: null, vacuno: { nombre: 'Lucero' }, lote: null, prioridad: 'ALTA' });
  });

  it('exige exactamente uno de vacuno o lote', async () => {
    const e = await escenario();
    const ambos = await crear(e.vet, { ...base(e), vacunoId: e.vacuno.id });
    expect(ambos.status).toBe(400);
    expect(ambos.body.error.codigo).toBe('VALIDACION');
    const ninguno = await crear(e.vet, { tipo: 'OTRO', descripcion: 'Sin sujeto alguno' });
    expect(ninguno.status).toBe(400);
  });

  it('valida campos y rangos', async () => {
    const e = await escenario();
    const casos = [
      [{ descripcion: 'abc' }, 'descripcion'],
      [{ descripcion: 'x'.repeat(2001) }, 'descripcion'],
      [{ tipo: 'NOEXISTE' }, 'tipo'],
      [{ prioridad: 'URGENTE' }, 'prioridad'],
      [{ latitud: 91, longitud: 0 }, 'latitud'],
      [{ latitud: 0, longitud: 181 }, 'longitud'],
      [{ latitud: 4.5 }, 'longitud'],
      [{ longitud: -74 }, 'latitud'],
      [{ latitud: 4, longitud: -74, precisionMetros: -1 }, 'precisionMetros'],
      [{ latitud: 4, longitud: -74, precisionMetros: 100001 }, 'precisionMetros'],
      [{ latitud: 4, longitud: -74, precisionMetros: 1.5 }, 'precisionMetros'],
      [{ fechaHora: new Date(Date.now() + 3_600_000).toISOString() }, 'fechaHora'],
      [{ fechaHora: 'ayer' }, 'fechaHora'],
    ];
    for (const [extra, campo] of casos) {
      const res = await crear(e.vet, { ...base(e), ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(res.body.error.detalles.map((d) => d.campo)).toContain(campo);
    }
    // Hasta 5 minutos en el futuro se tolera.
    const ok = await crear(e.vet, { ...base(e), fechaHora: new Date(Date.now() + 60_000).toISOString() });
    expect(ok.status).toBe(201);
  });

  it('alcance por finca y estado del animal', async () => {
    const e = await escenario();
    expect((await crear(e.ajeno, base(e))).status).toBe(404);
    expect((await crear(e.vet, { ...base(e), loteId: UUID_INEXISTENTE })).status).toBe(404);
    expect((await crear(e.vet, { vacunoId: e.vacuno.id, tipo: 'OTRO', descripcion: 'Descripción ok' })).status).toBe(201);
    await prisma.vacuno.update({ where: { id: e.vacuno.id }, data: { estado: 'INACTIVO' } });
    const baja = await crear(e.vet, { vacunoId: e.vacuno.id, tipo: 'OTRO', descripcion: 'Descripción ok' });
    expect(baja.status).toBe(400);
    expect(baja.body.error.detalles[0].campo).toBe('vacunoId');
  });

  it('el CHECK de la base impide registros sin sujeto', async () => {
    const e = await escenario();
    await expect(
      prisma.novedad.create({
        data: { fincaId: e.finca.id, tipo: 'OTRO', descripcion: 'sin sujeto', registradoPorId: e.vet.usuario.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.novedad.create({
        data: {
          fincaId: e.finca.id, vacunoId: e.vacuno.id, loteId: e.lote.id, tipo: 'OTRO', descripcion: 'dos sujetos',
          registradoPorId: e.vet.usuario.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('acepta multipart con campos numéricos como texto', async () => {
    const e = await escenario();
    const res = await request(app)
      .post('/api/novedades')
      .set(e.ayudante.bearer)
      .field('loteId', e.lote.id)
      .field('tipo', 'COMPORTAMIENTO')
      .field('descripcion', 'Aves apiladas en una esquina')
      .field('latitud', '4.711')
      .field('longitud', '-74.072')
      .field('precisionMetros', '25')
      .field('vacunoId', '');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ latitud: 4.711, longitud: -74.072, precisionMetros: 25, tieneFoto: false });
  });
});

describe('Fotos', () => {
  const subir = (sesion, datos, archivo, nombre = 'foto.jpg', mimetype = 'image/jpeg') =>
    request(app)
      .post('/api/novedades')
      .set(sesion.bearer)
      .field('loteId', datos.loteId)
      .field('tipo', 'LESION')
      .field('descripcion', 'Con foto adjunta')
      .attach('foto', archivo, { filename: nombre, contentType: mimetype });

  it('sube JPEG, PNG y WebP válidos y los sirve con sus cabeceras', async () => {
    const e = await escenario();
    for (const [buffer, mime, ext] of [[JPEG, 'image/jpeg', 'jpg'], [PNG, 'image/png', 'png'], [WEBP, 'image/webp', 'webp']]) {
      const res = await subir(e.ayudante, { loteId: e.lote.id }, buffer, 'cualquier-nombre.exe', 'application/octet-stream');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ tieneFoto: true, fotoUrl: `/api/novedades/${res.body.id}/foto`, fotoMime: mime, fotoBytes: buffer.length });
      expect(res.body).not.toHaveProperty('fotoArchivo');
      const fila = await prisma.novedad.findUnique({ where: { id: res.body.id } });
      expect(fila.fotoArchivo).toMatch(new RegExp(`^[0-9a-f-]{36}\\.${ext}$`));
      expect(archivosEnDisco()).toContain(fila.fotoArchivo);

      const foto = await request(app).get(res.body.fotoUrl).set(e.vet.bearer).buffer(true).parse((r, cb) => {
        const trozos = [];
        r.on('data', (t) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });
      expect(foto.status).toBe(200);
      expect(foto.headers['content-type']).toBe(mime);
      expect(foto.headers['x-content-type-options']).toBe('nosniff');
      expect(foto.headers['cache-control']).toBe('private, max-age=86400');
      expect(Buffer.compare(foto.body, buffer)).toBe(0);
    }
  });

  it('rechaza un archivo con mimetype de imagen pero bytes de texto', async () => {
    const e = await escenario();
    const antes = archivosEnDisco().length;
    const res = await subir(e.ayudante, { loteId: e.lote.id }, FALSO);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(res.body.error.detalles[0].campo).toBe('foto');
    expect(archivosEnDisco().length).toBe(antes);
    expect(await prisma.novedad.count()).toBe(0);
  });

  it('rechaza archivos de más de 5 MB con 400', async () => {
    const e = await escenario();
    const grande = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await subir(e.ayudante, { loteId: e.lote.id }, grande);
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('foto');
  });

  it('rechaza el archivo en un campo inesperado', async () => {
    const e = await escenario();
    const res = await request(app)
      .post('/api/novedades')
      .set(e.ayudante.bearer)
      .field('loteId', e.lote.id)
      .field('tipo', 'OTRO')
      .field('descripcion', 'Campo equivocado')
      .attach('imagen', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('foto');
  });

  it('si la validación falla no queda archivo huérfano', async () => {
    const e = await escenario();
    const antes = archivosEnDisco().length;
    const res = await request(app)
      .post('/api/novedades')
      .set(e.ayudante.bearer)
      .field('loteId', e.lote.id)
      .field('tipo', 'OTRO')
      .field('descripcion', 'ab')
      .attach('foto', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(archivosEnDisco().length).toBe(antes);
  });

  it('GET foto responde 404 sin foto, 404 en otra finca y 401 sin token', async () => {
    const e = await escenario();
    const { body: sin } = await crear(e.ayudante, base(e));
    expect((await request(app).get(`/api/novedades/${sin.id}/foto`).set(e.vet.bearer)).status).toBe(404);
    const { body: con } = await subir(e.ayudante, { loteId: e.lote.id }, JPEG);
    expect((await request(app).get(`/api/novedades/${con.id}/foto`).set(e.ajeno.bearer)).status).toBe(404);
    expect((await request(app).get(`/api/novedades/${con.id}/foto`)).status).toBe(401);
  });

  it('reemplazar y quitar la foto borran el archivo anterior', async () => {
    const e = await escenario();
    const { body } = await subir(e.ayudante, { loteId: e.lote.id }, JPEG);
    const f1 = (await prisma.novedad.findUnique({ where: { id: body.id } })).fotoArchivo;
    expect(archivosEnDisco()).toContain(f1);

    const put = await request(app).put(`/api/novedades/${body.id}/foto`).set(e.ayudante.bearer).attach('foto', PNG, { filename: 'n.png', contentType: 'image/png' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ tieneFoto: true, fotoMime: 'image/png' });
    const f2 = (await prisma.novedad.findUnique({ where: { id: body.id } })).fotoArchivo;
    expect(f2).not.toBe(f1);
    expect(archivosEnDisco()).not.toContain(f1);
    expect(archivosEnDisco()).toContain(f2);

    const del = await request(app).delete(`/api/novedades/${body.id}/foto`).set(e.ayudante.bearer);
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ tieneFoto: false, fotoUrl: null, fotoMime: null, fotoBytes: null });
    expect(archivosEnDisco()).not.toContain(f2);
    expect((await request(app).get(`/api/novedades/${body.id}/foto`).set(e.ayudante.bearer)).status).toBe(404);
  });

  it('PUT foto valida el archivo y no destruye la foto actual', async () => {
    const e = await escenario();
    const { body } = await subir(e.ayudante, { loteId: e.lote.id }, JPEG);
    const f1 = (await prisma.novedad.findUnique({ where: { id: body.id } })).fotoArchivo;
    const falso = await request(app).put(`/api/novedades/${body.id}/foto`).set(e.ayudante.bearer).attach('foto', FALSO, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(falso.status).toBe(400);
    expect(falso.body.error.detalles[0].campo).toBe('foto');
    const sinArchivo = await request(app).put(`/api/novedades/${body.id}/foto`).set(e.ayudante.bearer).field('x', 'y');
    expect(sinArchivo.status).toBe(400);
    expect(archivosEnDisco()).toContain(f1);
  });

  it('la regla del ayudante rige también para la foto', async () => {
    const e = await escenario();
    const { body } = await subir(e.ayudante, { loteId: e.lote.id }, JPEG);
    const f1 = (await prisma.novedad.findUnique({ where: { id: body.id } })).fotoArchivo;
    const adjunto = (s) => request(app).put(`/api/novedades/${body.id}/foto`).set(s.bearer).attach('foto', PNG, { filename: 'n.png', contentType: 'image/png' });
    expect((await adjunto(e.otroAyudante)).status).toBe(403);
    expect((await request(app).delete(`/api/novedades/${body.id}/foto`).set(e.otroAyudante.bearer)).status).toBe(403);
    expect((await adjunto(e.ajeno)).status).toBe(404);
    expect(archivosEnDisco()).toContain(f1);
    expect((await adjunto(e.vet)).status).toBe(200);
    expect(archivosEnDisco()).not.toContain(f1);
    // Un ayudante ya no puede si no es de hoy.
    await prisma.novedad.update({ where: { id: body.id }, data: { createdAt: new Date(Date.now() - 36 * 3_600_000) } });
    expect((await adjunto(e.ayudante)).status).toBe(403);
    expect((await request(app).delete(`/api/novedades/${body.id}/foto`).set(e.ayudante.bearer)).status).toBe(403);
  });
});

describe('PATCH /api/novedades/:id y regla del ayudante', () => {
  it('el ayudante edita su novedad abierta de hoy', async () => {
    const e = await escenario();
    const { body } = await crear(e.ayudante, { ...base(e), latitud: 4, longitud: -74 });
    const res = await request(app).patch(`/api/novedades/${body.id}`).set(e.ayudante.bearer).send({ descripcion: 'Descripción corregida', prioridad: 'ALTA', tipo: 'LESION' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ descripcion: 'Descripción corregida', prioridad: 'ALTA', tipo: 'LESION', loteId: e.lote.id });
  });

  it('no cambia el estado ni el animal aunque se envíen', async () => {
    const e = await escenario();
    const { body } = await crear(e.ayudante, base(e));
    const res = await request(app).patch(`/api/novedades/${body.id}`).set(e.ayudante.bearer).send({ estado: 'CERRADA', vacunoId: e.vacuno.id, loteId: null, descripcion: 'Texto nuevo válido' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'ABIERTA', loteId: e.lote.id, vacunoId: null });
  });

  it('403 si es ajena, no es de hoy o no está ABIERTA; veterinario sí puede', async () => {
    const e = await escenario();
    const { body } = await crear(e.ayudante, base(e));
    const patch = (s, cuerpo = { descripcion: 'Otro texto válido' }) => request(app).patch(`/api/novedades/${body.id}`).set(s.bearer).send(cuerpo);
    expect((await patch(e.otroAyudante)).status).toBe(403);
    expect((await patch(e.ajeno)).status).toBe(404);
    expect((await patch(e.vet)).status).toBe(200);

    await prisma.novedad.update({ where: { id: body.id }, data: { estado: 'EN_SEGUIMIENTO' } });
    expect((await patch(e.ayudante)).status).toBe(403);
    await prisma.novedad.update({ where: { id: body.id }, data: { estado: 'ABIERTA', createdAt: new Date(Date.now() - 36 * 3_600_000) } });
    expect((await patch(e.ayudante)).status).toBe(403);
    expect((await patch(e.admin)).status).toBe(200);
  });

  it('valida y permite quitar la ubicación con null', async () => {
    const e = await escenario();
    const { body } = await crear(e.ayudante, { ...base(e), latitud: 4, longitud: -74, precisionMetros: 10 });
    const url = `/api/novedades/${body.id}`;
    expect((await request(app).patch(url).set(e.ayudante.bearer).send({ latitud: 5 })).status).toBe(400);
    expect((await request(app).patch(url).set(e.ayudante.bearer).send({ latitud: null, longitud: 3 })).status).toBe(400);
    expect((await request(app).patch(url).set(e.ayudante.bearer).send({ latitud: 95, longitud: 3 })).status).toBe(400);
    expect((await request(app).patch(url).set(e.ayudante.bearer).send({ descripcion: 'ab' })).status).toBe(400);
    const res = await request(app).patch(url).set(e.ayudante.bearer).send({ latitud: null, longitud: null, precisionMetros: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ latitud: null, longitud: null, precisionMetros: null });
  });

  it('un id inexistente o mal formado responde 404', async () => {
    const e = await escenario();
    expect((await request(app).patch(`/api/novedades/${UUID_INEXISTENTE}`).set(e.vet.bearer).send({ tipo: 'OTRO' })).status).toBe(404);
    expect((await request(app).get('/api/novedades/no-es-uuid').set(e.vet.bearer)).status).toBe(404);
  });
});

describe('Estado y comentarios', () => {
  it('CERRADA fija cerradaEn y otro estado la limpia', async () => {
    const e = await escenario();
    const { body } = await crear(e.ayudante, base(e));
    const url = `/api/novedades/${body.id}/estado`;
    const cerrada = await request(app).patch(url).set(e.vet.bearer).send({ estado: 'CERRADA' });
    expect(cerrada.status).toBe(200);
    expect(cerrada.body.estado).toBe('CERRADA');
    expect(cerrada.body.cerradaEn).not.toBeNull();
    const seguimiento = await request(app).patch(url).set(e.vet.bearer).send({ estado: 'EN_SEGUIMIENTO' });
    expect(seguimiento.body).toMatchObject({ estado: 'EN_SEGUIMIENTO', cerradaEn: null });
    expect((await request(app).patch(url).set(e.vet.bearer).send({ estado: 'OTRA' })).status).toBe(400);
    expect((await request(app).patch(`/api/novedades/${body.id}/estado`).set(e.ajeno.bearer).send({ estado: 'CERRADA' })).status).toBe(403);
    const otraFinca = await sesionDe('VETERINARIO', [e.otraFinca.id]);
    expect((await request(app).patch(url).set(otraFinca.bearer).send({ estado: 'CERRADA' })).status).toBe(404);
  });

  it('comenta en cualquier estado, valida el texto y respeta el alcance', async () => {
    const e = await escenario();
    const { body } = await crear(e.ayudante, base(e));
    await request(app).patch(`/api/novedades/${body.id}/estado`).set(e.vet.bearer).send({ estado: 'CERRADA' });
    const url = `/api/novedades/${body.id}/comentarios`;
    const c1 = await request(app).post(url).set(e.ayudante.bearer).send({ texto: '  Primer comentario  ' });
    expect(c1.status).toBe(201);
    expect(c1.body).toMatchObject({ texto: 'Primer comentario', novedadId: body.id, autor: { id: e.ayudante.usuario.id } });
    await request(app).post(url).set(e.vet.bearer).send({ texto: 'Segundo' }).expect(201);
    expect((await request(app).post(url).set(e.vet.bearer).send({ texto: '   ' })).status).toBe(400);
    expect((await request(app).post(url).set(e.vet.bearer).send({ texto: 'x'.repeat(1001) })).status).toBe(400);
    expect((await request(app).post(url).set(e.ajeno.bearer).send({ texto: 'hola' })).status).toBe(404);

    const detalle = await request(app).get(`/api/novedades/${body.id}`).set(e.vet.bearer);
    expect(detalle.body.totalComentarios).toBe(2);
    expect(detalle.body.comentarios.map((c) => c.texto)).toEqual(['Primer comentario', 'Segundo']);
    expect(detalle.body.comentarios[1].autor).toMatchObject({ id: e.vet.usuario.id, nombre: expect.any(String) });
    expect((await request(app).get(`/api/novedades/${body.id}`).set(e.ajeno.bearer)).status).toBe(404);
  });
});

describe('GET /api/novedades', () => {
  it('alcance por finca: ajena responde [] y el resto solo ve lo suyo', async () => {
    const e = await escenario();
    await crear(e.ayudante, base(e));
    const otroLote = await prisma.loteOviparo.create({
      data: { fincaId: e.otraFinca.id, nombre: 'Lote B', edadMinSemanas: 1, edadMaxSemanas: 2, cantidad: 5, proposito: 'PRODUCCION', creadoPorId: e.admin.usuario.id },
    });
    await crear(e.ajeno, { loteId: otroLote.id, tipo: 'OTRO', descripcion: 'Novedad en otra finca' });

    expect((await request(app).get('/api/novedades').set(e.vet.bearer)).body).toHaveLength(1);
    expect((await request(app).get('/api/novedades').set(e.admin.bearer)).body).toHaveLength(2);
    expect((await request(app).get(`/api/novedades?fincaId=${e.otraFinca.id}`).set(e.vet.bearer)).body).toEqual([]);
    expect((await request(app).get(`/api/novedades?fincaId=${e.otraFinca.id}`).set(e.admin.bearer)).body).toHaveLength(1);
    expect((await request(app).get('/api/novedades?fincaId=no-uuid').set(e.admin.bearer)).status).toBe(400);
  });

  it('filtra por sujeto, tipo, prioridad y estado; sin estado trae todas', async () => {
    const e = await escenario();
    const a = (await crear(e.vet, { ...base(e), tipo: 'ENFERMEDAD', prioridad: 'ALTA' })).body;
    const b = (await crear(e.vet, { vacunoId: e.vacuno.id, tipo: 'LESION', descripcion: 'Herida en la pata' })).body;
    await request(app).patch(`/api/novedades/${b.id}/estado`).set(e.vet.bearer).send({ estado: 'CERRADA' });
    const ids = async (q) => (await request(app).get(`/api/novedades?${q}`).set(e.vet.bearer)).body.map((n) => n.id).sort();
    expect(await ids('')).toEqual([a.id, b.id].sort());
    expect(await ids(`loteId=${e.lote.id}`)).toEqual([a.id]);
    expect(await ids(`vacunoId=${e.vacuno.id}`)).toEqual([b.id]);
    expect(await ids('tipo=LESION')).toEqual([b.id]);
    expect(await ids('prioridad=ALTA')).toEqual([a.id]);
    expect(await ids('estado=CERRADA')).toEqual([b.id]);
    expect(await ids('estado=ABIERTA')).toEqual([a.id]);
    expect((await request(app).get('/api/novedades?tipo=XX').set(e.vet.bearer)).status).toBe(400);
  });

  it('ordena por fechaHora descendente y filtra por desde/hasta en días de Bogotá', async () => {
    const e = await escenario();
    // 2026-03-10 04:30 UTC = 2026-03-09 23:30 en Bogotá.
    const fechas = ['2026-03-09T12:00:00-05:00', '2026-03-10T04:30:00Z', '2026-03-10T05:00:00Z', '2026-03-12T10:00:00-05:00'];
    const creadas = [];
    for (const fechaHora of fechas) creadas.push((await crear(e.vet, { ...base(e), fechaHora })).body.id);
    const lista = await request(app).get('/api/novedades').set(e.vet.bearer);
    expect(lista.body.map((n) => n.id)).toEqual([creadas[3], creadas[2], creadas[1], creadas[0]]);

    const dia = async (q) => (await request(app).get(`/api/novedades?${q}`).set(e.vet.bearer)).body.map((n) => n.id);
    expect(await dia('desde=2026-03-10&hasta=2026-03-10')).toEqual([creadas[2]]);
    expect(await dia('hasta=2026-03-09')).toEqual([creadas[1], creadas[0]]);
    expect(await dia('desde=2026-03-10')).toEqual([creadas[3], creadas[2]]);
    expect(await dia('desde=2026-03-11&hasta=2026-03-11')).toEqual([]);
    expect((await request(app).get('/api/novedades?desde=10-03-2026').set(e.vet.bearer)).status).toBe(400);
  });

  it('el listado incluye totalComentarios y no expone fotoArchivo', async () => {
    const e = await escenario();
    const { body } = await crear(e.vet, base(e));
    await request(app).post(`/api/novedades/${body.id}/comentarios`).set(e.vet.bearer).send({ texto: 'uno' });
    const lista = await request(app).get('/api/novedades').set(e.vet.bearer);
    expect(lista.body[0].totalComentarios).toBe(1);
    expect(lista.body[0]).not.toHaveProperty('fotoArchivo');
    expect(lista.body[0]).not.toHaveProperty('comentarios');
  });
});
