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
      <section class="panel">
        <div class="marca">
          <img src="icono.svg" alt="" width="52" height="52" />
          <div>
            <h1>CuidAgro</h1>
            <p class="suave">Cuidado y seguimiento de tus animales</p>
          </div>
        </div>

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
    .fondo {
      display: grid; place-items: center; min-height: 100dvh; padding: 16px;
      background: linear-gradient(180deg, var(--verde-700) 0 38%, var(--crema) 38%);
    }
    .panel {
      display: grid; gap: 24px; width: min(420px, 100%); padding: 28px 24px;
      background: var(--blanco); border-radius: 16px; box-shadow: 0 12px 40px rgb(30 40 20 / 22%);
    }
    .marca { display: flex; align-items: center; gap: 14px; }
    .marca img { border-radius: 12px; }
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
