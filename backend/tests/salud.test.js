import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const bogota = (dias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

async function escenario() {
  const finca = await crearFinca('Finca A');
  const otraFinca = await crearFinca('Finca B');
  const admin = await sesionDe('ADMINISTRADOR');
  const vet = await sesionDe('VETERINARIO', [finca.id]);
  const ayudante = await sesionDe('AYUDANTE', [finca.id]);
  const ajeno = await sesionDe('VETERINARIO', [otraFinca.id]);
  const vacuno = await prisma.vacuno.create({
    data: {
      fincaId: finca.id, nombre: 'Lucero', sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400,
      fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId: admin.usuario.id,
    },
  });
  const otroVacuno = await prisma.vacuno.create({
    data: {
      fincaId: finca.id, nombre: 'Canelo', sexo: 'MACHO', raza: 'Brahman', edadMeses: 30, peso: 450,
      fechaLlegada: new Date('2026-01-01'), proposito: 'ENGORDE', creadoPorId: admin.usuario.id,
    },
  });
  const lote = await prisma.loteOviparo.create({
    data: {
      fincaId: finca.id, nombre: 'Lote Uno', edadMinSemanas: 1, edadMaxSemanas: 10, cantidad: 100,
      proposito: 'PRODUCCION', creadoPorId: admin.usuario.id,
    },
  });
  return { finca, otraFinca, admin, vet, ayudante, ajeno, vacuno, otroVacuno, lote };
}

const crear = (s, cuerpo) => request(app).post('/api/salud/casos').set(s.bearer).send(cuerpo);
const enLote = (e, extra = {}) => ({ loteId: e.lote.id, diagnostico: 'Coriza infecciosa', ...extra });
const enVacuno = (e, extra = {}) => ({ vacunoId: e.vacuno.id, diagnostico: 'Mastitis', ...extra });

describe('Permisos', () => {
  it('sin token responde 401', async () => {
    for (const [m, r] of [['get', '/api/salud/casos'], ['get', `/api/salud/casos/${UUID_INEXISTENTE}`], ['post', '/api/salud/casos'], ['patch', `/api/salud/casos/${UUID_INEXISTENTE}`]]) {
      expect((await request(app)[m](r)).status, r).toBe(401);
    }
  });

  it('el ayudante solo consulta; admin y veterinario gestionan', async () => {
    const e = await escenario();
    expect((await crear(e.ayudante, enLote(e))).status).toBe(403);
    const { body } = await crear(e.vet, enLote(e));
    expect((await crear(e.admin, enVacuno(e))).status).toBe(201);
    expect((await request(app).patch(`/api/salud/casos/${body.id}`).set(e.ayudante.bearer).send({ diagnostico: 'Otro' })).status).toBe(403);
    expect((await request(app).get('/api/salud/casos').set(e.ayudante.bearer)).status).toBe(200);
    expect((await request(app).get(`/api/salud/casos/${body.id}`).set(e.ayudante.bearer)).status).toBe(200);
  });
});

describe('POST /api/salud/casos', () => {
  it('crea en lote con valores por defecto', async () => {
    const e = await escenario();
    const res = await crear(e.vet, enLote(e, { sintomas: 'Estornudos', animalesAfectados: 12 }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      loteId: e.lote.id, vacunoId: null, novedadId: null, novedad: null, estado: 'EN_OBSERVACION', activo: true,
      fechaInicio: bogota(), fechaFin: null, animalesAfectados: 12, sintomas: 'Estornudos', observaciones: null,
      lote: { id: e.lote.id, nombre: 'Lote Uno' }, vacuno: null, finca: { id: e.finca.id, nombre: 'Finca A' },
      registradoPor: { id: e.vet.usuario.id },
    });
  });

  it('crea en vacuno', async () => {
    const e = await escenario();
    const res = await crear(e.vet, enVacuno(e, { estado: 'EN_TRATAMIENTO', fechaInicio: bogota(-3) }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vacuno: { nombre: 'Lucero' }, lote: null, estado: 'EN_TRATAMIENTO', activo: true, fechaInicio: bogota(-3) });
  });

  it('exige exactamente uno de vacuno o lote', async () => {
    const e = await escenario();
    expect((await crear(e.vet, { ...enLote(e), vacunoId: e.vacuno.id })).status).toBe(400);
    expect((await crear(e.vet, { diagnostico: 'Sin sujeto' })).status).toBe(400);
  });

  it('el CHECK de la base impide registros sin sujeto', async () => {
    const e = await escenario();
    await expect(
      prisma.casoSalud.create({
        data: { fincaId: e.finca.id, diagnostico: 'x y', fechaInicio: new Date(), registradoPorId: e.vet.usuario.id },
      }),
    ).rejects.toThrow();
  });

  it('valida campos', async () => {
    const e = await escenario();
    const casos = [
      [{ diagnostico: 'a' }, 'diagnostico'],
      [{ diagnostico: 'x'.repeat(201) }, 'diagnostico'],
      [{ sintomas: 'x'.repeat(2001) }, 'sintomas'],
      [{ observaciones: 'x'.repeat(1001) }, 'observaciones'],
      [{ estado: 'MUERTO' }, 'estado'],
      [{ fechaInicio: bogota(2) }, 'fechaInicio'],
      [{ fechaInicio: '2026-13-40' }, 'fechaInicio'],
      [{ estado: 'RECUPERADO', fechaFin: bogota(3) }, 'fechaFin'],
      [{ animalesAfectados: 0 }, 'animalesAfectados'],
      [{ animalesAfectados: 101 }, 'animalesAfectados'],
      [{ animalesAfectados: 2.5 }, 'animalesAfectados'],
      [{ novedadId: 'no-uuid' }, 'novedadId'],
    ];
    for (const [extra, campo] of casos) {
      const res = await crear(e.vet, enLote(e, extra));
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(res.body.error.detalles.map((d) => d.campo)).toContain(campo);
    }
    expect((await crear(e.vet, enLote(e, { animalesAfectados: 100 }))).status).toBe(201);
  });

  it('animalesAfectados no aplica a un vacuno', async () => {
    const e = await escenario();
    const res = await crear(e.vet, enVacuno(e, { animalesAfectados: 1 }));
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('animalesAfectados');
  });

  it('alcance por finca y estado del animal', async () => {
    const e = await escenario();
    expect((await crear(e.ajeno, enLote(e))).status).toBe(404);
    expect((await crear(e.vet, enLote(e, { loteId: UUID_INEXISTENTE }))).status).toBe(404);
    await prisma.loteOviparo.update({ where: { id: e.lote.id }, data: { estado: 'INACTIVO' } });
    const baja = await crear(e.vet, enLote(e));
    expect(baja.status).toBe(400);
    expect(baja.body.error.detalles[0].campo).toBe('loteId');
  });

  it('novedadId debe ser del mismo animal o lote', async () => {
    const e = await escenario();
    const nov = await request(app).post('/api/novedades').set(e.vet.bearer).send({ vacunoId: e.vacuno.id, tipo: 'ENFERMEDAD', descripcion: 'Tos persistente' });
    expect(nov.status).toBe(201);
    const ok = await crear(e.vet, enVacuno(e, { novedadId: nov.body.id }));
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ novedadId: nov.body.id, novedad: { id: nov.body.id, tipo: 'ENFERMEDAD', fechaHora: nov.body.fechaHora } });
    const otroAnimal = await crear(e.vet, { vacunoId: e.otroVacuno.id, diagnostico: 'Tos', novedadId: nov.body.id });
    expect(otroAnimal.status).toBe(400);
    expect(otroAnimal.body.error.detalles[0].campo).toBe('novedadId');
    expect((await crear(e.vet, enLote(e, { novedadId: nov.body.id }))).status).toBe(400);
    expect((await crear(e.vet, enVacuno(e, { novedadId: UUID_INEXISTENTE }))).status).toBe(404);
    expect((await crear(e.ajeno, enVacuno(e, { novedadId: nov.body.id }))).status).toBe(404);
  });
});

