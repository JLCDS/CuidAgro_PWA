import { Component, effect, inject, input, signal } from '@angular/core';
import { NovedadesApi } from '../core/novedades-api';

/** Muestra la foto de una novedad: se pide como blob (con el token) y se libera el object URL al cambiar o destruir. */
@Component({
  selector: 'app-foto-novedad',
  template: `
    @if (url(); as src) {
      <img [src]="src" [alt]="alt()" [class]="clase()" />
    } @else if (fallo()) {
      <span class="foto-vacia" [class]="clase()">Foto no disponible</span>
    } @else {
      <span class="foto-vacia" [class]="clase()" role="status">Cargando foto…</span>
    }
  `,
  styles: `
    :host { display: block; }
    img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: var(--tierra-200); }
    img.grande { height: auto; max-height: 60vh; object-fit: contain; }
    .foto-vacia { display: grid; place-items: center; width: 100%; height: 100%; min-height: 64px; border-radius: 8px; background: var(--tierra-200); color: var(--texto-suave); font-size: 0.8rem; text-align: center; }
  `,
})
export class FotoNovedad {
  private readonly api = inject(NovedadesApi);

  readonly novedadId = input.required<string>();
  /** Cambia cuando la foto se reemplaza, para volver a pedirla. */
  readonly version = input<string>('');
  readonly alt = input('Foto de la novedad');
  readonly clase = input('');

  protected readonly url = signal<string | null>(null);
  protected readonly fallo = signal(false);

  constructor() {
    effect((alLimpiar) => {
      const id = this.novedadId();
      this.version();
      this.url.set(null);
      this.fallo.set(false);
      let objeto: string | null = null;
      const sub = this.api.foto(id).subscribe({
        next: (blob) => {
          objeto = URL.createObjectURL(blob);
          this.url.set(objeto);
        },
        error: () => this.fallo.set(true),
      });
      alLimpiar(() => {
        sub.unsubscribe();
        if (objeto) URL.revokeObjectURL(objeto);
      });
    });
  }
}
