import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FotoNovedad } from '../compartido/foto-novedad';
import { Modal } from '../compartido/modal';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { etiquetaDe } from '../core/modelos';
import { NovedadesApi } from '../core/novedades-api';
import {
  enlaceMapa,
  EstadoNovedad,
  ESTADOS_NOVEDAD,
  formatearFechaHora,
  Novedad,
  PRIORIDADES_NOVEDAD,
  puedeEditarNovedad,
  TIPOS_NOVEDAD,
} from '../core/salud-modelos';

@Component({
  selector: 'app-novedad-detalle',
  imports: [Modal, FotoNovedad],
  template: `
    <app-modal titulo="Detalle de la novedad" (cerrado)="cerrado.emit()">
      <div class="modal-cuerpo">
        @if (error(); as mensaje) {
          <p class="alerta" role="alert">{{ mensaje }}</p>
        }
        @if (aviso(); as mensaje) {
          <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
        }
        @if (novedad(); as n) {
          @if (n.tieneFoto) {
            <app-foto-novedad [novedadId]="n.id" [version]="n.updatedAt" clase="grande" alt="Foto de la novedad" />
          }
          <div class="pila">
            <div class="insignias">
              <span class="insignia">{{ etiqueta(tipos, n.tipo) }}</span>
              <span class="insignia" [class.insignia-inactivo]="n.prioridad === 'ALTA'" [class.insignia-alerta]="n.prioridad === 'MEDIA'">Prioridad {{ etiqueta(prioridades, n.prioridad).toLowerCase() }}</span>
              <span class="insignia" [class.insignia-activo]="n.estado === 'CERRADA'">{{ etiqueta(estados, n.estado) }}</span>
            </div>
            <p class="descripcion">{{ n.descripcion }}</p>
            <p class="suave">
              {{ n.vacuno ? 'Vacuno' : 'Lote' }}: <strong>{{ (n.vacuno ?? n.lote)?.nombre }}</strong><br />
              {{ fechaHora(n.fechaHora) }} · {{ n.registradoPor.nombre }}
            </p>
            @if (n.latitud !== null && n.longitud !== null) {
              <p>
                <a [href]="mapa(n.latitud, n.longitud)" target="_blank" rel="noopener noreferrer">Ver en mapa</a>
                @if (n.precisionMetros !== null) {
                  <span class="suave"> (precisión ±{{ n.precisionMetros }} m)</span>
                }
              </p>
            } @else {
              <p class="suave">Sin ubicación registrada.</p>
            }

            <div class="acciones">
              @if (puedeEditar()) {
                <button type="button" class="btn" (click)="editar.emit(n)">Editar</button>
              }
              @if (puedeCrearCaso()) {
                <button type="button" class="btn btn-primario" (click)="crearCaso.emit(n)">Crear caso de salud</button>
              }
            </div>

            @if (gestiona()) {
              <div class="campo">
                <label for="d-estado">Estado</label>
                <select id="d-estado" class="input" [value]="n.estado" [disabled]="cambiando()" (change)="cambiarEstado($any($event.target).value)">
                  @for (e of estados; track e.valor) {
                    <option [value]="e.valor" [selected]="e.valor === n.estado">{{ e.etiqueta }}</option>
                  }
                </select>
              </div>
            }
          </div>

          <section class="pila" aria-labelledby="d-coment">
            <h3 id="d-coment">Comentarios ({{ n.comentarios?.length ?? 0 }})</h3>
            @for (c of n.comentarios ?? []; track c.id) {
              <div class="comentario">
                <strong>{{ c.autor.nombre }}</strong>
                <span class="suave">{{ fechaHora(c.createdAt) }}</span>
                <p>{{ c.texto }}</p>
              </div>
            } @empty {
              <p class="suave">Aún no hay comentarios.</p>
            }
            <form class="pila" (submit)="comentar($event)">
              <div class="campo">
                <label for="d-texto">Agregar comentario</label>
                <textarea id="d-texto" class="input" maxlength="1000" [value]="texto()" [class.invalido]="!!errorTexto()" (input)="texto.set($any($event.target).value)"></textarea>
                @if (errorTexto(); as e) {
                  <span class="error-campo">{{ e }}</span>
                }
              </div>
              <button type="submit" class="btn" [disabled]="comentando()">{{ comentando() ? 'Enviando…' : 'Comentar' }}</button>
            </form>
          </section>
        } @else if (!error()) {
          <p class="suave" role="status">Cargando…</p>
        }
        <div class="modal-pie">
          <button type="button" class="btn" (click)="cerrado.emit()">Cerrar</button>
        </div>
      </div>
    </app-modal>
  `,
  styles: `
    .insignias { display: flex; flex-wrap: wrap; gap: 6px; }
    .descripcion { white-space: pre-wrap; overflow-wrap: anywhere; }
    .comentario { padding: 8px 10px; border-radius: 10px; background: var(--crema); overflow-wrap: anywhere; }
    .comentario p { white-space: pre-wrap; }
    .comentario .suave { margin-left: 6px; font-size: 0.85rem; }
    .acciones .btn { flex: 1; }
  `,
})
export class NovedadDetalle implements OnInit {
  private readonly api = inject(NovedadesApi);
  private readonly auth = inject(Auth);

