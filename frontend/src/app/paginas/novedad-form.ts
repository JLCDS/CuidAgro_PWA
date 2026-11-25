import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FotoNovedad } from '../compartido/foto-novedad';
import { Modal } from '../compartido/modal';
import { Auth } from '../core/auth';
import { Conexion } from '../core/conexion';
import { mensajeDeError } from '../core/errores';
import { reducirImagen } from '../core/imagen';
import { LotesApi } from '../core/lotes-api';
import { etiquetaDe } from '../core/modelos';
import { nuevoClienteId } from '../core/offline-logica';
import { Sincronizador } from '../core/sincronizador';
import { NovedadCrear, NovedadesApi } from '../core/novedades-api';
import {
  erroresPorCampo,
  Novedad,
  PRIORIDADES_NOVEDAD,
  PrioridadNovedad,
  TIPOS_NOVEDAD,
  TipoNovedad,
} from '../core/salud-modelos';
import { VacunosApi } from '../core/vacunos-api';

type EstadoUbicacion = 'buscando' | 'ok' | 'denegado' | 'no-disponible' | 'error';
interface Ubicacion {
  latitud: number;
  longitud: number;
  precisionMetros: number;
}

/** Crea una novedad (con foto y GPS opcionales) o edita una existente. */
@Component({
  selector: 'app-novedad-form',
  imports: [ReactiveFormsModule, Modal, FotoNovedad],
  template: `
    <app-modal [titulo]="novedad() ? 'Editar novedad' : 'Nueva novedad'" (cerrado)="cerrado.emit()">
      <form class="modal-cuerpo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }

        @if (!novedad()) {
          <div class="campo">
            <span class="etiqueta" id="n-sujeto-et">Sobre</span>
            <div class="segmentos" role="group" aria-labelledby="n-sujeto-et">
              <button type="button" class="btn segmento" [class.activo]="sujeto() === 'lote'" [attr.aria-pressed]="sujeto() === 'lote'" (click)="elegirSujeto('lote')">Lote de ovíparos</button>
              <button type="button" class="btn segmento" [class.activo]="sujeto() === 'vacuno'" [attr.aria-pressed]="sujeto() === 'vacuno'" (click)="elegirSujeto('vacuno')">Vacuno</button>
            </div>
          </div>
          <div class="campo">
            <label for="n-animal">{{ sujeto() === 'lote' ? 'Lote' : 'Vacuno' }}</label>
            <select id="n-animal" class="input" formControlName="animalId" [class.invalido]="invalido('animalId') || !!campo('vacunoId') || !!campo('loteId')">
              <option value="">{{ sujeto() === 'lote' ? 'Selecciona un lote' : 'Selecciona un vacuno' }}</option>
              @for (a of opciones(); track a.id) {
                <option [value]="a.id">{{ a.nombre }}</option>
              }
            </select>
            @if (invalido('animalId')) {
              <span class="error-campo">Selecciona {{ sujeto() === 'lote' ? 'un lote' : 'un vacuno' }}.</span>
            } @else if (campo('vacunoId') || campo('loteId')) {
              <span class="error-campo">{{ campo('vacunoId') || campo('loteId') }}</span>
            } @else if (opciones().length === 0) {
              <span class="ayuda">No hay {{ sujeto() === 'lote' ? 'lotes' : 'vacunos' }} activos en esta finca.</span>
            }
          </div>
        } @else {
          <p class="suave">{{ novedad()!.vacuno ? 'Vacuno' : 'Lote' }}: <strong>{{ (novedad()!.vacuno ?? novedad()!.lote)?.nombre }}</strong></p>
        }

        <div class="dos">
          <div class="campo">
            <label for="n-tipo">Tipo</label>
            <select id="n-tipo" class="input" formControlName="tipo" [class.invalido]="!!campo('tipo')">
              @for (t of tipos; track t.valor) {
                <option [value]="t.valor">{{ t.etiqueta }}</option>
              }
            </select>
            @if (campo('tipo'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
          <div class="campo">
            <label for="n-prioridad">Prioridad</label>
            <select id="n-prioridad" class="input" formControlName="prioridad" [class.invalido]="!!campo('prioridad')">
              @for (p of prioridades; track p.valor) {
                <option [value]="p.valor">{{ p.etiqueta }}</option>
              }
            </select>
            @if (campo('prioridad'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        </div>

        <div class="campo">
          <label for="n-desc">Descripción</label>
          <textarea id="n-desc" class="input" formControlName="descripcion" maxlength="2000" [class.invalido]="invalido('descripcion') || !!campo('descripcion')"></textarea>
          @if (invalido('descripcion')) {
            <span class="error-campo">Describe lo que ocurre (entre 5 y 2000 caracteres).</span>
          } @else if (campo('descripcion'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
        </div>

        <div class="campo">
          <label for="n-foto">Foto (opcional)</label>
          @if (novedad(); as n) {
            @if (n.tieneFoto && !quitarFoto() && !foto()) {
              <div class="miniatura"><app-foto-novedad [novedadId]="n.id" [version]="n.updatedAt" alt="Foto actual de la novedad" /></div>
              <button type="button" class="btn btn-peligro" (click)="quitarFoto.set(true)">Quitar foto</button>
            } @else if (quitarFoto()) {
              <p class="ayuda">La foto se quitará al guardar.</p>
              <button type="button" class="btn" (click)="quitarFoto.set(false)">Conservar foto</button>
            }
          }
          <input id="n-foto" class="input" type="file" accept="image/*" capture="environment" (change)="elegirFoto($event)" [class.invalido]="!!campo('foto') || !!errorFoto()" />
          @if (procesandoFoto()) {
            <span class="ayuda" role="status">Preparando la imagen…</span>
          }
          @if (errorFoto() || campo('foto'); as e) {
            <span class="error-campo">{{ e }}</span>
          }
          @if (vistaPrevia(); as src) {
            <div class="miniatura"><img [src]="src" alt="Vista previa de la foto elegida" /></div>
            <button type="button" class="btn" (click)="quitarElegida()">Quitar foto elegida</button>
          }
        </div>

        @if (!novedad()) {
          <div class="campo">
            <span class="etiqueta">Ubicación</span>
            <p class="geo" role="status">{{ textoUbicacion() }}</p>
            <button type="button" class="btn" [disabled]="geoEstado() === 'buscando'" (click)="buscarUbicacion()">Reintentar</button>
            @if (campo('latitud') || campo('longitud'); as e) {
              <span class="error-campo">{{ e }}</span>
            }
          </div>
        }

        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="guardando() || procesandoFoto()">
            {{ guardando() ? 'Guardando…' : novedad() ? 'Guardar cambios' : 'Registrar novedad' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .segmentos, .dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .segmento { padding: 0 6px; }
    .segmento.activo { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
    .miniatura { width: 100%; max-width: 240px; aspect-ratio: 4 / 3; }
    .miniatura img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
    .geo { padding: 10px 12px; border-radius: 10px; background: var(--crema); }
    .modal-pie .btn { flex: 1; }
  `,
})
export class NovedadForm implements OnInit {
  private readonly api = inject(NovedadesApi);
  private readonly auth = inject(Auth);
  private readonly conexion = inject(Conexion);
  private readonly sincronizador = inject(Sincronizador);
  private readonly vacunosApi = inject(VacunosApi);
  private readonly lotesApi = inject(LotesApi);

