import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { autenticadoGuard, invitadoGuard, permisoGuard } from './auth.guards';
import { authInterceptor } from './auth.interceptor';
import { RespuestaSesion } from './modelos';

const sesion = (accessToken: string, permisos: RespuestaSesion['usuario']['permisos'] = []): RespuestaSesion => ({
  accessToken,
  usuario: { id: '1', nombre: 'Ana', correo: 'ana@finca.co', rol: 'AYUDANTE', permisos, fincas: [] },
});

describe('sesión en el frontend', () => {
  let auth: Auth;
  let http: HttpClient;
  let backend: HttpTestingController;

  const ruta = {} as ActivatedRouteSnapshot;
  const estado = (url: string) => ({ url }) as RouterStateSnapshot;
  const correr = <T>(fn: () => T): T => TestBed.runInInjectionContext(fn);

  async function iniciarSesion(token: string, permisos: RespuestaSesion['usuario']['permisos'] = []) {
    const pendiente = firstValueFrom(auth.login('ana@finca.co', 'clave'));
    backend.expectOne('/api/auth/login').flush(sesion(token, permisos));
    await pendiente;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('sin sesión redirige a login conservando la ruta pedida', () => {
    const r = correr(() => autenticadoGuard(ruta, estado('/usuarios'))) as UrlTree;
    expect(r.toString()).toBe('/login?volver=%2Fusuarios');
  });

  it('con sesión permite el acceso y aparta del login', async () => {
    await iniciarSesion('t1');
    expect(correr(() => autenticadoGuard(ruta, estado('/usuarios')))).toBe(true);
    expect((correr(() => invitadoGuard(ruta, estado('/login'))) as UrlTree).toString()).toBe('/');
  });

  it('un rol sin el permiso va a la página de no autorizado', async () => {
    await iniciarSesion('t1', ['fincas:consultar']);
    const r = correr(() => permisoGuard('usuarios:gestionar')(ruta, estado('/usuarios'))) as UrlTree;
    expect(r.toString()).toBe('/no-autorizado');
  });

  it('un rol con el permiso entra', async () => {
    await iniciarSesion('t1', ['usuarios:gestionar']);
    expect(correr(() => permisoGuard('usuarios:gestionar')(ruta, estado('/usuarios')))).toBe(true);
  });

  it('adjunta el token a las peticiones', async () => {
    await iniciarSesion('t1');
    http.get('/api/fincas').subscribe();
    const req = backend.expectOne('/api/fincas');
    expect(req.request.headers.get('Authorization')).toBe('Bearer t1');
    req.flush([]);
  });

  it('ante varios 401 renueva una sola vez y reintenta con el token nuevo', async () => {
    await iniciarSesion('viejo');
    const a = firstValueFrom(http.get('/api/fincas'));
    const b = firstValueFrom(http.get('/api/usuarios'));
    backend.expectOne('/api/fincas').flush({}, { status: 401, statusText: 'No' });
    backend.expectOne('/api/usuarios').flush({}, { status: 401, statusText: 'No' });

    backend.expectOne('/api/auth/refresh').flush(sesion('nuevo'));

    const r1 = backend.expectOne('/api/fincas');
    const r2 = backend.expectOne('/api/usuarios');
    expect(r1.request.headers.get('Authorization')).toBe('Bearer nuevo');
    expect(r2.request.headers.get('Authorization')).toBe('Bearer nuevo');
    r1.flush([]);
    r2.flush([]);
    await Promise.all([a, b]);
  });

  it('si la renovación da 401 se cierra la sesión', async () => {
    await iniciarSesion('viejo');
    const a = firstValueFrom(http.get('/api/fincas')).catch((e) => e);
    backend.expectOne('/api/fincas').flush({}, { status: 401, statusText: 'No' });
    backend.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'No' });
    await a;
    expect(auth.autenticado()).toBe(false);
  });

  it('un fallo de red al renovar no borra la sesión', async () => {
    await iniciarSesion('viejo');
    const a = firstValueFrom(auth.renovar()).catch((e) => e);
    backend.expectOne('/api/auth/refresh').error(new ProgressEvent('error'));
    await a;
    expect(auth.autenticado()).toBe(true);
  });
});
