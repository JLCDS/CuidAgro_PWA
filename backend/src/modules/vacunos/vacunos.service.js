import { noEncontrado } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  conDuplicados,
  datosEstado,
  exigirFinca,
  exigirNombreLibre,
  filtroFincas,
  filtroListado,
  ordenarPorNombre,
} from '../../lib/registros.js';
import { aVacuno, includeFinca } from '../../lib/serializers.js';

const MENSAJE_DUPLICADO = 'Ya existe un vacuno con ese nombre en la finca';

export async function listarVacunos(actor, query) {
  const vacunos = await prisma.vacuno.findMany({
    where: filtroListado(actor, query, ['nombre', 'raza']),
    include: includeFinca,
  });
  return ordenarPorNombre(vacunos).map(aVacuno);
}

/** Un vacuno de finca ajena responde igual que uno inexistente. */
async function buscar(actor, id) {
  const vacuno = await prisma.vacuno.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeFinca });
  if (!vacuno) throw noEncontrado('Vacuno');
  return vacuno;
}

export async function obtenerVacuno(actor, id) {
  return aVacuno(await buscar(actor, id));
}

export async function crearVacuno(actor, datos) {
  await exigirFinca(actor, datos.fincaId);
  await exigirNombreLibre('vacuno', datos.fincaId, datos.nombre, MENSAJE_DUPLICADO);
  const vacuno = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.vacuno.create({ data: { ...datos, creadoPorId: actor.id }, include: includeFinca }),
  );
  return aVacuno(vacuno);
}

export async function actualizarVacuno(actor, id, datos) {
  const actual = await buscar(actor, id);
  if (datos.nombre !== undefined) {
    await exigirNombreLibre('vacuno', actual.fincaId, datos.nombre, MENSAJE_DUPLICADO, id);
  }
  const vacuno = await conDuplicados(MENSAJE_DUPLICADO, () =>
    prisma.vacuno.update({ where: { id }, data: datos, include: includeFinca }),
  );
  return aVacuno(vacuno);
}

export async function cambiarEstadoVacuno(actor, id, cambio) {
  await buscar(actor, id);
  return aVacuno(await prisma.vacuno.update({ where: { id }, data: datosEstado(cambio), include: includeFinca }));
}
