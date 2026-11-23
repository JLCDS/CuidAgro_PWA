import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { Auth } from './auth';

const RUTAS_SIN_TOKEN = /\/api\/auth\/(login|refresh|logout)$/;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (RUTAS_SIN_TOKEN.test(req.url)) return next(req);

  const auth = inject(Auth);
  const router = inject(Router);
  const conToken = (r: HttpRequest<unknown>) =>
    auth.accessToken ? r.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken}` } }) : r;

  return next(conToken(req)).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) return throwError(() => error);

      return auth.renovar().pipe(
        catchError((errorRenovar: HttpErrorResponse) => {
          if (errorRenovar.status === 401) void router.navigate(['/login']);
          return throwError(() => errorRenovar);
        }),
        switchMap(() => next(conToken(req))),
      );
    }),
  );
};
