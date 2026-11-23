import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EstadoUsuario, Pagina, Rol, UsuarioDetalle } from './modelos';

export interface FiltrosUsuarios {
  q: string;
  rol: Rol | '';
  estado: EstadoUsuario | '';
  page: number;
}

export interface UsuarioGuardar {
  nombre: string;
  correo: string;
  rol: Rol;
  fincaIds: string[];
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class UsuariosApi {
  private readonly http = inject(HttpClient);

  listar({ q, rol, estado, page }: FiltrosUsuarios): Observable<Pagina<UsuarioDetalle>> {
    let params = new HttpParams().set('page', page);
    if (q.trim()) params = params.set('q', q.trim());
    if (rol) params = params.set('rol', rol);
    if (estado) params = params.set('estado', estado);
    return this.http.get<Pagina<UsuarioDetalle>>('/api/usuarios', { params });
  }

  crear(datos: UsuarioGuardar): Observable<UsuarioDetalle> {
    return this.http.post<UsuarioDetalle>('/api/usuarios', datos);
  }

  actualizar(id: string, datos: UsuarioGuardar): Observable<UsuarioDetalle> {
    return this.http.patch<UsuarioDetalle>(`/api/usuarios/${id}`, datos);
  }

  cambiarEstado(id: string, estado: EstadoUsuario): Observable<UsuarioDetalle> {
    return this.http.patch<UsuarioDetalle>(`/api/usuarios/${id}/estado`, { estado });
  }
}
