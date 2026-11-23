import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { etiquetaRol } from '../core/modelos';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  template: `
    @if (auth.usuario(); as u) {
      <div class="pila">
        <div>
          <h1>Hola, {{ u.nombre }}</h1>
          <p class="suave">{{ rol() }}</p>
        </div>

        @if (u.rol === 'ADMINISTRADOR') {
          <section class="tarjeta pila">
            <h2>Administración</h2>
            <p class="suave">Registra las fincas y crea las cuentas de quienes trabajan en ellas.</p>
            <div class="acciones">
              <a routerLink="/fincas" class="btn btn-primario">Gestionar fincas</a>
              <a routerLink="/usuarios" class="btn">Gestionar usuarios</a>
            </div>
          </section>
        } @else {
          <section class="tarjeta pila">
            <h2>Tus fincas</h2>
            <ul class="fincas">
              @for (finca of u.fincas; track finca.id) {
                <li>{{ finca.nombre }}</li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .fincas { margin: 0; padding-left: 20px; }
  `,
})
export class Inicio {
  protected readonly auth = inject(Auth);
  protected readonly rol = computed(() => {
    const u = this.auth.usuario();
    return u ? etiquetaRol(u.rol) : '';
  });
}
