import {
  CABECERA_CSV,
  diasDelRango,
  etiquetaPeriodo,
  etiquetaPeriodoCorta,
  FilaReporte,
  formatearPeso,
  generarCsv,
  kilosParaCsv,
  maximoAmable,
  nombreArchivoCsv,
  rangoDeAtajo,
  resumenSerie,
  saltoEtiquetas,
  validarRango,
} from './reportes-modelos';

describe('utilidades de reportes', () => {
  it('formatea en gramos bajo 1 kg y en kilos desde ahí', () => {
    expect(formatearPeso(0)).toBe('0 g');
    expect(formatearPeso(750)).toBe('750 g');
    expect(formatearPeso(999)).toBe('999 g');
    expect(formatearPeso(1000)).toBe('1 kg');
    expect(formatearPeso(1500)).toBe('1,5 kg');
    expect(formatearPeso(1234)).toBe('1,23 kg');
  });

  it('kilos para el CSV: coma decimal, sin miles y sin ceros sobrantes', () => {
    expect(kilosParaCsv(1500)).toBe('1,5');
    expect(kilosParaCsv(750)).toBe('0,75');
    expect(kilosParaCsv(1234567)).toBe('1234,567');
    expect(kilosParaCsv(2000)).toBe('2');
    expect(kilosParaCsv(0)).toBe('0');
  });

  describe('atajos de rango', () => {
    it('este mes', () => {
      expect(rangoDeAtajo('ESTE_MES', '2026-11-23')).toEqual({ desde: '2026-11-01', hasta: '2026-11-23' });
    });
    it('mes anterior, también cruzando el año y en febrero bisiesto', () => {
      expect(rangoDeAtajo('MES_ANTERIOR', '2026-11-23')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
      expect(rangoDeAtajo('MES_ANTERIOR', '2026-01-05')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
      expect(rangoDeAtajo('MES_ANTERIOR', '2028-03-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    });
    it('últimos 30 días incluye hoy', () => {
      const r = rangoDeAtajo('ULTIMOS_30', '2026-11-23');
      expect(r).toEqual({ desde: '2026-10-25', hasta: '2026-11-23' });
      expect(diasDelRango(r.desde, r.hasta)).toBe(30);
    });
    it('este año', () => {
      expect(rangoDeAtajo('ESTE_ANIO', '2026-11-23')).toEqual({ desde: '2026-01-01', hasta: '2026-11-23' });
    });
  });

  it('valida el rango como el backend', () => {
    expect(validarRango('2026-11-01', '2026-11-30')).toEqual({});
    expect(validarRango('', '2026-11-30').desde).toBeTruthy();
    expect(validarRango('2026-11-01', '').hasta).toBeTruthy();
    expect(validarRango('2026-12-01', '2026-11-30').hasta).toContain('anterior');
    expect(validarRango('2025-11-01', '2026-11-01')).toEqual({});
    expect(validarRango('2025-11-01', '2026-11-02').hasta).toContain('366');
  });

  it('etiquetas de periodo', () => {
    expect(etiquetaPeriodoCorta('2026-11-03')).toBe('03/11');
    expect(etiquetaPeriodoCorta('2026-11')).toBe('nov 2026');
    expect(etiquetaPeriodo('2026-11-03')).toBe('03/11/2026');
    expect(etiquetaPeriodo('2026-01')).toBe('ene 2026');
  });

  it('máximo amable para el eje', () => {
    expect(maximoAmable(0)).toBe(1);
    expect(maximoAmable(1)).toBe(1);
    expect(maximoAmable(130)).toBe(200);
    expect(maximoAmable(8600)).toBe(10000);
    expect(maximoAmable(4100)).toBe(5000);
    expect(maximoAmable(2000)).toBe(2000);
  });

  it('espacia las etiquetas según el ancho de la barra', () => {
    expect(saltoEtiquetas(60)).toBe(1);
    expect(saltoEtiquetas(26)).toBe(2);
    expect(saltoEtiquetas(10)).toBe(4);
    expect(saltoEtiquetas(40, 60)).toBe(2);
  });

  it('resume la serie para lectores de pantalla', () => {
    expect(resumenSerie([], 'Consumo')).toContain('sin datos');
    expect(resumenSerie([{ periodo: '2026-11-01', gramos: 0 }], 'Consumo')).toContain('sin consumo');
    const texto = resumenSerie(
      [
        { periodo: '2026-11-01', gramos: 1000 },
        { periodo: '2026-11-02', gramos: 3000 },
      ],
      'Consumo diario',
    );
    expect(texto).toContain('2 periodos');
    expect(texto).toContain('total 4 kg');
    expect(texto).toContain('02/11/2026 con 3 kg');
  });

  describe('CSV', () => {
    const fila = (extra: Partial<FilaReporte>): FilaReporte => ({
      periodo: '2026-11-10',
      sujeto: { tipo: 'VACUNO', id: 'a', nombre: 'Lucero' },
      alimento: null,
      gramos: 1500,
      registros: 2,
      ...extra,
    });

    it('empieza con BOM, usa ; y CRLF, y trae las columnas del contrato', () => {
      const csv = generarCsv([fila({})]);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const lineas = csv.slice(1).split('\r\n');
      expect(lineas[0]).toBe('Periodo;Tipo;Animal/Lote;Alimento;Gramos;Kg;Registros');
      expect(lineas[0].split(';')).toEqual(CABECERA_CSV);
      expect(lineas[1]).toBe('2026-11-10;Vacuno;Lucero;;1500;1,5;2');
    });

    it('incluye alimento, lotes y filas sin sujeto', () => {
      const csv = generarCsv([
        fila({ sujeto: { tipo: 'LOTE', id: 'l', nombre: 'Lote 1' }, alimento: { id: 'x', nombre: 'Concentrado' } }),
        fila({ sujeto: null }),
      ]).slice(1).split('\r\n');
      expect(csv[1]).toBe('2026-11-10;Lote;Lote 1;Concentrado;1500;1,5;2');
      expect(csv[2]).toBe('2026-11-10;Todos;Todos;;1500;1,5;2');
    });

    it('entrecomilla ; y comillas, y neutraliza fórmulas', () => {
      const csv = generarCsv([
        fila({ sujeto: { tipo: 'VACUNO', id: 'a', nombre: 'A;B "C"' } }),
        fila({ sujeto: { tipo: 'VACUNO', id: 'b', nombre: '=SUMA(A1)' } }),
      ]).slice(1).split('\r\n');
      expect(csv[1]).toBe('2026-11-10;Vacuno;"A;B ""C""";;1500;1,5;2');
      expect(csv[2]).toBe("2026-11-10;Vacuno;'=SUMA(A1);;1500;1,5;2");
    });

    it('sin filas solo trae la cabecera', () => {
      expect(generarCsv([])).toBe('﻿Periodo;Tipo;Animal/Lote;Alimento;Gramos;Kg;Registros\r\n');
    });
  });

  it('nombre del archivo CSV', () => {
    expect(nombreArchivoCsv('Finca El Ñandú', '2026-11-01', '2026-11-30')).toBe('consumo-finca-el-nandu-2026-11-01-2026-11-30.csv');
    expect(nombreArchivoCsv('¡¡', '2026-11-01', '2026-11-30')).toBe('consumo-finca-2026-11-01-2026-11-30.csv');
  });
});
