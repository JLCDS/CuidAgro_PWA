import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { Permiso, RespuestaSesion, UsuarioSesion } from './modelos';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly usuarioActual = signal<UsuarioSesion | null>(null);
  // El token de acceso vive solo en memoria; el de renovación, en una cookie httpOnly.
  private token: string | null = null;
  private renovacionEnCurso: Observable<void> | null = null;

  readonly usuario = this.usuarioActual.asReadonly();
  readonly autenticado = computed(() => this.usuarioActual() !== null);

  get accessToken(): string | null {
    return this.token;
  }

  tienePermiso(permiso: Permiso): boolean {
    return this.usuarioActual()?.permisos.includes(permiso) ?? false;
  }

  login(correo: string, password: string): Observable<void> {
    return this.http.post<RespuestaSesion>('/api/auth/login', { correo, password }).pipe(
      tap((sesion) => this.guardar(sesion)),
      map(() => undefined),
    );
  }

  /** Comparte una sola petición entre todas las llamadas que reciben 401 a la vez. */
  renovar(): Observable<void> {
    this.renovacionEnCurso ??= this.http.post<RespuestaSesion>('/api/auth/refresh', null).pipe(
      tap((sesion) => this.guardar(sesion)),
      map(() => undefined),
      catchError((error: HttpErrorResponse) => {
        // Sin señal no se pierde la sesión: solo un 401 la invalida.
        if (error.status === 401) this.limpiar();
        return throwError(() => error);
      }),
      finalize(() => (this.renovacionEnCurso = null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.renovacionEnCurso;
  }

  restaurar(): Promise<void> {
    return firstValueFrom(this.renovar().pipe(catchError(() => of(undefined))));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null).pipe(
      catchError(() => of(undefined)),
      tap(() => this.limpiar()),
      map(() => undefined),
    );
  }

  private guardar(sesion: RespuestaSesion): void {
    this.token = sesion.accessToken;
    this.usuarioActual.set(sesion.usuario);
  }

  private limpiar(): void {
    this.token = null;
    this.usuarioActual.set(null);
  }
}
