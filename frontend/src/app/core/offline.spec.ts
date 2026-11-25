import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from './auth';
import { authInterceptor } from './auth.interceptor';
import { Conexion } from './conexion';
import { RespuestaSesion } from './modelos';
import { puedeRecibirPush } from './notificaciones-push';
import {
  claveVapidABytes,
  decidirRespuesta,
  ElementoCola,
  elementosPorEnviar,
  formarElemento,
  nuevoClienteId,
  peticionDe,
  sujetoDe,
} from './offline-logica';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('lógica de la cola sin conexión', () => {
  it('genera uuid v4 distintos', () => {
    const a = nuevoClienteId();
    expect(a).toMatch(UUID);
    expect(nuevoClienteId()).not.toBe(a);
  });

  it('forma el elemento: quita vacíos, agrega clienteId y arranca pendiente', () => {
    const e = formarElemento({
      clienteId: 'abc',
      usuarioId: 'u1',
      tipo: 'consumo-vacuno',
      datos: { vacunoId: 'v1', cantidadGramos: 500, observaciones: undefined, jornada: 'MANANA', nota: null },
      ahora: new Date('2026-11-24T15:00:00.000Z'),
      resumen: { sujeto: 'Lola', detalle: 'Heno, 500 g' },
    });
    expect(e).toEqual({
      clienteId: 'abc',
      usuarioId: 'u1',
      tipo: 'consumo-vacuno',
      datos: { vacunoId: 'v1', cantidadGramos: 500, jornada: 'MANANA', clienteId: 'abc' },
      creadoEn: '2026-11-24T15:00:00.000Z',
      estado: 'pendiente',
      intentos: 0,
      resumen: { sujeto: 'Lola', detalle: 'Heno, 500 g' },
    });
    expect('foto' in e).toBe(false);
  });

  it('conserva la foto y su sujeto', () => {
    const foto = new Blob(['x'], { type: 'image/jpeg' });
    const e = formarElemento({ clienteId: 'n1', usuarioId: 'u1', tipo: 'novedad', datos: { descripcion: 'cojea' }, foto });
    expect(e.foto).toBe(foto);
    expect(sujetoDe(e)).toBe('Sin nombre');
    expect(peticionDe(e)).toEqual({ url: '/api/novedades', campos: { descripcion: 'cojea', clienteId: 'n1' }, foto });
  });

  it('decide qué hacer con cada respuesta', () => {
    expect(decidirRespuesta(201)).toEqual({ accion: 'borrar' });
    expect(decidirRespuesta(200)).toEqual({ accion: 'borrar' }); // ya existía: idempotencia
    for (const s of [400, 403, 404, 409]) expect(decidirRespuesta(s)).toEqual({ accion: 'error' });
    for (const s of [0, 401, 500, 502, 503]) expect(decidirRespuesta(s)).toEqual({ accion: 'detener' });
  });

  it('envía solo lo del usuario actual, sin errores y del más viejo al más nuevo', () => {
    const base = { datos: {}, intentos: 0 } as const;
    const lista: ElementoCola[] = [
      { ...base, clienteId: 'c', usuarioId: 'u1', tipo: 'novedad', creadoEn: '2026-11-24T12:00:00.000Z', estado: 'pendiente' },
      { ...base, clienteId: 'a', usuarioId: 'u1', tipo: 'consumo-lote', creadoEn: '2026-11-24T10:00:00.000Z', estado: 'enviando' },
      { ...base, clienteId: 'x', usuarioId: 'u2', tipo: 'novedad', creadoEn: '2026-11-24T09:00:00.000Z', estado: 'pendiente' },
      { ...base, clienteId: 'e', usuarioId: 'u1', tipo: 'novedad', creadoEn: '2026-11-24T08:00:00.000Z', estado: 'error' },
    ];
    expect(elementosPorEnviar(lista, 'u1').map((e) => e.clienteId)).toEqual(['a', 'c']);
  });

  it('convierte la clave VAPID base64url a bytes', () => {
    // "hola" en base64url sin relleno.
    expect(Array.from(claveVapidABytes('aG9sYQ'))).toEqual([104, 111, 108, 97]);
    expect(Array.from(claveVapidABytes('-_8'))).toEqual([251, 255]);
  });

  it('solo quien gestiona novedades o inventario puede recibir push', () => {
    expect(puedeRecibirPush(['novedades:gestionar'])).toBe(true);
    expect(puedeRecibirPush(['medicamentos:gestionar', 'animales:consultar'])).toBe(true);
    expect(puedeRecibirPush(['novedades:registrar', 'consumos:registrar'])).toBe(false);
  });
});

