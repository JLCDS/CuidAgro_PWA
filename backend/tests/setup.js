import { beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { sembrarRoles } from '../src/lib/roles.js';

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE usuarios, fincas, roles, refresh_tokens, usuarios_fincas, vacunos, lotes_oviparos, alimentos, entradas_alimento, consumos_vacunos, consumos_lotes, novedades, comentarios_novedad, casos_salud, medicamentos, entradas_medicamento, tratamientos, suscripciones_push, avisos_enviados, fotos CASCADE');
  await sembrarRoles();
});
