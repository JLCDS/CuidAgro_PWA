import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { FincaActiva } from '../core/finca-activa';
import { TipoConsumo } from '../core/modelos';
import { ConsumoPanel } from './consumo-panel';

@Component({
  selector: 'app-consumos',
  imports: [RouterLink, ConsumoPanel],
  template: `
    <div class="cabecera-pagina">
      <h1>Alimentación</h1>
    </div>

    @if (fincaId(); as id) {
      <div class="pestanas" role="tablist" aria-label="Tipo de consumo">
        <button type="button" role="tab" class="btn" [class.activa]="tab() === 'vacunos'" [attr.aria-selected]="tab() === 'vacunos'" (click)="tab.set('vacunos')">Vacunos</button>
        <button type="button" role="tab" class="btn" [class.activa]="tab() === 'lotes'" [attr.aria-selected]="tab() === 'lotes'" (click)="tab.set('lotes')">Lotes de aves</button>
      </div>

      @if (tab() === 'vacunos') {
        <app-consumo-panel tipo="vacunos" [fincaId]="id" />
      } @else {
        <app-consumo-panel tipo="lotes" [fincaId]="id" />
      }
    } @else {
      <div class="vacio">
        <img class="vacio-escena" src="img/finca.webp" alt="" width="720" height="540" loading="lazy" />
        Aún no hay una finca para trabajar.
        @if (puedeCrearFincas()) {
          <a routerLink="/fincas">Crea una finca</a> primero.
        }
      </div>
    }
  `,
  styles: `
    .pestanas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
    .pestanas .activa { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
  `,
})
export class Consumos {
  private readonly auth = inject(Auth);

  protected readonly fincaId = inject(FincaActiva).id;
  protected readonly tab = signal<TipoConsumo>('vacunos');
  protected readonly puedeCrearFincas = computed(() => {
    this.auth.usuario();
    return this.auth.tienePermiso('fincas:gestionar');
  });
}
