import { duplicado, duplicadoEn, noEncontrado } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { compararNombres, datosEstado, exigirFinca, filtroFincas } from '../../lib/registros.js';
import { aEspacio, includeEspacio } from '../../lib/serializers.js';

const mensajeDuplicado = (codigo) => `Ya existe un espacio con el código ${codigo} en esta finca`;

export async function listarEspacios(actor, { fincaId, estado, tipo }) {
  const espacios = await prisma.espacio.findMany({
    where: { ...filtroFincas(actor, fincaId), ...(estado === 'TODOS' ? {} : { estado }), ...(tipo ? { tipo } : {}) },
    include: includeEspacio,
  });
  return espacios
    .sort((a, b) => compararNombres(a.codigo, b.codigo) || a.id.localeCompare(b.id))
    .map(aEspacio);
}

/** Un espacio de finca ajena responde igual que uno inexistente. */
async function buscar(actor, id) {
  const espacio = await prisma.espacio.findFirst({ where: { id, ...filtroFincas(actor) }, include: includeEspacio });
  if (!espacio) throw noEncontrado('Espacio');
  return espacio;
}

export async function obtenerEspacio(actor, id) {
  return aEspacio(await buscar(actor, id));
}

/** Escritura que traduce el choque del índice único (fincaId, codigo) a 409 sobre el campo `codigo`. */
async function escribir(codigo, operacion) {
  try {
    return await operacion();
  } catch (error) {
    if (error?.code === 'P2002') throw duplicadoEn('codigo', mensajeDuplicado(codigo));
    throw error;
  }
}

export async function crearEspacio(actor, datos) {
  await exigirFinca(actor, datos.fincaId);
  const espacio = await escribir(datos.codigo, () =>
    prisma.espacio.create({ data: { ...datos, creadoPorId: actor.id }, include: includeEspacio }),
  );
  return aEspacio(espacio);
}

export async function actualizarEspacio(actor, id, datos) {
  await buscar(actor, id);
  const espacio = await escribir(datos.codigo, () =>
    prisma.espacio.update({ where: { id }, data: datos, include: includeEspacio }),
  );
  return aEspacio(espacio);
}

export async function cambiarEstadoEspacio(actor, id, cambio) {
  const actual = await buscar(actor, id);
  const lote = actual.lotes[0];
  if (cambio.estado === 'INACTIVO' && lote) {
    throw duplicado(`El espacio ${actual.codigo} tiene el lote activo ${lote.nombre}; muévelo o dalo de baja primero`);
  }
  return aEspacio(await prisma.espacio.update({ where: { id }, data: datosEstado(cambio), include: includeEspacio }));
}
