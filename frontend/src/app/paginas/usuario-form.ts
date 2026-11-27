import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CampoPassword } from '../compartido/campo-password';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { Finca, Rol, ROLES, UsuarioDetalle } from '../core/modelos';
import { UsuarioGuardar, UsuariosApi } from '../core/usuarios-api';

function fincaRequerida(grupo: AbstractControl): ValidationErrors | null {
  const { rol, fincaIds } = grupo.getRawValue() as { rol: Rol; fincaIds: string[] };
  return rol !== 'ADMINISTRADOR' && fincaIds.length === 0 ? { fincaRequerida: true } : null;
}

type CampoTexto = 'nombre' | 'correo' | 'password';

@Component({
  selector: 'app-usuario-form',
  imports: [ReactiveFormsModule, RouterLink, Modal, CampoPassword],
  template: `
    <app-modal [titulo]="usuario() ? 'Editar usuario' : 'Nuevo usuario'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        <div class="campo">
          <label for="u-nombre">Nombre completo</label>
          <input id="u-nombre" class="input" formControlName="nombre" maxlength="120" [class.invalido]="invalido('nombre')" />
          @if (invalido('nombre')) {
            <span class="error-campo">El nombre debe tener al menos 2 caracteres.</span>
          }
        </div>

        <div class="campo">
          <label for="u-correo">Correo</label>
          <input id="u-correo" class="input" type="email" inputmode="email" autocomplete="off" formControlName="correo" [class.invalido]="invalido('correo')" />
          @if (invalido('correo')) {
            <span class="error-campo">Ingresa un correo válido.</span>
          }
        </div>

        <div class="campo">
          <label for="u-password">{{ usuario() ? 'Nueva contraseña (opcional)' : 'Contraseña inicial' }}</label>
          <app-campo-password>
            <input id="u-password" class="input" type="password" autocomplete="new-password" formControlName="password" [class.invalido]="invalido('password')" />
          </app-campo-password>
          @if (invalido('password')) {
            <span class="error-campo">Debe tener entre 8 y 128 caracteres.</span>
          } @else if (usuario()) {
            <span class="ayuda">Al cambiarla se cerrarán las sesiones abiertas de este usuario.</span>
          }
        </div>

        <div class="campo">
          <label for="u-rol">Rol</label>
          <select id="u-rol" class="input" formControlName="rol">
            @for (r of roles; track r.valor) {
              <option [value]="r.valor">{{ r.etiqueta }}</option>
            }
          </select>
        </div>

        @if (rol() !== 'ADMINISTRADOR') {
          <div class="campo">
            <span class="etiqueta">Fincas asignadas</span>
            @if (fincas().length === 0) {
              <p class="alerta">No hay fincas registradas. <a routerLink="/fincas">Crea una primero</a>.</p>
            } @else {
              <div class="opciones">
                @for (finca of fincas(); track finca.id) {
                  <label class="opcion">
                    <input type="checkbox" [checked]="seleccionada(finca.id)" (change)="alternar(finca.id)" />
                    {{ finca.nombre }}
                  </label>
                }
              </div>
            }
            @if (intentoGuardar() && form.hasError('fincaRequerida')) {
              <span class="error-campo">Asigna al menos una finca a este usuario.</span>
            }
          </div>
        }

        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class UsuarioForm implements OnInit {
  private readonly api = inject(UsuariosApi);

  readonly usuario = input<UsuarioDetalle | null>(null);
  readonly fincas = input.required<Finca[]>();
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly roles = ROLES;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly intentoGuardar = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
      correo: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.minLength(8), Validators.maxLength(128)]],
      rol: ['AYUDANTE' as Rol],
      fincaIds: [[] as string[]],
    },
    { validators: fincaRequerida },
  );

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly rol = computed(() => this.valores().rol);
  private readonly fincaIds = computed(() => this.valores().fincaIds ?? []);

  ngOnInit(): void {
    const usuario = this.usuario();
    if (usuario) {
      this.form.patchValue({
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        fincaIds: usuario.fincas.map((f) => f.id),
      });
    } else {
      this.form.controls.password.addValidators(Validators.required);
      this.form.controls.password.updateValueAndValidity();
    }
  }

  protected invalido(campo: CampoTexto): boolean {
    const control = this.form.controls[campo];
    return control.invalid && control.touched;
  }

  protected seleccionada(id: string): boolean {
    return this.fincaIds().includes(id);
  }

  protected alternar(id: string): void {
    const actuales = this.fincaIds();
    this.form.controls.fincaIds.setValue(
      actuales.includes(id) ? actuales.filter((f) => f !== id) : [...actuales, id],
    );
  }

  protected guardar(): void {
    this.intentoGuardar.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);

    const { password, ...resto } = this.form.getRawValue();
    const datos: UsuarioGuardar = password ? { ...resto, password } : resto;
    const usuario = this.usuario();
    (usuario ? this.api.actualizar(usuario.id, datos) : this.api.crear(datos)).subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
