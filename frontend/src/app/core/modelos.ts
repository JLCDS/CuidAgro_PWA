export type Rol = 'ADMINISTRADOR' | 'VETERINARIO' | 'AYUDANTE';
export type EstadoUsuario = 'ACTIVO' | 'INACTIVO';
export type Permiso =
  | 'dashboard:consultar'
  | 'reportes:consultar'
  | 'usuarios:gestionar'
  | 'fincas:gestionar'
  | 'fincas:consultar'
  | 'animales:consultar'
  | 'animales:gestionar'
  | 'alimentos:consultar'
  | 'alimentos:gestionar'
  | 'consumos:registrar'
  | 'consumos:gestionar'
  | 'novedades:registrar'
  | 'novedades:gestionar'
  | 'salud:consultar'
  | 'salud:gestionar'
  | 'medicamentos:consultar'
  | 'medicamentos:gestionar'
  | 'tratamientos:consultar'
  | 'tratamientos:registrar';

export const ROLES: { valor: Rol; etiqueta: string }[] = [
  { valor: 'ADMINISTRADOR', etiqueta: 'Administrador' },
  { valor: 'VETERINARIO', etiqueta: 'Veterinario / Encargado' },
  { valor: 'AYUDANTE', etiqueta: 'Ayudante' },
];

export const etiquetaRol = (rol: Rol): string => ROLES.find((r) => r.valor === rol)?.etiqueta ?? rol;

export interface FincaResumen {
  id: string;
  nombre: string;
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  permisos: Permiso[];
  fincas: FincaResumen[];
}

export interface UsuarioDetalle extends Omit<UsuarioSesion, 'permisos'> {
  estado: EstadoUsuario;
  createdAt: string;
  updatedAt: string;
}

export interface Finca extends FincaResumen {
  ubicacion: string | null;
  descripcion: string | null;
}

export interface Pagina<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RespuestaSesion {
  accessToken: string;
  usuario: UsuarioSesion;
}

export type Sexo = 'MACHO' | 'HEMBRA';
export type PropositoVacuno = 'ALIMENTACION' | 'PRODUCCION_LECHERA' | 'ENGORDE';
export type PropositoLote = 'PRODUCCION' | 'ALIMENTACION';
export type EstadoRegistro = 'ACTIVO' | 'INACTIVO';
export type FiltroEstado = EstadoRegistro | 'TODOS';

export const SEXOS: { valor: Sexo; etiqueta: string }[] = [
  { valor: 'HEMBRA', etiqueta: 'Hembra' },
  { valor: 'MACHO', etiqueta: 'Macho' },
];

export const PROPOSITOS_VACUNO: { valor: PropositoVacuno; etiqueta: string }[] = [
  { valor: 'ALIMENTACION', etiqueta: 'Alimentación' },
  { valor: 'PRODUCCION_LECHERA', etiqueta: 'Producción lechera' },
  { valor: 'ENGORDE', etiqueta: 'Engorde' },
];

export const PROPOSITOS_LOTE: { valor: PropositoLote; etiqueta: string }[] = [
  { valor: 'PRODUCCION', etiqueta: 'Producción' },
  { valor: 'ALIMENTACION', etiqueta: 'Alimentación' },
];

export const etiquetaDe = (opciones: { valor: string; etiqueta: string }[], valor: string): string =>
  opciones.find((o) => o.valor === valor)?.etiqueta ?? valor;

/** Fecha de hoy en Colombia (YYYY-MM-DD), igual que valida el backend. */
export const hoyBogota = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export function formatearEdadMeses(meses: number): string {
  if (meses < 24) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const resto = meses % 12;
  const anios = Math.floor(meses / 12);
  return resto === 0 ? `${anios} años` : `${anios} años y ${resto} ${resto === 1 ? 'mes' : 'meses'}`;
}

export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

