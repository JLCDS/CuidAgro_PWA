import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Auth } from '../core/auth';
import { FincaActiva } from '../core/finca-activa';
import { ColaOffline } from '../core/cola-offline';
import { etiquetaRol, Permiso } from '../core/modelos';
import { NotificacionesPush } from '../core/notificaciones-push';
import { Precarga } from '../core/precarga';
import { Pwa } from '../core/pwa';

interface ItemMenu {
  ruta: string;
  etiqueta: string;
  icono: string;
  exacto: boolean;
  permiso?: Permiso;
  /** Visible si el usuario tiene al menos uno de estos permisos. */
  algunPermiso?: Permiso[];
}

const MENU: ItemMenu[] = [
  { ruta: '/', etiqueta: 'Inicio', exacto: true, icono: 'M3 11l9-8 9 8M5 10v10h14V10' },
  {
    ruta: '/vacunos',
    etiqueta: 'Vacunos',
    exacto: false,
    permiso: 'animales:consultar',
    icono: 'M4 8l3-4 3 3h4l3-3 3 4-2 3v5a4 4 0 01-4 4H10a4 4 0 01-4-4v-5zM9 14h.01M15 14h.01',
  },
  {
    ruta: '/lotes',
    etiqueta: 'Lotes',
    exacto: false,
    permiso: 'animales:consultar',
    icono: 'M12 3c-4 0-6 3-6 6 0 2 .8 3.500 2 4.500V17a4 4 0 008 0v-3.500c1.200-1 2-2.500 2-4.500 0-3-2-6-6-6zM9 21h6M12 8h.01',
  },
  {
    ruta: '/alimentos',
    etiqueta: 'Inventario',
    exacto: false,
    permiso: 'alimentos:consultar',
    icono: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  },
  {
    ruta: '/consumos',
    etiqueta: 'Alimentación',
    exacto: false,
    permiso: 'consumos:registrar',
    icono: 'M4 14h16a8 8 0 01-16 0zM12 14V6M9 9l3-3 3 3',
  },
  {
    ruta: '/novedades',
    etiqueta: 'Novedades',
    exacto: false,
    permiso: 'novedades:registrar',
    icono: 'M12 9v4M12 17h.01M10.300 3.900L1.800 18a2 2 0 001.700 3h17a2 2 0 001.700-3L13.700 3.900a2 2 0 00-3.400 0z',
  },
  {
    ruta: '/pendientes',
    etiqueta: 'Pendientes',
    exacto: false,
    algunPermiso: ['consumos:registrar', 'novedades:registrar'],
    icono: 'M12 8v4l3 2M21 12a9 9 0 11-3-6.700M21 4v5h-5',
  },
  {
    ruta: '/salud',
    etiqueta: 'Salud',
    exacto: false,
    permiso: 'salud:consultar',
    icono: 'M12 21s-8-5-8-11a4.500 4.500 0 018-2.800A4.500 4.500 0 0120 10c0 6-8 11-8 11zM12 8v6M9 11h6',
  },
  {
    ruta: '/medicamentos',
    etiqueta: 'Medicamentos',
    exacto: false,
    permiso: 'medicamentos:consultar',
    icono: 'M10.500 20.500a4.950 4.950 0 01-7-7l10-10a4.950 4.950 0 017 7zM8.500 8.500l7 7',
  },
  {
    ruta: '/tratamientos',
    etiqueta: 'Tratamientos',
    exacto: false,
    permiso: 'tratamientos:consultar',
    icono: 'M19 3l2 2-4 4-2-2zM17 7L7 17l-4 1 1-4 10-10zM12 12l-2-2',
  },
  {
    ruta: '/reportes',
    etiqueta: 'Reportes',
    exacto: false,
    permiso: 'reportes:consultar',
    icono: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  },
  {
    ruta: '/espacios',
    etiqueta: 'Espacios',
    exacto: false,
    permiso: 'animales:consultar',
    icono: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  },
  {
    ruta: '/usuarios',
    etiqueta: 'Usuarios',
    exacto: false,
    permiso: 'usuarios:gestionar',
    icono: 'M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8M22 20v-2a4 4 0 00-3-3.900M16 2.100a4 4 0 010 7.800',
  },
  {
    ruta: '/fincas',
    etiqueta: 'Fincas',
    exacto: false,
    permiso: 'fincas:gestionar',
    icono: 'M12 21s-7-6.300-7-12a7 7 0 0114 0c0 5.700-7 12-7 12zM12 11.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5',
  },
  {
    ruta: '/calidad',
    etiqueta: 'Calidad',
    exacto: false,
    permiso: 'calidad:consultar',
    icono: 'M12 14l4-4M3.300 17a10 10 0 1117.400 0',
  },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="barra">
      <a routerLink="/" class="marca">
        <img src="img/logo.webp" alt="" width="38" height="38" />
        CuidAgro
      </a>
      @if (fincas().length > 1) {
        <select class="selector-finca" aria-label="Finca activa" (change)="elegirFinca($any($event.target).value)">
          @for (finca of fincas(); track finca.id) {
            <option [value]="finca.id" [selected]="finca.id === fincaId()">{{ finca.nombre }}</option>
          }
        </select>
      }
      @if (usuario(); as u) {
        <div class="sesion">
          <div class="quien">
            <strong>{{ u.nombre }}</strong>
            <span>{{ rol() }}</span>
          </div>
          <button type="button" class="btn cuenta" aria-label="Menú de usuario" [attr.aria-expanded]="cuentaAbierta()" (click)="cuentaAbierta.set(!cuentaAbierta())">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8" /></svg>
          </button>
          <button type="button" class="btn salir" (click)="salir()">Salir</button>
          @if (cuentaAbierta()) {
            <div class="menu-cuenta" role="menu">
              <p class="menu-cuenta-quien"><strong>{{ u.nombre }}</strong><span>{{ rol() }}</span></p>
              @if (pwa.instalable()) {
                <button type="button" class="btn" role="menuitem" (click)="instalar()">Instalar app</button>
              }
              @if (push.visible()) {
                @if (push.estado() === 'activo') {
                  <button type="button" class="btn" role="menuitem" [disabled]="push.trabajando()" (click)="push.desactivar()">Desactivar notificaciones</button>
                } @else if (push.estado() === 'bloqueado') {
                  <p class="suave">Notificaciones bloqueadas en el navegador.</p>
                } @else {
                  <button type="button" class="btn" role="menuitem" [disabled]="push.trabajando()" (click)="push.activar()">Activar notificaciones</button>
                }
                @if (push.error(); as mensaje) {
                  <p class="error-campo" role="alert">{{ mensaje }}</p>
                }
              }
              @if (!pwa.instalable() && !push.visible()) {
                <p class="suave">No hay opciones disponibles.</p>
              }
            </div>
          }
        </div>
      }
    </header>

    <div class="cuerpo">
      <nav class="menu" [class.abierto]="masAbierto()" aria-label="Principal">
        @for (item of menu(); track item.ruta; let i = $index) {
          <a
            [class.extra]="conMas() && i >= VISIBLES_MOVIL"
            (click)="masAbierto.set(false)"
            [routerLink]="item.ruta"
            routerLinkActive="activo"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: item.exacto }"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path [attr.d]="item.icono" />
            </svg>
            {{ item.etiqueta }}
            @if (item.ruta === '/pendientes' && pendientes() > 0) {
              <span class="contador" [attr.aria-label]="pendientes() + ' pendientes'">{{ pendientes() }}</span>
            }
          </a>
        }
        @if (conMas()) {
          <button type="button" class="mas" [class.activo]="extraActivo() && !masAbierto()"
            [attr.aria-expanded]="masAbierto()" (click)="masAbierto.set(!masAbierto())">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path [attr.d]="masAbierto() ? 'M6 6l12 12M18 6L6 18' : 'M5 12h.01M12 12h.01M19 12h.01'" />
            </svg>
            {{ masAbierto() ? 'Cerrar' : 'Más' }}
            @if (pendientesEnMas() && !masAbierto()) {
              <span class="contador" aria-label="Hay pendientes">{{ pendientes() }}</span>
            }
          </button>
        }
      </nav>
      <main class="contenido"><router-outlet /></main>
    </div>
  `,
  styles: `
    .barra {
      position: sticky; top: 0; z-index: 10;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 8px 16px; background: var(--verde-700); color: #fff;
    }
    .marca { display: flex; align-items: center; gap: 10px; color: #fff; font-size: 1.2rem; font-weight: 700; text-decoration: none; }
    .marca img { border-radius: 8px; outline: 1px solid rgb(255 255 255 / 35%); }
    .sesion { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .selector-finca {
      flex: 1 1 0; min-width: 0; max-width: 260px; min-height: 44px; padding: 0 8px;
      border: 1px solid rgb(255 255 255 / 50%); border-radius: 10px;
      background: var(--verde-900); color: #fff; font: inherit; font-weight: 600;
    }
    .sesion { position: relative; }
    .cuenta { background: transparent; color: #fff; border-color: rgb(255 255 255 / 50%); min-height: 44px; min-width: 44px; padding: 0 8px; }
    .cuenta:hover:not(:disabled) { background: var(--verde-900); }
    .menu-cuenta {
      position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; width: min(280px, calc(100vw - 32px));
      display: flex; flex-direction: column; gap: 8px; padding: 12px;
      background: var(--blanco); color: var(--texto); border: 1px solid var(--borde); border-radius: 12px; box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
    }
    .menu-cuenta-quien { display: flex; flex-direction: column; line-height: 1.3; }
    .menu-cuenta-quien span { font-size: 0.85rem; color: var(--texto-suave); }
    .menu a, .menu .mas { position: relative; }
    .contador {
      position: absolute; top: 4px; left: calc(50% + 6px); min-width: 20px; padding: 0 5px; border-radius: 999px;
      background: var(--peligro); color: #fff; font-size: 0.75rem; line-height: 20px; text-align: center;
    }
    .quien { display: none; text-align: right; line-height: 1.2; }
    .quien span { display: block; font-size: 0.85rem; opacity: 0.85; }
    .salir { background: transparent; color: #fff; border-color: rgb(255 255 255 / 50%); min-height: 44px; }
    .salir:hover:not(:disabled) { background: var(--verde-900); }
    .cuerpo { display: block; }
    .contenido { padding: 16px 16px calc(96px + env(safe-area-inset-bottom)); max-width: 1100px; margin: 0 auto; }
    .menu {
      position: fixed; inset: auto 0 0 0; z-index: 10;
      display: flex; overflow-x: auto; background: var(--blanco); border-top: 1px solid var(--borde);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .menu a, .menu .mas {
      flex: 1 0 64px; border: 0; background: none; font-family: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      min-height: 60px; color: var(--texto-suave); font-size: 0.75rem; font-weight: 600; text-decoration: none;
    }
    .menu a.activo, .menu .mas.activo { color: var(--verde-700); background: var(--verde-100); }
    .menu a.extra { display: none; }
    .menu.abierto { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); box-shadow: 0 -8px 24px rgb(0 0 0 / 12%); }
    .menu.abierto a.extra { display: flex; }
    @media (min-width: 720px) {
      .quien { display: block; }
      .cuerpo { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: calc(100vh - 62px); }
      .contenido { padding: 24px; width: 100%; }
      .menu {
        position: static; flex-direction: column; gap: 4px; padding: 16px 12px;
        border-top: 0; border-right: 1px solid var(--borde);
      }
      .menu .mas { display: none; }
      .menu a.extra { display: flex; }
      .contador { position: static; margin-left: auto; }
      .menu a { flex: none; flex-direction: row; justify-content: flex-start; gap: 12px; min-height: 48px; padding: 0 12px; border-radius: 10px; font-size: 1rem; }
    }
  `,
})
export class Shell {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly cola = inject(ColaOffline);
  protected readonly pwa = inject(Pwa);
  protected readonly push = inject(NotificacionesPush);
  protected readonly cuentaAbierta = signal(false);
  protected readonly pendientes = this.cola.total;

  constructor() {
    // Mantiene en la caché del service worker los catálogos que usan los formularios sin conexión.
    inject(Precarga);
  }

  protected readonly fincas = this.fincaActiva.fincas;
  protected readonly fincaId = this.fincaActiva.id;

  protected readonly usuario = this.auth.usuario;
  protected readonly rol = computed(() => {
    const u = this.usuario();
    return u ? etiquetaRol(u.rol) : '';
  });
  protected readonly menu = computed(() => {
    this.usuario();
    return MENU.filter((i) =>
      i.algunPermiso ? i.algunPermiso.some((p) => this.auth.tienePermiso(p)) : !i.permiso || this.auth.tienePermiso(i.permiso),
    );
  });

  /** En el celular caben 5 botones: si hay más opciones, se muestran 4 y un botón "Más". */
  protected readonly VISIBLES_MOVIL = 4;
  protected readonly conMas = computed(() => this.menu().length > this.VISIBLES_MOVIL + 1);
  protected readonly masAbierto = signal(false);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly pendientesEnMas = computed(
    () => this.conMas() && this.pendientes() > 0 && this.menu().findIndex((i) => i.ruta === '/pendientes') >= this.VISIBLES_MOVIL,
  );
  protected readonly extraActivo = computed(() => {
    const url = this.url().split(/[?#]/)[0];
    return this.menu()
      .slice(this.VISIBLES_MOVIL)
      .some((i) => (i.exacto ? url === i.ruta : url === i.ruta || url.startsWith(i.ruta + '/')));
  });

  protected elegirFinca(id: string): void {
    this.fincaActiva.seleccionar(id);
  }

  protected async instalar(): Promise<void> {
    await this.pwa.instalar();
    this.cuentaAbierta.set(false);
  }

  protected async salir(): Promise<void> {
    if (this.pendientes() > 0) {
      const ok = confirm(
        `Tienes ${this.pendientes()} registro(s) sin enviar en este dispositivo. Si cierras sesión no se enviarán hasta que vuelvas a entrar. ¿Cerrar sesión de todos modos?`,
      );
      if (!ok) return;
    }
    this.cuentaAbierta.set(false);
    // Antes de cerrar la sesión (hace falta el token): este dispositivo deja de recibir avisos del usuario.
    await this.push.alCerrarSesion();
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