describe('sesión sin conexión', () => {
  const sesion: RespuestaSesion = {
    accessToken: 't1',
    usuario: { id: '1', nombre: 'Ana', correo: 'ana@finca.co', rol: 'AYUDANTE', permisos: ['consumos:registrar'], fincas: [] },
  };
  let auth: Auth;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(Auth);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function iniciarSesion() {
    const p = new Promise<void>((ok) => auth.login('ana@finca.co', 'x').subscribe(() => ok()));
    backend.expectOne('/api/auth/login').flush(sesion);
    await p;
  }

  it('guarda el usuario sin el token al iniciar sesión', async () => {
    await iniciarSesion();
    const guardado = JSON.parse(localStorage.getItem('cuidagro.usuario') ?? 'null');
    expect(guardado.id).toBe('1');
    expect(JSON.stringify(guardado)).not.toContain('t1');
  });

  it('sin red al restaurar, entra con el usuario guardado y sin token', async () => {
    localStorage.setItem('cuidagro.usuario', JSON.stringify(sesion.usuario));
    const p = auth.restaurar();
    backend.expectOne('/api/auth/refresh').error(new ProgressEvent('error'), { status: 0 });
    await p;
    expect(auth.autenticado()).toBe(true);
    expect(auth.sinConexion()).toBe(true);
    expect(auth.accessToken).toBeNull();
    expect(auth.tienePermiso('consumos:registrar')).toBe(true);
  });

  it('sin red y sin usuario guardado, la sesión queda cerrada', async () => {
    const p = auth.restaurar();
    backend.expectOne('/api/auth/refresh').error(new ProgressEvent('error'), { status: 0 });
    await p;
    expect(auth.autenticado()).toBe(false);
  });

  it('un 401 al restaurar cierra la sesión y borra el usuario guardado', async () => {
    localStorage.setItem('cuidagro.usuario', JSON.stringify(sesion.usuario));
    const p = auth.restaurar();
    backend.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'No autorizado' });
    await p;
    expect(auth.autenticado()).toBe(false);
    expect(localStorage.getItem('cuidagro.usuario')).toBeNull();
  });

  it('al volver la señal, renovar() deja la sesión normal', async () => {
    localStorage.setItem('cuidagro.usuario', JSON.stringify(sesion.usuario));
    const p = auth.restaurar();
    backend.expectOne('/api/auth/refresh').error(new ProgressEvent('error'), { status: 0 });
    await p;
    auth.renovar().subscribe();
    backend.expectOne('/api/auth/refresh').flush(sesion);
    expect(auth.sinConexion()).toBe(false);
    expect(auth.accessToken).toBe('t1');
  });

  it('el interceptor marca los datos que llegan con X-Desde-Cache', () => {
    const http = TestBed.inject(HttpClient);
    const conexion = TestBed.inject(Conexion);
    http.get('/api/vacunos').subscribe();
    backend.expectOne('/api/vacunos').flush([], { headers: { 'X-Desde-Cache': '1' } });
    expect(conexion.desdeCache()).toBe(true);
    http.get('/api/vacunos').subscribe();
    backend.expectOne('/api/vacunos').flush([]);
    expect(conexion.desdeCache()).toBe(false);
  });
});
