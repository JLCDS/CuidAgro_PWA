import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PropositoLote } from './modelos';
import { FilaRacion } from './raciones';

export interface TablaRacion {
  personalizada: boolean;
  semanas: FilaRacion[];
}

export interface Raciones {
  fincaId: string;
  tablas: Record<PropositoLote, TablaRacion>;
}

@Injectable({ providedIn: 'root' })
export class RacionesApi {
  private readonly http = inject(HttpClient);

  /** Misma URL en la página, el consumo y la precarga: así el service worker la deja en caché. */
  obtener(fincaId: string): Observable<Raciones> {
    return this.http.get<Raciones>('/api/raciones', { params: new HttpParams().set('fincaId', fincaId) });
  }

  guardar(fincaId: string, proposito: PropositoLote, semanas: FilaRacion[]): Observable<Raciones> {
    return this.http.put<Raciones>('/api/raciones', { fincaId, proposito, semanas });
  }

  restaurar(fincaId: string, proposito: PropositoLote): Observable<void> {
    const params = new HttpParams().set('fincaId', fincaId).set('proposito', proposito);
    return this.http.delete<void>('/api/raciones', { params });
  }
}
