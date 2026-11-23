import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Consumo, Jornada, TipoConsumo } from './modelos';

export interface FiltrosConsumos {
  fincaId: string;
  /** Id del vacuno o del lote. */
  animalId: string;
  jornada: Jornada | '';
  desde: string;
  hasta: string;
}

export interface ConsumoGuardar {
  alimentoId: string;
  cantidadGramos: number;
  jornada: Jornada;
  fecha: string;
  observaciones: string;
}

@Injectable({ providedIn: 'root' })
export class ConsumosApi {
  private readonly http = inject(HttpClient);

  listar(tipo: TipoConsumo, f: FiltrosConsumos): Observable<Consumo[]> {
    let params = new HttpParams().set('fincaId', f.fincaId);
    if (f.animalId) params = params.set(tipo === 'vacunos' ? 'vacunoId' : 'loteId', f.animalId);
    if (f.jornada) params = params.set('jornada', f.jornada);
    if (f.desde) params = params.set('desde', f.desde);
    if (f.hasta) params = params.set('hasta', f.hasta);
    return this.http.get<Consumo[]>(`/api/consumos/${tipo}`, { params });
  }

  crear(tipo: TipoConsumo, animalId: string, datos: ConsumoGuardar): Observable<Consumo> {
    const campo = tipo === 'vacunos' ? 'vacunoId' : 'loteId';
    return this.http.post<Consumo>(`/api/consumos/${tipo}`, { ...datos, [campo]: animalId });
  }

  actualizar(tipo: TipoConsumo, id: string, datos: ConsumoGuardar): Observable<Consumo> {
    return this.http.patch<Consumo>(`/api/consumos/${tipo}/${id}`, datos);
  }

  eliminar(tipo: TipoConsumo, id: string): Observable<void> {
    return this.http.delete<void>(`/api/consumos/${tipo}/${id}`);
  }
}
