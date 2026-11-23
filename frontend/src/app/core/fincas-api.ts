import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Finca } from './modelos';

export interface FincaGuardar {
  nombre: string;
  ubicacion: string;
  descripcion: string;
}

@Injectable({ providedIn: 'root' })
export class FincasApi {
  private readonly http = inject(HttpClient);

  listar(): Observable<Finca[]> {
    return this.http.get<Finca[]>('/api/fincas');
  }

  crear(datos: FincaGuardar): Observable<Finca> {
    return this.http.post<Finca>('/api/fincas', datos);
  }

  actualizar(id: string, datos: FincaGuardar): Observable<Finca> {
    return this.http.patch<Finca>(`/api/fincas/${id}`, datos);
  }
}
