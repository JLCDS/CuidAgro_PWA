import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincaActiva } from '../core/finca-activa';
import { etiquetaDe, etiquetaRol, formatearFecha } from '../core/modelos';
import { DashboardApi } from '../core/reportes-api';
import { Dashboard, formatearPeso } from '../core/reportes-modelos';
import { TIPOS_NOVEDAD } from '../core/salud-modelos';
import { GraficoBarras } from './grafico-barras';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, GraficoBarras],
  template: `
    @if (auth.usuario(); as u) {
      <div class="pila">
        <div class="cabecera-pagina">
          <header class="portada">
            <img src="img/cabecera-inicio.webp" srcset="img/cabecera-inicio-640.webp 640w, img/cabecera-inicio-800.webp 800w, img/cabecera-inicio.webp 1600w" sizes="(min-width: 720px) 880px, 100vw" alt="" width="1600" height="533" fetchpriority="high" />
            <div class="saludo">
              <h1>Hola, {{ u.nombre }}</h1>
              <p>{{ rol() }}@if (panel(); as p) { · {{ p.finca.nombre }} }</p>
            </div>
          </header>
          <div class="acciones">
            @if (puedeConsumo()) {
              <a routerLink="/consumos" class="btn btn-primario">Registrar consumo</a>
            }
            @if (puedeNovedad()) {
              <a routerLink="/novedades" class="btn">Nueva novedad</a>
            }
          </div>
        </div>

        @if (!fincaId()) {
          @if (fincasListas()) {
          <div class="vacio">
            <img class="vacio-escena" src="img/finca.webp" alt="" width="720" height="540" loading="lazy" />
            Aún no hay una finca para trabajar.
            @if (u.rol === 'ADMINISTRADOR') {
              <a routerLink="/fincas">Crea una finca</a> para ver el panel.
            } @else {
              Pide al administrador que te asigne una.
            }
          </div>
          }
        } @else {
          @if (error(); as mensaje) {
            <p class="alerta" role="alert">{{ mensaje }}</p>
            <button type="button" class="btn" (click)="cargar()">Reintentar</button>
          }

          @if (panel(); as p) {
            <section class="indicadores" aria-label="Indicadores de la finca">
              <a class="indicador" routerLink="/vacunos">
                <span class="cifra">{{ p.animales.vacunosActivos }}</span>
                <span class="etiqueta">Vacunos activos</span>
                @if (p.alimentacion.vacunosSinConsumoHoy > 0) {
                  <span class="nota">{{ p.alimentacion.vacunosSinConsumoHoy }} sin consumo hoy</span>
                }
              </a>
              <a class="indicador" routerLink="/lotes">
                <span class="cifra">{{ p.animales.lotesActivos }}</span>
                <span class="etiqueta">Lotes activos</span>
                <span class="nota">{{ aves(p.animales.avesActivas) }}</span>
              </a>
              <a class="indicador" routerLink="/consumos">
                <span class="cifra">{{ peso(p.alimentacion.consumoHoyGramos) }}</span>
                <span class="etiqueta">Consumo de hoy</span>
                <span class="nota">{{ p.alimentacion.registrosHoy }} {{ p.alimentacion.registrosHoy === 1 ? 'registro' : 'registros' }}</span>
              </a>
              <a class="indicador" routerLink="/salud">
                <span class="cifra">{{ p.salud.casosActivos }}</span>
                <span class="etiqueta">Casos de salud activos</span>
              </a>
              <a class="indicador" routerLink="/novedades" [class.destacado]="p.salud.novedadesAltaAbiertas > 0">
                <span class="cifra">{{ p.salud.novedadesAbiertas }}</span>
                <span class="etiqueta">Novedades abiertas</span>
                @if (p.salud.novedadesAltaAbiertas > 0) {
                  <span class="nota nota-alta">{{ p.salud.novedadesAltaAbiertas }} de prioridad alta</span>
                }
              </a>
              <a class="indicador" routerLink="/tratamientos" [class.destacado]="p.medicamentos.animalesEnRetiro > 0">
                <span class="cifra">{{ p.medicamentos.animalesEnRetiro }}</span>
                <span class="etiqueta">En periodo de retiro</span>
              </a>
            </section>

            <section class="tarjeta pila">
              <h2>Consumo de los últimos 7 días</h2>
              <app-grafico-barras [serie]="serie()" titulo="Consumo de alimento de los últimos 7 días" [anchoPorBarra]="34" />
            </section>

            <div class="alertas">
              <section class="tarjeta pila">
                <h2>Alimentos con stock bajo</h2>
                @if (p.alimentacion.alimentosStockBajo.length === 0) {
                  <p class="suave">Todo el inventario está por encima del mínimo.</p>
                } @else {
                  <ul class="lista">
                    @for (a of p.alimentacion.alimentosStockBajo; track a.id) {
                      <li>
                        <strong>{{ a.nombre }}</strong>
                        <span class="suave">{{ peso(a.stockGramos) }} de mínimo {{ peso(a.stockMinimoGramos) }}</span>
                      </li>
                    }
                  </ul>
                  <a routerLink="/alimentos">Ver inventario</a>
                }
              </section>

              <section class="tarjeta pila">
                <h2>Medicamentos con alerta</h2>
                @if (p.medicamentos.conAlerta.length === 0) {
                  <p class="suave">Sin alertas de stock ni vencimiento.</p>
                } @else {
                  <ul class="lista">
                    @for (m of p.medicamentos.conAlerta; track m.id) {
                      <li>
                        <strong>{{ m.nombre }}</strong>
                        <span>
                          @if (m.vencido) { <span class="insignia insignia-inactivo">Vencido</span> }
                          @if (m.porVencer) { <span class="insignia insignia-alerta">Por vencer</span> }
                          @if (m.bajoStock) { <span class="insignia insignia-alerta">Stock bajo</span> }
                        </span>
                      </li>
                    }
                  </ul>
                  <a routerLink="/medicamentos">Ver medicamentos</a>
                }
              </section>

              <section class="tarjeta pila">
                <h2>Últimas novedades</h2>
                @if (p.salud.ultimasNovedades.length === 0) {
                  <p class="suave">No hay novedades abiertas.</p>
                } @else {
                  <ul class="lista">
                    @for (n of p.salud.ultimasNovedades; track n.id) {
                      <li>
                        <strong>{{ tipo(n.tipo) }}@if (n.sujeto) { · {{ n.sujeto.nombre }} }</strong>
                        <span class="suave">
                          {{ fechaHora(n.fechaHora) }}
                          @if (n.prioridad === 'ALTA') { <span class="insignia insignia-inactivo">Alta</span> }
                        </span>
                      </li>
                    }
                  </ul>
                  <a routerLink="/novedades">Ver novedades</a>
                }
              </section>
            </div>
          } @else if (cargando()) {
            <p class="suave" role="status">Cargando panel…</p>
          }
        }

        <!-- Debajo del panel: se muestra cuando este ya cargó, para que no se desplace al llegar los datos. -->
        @if (u.rol === 'ADMINISTRADOR' && fincasListas() && !cargando()) {
          <section class="tarjeta pila">
            <h2>Administración</h2>
            <p class="suave">Registra las fincas y crea las cuentas de quienes trabajan en ellas.</p>
            <div class="acciones">
              <a routerLink="/fincas" class="btn btn-primario">Gestionar fincas</a>
              <a routerLink="/usuarios" class="btn">Gestionar usuarios</a>
            </div>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .cabecera-pagina { display: grid; justify-content: stretch; margin-bottom: 0; }
    .portada {
      position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: flex-end;
      min-height: 168px; padding: 18px; border-radius: var(--radio); background: var(--verde-900);
    }
    .portada img { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover; object-position: 62% 40%; }
    .portada::after {
      content: ''; position: absolute; inset: 0; z-index: -1;
      background: linear-gradient(0deg, rgb(20 46 27 / 82%) 0%, rgb(20 46 27 / 30%) 55%, rgb(20 46 27 / 0%) 100%);
    }
    .saludo { color: #fff; text-shadow: 0 1px 10px rgb(0 0 0 / 30%); }
    .saludo h1 { margin-bottom: 0; color: #fff; }
    .saludo p { opacity: 0.92; }
    @media (min-width: 720px) {
      .portada { min-height: 220px; padding: 24px 28px; }
      .saludo h1 { font-size: 1.9rem; }
    }
    .indicadores { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .indicador {
      display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 14px;
      border: 1px solid var(--borde); border-radius: var(--radio); background: var(--blanco);
      box-shadow: var(--sombra); color: var(--texto); text-decoration: none;
    }
    .indicador:hover { background: var(--verde-100); }
    .indicador.destacado { border-color: var(--peligro); background: var(--peligro-fondo); }
    .cifra { font-size: 1.6rem; font-weight: 700; line-height: 1.15; color: var(--verde-900); overflow-wrap: anywhere; }
    .destacado .cifra { color: var(--peligro); }
    .etiqueta { font-weight: 600; }
    .nota { color: var(--texto-suave); font-size: 0.9rem; }
    .nota-alta { color: var(--peligro); font-weight: 600; }
    .alertas { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
    .lista { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .lista li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding-bottom: 8px; border-bottom: 1px solid var(--borde); }
    .insignia { margin-left: 4px; }
    @media (min-width: 720px) {
      .indicadores { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .alertas { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  `,
})
export class Inicio {
  protected readonly auth = inject(Auth);
  private readonly api = inject(DashboardApi);
  private readonly fincaActiva = inject(FincaActiva);

