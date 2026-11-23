import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/passwords.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp({ loginMaxIntentos: 1000 });
export const PASSWORD = 'clave-de-prueba-1';
export const UUID_INEXISTENTE = '7f1c2f64-54f1-4a11-9b43-3f4f8f2a9c10';

// Derivar una vez: scrypt es lento a propósito.
const hashCompartido = hashPassword(PASSWORD);
let secuencia = 0;

export function crearFinca(nombre = 'Finca A') {
  return prisma.finca.create({ data: { nombre } });
}

export async function crearUsuario(rol, fincaIds = [], correo = `u${++secuencia}@cuidagro.test`) {
  const { id: rolId } = await prisma.rol.findUniqueOrThrow({ where: { nombre: rol } });
  return prisma.usuario.create({
    data: {
      nombre: `Usuario ${rol}`,
      correo,
      passwordHash: await hashCompartido,
      rolId,
      fincas: { create: fincaIds.map((fincaId) => ({ fincaId })) },
    },
  });
}

/** Inicia sesión y devuelve un agente con la cookie de refresh y el token de acceso. */
export async function sesion(correo, password = PASSWORD) {
  const agente = request.agent(app);
  const res = await agente.post('/api/auth/login').send({ correo, password }).expect(200);
  return { agente, bearer: { Authorization: `Bearer ${res.body.accessToken}` }, cuerpo: res.body };
}

export async function sesionDe(rol, fincaIds = []) {
  const usuario = await crearUsuario(rol, fincaIds);
  return { usuario, ...(await sesion(usuario.correo)) };
}

export const cookieDe = (res) => String(res.headers['set-cookie']).split(';')[0];
