import { Component, ElementRef, inject, OnDestroy, signal } from '@angular/core';

/** Cambia el tipo del campo sin tocar su valor ni su foco. */
export function aplicarVisibilidad(entrada: HTMLInputElement, visible: boolean): void {
  entrada.type = visible ? 'text' : 'password';
}

/**
 * Envuelve un `<input>` de contraseña y le agrega el botón de mostrar u ocultar.
 * Uso: `<app-campo-password><input type="password" … /></app-campo-password>`.
 * Al enviarse el formulario que lo contiene, la contraseña vuelve a ocultarse.
 */
@Component({
  selector: 'app-campo-password',
  template: `
    <div class="envoltura">
      <ng-content />
      <button
        type="button"
        class="ojo"
        [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        [attr.aria-pressed]="visible()"
        (click)="alternar()"
      >
        @if (visible()) {
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3l18 18M10.600 10.600a2 2 0 002.800 2.800M9.900 5.100A9.800 9.800 0 0112 5c5 0 8.500 4.200 10 7a14 14 0 01-2.600 3.400M6.600 6.600A14 14 0 002 12c1.500 2.800 5 7 10 7a9.700 9.700 0 004.400-1" />
          </svg>
        } @else {
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12c1.500-2.800 5-7 10-7s8.500 4.200 10 7c-1.500 2.800-5 7-10 7S3.500 14.800 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        }
      </button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .envoltura { position: relative; }
    :host ::ng-deep input { padding-right: 52px; }
    .ojo {
      position: absolute; top: 0; right: 0; width: 48px; height: 48px;
      display: grid; place-items: center; padding: 0;
      border: 0; border-radius: 0 10px 10px 0; background: transparent;
      color: var(--texto-suave); cursor: pointer;
    }
    .ojo:hover { color: var(--verde-900); }
    .ojo:focus-visible { outline: 3px solid var(--verde-600); outline-offset: -3px; }
  `,
})
export class CampoPassword implements OnDestroy {
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly visible = signal(false);
  private readonly alEnviar = () => this.mostrar(false);
  private formulario: HTMLFormElement | null = null;

  constructor() {
    // El formulario recién existe cuando ya se proyectó el contenido.
    queueMicrotask(() => {
      this.formulario = this.anfitrion.closest('form');
      this.formulario?.addEventListener('submit', this.alEnviar);
    });
  }

  ngOnDestroy(): void {
    this.formulario?.removeEventListener('submit', this.alEnviar);
  }

  protected alternar(): void {
    this.mostrar(!this.visible());
  }

  private mostrar(visible: boolean): void {
    const entrada = this.anfitrion.querySelector('input');
    if (!entrada) return;
    this.visible.set(visible);
    aplicarVisibilidad(entrada, visible);
  }
}