  readonly novedadId = input.required<string>();
  /** Se emite cuando el detalle cambió algo que la lista debe reflejar. */
  readonly cambiada = output<void>();
  readonly editar = output<Novedad>();
  readonly crearCaso = output<Novedad>();
  readonly cerrado = output<void>();

  protected readonly tipos = TIPOS_NOVEDAD;
  protected readonly prioridades = PRIORIDADES_NOVEDAD;
  protected readonly estados = ESTADOS_NOVEDAD;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fechaHora = formatearFechaHora;
  protected readonly mapa = enlaceMapa;

  protected readonly novedad = signal<Novedad | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly cambiando = signal(false);
  protected readonly texto = signal('');
  protected readonly errorTexto = signal<string | null>(null);
  protected readonly comentando = signal(false);

  protected readonly gestiona = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('novedades:gestionar');
  });
  protected readonly puedeCrearCaso = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('salud:gestionar');
  });
  protected readonly puedeEditar = computed(() => {
    const n = this.novedad();
    const u = this.auth.usuario();
    return !!n && !!u && puedeEditarNovedad(n, u.id, this.gestiona());
  });

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.api.obtener(this.novedadId()).subscribe({
      next: (n) => this.novedad.set(n),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }

  protected cambiarEstado(estado: EstadoNovedad): void {
    const n = this.novedad();
    if (!n || estado === n.estado) return;
    this.cambiando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.api.cambiarEstado(n.id, estado).subscribe({
      next: (nueva) => {
        this.novedad.set({ ...n, ...nueva, comentarios: n.comentarios });
        this.cambiando.set(false);
        this.aviso.set('Estado actualizado.');
        this.cambiada.emit();
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cambiando.set(false);
      },
    });
  }

  protected comentar(evento: Event): void {
    evento.preventDefault();
    const n = this.novedad();
    const texto = this.texto().trim();
    if (!n) return;
    if (!texto) {
      this.errorTexto.set('Escribe un comentario.');
      return;
    }
    this.errorTexto.set(null);
    this.comentando.set(true);
    this.api.comentar(n.id, texto).subscribe({
      next: (c) => {
        this.novedad.set({ ...n, comentarios: [...(n.comentarios ?? []), c], totalComentarios: n.totalComentarios + 1 });
        this.texto.set('');
        this.comentando.set(false);
        this.cambiada.emit();
      },
      error: (e) => {
        const detalle = (e?.error?.error?.detalles?.[0]?.mensaje as string | undefined) ?? mensajeDeError(e);
        this.errorTexto.set(detalle);
        this.comentando.set(false);
      },
    });
  }
}
