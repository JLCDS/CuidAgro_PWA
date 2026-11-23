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
  ],
  VETERINARIO: [
    'fincas:consultar',
    'animales:consultar',
    'animales:gestionar',
    'alimentos:consultar',
    'alimentos:gestionar',
    'consumos:registrar',
    'consumos:gestionar',
  ],
  AYUDANTE: ['fincas:consultar', 'animales:consultar', 'alimentos:consultar', 'consumos:registrar'],
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
