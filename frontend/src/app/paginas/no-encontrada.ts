import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-no-encontrada',
  imports: [RouterLink],
  template: `
    <main style="padding: 32px 16px; max-width: 560px; margin: 0 auto">
      <div class="vacio pila">
        <h1>Página no encontrada</h1>
        <div><a routerLink="/" class="btn">Volver al inicio</a></div>
      </div>
    </main>
  `,
})
export class NoEncontrada {}
