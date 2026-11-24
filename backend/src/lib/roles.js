import { prisma } from './prisma.js';

export const ROLES = ['ADMINISTRADOR', 'VETERINARIO', 'AYUDANTE'];
export const ESTADOS_USUARIO = ['ACTIVO', 'INACTIVO'];

const DESCRIPCIONES = {
  ADMINISTRADOR: 'Gestiona usuarios, fincas y la configuración general.',
  VETERINARIO: 'Veterinario o encargado: supervisa animales, salud y reportes.',
  AYUDANTE: 'Trabajador de campo: registra alimentación y novedades.',
};

// Cada fase agrega aquí los permisos de sus módulos.
const MATRIZ_PERMISOS = {
  ADMINISTRADOR: [
    'usuarios:gestionar',
    'fincas:gestionar',
    'fincas:consultar',
    'animales:consultar',
    'animales:gestionar',
    'alimentos:consultar',
    'alimentos:gestionar',
    'consumos:registrar',
    'consumos:gestionar',
    'novedades:registrar',
    'novedades:gestionar',
    'salud:consultar',
    'salud:gestionar',
    'medicamentos:consultar',
    'medicamentos:gestionar',
    'tratamientos:consultar',
    'tratamientos:registrar',
    'dashboard:consultar',
    'reportes:consultar',
  ],
  VETERINARIO: [
    'fincas:consultar',
    'animales:consultar',
    'animales:gestionar',
    'alimentos:consultar',
    'alimentos:gestionar',
    'consumos:registrar',
    'consumos:gestionar',
    'novedades:registrar',
    'novedades:gestionar',
    'salud:consultar',
    'salud:gestionar',
    'medicamentos:consultar',
    'medicamentos:gestionar',
    'tratamientos:consultar',
    'tratamientos:registrar',
    'dashboard:consultar',
    'reportes:consultar',
  ],
  AYUDANTE: ['fincas:consultar', 'animales:consultar', 'alimentos:consultar', 'consumos:registrar', 'novedades:registrar', 'salud:consultar', 'medicamentos:consultar', 'tratamientos:consultar', 'dashboard:consultar'],
};

export const permisosDe = (rol) => MATRIZ_PERMISOS[rol] ?? [];
export const tienePermiso = (rol, permiso) => permisosDe(rol).includes(permiso);

/** El administrador tiene alcance global; los demás roles necesitan alguna finca. */
export const rolRequiereFinca = (rol) => rol !== 'ADMINISTRADOR';

export async function sembrarRoles() {
  for (const nombre of ROLES) {
    const descripcion = DESCRIPCIONES[nombre];
    await prisma.rol.upsert({ where: { nombre }, update: { descripcion }, create: { nombre, descripcion } });
  }
}
