import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { Permiso, RespuestaSesion, UsuarioSesion } from './modelos';

const CLAVE_USUARIO = 'cuidagro.usuario';

function leerUsuarioGuardado(): UsuarioSesion | null {
  try {
    const texto = localStorage.getItem(CLAVE_USUARIO);
    return texto ? (JSON.parse(texto) as UsuarioSesion) : null;
  } catch {
    return null;
  }
}

function escribirUsuarioGuardado(usuario: UsuarioSesion | null): void {
  try {
    if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    else localStorage.removeItem(CLAVE_USUARIO);
  } catch {
    // Sin almacenamiento no hay sesión sin conexión, pero la app sigue funcionando.
  }
}

/** Los datos guardados por el service worker eran de este usuario: se piden borrar al salir. */
function borrarCacheDeLaApi(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ tipo: 'BORRAR_CACHE_API' });
  } catch {
    // Sin service worker no hay caché que borrar.
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly usuarioActual = signal<UsuarioSesion | null>(null);
  // El token de acceso vive solo en memoria; el de renovación, en una cookie httpOnly.
  private token: string | null = null;
  private renovacionEnCurso: Observable<void> | null = null;

  readonly usuario = this.usuarioActual.asReadonly();
  private readonly _sinConexion = signal(false);
  /** Verdadero si la sesión se restauró sin red con el usuario guardado: aún no hay token. */
  readonly sinConexion = this._sinConexion.asReadonly();
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
    return firstValueFrom(
      this.renovar().pipe(
        catchError((error: HttpErrorResponse) => {
          // Sin red (status 0) se entra con el usuario guardado en modo sin conexión; un 401 ya cerró la sesión.
          if (error.status === 0) this.entrarSinConexion();
          return of(undefined);
        }),
      ),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null).pipe(
      catchError(() => of(undefined)),
      tap(() => this.limpiar()),
      map(() => undefined),
    );
  }

  private entrarSinConexion(): void {
    const guardado = leerUsuarioGuardado();
    if (!guardado) return;
    this.usuarioActual.set(guardado);
    this._sinConexion.set(true);
  }

  private guardar(sesion: RespuestaSesion): void {
    this.token = sesion.accessToken;
    this.usuarioActual.set(sesion.usuario);
    this._sinConexion.set(false);
    escribirUsuarioGuardado(sesion.usuario);
  }

  private limpiar(): void {
    this.token = null;
    this.usuarioActual.set(null);
    this._sinConexion.set(false);
    escribirUsuarioGuardado(null);
    borrarCacheDeLaApi();
  }
}
