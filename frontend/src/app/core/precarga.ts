import { effect, inject, Injectable, untracked } from '@angular/core';
import { Auth } from './auth';
import { AlimentosApi } from './alimentos-api';
import { Conexion } from './conexion';
import { FincaActiva } from './finca-activa';
import { LotesApi } from './lotes-api';
import { RacionesApi } from './raciones-api';
import { VacunosApi } from './vacunos-api';

/**
 * Consulta los catálogos que usan los formularios de consumo y novedad (vacunos y lotes activos, alimentos activos)
 * para que el service worker los deje en su caché y se puedan usar sin conexión.
 * Se repite al iniciar sesión, al cambiar de finca y al volver la señal.
 */
@Injectable({ providedIn: 'root' })
export class Precarga {
  private readonly auth = inject(Auth);
  private readonly conexion = inject(Conexion);
  private readonly fincaActiva = inject(FincaActiva);
  private readonly vacunos = inject(VacunosApi);
  private readonly lotes = inject(LotesApi);
  private readonly alimentos = inject(AlimentosApi);
  private readonly raciones = inject(RacionesApi);

  constructor() {
    effect(() => {
      const usuario = this.auth.usuario();
      const fincaId = this.fincaActiva.id();
      const hayRed = this.conexion.enLinea() && !this.auth.sinConexion();
      if (!usuario || !fincaId || !hayRed) return;
      if (!this.auth.tienePermiso('consumos:registrar') && !this.auth.tienePermiso('novedades:registrar')) return;
      untracked(() => this.precargar(fincaId));
    });
  }

  private precargar(fincaId: string): void {
    // Los mismos parámetros que usan los formularios: así la URL coincide con la copia guardada.
    const ignorar = { error: () => undefined };
    this.vacunos.listar({ fincaId, estado: 'ACTIVO', q: '', proposito: '' }).subscribe(ignorar);
    this.lotes.listar({ fincaId, estado: 'ACTIVO', q: '', proposito: '' }).subscribe(ignorar);
    if (this.auth.tienePermiso('consumos:registrar')) {
      this.raciones.obtener(fincaId).subscribe(ignorar);
      this.alimentos.listar({ fincaId, estado: 'ACTIVO', q: '', tipo: '', bajoStock: false }).subscribe(ignorar);
    }
  }
}
