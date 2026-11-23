import { noEncontrado } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { aFinca } from '../../lib/serializers.js';
import { puedeAccederFinca } from '../../middleware/auth.js';

export async function listarFincas(actor) {
  const fincas = await prisma.finca.findMany({
    where: actor.rol === 'ADMINISTRADOR' ? {} : { id: { in: actor.fincas.map((f) => f.id) } },
    orderBy: { nombre: 'asc' },
  });
  return fincas.map(aFinca);
}

/** Una finca ajena responde igual que una inexistente para no revelar que existe. */
export async function obtenerFinca(actor, id) {
  const finca = puedeAccederFinca(actor, id) ? await prisma.finca.findUnique({ where: { id } }) : null;
  if (!finca) throw noEncontrado('Finca');
  return aFinca(finca);
}

export async function crearFinca(datos) {
  return aFinca(await prisma.finca.create({ data: datos }));
}

export async function actualizarFinca(id, datos) {
  const existe = await prisma.finca.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw noEncontrado('Finca');
  return aFinca(await prisma.finca.update({ where: { id }, data: datos }));
}
