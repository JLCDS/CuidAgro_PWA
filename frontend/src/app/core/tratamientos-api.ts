import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Tratamiento, ViaAdministracion } from './medicamentos-modelos';

export interface FiltrosTratamientos {
  fincaId: string;
  vacunoId?: string;
  loteId?: string;
  casoSaludId?: string;
  medicamentoId?: string;
  desde?: string;
  hasta?: string;
  enRetiro?: boolean;
}

export interface TratamientoGuardar {
  vacunoId?: string;
  loteId?: string;
  medicamentoId: string;
  casoSaludId: string | null;
  dosis: number;
  via: ViaAdministracion;
  fecha: string;
  diasRetiroCarne: number | null;
  diasRetiroLeche: number | null;
  observaciones: string;
}

@Injectable({ providedIn: 'root' })
export class TratamientosApi {
  private readonly http = inject(HttpClient);

  listar(f: FiltrosTratamientos): Observable<Tratamiento[]> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(f)) if (valor) params = params.set(clave, String(valor));
    return this.http.get<Tratamiento[]>('/api/tratamientos', { params });
  }

  crear(datos: TratamientoGuardar): Observable<Tratamiento> {
    return this.http.post<Tratamiento>('/api/tratamientos', datos);
  }

  /** El animal o lote no cambia al editar. */
  actualizar(id: string, datos: Omit<TratamientoGuardar, 'vacunoId' | 'loteId'>): Observable<Tratamiento> {
    return this.http.patch<Tratamiento>(`/api/tratamientos/${id}`, datos);
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`/api/tratamientos/${id}`);
  }
}
