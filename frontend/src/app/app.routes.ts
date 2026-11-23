import { Routes } from '@angular/router';
import { autenticadoGuard, invitadoGuard, permisoGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · CuidAgro',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./paginas/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [autenticadoGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Inicio · CuidAgro',
        loadComponent: () => import('./paginas/inicio').then((m) => m.Inicio),
      },
      {
        path: 'usuarios',
        title: 'Usuarios · CuidAgro',
        canActivate: [permisoGuard('usuarios:gestionar')],
        loadComponent: () => import('./paginas/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'vacunos',
        title: 'Vacunos · CuidAgro',
        canActivate: [permisoGuard('animales:consultar')],
        loadComponent: () => import('./paginas/vacunos').then((m) => m.Vacunos),
      },
      {
        path: 'lotes',
        title: 'Lotes · CuidAgro',
        canActivate: [permisoGuard('animales:consultar')],
        loadComponent: () => import('./paginas/lotes').then((m) => m.Lotes),
      },
      {
        path: 'alimentos',
        title: 'Inventario · CuidAgro',
        canActivate: [permisoGuard('alimentos:consultar')],
        loadComponent: () => import('./paginas/alimentos').then((m) => m.Alimentos),
      },
      {
        path: 'consumos',
        title: 'Alimentación · CuidAgro',
        canActivate: [permisoGuard('consumos:registrar')],
        loadComponent: () => import('./paginas/consumos').then((m) => m.Consumos),
      },
      {
        path: 'fincas',
        title: 'Fincas · CuidAgro',
        canActivate: [permisoGuard('fincas:gestionar')],
        loadComponent: () => import('./paginas/fincas').then((m) => m.Fincas),
      },
      {
        path: 'no-autorizado',
        title: 'Sin permiso · CuidAgro',
        loadComponent: () => import('./paginas/no-autorizado').then((m) => m.NoAutorizado),
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada · CuidAgro',
    loadComponent: () => import('./paginas/no-encontrada').then((m) => m.NoEncontrada),
  },
];
