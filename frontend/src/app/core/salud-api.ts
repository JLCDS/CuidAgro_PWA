import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CasoSalud, EstadoCasoSalud } from './salud-modelos';

export interface FiltrosCasos {
  fincaId: string;
  vacunoId?: string;
  loteId?: string;
  estado?: EstadoCasoSalud | '';
  activos?: boolean;
}

export interface CasoGuardar {
  vacunoId?: string;
  loteId?: string;
  novedadId?: string;
  diagnostico: string;
  sintomas: string;
  estado: EstadoCasoSalud;
  fechaInicio: string;
  fechaFin?: string | null;
  animalesAfectados?: number | null;
  observaciones: string;
}

@Injectable({ providedIn: 'root' })
export class SaludApi {
  private readonly http = inject(HttpClient);

  listar(f: FiltrosCasos): Observable<CasoSalud[]> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(f)) if (valor) params = params.set(clave, String(valor));
    return this.http.get<CasoSalud[]>('/api/salud/casos', { params });
  }

  crear(datos: CasoGuardar): Observable<CasoSalud> {
    return this.http.post<CasoSalud>('/api/salud/casos', datos);
  }

  actualizar(id: string, datos: Partial<CasoGuardar>): Observable<CasoSalud> {
    return this.http.patch<CasoSalud>(`/api/salud/casos/${id}`, datos);
  }
}
