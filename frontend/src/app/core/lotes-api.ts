import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EstadoRegistro, FiltroEstado, Lote, PropositoLote } from './modelos';

export interface FiltrosLotes {
  fincaId: string;
  estado: FiltroEstado;
  q: string;
  proposito: PropositoLote | '';
}

export interface LoteGuardar {
  nombre: string;
  tipoAve: string;
  edadMinSemanas: number;
  edadMaxSemanas: number;
  cantidad: number;
  proposito: PropositoLote;
  fechaIngreso: string | null;
  observaciones: string;
}

@Injectable({ providedIn: 'root' })
export class LotesApi {
  private readonly http = inject(HttpClient);

  listar({ fincaId, estado, q, proposito }: FiltrosLotes): Observable<Lote[]> {
    let params = new HttpParams().set('fincaId', fincaId).set('estado', estado);
    if (q.trim()) params = params.set('q', q.trim());
    if (proposito) params = params.set('proposito', proposito);
    return this.http.get<Lote[]>('/api/lotes', { params });
  }

  crear(fincaId: string, datos: LoteGuardar): Observable<Lote> {
    return this.http.post<Lote>('/api/lotes', { ...datos, fincaId });
  }

  actualizar(id: string, datos: LoteGuardar): Observable<Lote> {
    return this.http.patch<Lote>(`/api/lotes/${id}`, datos);
  }

  cambiarEstado(id: string, estado: EstadoRegistro, motivoBaja?: string): Observable<Lote> {
    return this.http.patch<Lote>(`/api/lotes/${id}/estado`, { estado, motivoBaja });
  }
}
