import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="fondo">
      <picture class="foto" aria-hidden="true">
        <source media="(min-width: 760px)" srcset="img/login-computador.webp" />
        <img src="img/login-movil.webp" alt="" fetchpriority="high" decoding="async" />
      </picture>

      <div class="marca">
        <img src="icono.svg" alt="" width="52" height="52" />
        <div>
          <h1>CuidAgro</h1>
          <p>Cuidado y seguimiento de tus animales</p>
        </div>
      </div>

      <section class="panel" aria-labelledby="titulo-entrar">
        <h2 id="titulo-entrar">Entra a tu finca</h2>
        <form [formGroup]="form" (ngSubmit)="entrar()" class="pila" novalidate>
          @if (error(); as mensaje) {
            <p class="alerta" role="alert">{{ mensaje }}</p>
          }

          <div class="campo">
            <label for="correo">Correo</label>
            <input id="correo" class="input" type="email" formControlName="correo" autocomplete="username" inputmode="email"
              [class.invalido]="invalido('correo')" />
            @if (invalido('correo')) {
              <span class="error-campo">Ingresa un correo válido.</span>
            }
          </div>

          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" class="input" type="password" formControlName="password" autocomplete="current-password"
              [class.invalido]="invalido('password')" />
            @if (invalido('password')) {
              <span class="error-campo">Ingresa tu contraseña.</span>
            }
          </div>

          <button type="submit" class="btn btn-primario btn-ancho" [disabled]="enviando()">
            {{ enviando() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: `
    /* Celular: la foto llena la pantalla, la marca arriba y el formulario como hoja apoyada abajo. */
    .fondo {
      position: relative; isolation: isolate; min-height: 100dvh;
      display: grid; grid-template-rows: auto 1fr auto;
      background: var(--verde-900);
    }
    .foto, .foto img { position: absolute; inset: 0; width: 100%; height: 100%; }
    .foto { z-index: -1; }
    .foto img { object-fit: cover; object-position: 50% 30%; }
    /* Velo verde arriba para leer la marca; el resto de la foto queda limpia. */
    .fondo::after {
      content: ''; position: absolute; inset: 0 0 auto; height: 42%; z-index: -1;
      background: linear-gradient(180deg, rgb(20 46 27 / 90%) 0%, rgb(20 46 27 / 70%) 40%, rgb(20 46 27 / 0%) 100%);
    }
    .marca {
      display: flex; align-items: center; gap: 14px; padding: 28px 20px 0;
      color: #fff; text-shadow: 0 1px 12px rgb(0 0 0 / 35%);
    }
    .marca img { border-radius: 12px; box-shadow: 0 2px 10px rgb(0 0 0 / 25%); }
    .marca h1 { color: #fff; font-size: 1.9rem; letter-spacing: -0.01em; }
    .marca p { opacity: 0.92; }
    .panel {
      grid-row: 3; display: grid; gap: 20px; padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
      background: var(--blanco); border-radius: 20px 20px 0 0;
      box-shadow: 0 -8px 32px rgb(20 30 15 / 28%);
    }
    /* Computador: la escena a la izquierda y el formulario en la zona desenfocada de la derecha. */
    @media (min-width: 760px) {
      .fondo { grid-template-columns: 1fr minmax(360px, 420px); grid-template-rows: auto 1fr; padding: 0 6vw 0 0; }
      .fondo::after {
        inset: 0; height: auto;
        background:
          linear-gradient(180deg, rgb(20 46 27 / 85%) 0%, rgb(20 46 27 / 0%) 34%),
          linear-gradient(90deg, rgb(20 46 27 / 45%) 0%, rgb(20 46 27 / 0%) 50%);
      }
      .foto img { object-position: 30% 50%; }
      .marca { grid-column: 1; align-self: start; padding: 40px 48px 0; }
      .marca h1 { font-size: 2.4rem; }
      .panel { grid-column: 2; grid-row: 1 / span 2; align-self: center; padding: 32px 28px; border-radius: 16px; box-shadow: 0 16px 48px rgb(20 30 15 / 35%); }
    }
  `,
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    correo: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected invalido(campo: 'correo' | 'password'): boolean {
    const control = this.form.controls[campo];
    return control.invalid && control.touched;
  }

  protected entrar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    const { correo, password } = this.form.getRawValue();
    this.auth.login(correo, password).subscribe({
      next: () => {
        const volver = this.ruta.snapshot.queryParamMap.get('volver');
        void this.router.navigateByUrl(volver?.startsWith('/') ? volver : '/');
      },
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.enviando.set(false);
      },
    });
  }
}
