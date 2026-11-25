import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { ColaOffline } from './cola-offline';
import { Conexion } from './conexion';
import { mensajeDeError } from './errores';
import { decidirRespuesta, ElementoCola, elementosPorEnviar, NuevoPendiente, peticionDe } from './offline-logica';

const ETIQUETA_SYNC = 'cuidagro-sync';

type RegistroConSync = ServiceWorkerRegistration & { sync?: { register(etiqueta: string): Promise<void> } };

/**
 * Envía la cola cuando hay señal. El service worker hace lo mismo en su evento `sync`
 * cuando no hay pestañas abiertas; ambos leen la misma base IndexedDB y el servidor
 * descarta duplicados por `clienteId`.
 */
@Injectable({ providedIn: 'root' })
export class Sincronizador {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly cola = inject(ColaOffline);
  private readonly conexion = inject(Conexion);
  private readonly router = inject(Router);

  readonly sincronizando = signal(false);
  /** Sube cada vez que algo se envió: las pantallas pueden recargar sus listas. */
  readonly enviados = signal(0);

  /** Guarda en la cola y pide al navegador una sincronización en segundo plano. */
  async encolar(nuevo: Omit<NuevoPendiente, 'usuarioId'>): Promise<void> {
    const usuarioId = this.auth.usuario()?.id;
    if (!usuarioId) throw new Error('Sin sesión');
    await this.cola.encolar({ ...nuevo, usuarioId });
    void this.registrarSyncEnSegundoPlano();
  }

  /** Background Sync (Chrome, Edge, Android): el navegador despertará al service worker al volver la señal. */
  private async registrarSyncEnSegundoPlano(): Promise<void> {
    try {
      const registro = (await navigator.serviceWorker?.getRegistration()) as RegistroConSync | undefined;
      await registro?.sync?.register(ETIQUETA_SYNC);
    } catch {
      // Sin Background Sync se sincroniza al abrir la app, al volver la señal o con el botón.
    }
  }

  /** Reintenta un elemento que quedó en error. */
  async reintentar(elemento: ElementoCola): Promise<void> {
    await this.cola.actualizar({ ...elemento, estado: 'pendiente', error: undefined, intentos: 0 });
    await this.sincronizar();
  }

  async sincronizar(): Promise<void> {
    const usuario = this.auth.usuario();
    if (this.sincronizando() || !usuario || !this.conexion.enLinea()) return;
    this.sincronizando.set(true);
    try {
      // Si la sesión se restauró sin red, primero hay que conseguir un token.
      if (this.auth.sinConexion() || !this.auth.accessToken) {
        try {
          await firstValueFrom(this.auth.renovar());
        } catch (e) {
          if (e instanceof HttpErrorResponse && e.status === 401) void this.router.navigate(['/login']);
          return;
        }
      }
      const lista = elementosPorEnviar(await this.cola.leerTodos(), usuario.id);
      for (const elemento of lista) {
        if (!(await this.enviar(elemento))) break;
      }
    } finally {
      await this.cola.refrescar();
      this.sincronizando.set(false);
    }
  }

  /** Devuelve falso si hay que cortar la ronda (sin red, 401, 5xx). */
  private async enviar(elemento: ElementoCola): Promise<boolean> {
    await this.cola.actualizar({ ...elemento, estado: 'enviando' });
    const { url, campos, foto } = peticionDe(elemento);
    let cuerpo: object;
    if (foto) {
      const formulario = new FormData();
      for (const [clave, valor] of Object.entries(campos)) formulario.append(clave, String(valor));
      formulario.append('foto', foto, 'foto.jpg');
      cuerpo = formulario;
    } else {
      cuerpo = campos;
    }
    let status: number;
    let mensaje: string | undefined;
    try {
      const respuesta = await firstValueFrom(this.http.post(url, cuerpo, { observe: 'response' }));
      status = respuesta.status;
    } catch (e) {
      status = e instanceof HttpErrorResponse ? e.status : 0;
      mensaje = mensajeDeError(e);
    }
    const decision = decidirRespuesta(status);
    if (decision.accion === 'borrar') {
      await this.cola.eliminar(elemento.clienteId);
      this.enviados.update((n) => n + 1);
      return true;
    }
    if (decision.accion === 'error') {
      await this.cola.actualizar({ ...elemento, estado: 'error', error: mensaje, intentos: elemento.intentos + 1 });
      return true;
    }
    await this.cola.actualizar({ ...elemento, estado: 'pendiente', intentos: elemento.intentos + 1 });
    return false;
  }
}
