import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EstadoRegistro, FiltroEstado } from './modelos';
import {
  EntradaMedicamento,
  Medicamento,
  MovimientoMedicamento,
  TipoMedicamento,
  UnidadMedicamento,
} from './medicamentos-modelos';

export interface FiltrosMedicamentos {
  fincaId: string;
  estado: FiltroEstado;
  q: string;
  tipo: TipoMedicamento | '';
  alerta: boolean;
}

export interface MedicamentoGuardar {
  nombre: string;
  tipo: TipoMedicamento;
  unidad: UnidadMedicamento;
  stockMinimo: number;
  fechaVencimiento: string | null;
  laboratorio: string;
  diasRetiroCarne: number | null;
  diasRetiroLeche: number | null;
  observaciones: string;
}

export interface EntradaMedicamentoGuardar {
  cantidad: number;
  fecha: string;
  fechaVencimiento?: string;
  nota: string;
}

@Injectable({ providedIn: 'root' })
export class MedicamentosApi {
  private readonly http = inject(HttpClient);

  listar({ fincaId, estado, q, tipo, alerta }: FiltrosMedicamentos): Observable<Medicamento[]> {
    let params = new HttpParams().set('fincaId', fincaId).set('estado', estado);
    if (q.trim()) params = params.set('q', q.trim());
    if (tipo) params = params.set('tipo', tipo);
    if (alerta) params = params.set('alerta', 'true');
    return this.http.get<Medicamento[]>('/api/medicamentos', { params });
  }

  crear(fincaId: string, datos: MedicamentoGuardar & { stockInicial: number }): Observable<Medicamento> {
    return this.http.post<Medicamento>('/api/medicamentos', { ...datos, fincaId });
  }

  actualizar(id: string, datos: MedicamentoGuardar): Observable<Medicamento> {
    return this.http.patch<Medicamento>(`/api/medicamentos/${id}`, datos);
  }

  cambiarEstado(id: string, estado: EstadoRegistro, motivoBaja?: string): Observable<Medicamento> {
    return this.http.patch<Medicamento>(`/api/medicamentos/${id}/estado`, { estado, motivoBaja });
  }

  registrarEntrada(id: string, datos: EntradaMedicamentoGuardar): Observable<{ entrada: EntradaMedicamento; medicamento: Medicamento }> {
    return this.http.post<{ entrada: EntradaMedicamento; medicamento: Medicamento }>(`/api/medicamentos/${id}/entradas`, datos);
  }

  movimientos(id: string): Observable<MovimientoMedicamento[]> {
    return this.http.get<MovimientoMedicamento[]>(`/api/medicamentos/${id}/movimientos`);
  }
}
