import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ComentarioNovedad, EstadoNovedad, Novedad, PrioridadNovedad, TipoNovedad } from './salud-modelos';

export interface FiltrosNovedades {
  fincaId: string;
  vacunoId?: string;
  loteId?: string;
  tipo?: TipoNovedad | '';
  prioridad?: PrioridadNovedad | '';
  estado?: EstadoNovedad | '';
  desde?: string;
  hasta?: string;
}

export interface NovedadCrear {
  vacunoId?: string;
  loteId?: string;
  tipo: TipoNovedad;
  prioridad: PrioridadNovedad;
  descripcion: string;
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
}

export interface NovedadEditar {
  tipo: TipoNovedad;
  prioridad: PrioridadNovedad;
  descripcion: string;
  latitud?: number | null;
  longitud?: number | null;
  precisionMetros?: number | null;
}

@Injectable({ providedIn: 'root' })
export class NovedadesApi {
  private readonly http = inject(HttpClient);

  listar(f: FiltrosNovedades): Observable<Novedad[]> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(f)) if (valor) params = params.set(clave, valor);
    return this.http.get<Novedad[]>('/api/novedades', { params });
  }

  obtener(id: string): Observable<Novedad> {
    return this.http.get<Novedad>(`/api/novedades/${id}`);
  }

  /** Con foto va como multipart (campo `foto` y el resto como texto); sin foto, como JSON. */
  crear(datos: NovedadCrear, foto: File | null): Observable<Novedad> {
    if (!foto) return this.http.post<Novedad>('/api/novedades', datos);
    const cuerpo = new FormData();
    for (const [clave, valor] of Object.entries(datos)) if (valor !== undefined && valor !== null) cuerpo.append(clave, String(valor));
    cuerpo.append('foto', foto, foto.name);
    return this.http.post<Novedad>('/api/novedades', cuerpo);
  }

  actualizar(id: string, datos: NovedadEditar): Observable<Novedad> {
    return this.http.patch<Novedad>(`/api/novedades/${id}`, datos);
  }

  cambiarFoto(id: string, foto: File): Observable<Novedad> {
    const cuerpo = new FormData();
    cuerpo.append('foto', foto, foto.name);
    return this.http.put<Novedad>(`/api/novedades/${id}/foto`, cuerpo);
  }

  quitarFoto(id: string): Observable<Novedad> {
    return this.http.delete<Novedad>(`/api/novedades/${id}/foto`);
  }

  /** `<img src>` no envía el token Bearer: se pide como blob y se muestra con un object URL. */
  foto(id: string): Observable<Blob> {
    return this.http.get(`/api/novedades/${id}/foto`, { responseType: 'blob' });
  }

  cambiarEstado(id: string, estado: EstadoNovedad): Observable<Novedad> {
    return this.http.patch<Novedad>(`/api/novedades/${id}/estado`, { estado });
  }

  comentar(id: string, texto: string): Observable<ComentarioNovedad> {
    return this.http.post<ComentarioNovedad>(`/api/novedades/${id}/comentarios`, { texto });
  }
}
