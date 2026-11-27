import { z } from 'zod';

export const NOMBRES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
export const MAX_METRICAS_POR_ENVIO = 10;
export const MAX_BYTES_CUERPO = '4kb';

/** Umbrales de Google: hasta `buena` es BUENA, hasta `mejorable` MEJORABLE y más allá MALA (ms; CLS sin unidad). */
export const UMBRALES = {
  LCP: { buena: 2500, mejorable: 4000 },
  INP: { buena: 200, mejorable: 500 },
  CLS: { buena: 0.1, mejorable: 0.25 },
  FCP: { buena: 1800, mejorable: 3000 },
  TTFB: { buena: 800, mejorable: 1800 },
};

export function calificar(nombre, valor) {
  const u = UMBRALES[nombre];
  if (valor <= u.buena) return 'BUENA';
  if (valor <= u.mejorable) return 'MEJORABLE';
  return 'MALA';
}

const metricaSchema = z
  .strictObject({
    nombre: z.enum(NOMBRES, { error: 'Métrica no válida' }),
    valor: z.number({ error: 'El valor debe ser un número' }).finite().min(0, 'El valor no puede ser negativo'),
    ruta: z
      .string({ error: 'La ruta es obligatoria' })
      .max(80, 'La ruta es demasiado larga')
      .regex(/^\/[a-z0-9/-]*$/, 'La ruta no es válida'),
    dispositivo: z.enum(['MOVIL', 'ESCRITORIO'], { error: 'Dispositivo no válido' }),
    conexion: z.string().max(10, 'La conexión es demasiado larga').nullish(),
    version: z.string().max(20, 'La versión es demasiado larga').nullish(),
  })
  .refine((m) => m.valor <= (m.nombre === 'CLS' ? 100 : 600000), { path: ['valor'], message: 'El valor está fuera de rango' });

export const metricasEnvioSchema = z.strictObject({
  metricas: z.array(metricaSchema).min(1, 'Envía al menos una métrica').max(MAX_METRICAS_POR_ENVIO, 'Máximo 10 métricas por envío'),
});

export const resumenQuerySchema = z.object({
  dias: z.enum(['7', '30', '90'], { error: 'El periodo debe ser 7, 30 o 90 días' }).default('7').transform(Number),
  dispositivo: z.enum(['MOVIL', 'ESCRITORIO'], { error: 'Dispositivo no válido' }).optional(),
});
