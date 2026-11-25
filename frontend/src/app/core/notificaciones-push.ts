import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { Permiso } from './modelos';
import { claveVapidABytes } from './offline-logica';

const PERMISOS_PUSH: Permiso[] = ['novedades:gestionar', 'alimentos:gestionar', 'medicamentos:gestionar'];

/** Quien recibe avisos: los roles que gestionan novedades o inventario. */
export function puedeRecibirPush(permisos: readonly Permiso[]): boolean {
  return PERMISOS_PUSH.some((p) => permisos.includes(p));
}

function navegadorSoportaPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type EstadoPush = 'no-disponible' | 'inactivo' | 'activo' | 'bloqueado';

/** Notificaciones push (HU021): activar y desactivar en este dispositivo. */
@Injectable({ providedIn: 'root' })
export class NotificacionesPush {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  private readonly _estado = signal<EstadoPush>('no-disponible');
  private clavePublica: string | null = null;
  readonly estado = this._estado.asReadonly();
  readonly trabajando = signal(false);
  readonly error = signal<string | null>(null);
  /** La opción solo aparece si el usuario puede recibir avisos y el navegador y el servidor lo permiten. */
  readonly visible = computed(() => this._estado() !== 'no-disponible');

  constructor() {
    effect(() => {
      const usuario = this.auth.usuario();
      untracked(() => {
        if (usuario && puedeRecibirPush(usuario.permisos)) void this.revisar();
        else this._estado.set('no-disponible');
      });
    });
  }

  private async registroSw(): Promise<ServiceWorkerRegistration | null> {
    // Sin service worker (ng serve) no hay push: no se espera a `ready`, que nunca llegaría.
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  }

  /** Consulta si el servidor tiene push habilitado y si este dispositivo ya está suscrito. */
  private async revisar(): Promise<void> {
    if (!navegadorSoportaPush() || !navigator.onLine) return;
    try {
      const registro = await this.registroSw();
      if (!registro) return;
      const info = await firstValueFrom(
        this.http.get<{ habilitado: boolean; clavePublica: string | null }>('/api/push/clave-publica'),
      );
      if (!info.habilitado || !info.clavePublica) {
        this._estado.set('no-disponible');
        return;
      }
      this.clavePublica = info.clavePublica;
      const suscripcion = await registro.pushManager.getSubscription();
      if (Notification.permission === 'denied') this._estado.set('bloqueado');
      else this._estado.set(suscripcion ? 'activo' : 'inactivo');
    } catch {
      // Sin red o sin la ruta: la opción simplemente no aparece.
    }
  }

  async activar(): Promise<void> {
    this.error.set(null);
    if (!this.clavePublica) return;
    this.trabajando.set(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        this._estado.set(permiso === 'denied' ? 'bloqueado' : 'inactivo');
        if (permiso === 'denied') this.error.set('El navegador bloqueó las notificaciones. Actívalas en los ajustes del sitio.');
        return;
      }
      const registro = await this.registroSw();
      if (!registro) throw new Error('Sin service worker');
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: claveVapidABytes(this.clavePublica),
        }));
      const { endpoint, keys } = suscripcion.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await firstValueFrom(this.http.post('/api/push/suscripciones', { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }));
      this._estado.set('activo');
    } catch {
      this.error.set('No se pudieron activar las notificaciones. Intenta de nuevo con conexión.');
    } finally {
      this.trabajando.set(false);
    }
  }

  async desactivar(): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    try {
      await this.darDeBaja();
      this._estado.set('inactivo');
    } catch {
      this.error.set('No se pudieron desactivar las notificaciones. Intenta de nuevo con conexión.');
    } finally {
      this.trabajando.set(false);
    }
  }

  /** Antes de cerrar sesión: la suscripción de este dispositivo ya no debe recibir avisos de este usuario. Nunca falla. */
  async alCerrarSesion(): Promise<void> {
    try {
      if (navegadorSoportaPush()) await this.darDeBaja();
    } catch {
      // Sin red no se puede avisar al servidor; el servidor la borra solo cuando el servicio de push la rechace.
    }
  }

  private async darDeBaja(): Promise<void> {
    const registro = await this.registroSw();
    const suscripcion = await registro?.pushManager.getSubscription();
    if (!suscripcion) return;
    await firstValueFrom(this.http.delete('/api/push/suscripciones', { body: { endpoint: suscripcion.endpoint } }));
    await suscripcion.unsubscribe();
  }
}
