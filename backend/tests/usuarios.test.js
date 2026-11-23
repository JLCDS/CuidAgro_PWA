import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, crearFinca, crearUsuario, PASSWORD, sesion, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const nuevo = (extra = {}) => ({
  nombre: 'Ana Pérez',
  correo: 'ana@finca.co',
  password: 'clave-segura-1',
  rol: 'AYUDANTE',
  ...extra,
});

describe('HU002 - administrar usuarios', () => {
  it('el administrador crea un usuario con rol y finca, y ese usuario puede entrar', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const res = await request(app).post('/api/usuarios').set(bearer).send(nuevo({ fincaIds: [finca.id] })).expect(201);

    expect(res.body).toMatchObject({ rol: 'AYUDANTE', estado: 'ACTIVO', fincas: [{ id: finca.id }] });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    await sesion('ana@finca.co', 'clave-segura-1');
  });

  it('guarda la contraseña derivada, nunca en texto plano', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await request(app).post('/api/usuarios').set(bearer).send(nuevo({ fincaIds: [finca.id] })).expect(201);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'ana@finca.co' } });
    expect(u.passwordHash).toMatch(/^scrypt\$/);
    expect(u.passwordHash).not.toContain('clave-segura-1');
  });

  it('rechaza correo repetido', async () => {
    const finca = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crearUsuario('AYUDANTE', [finca.id], 'ana@finca.co');
    const res = await request(app).post('/api/usuarios').set(bearer).send(nuevo({ fincaIds: [finca.id] })).expect(409);
    expect(res.body.error.codigo).toBe('CORREO_EN_USO');
  });

  it('exige finca a roles no administradores y que exista', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await request(app).post('/api/usuarios').set(bearer).send(nuevo()).expect(400);
    const res = await request(app)
      .post('/api/usuarios')
      .set(bearer)
      .send(nuevo({ fincaIds: [UUID_INEXISTENTE] }))
      .expect(422);
    expect(res.body.error.codigo).toBe('FINCA_INVALIDA');
  });

  it('modifica datos, rol y fincas', async () => {
    const [a, b] = [await crearFinca('A'), await crearFinca('B')];
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('AYUDANTE', [a.id]);
    const res = await request(app)
      .patch(`/api/usuarios/${u.id}`)
      .set(bearer)
      .send({ nombre: 'Nombre Nuevo', rol: 'VETERINARIO', fincaIds: [b.id] })
      .expect(200);
    expect(res.body).toMatchObject({ nombre: 'Nombre Nuevo', rol: 'VETERINARIO', fincas: [{ id: b.id }] });
  });

  it('un cambio parcial conserva las fincas', async () => {
    const a = await crearFinca('A');
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('AYUDANTE', [a.id]);
    const res = await request(app).patch(`/api/usuarios/${u.id}`).set(bearer).send({ nombre: 'Otro' }).expect(200);
    expect(res.body.fincas).toEqual([{ id: a.id, nombre: 'A' }]);
  });

  it('no deja a un ayudante sin fincas', async () => {
    const a = await crearFinca('A');
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('AYUDANTE', [a.id]);
    const res = await request(app).patch(`/api/usuarios/${u.id}`).set(bearer).send({ fincaIds: [] }).expect(422);
    expect(res.body.error.codigo).toBe('FINCA_REQUERIDA');
  });

  it('cambiar el correo a uno existente responde 409', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const f = await crearFinca();
    await crearUsuario('AYUDANTE', [f.id], 'ocupado@finca.co');
    const u = await crearUsuario('AYUDANTE', [f.id]);
    await request(app).patch(`/api/usuarios/${u.id}`).set(bearer).send({ correo: 'ocupado@finca.co' }).expect(409);
  });

  it('cambiar la contraseña cierra las sesiones existentes', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('ADMINISTRADOR');
    const victima = await sesion(u.correo);
    await request(app).patch(`/api/usuarios/${u.id}`).set(bearer).send({ password: 'clave-nueva-123' }).expect(200);
    await victima.agente.post('/api/auth/refresh').expect(401);
    await request(app).post('/api/auth/login').send({ correo: u.correo, password: PASSWORD }).expect(401);
    await sesion(u.correo, 'clave-nueva-123');
  });

  it('un usuario desactivado no entra, y su sesión abierta deja de servir', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('VETERINARIO');
    const abierta = await sesion(u.correo);

    await request(app).patch(`/api/usuarios/${u.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);

    const login = await request(app).post('/api/auth/login').send({ correo: u.correo, password: PASSWORD }).expect(403);
    expect(login.body.error.codigo).toBe('CUENTA_DESACTIVADA');
    await request(app).get('/api/auth/me').set(abierta.bearer).expect(401);
    await abierta.agente.post('/api/auth/refresh').expect(401);
  });

  it('un usuario reactivado puede volver a entrar', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('VETERINARIO');
    await request(app).patch(`/api/usuarios/${u.id}/estado`).set(bearer).send({ estado: 'INACTIVO' }).expect(200);
    await request(app).patch(`/api/usuarios/${u.id}/estado`).set(bearer).send({ estado: 'ACTIVO' }).expect(200);
    await sesion(u.correo);
  });

  it('protege al último administrador activo', async () => {
    const { usuario, bearer } = await sesionDe('ADMINISTRADOR');
    const a = await crearFinca();
    let res = await request(app)
      .patch(`/api/usuarios/${usuario.id}/estado`)
      .set(bearer)
      .send({ estado: 'INACTIVO' })
      .expect(422);
    expect(res.body.error.codigo).toBe('ULTIMO_ADMINISTRADOR');
    res = await request(app)
      .patch(`/api/usuarios/${usuario.id}`)
      .set(bearer)
      .send({ rol: 'AYUDANTE', fincaIds: [a.id] })
      .expect(422);
    expect(res.body.error.codigo).toBe('ULTIMO_ADMINISTRADOR');
  });

  it('dos administradores desactivándose a la vez no dejan el sistema sin ninguno', async () => {
    const a = await sesionDe('ADMINISTRADOR');
    const b = await sesionDe('ADMINISTRADOR');
    await Promise.all([
      request(app).patch(`/api/usuarios/${b.usuario.id}/estado`).set(a.bearer).send({ estado: 'INACTIVO' }),
      request(app).patch(`/api/usuarios/${a.usuario.id}/estado`).set(b.bearer).send({ estado: 'INACTIVO' }),
    ]);
    const activos = await prisma.usuario.count({ where: { estado: 'ACTIVO', rol: { nombre: 'ADMINISTRADOR' } } });
    expect(activos).toBeGreaterThanOrEqual(1);
  });

  it('lista con búsqueda, filtros y paginación', async () => {
    const f = await crearFinca();
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await crearUsuario('AYUDANTE', [f.id], 'luis@finca.co');
    await crearUsuario('VETERINARIO', [f.id], 'marta@finca.co');

    let res = await request(app).get('/api/usuarios?q=LUIS').set(bearer).expect(200);
    expect(res.body.items.map((u) => u.correo)).toEqual(['luis@finca.co']);
    res = await request(app).get('/api/usuarios?rol=VETERINARIO').set(bearer).expect(200);
    expect(res.body.total).toBe(1);
    res = await request(app).get('/api/usuarios?page=1&pageSize=2').set(bearer).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it('responde 404 con ids inexistentes o mal formados', async () => {
    const { bearer } = await sesionDe('ADMINISTRADOR');
    await request(app).get('/api/usuarios/no-es-uuid').set(bearer).expect(404);
    await request(app).patch(`/api/usuarios/${UUID_INEXISTENTE}`).set(bearer).send({ nombre: 'Xx' }).expect(404);
  });
});

describe('HU003 - controlar permisos', () => {
  const rutasAdmin = [
    ['get', '/api/usuarios'],
    ['post', '/api/usuarios'],
    ['get', `/api/usuarios/${UUID_INEXISTENTE}`],
    ['patch', `/api/usuarios/${UUID_INEXISTENTE}`],
    ['patch', `/api/usuarios/${UUID_INEXISTENTE}/estado`],
    ['post', '/api/fincas'],
    ['patch', `/api/fincas/${UUID_INEXISTENTE}`],
  ];

  for (const rol of ['VETERINARIO', 'AYUDANTE']) {
    it(`${rol} recibe 403 en todas las rutas de administración`, async () => {
      const finca = await crearFinca();
      const { bearer } = await sesionDe(rol, [finca.id]);
      for (const [metodo, ruta] of rutasAdmin) {
        const res = await request(app)[metodo](ruta).set(bearer).send({});
        expect(res.status, `${metodo} ${ruta}`).toBe(403);
      }
    });
  }

  it('un cambio de rol surte efecto sin volver a iniciar sesión', async () => {
    const { bearer: admin } = await sesionDe('ADMINISTRADOR');
    const u = await crearUsuario('ADMINISTRADOR');
    const { bearer } = await sesion(u.correo);
    await request(app).get('/api/usuarios').set(bearer).expect(200);
    const f = await crearFinca();
    await request(app).patch(`/api/usuarios/${u.id}`).set(admin).send({ rol: 'AYUDANTE', fincaIds: [f.id] }).expect(200);
    await request(app).get('/api/usuarios').set(bearer).expect(403);
  });
});
