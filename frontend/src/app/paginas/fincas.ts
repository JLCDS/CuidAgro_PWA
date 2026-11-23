import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Modal } from '../compartido/modal';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { FincasApi } from '../core/fincas-api';
import { Finca } from '../core/modelos';

@Component({
  selector: 'app-fincas',
  imports: [ReactiveFormsModule, Modal],
  template: `
    <div class="cabecera-pagina">
      <h1>Fincas</h1>
      <button type="button" class="btn btn-primario" (click)="abrir(null)">Nueva finca</button>
    </div>

    @if (error(); as mensaje) {
      <p class="alerta" role="alert">{{ mensaje }}</p>
    }

    @if (cargando()) {
      <p class="suave" role="status">Cargando…</p>
    } @else if (fincas().length === 0 && !error()) {
      <div class="vacio">Aún no hay fincas. Crea la primera para poder asignarle usuarios.</div>
    } @else {
      <div class="rejilla">
        @for (finca of fincas(); track finca.id) {
          <article class="tarjeta pila">
            <div>
              <h2>{{ finca.nombre }}</h2>
              @if (finca.ubicacion) {
                <p class="suave">{{ finca.ubicacion }}</p>
              }
            </div>
            @if (finca.descripcion) {
              <p>{{ finca.descripcion }}</p>
            }
            <div><button type="button" class="btn" (click)="abrir(finca)">Editar</button></div>
          </article>
        }
      </div>
    }

    @if (formularioAbierto()) {
      <app-modal [titulo]="editando() ? 'Editar finca' : 'Nueva finca'" (cerrado)="cerrar()">
        <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          @if (errorForm(); as mensaje) {
            <p class="alerta" role="alert">{{ mensaje }}</p>
          }
          <div class="campo">
            <label for="f-nombre">Nombre</label>
            <input id="f-nombre" class="input" formControlName="nombre" maxlength="120"
              [class.invalido]="form.controls.nombre.invalid && form.controls.nombre.touched" />
            @if (form.controls.nombre.invalid && form.controls.nombre.touched) {
              <span class="error-campo">El nombre debe tener al menos 2 caracteres.</span>
            }
          </div>
          <div class="campo">
            <label for="f-ubicacion">Ubicación (opcional)</label>
            <input id="f-ubicacion" class="input" formControlName="ubicacion" maxlength="200" />
          </div>
          <div class="campo">
            <label for="f-descripcion">Descripción (opcional)</label>
            <textarea id="f-descripcion" class="input" formControlName="descripcion" maxlength="1000"></textarea>
          </div>
          <div class="modal-pie">
            <button type="button" class="btn" (click)="cerrar()">Cancelar</button>
            <button type="submit" class="btn btn-primario" [disabled]="guardando()">
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </app-modal>
    }
  `,
  styles: `
    .rejilla { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); }
  `,
})
export class Fincas implements OnInit {
  private readonly api = inject(FincasApi);
  private readonly fincaActiva = inject(FincaActiva);

  protected readonly fincas = signal<Finca[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<Finca | null>(null);
  protected readonly guardando = signal(false);
  protected readonly errorForm = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    ubicacion: [''],
    descripcion: [''],
  });

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.api.listar().subscribe({
      next: (fincas) => {
        this.fincas.set(fincas);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (error) => {
        this.error.set(mensajeDeError(error));
        this.cargando.set(false);
      },
    });
  }

  protected abrir(finca: Finca | null): void {
    this.editando.set(finca);
    this.errorForm.set(null);
    this.form.reset({
      nombre: finca?.nombre ?? '',
      ubicacion: finca?.ubicacion ?? '',
      descripcion: finca?.descripcion ?? '',
    });
    this.formularioAbierto.set(true);
  }

  protected cerrar(): void {
    this.formularioAbierto.set(false);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.errorForm.set(null);
    const datos = this.form.getRawValue();
    const finca = this.editando();
    (finca ? this.api.actualizar(finca.id, datos) : this.api.crear(datos)).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.cargar();
        this.fincaActiva.recargar();
      },
      error: (error) => {
        this.errorForm.set(mensajeDeError(error));
        this.guardando.set(false);
      },
    });
  }
}
