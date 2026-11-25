import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Auth } from './auth';
import { ElementoCola, formarElemento, NuevoPendiente } from './offline-logica';

const BD_NOMBRE = 'cuidagro';
const BD_VERSION = 1;
const ALMACEN = 'pendientes';

function abrirBd(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD_NOMBRE, BD_VERSION);
    // Mismo esquema que crea public/sw.js si se abre primero allí.
    peticion.onupgradeneeded = () => {
      if (!peticion.result.objectStoreNames.contains(ALMACEN)) {
        peticion.result.createObjectStore(ALMACEN, { keyPath: 'clienteId' });
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/**
 * Cola de registros hechos sin conexión, en IndexedDB nativo (guarda Blobs, como la foto de una novedad).
 * El formato de los elementos está en `offline-logica.ts` y es el mismo que usa `public/sw.js`.
 */
@Injectable({ providedIn: 'root' })
export class ColaOffline {
  private readonly auth = inject(Auth);
  private readonly todos = signal<ElementoCola[]>([]);

  /** Elementos del usuario actual, del más viejo al más nuevo. */
  readonly elementos = computed(() => {
    const id = this.auth.usuario()?.id;
    return this.todos()
      .filter((e) => e.usuarioId === id)
      .sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : 1));
  });
  /** Contador del menú: todo lo que sigue en la cola (pendientes y con error). */
  readonly total = computed(() => this.elementos().length);
  readonly conError = computed(() => this.elementos().filter((e) => e.estado === 'error').length);

  constructor() {
    // Al iniciar o cambiar de usuario se vuelve a leer la base.
    effect(() => {
      this.auth.usuario();
      void this.refrescar();
    });
  }

  async refrescar(): Promise<void> {
    try {
      this.todos.set(await this.leerTodos());
    } catch {
      // Sin IndexedDB (navegación privada en algunos navegadores): la cola queda vacía.
    }
  }

  async encolar(nuevo: NuevoPendiente): Promise<ElementoCola> {
    const elemento = formarElemento(nuevo);
    await this.escribir((almacen) => almacen.put(elemento));
    await this.refrescar();
    return elemento;
  }

  async actualizar(elemento: ElementoCola): Promise<void> {
    await this.escribir((almacen) => almacen.put(elemento));
    await this.refrescar();
  }

  async eliminar(clienteId: string): Promise<void> {
    await this.escribir((almacen) => almacen.delete(clienteId));
    await this.refrescar();
  }

  /** Lectura directa de la base (el SW pudo cambiarla desde otro contexto). */
  async leerTodos(): Promise<ElementoCola[]> {
    const bd = await abrirBd();
    try {
      return await new Promise<ElementoCola[]>((resolver, rechazar) => {
        const peticion = bd.transaction(ALMACEN).objectStore(ALMACEN).getAll();
        peticion.onsuccess = () => resolver(peticion.result as ElementoCola[]);
        peticion.onerror = () => rechazar(peticion.error);
      });
    } finally {
      bd.close();
    }
  }

  private async escribir(operacion: (almacen: IDBObjectStore) => void): Promise<void> {
    const bd = await abrirBd();
    try {
      await new Promise<void>((resolver, rechazar) => {
        const tx = bd.transaction(ALMACEN, 'readwrite');
        operacion(tx.objectStore(ALMACEN));
        tx.oncomplete = () => resolver();
        tx.onerror = () => rechazar(tx.error);
        tx.onabort = () => rechazar(tx.error);
      });
    } finally {
      bd.close();
    }
  }
}
