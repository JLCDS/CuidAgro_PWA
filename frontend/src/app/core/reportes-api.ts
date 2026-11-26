import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Dashboard, FiltrosReporte, ReporteConsumos } from './reportes-modelos';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  obtener(fincaId: string): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard', { params: new HttpParams().set('fincaId', fincaId) });
  }
}

@Injectable({ providedIn: 'root' })
export class ReportesApi {
  private readonly http = inject(HttpClient);

  consumos(f: FiltrosReporte): Observable<ReporteConsumos> {
    let params = new HttpParams()
      .set('fincaId', f.fincaId)
      .set('desde', f.desde)
      .set('hasta', f.hasta)
      .set('agrupacion', f.agrupacion)
      .set('sujeto', f.sujeto)
      .set('desglose', f.desglose);
    if (f.vacunoId) params = params.set('vacunoId', f.vacunoId);
    if (f.loteId) params = params.set('loteId', f.loteId);
    if (f.espacioId) params = params.set('espacioId', f.espacioId);
    if (f.alimentoId) params = params.set('alimentoId', f.alimentoId);
    return this.http.get<ReporteConsumos>('/api/reportes/consumos', { params });
  }
}
