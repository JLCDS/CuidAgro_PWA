import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Alimento, EntradaAlimento, EstadoRegistro, FiltroEstado, Movimiento, TipoAlimento } from './modelos';

export interface FiltrosAlimentos {
  fincaId: string;
  estado: FiltroEstado;
  q: string;
  tipo: TipoAlimento | '';
  bajoStock: boolean;
}

export interface AlimentoGuardar {
  nombre: string;
  tipo: TipoAlimento;
  stockMinimoGramos: number;
  observaciones: string;
}

export interface EntradaGuardar {
  cantidadGramos: number;
  fecha: string;
  nota: string;
}

@Injectable({ providedIn: 'root' })
export class AlimentosApi {
  private readonly http = inject(HttpClient);

  listar({ fincaId, estado, q, tipo, bajoStock }: FiltrosAlimentos): Observable<Alimento[]> {
    let params = new HttpParams().set('fincaId', fincaId).set('estado', estado);
    if (q.trim()) params = params.set('q', q.trim());
    if (tipo) params = params.set('tipo', tipo);
    if (bajoStock) params = params.set('bajoStock', 'true');
    return this.http.get<Alimento[]>('/api/alimentos', { params });
  }

  crear(fincaId: string, datos: AlimentoGuardar & { stockInicialGramos: number }): Observable<Alimento> {
    return this.http.post<Alimento>('/api/alimentos', { ...datos, fincaId });
  }

  actualizar(id: string, datos: AlimentoGuardar): Observable<Alimento> {
    return this.http.patch<Alimento>(`/api/alimentos/${id}`, datos);
  }

  cambiarEstado(id: string, estado: EstadoRegistro, motivoBaja?: string): Observable<Alimento> {
    return this.http.patch<Alimento>(`/api/alimentos/${id}/estado`, { estado, motivoBaja });
  }

  registrarEntrada(id: string, datos: EntradaGuardar): Observable<{ entrada: EntradaAlimento; alimento: Alimento }> {
    return this.http.post<{ entrada: EntradaAlimento; alimento: Alimento }>(`/api/alimentos/${id}/entradas`, datos);
  }

  movimientos(id: string): Observable<Movimiento[]> {
    return this.http.get<Movimiento[]>(`/api/alimentos/${id}/movimientos`);
  }
}