  readonly fincaId = input.required<string>();
  /** Si viene, se edita; si no, se crea. */
  readonly novedad = input<Novedad | null>(null);
  readonly guardado = output<Novedad>();
  /** Se guardó en la cola del dispositivo (sin conexión); el servidor la recibirá al volver la señal. */
  readonly encolado = output<void>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_NOVEDAD;
  protected readonly prioridades = PRIORIDADES_NOVEDAD;

  protected readonly sujeto = signal<'lote' | 'vacuno'>('lote');
  private readonly lotes = signal<{ id: string; nombre: string }[]>([]);
  private readonly vacunos = signal<{ id: string; nombre: string }[]>([]);
  protected readonly opciones = computed(() => (this.sujeto() === 'lote' ? this.lotes() : this.vacunos()));

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly foto = signal<File | null>(null);
  protected readonly vistaPrevia = signal<string | null>(null);
  protected readonly procesandoFoto = signal(false);
  protected readonly errorFoto = signal<string | null>(null);
  protected readonly quitarFoto = signal(false);

  protected readonly geoEstado = signal<EstadoUbicacion>('buscando');
  private readonly ubicacion = signal<Ubicacion | null>(null);
  private peticionGeo = 0;

  protected readonly form = inject(NonNullableFormBuilder).group({
    animalId: ['', Validators.required],
    tipo: ['ENFERMEDAD' as TipoNovedad],
    prioridad: ['MEDIA' as PrioridadNovedad],
    descripcion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]],
  });

  protected readonly textoUbicacion = computed(() => {
    switch (this.geoEstado()) {
      case 'buscando':
        return 'Buscando ubicación…';
      case 'ok':
        return `Ubicación obtenida (precisión ±${this.ubicacion()?.precisionMetros} m).`;
      case 'denegado':
        return 'Permiso de ubicación denegado. La novedad se guardará sin ubicación; puedes darlo en los ajustes del navegador y reintentar.';
      case 'no-disponible':
        return 'Este dispositivo no ofrece ubicación. La novedad se guardará sin ella.';
      default:
        return 'No se pudo obtener la ubicación. La novedad se guardará sin ella; puedes reintentar.';
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.peticionGeo++;
      this.liberarVistaPrevia();
    });
  }

  ngOnInit(): void {
    const n = this.novedad();
    if (n) {
      this.form.controls.animalId.clearValidators();
      this.form.controls.animalId.updateValueAndValidity();
      this.form.patchValue({ tipo: n.tipo, prioridad: n.prioridad, descripcion: n.descripcion });
      return;
    }
    const fincaId = this.fincaId();
    this.lotesApi.listar({ fincaId, estado: 'ACTIVO', q: '', proposito: '' }).subscribe({
      next: (l) => this.lotes.set(l.map(({ id, nombre }) => ({ id, nombre }))),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
    this.vacunosApi.listar({ fincaId, estado: 'ACTIVO', q: '', proposito: '' }).subscribe({
      next: (v) => this.vacunos.set(v.map(({ id, nombre }) => ({ id, nombre }))),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
    this.buscarUbicacion();
  }

  protected campo(nombre: string): string | undefined {
    return this.errores()[nombre];
  }

  protected invalido(nombre: 'animalId' | 'descripcion'): boolean {
    const c = this.form.controls[nombre];
    return c.invalid && c.touched;
  }

  protected elegirSujeto(valor: 'lote' | 'vacuno'): void {
    this.sujeto.set(valor);
    this.form.controls.animalId.setValue('');
    this.form.controls.animalId.markAsUntouched();
  }

  protected buscarUbicacion(): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.geoEstado.set('no-disponible');
      return;
    }
    const peticion = ++this.peticionGeo;
    this.geoEstado.set('buscando');
    this.ubicacion.set(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (peticion !== this.peticionGeo) return;
        this.ubicacion.set({
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
          precisionMetros: Math.min(100_000, Math.max(0, Math.round(pos.coords.accuracy))),
        });
        this.geoEstado.set('ok');
      },
      (err) => {
        if (peticion !== this.peticionGeo) return;
        this.geoEstado.set(err.code === 1 ? 'denegado' : 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  protected async elegirFoto(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.errorFoto.set(null);
    this.procesandoFoto.set(true);
    try {
      const reducida = await reducirImagen(archivo);
      this.liberarVistaPrevia();
      this.foto.set(reducida);
      this.vistaPrevia.set(URL.createObjectURL(reducida));
    } catch {
      this.errorFoto.set('No se pudo leer la imagen. Elige otra foto (JPEG, PNG o WebP).');
    } finally {
      this.procesandoFoto.set(false);
    }
  }

  protected quitarElegida(): void {
    this.liberarVistaPrevia();
    this.foto.set(null);
  }

  private liberarVistaPrevia(): void {
    const url = this.vistaPrevia();
    if (url) URL.revokeObjectURL(url);
    this.vistaPrevia.set(null);
  }

  protected guardar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.guardando.set(true);
    this.error.set(null);
    this.errores.set({});
    const v = this.form.getRawValue();
    const actual = this.novedad();
    const alFallar = (e: unknown) => {
      const porCampo = erroresPorCampo(e);
      this.errores.set(porCampo);
      this.error.set(Object.keys(porCampo).length ? null : mensajeDeError(e));
      this.guardando.set(false);
    };
    const terminar = (n: Novedad) => {
      this.guardando.set(false);
      this.guardado.emit(n);
    };

    if (actual) {
      const datos = { tipo: v.tipo, prioridad: v.prioridad, descripcion: v.descripcion.trim() };
      const nueva = this.foto();
      this.api.actualizar(actual.id, datos).subscribe({
        next: (n) => {
          if (nueva) this.api.cambiarFoto(actual.id, nueva).subscribe({ next: terminar, error: alFallar });
          else if (this.quitarFoto() && actual.tieneFoto) this.api.quitarFoto(actual.id).subscribe({ next: terminar, error: alFallar });
          else terminar(n);
        },
        error: alFallar,
      });
      return;
    }

    const ubic = this.ubicacion();
    const datos: NovedadCrear = {
      [this.sujeto() === 'lote' ? 'loteId' : 'vacunoId']: v.animalId,
      tipo: v.tipo,
      prioridad: v.prioridad,
      descripcion: v.descripcion.trim(),
      ...(ubic ?? {}),
      // clienteId evita duplicados al reenviar; fechaHora conserva el momento en que se capturó la novedad.
      clienteId: nuevoClienteId(),
      fechaHora: new Date().toISOString(),
    };
    if (!this.conexion.enLinea()) {
      void this.guardarSinConexion(datos);
      return;
    }
    this.api.crear(datos, this.foto()).subscribe({
      next: terminar,
      error: (e) => {
        // Falló por red (status 0): se guarda en el dispositivo en vez de perder lo escrito.
        if (e instanceof HttpErrorResponse && e.status === 0) void this.guardarSinConexion(datos);
        else alFallar(e);
      },
    });
  }

  /** Foto (ya reducida) y ubicación ya capturadas se guardan tal cual en la cola de IndexedDB. */
  private async guardarSinConexion(datos: NovedadCrear): Promise<void> {
    const usuarioId = this.auth.usuario()?.id;
    if (!usuarioId || !datos.clienteId) return;
    const sujetoId = datos.loteId ?? datos.vacunoId;
    const nombre = this.opciones().find((o) => o.id === sujetoId)?.nombre ?? '';
    try {
      await this.sincronizador.encolar({
        clienteId: datos.clienteId,
        tipo: 'novedad',
        datos: { ...datos },
        foto: this.foto(),
        resumen: { sujeto: nombre, detalle: `${etiquetaDe(TIPOS_NOVEDAD, datos.tipo)}, prioridad ${etiquetaDe(PRIORIDADES_NOVEDAD, datos.prioridad).toLowerCase()}` },
      });
      this.guardando.set(false);
      this.encolado.emit();
    } catch {
      this.error.set('No se pudo guardar en este dispositivo. Revisa el espacio disponible e intenta de nuevo.');
      this.guardando.set(false);
    }
  }
}
