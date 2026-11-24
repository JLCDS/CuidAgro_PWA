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

const sujeto = (r) => (r ? { id: r.id, nombre: r.nombre } : null);

export const includeNovedad = {
  finca: { select: { id: true, nombre: true } },
  vacuno: { select: { id: true, nombre: true } },
  lote: { select: { id: true, nombre: true } },
  registradoPor: { select: { id: true, nombre: true } },
  _count: { select: { comentarios: true } },
};

export function aComentario(c) {
  return {
    id: c.id,
    novedadId: c.novedadId,
    autorId: c.autorId,
    autor: c.autor ? { id: c.autor.id, nombre: c.autor.nombre } : undefined,
    texto: c.texto,
    createdAt: c.createdAt.toISOString(),
  };
}

const numeroONulo = (d) => (d === null || d === undefined ? null : Number(d));

/** La novedad nunca expone `fotoArchivo`; la foto se pide por `fotoUrl`. */
export function aNovedad(n) {
  const base = {
    id: n.id,
    fincaId: n.fincaId,
    vacunoId: n.vacunoId,
    loteId: n.loteId,
    tipo: n.tipo,
    prioridad: n.prioridad,
    descripcion: n.descripcion,
    fechaHora: n.fechaHora.toISOString(),
    latitud: numeroONulo(n.latitud),
    longitud: numeroONulo(n.longitud),
    precisionMetros: n.precisionMetros,
    fotoMime: n.fotoMime,
    fotoBytes: n.fotoBytes,
    tieneFoto: Boolean(n.fotoArchivo),
    fotoUrl: n.fotoArchivo ? `/api/novedades/${n.id}/foto` : null,
    estado: n.estado,
    cerradaEn: n.cerradaEn ? n.cerradaEn.toISOString() : null,
    totalComentarios: n._count.comentarios,
    vacuno: sujeto(n.vacuno),
    lote: sujeto(n.lote),
    finca: n.finca,
    registradoPorId: n.registradoPorId,
    registradoPor: n.registradoPor,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
  return n.comentarios ? { ...base, comentarios: n.comentarios.map(aComentario) } : base;
}

export const includeCaso = {
  finca: { select: { id: true, nombre: true } },
  vacuno: { select: { id: true, nombre: true } },
  lote: { select: { id: true, nombre: true } },
  novedad: { select: { id: true, tipo: true, fechaHora: true } },
  registradoPor: { select: { id: true, nombre: true } },
};

export const ESTADOS_CASO_ACTIVOS = ['EN_OBSERVACION', 'EN_TRATAMIENTO'];

export function aCasoSalud(c) {
  return {
    id: c.id,
    fincaId: c.fincaId,
    vacunoId: c.vacunoId,
    loteId: c.loteId,
    novedadId: c.novedadId,
    diagnostico: c.diagnostico,
    sintomas: c.sintomas,
    estado: c.estado,
    activo: ESTADOS_CASO_ACTIVOS.includes(c.estado),
    fechaInicio: aFechaISO(c.fechaInicio),
    fechaFin: aFechaISO(c.fechaFin),
    animalesAfectados: c.animalesAfectados,
    observaciones: c.observaciones,
    vacuno: sujeto(c.vacuno),
    lote: sujeto(c.lote),
    finca: c.finca,
    novedad: c.novedad ? { id: c.novedad.id, tipo: c.novedad.tipo, fechaHora: c.novedad.fechaHora.toISOString() } : null,
    registradoPorId: c.registradoPorId,
    registradoPor: c.registradoPor,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ---- Medicamentos y tratamientos ----

const DIAS_POR_VENCER = 30;
const DIA_MS = 86_400_000;

/** `hoy` es YYYY-MM-DD (Bogotá). Indicadores de vencimiento de una fecha (o null). */
export function estadoVencimiento(fechaVencimiento, hoy) {
  if (!fechaVencimiento) return { vencido: false, porVencer: false };
  const dias = Math.round((fechaVencimiento - new Date(`${hoy}T00:00:00Z`)) / DIA_MS);
  return { vencido: dias < 0, porVencer: dias >= 0 && dias <= DIAS_POR_VENCER };
}

export const bajoStockMedicamento = (m) => Number(m.stock) <= Number(m.stockMinimo);

export function aMedicamento(m, hoy) {
  return {
    id: m.id,
    fincaId: m.fincaId,
    finca: m.finca,
    nombre: m.nombre,
    tipo: m.tipo,
    unidad: m.unidad,
    stock: Number(m.stock),
    stockMinimo: Number(m.stockMinimo),
    fechaVencimiento: aFechaISO(m.fechaVencimiento),
    laboratorio: m.laboratorio,
    diasRetiroCarne: m.diasRetiroCarne,
    diasRetiroLeche: m.diasRetiroLeche,
    estado: m.estado,
    motivoBaja: m.motivoBaja,
    observaciones: m.observaciones,
    bajoStock: bajoStockMedicamento(m),
    ...estadoVencimiento(m.fechaVencimiento, hoy),
    creadoPorId: m.creadoPorId,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function aEntradaMedicamento(e) {
  return {
    id: e.id,
    medicamentoId: e.medicamentoId,
    cantidad: Number(e.cantidad),
    fecha: aFechaISO(e.fecha),
    fechaVencimiento: aFechaISO(e.fechaVencimiento),
    nota: e.nota,
    registradoPorId: e.registradoPorId,
    createdAt: e.createdAt.toISOString(),
  };
}

export const includeTratamiento = {
  finca: { select: { id: true, nombre: true } },
  vacuno: { select: { id: true, nombre: true } },
  lote: { select: { id: true, nombre: true } },
  medicamento: { select: { id: true, nombre: true, unidad: true, stock: true, stockMinimo: true } },
  casoSalud: { select: { id: true, diagnostico: true } },
  registradoPor: { select: { id: true, nombre: true } },
};

/** `fecha` + `dias` como YYYY-MM-DD, o null si no hay días de retiro. */
const finRetiro = (fecha, dias) =>
  dias === null || dias === undefined ? null : new Date(fecha.getTime() + dias * DIA_MS).toISOString().slice(0, 10);

export function aTratamiento(t, hoy) {
  const finRetiroCarne = finRetiro(t.fecha, t.diasRetiroCarne);
  const finRetiroLeche = finRetiro(t.fecha, t.diasRetiroLeche);
  return {
    id: t.id,
    fincaId: t.fincaId,
    vacunoId: t.vacunoId,
    loteId: t.loteId,
    casoSaludId: t.casoSaludId,
    medicamentoId: t.medicamentoId,
    dosis: Number(t.dosis),
    via: t.via,
    fecha: aFechaISO(t.fecha),
    diasRetiroCarne: t.diasRetiroCarne,
    diasRetiroLeche: t.diasRetiroLeche,
    finRetiroCarne,
    finRetiroLeche,
    enRetiro: [finRetiroCarne, finRetiroLeche].some((f) => f !== null && f >= hoy),
    observaciones: t.observaciones,
    vacuno: sujeto(t.vacuno),
    lote: sujeto(t.lote),
    medicamento: {
      id: t.medicamento.id,
      nombre: t.medicamento.nombre,
      unidad: t.medicamento.unidad,
      stock: Number(t.medicamento.stock),
      bajoStock: bajoStockMedicamento(t.medicamento),
    },
    casoSalud: t.casoSalud ? { id: t.casoSalud.id, diagnostico: t.casoSalud.diagnostico } : null,
    finca: t.finca,
    registradoPorId: t.registradoPorId,
    registradoPor: t.registradoPor,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
