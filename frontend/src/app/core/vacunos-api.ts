import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EstadoRegistro, FiltroEstado, PropositoVacuno, Sexo, Vacuno } from './modelos';

export interface FiltrosVacunos {
  fincaId: string;
  estado: FiltroEstado;
  q: string;
  proposito: PropositoVacuno | '';
}

export interface VacunoGuardar {
  nombre: string;
  sexo: Sexo;
  raza: string;
  edadMeses: number;
  peso: number;
  fechaLlegada: string;
  proposito: PropositoVacuno;
  observaciones: string;
}

@Injectable({ providedIn: 'root' })
export class VacunosApi {
  private readonly http = inject(HttpClient);

  listar({ fincaId, estado, q, proposito }: FiltrosVacunos): Observable<Vacuno[]> {
    let params = new HttpParams().set('fincaId', fincaId).set('estado', estado);
    if (q.trim()) params = params.set('q', q.trim());
    if (proposito) params = params.set('proposito', proposito);
    return this.http.get<Vacuno[]>('/api/vacunos', { params });
  }

  crear(fincaId: string, datos: VacunoGuardar): Observable<Vacuno> {
    return this.http.post<Vacuno>('/api/vacunos', { ...datos, fincaId });
  }

  actualizar(id: string, datos: VacunoGuardar): Observable<Vacuno> {
    return this.http.patch<Vacuno>(`/api/vacunos/${id}`, datos);
  }

  cambiarEstado(id: string, estado: EstadoRegistro, motivoBaja?: string): Observable<Vacuno> {
    return this.http.patch<Vacuno>(`/api/vacunos/${id}/estado`, { estado, motivoBaja });
  }
}
