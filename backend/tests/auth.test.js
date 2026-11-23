import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { GRACIA_ROTACION_MS } from '../src/modules/auth/auth.service.js';
import { app, cookieDe, crearFinca, crearUsuario, PASSWORD, sesion } from './helpers.js';

const login = (correo, password = PASSWORD) => request(app).post('/api/auth/login').send({ correo, password });
const refresh = (cookie) => request(app).post('/api/auth/refresh').set('Cookie', cookie);

describe('HU001 - iniciar sesión', () => {
  it('entra con credenciales correctas y no expone el hash', async () => {
    const finca = await crearFinca();
    const u = await crearUsuario('AYUDANTE', [finca.id]);
    const res = await login(u.correo).expect(200);

    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.usuario).toMatchObject({ id: u.id, rol: 'AYUDANTE', fincas: [{ id: finca.id }] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('informa los permisos del rol al frontend', async () => {
    const admin = await crearUsuario('ADMINISTRADOR');
    const ayudante = await crearUsuario('AYUDANTE');
    expect((await login(admin.correo)).body.usuario.permisos).toContain('usuarios:gestionar');
    expect((await login(ayudante.correo)).body.usuario.permisos).not.toContain('usuarios:gestionar');
  });

  it('acepta el correo sin importar mayúsculas ni espacios', async () => {
    await crearUsuario('AYUDANTE', [], 'mixto@cuidagro.test');
    await login(' MIXTO@cuidagro.TEST').expect(200);
  });

  it('da el mismo error para contraseña incorrecta y correo inexistente', async () => {
    const u = await crearUsuario('AYUDANTE');
    const mala = await login(u.correo, 'incorrecta').expect(401);
    const nadie = await login('nadie@x.co', 'incorrecta').expect(401);
    expect(mala.body).toEqual(nadie.body);
    expect(mala.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('valida el formato en el backend', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'no-es-correo' }).expect(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('responde 400 ante JSON malformado', async () => {
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{mal').expect(400);
  });

  it('limita los intentos fallidos', async () => {
    const limitada = createApp({ loginMaxIntentos: 2 });
    const intento = () => request(limitada).post('/api/auth/login').send({ correo: 'a@b.co', password: 'x' });
    await intento().expect(401);
    await intento().expect(401);
    const res = await intento().expect(429);
    expect(res.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('bloquea módulos privados sin autenticación', async () => {
    for (const ruta of ['/api/auth/me', '/api/usuarios', '/api/fincas']) {
      await request(app).get(ruta).expect(401);
    }
  });

  it('rechaza tokens manipulados, sin firma o con otro secreto', async () => {
    const u = await crearUsuario('ADMINISTRADOR');
    const ajeno = jwt.sign({}, 'otro-secreto-otro-secreto-otro-secreto', { subject: u.id, issuer: 'cuidagro' });
    const sinFirma = jwt.sign({}, '', { algorithm: 'none', subject: u.id, issuer: 'cuidagro' });
    for (const token of [ajeno, sinFirma, 'basura']) {
      await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(401);
    }
  });

  it('devuelve el perfil de la sesión activa', async () => {
    const u = await crearUsuario('VETERINARIO');
    const { bearer } = await sesion(u.correo);
    const res = await request(app).get('/api/auth/me').set(bearer).expect(200);
    expect(res.body.id).toBe(u.id);
  });
});

describe('HU001 - sesión y renovación', () => {
  it('cerrar sesión impide renovarla', async () => {
    const u = await crearUsuario('AYUDANTE');
    const { agente } = await sesion(u.correo);
    await agente.post('/api/auth/logout').expect(204);
    await agente.post('/api/auth/refresh').expect(401);
    const tokens = await prisma.refreshToken.findMany({ where: { usuarioId: u.id } });
    expect(tokens.every((t) => t.revokedAt)).toBe(true);
  });

  it('cerrar sesión con una cookie vieja también cierra la sesión rotada', async () => {
    const u = await crearUsuario('AYUDANTE');
    const inicio = await login(u.correo).expect(200);
    const viejo = cookieDe(inicio);
    const nuevo = cookieDe(await refresh(viejo).expect(200));
    await request(app).post('/api/auth/logout').set('Cookie', viejo).expect(204);
    await refresh(nuevo).expect(401);
  });

  it('rota el refresh token y sigue funcionando', async () => {
    const u = await crearUsuario('AYUDANTE');
    const { agente } = await sesion(u.correo);
    const res = await agente.post('/api/auth/refresh').expect(200);
    expect(res.body.usuario.id).toBe(u.id);
    await agente.post('/api/auth/refresh').expect(200);
    expect(await prisma.refreshToken.count({ where: { usuarioId: u.id } })).toBe(3);
  });

  it('sin cookie no renueva', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
  });

  it('tolera reutilizar el token dentro del margen (respuesta perdida)', async () => {
    const u = await crearUsuario('AYUDANTE');
    const cookie = cookieDe(await login(u.correo).expect(200));
    await refresh(cookie).expect(200);
    await refresh(cookie).expect(200);
  });

  it('un token rotado que reaparece fuera del margen cierra esa sesión', async () => {
    const u = await crearUsuario('AYUDANTE');
    const viejo = cookieDe(await login(u.correo).expect(200));
    const nuevo = cookieDe(await refresh(viejo).expect(200));

    await prisma.refreshToken.updateMany({
      where: { usuarioId: u.id, reemplazadoAt: { not: null } },
      data: { reemplazadoAt: new Date(Date.now() - GRACIA_ROTACION_MS - 1000) },
    });

    await refresh(viejo).expect(401);
    await refresh(nuevo).expect(401);
  });

  it('un token vencido no renueva', async () => {
    const u = await crearUsuario('AYUDANTE');
    const { agente } = await sesion(u.correo);
    await prisma.refreshToken.updateMany({
      where: { usuarioId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await agente.post('/api/auth/refresh').expect(401);
  });
});
