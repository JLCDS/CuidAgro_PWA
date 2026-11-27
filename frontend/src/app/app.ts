import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BandaEstado } from './compartido/banda-estado';
import { Metricas } from './core/metricas';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BandaEstado],
  template: '<app-banda-estado /><router-outlet />',
})
export class App {
  constructor() {
    // Mide los Core Web Vitals (solo en producción) y los envía al servidor.
    inject(Metricas).iniciar();
  }
}
