import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { Auth } from './auth';
import { Conexion } from './conexion';

const RUTAS_SIN_TOKEN = /\/api\/auth\/(login|refresh|logout)$/;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (RUTAS_SIN_TOKEN.test(req.url)) return next(req);

  const auth = inject(Auth);
  const router = inject(Router);
  const conexion = inject(Conexion);
  const conToken = (r: HttpRequest<unknown>) =>
    auth.accessToken ? r.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken}` } }) : r;

  // El service worker marca con X-Desde-Cache las respuestas GET que sirvió desde su caché (sin red).
  const registrar = tap((evento: HttpEvent<unknown>) => {
    if (evento instanceof HttpResponse && req.method === 'GET') {
      conexion.registrarRespuesta(evento.headers.get('X-Desde-Cache') === '1');
    }
  });

  return next(conToken(req)).pipe(
    registrar,
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) return throwError(() => error);

      return auth.renovar().pipe(
        catchError((errorRenovar: HttpErrorResponse) => {
          if (errorRenovar.status === 401) void router.navigate(['/login']);
          return throwError(() => errorRenovar);
        }),
        switchMap(() => next(conToken(req)).pipe(registrar)),
      );
    }),
  );
};
