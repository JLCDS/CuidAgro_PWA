import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-no-autorizado',
  imports: [RouterLink],
  template: `
    <div class="vacio pila">
      <h1>No tienes permiso para ver esta página</h1>
      <p>Si crees que deberías tener acceso, habla con el administrador.</p>
      <div><a routerLink="/" class="btn">Volver al inicio</a></div>
    </div>
  `,
})
export class NoAutorizado {}
