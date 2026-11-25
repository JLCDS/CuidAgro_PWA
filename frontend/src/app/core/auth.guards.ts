import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Permiso } from './modelos';

export const autenticadoGuard: CanActivateFn = (_ruta, estado) => {
  if (inject(Auth).autenticado()) return true;
  const queryParams = estado.url === '/' ? {} : { volver: estado.url };
  return inject(Router).createUrlTree(['/login'], { queryParams });
};

export const invitadoGuard: CanActivateFn = () =>
  inject(Auth).autenticado() ? inject(Router).createUrlTree(['/']) : true;

/** Solo oculta la interfaz: la autorización real la hace la API en cada petición. */
export const permisoGuard =
  (permiso: Permiso): CanActivateFn =>
  () =>
    inject(Auth).tienePermiso(permiso) || inject(Router).createUrlTree(['/no-autorizado']);

/** Pasa si el usuario tiene al menos uno de los permisos. */
export const algunPermisoGuard =
  (...permisos: Permiso[]): CanActivateFn =>
  () =>
    permisos.some((p) => inject(Auth).tienePermiso(p)) || inject(Router).createUrlTree(['/no-autorizado']);
