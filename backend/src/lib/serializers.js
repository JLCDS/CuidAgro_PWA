import { permisosDe } from './roles.js';

export const includeUsuario = {
  rol: true,
  fincas: { include: { finca: { select: { id: true, nombre: true } } } },
};

// Listas blancas: passwordHash nunca sale de la API.
export function aUsuarioSesion(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol.nombre,
    permisos: permisosDe(u.rol.nombre),
    fincas: u.fincas.map((f) => f.finca).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

export function aUsuarioDetalle(u) {
  const { permisos: _permisos, ...sesion } = aUsuarioSesion(u);
  return {
    ...sesion,
    estado: u.estado,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export function aFinca(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    ubicacion: f.ubicacion,
    descripcion: f.descripcion,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

const aFechaISO = (fecha) => (fecha ? fecha.toISOString().slice(0, 10) : null);

export const includeFinca = { finca: { select: { id: true, nombre: true } } };

function aRegistroBase(r) {
  return {
    id: r.id,
    fincaId: r.fincaId,
    finca: r.finca,
    nombre: r.nombre,
    proposito: r.proposito,
    estado: r.estado,
    motivoBaja: r.motivoBaja,
    observaciones: r.observaciones,
    creadoPorId: r.creadoPorId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function aVacuno(v) {
  return {
    ...aRegistroBase(v),
    sexo: v.sexo,
    raza: v.raza,
    edadMeses: v.edadMeses,
    peso: Number(v.peso),
    fechaLlegada: aFechaISO(v.fechaLlegada),
  };
}

export function aLote(l) {
  return {
    ...aRegistroBase(l),
    tipoAve: l.tipoAve,
    edadMinSemanas: l.edadMinSemanas,
    edadMaxSemanas: l.edadMaxSemanas,
    cantidad: l.cantidad,
    fechaIngreso: aFechaISO(l.fechaIngreso),
  };
}

const bajoStock = (a) => a.stockGramos <= a.stockMinimoGramos;

export function aAlimento(a) {
  return {
    ...aRegistroBase(a),
    tipo: a.tipo,
    stockGramos: a.stockGramos,
    stockMinimoGramos: a.stockMinimoGramos,
    bajoStock: bajoStock(a),
  };
}

export function aEntrada(e) {
  return {
    id: e.id,
    alimentoId: e.alimentoId,
    cantidadGramos: e.cantidadGramos,
    fecha: aFechaISO(e.fecha),
    nota: e.nota,
    registradoPorId: e.registradoPorId,
    createdAt: e.createdAt.toISOString(),
  };
}

/** `relacion` es 'vacuno' o 'lote'; el consumo trae el animal/lote con su finca. */
export function aConsumo(c, relacion) {
  const { finca, ...animal } = c[relacion];
  return {
    id: c.id,
    [`${relacion}Id`]: c[`${relacion}Id`],
    [relacion]: { id: animal.id, nombre: animal.nombre },
    finca,
    alimentoId: c.alimentoId,
    alimento: {
      id: c.alimento.id,
      nombre: c.alimento.nombre,
      stockGramos: c.alimento.stockGramos,
      bajoStock: bajoStock(c.alimento),
    },
    cantidadGramos: c.cantidadGramos,
    jornada: c.jornada,
    fecha: aFechaISO(c.fecha),
    observaciones: c.observaciones,
    registradoPor: c.registradoPor,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
