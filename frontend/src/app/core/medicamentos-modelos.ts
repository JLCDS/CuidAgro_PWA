import { EstadoRegistro, FincaResumen, formatearFecha, hoyBogota } from './modelos';

export type TipoMedicamento = 'ANTIBIOTICO' | 'ANTIPARASITARIO' | 'VACUNA' | 'VITAMINA' | 'ANTIINFLAMATORIO' | 'HORMONAL' | 'OTRO';
export type UnidadMedicamento = 'ML' | 'G' | 'UNIDAD' | 'DOSIS';
export type ViaAdministracion = 'ORAL' | 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'INTRAVENOSA' | 'TOPICA' | 'EN_AGUA' | 'EN_ALIMENTO' | 'OTRA';

export const TIPOS_MEDICAMENTO: { valor: TipoMedicamento; etiqueta: string }[] = [
  { valor: 'ANTIBIOTICO', etiqueta: 'Antibiótico' },
  { valor: 'ANTIPARASITARIO', etiqueta: 'Antiparasitario' },
  { valor: 'VACUNA', etiqueta: 'Vacuna' },
  { valor: 'VITAMINA', etiqueta: 'Vitamina' },
  { valor: 'ANTIINFLAMATORIO', etiqueta: 'Antiinflamatorio' },
  { valor: 'HORMONAL', etiqueta: 'Hormonal' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const UNIDADES_MEDICAMENTO: { valor: UnidadMedicamento; etiqueta: string }[] = [
  { valor: 'ML', etiqueta: 'ml' },
  { valor: 'G', etiqueta: 'g' },
  { valor: 'UNIDAD', etiqueta: 'unidades' },
  { valor: 'DOSIS', etiqueta: 'dosis' },
];

export const VIAS_ADMINISTRACION: { valor: ViaAdministracion; etiqueta: string }[] = [
  { valor: 'ORAL', etiqueta: 'Oral' },
  { valor: 'INTRAMUSCULAR', etiqueta: 'Intramuscular' },
  { valor: 'SUBCUTANEA', etiqueta: 'Subcutánea' },
  { valor: 'INTRAVENOSA', etiqueta: 'Intravenosa' },
  { valor: 'TOPICA', etiqueta: 'Tópica' },
  { valor: 'EN_AGUA', etiqueta: 'En el agua' },
  { valor: 'EN_ALIMENTO', etiqueta: 'En el alimento' },
  { valor: 'OTRA', etiqueta: 'Otra' },
];

export interface Medicamento {
  id: string;
  fincaId: string;
  finca: FincaResumen;
  nombre: string;
  tipo: TipoMedicamento;
  unidad: UnidadMedicamento;
  stock: number;
  stockMinimo: number;
  fechaVencimiento: string | null;
  laboratorio: string | null;
  diasRetiroCarne: number | null;
  diasRetiroLeche: number | null;
  estado: EstadoRegistro;
  motivoBaja: string | null;
  observaciones: string | null;
  bajoStock: boolean;
  vencido: boolean;
  porVencer: boolean;
}

export interface EntradaMedicamento {
  id: string;
  medicamentoId: string;
  cantidad: number;
  fecha: string;
  fechaVencimiento: string | null;
  nota: string | null;
}

export interface MovimientoMedicamento {
  tipo: 'ENTRADA' | 'TRATAMIENTO';
  id: string;
  fecha: string;
  cantidad: number;
  detalle: string | null;
  registradoPor: FincaResumen;
}

export interface Tratamiento {
  id: string;
  fincaId: string;
  vacunoId: string | null;
  loteId: string | null;
  casoSaludId: string | null;
  medicamentoId: string;
  dosis: number;
  via: ViaAdministracion;
  fecha: string;
  diasRetiroCarne: number | null;
  diasRetiroLeche: number | null;
  finRetiroCarne: string | null;
  finRetiroLeche: string | null;
  enRetiro: boolean;
  observaciones: string | null;
  vacuno: FincaResumen | null;
  lote: FincaResumen | null;
  medicamento: { id: string; nombre: string; unidad: UnidadMedicamento; stock: number; bajoStock: boolean };
  casoSalud: { id: string; diagnostico: string } | null;
  finca: FincaResumen;
  registradoPor: FincaResumen;
}

/** Cantidad con hasta 2 decimales y su unidad (`12,5 ml`). */
export function formatearCantidad(cantidad: number, unidad: UnidadMedicamento): string {
  const texto = cantidad.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const sufijo = { ML: 'ml', G: 'g', UNIDAD: cantidad === 1 ? 'unidad' : 'unidades', DOSIS: cantidad === 1 ? 'dosis' : 'dosis' }[unidad];
  return `${texto} ${sufijo}`;
}

/** Texto del retiro vigente (`Carne hasta 12/12/2026 · Leche hasta 01/12/2026`) o null si no hay retiro. */
export function textoRetiro(t: Pick<Tratamiento, 'finRetiroCarne' | 'finRetiroLeche'>, hoy: string = hoyBogota()): string | null {
  const partes: string[] = [];
  if (t.finRetiroCarne && t.finRetiroCarne >= hoy) partes.push(`Carne hasta ${formatearFecha(t.finRetiroCarne)}`);
  if (t.finRetiroLeche && t.finRetiroLeche >= hoy) partes.push(`Leche hasta ${formatearFecha(t.finRetiroLeche)}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** Aviso tras registrar un tratamiento si el medicamento quedó escaso. */
export function avisoStock(t: Pick<Tratamiento, 'medicamento'>): string | null {
  const { nombre, stock, bajoStock, unidad } = t.medicamento;
  if (stock < 0) return `${nombre} quedó con stock negativo (${formatearCantidad(stock, unidad)}).`;
  if (bajoStock) return `${nombre} quedó con stock bajo (${formatearCantidad(stock, unidad)}).`;
  return null;
}
