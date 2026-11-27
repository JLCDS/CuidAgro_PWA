import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FiltroDispositivo, Periodo, ResumenMetricas } from './calidad';

@Injectable({ providedIn: 'root' })
export class CalidadApi {
  private readonly http = inject(HttpClient);

  resumen(dias: Periodo, dispositivo: FiltroDispositivo): Observable<ResumenMetricas> {
    let params = new HttpParams().set('dias', dias);
    if (dispositivo) params = params.set('dispositivo', dispositivo);
    return this.http.get<ResumenMetricas>('/api/metricas/resumen', { params });
  }
}
