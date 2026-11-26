import {
  diasEnFinca,
  gramosAveDia,
  gramosPorComida,
  racionDeLote,
  RACIONES_DEFECTO,
  semanaDeVida,
  tablaDefecto,
} from './raciones';

describe('raciones', () => {
  it('trae la tabla por defecto del contrato', () => {
    expect(RACIONES_DEFECTO.ALIMENTACION).toEqual([25, 50, 85, 120, 150, 170, 185, 195]);
    expect(RACIONES_DEFECTO.PRODUCCION).toHaveLength(19);
    expect(RACIONES_DEFECTO.PRODUCCION[18]).toBe(110);
    expect(tablaDefecto('ALIMENTACION')[0]).toEqual({ semana: 1, gramosAveDia: 25 });
  });

  it('calcula la semana de vida: pollitos de un día con 23 días en la finca están en la semana 4', () => {
    expect(diasEnFinca('2026-11-03', undefined, '2026-11-26')).toBe(23);
    expect(semanaDeVida(0, '2026-11-03', undefined, '2026-11-26')).toBe(4);
  });

  it('suma la edad al ingreso y nunca da días negativos', () => {
    expect(semanaDeVida(2, '2026-11-12', undefined, '2026-11-26')).toBe(5);
    expect(diasEnFinca('2026-12-01', undefined, '2026-11-26')).toBe(0);
    expect(semanaDeVida(0, '2026-12-01', undefined, '2026-11-26')).toBe(1);
  });

  it('sin fecha de ingreso usa la fecha de creación en Bogotá', () => {
    // 2026-11-04 02:00 UTC es el 3 de noviembre a las 21:00 en Bogotá.
    expect(diasEnFinca(null, '2026-11-04T02:00:00.000Z', '2026-11-26')).toBe(23);
  });

  it('busca los g por ave y usa la última fila pasada la última semana', () => {
    const tabla = tablaDefecto('ALIMENTACION');
    expect(gramosAveDia(tabla, 1)).toBe(25);
    expect(gramosAveDia(tabla, 4)).toBe(120);
    expect(gramosAveDia(tabla, 8)).toBe(195);
    expect(gramosAveDia(tabla, 9)).toBe(195);
    expect(gramosAveDia(tabla, 60)).toBe(195);
    expect(gramosAveDia(tablaDefecto('PRODUCCION'), 40)).toBe(110);
    expect(gramosAveDia([], 3)).toBe(0);
  });

  it('redondea por comida a 50 g', () => {
    expect(gramosPorComida(9000)).toBe(4500);
    expect(gramosPorComida(9100)).toBe(4550);
    expect(gramosPorComida(9050)).toBe(4550);
    expect(gramosPorComida(9150)).toBe(4600);
    expect(gramosPorComida(40)).toBe(0);
  });

  it('calcula la ración del lote del contrato: semana 4, 120 g por ave, 75 aves', () => {
    const lote = { cantidad: 75, edadMinSemanas: 0, fechaIngreso: '2026-11-03' };
    expect(racionDeLote(lote, tablaDefecto('ALIMENTACION'), '2026-11-26')).toEqual({
      semanaVida: 4,
      gramosAveDia: 120,
      gramosDia: 9000,
      gramosPorComida: 4500,
    });
  });
});
