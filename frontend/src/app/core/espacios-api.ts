import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Espacio, EstadoRegistro, TipoEspacio } from './modelos';

export interface FiltrosEspacios {
  fincaId: string;
  estado?: EstadoRegistro;
  tipo?: TipoEspacio | '';
}

export interface EspacioGuardar {
  codigo: string;
  nombre: string;
  tipo: TipoEspacio;
  capacidad: number | null;
  observaciones: string;
}

export interface RespuestaEspacios {
  datos: Espacio[];
}

@Injectable({ providedIn: 'root' })
export class EspaciosApi {
  private readonly http = inject(HttpClient);

  listar({ fincaId, estado, tipo }: FiltrosEspacios): Observable<RespuestaEspacios> {
    let params = new HttpParams().set('fincaId', fincaId);
    if (estado) params = params.set('estado', estado);
    if (tipo) params = params.set('tipo', tipo);
    return this.http.get<RespuestaEspacios>('/api/espacios', { params });
  }

  crear(fincaId: string, datos: EspacioGuardar): Observable<Espacio> {
    return this.http.post<Espacio>('/api/espacios', { ...datos, fincaId });
  }

  actualizar(id: string, datos: EspacioGuardar): Observable<Espacio> {
    return this.http.patch<Espacio>(`/api/espacios/${id}`, datos);
  }

  cambiarEstado(id: string, estado: EstadoRegistro, motivoBaja?: string): Observable<Espacio> {
    return this.http.patch<Espacio>(`/api/espacios/${id}/estado`, { estado, motivoBaja });
  }
}
