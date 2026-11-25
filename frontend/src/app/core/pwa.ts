import { computed, effect, inject, Injectable, isDevMode, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from './auth';
import { ColaOffline } from './cola-offline';
import { Conexion } from './conexion';
import { Sincronizador } from './sincronizador';

interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Registro del service worker, aviso de versión nueva, instalación y reacción a señal y mensajes. */
@Injectable({ providedIn: 'root' })
export class Pwa {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly cola = inject(ColaOffline);
  private readonly conexion = inject(Conexion);
  private readonly sincronizador = inject(Sincronizador);

  readonly actualizacionLista = signal(false);
  readonly instalable = signal(false);
  private registro: ServiceWorkerRegistration | null = null;
  private eventoInstalar: EventoInstalar | null = null;
  private recargarAlCambiar = false;

  // Cada vez que entra un usuario (sesión restaurada al abrir la app o login nuevo)
  // se envían sus pendientes. Solo se sigue el id del usuario: sincronizar() lee
  // otras señales (sincronizando, enLinea) y, si se siguieran, el effect se
  // relanzaría al terminar cada sincronización. Al volver la señal ya actúa `online`.
  // computed: la renovación del token crea otro objeto usuario con el mismo id, y eso no debe sincronizar.
  private readonly usuarioId = computed(() => this.auth.usuario()?.id ?? null);
  private readonly sincronizarAlEntrar = effect(() => {
    if (this.usuarioId()) untracked(() => void this.sincronizador.sincronizar());
  });

  /** Se llama una vez al arrancar la app. */
  iniciar(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // se guarda para mostrar "Instalar app" cuando el usuario quiera
      this.eventoInstalar = e as EventoInstalar;
      this.instalable.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.eventoInstalar = null;
      this.instalable.set(false);
    });
    // Al volver la señal se renueva la sesión (si hacía falta) y se envía la cola.
    window.addEventListener('online', () => void this.alVolverLaSenal());

    // Solo en producción: con `ng serve` un SW serviría código viejo mientras se desarrolla.
    if (isDevMode() || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (e) => this.alRecibirMensaje(e.data));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.recargarAlCambiar) window.location.reload();
    });
    const registrar = () => void this.registrar();
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar);
  }

  private async alVolverLaSenal(): Promise<void> {
    if (!this.auth.autenticado()) return;
    await this.sincronizador.sincronizar();
  }

  private alRecibirMensaje(datos: { tipo?: string; url?: string } | null): void {
    switch (datos?.tipo) {
      case 'SINCRONIZAR':
        void this.sincronizador.sincronizar();
        break;
      case 'COLA_CAMBIO':
        void this.cola.refrescar();
        break;
      case 'IR_A':
        if (datos.url) void this.router.navigateByUrl(datos.url);
        break;
    }
  }

  private async registrar(): Promise<void> {
    try {
      this.registro = await navigator.serviceWorker.register('/sw.js');
    } catch {
      return; // sin SW la app sigue funcionando en línea
    }
    const registro = this.registro;
    // Versión nueva ya descargada y esperando (por ejemplo, de una visita anterior).
    if (registro.waiting && navigator.serviceWorker.controller) this.actualizacionLista.set(true);
    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      nuevo?.addEventListener('statechange', () => {
        // "installed" con un controlador activo = es una actualización, no la primera instalación.
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) this.actualizacionLista.set(true);
      });
    });
    // Busca versiones nuevas al volver a la pestaña.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registro.update().catch(() => undefined);
    });
  }

  /** Botón "Actualizar": activa la versión en espera y recarga cuando toma el control. */
  actualizar(): void {
    this.recargarAlCambiar = true;
    this.registro?.waiting?.postMessage({ tipo: 'SKIP_WAITING' });
  }

  async instalar(): Promise<void> {
    const evento = this.eventoInstalar;
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    this.eventoInstalar = null;
    this.instalable.set(false);
  }
}
