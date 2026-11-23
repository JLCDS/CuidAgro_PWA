import { dimensionesReducidas } from './imagen';
import { diaBogota, enlaceMapa, erroresPorCampo, puedeEditarNovedad } from './salud-modelos';
import { ordenarHistorial } from '../paginas/historial-dialogo';
import { CasoSalud, Novedad } from './salud-modelos';

describe('utilidades de salud y novedades', () => {
  const novedad = { estado: 'ABIERTA' as const, createdAt: '2026-11-23T15:00:00.000Z', registradoPor: { id: 'u1', nombre: 'Ana' } };

  it('el ayudante edita solo su novedad abierta y creada hoy en Bogotá', () => {
    expect(puedeEditarNovedad(novedad, 'u1', false, '2026-11-23')).toBe(true);
    expect(puedeEditarNovedad(novedad, 'u2', false, '2026-11-23')).toBe(false);
    expect(puedeEditarNovedad({ ...novedad, estado: 'EN_SEGUIMIENTO' }, 'u1', false, '2026-11-23')).toBe(false);
    expect(puedeEditarNovedad(novedad, 'u1', false, '2026-11-24')).toBe(false);
    expect(puedeEditarNovedad({ ...novedad, estado: 'CERRADA' }, 'u2', true, '2026-11-24')).toBe(true);
  });

  it('usa el día de Bogotá y no el UTC', () => {
    expect(diaBogota('2026-11-24T02:00:00.000Z')).toBe('2026-11-23');
  });

  it('reduce la imagen sin agrandarla', () => {
    expect(dimensionesReducidas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(dimensionesReducidas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
    expect(dimensionesReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('arma el enlace de OpenStreetMap', () => {
    expect(enlaceMapa(4.5, -74.1)).toBe('https://www.openstreetmap.org/?mlat=4.5&mlon=-74.1#map=17/4.5/-74.1');
  });

  it('agrupa los errores de validación por campo', () => {
    const error = { error: { error: { detalles: [{ campo: 'descripcion', mensaje: 'Muy corta' }, { campo: 'foto', mensaje: 'No es imagen' }] } } };
    expect(erroresPorCampo(error)).toEqual({ descripcion: 'Muy corta', foto: 'No es imagen' });
    expect(erroresPorCampo(null)).toEqual({});
  });

  it('ordena el historial de lo más reciente a lo más antiguo', () => {
    const caso = { id: 'c1', fechaInicio: '2026-11-20' } as CasoSalud;
    const n1 = { id: 'n1', fechaHora: '2026-11-22T10:00:00.000Z' } as Novedad;
    const n2 = { id: 'n2', fechaHora: '2026-11-10T10:00:00.000Z' } as Novedad;
    const ids = ordenarHistorial([caso], [n2, n1]).map((e) => (e.clase === 'caso' ? e.caso.id : e.novedad.id));
    expect(ids).toEqual(['n1', 'c1', 'n2']);
  });
});
