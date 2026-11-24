import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { duplicado, noEncontrado } from './errors.js';
import { prisma } from './prisma.js';
import { puedeAccederFinca } from '../middleware/auth.js';

// Utilidades compartidas por vacunos y lotes (mismas reglas de alcance, bajas y nombres).

export const ZONA_HORARIA = 'America/Bogota';

/** Fecha de hoy en Colombia como YYYY-MM-DD (no la del servidor, que puede estar en UTC). */
export const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Orden alfabético en español (sin distinguir mayúsculas ni tildes, Ñ entre N y O, "2" antes de "10"). */
export const compararNombres = (a, b) => collator.compare(a, b);

export const ordenarPorNombre = (registros) =>
  [...registros].sort((a, b) => compararNombres(a.nombre, b.nombre) || a.id.localeCompare(b.id));

export const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const nombreSchema = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(80, 'El nombre no puede superar 80 caracteres')
  // PostgreSQL rechaza el byte NUL en texto: sin esto, la consulta falla con 500.
  .refine((v) => !v.includes('\u0000'), 'El nombre contiene caracteres no válidos');

/** Acepta YYYY-MM-DD real y no futura; devuelve un Date a medianoche UTC, apto para columnas @db.Date. */
export const fechaNoFuturaSchema = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'La fecha no es válida')
  .refine((s) => s <= hoyBogota(), 'La fecha no puede ser futura')
  .transform((s) => new Date(`${s}T00:00:00Z`));

export const fincaIdSchema = z.uuid('Finca inválida');

export const estadoCambioSchema = z.object({
  estado: z.enum(['ACTIVO', 'INACTIVO'], { error: 'Estado inválido' }),
  motivoBaja: textoOpcional(500),
});

/** Query común de los listados. `propositos` son los valores válidos del módulo. */
export const listadoQuerySchema = (propositos) =>
  z.object({
    fincaId: z.uuid().optional(),
    estado: z.enum(['ACTIVO', 'INACTIVO', 'TODOS']).default('ACTIVO'),
    q: z.string().trim().max(120).optional(),
    proposito: z.enum(propositos).optional(),
  });

/** Un id mal formado se trata como inexistente. */
export function idRecurso(valor, recurso) {
  const r = z.uuid().safeParse(valor);
  if (!r.success) throw noEncontrado(recurso);
  return r.data;
}

/** Condición de alcance: el administrador ve todo; el resto, solo sus fincas. */
export function filtroFincas(actor, fincaId) {
  if (fincaId) return puedeAccederFinca(actor, fincaId) ? { fincaId } : { id: { in: [] } };
  return actor.rol === 'ADMINISTRADOR' ? {} : { fincaId: { in: actor.fincas.map((f) => f.id) } };
}

export function filtroListado(actor, { fincaId, estado, q, proposito }, camposBusqueda) {
  return {
    ...filtroFincas(actor, fincaId),
    ...(estado === 'TODOS' ? {} : { estado }),
    ...(proposito ? { proposito } : {}),
    ...(q ? { OR: camposBusqueda.map((campo) => ({ [campo]: { contains: q, mode: 'insensitive' } })) } : {}),
  };
}

/** Finca existente y accesible; si no, responde como si no existiera. */
export async function exigirFinca(actor, fincaId) {
  const finca = puedeAccederFinca(actor, fincaId)
    ? await prisma.finca.findUnique({ where: { id: fincaId }, select: { id: true } })
    : null;
  if (!finca) throw noEncontrado('Finca');
}

/** Estado y motivo de baja: al reactivar se limpia el motivo. */
export const datosEstado = ({ estado, motivoBaja }) => ({
  estado,
  motivoBaja: estado === 'INACTIVO' ? (motivoBaja ?? null) : null,
});

/** Ejecuta una escritura traduciendo la violación del índice único (carrera) a 409. */
export async function conDuplicados(mensaje, operacion) {
  try {
    return await operacion();
  } catch (error) {
    if (error?.code === 'P2002') throw duplicado(mensaje);
    throw error;
  }
}

const TABLAS = {
  vacuno: Prisma.raw('vacunos'),
  loteOviparo: Prisma.raw('lotes_oviparos'),
  alimento: Prisma.raw('alimentos'),
  medicamento: Prisma.raw('medicamentos'),
};

/** Mismo criterio que el índice único (lower en la base), sin comodines de ILIKE. */
export async function exigirNombreLibre(modelo, fincaId, nombre, mensaje, excluirId = null) {
  const tabla = TABLAS[modelo];
  const filas = await prisma.$queryRaw`
    SELECT id FROM ${tabla}
    WHERE finca_id = ${fincaId}::uuid AND lower(nombre) = lower(${nombre})
      AND (${excluirId}::uuid IS NULL OR id <> ${excluirId}::uuid)
    LIMIT 1`;
  if (filas.length > 0) throw duplicado(mensaje);
}