describe('Reglas de fechaFin y estado', () => {
  it('crear como RECUPERADO o FALLECIDO sin fechaFin usa hoy', async () => {
    const e = await escenario();
    for (const estado of ['RECUPERADO', 'FALLECIDO']) {
      const res = await crear(e.vet, enVacuno(e, { estado, fechaInicio: bogota(-5) }));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ estado, activo: false, fechaFin: bogota() });
    }
  });

  it('fechaFin anterior a fechaInicio responde 400', async () => {
    const e = await escenario();
    const res = await crear(e.vet, enVacuno(e, { estado: 'RECUPERADO', fechaInicio: bogota(-2), fechaFin: bogota(-4) }));
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('fechaFin');
  });

  it('un estado activo limpia fechaFin al crear y al volver desde uno final', async () => {
    const e = await escenario();
    const nuevo = await crear(e.vet, enVacuno(e, { estado: 'EN_TRATAMIENTO', fechaFin: bogota() }));
    expect(nuevo.body.fechaFin).toBeNull();

    const { body } = await crear(e.vet, enVacuno(e, { fechaInicio: bogota(-3) }));
    const url = `/api/salud/casos/${body.id}`;
    const cierre = await request(app).patch(url).set(e.vet.bearer).send({ estado: 'RECUPERADO' });
    expect(cierre.status).toBe(200);
    expect(cierre.body).toMatchObject({ estado: 'RECUPERADO', activo: false, fechaFin: bogota() });

    const fijada = await request(app).patch(url).set(e.vet.bearer).send({ fechaFin: bogota(-1) });
    expect(fijada.body.fechaFin).toBe(bogota(-1));
    const fallecido = await request(app).patch(url).set(e.vet.bearer).send({ estado: 'FALLECIDO' });
    expect(fallecido.body).toMatchObject({ estado: 'FALLECIDO', fechaFin: bogota(-1) });

    const reabierto = await request(app).patch(url).set(e.vet.bearer).send({ estado: 'EN_TRATAMIENTO' });
    expect(reabierto.body).toMatchObject({ estado: 'EN_TRATAMIENTO', activo: true, fechaFin: null });
  });

  it('al editar, fechaFin no puede quedar antes de fechaInicio', async () => {
    const e = await escenario();
    const { body } = await crear(e.vet, enVacuno(e, { estado: 'RECUPERADO', fechaInicio: bogota(-5), fechaFin: bogota(-2) }));
    const url = `/api/salud/casos/${body.id}`;
    expect((await request(app).patch(url).set(e.vet.bearer).send({ fechaFin: bogota(-6) })).status).toBe(400);
    expect((await request(app).patch(url).set(e.vet.bearer).send({ fechaInicio: bogota(-1) })).status).toBe(400);
    expect((await request(app).patch(url).set(e.vet.bearer).send({ fechaFin: bogota(3) })).status).toBe(400);
    expect((await request(app).patch(url).set(e.vet.bearer).send({ fechaInicio: bogota(-3) })).status).toBe(200);
  });

  it('el animal no cambia al editar y las reglas de animalesAfectados siguen vigentes', async () => {
    const e = await escenario();
    const lote = (await crear(e.vet, enLote(e))).body;
    const res = await request(app).patch(`/api/salud/casos/${lote.id}`).set(e.vet.bearer).send({ vacunoId: e.vacuno.id, loteId: null, diagnostico: 'Bronquitis', animalesAfectados: 40 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ loteId: e.lote.id, vacunoId: null, diagnostico: 'Bronquitis', animalesAfectados: 40 });
    expect((await request(app).patch(`/api/salud/casos/${lote.id}`).set(e.vet.bearer).send({ animalesAfectados: 101 })).status).toBe(400);
    const vac = (await crear(e.vet, enVacuno(e))).body;
    expect((await request(app).patch(`/api/salud/casos/${vac.id}`).set(e.vet.bearer).send({ animalesAfectados: 2 })).status).toBe(400);
    expect((await request(app).patch(`/api/salud/casos/${vac.id}`).set(e.vet.bearer).send({ sintomas: '', observaciones: 'Nota' })).body).toMatchObject({ sintomas: null, observaciones: 'Nota' });
  });

  it('PATCH respeta el alcance y valida ids', async () => {
    const e = await escenario();
    const { body } = await crear(e.vet, enVacuno(e));
    expect((await request(app).patch(`/api/salud/casos/${body.id}`).set(e.ajeno.bearer).send({ diagnostico: 'Otro' })).status).toBe(404);
    expect((await request(app).patch(`/api/salud/casos/${UUID_INEXISTENTE}`).set(e.vet.bearer).send({ diagnostico: 'Otro' })).status).toBe(404);
    expect((await request(app).get('/api/salud/casos/xyz').set(e.vet.bearer)).status).toBe(404);
    expect((await request(app).get(`/api/salud/casos/${body.id}`).set(e.ajeno.bearer)).status).toBe(404);
  });
});

