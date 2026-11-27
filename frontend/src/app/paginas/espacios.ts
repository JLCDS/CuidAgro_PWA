import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BajaDialogo } from '../compartido/baja-dialogo';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { EspaciosApi } from '../core/espacios-api';
import { FincaActiva } from '../core/finca-activa';
import { Espacio, etiquetaDe, EstadoRegistro, TIPOS_ESPACIO } from '../core/modelos';
import { EspacioForm } from './espacio-form';
import { RacionesTabla } from './raciones-tabla';

@Component({
  selector: 'app-espacios',
  imports: [RouterLink, EspacioForm, BajaDialogo, RacionesTabla],
  template: `
    <div class="cabecera-pagina">
      <h1>Espacios del galpón</h1>
      @if (puedeGestionar() && fincaId()) {
        <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo espacio</button>
      }
    </div>

    @if (!fincaId()) {
      @if (fincasListas()) {
      <div class="vacio">
        <img class="vacio-escena" src="img/finca.webp" alt="" width="720" height="540" loading="lazy" />
        Aún no hay una finca para trabajar.
        @if (puedeCrearFincas()) {
          <a routerLink="/fincas">Crea una finca</a> primero.
        }
      </div>
      }
    } @else {
      <div class="filtros-espacios">
        <select class="input" aria-label="Filtrar por estado" [value]="estado()" (change)="cambiarEstado($any($event.target).value)">
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Dados de baja</option>
        </select>
      </div>

      @if (aviso(); as mensaje) {
        <p class="alerta alerta-exito" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="alerta" role="alert">{{ mensaje }}</p>
      }

      @if (cargando()) {
        <p class="suave" role="status">Cargando…</p>
      } @else if (espacios().length === 0 && !error()) {
        <div class="vacio"><img class="vacio-objeto" src="img/vacio-aves.webp" alt="" width="320" height="320" />
          {{ estado() === 'ACTIVO' ? 'Aún no hay espacios. Crea los cuadrantes y zonas del galpón.' : 'No hay espacios dados de baja.' }}</div>
      } @else if (espacios().length > 0) {
        <ul class="rejilla-espacios">
          @for (e of espacios(); track e.id) {
            <li class="tarjeta espacio">
              <div class="espacio-cabeza">
                <span class="codigo">{{ e.codigo }}</span>
                <span class="insignia">{{ etiqueta(tipos, e.tipo) }}</span>
              </div>
              @if (e.nombre) {
                <p>{{ e.nombre }}</p>
              }
              @if (e.capacidad) {
                <p class="suave">Capacidad: {{ e.capacidad }} aves</p>
              }
              @if (e.estado === 'INACTIVO') {
                <p><span class="insignia insignia-inactivo">De baja</span></p>
                @if (e.motivoBaja) {
                  <p class="suave">Motivo: {{ e.motivoBaja }}</p>
                }
              } @else if (e.loteActual; as l) {
                <p class="lote-actual">
                  <strong>{{ l.nombre }}</strong>
                  <span class="suave">{{ l.cantidad }} aves</span>
                  <span class="insignia insignia-activo">Semana {{ l.edadActual.semanaVida }}</span>
                </p>
              } @else {
                <p><span class="insignia">Libre</span></p>
              }
              @if (puedeGestionar()) {
                <div class="acciones">
                  <button type="button" class="btn" (click)="abrir(e)">Editar</button>
                  @if (e.estado === 'ACTIVO') {
                    <button type="button" class="btn btn-peligro" (click)="pedirBaja(e)">Dar de baja</button>
                  } @else {
                    <button type="button" class="btn" (click)="reactivar(e)">Reactivar</button>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }

      <!-- Se muestra al terminar de cargar la lista para que no se desplace cuando esta aparece. -->
      @if (!cargando()) {
        <app-raciones-tabla [fincaId]="fincaId()!" />
      }
    }

    @if (formularioAbierto()) {
      @if (fincaId(); as id) {
        <app-espacio-form [espacio]="editando()" [fincaId]="id" (guardado)="alGuardar()" (cerrado)="formularioAbierto.set(false)" />
      }
    }

    @if (bajaDe(); as e) {
      <app-baja-dialogo
        titulo="Dar de baja espacio"
        [descripcion]="'¿Dar de baja el espacio ' + e.codigo + '? El registro se conserva y se puede reactivar.'"
        [trabajando]="dandoBaja()" [error]="errorBaja()"
        (confirmado)="darDeBaja(e, $event)" (cerrado)="bajaDe.set(null)" />
    }
  `,
  styles: `
    .filtros-espacios { max-width: 260px; margin-bottom: 16px; }
    .rejilla-espacios { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
    .espacio { display: flex; flex-direction: column; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
    .espacio-cabeza { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .codigo { font-size: 1.6rem; font-weight: 700; color: var(--verde-900); line-height: 1.2; }
    .lote-actual { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
    .espacio .acciones { margin-top: auto; }
    .espacio .acciones .btn { flex: 1; }
    @media (min-width: 600px) { .rejilla-espacios { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 960px) { .rejilla-espacios { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class Espacios {
  private readonly api = inject(EspaciosApi);
  private readonly auth = inject(Auth);
  private readonly fincaActiva = inject(FincaActiva);

  protected readonly tipos = TIPOS_ESPACIO;
  protected readonly etiqueta = etiquetaDe;
  protected readonly fincaId = this.fincaActiva.id;
  protected readonly fincasListas = this.fincaActiva.cargada;

  protected readonly puedeGestionar = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('animales:gestionar');
  });
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });

  protected readonly estado = signal<EstadoRegistro>('ACTIVO');
  protected readonly espacios = signal<Espacio[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<Espacio | null>(null);
  protected readonly bajaDe = signal<Espacio | null>(null);
  protected readonly dandoBaja = signal(false);
  protected readonly errorBaja = signal<string | null>(null);

  private solicitud = 0;

  constructor() {
    effect(() => {
      const id = this.fincaId();
      untracked(() => {
        if (id) {
          this.cargando.set(true);
          this.recargar();
        } else {
          this.espacios.set([]);
          this.cargando.set(false);
        }
      });
    });
  }

  private recargar(): void {
    const id = this.fincaId();
    if (!id) return;
    const numero = ++this.solicitud;
    this.error.set(null);
    this.api.listar({ fincaId: id, estado: this.estado() }).subscribe({
      next: (r) => {
        if (numero !== this.solicitud) return;
        this.espacios.set(r.datos);
        this.cargando.set(false);
      },
      error: (e) => {
        if (numero !== this.solicitud) return;
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected cambiarEstado(valor: EstadoRegistro): void {
    this.estado.set(valor);
    this.recargar();
  }

  protected abrir(espacio: Espacio | null): void {
    this.aviso.set(null);
    this.editando.set(espacio);
    this.formularioAbierto.set(true);
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Espacio actualizado.' : 'Espacio creado.');
    this.formularioAbierto.set(false);
    this.recargar();
  }

  protected pedirBaja(espacio: Espacio): void {
    this.errorBaja.set(null);
    this.bajaDe.set(espacio);
  }

  protected darDeBaja(espacio: Espacio, motivo: string): void {
    this.dandoBaja.set(true);
    this.errorBaja.set(null);
    this.api.cambiarEstado(espacio.id, 'INACTIVO', motivo).subscribe({
      next: () => {
        this.dandoBaja.set(false);
        this.bajaDe.set(null);
        this.aviso.set('Espacio dado de baja.');
        this.recargar();
      },
      error: (e) => {
        this.dandoBaja.set(false);
        this.errorBaja.set(mensajeDeError(e));
      },
    });
  }

  protected reactivar(espacio: Espacio): void {
    this.aviso.set(null);
    this.api.cambiarEstado(espacio.id, 'ACTIVO').subscribe({
      next: () => {
        this.aviso.set('Espacio reactivado.');
        this.recargar();
      },
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }
}