  protected readonly fincaId = this.fincaActiva.id;
  protected readonly fincasListas = this.fincaActiva.cargada;
  protected readonly panel = signal<Dashboard | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly rol = computed(() => {
    const u = this.auth.usuario();
    return u ? etiquetaRol(u.rol) : '';
  });
  protected readonly puedeConsumo = computed(() => {
    this.auth.usuario();
    return Boolean(this.fincaId()) && this.auth.tienePermiso('consumos:registrar');
  });
  protected readonly puedeNovedad = computed(() => {
    this.auth.usuario();
    return Boolean(this.fincaId()) && this.auth.tienePermiso('novedades:registrar');
  });
  protected readonly serie = computed(
    () => this.panel()?.alimentacion.ultimos7Dias.map((d) => ({ periodo: d.fecha, gramos: d.gramos })) ?? [],
  );

  protected readonly peso = formatearPeso;
  protected readonly aves = (n: number): string => `${n} ${n === 1 ? 'ave' : 'aves'}`;
  protected readonly tipo = (valor: string): string => etiquetaDe(TIPOS_NOVEDAD, valor);
  protected readonly fechaHora = (iso: string): string => {
    const fecha = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const hora = new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
    return `${formatearFecha(fecha)} ${hora}`;
  };

  private solicitud = 0;

  constructor() {
    // Carga al abrir la página y cada vez que cambia la finca activa.
    effect(() => {
      const id = this.fincaId();
      this.auth.usuario();
      untracked(() => {
        this.panel.set(null);
        if (id && this.auth.tienePermiso('dashboard:consultar')) this.cargar();
      });
    });
  }

  protected cargar(): void {
    const id = this.fincaId();
    if (!id) return;
    const numero = ++this.solicitud;
    this.cargando.set(true);
    this.error.set(null);
    this.api.obtener(id).subscribe({
      next: (panel) => {
        if (numero !== this.solicitud) return;
        this.panel.set(panel);
        this.cargando.set(false);
      },
      error: (e) => {
        if (numero !== this.solicitud) return;
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }
}