interface RegistroBase {
  id: string;
  fincaId: string;
  finca: FincaResumen;
  nombre: string;
  estado: EstadoRegistro;
  motivoBaja: string | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vacuno extends RegistroBase {
  sexo: Sexo;
  raza: string;
  edadMeses: number;
  peso: number;
  fechaLlegada: string;
  proposito: PropositoVacuno;
}

export interface EspacioResumen {
  id: string;
  codigo: string;
}

export interface EdadActual {
  minSemanas: number;
  maxSemanas: number;
  semanaVida: number;
}

export interface RacionSugerida {
  semanaVida: number;
  gramosAveDia: number;
  gramosDia: number;
}

export type TipoEspacio = 'CUADRANTE' | 'ZONA' | 'OTRO';

export const TIPOS_ESPACIO: { valor: TipoEspacio; etiqueta: string }[] = [
  { valor: 'CUADRANTE', etiqueta: 'Cuadrante' },
  { valor: 'ZONA', etiqueta: 'Zona' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export interface Espacio {
  id: string;
  fincaId: string;
  codigo: string;
  nombre: string | null;
  tipo: TipoEspacio;
  capacidad: number | null;
  estado: EstadoRegistro;
  motivoBaja: string | null;
  observaciones: string | null;
  loteActual: {
    id: string;
    nombre: string;
    cantidad: number;
    proposito: PropositoLote;
    fechaIngreso: string | null;
    edadActual: EdadActual;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lote extends RegistroBase {
  tipoAve: string | null;
  espacio?: EspacioResumen | null;
  edadActual?: EdadActual;
  racionSugerida?: RacionSugerida;
  edadMinSemanas: number;
  edadMaxSemanas: number;
  cantidad: number;
  proposito: PropositoLote;
  fechaIngreso: string | null;
}

export type TipoAlimento = 'CONCENTRADO' | 'FORRAJE' | 'GRANO' | 'SUPLEMENTO' | 'SAL_MINERAL' | 'OTRO';
export type Jornada = 'MANANA' | 'TARDE' | 'NOCHE';

export const TIPOS_ALIMENTO: { valor: TipoAlimento; etiqueta: string }[] = [
  { valor: 'CONCENTRADO', etiqueta: 'Concentrado' },
  { valor: 'FORRAJE', etiqueta: 'Forraje' },
  { valor: 'GRANO', etiqueta: 'Grano' },
  { valor: 'SUPLEMENTO', etiqueta: 'Suplemento' },
  { valor: 'SAL_MINERAL', etiqueta: 'Sal mineral' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const JORNADAS: { valor: Jornada; etiqueta: string }[] = [
  { valor: 'MANANA', etiqueta: 'Mañana' },
  { valor: 'TARDE', etiqueta: 'Tarde' },
  { valor: 'NOCHE', etiqueta: 'Noche' },
];

/** Jornada sugerida según la hora en Colombia: antes de 12 mañana, antes de 18 tarde, si no noche. */
export function jornadaActual(): Jornada {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Bogota' }).format(new Date()),
  );
  return hora < 12 ? 'MANANA' : hora < 18 ? 'TARDE' : 'NOCHE';
}

/** Gramos legibles: kg desde 1000 g. */
export function formatearGramos(gramos: number): string {
  if (Math.abs(gramos) < 1000) return `${gramos} g`;
  return `${(gramos / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg`;
}

export interface Alimento {
  id: string;
  fincaId: string;
  finca: FincaResumen;
  nombre: string;
  tipo: TipoAlimento;
  stockGramos: number;
  stockMinimoGramos: number;
  bajoStock: boolean;
  estado: EstadoRegistro;
  motivoBaja: string | null;
  observaciones: string | null;
}

export interface EntradaAlimento {
  id: string;
  alimentoId: string;
  cantidadGramos: number;
  fecha: string;
  nota: string | null;
}

export interface Movimiento {
  tipo: 'ENTRADA' | 'CONSUMO_VACUNO' | 'CONSUMO_LOTE';
  id: string;
  fecha: string;
  cantidadGramos: number;
  detalle: string | null;
  registradoPor: FincaResumen;
}

export type TipoConsumo = 'vacunos' | 'lotes';

export interface Consumo {
  id: string;
  vacuno?: FincaResumen;
  lote?: FincaResumen;
  /** Espacio donde ocurrió el consumo de un lote (instantánea fijada por el servidor). */
  espacio?: EspacioResumen | null;
  finca: FincaResumen;
  alimentoId: string;
  alimento: { id: string; nombre: string; stockGramos: number; bajoStock: boolean };
  cantidadGramos: number;
  jornada: Jornada;
  fecha: string;
  observaciones: string | null;
  registradoPor: FincaResumen;
}
