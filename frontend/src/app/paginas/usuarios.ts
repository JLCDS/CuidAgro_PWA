import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, EMPTY, Subject, switchMap, tap } from 'rxjs';
import { Auth } from '../core/auth';
import { mensajeDeError } from '../core/errores';
import { FincasApi } from '../core/fincas-api';
import { EstadoUsuario, etiquetaRol, Finca, Rol, ROLES, UsuarioDetalle } from '../core/modelos';
import { UsuariosApi } from '../core/usuarios-api';
import { UsuarioForm } from './usuario-form';

const TAMANO_PAGINA = 20;

@Component({
  selector: 'app-usuarios',
  imports: [UsuarioForm],
  template: `
    <div class="cabecera-pagina">
      <h1>Usuarios</h1>
      <button type="button" class="btn btn-primario" (click)="abrir(null)">Nuevo usuario</button>
    </div>

    <div class="filtros">
      <input class="input" type="search" placeholder="Buscar por nombre o correo" aria-label="Buscar por nombre o correo"
        [value]="q()" (input)="cambiarBusqueda($any($event.target).value)" />
      <select class="input" aria-label="Filtrar por rol" [value]="rol()" (change)="cambiarRol($any($event.target).value)">
        <option value="">Todos los roles</option>
        @for (r of roles; track r.valor) {
          <option [value]="r.valor">{{ r.etiqueta }}</option>
        }
      </select>
      <select class="input" aria-label="Filtrar por estado" [value]="estado()" (change)="cambiarEstadoFiltro($any($event.target).value)">
        <option value="">Todos los estados</option>
        <option value="ACTIVO">Activos</option>
        <option value="INACTIVO">Inactivos</option>
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
    } @else if (usuarios().length === 0 && !error()) {
      <div class="vacio">No hay usuarios que coincidan con la búsqueda.</div>
    } @else {
      <table class="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Fincas</th>
            <th>Estado</th>
            <th><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (u of usuarios(); track u.id) {
            <tr>
              <td>
                <strong>{{ u.nombre }}</strong><br />
                <span class="suave">{{ u.correo }}</span>
              </td>
              <td data-etiqueta="Rol">{{ etiqueta(u.rol) }}</td>
              <td data-etiqueta="Fincas">{{ nombresFincas(u) }}</td>
              <td data-etiqueta="Estado">
                <span class="insignia" [class.insignia-activo]="u.estado === 'ACTIVO'" [class.insignia-inactivo]="u.estado === 'INACTIVO'">
                  {{ u.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}
                </span>
              </td>
              <td>
                <div class="acciones">
                  <button type="button" class="btn" (click)="abrir(u)">Editar</button>
                  @if (u.id !== idPropio()) {
                    @if (u.estado === 'ACTIVO') {
                      <button type="button" class="btn btn-peligro" (click)="cambiarEstado(u, 'INACTIVO')">Desactivar</button>
                    } @else {
                      <button type="button" class="btn" (click)="cambiarEstado(u, 'ACTIVO')">Activar</button>
                    }
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (total() > tamano) {
        <nav class="paginacion" aria-label="Paginación">
          <button type="button" class="btn" [disabled]="page() === 1" (click)="irA(page() - 1)">Anterior</button>
          <span class="suave">Página {{ page() }} de {{ paginas() }}</span>
          <button type="button" class="btn" [disabled]="page() >= paginas()" (click)="irA(page() + 1)">Siguiente</button>
        </nav>
      }
    }

    @if (formularioAbierto()) {
      <app-usuario-form [usuario]="editando()" [fincas]="fincas()" (guardado)="alGuardar()" (cerrado)="cerrar()" />
    }
  `,
})
export class Usuarios implements OnInit {
  private readonly api = inject(UsuariosApi);
  private readonly fincasApi = inject(FincasApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly busqueda$ = new Subject<void>();
  private readonly recarga$ = new Subject<void>();

  protected readonly roles = ROLES;
  protected readonly tamano = TAMANO_PAGINA;
  protected readonly etiqueta = etiquetaRol;
  protected readonly idPropio = computed(() => this.auth.usuario()?.id);

  protected readonly q = signal('');
  protected readonly rol = signal<Rol | ''>('');
  protected readonly estado = signal<EstadoUsuario | ''>('');
  protected readonly page = signal(1);

  protected readonly usuarios = signal<UsuarioDetalle[]>([]);
  protected readonly total = signal(0);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / TAMANO_PAGINA)));
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly fincas = signal<Finca[]>([]);
  protected readonly formularioAbierto = signal(false);
  protected readonly editando = signal<UsuarioDetalle | null>(null);

  ngOnInit(): void {
    this.busqueda$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.recarga$.next());

    // switchMap descarta respuestas de filtros anteriores que lleguen tarde.
    this.recarga$
      .pipe(
        tap(() => this.error.set(null)),
        switchMap(() =>
          this.api.listar({ q: this.q(), rol: this.rol(), estado: this.estado(), page: this.page() }).pipe(
            catchError((error) => {
              this.error.set(mensajeDeError(error));
              this.cargando.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((pagina) => {
        this.usuarios.set(pagina.items);
        this.total.set(pagina.total);
        this.cargando.set(false);
      });

    this.recarga$.next();
    this.cargarFincas();
  }

  private cargarFincas(): void {
    this.fincasApi.listar().subscribe({
      next: (fincas) => this.fincas.set(fincas),
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }

  protected cambiarBusqueda(valor: string): void {
    this.q.set(valor);
    this.page.set(1);
    this.busqueda$.next();
  }

  protected cambiarRol(valor: Rol | ''): void {
    this.rol.set(valor);
    this.page.set(1);
    this.recarga$.next();
  }

  protected cambiarEstadoFiltro(valor: EstadoUsuario | ''): void {
    this.estado.set(valor);
    this.page.set(1);
    this.recarga$.next();
  }

  protected irA(pagina: number): void {
    this.page.set(pagina);
    this.recarga$.next();
  }

  protected abrir(usuario: UsuarioDetalle | null): void {
    this.cargarFincas();
    this.editando.set(usuario);
    this.formularioAbierto.set(true);
  }

  protected cerrar(): void {
    this.formularioAbierto.set(false);
  }

  protected alGuardar(): void {
    this.aviso.set(this.editando() ? 'Usuario actualizado.' : 'Usuario creado.');
    this.cerrar();
    this.recarga$.next();
  }

  protected nombresFincas(usuario: UsuarioDetalle): string {
    if (usuario.rol === 'ADMINISTRADOR') return 'Todas';
    return usuario.fincas.map((f) => f.nombre).join(', ');
  }

  protected cambiarEstado(usuario: UsuarioDetalle, estado: EstadoUsuario): void {
    if (estado === 'INACTIVO' && !confirm(`¿Desactivar a ${usuario.nombre}? No podrá iniciar sesión.`)) return;
    this.aviso.set(null);
    this.api.cambiarEstado(usuario.id, estado).subscribe({
      next: () => {
        this.aviso.set(estado === 'ACTIVO' ? 'Usuario activado.' : 'Usuario desactivado.');
        this.recarga$.next();
      },
      error: (error) => this.error.set(mensajeDeError(error)),
    });
  }
}