describe('GET /api/salud/casos', () => {
  it('filtra por activos, estado y sujeto; ordena por fechaInicio desc y createdAt desc', async () => {
    const e = await escenario();
    const a = (await crear(e.vet, enVacuno(e, { fechaInicio: bogota(-10) }))).body;
    const b = (await crear(e.vet, enLote(e, { fechaInicio: bogota(-2), estado: 'EN_TRATAMIENTO' }))).body;
    const c = (await crear(e.vet, enVacuno(e, { fechaInicio: bogota(-2), estado: 'RECUPERADO' }))).body;
    const d = (await crear(e.vet, { vacunoId: e.otroVacuno.id, diagnostico: 'Fiebre', fechaInicio: bogota(-1), estado: 'FALLECIDO' })).body;
    const ids = async (q) => (await request(app).get(`/api/salud/casos?${q}`).set(e.ayudante.bearer)).body.map((x) => x.id);

    expect(await ids('')).toEqual([d.id, c.id, b.id, a.id]);
    expect(await ids('activos=true')).toEqual([b.id, a.id]);
    expect(await ids('activos=false')).toEqual([d.id, c.id]);
    expect(await ids('estado=RECUPERADO')).toEqual([c.id]);
    expect(await ids('estado=EN_TRATAMIENTO&activos=true')).toEqual([b.id]);
    expect(await ids('estado=RECUPERADO&activos=true')).toEqual([]);
    expect(await ids(`vacunoId=${e.vacuno.id}`)).toEqual([c.id, a.id]);
    expect(await ids(`loteId=${e.lote.id}`)).toEqual([b.id]);
    expect((await request(app).get('/api/salud/casos?estado=XX').set(e.vet.bearer)).status).toBe(400);
    expect((await request(app).get('/api/salud/casos?activos=si').set(e.vet.bearer)).status).toBe(400);
  });

  it('alcance por finca: ajena responde [] y el administrador ve todo', async () => {
    const e = await escenario();
    await crear(e.vet, enVacuno(e));
    expect((await request(app).get(`/api/salud/casos?fincaId=${e.finca.id}`).set(e.ajeno.bearer)).body).toEqual([]);
    expect((await request(app).get('/api/salud/casos').set(e.ajeno.bearer)).body).toEqual([]);
    expect((await request(app).get(`/api/salud/casos?fincaId=${e.finca.id}`).set(e.admin.bearer)).body).toHaveLength(1);
    expect((await request(app).get(`/api/salud/casos?fincaId=${e.otraFinca.id}`).set(e.vet.bearer)).body).toEqual([]);
  });
});
