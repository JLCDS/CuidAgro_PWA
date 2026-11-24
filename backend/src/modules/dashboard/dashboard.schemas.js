import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  fincaId: z.uuid({ error: 'Selecciona una finca válida' }),
});
