import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Auth } from './auth';
import { FincasApi } from './fincas-api';
import { FincaResumen } from './modelos';

const CLAVE = 'cuidagro.fincaActiva';

function leerGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function guardar(id: string): void {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    // Sin almacenamiento la selección solo dura mientras la pestaña esté abierta.
  }
}

/** Finca sobre la que trabajan las listas y formularios. El administrador elige entre todas; el resto, entre las suyas. */
@Injectable({ providedIn: 'root' })
export class FincaActiva {
  private readonly auth = inject(Auth);
  private readonly fincasApi = inject(FincasApi);

  private readonly disponibles = signal<FincaResumen[]>([]);
  private readonly elegida = signal<string | null>(leerGuardada());
  private readonly listas = signal(false);

  readonly fincas = this.disponibles.asReadonly();
  /** Verdadero cuando ya se conoce la lista de fincas; evita mostrar "sin finca" mientras llega la respuesta. */
  readonly cargada = this.listas.asReadonly();
  /** La elegida si sigue disponible; si no, la primera. */
  readonly id = computed(() => {
    const lista = this.disponibles();
    const elegida = this.elegida();
    return lista.find((f) => f.id === elegida)?.id ?? lista[0]?.id ?? null;
  });

  constructor() {
    effect(() => {
      const usuario = this.auth.usuario();
      if (!usuario) {
        this.disponibles.set([]);
        this.listas.set(false);
      } else if (usuario.rol === 'ADMINISTRADOR') {
        this.recargar();
      } else {
        this.disponibles.set(usuario.fincas);
        this.listas.set(true);
      }
    });
  }

  seleccionar(id: string): void {
    this.elegida.set(id);
    guardar(id);
  }

  /** Solo el administrador consulta la lista; se repite al crear o editar una finca. */
  recargar(): void {
    if (this.auth.usuario()?.rol !== 'ADMINISTRADOR') return;
    this.fincasApi.listar().subscribe({
      next: (fincas) => {
        this.disponibles.set(fincas.map(({ id, nombre }) => ({ id, nombre })));
        this.listas.set(true);
      },
      error: () => this.listas.set(true),
    });
  }
}
