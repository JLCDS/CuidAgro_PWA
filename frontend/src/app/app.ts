import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BandaEstado } from './compartido/banda-estado';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BandaEstado],
  template: '<app-banda-estado /><router-outlet />',
})
export class App {}
