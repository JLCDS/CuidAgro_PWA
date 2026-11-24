import { idEntrada, ordenarHistorial } from '../paginas/historial-dialogo';
import { avisoStock, formatearCantidad, textoRetiro, Tratamiento } from './medicamentos-modelos';
import { CasoSalud, Novedad } from './salud-modelos';

describe('utilidades de medicamentos y tratamientos', () => {
  it('formatea cantidades con unidad y hasta 2 decimales', () => {
    expect(formatearCantidad(12.5, 'ML')).toBe('12,5 ml');
    expect(formatearCantidad(1000, 'G')).toContain('g');
    expect(formatearCantidad(1, 'UNIDAD')).toBe('1 unidad');
    expect(formatearCantidad(3, 'UNIDAD')).toBe('3 unidades');
    expect(formatearCantidad(2, 'DOSIS')).toBe('2 dosis');
  });

  it('describe solo el retiro vigente', () => {
    const t = { finRetiroCarne: '2026-12-10', finRetiroLeche: '2026-11-20' };
    expect(textoRetiro(t, '2026-11-23')).toBe('Carne hasta 10/12/2026');
    expect(textoRetiro(t, '2026-11-20')).toBe('Carne hasta 10/12/2026 · Leche hasta 20/11/2026');
    expect(textoRetiro(t, '2026-12-11')).toBeNull();
    expect(textoRetiro({ finRetiroCarne: null, finRetiroLeche: null }, '2026-11-23')).toBeNull();
  });

  it('avisa cuando el medicamento queda con stock bajo o negativo', () => {
    const t = (stock: number, bajoStock: boolean) =>
      ({ medicamento: { id: 'm', nombre: 'Penicilina', unidad: 'ML', stock, bajoStock } }) as Pick<Tratamiento, 'medicamento'>;
    expect(avisoStock(t(50, false))).toBeNull();
    expect(avisoStock(t(5, true))).toContain('stock bajo');
    expect(avisoStock(t(-3, true))).toContain('stock negativo');
  });

  it('incluye los tratamientos en el historial, ordenados por fecha', () => {
    const caso = { id: 'c1', fechaInicio: '2026-11-20' } as CasoSalud;
    const novedad = { id: 'n1', fechaHora: '2026-11-18T10:00:00.000Z' } as Novedad;
    const trat = { id: 't1', fecha: '2026-11-22' } as Tratamiento;
    const viejo = { id: 't2', fecha: '2026-11-01' } as Tratamiento;
    const ids = ordenarHistorial([caso], [novedad], [viejo, trat]).map(idEntrada);
    expect(ids).toEqual(['t1', 'c1', 'n1', 't2']);
  });
});
